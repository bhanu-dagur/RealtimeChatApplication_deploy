import { Injectable, signal } from '@angular/core';

export interface Toast {
    id: number;
    type: 'success' | 'error' | 'info' | 'warning';
    title: string;
    message?: string;
    duration?: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
    toasts = signal<Toast[]>([]);
    private nextId = 1;

    show(
        type: Toast['type'],
        title: string,
        message?: string,
        duration = 4000
    ): void {
        const id = this.nextId++;
        const toast: Toast = { id, type, title, message, duration };

        this.toasts.update(t => [...t, toast]);

        if (duration > 0) {
            setTimeout(() => this.dismiss(id), duration);
        }
    }

    success(title: string, message?: string): void {
        this.show('success', title, message);
    }

    error(title: string, message?: string): void {
        this.show('error', title, message, 6000);
    }

    info(title: string, message?: string): void {
        this.show('info', title, message);
    }

    warning(title: string, message?: string): void {
        this.show('warning', title, message);
    }

    dismiss(id: number): void {
        this.toasts.update(t => t.filter(toast => toast.id !== id));
    }
}