import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ChatHubService } from '../../core/signalr/chat-hub.service';
import { UserApiService } from '../../core/http/user-api.service';
import { RoomApiService } from '../../core/http/room-api.service';
import { NotificationApiService } from '../../core/http/notification-api.service';
import { PresenceApiService } from '../../core/http/presence-api.service';
import { ConversationStore } from '../../core/store/conversation.store';
import { RoomConversationStore } from '../../core/store/room-conversation.store';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { ChatTimePipe } from '../../shared/pipes/chat-time.pipe';
import { TimeAgoPipe } from '../../shared/pipes/time-ago.pipe';
import { UserProfileDto, AuthResponse } from '../../shared/models/user.model';
import { ChatRoom } from '../../shared/models/room.model';
import { NotificationHubService } from '../../core/signalr/notification-hub.service';

interface SidebarChat {
  user: UserProfileDto;
  lastMessage?: string;
  lastSentAt?: string;
  lastSenderId?: number;
  unread: number;
}

// Group sidebar row — same shape as a chat row but keyed by ChatRoom.
// Sorting and unread badging mirror direct chats so the UX is consistent.
interface SidebarRoom {
  room: ChatRoom;
  lastMessage?: string;
  lastSenderName?: string;
  lastSentAt?: string;
  unread: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterOutlet, AvatarComponent, ChatTimePipe, TimeAgoPipe],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private hub = inject(ChatHubService);
  private userApi = inject(UserApiService);
  private roomApi = inject(RoomApiService);
  private notifApi = inject(NotificationApiService);
  private presenceApi = inject(PresenceApiService);
  private notifHub = inject(NotificationHubService);
  private router = inject(Router);
  conversations = inject(ConversationStore);
  roomConversations = inject(RoomConversationStore);

  private destroy$ = new Subject<void>();
  private searchInput$ = new Subject<string>();

  currentUser = signal<AuthResponse | null>(null);
  contacts = signal<UserProfileDto[]>([]);
  myRooms = signal<ChatRoom[]>([]);
  searchResults = signal<UserProfileDto[]>([]);
  onlineUserIds = signal<Set<number>>(new Set());
  unreadDirectTotal = computed(() => this.conversations.totalUnread());
  notifCount = signal(0);
  isAdmin = computed(() => this.auth.isAdmin());
  activeTab = signal<'chats' | 'contacts' | 'groups'>('chats');
  searchQuery = signal('');
  isSearching = signal(false);
  activeContactId = signal<number | null>(null);
  activeRoomId = signal<number | null>(null);
  showWelcome = signal(true);
  // Mobile-only: when a chat is open, hide the contacts panel and show the
  // chat full-bleed. Toggled by the back arrow inside chat headers.
  // On desktop the CSS ignores this flag and shows both panels side-by-side.
  showContactsPanelMobile = signal(true);

  /** Partners we've already kicked off a /api/users/{id} hydrate for — guards
   *  against firing the same lookup repeatedly while it's in flight. */
  private hydrating = new Set<number>();

  /**
   * Chats tab — ONLY conversations that already have history (per-user-visible).
   * Sorted by lastSentAt DESC. The "browse every user" experience is in the
   * Contacts tab below.
   *
   * If a summary references a partner we don't have in `contacts()` yet
   * (deactivated user, registered after this session loaded contacts, or a
   * brand-new stranger who just messaged us), we render a stub row with the
   * partnerId as a placeholder name and trigger a background fetch (see the
   * effect below) so the real profile streams in. Without this, the row
   * silently disappeared and the user thought their chat was lost.
   */
  sidebarChats = computed<SidebarChat[]>(() => {
    const summaries = this.conversations.orderedSummaries();
    const byId = new Map(this.contacts().map(c => [c.userId, c]));
    const rows: SidebarChat[] = [];
    for (const s of summaries) {
      const u = byId.get(s.partnerId) ?? this.placeholderUser(s.partnerId);
      rows.push({
        user: u,
        lastMessage: s.lastMessage,
        lastSentAt: s.lastSentAt,
        lastSenderId: s.lastSenderId,
        unread: s.unreadCount
      });
    }
    return rows;
  });

  private placeholderUser(userId: number): UserProfileDto {
    return {
      userId,
      userName: `user${userId}`,
      displayName: `User ${userId}`,
      email: '',
      avatarUrl: undefined,
      bio: undefined,
      isOnline: false,
      lastSeen: undefined,
      createdAt: new Date().toISOString()
    } as UserProfileDto;
  }

  // Whenever the conversation summaries or the contact list change, kick off
  // a one-shot lookup for any partner we don't have a profile for. The result
  // patches into `contacts()` and the sidebar re-renders with real names +
  // avatars. Self-correcting — no manual orchestration needed.
  private hydrateMissingPartnersEffect = effect(() => {
    const summaries = this.conversations.orderedSummaries();
    const known = new Set(this.contacts().map(c => c.userId));
    for (const s of summaries) {
      if (known.has(s.partnerId)) continue;
      if (this.hydrating.has(s.partnerId)) continue;
      this.hydrating.add(s.partnerId);
      this.userApi.getById(s.partnerId).subscribe({
        next: res => {
          this.hydrating.delete(s.partnerId);
          if (res.success && res.data) {
            this.contacts.update(list =>
              list.some(c => c.userId === res.data.userId) ? list : [...list, res.data]
            );
          }
        },
        error: () => this.hydrating.delete(s.partnerId)
      });
    }
  });

  /**
   * Contacts tab — every active user except me, alphabetised.
   * Drives a "start a chat with anyone" UX even before any messages exist.
   */
  sidebarContacts = computed<UserProfileDto[]>(() =>
    [...this.contacts()].sort((a, b) =>
      (a.displayName || '').localeCompare(b.displayName || ''))
  );

  /**
   * Groups tab — joined rooms enriched with last-message preview + unread
   * count from RoomConversationStore. Sorted by last activity DESC so the
   * room with the newest message floats to the top, exactly like WhatsApp.
   * Rooms with no messages yet sink to the bottom (lastSentAt undefined ⇒ 0)
   * but stay visible so the user can open and start a conversation.
   */
  sidebarRooms = computed<SidebarRoom[]>(() => {
    const rooms = this.myRooms();
    // Touch the summaries signal so this computed re-runs whenever a SignalR
    // room message updates the store (sort order + unread + preview refresh).
    const summariesById = new Map(
      this.roomConversations.orderedSummaries().map(s => [s.roomId, s])
    );
    const rows: SidebarRoom[] = rooms.map(room => {
      const s = summariesById.get(room.roomId);
      return {
        room,
        lastMessage: s?.lastMessage,
        lastSenderName: s?.lastSenderName,
        lastSentAt: s?.lastSentAt,
        unread: s?.unreadCount ?? 0
      };
    });
    rows.sort((a, b) => {
      const ta = a.lastSentAt ? Date.parse(a.lastSentAt) : 0;
      const tb = b.lastSentAt ? Date.parse(b.lastSentAt) : 0;
      return tb - ta;
    });
    return rows;
  });

  unreadGroupTotal = computed(() => this.roomConversations.totalUnread());

  ngOnInit(): void {
    this.currentUser.set(this.auth.getCurrentUser());

    this.hub.connect().catch(err => console.error('Hub connect failed:', err));
    if (!this.notifHub.isConnected) this.notifHub.connect();

    this.loadContacts();
    this.loadOnlinePresence();
    this.loadMyRooms();
    this.loadNotifCount();
    this.conversations.refresh();

    this.hub.onlineUsers$.pipe(takeUntil(this.destroy$))
      .subscribe(ids => this.onlineUserIds.set(new Set(ids)));

    this.hub.userOnline$.pipe(takeUntil(this.destroy$)).subscribe(e => {
      const s = new Set(this.onlineUserIds()); s.add(e.userId); this.onlineUserIds.set(s);
    });
    this.hub.userOffline$.pipe(takeUntil(this.destroy$)).subscribe(e => {
      const s = new Set(this.onlineUserIds()); s.delete(e.userId); this.onlineUserIds.set(s);
    });

    // Whenever the SignalR hub confirms a room join (room-list create/join flow),
    // re-pull the rooms list so the new group surfaces in the sidebar instantly.
    this.hub.joinedRoom$.pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadMyRooms());

    // Belt-and-braces server reconcile on every incoming DM. The
    // ConversationStore already updates the map via `handleIncoming` for
    // instant UI feedback, but we also ask the server for the canonical
    // unreadCount + ordering so a missed wire event or a stale local count
    // can never leave the badge wrong. Debounced through `pendingRefresh`
    // so a flurry of messages still produces only one round-trip.
    this.hub.directMessage$.pipe(takeUntil(this.destroy$))
      .subscribe(msg => {
        const me = this.currentUser()?.userId;
        if (!me || msg.roomId) return;
        // Skip self-echoes — our own send already has authoritative state.
        if (msg.senderId === me) return;
        this.scheduleConversationRefresh();
      });

    // After a reconnect, refresh contacts + rooms so anything that changed while
    // the connection was down (new groups, deactivated users) is reflected.
    this.hub.reconnected$.pipe(takeUntil(this.destroy$))
      .subscribe(() => { this.loadContacts(); this.loadOnlinePresence(); this.loadMyRooms(); });

    this.searchInput$.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(q => this.performSearch(q));

    this.notifHub.unreadCount$.pipe(takeUntil(this.destroy$))
      .subscribe(count => this.notifCount.set(count));

    // Mobile back button inside chat headers fires this — bring the
    // contacts panel back into view without disturbing the route state.
    window.addEventListener('chat:back-to-list', this.handleMobileBack);
  }

  private handleMobileBack = (): void => {
    this.showContactsPanelMobile.set(true);
  };

  ngOnDestroy(): void {
    window.removeEventListener('chat:back-to-list', this.handleMobileBack);
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadContacts(): void {
    this.userApi.getAllActive().pipe(takeUntil(this.destroy$)).subscribe(res => {
      if (res.success) {
        const me = this.currentUser()?.userId;
        this.contacts.set(res.data.filter(u => u.userId !== me));
      }
    });
  }

  // Authoritative presence comes from the live SignalR PresenceService, NOT
  // the DB `isOnline` flag (which can be stale when a session ends uncleanly
  // — process kill, server restart, network drop without graceful disconnect).
  // We seed from /api/presence/online on init and let SignalR UserOnline /
  // UserOffline deltas refine the set from there.
  private loadOnlinePresence(): void {
    this.presenceApi.getOnlineUserIds().pipe(takeUntil(this.destroy$)).subscribe({
      next: res => { if (res.success) this.onlineUserIds.set(new Set(res.data)); },
      error: () => { /* presence endpoint unreachable — leave SignalR pushes to populate */ }
    });
  }

  loadMyRooms(): void {
    const userId = this.currentUser()?.userId;
    if (!userId) return;
    this.roomApi.getMyRooms(userId).pipe(takeUntil(this.destroy$))
      .subscribe(res => {
        if (!res.success) return;
        this.myRooms.set(res.data);
        // Seed an entry for every joined room so it appears in the sidebar
        // even before any messages arrive, then ask each room for its most
        // recent message to populate the preview + last-activity timestamp
        // used by the sort. Existing unread counters are preserved.
        for (const room of res.data) {
          this.roomConversations.ensureRoom(room.roomId);
          this.roomConversations.hydrateLastMessage(room.roomId);
        }
      });
  }

  loadNotifCount(): void {
    const userId = this.currentUser()?.userId;
    if (!userId) return;
    this.notifApi.getUnreadCount(userId).pipe(takeUntil(this.destroy$))
      .subscribe(res => { if (res.success) this.notifCount.set(res.data); });
  }

  onSearch(query: string): void {
    this.searchQuery.set(query);
    if (!query.trim()) { this.searchResults.set([]); return; }
    this.searchInput$.next(query);
  }

  performSearch(q: string): void {
    this.isSearching.set(true);
    this.userApi.search(q).pipe(takeUntil(this.destroy$)).subscribe(res => {
      this.isSearching.set(false);
      if (res.success) this.searchResults.set(res.data);
    });
  }

  openDirectChat(userId: number): void {
    this.activeContactId.set(userId);
    this.activeRoomId.set(null);
    this.showWelcome.set(false);
    this.showContactsPanelMobile.set(false);
    this.conversations.markRead(userId);
    this.router.navigate(['/dashboard/chat/direct', userId]);
  }

  openRoomChat(roomId: number): void {
    this.activeRoomId.set(roomId);
    this.activeContactId.set(null);
    this.showWelcome.set(false);
    this.showContactsPanelMobile.set(false);
    // Reset unread badge instantly + tell the store this room is active so
    // any SignalR messages that land while it's open don't bump the counter.
    this.roomConversations.markRead(roomId);
    this.hub.joinRoom(roomId);
    this.router.navigate(['/dashboard/chat/room', roomId]);
  }

  // Mobile back arrow handler — surfaced from chat-view via a click on the
  // header back button. On desktop the CSS hides this button entirely.
  showContactsPanel(): void {
    this.showContactsPanelMobile.set(true);
  }

  // Debounced server-state reconcile. Multiple incoming DMs in quick
  // succession only generate one refresh round-trip.
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private scheduleConversationRefresh(): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.conversations.refresh(), 250);
  }

  isOnline(userId: number): boolean { return this.onlineUserIds().has(userId); }
  getRoomInitial(name: string): string { return name.charAt(0).toUpperCase(); }

  logout(): void {
    this.hub.disconnect();
    this.conversations.clear();
    this.roomConversations.clear();
    this.auth.logout();
  }
}
