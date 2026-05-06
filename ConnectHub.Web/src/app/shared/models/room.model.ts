export enum RoomType {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
  DIRECT = 'DIRECT'
}

export enum MemberRole {
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
  MEMBER = 'MEMBER'
}

export interface ChatRoom {
  roomId: number;
  roomName: string;
  description?: string;
  roomType: RoomType;
  avatarUrl?: string;
  createdBy: number;
  createdAt: string;
  maxMembers: number;
  memberCount: number;
}

export interface RoomMember {
  memberId: number;
  roomId: number;
  userId: number;
  role: MemberRole;
  joinedAt: string;

  // Stitched in client-side after fetching from /api/users/{id}.
  // Not present on the wire from /api/rooms/{id}/members.
  displayName?: string;
  userName?: string;
  avatarUrl?: string;
  isOnline?: boolean;
}