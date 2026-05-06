// import { Component } from '@angular/core';
// import { RouterOutlet } from '@angular/router';

// @Component({
//   selector: 'app-root',
//   standalone: true,
//   imports: [RouterOutlet],
//   template: `<router-outlet />`
// })
// export class AppComponent { }


import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ToastComponent } from './shared/components/toast/toast.component';
import { ToastService } from './shared/components/toast/toast.service';
import { NotificationHubService } from './core/signalr/notification-hub.service';
import { ChatHubService } from './core/signalr/chat-hub.service';
import { ConversationStore } from './core/store/conversation.store';
import { AuthService } from './core/auth/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastComponent],
  template: `
    <router-outlet />
    <app-toast />
  `
})
export class AppComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private notifHub = inject(NotificationHubService);
  private chatHub = inject(ChatHubService);
  private conversations = inject(ConversationStore);
  private toastSvc = inject(ToastService);
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    // If already logged in, connect both hubs at boot. This is what makes the
    // user appear "online" to others the moment they load the app — without
    // it, presence only kicked in when they navigated to /dashboard.
    if (this.auth.isLoggedIn()) {
      this.notifHub.connect();
      this.chatHub.connect().catch(err => console.error('[boot] chat hub connect failed', err));
      // Seed the sidebar so the chat list is ordered by last-message-time the
      // instant the dashboard renders. Without this we'd flash "no chats" then
      // the list would pop in.
      this.conversations.refresh();
      this.listenToNotifications();
    }
  }

  listenToNotifications(): void {
    // Show toast on new notification
    this.notifHub.notification$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.toastSvc.info(
          data.notification.title,
          data.notification.message
        );
      });

    // Show toast on broadcast
    this.notifHub.broadcast$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.toastSvc.info(data.title, data.message);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}