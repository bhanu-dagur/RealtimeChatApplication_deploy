import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, PagedResult } from '../../shared/models/api-response.model';
import { UserProfileDto } from '../../shared/models/user.model';
import { ChatRoom } from '../../shared/models/room.model';
import { Message } from '../../shared/models/message.model';

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private http = inject(HttpClient);
  private authBase = `${environment.apiUrl}/api/users/admin`;
  private roomBase = `${environment.apiUrl}/api/rooms/admin`;
  private msgBase = `${environment.apiUrl}/api/messages/admin`;

  // ── Users ──────────────────────────────────────────────────────────
  getAllUsers(): Observable<ApiResponse<UserProfileDto[]>> {
    return this.http.get<ApiResponse<UserProfileDto[]>>(`${this.authBase}/users`);
  }

  suspendUser(userId: number): Observable<ApiResponse<string>> {
    return this.http.put<ApiResponse<string>>(`${this.authBase}/users/${userId}/suspend`, {});
  }

  deleteUser(userId: number): Observable<ApiResponse<string>> {
    return this.http.delete<ApiResponse<string>>(`${this.authBase}/users/${userId}`);
  }

  getUserAnalytics(): Observable<ApiResponse<number>> {
    return this.http.get<ApiResponse<number>>(`${this.authBase}/analytics/users`);
  }

  // ── Rooms ──────────────────────────────────────────────────────────
  getAllRooms(): Observable<ApiResponse<ChatRoom[]>> {
    return this.http.get<ApiResponse<ChatRoom[]>>(`${this.roomBase}/rooms`);
  }

  deleteRoom(roomId: number): Observable<ApiResponse<string>> {
    return this.http.delete<ApiResponse<string>>(`${this.roomBase}/rooms/${roomId}`);
  }

  getRoomAnalytics(): Observable<ApiResponse<number>> {
    return this.http.get<ApiResponse<number>>(`${this.roomBase}/analytics/rooms`);
  }

  // ── Messages ───────────────────────────────────────────────────────
  getAllMessages(page: number = 1, pageSize: number = 50): Observable<ApiResponse<PagedResult<Message>>> {
    return this.http.get<ApiResponse<PagedResult<Message>>>(`${this.msgBase}/messages?page=${page}&pageSize=${pageSize}`);
  }

  deleteMessage(messageId: number): Observable<ApiResponse<string>> {
    return this.http.delete<ApiResponse<string>>(`${this.msgBase}/messages/${messageId}`);
  }

  getMessageAnalytics(): Observable<ApiResponse<number>> {
    return this.http.get<ApiResponse<number>>(`${this.msgBase}/analytics/messages`);
  }
}
