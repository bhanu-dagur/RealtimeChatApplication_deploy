import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../shared/models/api-response.model';
import { ChatRoom, RoomMember, RoomType } from '../../shared/models/room.model';

@Injectable({ providedIn: 'root' })
export class RoomApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/rooms`;

  getPublicRooms(): Observable<ApiResponse<ChatRoom[]>> {
    return this.http.get<ApiResponse<ChatRoom[]>>(`${this.base}/public`);
  }

  getMyRooms(userId: number): Observable<ApiResponse<ChatRoom[]>> {
    return this.http.get<ApiResponse<ChatRoom[]>>(`${this.base}/user/${userId}`);
  }

  getRoomById(roomId: number): Observable<ApiResponse<ChatRoom>> {
    return this.http.get<ApiResponse<ChatRoom>>(`${this.base}/${roomId}`);
  }

  getMembers(roomId: number): Observable<ApiResponse<RoomMember[]>> {
    return this.http.get<ApiResponse<RoomMember[]>>(`${this.base}/${roomId}/members`);
  }

  createRoom(dto: {
    roomName: string;
    description?: string;
    roomType: RoomType;
    createdBy: number;
    initialMemberIds?: number[];
  }): Observable<ApiResponse<ChatRoom>> {
    return this.http.post<ApiResponse<ChatRoom>>(`${this.base}/create`, dto);
  }

  updateMemberRole(roomId: number, userId: number, newRole: 'ADMIN' | 'MEMBER' | 'MODERATOR'):
    Observable<ApiResponse<RoomMember>> {
    return this.http.put<ApiResponse<RoomMember>>(
      `${this.base}/members/role`, { roomId, userId, newRole }
    );
  }

  joinRoom(roomId: number, userId: number): Observable<ApiResponse<RoomMember>> {
    return this.http.post<ApiResponse<RoomMember>>(
      `${this.base}/members/add`, { roomId, userId }
    );
  }

  leaveRoom(roomId: number, userId: number): Observable<ApiResponse<string>> {
    return this.http.delete<ApiResponse<string>>(
      `${this.base}/${roomId}/leave/${userId}`
    );
  }

  deleteRoom(roomId: number): Observable<ApiResponse<string>> {
    return this.http.delete<ApiResponse<string>>(`${this.base}/${roomId}`);
  }

  updateRoom(roomId: number, dto: {
    roomName?: string;
    description?: string;
  }): Observable<ApiResponse<ChatRoom>> {
    return this.http.put<ApiResponse<ChatRoom>>(`${this.base}/${roomId}`, dto);
  }

  removeMember(roomId: number, userId: number): Observable<ApiResponse<string>> {
    return this.http.delete<ApiResponse<string>>(
      `${this.base}/${roomId}/members/${userId}/remove`
    );
  }

  isMember(roomId: number, userId: number): Observable<ApiResponse<boolean>> {
    return this.http.get<ApiResponse<boolean>>(
      `${this.base}/${roomId}/ismember/${userId}`
    );
  }
}