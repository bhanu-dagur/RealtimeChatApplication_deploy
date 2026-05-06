import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, forkJoin, of, takeUntil } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { RoomApiService } from '../../../core/http/room-api.service';
import { UserApiService } from '../../../core/http/user-api.service';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { ChatTimePipe } from '../../../shared/pipes/chat-time.pipe';
import { Message, MessageType, SendMessageDto } from '../../../shared/models/message.model';
import { ChatRoom, RoomMember } from '../../../shared/models/room.model';
import { UserProfileDto } from '../../../shared/models/user.model';
import { ApiResponse, PagedResult } from '../../../shared/models/api-response.model';
import { FileUploadComponent, UploadResult } from '../../../shared/components/file-upload/file-upload.component';
import { MessageBubbleComponent } from '../message-bubble/message-bubble.component';
import { EmojiPickerComponent } from '../../../shared/components/emoji-picker/emoji-picker.component';
import { RoomConversationStore } from '../../../core/store/room-conversation.store';
import { BaseChatComponent } from '../base-chat/base-chat.component';

@Component({
  selector: 'app-room-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, AvatarComponent, FileUploadComponent, MessageBubbleComponent, EmojiPickerComponent, ChatTimePipe],
  templateUrl: './room-chat.component.html',
  styleUrls: ['./room-chat.component.scss']
})
export class RoomChatComponent extends BaseChatComponent implements OnInit {
  private roomApi = inject(RoomApiService);
  private userApi = inject(UserApiService);
  private roomConversations = inject(RoomConversationStore);

  room = signal<ChatRoom | null>(null);
  members = signal<RoomMember[]>([]);
  myRole = signal<'ADMIN' | 'MODERATOR' | 'MEMBER' | null>(null);
  typingUsers = signal<string[]>([]);
  showMembers = signal(false);
  private activeRoomId: number | null = null;

  // Add-member modal state. Triggered from the header in room-chat.html;
  // searches users via UserApiService.search and posts to /api/rooms/members/add.
  showInviteModal = signal(false);
  inviteSearchQuery = signal('');
  inviteResults = signal<UserProfileDto[]>([]);
  inviteSearching = signal(false);
  inviteAdding = signal<number | null>(null);
  private inviteSearchTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.currentUser.set(this.auth.getCurrentUser());

    if (!this.currentUser() || !this.auth.getToken()) {
      this.router.navigate(['/login']);
      return;
    }

    if (this.hub.status() === 'disconnected') {
      this.hub.connect().catch(err => console.error('ChatHub connect failed:', err));
    }

    this.initBaseSubscriptions();

