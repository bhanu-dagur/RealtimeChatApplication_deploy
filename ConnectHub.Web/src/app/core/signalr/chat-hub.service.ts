import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { Message } from '../../shared/models/message.model';
import { ConversationStore } from '../store/conversation.store';
import { RoomConversationStore } from '../store/room-conversation.store';
import { ApiResponse } from '../../shared/models/api-response.model';
import { NotificationSoundService } from '../../shared/components/notification-sound.service';

export type ConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected';

export interface TypingEvent {
  senderId: number;
  senderName: string;
  isTyping: boolean;
}

export interface PresenceEvent {
  userId: number;
  userName: string;
}

export interface ReadReceiptEvent {
  messageId: number;
  readBy: number;
  readAt: string;
}

export interface DeliveredEvent {
  messageId: number;
  deliveredBy: number;
  deliveredAt: string;
}

export interface BulkReadEvent {
  readerId: number;
  partnerId: number;
  readAt: string;
}

export interface MessageDeletedEvent {
  messageId: number;
  roomId?: number | null;
  receiverId?: number | null;
}

@Injectable({ providedIn: 'root' })
export class ChatHubService {
  private auth = inject(AuthService);
  private http = inject(HttpClient);
  private conversations = inject(ConversationStore);
  private roomConversations = inject(RoomConversationStore);
  private sound = inject(NotificationSoundService);
  private connection!: signalR.HubConnection;
  private handlersRegistered = false;
  private connectionStartPromise?: Promise<void>;

  // Pending invocations to retry on reconnect. Bounded so a long offline
  // period can't balloon the queue. Oldest entries are dropped first; the
  // server already persisted them via REST, so the worst case is the sender's
  // tick stays grey (✓) until the recipient's ack races back — never data loss.
  private static readonly PENDING_QUEUE_MAX = 200;
  private pendingDirectMessages: Message[] = [];
  private pendingRoomMessages: Message[] = [];

  // Rooms this client is currently inside — needed because SignalR groups
  // are connection-scoped and reset on reconnect; we re-join them after.
  private joinedRooms = new Set<number>();

  // ── Observables ────────────────────────────────────────────
  directMessage$ = new Subject<Message>();
  roomMessage$ = new Subject<Message>();
  messageEdited$ = new Subject<Message>();
  messageDeleted$ = new Subject<MessageDeletedEvent>();
  messageDelivered$ = new Subject<DeliveredEvent>();
  messagesRead$ = new Subject<BulkReadEvent>();
  typing$ = new Subject<TypingEvent>();
  userOnline$ = new Subject<PresenceEvent>();
  userOffline$ = new Subject<PresenceEvent>();
  onlineUsers$ = new Subject<number[]>();
  readReceipt$ = new Subject<ReadReceiptEvent>();
  joinedRoom$ = new Subject<number>();
  leftRoom$ = new Subject<number>();
  // Fired AFTER a successful reconnect (or initial connect). Subscribers can use this
  // to refetch any data that may have changed while the connection was down.
  reconnected$ = new Subject<void>();

  status = signal<ConnectionStatus>('disconnected');
  isConnected = false;

  // ── Connect ────────────────────────────────────────────────
  connect(): Promise<void> {
    const token = this.auth.getToken();
    if (!token) {
      return Promise.reject(new Error('No auth token available for SignalR connection.'));
    }

    if (this.isConnected && this.connection?.state === signalR.HubConnectionState.Connected) {
      return Promise.resolve();
    }

    if (this.connection?.state === signalR.HubConnectionState.Connecting ||
      this.connection?.state === signalR.HubConnectionState.Reconnecting) {
      return this.connectionStartPromise ?? Promise.reject(new Error('SignalR connection is still establishing.'));
    }

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(`${environment.hubUrl}/hubs/chat`, {
        accessTokenFactory: () => this.auth.getToken()!
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    this.handlersRegistered = false;
    this.registerHandlers();

    this.status.set('connecting');
    this.isConnected = false;

    this.connectionStartPromise = this.connection.start()
      .then(() => {
        this.isConnected = true;
        this.status.set('connected');
        console.log('[ChatHub] connected');
        this.rejoinRooms();
        this.retryPendingMessages();
        // Bulk-ack delivery for everything addressed to me on first connect.
        // Without this, messages received while the user was offline only
        // flipped sender-side ✓ → ✓✓ when they happened to open the matching
        // chat. Now their senders see ✓✓ as soon as the recipient comes back.
        this.bulkAckDeliveryOnConnect();
        // Pull canonical sidebar state — covers cases where the AppComponent
        // refresh raced ahead of the hub being ready, or a user switched.
        this.conversations.refresh();
        this.reconnected$.next();
      })
      .catch(err => {
        this.isConnected = false;
        this.status.set('disconnected');
        this.connectionStartPromise = undefined;
        console.error('[ChatHub] connect error:', err);
        throw err;
      });

    return this.connectionStartPromise;
  }

  /**
   * Resolve when the hub is in `Connected`. If we're mid-(re)connect, await
   * the in-flight promise. If fully disconnected, kick off a new connect AND
   * wait up to `timeoutMs` for it to land — that way callers don't see a
   * spurious rejection just because they fired during the brief
   * `Disconnected → Connecting` window right after a transient drop.
   */
  private ensureConnected(timeoutMs = 6000): Promise<void> {
    if (this.isConnected && this.connection?.state === signalR.HubConnectionState.Connected) {
      return Promise.resolve();
    }

    const inFlight = (this.connection?.state === signalR.HubConnectionState.Connecting ||
                      this.connection?.state === signalR.HubConnectionState.Reconnecting)
      ? this.connectionStartPromise
      : this.connect();

    if (!inFlight) return Promise.reject(new Error('SignalR connection unavailable.'));

    // Race against a soft timeout so a stuck WebSocket doesn't hang the UI.
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('SignalR ensureConnected timed out.'));
      }, timeoutMs);

