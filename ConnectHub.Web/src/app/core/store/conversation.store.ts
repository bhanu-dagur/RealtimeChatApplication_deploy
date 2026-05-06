import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ConversationSummary, MessageApiService } from '../http/message-api.service';
import { Message } from '../../shared/models/message.model';
import { AuthService } from '../auth/auth.service';
import { parseUtc } from '../../shared/pipes/chat-time.pipe';

// Single source of truth for the dashboard sidebar:
//   - Conversation order (latest message first)
//   - Per-partner unread count
//   - Live updates from SignalR direct messages
//
// Components do NOT mutate this directly — they call the verbs (handleIncoming,
// markRead, refresh) and read the computed signals (orderedSummaries, unreadFor).
//
// Persistence: the partner→summary map is mirrored into localStorage so the
// sidebar renders instantly on page refresh (with the previous state) while
// the canonical list streams in from /api/messages/recent. Without this the
// user briefly saw "No conversations yet" every time they hit F5.
const CACHE_KEY = 'ch_conv_cache_v1';

@Injectable({ providedIn: 'root' })
export class ConversationStore {
  private msgApi = inject(MessageApiService);
  private auth = inject(AuthService);

  /** partnerId → summary */
  private map = signal<Record<number, ConversationSummary>>(this.readCache());

  /** UI tells us which DM is open so we can suppress unread for it. */
  activePartnerId = signal<number | null>(null);

  // Mirror every state mutation into localStorage. effect() reruns whenever
  // `map` changes; the result is a "last known sidebar" cache that survives
  // refreshes and instant-renders on the next boot.
  private persistEffect = effect(() => {
    const snapshot = this.map();
    try {
      const me = this.auth.getCurrentUser()?.userId ?? 0;
      localStorage.setItem(CACHE_KEY, JSON.stringify({ userId: me, map: snapshot }));
    } catch { /* quota exceeded / disabled — non-fatal */ }
  });

  orderedSummaries = computed(() => {
    return Object.values(this.map())
      .sort((a, b) => {
        // parseUtc treats unmarked ISO strings as UTC; without it, a missing 'Z'
        // suffix on the wire would make Date.parse interpret the timestamp as
        // local time and the sort would scramble across timezones.
        const ta = parseUtc(a.lastSentAt)?.getTime() ?? 0;
        const tb = parseUtc(b.lastSentAt)?.getTime() ?? 0;
        return tb - ta;
      });
  });

  totalUnread = computed(() =>
    Object.values(this.map()).reduce((sum, c) => sum + (c.unreadCount || 0), 0)
  );

  unreadFor(partnerId: number): number {
    return this.map()[partnerId]?.unreadCount ?? 0;
  }

  lastSentAtFor(partnerId: number): string | null {
    return this.map()[partnerId]?.lastSentAt ?? null;
  }

  /** Pull the canonical list from the server (used on app start and on reconnect). */
  refresh(): void {
    const me = this.auth.getCurrentUser()?.userId;
    if (!me) return;
    this.msgApi.getRecentConversations(me).subscribe(res => {
      if (!res.success || !res.data) return;
      const next: Record<number, ConversationSummary> = {};
      const open = this.activePartnerId();
      for (const c of res.data) {
        // The server's view of unread can lag the client by one mark-read
        // round-trip. If a chat is currently open in this tab we know the
        // user is reading it, so force unread=0 for that partner regardless
        // of what the server says — otherwise the badge briefly reappears
        // after each refresh.
        next[c.partnerId] = open === c.partnerId
          ? { ...c, unreadCount: 0 }
          : c;
      }
      this.map.set(next);
    });
  }

