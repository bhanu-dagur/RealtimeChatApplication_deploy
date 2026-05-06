import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationApiService } from '../../../core/http/notification-api.service';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import {
  Notification,
  NotificationType
} from '../../../shared/models/notification.model';

@Component({
  selector: 'app-notification-list',
  standalone: true,
  imports: [CommonModule, TimeAgoPipe],
  templateUrl: './notification-list.component.html',
  styleUrls: ['./notification-list.component.scss']
})
export class NotificationListComponent implements OnInit {
  private auth = inject(AuthService);
  private notifApi = inject(NotificationApiService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  notifications = signal<Notification[]>([]);
  isLoading = signal(false);
  NotifType = NotificationType;

  get unreadCount(): number {
    return this.notifications().filter(n => !n.isRead).length;
  }

  ngOnInit(): void {
    this.loadNotifications();
  }

  loadNotifications(): void {
    const userId = this.auth.getCurrentUser()?.userId;
    if (!userId) return;

    this.isLoading.set(true);
    this.notifApi.getByRecipient(userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(res => {
        this.isLoading.set(false);
        if (res.success) this.notifications.set(res.data);
      });
  }

  markRead(notif: Notification): void {
    if (notif.isRead) return;
    this.notifApi.markAsRead(notif.notificationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(res => {
        if (res.success) {
          this.notifications.update(list =>
            list.map(n =>
              n.notificationId === notif.notificationId
                ? { ...n, isRead: true }
                : n
            )
          );
        }
      });
  }

  markAllRead(): void {
    const userId = this.auth.getCurrentUser()?.userId;
    if (!userId) return;
    this.notifApi.markAllRead(userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(res => {
        if (res.success) {
          this.notifications.update(list =>
            list.map(n => ({ ...n, isRead: true }))
          );
        }
      });
  }

  getIcon(type: NotificationType): string {
    const map: Record<NotificationType, string> = {
      [NotificationType.MESSAGE]: '💬',
      [NotificationType.MENTION]: '🔔',
      [NotificationType.ROOM_INVITE]: '🏠',
      [NotificationType.ROLE_CHANGE]: '👑',
      [NotificationType.PLATFORM]: '📢'
    };
    return map[type] ?? '🔔';
  }

  getIconBg(type: NotificationType): string {
    const map: Record<NotificationType, string> = {
      [NotificationType.MESSAGE]: 'rgba(74,159,165,0.12)',
      [NotificationType.MENTION]: 'rgba(239,68,68,0.12)',
      [NotificationType.ROOM_INVITE]: 'rgba(245,158,11,0.12)',
      [NotificationType.ROLE_CHANGE]: 'rgba(139,92,246,0.12)',
      [NotificationType.PLATFORM]: 'rgba(107,114,128,0.12)'
    };
    return map[type] ?? 'rgba(107,114,128,0.12)';
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}