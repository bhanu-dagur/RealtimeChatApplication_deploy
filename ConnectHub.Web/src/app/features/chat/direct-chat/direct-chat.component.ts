import { Component, OnInit, ViewChild, ElementRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, takeUntil } from 'rxjs';
import { UserApiService } from '../../../core/http/user-api.service';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { Message, MessageType, SendMessageDto } from '../../../shared/models/message.model';
import { UserProfileDto } from '../../../shared/models/user.model';
import { ApiResponse, PagedResult } from '../../../shared/models/api-response.model';
import { FileUploadComponent, UploadResult } from '../../../shared/components/file-upload/file-upload.component';
import { ConversationStore } from '../../../core/store/conversation.store';
import { ChatTimePipe } from '../../../shared/pipes/chat-time.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { MessageBubbleComponent } from '../message-bubble/message-bubble.component';
import { EmojiPickerComponent } from '../../../shared/components/emoji-picker/emoji-picker.component';
import { BaseChatComponent } from '../base-chat/base-chat.component';

@Component({
  selector: 'app-direct-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, AvatarComponent, FileUploadComponent, MessageBubbleComponent, EmojiPickerComponent, ChatTimePipe, TimeAgoPipe],
  templateUrl: './direct-chat.component.html',
  styleUrls: ['./direct-chat.component.scss']
})
export class DirectChatComponent extends BaseChatComponent implements OnInit {
  @ViewChild('messagesStart') messagesStart?: ElementRef;

  private userApi = inject(UserApiService);
  private conversations = inject(ConversationStore);

  receiver = signal<UserProfileDto | null>(null);
  receiverOnline = signal(false);
  private activeChatUserId: number | null = null;

