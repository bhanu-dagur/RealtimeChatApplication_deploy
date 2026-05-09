import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AdminApiService } from '../../../core/http/admin-api.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.scss']
})
export class AdminDashboardComponent implements OnInit {
  private adminApi = inject(AdminApiService);

  totalUsers = signal(0);
  totalRooms = signal(0);
  totalMessages = signal(0);
  loading = signal(true);

  ngOnInit() {
    this.loadAnalytics();
  }

  loadAnalytics() {
    this.loading.set(true);
    
    forkJoin({
      users: this.adminApi.getUserAnalytics().pipe(catchError(err => of({ success: false, data: 0 }))),
      rooms: this.adminApi.getRoomAnalytics().pipe(catchError(err => of({ success: false, data: 0 }))),
      messages: this.adminApi.getMessageAnalytics().pipe(catchError(err => of({ success: false, data: 0 })))
    }).subscribe({
      next: (results) => {
        if (results.users.success) this.totalUsers.set(results.users.data);
        if (results.rooms.success) this.totalRooms.set(results.rooms.data);
        if (results.messages.success) this.totalMessages.set(results.messages.data);
        
        // Use setTimeout to move the state change out of the current change detection cycle
        setTimeout(() => this.loading.set(false), 0);
      },
      error: (err) => {
        console.error('Critical error in forkJoin:', err);
        setTimeout(() => this.loading.set(false), 0);
      }
    });
  }
}
