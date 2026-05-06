import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { RoomApiService } from '../../../core/http/room-api.service';
import { UserApiService } from '../../../core/http/user-api.service';
import { ChatHubService } from '../../../core/signalr/chat-hub.service';
import { ChatRoom, RoomType } from '../../../shared/models/room.model';
import { AuthResponse, UserProfileDto } from '../../../shared/models/user.model';

@Component({
    selector: 'app-room-list',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './room-list.component.html',
    styleUrls: ['./room-list.component.scss']
})
export class RoomListComponent implements OnInit, OnDestroy {
    private auth = inject(AuthService);
    private roomApi = inject(RoomApiService);
    private userApi = inject(UserApiService);
    private hub = inject(ChatHubService);
    private router = inject(Router);
    private destroy$ = new Subject<void>();
    private search$ = new Subject<string>();

    currentUser = signal<AuthResponse | null>(null);
    publicRooms = signal<ChatRoom[]>([]);
    myRooms = signal<ChatRoom[]>([]);
    filtered = signal<ChatRoom[]>([]);
    isLoading = signal(false);
    isJoining = signal<number | null>(null);
    showCreate = signal(false);
    activeTab = signal<'discover' | 'my'>('discover');
    searchQuery = signal('');

    // Create room form
    newRoom = {
        roomName: '',
        description: '',
        roomType: RoomType.PUBLIC
    };
    isCreating = signal(false);
    createError = signal('');

    // Member picker state inside the create-room modal
    contactPool = signal<UserProfileDto[]>([]);
    contactQuery = signal('');
    selectedMemberIds = signal<Set<number>>(new Set());
    contactsLoaded = signal(false);

    filteredContacts = signal<UserProfileDto[]>([]);

    RoomType = RoomType;

