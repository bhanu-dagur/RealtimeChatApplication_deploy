import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { adminGuard } from './core/auth/admin.guard';


export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },

  // ── Auth ──────────────────────────────────────────────────
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component')
        .then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/register/register.component')
        .then(m => m.RegisterComponent)
  },

  // ── Dashboard (main shell with chat children) ─────────────
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component')
        .then(m => m.DashboardComponent),
    children: [
      {
        path: 'chat/direct/:userId',
        loadComponent: () =>
          import('./features/chat/direct-chat/direct-chat.component')
            .then(m => m.DirectChatComponent)
      },
      {
        path: 'chat/room/:roomId',
        loadComponent: () =>
          import('./features/chat/room-chat/room-chat.component')
            .then(m => m.RoomChatComponent)
      }
    ]
  },

  // ── Rooms ─────────────────────────────────────────────────
  {
    path: 'rooms',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/rooms/room-list/room-list.component')
        .then(m => m.RoomListComponent)
  },

  // ── Notifications ─────────────────────────────────────────
  {
    path: 'notifications',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/notifications/notification-list/notification-list.component')
        .then(m => m.NotificationListComponent)
  },

  // ── Profile ───────────────────────────────────────────────
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/profile/profile.component')
        .then(m => m.ProfileComponent)
  },

  // ── Admin Panel ───────────────────────────────────────────
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/admin-layout/admin-layout')
        .then(m => m.AdminLayoutComponent),
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/admin/admin-dashboard/admin-dashboard')
            .then(m => m.AdminDashboardComponent)
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/admin/manage-users/manage-users')
            .then(m => m.ManageUsersComponent)
      },
      {
        path: 'rooms',
        loadComponent: () =>
          import('./features/admin/manage-rooms/manage-rooms')
            .then(m => m.ManageRoomsComponent)
      },
      {
        path: 'messages',
        loadComponent: () =>
          import('./features/admin/manage-messages/manage-messages')
            .then(m => m.ManageMessagesComponent)
      }
    ]
  },

  { path: '**', redirectTo: '/login' }
];
