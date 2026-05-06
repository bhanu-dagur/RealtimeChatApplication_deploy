import { Injectable, inject } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

export interface RealtimeNotification {
    notification: {
        notificationId: number;
        type: string;
        title: string;
        message: string;
        isRead: boolean;
        sentAt: string;
    };
    unreadCount: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationHubService {
    private auth = inject(AuthService);
    private connection!: signalR.HubConnection;
    private handlersRegistered = false;  // 🔥 PREVENT DUPLICATE HANDLERS

    // ── Observables ────────────────────────────────────────────
    notification$ = new Subject<RealtimeNotification>();
    broadcast$ = new Subject<{ title: string; message: string; sentAt: string }>();
    unreadCount$ = new BehaviorSubject<number>(0);

    isConnected = false;

    // ── Connect ────────────────────────────────────────────────
    connect(): void {
        const token = this.auth.getToken();
        if (!token) return;

        // 🔥 FIX: Check if already connected or connection is in progress
        if (this.isConnected || (this.connection &&
            (this.connection.state === signalR.HubConnectionState.Connected ||
                this.connection.state === signalR.HubConnectionState.Connecting))) {
            return;
        }

        this.connection = new signalR.HubConnectionBuilder()
            .withUrl(`${environment.notificationHubUrl}/hubs/notifications`, {
                accessTokenFactory: () => token
            })
            .withAutomaticReconnect([0, 2000, 5000, 10000])
            .configureLogging(signalR.LogLevel.Warning)
            .build();

        // 🔥 FIX: Reset handlers flag before registering
        this.handlersRegistered = false;
        this.registerHandlers();

        this.connection.start()
            .then(() => {
                this.isConnected = true;
                console.log('NotificationHub connected');
            })
            .catch(err => {
                this.isConnected = false;
                console.error('NotificationHub error:', err);
            });

        // Handle reconnection
        this.connection.onreconnected(() => {
            this.isConnected = true;
            console.log('NotificationHub reconnected');
        });

        this.connection.onclose(() => {
            this.isConnected = false;
        });
    }

    // ── Disconnect ─────────────────────────────────────────────
    disconnect(): void {
        this.connection?.stop();
        this.isConnected = false;
        this.unreadCount$.next(0);
    }

    // ── Update badge count manually ────────────────────────────
    setUnreadCount(count: number): void {
        this.unreadCount$.next(count);
    }

    // ── Register Handlers ──────────────────────────────────────
    private registerHandlers(): void {
        // 🔥 FIX: Prevent duplicate handler registration
        if (this.handlersRegistered) {
            console.warn('Notification handlers already registered, skipping...');
            return;
        }

        // New notification received
        this.connection.on('ReceiveNotification', (data: RealtimeNotification) => {
            this.notification$.next(data);
            this.unreadCount$.next(data.unreadCount);
        });

        // Admin broadcast
        this.connection.on('ReceiveBroadcast', (data: {
            title: string;
            message: string;
            sentAt: string;
        }) => {
            this.broadcast$.next(data);
        });

        // Badge count update only
        this.connection.on('NotificationCount', (count: number) => {
            this.unreadCount$.next(count);
        });

        // 🔥 FIX: Mark handlers as registered
        this.handlersRegistered = true;
    }
}