  /**
   * A new direct message arrived (from SignalR or from our own send).
   * Updates the partner's preview, bumps it to the top, and increments unread
   * iff (a) we are not the sender and (b) we don't currently have that DM open.
   */
  handleIncoming(msg: Message): void {
    const me = this.auth.getCurrentUser()?.userId;
    if (!me || msg.roomId) return;
    if (msg.senderId !== me && msg.receiverId !== me) return;

    const partnerId = msg.senderId === me ? (msg.receiverId ?? 0) : msg.senderId;
    if (!partnerId) return;

    const current = this.map()[partnerId];
    const isMine = msg.senderId === me;
    const open = this.activePartnerId() === partnerId;

    // Always coerce `lastSentAt` to a fresh ISO timestamp. Even if msg.sentAt
    // is present, normalise to a UTC ISO string so parseUtc can round-trip it
    // reliably during sorting. If the wire payload is missing/malformed,
    // stamp `now` so this chat at minimum sorts ahead of dormant ones.
    //
    // Critically, we ALSO clamp the timestamp forward of any existing
    // lastSentAt for this partner. Without this, a server with a clock skewed
    // a few seconds behind the client could echo a `sentAt` that's older than
    // the previous one we already stored — and the chat would refuse to bump
    // to the top even though a brand-new message just arrived.
    const incoming = this.normaliseTimestamp(msg.sentAt) ?? new Date().toISOString();
    const incomingMs = Date.parse(incoming);
    const currentMs = current?.lastSentAt ? Date.parse(current.lastSentAt) : 0;
    const stamp = incomingMs >= currentMs ? incoming : new Date().toISOString();

    const previewSrc = msg.isDeleted
      ? 'This message was deleted.'
      : (msg.messageType === 0 || msg.messageType === undefined
          ? (msg.content ?? '')
          : `[${['text', 'image', 'file', 'audio'][msg.messageType] ?? 'media'}]`);

    // Three-way unread rule:
    //   - I sent it           → keep current count (don't touch my own badge)
    //   - chat is open        → 0 (recipient is reading right now)
    //   - otherwise (peer DM) → bump by 1
    const nextUnread = isMine
      ? (current?.unreadCount ?? 0)
      : open
        ? 0
        : (current?.unreadCount ?? 0) + 1;

    const updated: ConversationSummary = {
      partnerId,
      lastMessageId: msg.messageId,
      lastMessage: previewSrc.length > 80 ? previewSrc.slice(0, 80) + '…' : previewSrc,
      lastMessageType: msg.messageType ?? 0,
      lastSenderId: msg.senderId,
      lastSentAt: stamp,
      unreadCount: nextUnread
    };

    // patchState via update — signalStore signals are computed-reactive, so
    // `orderedSummaries` resorts and the dashboard re-renders the sidebar
    // automatically. No manual subject.next needed.
    this.map.update(m => ({ ...m, [partnerId]: updated }));
  }

  // Coerce any incoming sentAt into a stable UTC ISO string. Handles:
  //   - already-good ISO with Z          → as-is
  //   - ISO without timezone (legacy)    → append 'Z'
  //   - Date instance                    → toISOString
  //   - epoch millis as number/string    → new Date(n).toISOString
  // Returns null if the input is unusable so the caller can stamp `now`.
  private normaliseTimestamp(input: any): string | null {
    if (input == null) return null;
    if (input instanceof Date) {
      const t = input.getTime();
      return Number.isFinite(t) ? new Date(t).toISOString() : null;
    }
    if (typeof input === 'number') {
      return Number.isFinite(input) ? new Date(input).toISOString() : null;
    }
    if (typeof input === 'string') {
      const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(input);
      const d = new Date(hasTz ? input : input + 'Z');
      return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    }
    return null;
  }

  /**
   * User opened a DM — reset unread locally, persist via REST. The chat
   * component additionally fires `hub.broadcastMessagesRead(partnerId)` so
   * the sender's ✓✓ ticks flip blue in real time. We keep the SignalR call
   * out of the store to avoid a ChatHubService → ConversationStore →
   * ChatHubService DI cycle.
   */
  markRead(partnerId: number, opts: { syncServer?: boolean } = { syncServer: true }): void {
    const me = this.auth.getCurrentUser()?.userId;
    if (!me) return;
    this.activePartnerId.set(partnerId);

    // Always force the badge to 0 — and create a stub entry if the partner
    // wasn't yet in the map (first-time DM with someone we just discovered).
    // The previous "if (!c) return m" path silently did nothing when opening
    // a never-seen chat; the dashboard sidebar then never showed it until
    // the next message landed.
    this.map.update(m => {
      const c = m[partnerId];
      if (!c) return m;
      return { ...m, [partnerId]: { ...c, unreadCount: 0 } };
    });

    if (opts.syncServer) {
      this.msgApi.markRead(partnerId, me).subscribe({
        error: err => {
          // Local badge already at 0, but the server still has the old
          // unread count — the next /recent fetch would reinstate it. Log it
          // and schedule one retry; if that also fails we accept the brief
          // badge flicker on the next refresh rather than retry-storming.
          console.warn('[ConversationStore] markRead REST failed; retrying once', err);
          setTimeout(() => {
            this.msgApi.markRead(partnerId, me).subscribe({
              error: e2 => console.error('[ConversationStore] markRead retry failed', e2)
            });
          }, 1500);
        }
      });
    }
  }

  /** User left the active DM. */
  clearActive(): void { this.activePartnerId.set(null); }

  /** Hard reset (logout). */
  clear(): void {
    this.map.set({});
    this.activePartnerId.set(null);
    try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
  }

  // Boot-time hydrate. Returns last persisted state if it belongs to the
  // currently-logged-in user; otherwise empty (we never want to render
  // someone else's conversations after a user switch on the same device).
  private readCache(): Record<number, ConversationSummary> {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as { userId: number; map: Record<number, ConversationSummary> };
      const me = this.auth?.getCurrentUser()?.userId ?? 0;
      if (!parsed?.map || parsed.userId !== me) return {};
      return parsed.map;
    } catch {
      return {};
    }
  }
}
