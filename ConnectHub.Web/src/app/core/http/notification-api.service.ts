import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../shared/models/api-response.model';
import { Notification } from '../../shared/models/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/notifications`;

  getByRecipient(recipientId: number): Observable<ApiResponse<Notification[]>> {
    return this.http.get<ApiResponse<Notification[]>>(`${this.base}/recipient/${recipientId}`);
  }

  getUnreadCount(recipientId: number): Observable<ApiResponse<number>> {
    return this.http.get<ApiResponse<number>>(`${this.base}/unread/${recipientId}/count`);
  }

  markAsRead(notificationId: number): Observable<ApiResponse<Notification>> {
    return this.http.put<ApiResponse<Notification>>(`${this.base}/${notificationId}/read`, {});
  }

  markAllRead(recipientId: number): Observable<ApiResponse<string>> {
    return this.http.put<ApiResponse<string>>(`${this.base}/read-all/${recipientId}`, {});
  }
}