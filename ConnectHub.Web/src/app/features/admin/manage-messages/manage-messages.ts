import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminApiService } from '../../../core/http/admin-api.service';
import { Message } from '../../../shared/models/message.model';

@Component({
  selector: 'app-manage-messages',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './manage-messages.html',
  styleUrls: ['./manage-messages.scss']
})
export class ManageMessagesComponent implements OnInit {
  private adminApi = inject(AdminApiService);

  messages = signal<Message[]>([]);
  loading = signal(true);
  page = signal(1);
  pageSize = 50;
  totalCount = signal(0);

  ngOnInit() {
    this.loadMessages();
  }

  loadMessages() {
    this.loading.set(true);
    this.adminApi.getAllMessages(this.page(), this.pageSize).subscribe({
      next: (res) => {
        if (res.success) {
          this.messages.set(res.data.items);
          this.totalCount.set(res.data.totalCount);
        }
        setTimeout(() => this.loading.set(false), 0);
      },
      error: () => {
        setTimeout(() => this.loading.set(false), 0);
      }
    });
  }

  nextPage() {
    if (this.page() * this.pageSize < this.totalCount()) {
      this.page.update(p => p + 1);
      this.loadMessages();
    }
  }

  prevPage() {
    if (this.page() > 1) {
      this.page.update(p => p - 1);
      this.loadMessages();
    }
  }

  deleteMessage(msg: Message) {
    if (confirm(`CRITICAL: Permanently delete message ID ${msg.messageId}? This cannot be undone.`)) {
      this.adminApi.deleteMessage(msg.messageId).subscribe(res => {
        if (res.success) {
          alert('Message deleted permanently.');
          this.loadMessages();
        }
      });
    }
  }
}
