// Matches ConnectHub.Auth.API DTOs exactly

export interface LoginDto {
  email: string;
  password: string;
}

export interface GoogleLoginDto {
  idToken: string;
}

export interface RegisterDto {
  userName: string;
  displayName: string;
  email: string;
  password: string;
  bio?: string;
}

export interface AuthResponse {
  userId: number;
  userName: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  token: string;
  tokenExpiry: string;
}

export interface UserProfileDto {
  userId: number;
  userName: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  bio?: string;
  isOnline: boolean;
  lastSeen?: string;
  createdAt: string;
}