  ngOnInit(): void {
    this.currentUser.set(this.auth.getCurrentUser());

    if (!this.currentUser() || !this.auth.getToken()) {
      this.router.navigate(['/login']);
      return;
    }

    // Only attempt a fresh connect when the hub is genuinely disconnected.
    // If AppComponent's boot connect() is mid-handshake (status='connecting')
    // or auto-reconnect is running, ride that — calling connect() again here
    // raced with the in-flight promise and produced spurious "Realtime
    // unavailable" warnings on every chat-open.
    if (this.hub.status() === 'disconnected') {
      this.hub.connect().catch(err => console.error('ChatHub connect failed:', err));
    }

    this.initBaseSubscriptions();

    // After reconnect, pull page 1 again so anything that arrived while we were
    // offline gets merged via the dedupe path. Also bulk-ack delivery for
    // everything addressed to me — without this, messages received while
    // offline never flip ✓ → ✓✓ on the sender side.
    this.hub.reconnected$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        const me = this.currentUser()?.userId;
        if (me) this.msgApi.markAllDelivered(me).subscribe();
        if (this.activeChatUserId) this.loadMessages(1);
      });

    this.hub.userOnline$
      .pipe(takeUntil(this.destroy$))
      .subscribe(e => {
        if (e.userId === this.receiver()?.userId) this.receiverOnline.set(true);
      });

    this.hub.userOffline$
      .pipe(takeUntil(this.destroy$))
      .subscribe(e => {
        if (e.userId === this.receiver()?.userId) this.receiverOnline.set(false);
      });

    this.hub.directMessage$
      .pipe(takeUntil(this.destroy$))
      .subscribe(msg => {
        const me = this.currentUser()?.userId;
        const partnerId = this.activeChatUserId;
        if (!me || !partnerId) return;

        const belongsToCurrentChat =
          (msg.senderId === partnerId && msg.receiverId === me) ||
          (msg.senderId === me && msg.receiverId === partnerId);

        if (!belongsToCurrentChat) return;

        this.messages.update(m => {
          if (msg.messageId && m.some(x => x.messageId === msg.messageId)) return m;
          return [...m, msg];
        });
        this.shouldScroll = true;
        // Self-echo (sent from another tab) → always pin. Peer message →
        // respect isAtBottom so we don't yank the user away from history.
        if (msg.senderId === me) this.forceScroll = true;

        // Peer just sent a message into the chat I'm actively reading.
        // Flush server-side IsRead=true for this fresh row + broadcast a read
        // receipt so the sender's ticks flip ✓✓ blue immediately. Without
        // this, every message that lands while the chat is open stays
        // IsRead=false on the server — closing/reopening the app would then
        // resurrect the unread badge from stale DB state.
        if (msg.senderId === partnerId && msg.receiverId === me && !msg.isRead) {
          this.conversations.markRead(partnerId);
          this.hub.broadcastMessagesRead(partnerId).catch(() => { });
        }
      });

    // Sender side: another tab/the recipient acked delivery → flip ✓ to ✓✓.
    this.hub.messageDelivered$
      .pipe(takeUntil(this.destroy$))
      .subscribe(e => {
        this.messages.update(list =>
          list.map(m => m.messageId === e.messageId
            ? { ...m, isDelivered: true, deliveredAt: e.deliveredAt }
            : m)
        );
      });

    // Sender side: recipient opened the chat → flip every ✓✓ I sent them to blue.
    // Reader side: this fires for "my other tabs" too, so reading on phone
    // clears the desktop unread badge in real time.
    this.hub.messagesRead$
      .pipe(takeUntil(this.destroy$))
      .subscribe(e => {
        const me = this.currentUser()?.userId;
        if (!me) return;
        const isReadByPartner = e.readerId === this.activeChatUserId && e.partnerId === me;
        const isReadByMe       = e.readerId === me && e.partnerId === this.activeChatUserId;

        if (isReadByPartner) {
          this.messages.update(list => list.map(m =>
            m.senderId === me && !m.isRead
              ? { ...m, isRead: true, isDelivered: true, readAt: e.readAt }
              : m
          ));
        } else if (isReadByMe) {
          this.conversations.markRead(this.activeChatUserId!, { syncServer: false });
        }
      });

    this.route.params
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const userId = +params['userId'];
        this.activeChatUserId = userId;
        this.conversations.markRead(userId);
        this.hub.broadcastMessagesRead(userId).catch(() => { });
        this.page.set(1);
        this.messages.set([]);
        this.hasMore.set(false);
        // Reset scroll state for the new chat — otherwise a stale `isAtBottom=false`
        // from the previous chat would suppress the auto-scroll that should happen
        // on chat-open.
        this.isAtBottom.set(true);
        this.hasNewBelow.set(false);
        this.loadReceiver(userId);
        this.loadMessages(1);
      });
  }

  override ngOnDestroy(): void {
    this.conversations.clearActive();
    super.ngOnDestroy();
  }

  loadReceiver(userId: number): void {
    this.userApi.getById(userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(res => {
        if (res.success) {
          this.receiver.set(res.data);
          this.receiverOnline.set(res.data.isOnline ?? false);
        }
      });
  }

  // ── Base hooks ────────────────────────────────────────────────
  protected fetchMessagesPage(page: number): Observable<ApiResponse<PagedResult<Message>>> | null {
    const me = this.currentUser()?.userId;
    const partnerId = this.activeChatUserId;
    if (!me || !partnerId) return null;
    return this.msgApi.getDirectMessages(me, partnerId, page, this.PAGE_SIZE);
  }

  protected searchMessagesApi(keyword: string): Observable<ApiResponse<Message[]>> | null {
    const me = this.currentUser()?.userId;
    if (!me) return null;
    return this.msgApi.searchMessages(me, keyword);
  }

  protected filterSearchResults(items: Message[]): Message[] {
    const me = this.currentUser()?.userId;
    const partnerId = this.activeChatUserId;
    if (!me || !partnerId) return [];
    return items.filter(m =>
      !m.roomId &&
      ((m.senderId === me && m.receiverId === partnerId) ||
       (m.senderId === partnerId && m.receiverId === me))
    );
  }

  protected buildTextSendDto(content: string, replyToMessageId?: number): SendMessageDto | null {
    const me = this.currentUser()?.userId;
    const receiverId = this.receiver()?.userId;
    if (!me || !receiverId) return null;
    return { senderId: me, receiverId, content, messageType: MessageType.TEXT, replyToMessageId };
  }

  protected buildFileSendDto(result: UploadResult, messageType: MessageType): SendMessageDto | null {
    const me = this.currentUser()?.userId;
    const receiverId = this.receiver()?.userId;
    if (!me || !receiverId) return null;
    return { senderId: me, receiverId, content: result.fileName, messageType, mediaUrl: result.url };
  }

  protected afterSendSuccess(msg: Message): void {
    this.conversations.handleIncoming(msg);
    // Optimistic local insert was marked pending=true by parent? — direct-chat's
    // text send used a `pending` flag so the bubble shows "⏱" until SignalR
    // echoes back. Recreate that for text messages only (file sends never had it).
    if (msg.messageType === MessageType.TEXT) {
      this.messages.update(list => list.map(m =>
        m.messageId === msg.messageId ? { ...m, pending: true } : m
      ));
    }
    this.hub.sendDirectMessage(msg)
      .then(() => {
        if (msg.messageType === MessageType.TEXT) {
          this.messages.update(list => list.map(m =>
            m.messageId === msg.messageId ? { ...m, pending: false } : m
          ));
        }
      })
      .catch(err => {
        // Only surface a toast when the connection is genuinely down. A
        // transient ensureConnected() rejection is already handled by the
        // pendingDirectMessages queue inside ChatHubService — the message
        // will be replayed automatically and the bubble reconciled by the
        // SignalR echo.
        console.warn('[direct-chat] realtime send race:', err);
        if (this.hub.status() === 'disconnected') {
          this.toast.info('Saved offline', 'Message will sync when you\'re back online.');
        }
      });
  }

  protected broadcastDeleteFor(msg: Message): Promise<void> {
    return this.hub.broadcastDelete(msg.messageId, msg.receiverId ?? null, null);
  }

  protected sendTypingPing(active: boolean): void {
    const receiverId = this.receiver()?.userId;
    if (!receiverId) return;
    this.hub.sendTyping(receiverId, null, active);
  }
}