    ngOnInit(): void {
        this.currentUser.set(this.auth.getCurrentUser());
        this.loadPublicRooms();
        this.loadMyRooms();

        // Search debounce
        this.search$
            .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
            .subscribe(q => this.applyFilter(q));
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ── Load Data ──────────────────────────────────────────────
    loadPublicRooms(): void {
        this.isLoading.set(true);
        this.roomApi.getPublicRooms()
            .pipe(takeUntil(this.destroy$))
            .subscribe(res => {
                this.isLoading.set(false);
                if (res.success) {
                    this.publicRooms.set(res.data);
                    this.filtered.set(res.data);
                }
            });
    }

    loadMyRooms(): void {
        const userId = this.currentUser()?.userId;
        if (!userId) return;
        this.roomApi.getMyRooms(userId)
            .pipe(takeUntil(this.destroy$))
            .subscribe(res => { if (res.success) this.myRooms.set(res.data); });
    }

    // ── Search ─────────────────────────────────────────────────
    onSearch(query: string): void {
        this.searchQuery.set(query);
        this.search$.next(query);
    }

    applyFilter(q: string): void {
        const source = this.activeTab() === 'discover'
            ? this.publicRooms()
            : this.myRooms();

        if (!q.trim()) {
            this.filtered.set(source);
            return;
        }

        const lower = q.toLowerCase();
        this.filtered.set(
            source.filter(r =>
                r.roomName.toLowerCase().includes(lower) ||
                r.description?.toLowerCase().includes(lower)
            )
        );
    }

    // ── Tab Switch ─────────────────────────────────────────────
    switchTab(tab: 'discover' | 'my'): void {
        this.activeTab.set(tab);
        this.searchQuery.set('');
        this.filtered.set(tab === 'discover' ? this.publicRooms() : this.myRooms());
    }

    // ── Join Room ──────────────────────────────────────────────
    joinRoom(room: ChatRoom): void {
        const userId = this.currentUser()?.userId;
        if (!userId) return;

        // Already member → open chat
        if (this.isMyRoom(room.roomId)) {
            this.openRoom(room.roomId);
            return;
        }

        this.isJoining.set(room.roomId);
        this.roomApi.joinRoom(room.roomId, userId)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: res => {
                    this.isJoining.set(null);
                    if (res.success) {
                        this.hub.joinRoom(room.roomId);
                        this.myRooms.update(r => [...r, room]);
                        this.openRoom(room.roomId);
                    }
                },
                error: () => this.isJoining.set(null)
            });
    }

    openRoom(roomId: number): void {
        this.router.navigate(['/dashboard/chat/room', roomId]);
    }

    isMyRoom(roomId: number): boolean {
        return this.myRooms().some(r => r.roomId === roomId);
    }

    // ── Create Room ────────────────────────────────────────────
    createRoom(): void {
        if (!this.newRoom.roomName.trim()) {
            this.createError.set('Room name is required');
            return;
        }

        const userId = this.currentUser()?.userId;
        if (!userId) return;

        this.isCreating.set(true);
        this.createError.set('');

        this.roomApi.createRoom({
            roomName: this.newRoom.roomName,
            description: this.newRoom.description,
            roomType: this.newRoom.roomType,
            createdBy: userId,
            initialMemberIds: Array.from(this.selectedMemberIds())
        }).pipe(takeUntil(this.destroy$))
            .subscribe({
                next: res => {
                    this.isCreating.set(false);
                    if (res.success) {
                        this.showCreate.set(false);
                        this.myRooms.update(r => [...r, res.data]);
                        if (this.newRoom.roomType === RoomType.PUBLIC) {
                            this.publicRooms.update(r => [...r, res.data]);
                            this.filtered.update(r => [...r, res.data]);
                        }
                        // Reset form
                        this.newRoom = { roomName: '', description: '', roomType: RoomType.PUBLIC };
                        this.hub.joinRoom(res.data.roomId);
                        this.openRoom(res.data.roomId);
                    }
                },
                error: err => {
                    this.isCreating.set(false);
                    this.createError.set(err.error?.message ?? 'Failed to create room');
                }
            });
    }

    closeCreate(): void {
        this.showCreate.set(false);
        this.createError.set('');
        this.newRoom = { roomName: '', description: '', roomType: RoomType.PUBLIC };
        this.selectedMemberIds.set(new Set());
        this.contactQuery.set('');
        this.filteredContacts.set(this.contactPool());
    }

    openCreate(): void {
        this.showCreate.set(true);
        if (!this.contactsLoaded()) this.loadContactsForPicker();
    }

    private loadContactsForPicker(): void {
        const me = this.currentUser()?.userId;
        this.userApi.getAllActive()
            .pipe(takeUntil(this.destroy$))
            .subscribe(res => {
                if (!res.success) return;
                const others = res.data.filter(u => u.userId !== me);
                this.contactPool.set(others);
                this.filteredContacts.set(others);
                this.contactsLoaded.set(true);
            });
    }

    onContactQuery(q: string): void {
        this.contactQuery.set(q);
        const lower = q.trim().toLowerCase();
        if (!lower) { this.filteredContacts.set(this.contactPool()); return; }
        this.filteredContacts.set(
            this.contactPool().filter(u =>
                u.displayName?.toLowerCase().includes(lower) ||
                u.userName?.toLowerCase().includes(lower) ||
                u.email?.toLowerCase().includes(lower)
            )
        );
    }

    toggleMember(userId: number): void {
        this.selectedMemberIds.update(s => {
            const next = new Set(s);
            if (next.has(userId)) next.delete(userId); else next.add(userId);
            return next;
        });
    }

    isMemberSelected(userId: number): boolean {
        return this.selectedMemberIds().has(userId);
    }

    // Picks a deterministic pastel background per user so the lettered avatar in the
    // create-room picker matches the look in the screenshot (same user → same color).
    avatarBgFor(name: string | null | undefined): string {
        const palette = ['#fde2e0', '#dbe7ff', '#dff5e1', '#fff1d6', '#ead6ff', '#d6f1f4', '#ffe0ec'];
        const s = name ?? '';
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return palette[h % palette.length];
    }

    getRoomInitial(name: string): string {
        return name?.charAt(0).toUpperCase() ?? '#';
    }

    goBack(): void {
        this.router.navigate(['/dashboard']);
    }
}