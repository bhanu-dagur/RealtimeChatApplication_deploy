import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminApiService } from '../../../core/http/admin-api.service';
import { ChatRoom } from '../../../shared/models/room.model';

@Component({
  selector: 'app-manage-rooms',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './manage-rooms.html',
  styleUrls: ['./manage-rooms.scss']
})
export class ManageRoomsComponent implements OnInit {
  private adminApi = inject(AdminApiService);

  rooms = signal<ChatRoom[]>([]);
  loading = signal(true);

  ngOnInit() {
    this.loadRooms();
  }

  loadRooms() {
    this.loading.set(true);
    this.adminApi.getAllRooms().subscribe({
      next: (res) => {
        if (res.success) {
          this.rooms.set(res.data);
        }
        setTimeout(() => this.loading.set(false), 0);
      },
      error: () => {
        setTimeout(() => this.loading.set(false), 0);
      }
    });
  }

  deleteRoom(room: ChatRoom) {
    if (confirm(`CRITICAL: Permanently delete room "${room.roomName}"? All messages will be lost.`)) {
      this.adminApi.deleteRoom(room.roomId).subscribe(res => {
        if (res.success) {
          alert('Room deleted permanently.');
          this.loadRooms();
        }
      });
    }
  }

  getRoomInitial(name: string): string {
    return name ? name.charAt(0).toUpperCase() : '?';
  }
}