    this.hub.reconnected$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.activeRoomId) this.loadMessages(1);
      });

    this.route.params
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const roomId = +params['roomId'];
        if (this.activeRoomId && this.activeRoomId !== roomId) {
          this.hub.leaveRoom(this.activeRoomId).catch(() => { });
        }
        this.activeRoomId = roomId;
        // Reset the unread badge in the sidebar + tell the store this room is
        // active so any SignalR messages that land while it's open don't bump
        // the counter back up.
        this.roomConversations.markRead(roomId);
        this.page.set(1);
        this.messages.set([]);
        this.hasMore.set(false);
        this.isAtBottom.set(true);
        this.hasNewBelow.set(false);
        this.loadRoom(roomId);
        this.loadMessages(1);
        this.loadMembers(roomId);
        this.hub.joinRoom(roomId).catch(err => console.error('Room join failed:', err));
      });

    this.hub.roomMessage$
      .pipe(takeUntil(this.destroy$))
      .subscribe(msg => {
        if (!this.activeRoomId || msg.roomId !== this.activeRoomId) return;
        this.messages.update(m => {
          if (msg.messageId && m.some(x => x.messageId === msg.messageId)) return m;
          return [...m, msg];
        });
        this.shouldScroll = true;
      });

    this.hub.typing$
      .pipe(takeUntil(this.destroy$))
      .subscribe(e => {
        if (e.isTyping) {
          this.typingUsers.update(u => u.includes(e.senderName) ? u : [...u, e.senderName]);
        } else {
          this.typingUsers.update(u => u.filter(n => n !== e.senderName));
        }
      });
  }

  override ngOnDestroy(): void {
    if (this.activeRoomId) this.hub.leaveRoom(this.activeRoomId).catch(() => { });
    // Clear the active-room flag so subsequent SignalR room messages can
    // re-bump the unread counter in the sidebar.
    this.roomConversations.clearActive();
    super.ngOnDestroy();
  }

  loadRoom(roomId: number): void {
    this.roomApi.getRoomById(roomId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(res => { if (res.success) this.room.set(res.data); });
  }

  loadMembers(roomId: number): void {
    this.roomApi.getMembers(roomId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(res => {
        if (!res.success) return;

        const me = this.currentUser()?.userId;
        const mine = res.data.find(m => m.userId === me);
        this.myRole.set(mine?.role ?? null);

        // Show the rows immediately so the panel never flashes "User 7" — but
        // also kick off a fan-out to /api/users/{id} for each member to stitch
        // in displayName/userName, then re-emit.
        this.members.set(res.data);
        if (res.data.length === 0) return;

        const lookups = res.data.map(m =>
          this.userApi.getById(m.userId).pipe(
            map(r => ({ memberId: m.memberId, profile: r.success ? r.data : null })),
            catchError(() => of({ memberId: m.memberId, profile: null }))
          )
        );

        forkJoin(lookups)
          .pipe(takeUntil(this.destroy$))
          .subscribe(results => {
            const byMemberId = new Map(results.map(r => [r.memberId, r.profile]));
            this.members.update(list => list.map(m => {
              const p = byMemberId.get(m.memberId);
              return p
                ? { ...m, displayName: p.displayName, userName: p.userName,
                    avatarUrl: p.avatarUrl, isOnline: p.isOnline }
                : m;
            }));
          });
      });
  }

  isAdmin(): boolean { return this.myRole() === 'ADMIN'; }

  // ── Invite (Add Member) ──────────────────────────────────────
  openInviteModal(): void {
    if (!this.isAdmin()) {
      this.toast.warning('Admin only', 'Only room admins can add members.');
      return;
    }
    this.inviteSearchQuery.set('');
    this.inviteResults.set([]);
    this.showInviteModal.set(true);
  }

  closeInviteModal(): void {
    this.showInviteModal.set(false);
    clearTimeout(this.inviteSearchTimer);
  }

  // Debounced 250ms — short enough to feel reactive, long enough to avoid
  // spamming the server on every keystroke.
  onInviteSearchInput(value: string): void {
    this.inviteSearchQuery.set(value);
    clearTimeout(this.inviteSearchTimer);
    if (!value.trim()) { this.inviteResults.set([]); return; }
    this.inviteSearchTimer = setTimeout(() => this.runInviteSearch(value.trim()), 250);
  }

  private runInviteSearch(q: string): void {
    this.inviteSearching.set(true);
    this.userApi.search(q)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.inviteSearching.set(false);
          if (!res.success || !res.data) { this.inviteResults.set([]); return; }
          const memberIds = new Set(this.members().map(m => m.userId));
          const me = this.currentUser()?.userId;
          this.inviteResults.set(
            res.data.filter(u => !memberIds.has(u.userId) && u.userId !== me)
          );
        },
        error: () => {
          this.inviteSearching.set(false);
          this.inviteResults.set([]);
        }
      });
  }

  addMemberToRoom(userId: number): void {
    const roomId = this.room()?.roomId;
    if (!roomId || !this.isAdmin()) return;
    this.inviteAdding.set(userId);
    this.roomApi.joinRoom(roomId, userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.inviteAdding.set(null);
          if (!res.success || !res.data) {
            this.toast.error('Could not add member', res.message ?? '');
            return;
          }
          // Optimistic insert; loadMembers refetches the full list with the
          // proper joinedAt and roles, but we drop the row in immediately.
          const found = this.inviteResults().find(u => u.userId === userId);
          if (found) {
            this.members.update(list => [
              ...list,
              {
                ...res.data,
                displayName: found.displayName,
                userName: found.userName,
                avatarUrl: found.avatarUrl,
                isOnline: found.isOnline
              } as RoomMember
            ]);
            this.inviteResults.update(list => list.filter(u => u.userId !== userId));
          }
          this.toast.success('Member added', `${found?.displayName ?? 'User'} joined the room.`);
          this.loadMembers(roomId);
        },
        error: err => {
          this.inviteAdding.set(null);
          this.toast.error('Could not add member', err?.error?.message ?? 'Network error.');
        }
      });
  }

  removeMember(userId: number): void {
    const roomId = this.room()?.roomId;
    if (!roomId || !this.isAdmin()) return;
    if (!confirm('Remove this member from the room?')) return;
    this.roomApi.removeMember(roomId, userId).subscribe(res => {
      if (res.success) {
        this.members.update(list => list.filter(m => m.userId !== userId));
        this.toast.success('Member removed');
      } else {
        this.toast.error('Could not remove', res.message ?? '');
      }
    });
  }

  promoteMember(userId: number): void {
    const roomId = this.room()?.roomId;
    if (!roomId || !this.isAdmin()) return;
    this.roomApi.updateMemberRole(roomId, userId, 'ADMIN').subscribe(res => {
      if (res.success && res.data) {
        this.members.update(list => list.map(m => m.userId === userId ? { ...m, role: 'ADMIN' as any } : m));
        this.toast.success('Promoted to Admin');
      }
    });
  }

  demoteMember(userId: number): void {
    const roomId = this.room()?.roomId;
    if (!roomId || !this.isAdmin()) return;
    this.roomApi.updateMemberRole(roomId, userId, 'MEMBER').subscribe(res => {
      if (res.success && res.data) {
        this.members.update(list => list.map(m => m.userId === userId ? { ...m, role: 'MEMBER' as any } : m));
        this.toast.success('Demoted to Member');
      } else if (!res.success) {
        this.toast.error('Cannot demote', res.message ?? '');
      }
    });
  }

  /**
   * Resolve the best display name for a room message bubble:
   *   1. The senderName carried on the SignalR ChatMessage.
   *   2. The displayName of the matching room member (stitched in via /api/users/{id}).
   *   3. Fallback "User <id>".
   */
  senderNameFor(msg: Message): string {
    if (msg.senderName) return msg.senderName;
    const m = this.members().find(x => x.userId === msg.senderId);
    return m?.displayName || `User ${msg.senderId}`;
  }

  leaveRoom(): void {
    const roomId = this.room()?.roomId;
    const userId = this.currentUser()?.userId;
    if (!roomId || !userId) return;
    this.roomApi.leaveRoom(roomId, userId).subscribe(() => {
      this.hub.leaveRoom(roomId).catch(() => { });
      this.roomConversations.removeRoom(roomId);
      this.router.navigate(['/dashboard']);
    });
  }

  getTypingText(): string {
    const t = this.typingUsers();
    if (t.length === 0) return '';
    if (t.length === 1) return `${t[0]} is typing...`;
    if (t.length === 2) return `${t[0]} and ${t[1]} are typing...`;
    return 'Several people are typing...';
  }

  getRoomInitial(name: string): string {
    return name?.charAt(0).toUpperCase() ?? '#';
  }

  // ── Base hooks ────────────────────────────────────────────────
  protected fetchMessagesPage(page: number): Observable<ApiResponse<PagedResult<Message>>> | null {
    if (!this.activeRoomId) return null;
    return this.msgApi.getRoomMessages(this.activeRoomId, page, this.PAGE_SIZE);
  }

  protected searchMessagesApi(keyword: string): Observable<ApiResponse<Message[]>> | null {
    if (!this.activeRoomId) return null;
    return this.msgApi.searchRoomMessages(this.activeRoomId, keyword);
  }

  protected filterSearchResults(items: Message[]): Message[] {
    return items;
  }

  protected buildTextSendDto(content: string, replyToMessageId?: number): SendMessageDto | null {
    const me = this.currentUser()?.userId;
    const roomId = this.room()?.roomId;
    if (!me || !roomId) return null;
    return { senderId: me, roomId, content, messageType: MessageType.TEXT, replyToMessageId };
  }

  protected buildFileSendDto(result: UploadResult, messageType: MessageType): SendMessageDto | null {
    const me = this.currentUser()?.userId;
    const roomId = this.room()?.roomId;
    if (!me || !roomId) return null;
    return { senderId: me, roomId, content: result.fileName, messageType, mediaUrl: result.url };
  }

  protected afterSendSuccess(msg: Message): void {
    this.roomConversations.handleIncoming(msg);
    this.hub.sendRoomMessage(msg).catch(err => {
      console.warn('[room-chat] realtime send race:', err);
      if (this.hub.status() === 'disconnected') {
        this.toast.info('Saved offline', 'Message will sync when you\'re back online.');
      }
    });
  }

  protected broadcastDeleteFor(msg: Message): Promise<void> {
    return this.hub.broadcastDelete(msg.messageId, null, msg.roomId ?? null);
  }

  protected sendTypingPing(active: boolean): void {
    const roomId = this.room()?.roomId;
    if (!roomId) return;
    this.hub.sendTyping(null, roomId, active);
  }
}
