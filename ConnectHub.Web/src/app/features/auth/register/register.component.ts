import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/auth/auth.service';
import { RegisterDto } from '../../../shared/models/user.model';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  dto: RegisterDto = {
    userName: '', displayName: '',
    email: '', password: '', bio: ''
  };

  confirmPassword = '';
  loading = signal(false);
  error = signal('');
  showPass = signal(false);
  step = signal(1);

  strength = computed(() => {
    const p = this.dto.password;
    if (!p || p.length < 6) return 'weak';
    if (p.length >= 8 && /[A-Z]/.test(p) && /\d/.test(p)) return 'strong';
    return 'medium';
  });

  nextStep(): void {
    if (!this.dto.displayName.trim()) { this.error.set('Display name is required'); return; }
    if (!this.dto.userName.trim()) { this.error.set('Username is required'); return; }
    if (!this.dto.email.trim()) { this.error.set('Email is required'); return; }
    this.error.set('');
    this.step.set(2);
  }

  prevStep(): void {
    this.step.set(1);
    this.error.set('');
  }

  submit(): void {
    if (!this.dto.password) { this.error.set('Password is required'); return; }
    if (this.dto.password.length < 6) { this.error.set('Password must be at least 6 characters'); return; }
    if (this.dto.password !== this.confirmPassword) { this.error.set('Passwords do not match'); return; }

    this.loading.set(true);
    this.error.set('');

    this.auth.register(this.dto).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.success) this.router.navigate(['/dashboard']);
        else this.error.set(res.message);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Registration failed. Please try again.');
      }
    });
  }
}