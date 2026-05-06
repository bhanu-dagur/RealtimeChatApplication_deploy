import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Message } from '../../shared/models/message.model';
import { AuthService } from '../auth/auth.service';
import { MessageApiService } from '../http/message-api.service';
import { parseUtc } from '../../shared/pipes/chat-time.pipe';

// Per-room sidebar state: last message preview, last activity timestamp,
// and a client-side unread counter. Unread for groups is purely local —
// the message API doesn't track per-user/per-room read state — so the
// counter persists in localStorage and is reconciled by SignalR.
//
// Mirrors ConversationStore (which handles direct chats) so the dashboard
// can render groups with WhatsApp-style ordering: most-recently-active
// rooms float to the top, rooms with unread messages show a green badge.

export interface RoomSummary {
  roomId: number;
  lastMessageId?: number;
  lastMessage?: string;       // ≤80-char preview
  lastMessageType: number;
  lastSenderId?: number;
  lastSenderName?: string;
  lastSentAt?: string;        // UTC ISO
  unreadCount: number;
}

const CACHE_KEY = 'ch_room_conv_cache_v1';

@Injectable({ providedIn: 'root' })
export class RoomConversationStore {
  private auth = inject(AuthService);
  private msgApi = inject(MessageApiService);

  /** roomId → summary */
  private map = signal<Record<number, RoomSummary>>(this.readCache());

  /** UI tells us which room is open so we can suppress unread for it. */
  activeRoomId = signal<number | null>(null);

  // Mirror every state mutation into localStorage so the sidebar renders the
  // last-known order + unread state instantly on page refresh.
  private persistEffect = effect(() => {
    const snapshot = this.map();
    try {
      const me = this.auth.getCurrentUser()?.userId ?? 0;
      localStorage.setItem(CACHE_KEY, JSON.stringify({ userId: me, map: snapshot }));
    } catch { /* quota exceeded / disabled — non-fatal */ }
  });

  /** Sorted by lastSentAt DESC. Rooms with no messages sink to the bottom. */
  orderedSummaries = computed(() => {
    return Object.values(this.map())
      .sort((a, b) => {
        const ta = parseUtc(a.lastSentAt)?.getTime() ?? 0;
        const tb = parseUtc(b.lastSentAt)?.getTime() ?? 0;
        return tb - ta;
      });
  });

  totalUnread = computed(() =>
    Object.values(this.map()).reduce((sum, c) => sum + (c.unreadCount || 0), 0)
  );

  unreadFor(roomId: number): number {
    return this.map()[roomId]?.unreadCount ?? 0;
  }

  summaryFor(roomId: number): RoomSummary | undefined {
    return this.map()[roomId];
  }

  /**
   * Seed an entry for a room if we don't have one yet (e.g. when the rooms
   * list loads). Doesn't overwrite existing summary state — only fills in
   * the row so it shows up in the sidebar before the first message.
   */
  ensureRoom(roomId: number): void {
    if (this.map()[roomId]) return;
    this.map.update(m => ({
      ...m,
      [roomId]: { roomId, lastMessageType: 0, unreadCount: 0 }
    }));
  }

  /**
   * One-shot fetch of the most recent message in a room — used on dashboard
   * load to populate the lastMessage preview before any live SignalR events
   * arrive. Existing unreadCount is preserved (we never reset to 0 here;
   * that's markRead's job).
   */
  hydrateLastMessage(roomId: number): void {
    this.msgApi.getRoomMessages(roomId, 1, 1).subscribe({
      next: res => {
        if (!res.success || !res.data) return;
        const items = res.data.items ?? [];
        if (!items.length) return;
        const msg = items[items.length - 1];

        this.map.update(m => {
          const current = m[roomId];
          // If a live SignalR event already updated this room since we kicked
          // off the fetch, the in-memory state is fresher than what we just
          // pulled from page 1 — leave it alone.
          if (current?.lastSentAt && msg.sentAt && Date.parse(current.lastSentAt) >= Date.parse(msg.sentAt)) {
            return m;
          }
          return {
            ...m,
            [roomId]: {
              roomId,
              lastMessageId: msg.messageId,
              lastMessage: this.preview(msg),
              lastMessageType: msg.messageType ?? 0,
              lastSenderId: msg.senderId,
              lastSenderName: msg.senderName,
              lastSentAt: this.normaliseTimestamp(msg.sentAt) ?? new Date().toISOString(),
              unreadCount: current?.unreadCount ?? 0
            }
          };
        });
      },
      error: () => { /* non-fatal — sidebar simply lacks a preview until next live event */ }
    });
  }

