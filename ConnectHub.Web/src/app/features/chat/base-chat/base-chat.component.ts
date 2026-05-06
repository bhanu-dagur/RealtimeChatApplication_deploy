import {
  Directive, OnDestroy, AfterViewChecked,
  ViewChild, ElementRef, inject, signal
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ChatHubService } from '../../../core/signalr/chat-hub.service';
import { MessageApiService } from '../../../core/http/message-api.service';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { Message, MessageType, SendMessageDto } from '../../../shared/models/message.model';
import { AuthResponse } from '../../../shared/models/user.model';
import { ApiResponse, PagedResult } from '../../../shared/models/api-response.model';
import { UploadResult } from '../../../shared/components/file-upload/file-upload.component';
import { MessageAction } from '../message-bubble/message-bubble.component';
import { formatChatTime } from '../../../shared/pipes/chat-time.pipe';

@Directive()
export abstract class BaseChatComponent implements OnDestroy, AfterViewChecked {
  @ViewChild('messagesEnd') messagesEnd!: ElementRef;
  @ViewChild('messagesWrap') messagesWrap?: ElementRef<HTMLElement>;

  protected route = inject(ActivatedRoute);
  protected router = inject(Router);
  protected auth = inject(AuthService);
  public hub = inject(ChatHubService);
  protected msgApi = inject(MessageApiService);
  protected toast = inject(ToastService);
  protected destroy$ = new Subject<void>();

  protected readonly PAGE_SIZE = 20;

  currentUser = signal<AuthResponse | null>(null);
  messages = signal<Message[]>([]);
  newMessage = signal('');
  isLoading = signal(false);
  isLoadingMore = signal(false);
  hasMore = signal(false);
  page = signal(1);
  totalCount = signal(0);

  shouldScroll = false;
  // True when the next scheduled scroll was caused by the local user (send,
  // chat-open). Skips the isAtBottom guard so we always pin to the latest
  // message instead of surfacing a "new messages" pill.
  forceScroll = false;
  // True iff the user is parked at (or within ~80px of) the bottom of the
  // message list — the only situation in which auto-scroll for incoming peer
  // messages is desired. Lets people read history without getting yanked.
  isAtBottom = signal(true);
  hasNewBelow = signal(false);
  typingTimeout?: ReturnType<typeof setTimeout>;

  showSearch = signal(false);
  searchKeyword = signal('');
  searchResults = signal<Message[]>([]);
  searchHighlight = signal<string>('');
  isSearching = signal(false);

  replyTo = signal<Message | null>(null);
  showEmojiPicker = signal(false);

  // ── Hooks subclasses must implement ───────────────────────────
  protected abstract fetchMessagesPage(page: number): Observable<ApiResponse<PagedResult<Message>>> | null;
  protected abstract searchMessagesApi(keyword: string): Observable<ApiResponse<Message[]>> | null;
  protected abstract filterSearchResults(items: Message[]): Message[];
  protected abstract buildTextSendDto(content: string, replyToMessageId?: number): SendMessageDto | null;
  protected abstract buildFileSendDto(result: UploadResult, messageType: MessageType): SendMessageDto | null;
  protected abstract afterSendSuccess(msg: Message): void;
  protected abstract broadcastDeleteFor(msg: Message): Promise<void>;
  protected abstract sendTypingPing(active: boolean): void;

  // ── Shared subscription wiring; subclasses call from ngOnInit ─
  protected initBaseSubscriptions(): void {
    this.hub.messageEdited$
      .pipe(takeUntil(this.destroy$))
      .subscribe(updated => {
        if (!updated.messageId) return;
        this.messages.update(list =>
          list.map(m => m.messageId === updated.messageId ? { ...m, ...updated } : m)
        );
      });

    this.hub.messageDeleted$
      .pipe(takeUntil(this.destroy$))
      .subscribe(e => {
        this.messages.update(list =>
          list.map(m => m.messageId === e.messageId
            ? { ...m, isDeleted: true, content: 'This message was deleted.' }
            : m)
        );
      });
  }

  // ── Lifecycle ─────────────────────────────────────────────────
  ngAfterViewChecked(): void {
    if (!this.shouldScroll) return;
    this.shouldScroll = false;

    // forceScroll is set when the local user did something explicit (sent a
    // message, opened the chat). Always pin to the bottom in that case — even
    // if they happened to be scrolled up — because chat apps jump you to your
    // own message. Incoming messages still respect isAtBottom so we don't
    // hijack a peer-driven scroll position.
    if (this.forceScroll || this.isAtBottom()) {
      this.scrollToBottom();
      this.hasNewBelow.set(false);
    } else {
      this.hasNewBelow.set(true);
    }
    this.forceScroll = false;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Scroll ────────────────────────────────────────────────────
  onMessagesScroll(): void {
    const el = this.messagesWrap?.nativeElement;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    const atBottom = distanceFromBottom < 80;
    this.isAtBottom.set(atBottom);
    if (atBottom) this.hasNewBelow.set(false);

    // Infinite scroll: as soon as the user gets within ~120px of the top and
    // there's another page available, fetch it.
    if (el.scrollTop < 120 && this.hasMore() && !this.isLoadingMore()) {
      this.loadMore();
    }
  }

  jumpToLatest(): void {
    this.hasNewBelow.set(false);
    this.scrollToBottom();
  }

  scrollToBottom(): void {
    try { this.messagesEnd?.nativeElement.scrollIntoView({ behavior: 'smooth' }); } catch { }
  }

  jumpToMessage(messageId: number): void {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('msg-flash');
      setTimeout(() => el.classList.remove('msg-flash'), 1500);
    }
  }

