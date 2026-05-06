export enum NotificationType {
  MESSAGE = 'MESSAGE',
  MENTION = 'MENTION',
  ROOM_INVITE = 'ROOM_INVITE',
  ROLE_CHANGE = 'ROLE_CHANGE',
  PLATFORM = 'PLATFORM'
}

export interface Notification {
  notificationId: number;
  recipientId: number;
  senderId?: number;
  type: NotificationType;
  title: string;
  message: string;
  relatedId?: number;
  isRead: boolean;
  sentAt: string;
  readAt?: string;
}