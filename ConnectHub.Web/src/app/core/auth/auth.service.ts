import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../shared/models/api-response.model';
import { AuthResponse, GoogleLoginDto, LoginDto, RegisterDto } from '../../shared/models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private readonly TOKEN_KEY = 'ch_token';
  private readonly USER_KEY = 'ch_user';
  private readonly BASE = `${environment.authApiUrl}/api/users`;

  login(dto: LoginDto): Observable<ApiResponse<AuthResponse>> {
    return this.http
      .post<ApiResponse<AuthResponse>>(`${this.BASE}/login`, dto)
      .pipe(tap(res => {
        if (res.success) {
          this.saveSession(res.data);
        }
      }));
  }

  register(dto: RegisterDto): Observable<ApiResponse<AuthResponse>> {
    return this.http
      .post<ApiResponse<AuthResponse>>(`${this.BASE}/register`, dto)
      .pipe(tap(res => {
        if (res.success) {
          this.saveSession(res.data);
        }
      }));
  }

  // Trades a Google ID token (from Google Identity Services) for an app-issued
  // JWT. Backend validates the token's signature and audience against our
  // configured Google Client ID, links by GoogleId/email, and creates a fresh
  // user on first sign-in.
  loginWithGoogle(idToken: string): Observable<ApiResponse<AuthResponse>> {
    const dto: GoogleLoginDto = { idToken };
    return this.http
      .post<ApiResponse<AuthResponse>>(`${this.BASE}/google-login`, dto)
      .pipe(tap(res => {
        if (res.success) {
          this.saveSession(res.data);
        }
      }));
  }

  logout(): void {
    // Wipe the auth session.
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    // Wipe every conversation cache the app writes. The stores already scope
    // their cache by userId, but actively clearing on logout prevents the
    // brief flash of the previous user's chat list on the login screen and
    // guarantees a fresh state if the next session is for a different user.
    // Listed by literal key (not ranged) so we never accidentally drop an
    // unrelated key that some other library happens to put in localStorage.
    try {
      localStorage.removeItem('ch_conv_cache_v1');
      localStorage.removeItem('ch_room_conv_cache_v1');
    } catch { /* storage disabled / quota — non-fatal */ }
    this.router.navigate(['/login']);
  }

  /**
   * Hard reset for "I want a totally fresh app state" — wipes auth + every
   * cache key the app owns, without navigating. Intended for support/debug
   * flows ("clear my cache and reload") rather than normal logout. Returns
   * the count of keys actually removed so callers can log/toast.
   */
  clearAllAppCache(): number {
    const keys = [this.TOKEN_KEY, this.USER_KEY, 'ch_conv_cache_v1', 'ch_room_conv_cache_v1'];
    let removed = 0;
    for (const k of keys) {
      try {
        if (localStorage.getItem(k) !== null) {
          localStorage.removeItem(k);
          removed++;
        }
      } catch { /* ignore */ }
    }
    return removed;
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  getCurrentUser(): AuthResponse | null {
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  isLoggedIn(): boolean {
    const token = this.getToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  isAdmin(): boolean {
    const token = this.getToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const roleClaim = payload.role || payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'];
      return roleClaim === 'Admin';
    } catch {
      return false;
    }
  }

  private saveSession(data: AuthResponse): void {
    localStorage.setItem(this.TOKEN_KEY, data.token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(data));
  }
}