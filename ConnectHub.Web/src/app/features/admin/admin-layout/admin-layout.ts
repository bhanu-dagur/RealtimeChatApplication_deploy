import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './admin-layout.html',
  styleUrls: ['./admin-layout.scss']
})
export class AdminLayoutComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  logout() {
    this.auth.logout();
  }

  exitAdmin() {
    this.router.navigate(['/dashboard']);
  }
}
