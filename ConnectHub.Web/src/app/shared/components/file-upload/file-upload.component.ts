import {
    Component, inject, signal, Output,
    EventEmitter, Input, ElementRef, ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { AuthService } from '../../../core/auth/auth.service';
import { MediaApiService, MediaUploadResponse } from '../../../core/http/media-api.service';

export interface UploadResult {
    url: string;
    thumbnailUrl?: string;
    fileName: string;
    contentType: string;
    fileSizeKb: number;
    fileId: string;
}

@Component({
    selector: 'app-file-upload',
    standalone: true,
    imports: [CommonModule],
    template: `
    <!-- Hidden file input -->
    <input
      #fileInput
      type="file"
      [accept]="acceptTypes"
      (change)="onFileSelected($event)"
      style="display:none"
    />

    <!-- Trigger button (projected or default) -->
    <button
      type="button"
      class="upload-trigger"
      [class.uploading]="isUploading()"
      (click)="fileInput.click()"
      [disabled]="isUploading()"
      [title]="isUploading() ? 'Uploading...' : 'Attach file'"
    >
      @if (isUploading()) {
        <!-- Progress ring -->
        <svg class="progress-ring" width="20" height="20" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="8" fill="none"
            stroke="var(--gray-200)" stroke-width="2"/>
          <circle cx="10" cy="10" r="8" fill="none"
            stroke="var(--teal)" stroke-width="2"
            stroke-dasharray="50.3"
            [attr.stroke-dashoffset]="getDashOffset()"
            stroke-linecap="round"
            transform="rotate(-90 10 10)"/>
        </svg>
        <span class="progress-text">{{ progress() }}%</span>
      } @else {
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
        </svg>
      }
    </button>

    <!-- Error toast -->
    @if (errorMsg()) {
      <div class="upload-error">{{ errorMsg() }}</div>
    }
  `,
    styles: [`
    .upload-trigger {
      width: 30px; height: 30px;
      display: flex; align-items: center; justify-content: center;
      background: none; border: none;
      cursor: pointer;
      color: var(--gray-400);
      border-radius: 8px;
      transition: all 0.15s;
      flex-shrink: 0;
      position: relative;
    }
    .upload-trigger:hover:not(:disabled) {
      color: var(--teal);
      background: var(--teal-light);
    }
    .upload-trigger.uploading { cursor: not-allowed; }
    .upload-trigger:disabled { opacity: 0.7; }

    .progress-ring { display: block; }

    .progress-text {
      position: absolute;
      font-size: 8px;
      font-weight: 700;
      color: var(--teal);
    }

    .upload-error {
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 6px;
      white-space: nowrap;
      margin-bottom: 4px;
      z-index: 10;
    }
  `]
})
export class FileUploadComponent {
    @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

    @Input() roomId?: number;
    @Input() receiverId?: number;
    @Input() isPermanent = false;

    // Allowed file types
    @Input() acceptTypes =
        'image/jpeg,image/png,image/gif,image/webp,' +
        'application/pdf,application/msword,' +
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
        'audio/mpeg,audio/wav,audio/ogg,text/plain';

    @Output() uploaded = new EventEmitter<UploadResult>();
    @Output() uploadErr = new EventEmitter<string>();

    private auth = inject(AuthService);
    private mediaApi = inject(MediaApiService);

    isUploading = signal(false);
    progress = signal(0);
    errorMsg = signal('');

    // File size limits (bytes)
    private limits: Record<string, number> = {
        'image/': 10 * 1024 * 1024,   // 10MB
        'audio/': 25 * 1024 * 1024,   // 25MB
        'application/': 50 * 1024 * 1024, // 50MB
        'text/': 50 * 1024 * 1024
    };

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        // Reset input so same file can be selected again
        input.value = '';

        // Validate size
        const limitKey = Object.keys(this.limits)
            .find(k => file.type.startsWith(k));
        const maxSize = limitKey ? this.limits[limitKey] : 10 * 1024 * 1024;

        if (file.size > maxSize) {
            const maxMB = Math.round(maxSize / 1024 / 1024);
            this.showError(`File too large. Max ${maxMB}MB allowed.`);
            return;
        }

        this.uploadFile(file);
    }

    private uploadFile(file: File): void {
        const userId = this.auth.getCurrentUser()?.userId;
        if (!userId) return;

        this.isUploading.set(true);
        this.progress.set(0);
        this.errorMsg.set('');

        this.mediaApi.uploadFile(
            file, userId,
            undefined,
            this.roomId,
            this.isPermanent
        ).subscribe({
            next: event => {
                if (event.type === HttpEventType.UploadProgress) {
                    const pct = Math.round(100 * (event.loaded / (event.total ?? 1)));
                    this.progress.set(pct);
                }

                if (event.type === HttpEventType.Response) {
                    this.isUploading.set(false);
                    this.progress.set(0);

                    const res = event.body;
                    if (res?.success && res.data) {
                        this.uploaded.emit({
                            url: res.data.publicUrl,
                            thumbnailUrl: res.data.thumbnailUrl,
                            fileName: res.data.fileName,
                            contentType: res.data.contentType,
                            fileSizeKb: res.data.fileSizeKb,
                            fileId: res.data.fileId
                        });
                    } else {
                        this.showError('Upload failed. Try again.');
                    }
                }
            },
            error: err => {
                this.isUploading.set(false);
                this.progress.set(0);
                const msg = err.error?.message ?? 'Upload failed. Try again.';
                this.showError(msg);
                this.uploadErr.emit(msg);
            }
        });
    }

    // SVG ring offset — 50.3 is circumference of r=8 circle
    getDashOffset(): number {
        return 50.3 - (50.3 * this.progress()) / 100;
    }

    private showError(msg: string): void {
        this.errorMsg.set(msg);
        setTimeout(() => this.errorMsg.set(''), 4000);
    }
}