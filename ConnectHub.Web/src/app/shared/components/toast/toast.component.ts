import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from './toast.service';

@Component({
    selector: 'app-toast',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="toast-container">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast toast-{{ toast.type }}"
          (click)="toastService.dismiss(toast.id)">

          <div class="toast-icon">
            @switch (toast.type) {
              @case ('success') { ✓ }
              @case ('error')   { ✕ }
              @case ('warning') { ⚠ }
              @case ('info')    { i }
            }
          </div>

          <div class="toast-body">
            <div class="toast-title">{{ toast.title }}</div>
            @if (toast.message) {
              <div class="toast-msg">{{ toast.message }}</div>
            }
          </div>

          <button class="toast-close"
            (click)="toastService.dismiss(toast.id); $event.stopPropagation()">
            ✕
          </button>
        </div>
      }
    </div>
  `,
    styles: [`
    .toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    }

    .toast {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background: white;
      border-radius: 14px;
      padding: 14px 16px;
      min-width: 300px;
      max-width: 380px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.14);
      cursor: pointer;
      pointer-events: all;
      animation: slideIn 0.25s ease;
      border-left: 4px solid transparent;
      transition: transform 0.2s;
    }

    .toast:hover { transform: translateX(-3px); }

    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to   { transform: translateX(0); opacity: 1; }
    }

    .toast-success { border-left-color: var(--online); }
    .toast-error   { border-left-color: var(--danger); }
    .toast-warning { border-left-color: var(--warn); }
    .toast-info    { border-left-color: var(--teal); }

    .toast-icon {
      width: 28px; height: 28px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px;
      font-weight: 700;
      flex-shrink: 0;
    }

    .toast-success .toast-icon { background: rgba(34,197,94,0.12); color: var(--online); }
    .toast-error   .toast-icon { background: rgba(239,68,68,0.12); color: var(--danger); }
    .toast-warning .toast-icon { background: rgba(245,158,11,0.12); color: var(--warn); }
    .toast-info    .toast-icon { background: rgba(74,159,165,0.12); color: var(--teal); }

    .toast-body { flex: 1; min-width: 0; }

    .toast-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--gray-800);
      margin-bottom: 2px;
    }

    .toast-msg {
      font-size: 12px;
      color: var(--gray-500);
      line-height: 1.45;
    }

    .toast-close {
      background: none;
      border: none;
      color: var(--gray-400);
      cursor: pointer;
      font-size: 13px;
      padding: 2px 4px;
      border-radius: 4px;
      flex-shrink: 0;
      transition: color 0.15s;
      &:hover { color: var(--gray-700); }
    }
  `]
})
export class ToastComponent {
    toastService = inject(ToastService);
}