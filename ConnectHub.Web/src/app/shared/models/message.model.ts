export enum MessageType {
  TEXT = 0,
  IMAGE = 1,
  FILE = 2,
  AUDIO = 3
}

export interface Message {
  messageId: number;
  senderId: number;
  senderName?: string;
  receiverId?: number;
  roomId?: number;
  content: string;
  messageType: MessageType;
  isRead: boolean;
  isDelivered?: boolean;
  isEdited: boolean;
  isDeleted?: boolean;
  sentAt: string;
  deliveredAt?: string;
  readAt?: string;
  editedAt?: string;
  mediaUrl?: string;
  replyToMessageId?: number;
  // Local-only flag set when the API returns the saved row but SignalR hasn't yet
  // confirmed delivery. Drives the single grey ✓ on the sender's bubble.
  pending?: boolean;
}

export interface SendMessageDto {
  senderId: number;
  receiverId?: number;
  roomId?: number;
  content: string;
  messageType: MessageType;
  mediaUrl?: string;
  replyToMessageId?: number;
}