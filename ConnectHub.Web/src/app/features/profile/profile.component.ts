import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { UserApiService } from '../../core/http/user-api.service';
import { ChatHubService } from '../../core/signalr/chat-hub.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { UserProfileDto, AuthResponse } from '../../shared/models/user.model';

@Component({
    selector: 'app-profile',
    standalone: true,
    imports: [CommonModule, FormsModule, AvatarComponent],
    templateUrl: './profile.component.html',
    styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit, OnDestroy {
    private auth = inject(AuthService);
    private userApi = inject(UserApiService);
    private hub = inject(ChatHubService);
    private router = inject(Router);
    private toast = inject(ToastService);
    private destroy$ = new Subject<void>();

    currentUser = signal<AuthResponse | null>(null);
    profile = signal<UserProfileDto | null>(null);
    isLoading = signal(false);
    isSaving = signal(false);
    saveSuccess = signal(false);
    saveError = signal('');
    activeTab = signal<'profile' | 'security' | 'notifications' | 'privacy'>('profile');

    // Profile form
    displayName = '';
    bio = '';

    // Password form
    oldPassword = '';
    newPassword = '';
    confirmPassword = '';
    isChangingPassword = signal(false);
    passwordSuccess = signal(false);
    passwordError = signal('');

    // Settings toggles (UI-only — not persisted server-side yet)
    notifDM = signal(true);
    notifRooms = signal(true);
    notifMentions = signal(true);
    notifEmail = signal(false);
    notifSound = signal(true);
    showOnline = signal(true);
    readReceipts = signal(true);
    showLastSeen = signal(false);

    ngOnInit(): void {
        this.currentUser.set(this.auth.getCurrentUser());
        this.loadProfile();
    }

    loadProfile(): void {
        const userId = this.currentUser()?.userId;
        if (!userId) return;

        this.isLoading.set(true);
        this.userApi.getById(userId)
            .pipe(takeUntil(this.destroy$))
            .subscribe(res => {
                this.isLoading.set(false);
                if (res.success) {
                    this.profile.set(res.data);
                    this.displayName = res.data.displayName;
                    this.bio = res.data.bio ?? '';
                }
            });
    }

    saveProfile(): void {
        const userId = this.currentUser()?.userId;
        if (!userId) return;

        const dn = this.displayName.trim();
        if (!dn) {
            this.saveError.set('Display name cannot be empty.');
            return;
        }
        if (dn.length > 100) {
            this.saveError.set('Display name must be 100 characters or fewer.');
            return;
        }
        if (this.bio.length > 300) {
            this.saveError.set('Bio must be 300 characters or fewer.');
            return;
        }

        this.saveError.set('');
        this.isSaving.set(true);

        this.userApi.updateProfile(userId, {
            displayName: dn,
            bio: this.bio.trim() || undefined
        })
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: res => {
                    this.isSaving.set(false);
                    if (res.success && res.data) {
                        this.profile.set(res.data);
                        // Refresh the cached AuthResponse so other tabs see the new displayName.
                        const cur = this.currentUser();
                        if (cur) {
                            const updated = { ...cur, displayName: res.data.displayName };
                            localStorage.setItem('ch_user', JSON.stringify(updated));
                            this.currentUser.set(updated);
                        }
                        this.saveSuccess.set(true);
                        this.toast.success('Profile saved');
                        setTimeout(() => this.saveSuccess.set(false), 3000);
                    } else {
                        this.saveError.set(res.message ?? 'Could not save profile.');
                    }
                },
                error: err => {
                    this.isSaving.set(false);
                    this.saveError.set(err?.error?.message ?? 'Network error. Please try again.');
                }
            });
    }

    changePassword(): void {
        const userId = this.currentUser()?.userId;
        if (!userId) return;

        this.passwordError.set('');
        this.passwordSuccess.set(false);

        if (!this.oldPassword) {
            this.passwordError.set('Current password is required.');
            return;
        }
        if (!this.newPassword || this.newPassword.length < 6) {
            this.passwordError.set('New password must be at least 6 characters.');
            return;
        }
        if (this.newPassword !== this.confirmPassword) {
            this.passwordError.set('New password and confirmation do not match.');
            return;
        }
        if (this.oldPassword === this.newPassword) {
            this.passwordError.set('New password must differ from the current one.');
            return;
        }

        this.isChangingPassword.set(true);
        this.userApi.changePassword(userId, {
            oldPassword: this.oldPassword,
            newPassword: this.newPassword
        })
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: res => {
                    this.isChangingPassword.set(false);
                    if (res.success) {
                        this.passwordSuccess.set(true);
                        this.oldPassword = this.newPassword = this.confirmPassword = '';
                        this.toast.success('Password changed');
                        setTimeout(() => this.passwordSuccess.set(false), 3000);
                    } else {
                        this.passwordError.set(res.message ?? 'Could not change password.');
                    }
                },
                error: err => {
                    this.isChangingPassword.set(false);
                    this.passwordError.set(err?.error?.message ?? 'Old password is incorrect or network error.');
                }
            });
    }

    logout(): void {
        this.hub.disconnect();
        this.auth.logout();
    }

    goBack(): void {
        this.router.navigate(['/dashboard']);
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }
}