  // Mobile back arrow — event-bus pattern keeps chat → dashboard
  // dependency direction-free.
  goBackToList(): void {
    window.dispatchEvent(new CustomEvent('chat:back-to-list'));
  }

  // ── Pagination ────────────────────────────────────────────────
  loadMessages(page: number): void {
    const req = this.fetchMessagesPage(page);
    if (!req) return;
    this.isLoading.set(page === 1);
    req.pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.isLoading.set(false);
          if (!res.success || !res.data) return;
          const items = res.data.items ?? [];
          this.totalCount.set(res.data.totalCount ?? items.length);
          this.hasMore.set(page < (res.data.totalPages ?? 0));
          // Merge instead of replace: a SignalR message can land between the
          // route-params reset and this fetch resolving. A naive .set(items)
          // would silently drop it. Prefer the server row when the same
          // messageId appears on both sides (it has authoritative ticks/edit
          // state), and keep any locally-appended row whose id isn't in the
          // server page yet.
          this.messages.update(existing => {
            const serverIds = new Set(items.map(m => m.messageId));
            const localOnly = existing.filter(m => !!m.messageId && !serverIds.has(m.messageId));
            return [...items, ...localOnly];
          });
          this.shouldScroll = true;
          this.forceScroll = true;
        },
        error: () => {
          this.isLoading.set(false);
          this.toast.error('Failed to load messages', 'Please try again later.');
        }
      });
  }

  loadMore(): void {
    if (this.isLoadingMore() || !this.hasMore()) return;
    const nextPage = this.page() + 1;
    const req = this.fetchMessagesPage(nextPage);
    if (!req) return;

    this.isLoadingMore.set(true);

    // Snapshot scroll geometry BEFORE the new (older) rows render at the top.
    // After the patch we restore by setting scrollTop = newScrollHeight - oldHeightFromBottom,
    // so the message the user was reading stays under their cursor instead of
    // jumping by the height of the newly-prepended block.
    const wrap = this.messagesWrap?.nativeElement;
    const prevScrollHeight = wrap?.scrollHeight ?? 0;
    const prevScrollTop = wrap?.scrollTop ?? 0;

    req.pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.isLoadingMore.set(false);
          if (!res.success || !res.data) return;
          const older = res.data.items ?? [];
          this.page.set(nextPage);
          this.hasMore.set(nextPage < (res.data.totalPages ?? 0));
          this.messages.update(list => {
            const seen = new Set(list.map(m => m.messageId));
            const fresh = older.filter(m => !seen.has(m.messageId));
            return [...fresh, ...list];
          });

          // Restore scroll position after Angular paints the new rows. Two RAFs
          // because the first one fires before the layout committed; the second
          // one runs after the new node heights are known.
          requestAnimationFrame(() => requestAnimationFrame(() => {
            const el = this.messagesWrap?.nativeElement;
            if (!el) return;
            el.scrollTop = el.scrollHeight - prevScrollHeight + prevScrollTop;
          }));
        },
        error: () => {
          this.isLoadingMore.set(false);
          this.toast.error('Failed to load older messages', 'Please try again.');
        }
      });
  }

  // ── Send ──────────────────────────────────────────────────────
  sendMessage(): void {
    const content = this.newMessage().trim();
    if (!content) return;

    this.newMessage.set('');
    const replying = this.replyTo();
    const dto = this.buildTextSendDto(content, replying?.messageId);
    if (!dto) { this.newMessage.set(content); return; }
    this.replyTo.set(null);

    this.msgApi.sendMessage(dto)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          if (res.success && res.data) {
            this.messages.update(list => {
              if (list.some(m => m.messageId === res.data.messageId)) return list;
              return [...list, res.data];
            });
            this.shouldScroll = true;
            this.forceScroll = true; // I just sent — always pin to bottom.
            this.afterSendSuccess(res.data);
          } else {
            this.newMessage.set(content);
            this.toast.error('Send failed', res.message ?? 'Could not send message.');
          }
        },
        error: () => {
          this.newMessage.set(content);
          this.toast.error('Send failed', 'Network error.');
        }
      });
  }

  onFileUploaded(result: UploadResult): void {
    let messageType = MessageType.FILE;
    if (result.contentType.startsWith('image/')) messageType = MessageType.IMAGE;
    if (result.contentType.startsWith('audio/')) messageType = MessageType.AUDIO;

    const dto = this.buildFileSendDto(result, messageType);
    if (!dto) return;

    this.msgApi.sendMessage(dto)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          if (res.success && res.data) {
            this.messages.update(list => {
              if (list.some(m => m.messageId === res.data.messageId)) return list;
              return [...list, res.data];
            });
            this.shouldScroll = true;
            this.forceScroll = true;
            this.afterSendSuccess(res.data);
          }
        }
      });
  }

  // ── Edit / Delete ─────────────────────────────────────────────
  onMessageAction(evt: MessageAction): void {
    if (evt.kind === 'edit') this.editMessage(evt.message, evt.newContent ?? '');
    if (evt.kind === 'delete') this.deleteMessage(evt.message);
    if (evt.kind === 'delete-for-me') this.deleteMessageForMe(evt.message);
    if (evt.kind === 'reply') this.startReply(evt.message);
    if (evt.kind === 'jump-to-reply' && evt.message.replyToMessageId) {
      this.jumpToMessage(evt.message.replyToMessageId);
    }
  }

  protected editMessage(msg: Message, newContent: string): void {
    const trimmed = newContent.trim();
    if (!trimmed || trimmed === msg.content) return;
    this.msgApi.editMessage(msg.messageId, trimmed)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          if (res.success && res.data) {
            this.messages.update(list =>
              list.map(m => m.messageId === res.data.messageId ? { ...m, ...res.data } : m)
            );
            this.hub.broadcastEdit(res.data).catch(err => console.error('Edit broadcast failed:', err));
          } else {
            this.toast.error('Edit failed', res.message ?? 'Could not edit message.');
          }
        },
        error: () => this.toast.error('Edit failed', 'Network error.')
      });
  }

  protected deleteMessage(msg: Message): void {
    this.msgApi.deleteMessage(msg.messageId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          if (res.success) {
            this.messages.update(list =>
              list.map(m => m.messageId === msg.messageId
                ? { ...m, isDeleted: true, content: 'This message was deleted.' }
                : m)
            );
            this.broadcastDeleteFor(msg).catch(err => console.error('Delete broadcast failed:', err));
          } else {
            this.toast.error('Delete failed', res.message ?? 'Could not delete message.');
          }
        },
        error: () => this.toast.error('Delete failed', 'Network error.')
      });
  }

  // "Delete for me" — server keeps the row but adds my id to DeletedForUserIds.
  // Locally we drop it from the array immediately so it disappears for me; peers
  // continue to see it untouched (no SignalR broadcast).
  protected deleteMessageForMe(msg: Message): void {
    const me = this.currentUser()?.userId;
    if (!me) return;
    this.msgApi.deleteMessageForMe(msg.messageId, me)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          if (res.success) {
            this.messages.update(list => list.filter(m => m.messageId !== msg.messageId));
          } else {
            this.toast.error('Could not hide message', res.message ?? '');
          }
        },
        error: () => this.toast.error('Could not hide message', 'Network error.')
      });
  }

  // ── Reply ─────────────────────────────────────────────────────
  startReply(m: Message): void { this.replyTo.set(m); }
  cancelReply(): void { this.replyTo.set(null); }

  replyPreviewFor(m: Message): { senderName: string; content: string } | undefined {
    if (!m.replyToMessageId) return undefined;
    const target = this.messages().find(x => x.messageId === m.replyToMessageId);
    if (!target) return { senderName: 'Unknown', content: 'Original message not loaded' };
    const me = this.currentUser()?.userId;
    return {
      senderName: target.senderId === me ? 'You' : (target.senderName ?? `User ${target.senderId}`),
      content: target.isDeleted ? 'This message was deleted.' : (target.content ?? '')
    };
  }

  // ── Search ────────────────────────────────────────────────────
  toggleSearch(): void {
    this.showSearch.update(v => !v);
    if (!this.showSearch()) {
      this.searchKeyword.set('');
      this.searchResults.set([]);
      this.searchHighlight.set('');
    }
  }

  runSearch(keyword: string): void {
    this.searchKeyword.set(keyword);
    if (!keyword.trim()) {
      this.searchResults.set([]);
      this.searchHighlight.set('');
      return;
    }
    const req = this.searchMessagesApi(keyword.trim());
    if (!req) return;

    this.isSearching.set(true);
    req.pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.isSearching.set(false);
          if (!res.success || !res.data) return;
          this.searchResults.set(this.filterSearchResults(res.data));
          this.searchHighlight.set(keyword.trim());
        },
        error: () => { this.isSearching.set(false); this.toast.error('Search failed', ''); }
      });
  }

  // ── Emoji ─────────────────────────────────────────────────────
  toggleEmojiPicker(): void { this.showEmojiPicker.update(v => !v); }
  onEmojiSelected(emoji: string): void {
    this.newMessage.update(v => v + emoji);
    // Don't auto-close — users typically stack multiple emojis.
  }

  // ── Keyboard / typing ─────────────────────────────────────────
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
      return;
    }
    this.sendTypingPing(true);
    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => this.sendTypingPing(false), 2000);
  }

  // ── Helpers ───────────────────────────────────────────────────
  isMine(msg: Message): boolean {
    return msg.senderId === this.currentUser()?.userId;
  }

  formatTime(dateStr: string): string { return formatChatTime(dateStr, 'time'); }
}
