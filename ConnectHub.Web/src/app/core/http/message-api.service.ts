import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, PagedResult } from '../../shared/models/api-response.model';
import { Message, SendMessageDto } from '../../shared/models/message.model';

@Injectable({ providedIn: 'root' })
export class MessageApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/messages`;

  getDirectMessages(userId1: number, userId2: number, page = 1, pageSize = 20): Observable<ApiResponse<PagedResult<Message>>> {
    return this.http.get<ApiResponse<PagedResult<Message>>>(
      `${this.base}/direct?userId1=${userId1}&userId2=${userId2}&page=${page}&pageSize=${pageSize}`
    );
  }

  getRoomMessages(roomId: number, page = 1, pageSize = 20): Observable<ApiResponse<PagedResult<Message>>> {
    return this.http.get<ApiResponse<PagedResult<Message>>>(
      `${this.base}/room/${roomId}?page=${page}&pageSize=${pageSize}`
    );
  }

  getUnreadCount(receiverId: number): Observable<ApiResponse<number>> {
    return this.http.get<ApiResponse<number>>(`${this.base}/unread/${receiverId}/count`);
  }

  // Returns the count of rows actually flipped to IsRead=true. Callers can
  // suppress the SignalR BroadcastMessagesRead fan-out when count === 0
  // (everything was already read on the server).
  markRead(senderId: number, receiverId: number): Observable<ApiResponse<number>> {
    return this.http.put<ApiResponse<number>>(
      `${this.base}/mark-read?senderId=${senderId}&receiverId=${receiverId}`, {}
    );
  }

  sendMessage(dto: SendMessageDto): Observable<ApiResponse<Message>> {
    return this.http.post<ApiResponse<Message>>(`${this.base}/send`, dto);
  }

  // "Delete for everyone" — soft-deletes server-side, broadcast updates all peers.
  deleteMessage(messageId: number): Observable<ApiResponse<string>> {
    return this.http.delete<ApiResponse<string>>(`${this.base}/${messageId}`);
  }

  // "Delete for me" — hides the row only for the current user; no SignalR broadcast.
  deleteMessageForMe(messageId: number, userId: number): Observable<ApiResponse<string>> {
    return this.http.delete<ApiResponse<string>>(
      `${this.base}/${messageId}/for-me?userId=${userId}`
    );
  }

  markDelivered(messageId: number, recipientId: number): Observable<ApiResponse<Message>> {
    return this.http.put<ApiResponse<Message>>(
      `${this.base}/${messageId}/delivered?recipientId=${recipientId}`, {}
    );
  }

  // Returns the list of messages the server just flipped to IsDelivered=true.
  // The caller is expected to fan out a SignalR BroadcastMessageDelivered for
  // each entry so the senders' ✓ ticks flip ✓✓ in real time — without this
  // fan-out the server-side flag change is invisible to the senders until
  // they reload from DB.
  markAllDelivered(recipientId: number): Observable<ApiResponse<DeliveredMessageDto[]>> {
    return this.http.put<ApiResponse<DeliveredMessageDto[]>>(
      `${this.base}/mark-all-delivered?recipientId=${recipientId}`, {}
    );
  }

  editMessage(messageId: number, content: string): Observable<ApiResponse<Message>> {
    return this.http.put<ApiResponse<Message>>(`${this.base}/${messageId}/edit`, { content });
  }

  searchMessages(userId: number, keyword: string): Observable<ApiResponse<Message[]>> {
    return this.http.get<ApiResponse<Message[]>>(
      `${this.base}/search?userId=${encodeURIComponent(userId)}&keyword=${encodeURIComponent(keyword)}`
    );
  }

  searchRoomMessages(roomId: number, keyword: string): Observable<ApiResponse<Message[]>> {
    return this.http.get<ApiResponse<Message[]>>(
      `${this.base}/search/room/${roomId}?keyword=${encodeURIComponent(keyword)}`
    );
  }

  getRecentConversations(userId: number): Observable<ApiResponse<ConversationSummary[]>> {
    return this.http.get<ApiResponse<ConversationSummary[]>>(`${this.base}/recent/${userId}`);
  }
}

export interface ConversationSummary {
  partnerId: number;
  lastMessageId?: number;
  lastMessage?: string;
  lastMessageType: number;
  lastSenderId?: number;
  lastSentAt?: string; // UTC ISO
  unreadCount: number;
}

// Mirrors ConnectHub.Message.API.Services.DeliveredMessageDto. One row per
// message the server just flipped to IsDelivered=true; the recipient's client
// fan-outs one SignalR BroadcastMessageDelivered per row so each sender's ✓
// flips to ✓✓ without a page reload.
export interface DeliveredMessageDto {
  messageId: number;
  senderId: number;
  deliveredAt: string; // UTC ISO
}
