import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminApiService } from '../../../core/http/admin-api.service';
import { UserProfileDto } from '../../../shared/models/user.model';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';

@Component({
  selector: 'app-manage-users',
  standalone: true,
  imports: [CommonModule, AvatarComponent],
  templateUrl: './manage-users.html',
  styleUrls: ['./manage-users.scss']
})
export class ManageUsersComponent implements OnInit {
  private adminApi = inject(AdminApiService);

  users = signal<UserProfileDto[]>([]);
  loading = signal(true);

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.loading.set(true);
    this.adminApi.getAllUsers().subscribe({
      next: (res) => {
        if (res.success) {
          this.users.set(res.data);
        }
        setTimeout(() => this.loading.set(false), 0);
      },
      error: () => {
        setTimeout(() => this.loading.set(false), 0);
      }
    });
  }

  suspendUser(user: any) {
    if (confirm(`Are you sure you want to suspend ${user.displayName}?`)) {
      this.adminApi.suspendUser(user.userId).subscribe(res => {
        if (res.success) {
          alert('User suspended successfully.');
          this.loadUsers();
        }
      });
    }
  }

  deleteUser(user: any) {
    if (confirm(`CRITICAL: Permanently delete ${user.displayName}? This cannot be undone.`)) {
      this.adminApi.deleteUser(user.userId).subscribe(res => {
        if (res.success) {
          alert('User deleted permanently.');
          this.loadUsers();
        }
      });
    }
  }
}
