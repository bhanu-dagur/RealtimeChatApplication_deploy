import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../shared/models/api-response.model';
import { UserProfileDto } from '../../shared/models/user.model';

export interface UpdateProfileDto {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
}

export interface ChangePasswordDto {
  oldPassword: string;
  newPassword: string;
}

@Injectable({ providedIn: 'root' })
export class UserApiService {
  private http = inject(HttpClient);
  private readonly base = `${environment.authApiUrl}/api/users`;

  getById(userId: number): Observable<ApiResponse<UserProfileDto>> {
    return this.http.get<ApiResponse<UserProfileDto>>(`${this.base}/${userId}`);
  }

  search(query: string): Observable<ApiResponse<UserProfileDto[]>> {
    return this.http.get<ApiResponse<UserProfileDto[]>>(`${this.base}/search?q=${encodeURIComponent(query)}`);
  }

  getAllActive(): Observable<ApiResponse<UserProfileDto[]>> {
    return this.http.get<ApiResponse<UserProfileDto[]>>(`${this.base}/active`);
  }

  updateProfile(userId: number, dto: UpdateProfileDto): Observable<ApiResponse<UserProfileDto>> {
    return this.http.put<ApiResponse<UserProfileDto>>(`${this.base}/${userId}/profile`, dto);
  }

  changePassword(userId: number, dto: ChangePasswordDto): Observable<ApiResponse<string>> {
    return this.http.put<ApiResponse<string>>(`${this.base}/${userId}/change-password`, dto);
  }

  deactivate(userId: number): Observable<ApiResponse<string>> {
    return this.http.delete<ApiResponse<string>>(`${this.base}/${userId}/deactivate`);
  }
}