  /**
   * A new room message arrived (from SignalR or our own send).
   *   - I sent it             → keep current unread (don't badge my own message)
   *   - room is open here     → unread = 0 (I'm reading it)
   *   - someone else, closed  → unread bumps by 1
   */
  handleIncoming(msg: Message): void {
    const me = this.auth.getCurrentUser()?.userId;
    if (!me || !msg.roomId) return;

    const roomId = msg.roomId;
    const current = this.map()[roomId];
    const isMine = msg.senderId === me;
    const open = this.activeRoomId() === roomId;

    // Clamp timestamp forward — defends against server clock skew echoing
    // an older sentAt and refusing to bump the room to the top.
    const incoming = this.normaliseTimestamp(msg.sentAt) ?? new Date().toISOString();
    const incomingMs = Date.parse(incoming);
    const currentMs = current?.lastSentAt ? Date.parse(current.lastSentAt) : 0;
    const stamp = incomingMs >= currentMs ? incoming : new Date().toISOString();

    const nextUnread = isMine
      ? (current?.unreadCount ?? 0)
      : open
        ? 0
        : (current?.unreadCount ?? 0) + 1;

    const updated: RoomSummary = {
      roomId,
      lastMessageId: msg.messageId,
      lastMessage: this.preview(msg),
      lastMessageType: msg.messageType ?? 0,
      lastSenderId: msg.senderId,
      lastSenderName: msg.senderName,
      lastSentAt: stamp,
      unreadCount: nextUnread
    };

    this.map.update(m => ({ ...m, [roomId]: updated }));
  }

  /** User opened a room — reset unread locally. */
  markRead(roomId: number): void {
    this.activeRoomId.set(roomId);
    this.map.update(m => {
      const c = m[roomId];
      if (!c) return { ...m, [roomId]: { roomId, lastMessageType: 0, unreadCount: 0 } };
      return { ...m, [roomId]: { ...c, unreadCount: 0 } };
    });
  }

  /** User left the active room. */
  clearActive(): void { this.activeRoomId.set(null); }

  /** Drop a room entirely (left/kicked). */
  removeRoom(roomId: number): void {
    this.map.update(m => {
      if (!(roomId in m)) return m;
      const next = { ...m };
      delete next[roomId];
      return next;
    });
  }

  /** Hard reset (logout). */
  clear(): void {
    this.map.set({});
    this.activeRoomId.set(null);
    try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
  }

  // ── Helpers ───────────────────────────────────────────────────────

  // Same preview rules as ConversationStore — text gets shown verbatim
  // (truncated to 80), media types render as a [type] tag.
  private preview(msg: Message): string {
    if (msg.isDeleted) return 'This message was deleted.';
    const isText = msg.messageType === 0 || msg.messageType === undefined;
    const raw = isText
      ? (msg.content ?? '')
      : `[${['text', 'image', 'file', 'audio'][msg.messageType] ?? 'media'}]`;
    return raw.length > 80 ? raw.slice(0, 80) + '…' : raw;
  }

  // Coerce any sentAt into a stable UTC ISO string. Mirrors ConversationStore.
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

  private readCache(): Record<number, RoomSummary> {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as { userId: number; map: Record<number, RoomSummary> };
      const me = this.auth?.getCurrentUser()?.userId ?? 0;
      if (!parsed?.map || parsed.userId !== me) return {};
      return parsed.map;
    } catch {
      return {};
    }
  }
}