      inFlight.then(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      }).catch(err => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  // ── Disconnect ─────────────────────────────────────────────
  disconnect(): void {
    this.connection?.stop().catch(() => { });
    this.isConnected = false;
    this.connectionStartPromise = undefined;
    this.joinedRooms.clear();
    this.status.set('disconnected');
  }

  // ── Send Direct Message ────────────────────────────────────
  sendDirectMessage(saved: Message): Promise<void> {
    return this.ensureConnected()
      .then(() => this.connection.invoke('SendDirectMessage', saved))
      .catch(err => {
        if (saved?.messageId && !this.pendingDirectMessages.some(m => m.messageId === saved.messageId)) {
          this.enqueuePending(this.pendingDirectMessages, saved);
          console.warn('[ChatHub] queued direct message for retry on reconnect', saved.messageId);
        }
        throw err;
      });
  }

  // ── Send Room Message ──────────────────────────────────────
  sendRoomMessage(saved: Message): Promise<void> {
    return this.ensureConnected()
      .then(() => this.connection.invoke('SendRoomMessage', saved))
      .catch(err => {
        if (saved?.messageId && !this.pendingRoomMessages.some(m => m.messageId === saved.messageId)) {
          this.enqueuePending(this.pendingRoomMessages, saved);
          console.warn('[ChatHub] queued room message for retry on reconnect', saved.messageId);
        }
        throw err;
      });
  }

  // Bounded push — drops the oldest entry if at capacity. Keeps memory flat
  // during long offline periods without losing the most recent intent.
  private enqueuePending(queue: Message[], msg: Message): void {
    if (queue.length >= ChatHubService.PENDING_QUEUE_MAX) {
      const dropped = queue.shift();
      console.warn('[ChatHub] pending queue at cap; dropped oldest', dropped?.messageId);
    }
    queue.push(msg);
  }

  // ── Broadcast edit/delete after API call succeeded ─────────
  broadcastEdit(saved: Message): Promise<void> {
    return this.ensureConnected().then(() =>
      this.connection.invoke('BroadcastMessageEdited', saved)
    );
  }

  broadcastDelete(messageId: number, receiverId: number | null, roomId: number | null): Promise<void> {
    return this.ensureConnected().then(() =>
      this.connection.invoke('BroadcastMessageDeleted', messageId, receiverId, roomId)
    );
  }

  broadcastDelivered(messageId: number, senderId: number, deliveredAt: string): Promise<void> {
    return this.ensureConnected().then(() =>
      this.connection.invoke('BroadcastMessageDelivered', messageId, senderId, deliveredAt)
    );
  }

  /** Tell the sender's tabs every message from them to me is now read (✓✓ blue). */
  broadcastMessagesRead(senderId: number): Promise<void> {
    return this.ensureConnected().then(() =>
      this.connection.invoke('BroadcastMessagesRead', senderId)
    );
  }

  // ── Join / Leave Room ──────────────────────────────────────
  joinRoom(roomId: number): Promise<void> {
    return this.ensureConnected().then(() => {
      this.joinedRooms.add(roomId);
      return this.connection.invoke('JoinRoom', roomId);
    });
  }

  leaveRoom(roomId: number): Promise<void> {
    this.joinedRooms.delete(roomId);
    if (!this.connection || this.connection.state !== signalR.HubConnectionState.Connected) {
      return Promise.resolve();
    }
    return this.connection.invoke('LeaveRoom', roomId);
  }

  // ── Typing Indicator ───────────────────────────────────────
  sendTyping(receiverId: number | null, roomId: number | null, isTyping: boolean): Promise<void> {
    return this.ensureConnected().then(() =>
      this.connection.invoke('TypingIndicator', receiverId, roomId, isTyping)
    );
  }

  // ── Mark Read ──────────────────────────────────────────────
  markRead(messageId: number, senderId: number): Promise<void> {
    return this.ensureConnected().then(() =>
      this.connection.invoke('MarkMessageRead', messageId, senderId)
    );
  }

  /**
   * Recipient-device delivery ack. Fires for every incoming direct message,
   * regardless of which chat is currently open. Hits the REST endpoint to
   * persist IsDelivered=true, then SignalR-broadcasts the timestamp back to
   * the sender so their bubble flips ✓ → ✓✓ (grey). Idempotent — repeat acks
   * are no-ops server-side.
   */
  private ackDelivery(msg: Message): void {
    const me = this.auth.getCurrentUser()?.userId;
    if (!me || !msg?.messageId) return;
    if (msg.roomId) return;                  // room messages don't have per-recipient delivery
    if (msg.senderId === me) return;         // skip self-echoes
    if (msg.receiverId !== me) return;       // not addressed to me
    if (msg.isDelivered) return;             // already acked

    this.http.put<ApiResponse<Message>>(
      `${environment.messageApiUrl}/api/messages/${msg.messageId}/delivered?recipientId=${me}`, {}
    ).subscribe({
      next: res => {
        if (!res?.success || !res.data) return;
        const deliveredAt = res.data.deliveredAt ?? new Date().toISOString();
        // Route through ensureConnected — the REST call may have resolved
        // mid-reconnect, in which case a raw invoke() throws and the sender's
        // ✓ never flips. ensureConnected awaits the in-flight handshake
        // (or kicks one off) before invoking.
        this.ensureConnected()
          .then(() => this.connection.invoke('BroadcastMessageDelivered',
            res.data.messageId, res.data.senderId, deliveredAt))
          .catch(() => { /* sender's tab will reconcile via mark-all-delivered on its next reconnect */ });
      },
      error: () => { /* swallow — bulk-delivered fires on reconnect */ }
    });
  }

  // Fire /mark-all-delivered when this client comes online. The server flips
  // IsDelivered=true on every undelivered DM addressed to me and returns the
  // list (messageId, senderId, deliveredAt). We then fan out one SignalR
  // BroadcastMessageDelivered per row so each original sender's ✓ ticks flip
  // to ✓✓ in real time. Without this fan-out, senders only saw the new
  // delivered state after a hard refresh — the server-side flag flip alone
  // was invisible to them.
  private bulkAckDeliveryOnConnect(): void {
    const me = this.auth.getCurrentUser()?.userId;
    if (!me) return;
    this.http.put<ApiResponse<{ messageId: number; senderId: number; deliveredAt: string }[]>>(
      `${environment.messageApiUrl}/api/messages/mark-all-delivered?recipientId=${me}`, {}
    ).subscribe({
      next: res => {
        if (!res?.success || !Array.isArray(res.data) || res.data.length === 0) return;
        // Best-effort fan-out: one invoke per delivered message. The hub
        // routes each event to the original sender's tabs only, so this
        // scales linearly with the catch-up size, not with active users.
        // ensureConnected() guards against the connection still being mid-
        // handshake when the REST response lands.
        for (const d of res.data) {
          this.ensureConnected()
            .then(() => this.connection.invoke(
              'BroadcastMessageDelivered', d.messageId, d.senderId, d.deliveredAt
            ))
            .catch(() => { /* sender will reconcile from DB on their next chat-open */ });
        }
      },
      error: () => { /* swallow — best-effort */ }
    });
  }

  // ── Internal: rejoin SignalR groups for any rooms the user was in ──
  private rejoinRooms(): void {
    if (!this.joinedRooms.size) return;
    for (const roomId of this.joinedRooms) {
      this.connection.invoke('JoinRoom', roomId).catch(err => {
        console.error('[ChatHub] rejoin room failed:', roomId, err);
      });
    }
  }

  private retryPendingMessages(): void {
    if (!this.isConnected || this.connection?.state !== signalR.HubConnectionState.Connected) return;
    if (!this.pendingDirectMessages.length && !this.pendingRoomMessages.length) return;

    const directQueue = this.pendingDirectMessages.splice(0, this.pendingDirectMessages.length);
    directQueue.forEach(message => {
      this.connection.invoke('SendDirectMessage', message).catch(err => {
        console.error('[ChatHub] retry direct message failed:', err, message.messageId);
        if (!this.pendingDirectMessages.some(m => m.messageId === message.messageId)) {
          this.pendingDirectMessages.push(message);
        }
      });
    });

    const roomQueue = this.pendingRoomMessages.splice(0, this.pendingRoomMessages.length);
    roomQueue.forEach(message => {
      this.connection.invoke('SendRoomMessage', message).catch(err => {
        console.error('[ChatHub] retry room message failed:', err, message.messageId, message.roomId);
        if (!this.pendingRoomMessages.some(m => m.messageId === message.messageId)) {
          this.pendingRoomMessages.push(message);
        }
      });
    });
  }

  // ── Register all Hub event handlers ───────────────────────
  private registerHandlers(): void {
    if (this.handlersRegistered) return;

    this.connection.on('ReceiveDirectMessage', (msg: Message) => {
      // Push into the sidebar store first — that way the conversation
      // ordering and unread-badge update before any chat component renders.
      this.conversations.handleIncoming(msg);
      this.directMessage$.next(msg);

      // Soft notification chime. Conditions match WhatsApp:
      //   - the message is FROM someone else (skip self-echoes from other tabs)
      //   - that conversation is not currently open (active partner check via
      //     ConversationStore.activePartnerId)
      const me = this.auth.getCurrentUser()?.userId;
      const fromSomeoneElse = !!me && msg.senderId !== me;
      const chatIsOpen = this.conversations.activePartnerId() === msg.senderId;
      if (fromSomeoneElse && !chatIsOpen) this.sound.ping();

      // Device-level delivery ack: WhatsApp's grey ✓✓ means "your message
      // reached the recipient's device", not "their chat window is open".
      // Fire here (in the hub service) so the ack happens regardless of
      // whether the matching chat component is mounted. Skip self-echoes.
      this.ackDelivery(msg);
    });
    this.connection.on('ReceiveRoomMessage', (msg: Message) => {
      // Push into the room sidebar store first so the dashboard groups list
      // re-orders (newest activity to top) and badges the unread counter
      // before any chat component renders. Mirrors the direct-message path.
      this.roomConversations.handleIncoming(msg);
      this.roomMessage$.next(msg);

      // Soft notification chime when the message is from someone else and
      // the room isn't currently open in this tab.
      const me = this.auth.getCurrentUser()?.userId;
      const fromSomeoneElse = !!me && msg.senderId !== me;
      const roomIsOpen = this.roomConversations.activeRoomId() === msg.roomId;
      if (fromSomeoneElse && !roomIsOpen) this.sound.ping();
    });
    this.connection.on('MessageEdited', (msg: Message) => this.messageEdited$.next(msg));
    this.connection.on('MessageDeleted', (e: MessageDeletedEvent) => this.messageDeleted$.next(e));
    this.connection.on('MessageDelivered', (e: DeliveredEvent) => this.messageDelivered$.next(e));
    this.connection.on('MessagesRead', (e: BulkReadEvent) => this.messagesRead$.next(e));
    this.connection.on('UserTyping', (event: TypingEvent) => this.typing$.next(event));
    this.connection.on('UserOnline', (event: PresenceEvent) => this.userOnline$.next(event));
    this.connection.on('UserOffline', (event: PresenceEvent) => this.userOffline$.next(event));
    this.connection.on('OnlineUsers', (userIds: number[]) => this.onlineUsers$.next(userIds));
    this.connection.on('MessageRead', (event: ReadReceiptEvent) => this.readReceipt$.next(event));
    this.connection.on('JoinedRoom', (roomId: number) => this.joinedRoom$.next(roomId));
    this.connection.on('LeftRoom', (roomId: number) => this.leftRoom$.next(roomId));

    this.connection.onreconnecting(error => {
      this.isConnected = false;
      this.status.set('reconnecting');
      console.warn('[ChatHub] reconnecting…', error);
    });

    this.connection.onreconnected(() => {
      this.isConnected = true;
      this.status.set('connected');
      console.log('[ChatHub] reconnected');
      this.rejoinRooms();
      this.retryPendingMessages();
      // While we were offline, missed-message broadcasts never hit `ReceiveDirectMessage`.
      // Pull canonical sidebar state from the server so unread + last-message previews catch up.
      this.conversations.refresh();
      this.reconnected$.next();
    });

    this.connection.onclose(() => {
      this.isConnected = false;
      this.status.set('disconnected');
      this.connectionStartPromise = undefined;
      console.warn('[ChatHub] connection closed');
    });

    this.handlersRegistered = true;
  }
}
