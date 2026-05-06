import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-avatar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="avatar-wrap" [style.width.px]="size" [style.height.px]="size">
      @if (imageUrl) {
        <img [src]="imageUrl" [alt]="name" class="avatar-img"/>
      } @else {
        <div class="avatar-initials" [style.fontSize.px]="size * 0.38"
          [style.background]="bgColor">
          {{ initials }}
        </div>
      }
      @if (showOnline) {
        <div class="online-dot" [class.online]="isOnline" [class.offline]="!isOnline"></div>
      }
    </div>
  `,
  styles: [`
    .avatar-wrap {
      position: relative;
      flex-shrink: 0;
      display: inline-flex;
    }
    .avatar-img {
      width: 100%; height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }
    .avatar-initials {
      width: 100%; height: 100%;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 600;
      font-family: var(--font-display);
    }
    .online-dot {
      position: absolute;
      bottom: 1px; right: 1px;
      width: 11px; height: 11px;
      border-radius: 50%;
      border: 2px solid white;
    }
    .online-dot.online  { background: var(--online); }
    .online-dot.offline { background: var(--gray-400); }
  `]
})
export class AvatarComponent implements OnInit {
  @Input() name = '';
  @Input() imageUrl = '';
  @Input() size = 40;
  @Input() isOnline = false;
  @Input() showOnline = false;

  initials = '';
  bgColor = '';

  private colors = [
    '#4a9fa5', '#3a8a90', '#e91e8c', '#9c27b0',
    '#1565c0', '#0288d1', '#2e7d32', '#e65100'
  ];

  ngOnInit(): void {
    const parts = this.name.trim().split(' ');
    this.initials = parts.length > 1
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : (parts[0]?.[0] ?? '?').toUpperCase();

    const idx = this.name.charCodeAt(0) % this.colors.length;
    this.bgColor = this.colors[idx];
  }
}