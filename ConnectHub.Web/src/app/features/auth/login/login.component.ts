import {
  AfterViewInit, Component, ElementRef, NgZone,
  ViewChild, inject, signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';

import { AuthService } from '../../../core/auth/auth.service';
import { LoginDto } from '../../../shared/models/user.model';
import { ChatHubService } from '../../../core/signalr/chat-hub.service';
import { NotificationHubService } from '../../../core/signalr/notification-hub.service';
import { environment } from '../../../../environments/environment';

declare const google: any;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements AfterViewInit {

  @ViewChild('googleBtn') googleBtnRef?: ElementRef<HTMLDivElement>;

  private auth = inject(AuthService);
  private router = inject(Router);
  private chatHub = inject(ChatHubService);
  private notifHub = inject(NotificationHubService);
  private zone = inject(NgZone);

  dto: LoginDto = { email: '', password: '' };

  loading = signal(false);
  error = signal('');
  showPass = signal(false);
  googleConfigured = signal(!!environment.googleClientId);

  submit(): void {
    if (!this.dto.email || !this.dto.password) {
      this.error.set('Please fill in all fields');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.auth.login(this.dto).subscribe({
      next: res => {
        this.loading.set(false);

        if (res.success) {
          this.chatHub.connect();
          this.notifHub.connect();
          this.router.navigate(['/dashboard']);
        } else {
          this.error.set(res.message);
        }
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Login failed. Please try again.');
      }
    });
  }

  ngAfterViewInit(): void {
    if (!environment.googleClientId) {
      // No client id configured — surface a hint in the rendered area instead
      // of letting the GIS script throw on initialize().
      console.warn('[login] googleClientId not set in environments/environment.ts; Google sign-in disabled.');
      return;
    }
    // GIS script may not have finished loading on first paint. Poll briefly
    // until the global is available, then initialize and render. Cheaper than
    // wiring a load listener on the script tag.
    this.waitForGoogle().then(() => this.initGoogle());
  }

  private waitForGoogle(maxWaitMs = 4000): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (typeof google !== 'undefined' && google.accounts?.id) return resolve();
        if (Date.now() - start > maxWaitMs) return reject(new Error('GIS script did not load.'));
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  private initGoogle(): void {
    google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (response: { credential: string }) => {
        // GIS callbacks fire outside Angular's zone — wrap so signals + router
        // navigation trigger change detection without manual tick().
        this.zone.run(() => this.handleGoogleCredential(response.credential));
      },
      auto_select: false
    });

    if (this.googleBtnRef) {
      // Render Google's official button into our wrapper div. We size it to
      // match the existing social button slot (~280px wide). Theme/text are
      // tuned to fit the auth card's visual style.
      google.accounts.id.renderButton(this.googleBtnRef.nativeElement, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: 280
      });
    }
  }

  private handleGoogleCredential(idToken: string): void {
    if (!idToken) return;
    this.loading.set(true);
    this.error.set('');

    this.auth.loginWithGoogle(idToken).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.success) {
          this.chatHub.connect();
          this.notifHub.connect();
          this.router.navigate(['/dashboard']);
        } else {
          this.error.set(res.message ?? 'Google sign-in failed.');
        }
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Google sign-in failed. Please try again.');
      }
    });
  }
}