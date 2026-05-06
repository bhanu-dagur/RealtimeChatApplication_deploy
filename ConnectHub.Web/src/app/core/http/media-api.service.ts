import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../shared/models/api-response.model';

export interface MediaUploadResponse {
    fileId: string;
    fileName: string;
    contentType: string;
    fileSizeKb: number;
    publicUrl: string;
    thumbnailUrl?: string;
    cloudinaryPublicId: string;
    uploadedAt: string;
}

export interface MediaFileResponse {
    fileId: string;
    uploadedBy: number;
    fileName: string;
    contentType: string;
    fileSizeKb: number;
    publicUrl: string;
    thumbnailUrl?: string;
    messageId?: number;
    roomId?: number;
    uploadedAt: string;
    expiresAt?: string;
}

@Injectable({ providedIn: 'root' })
export class MediaApiService {
    private http = inject(HttpClient);
    private base = `${environment.apiUrl}/api/media`;

    // Upload with progress tracking
    uploadFile(
        file: File,
        uploadedBy: number,
        messageId?: number,
        roomId?: number,
        isPermanent = false
    ): Observable<HttpEvent<ApiResponse<MediaUploadResponse>>> {
        const formData = new FormData();
        formData.append('file', file);

        let url = `${this.base}/upload?uploadedBy=${uploadedBy}&isPermanent=${isPermanent}`;
        if (messageId) url += `&messageId=${messageId}`;
        if (roomId) url += `&roomId=${roomId}`;

        const req = new HttpRequest('POST', url, formData, {
            reportProgress: true
        });

        return this.http.request<ApiResponse<MediaUploadResponse>>(req);
    }

    getFileById(fileId: string): Observable<ApiResponse<MediaFileResponse>> {
        return this.http.get<ApiResponse<MediaFileResponse>>(`${this.base}/${fileId}`);
    }

    getFilesByUser(userId: number): Observable<ApiResponse<MediaFileResponse[]>> {
        return this.http.get<ApiResponse<MediaFileResponse[]>>(`${this.base}/user/${userId}`);
    }

    getFilesByRoom(roomId: number): Observable<ApiResponse<MediaFileResponse[]>> {
        return this.http.get<ApiResponse<MediaFileResponse[]>>(`${this.base}/room/${roomId}`);
    }

    deleteFile(fileId: string): Observable<ApiResponse<string>> {
        return this.http.delete<ApiResponse<string>>(`${this.base}/${fileId}`);
    }
}