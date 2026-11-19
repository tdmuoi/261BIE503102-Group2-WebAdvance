import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from, switchMap, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth-service';

export type UploadPurpose = 'avatar' | 'buyback' | 'review';

interface UploadSignature {
  uploadUrl: string;
  api_key: string;
  timestamp: number;
  signature: string;
  folder: string;
  allowed_formats: string;
}

const MAX_SIDE: Record<UploadPurpose, number> = { avatar: 400, buyback: 1400, review: 1400 };
const JPEG_QUALITY = 0.85;

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  uploadImage(file: File, purpose: UploadPurpose): Observable<string> {
    const token = this.auth.token;
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
    return from(shrink(file, MAX_SIDE[purpose])).pipe(
      switchMap((blob) =>
        this.http.get<UploadSignature>(`${environment.apiUrl}/uploads/signature`, { headers, params: { purpose } }).pipe(
          switchMap((sig) => {
            const body = new FormData();
            body.append('file', blob, 'photo.jpg');
            body.append('api_key', sig.api_key);
            body.append('timestamp', String(sig.timestamp));
            body.append('signature', sig.signature);
            body.append('folder', sig.folder);
            body.append('allowed_formats', sig.allowed_formats);
            return this.http.post<{ secure_url: string }>(sig.uploadUrl, body);
          }),
        ),
      ),
      map((result) => result.secure_url),
    );
  }
}

async function shrink(file: File, maxSide: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Cannot encode image'))), 'image/jpeg', JPEG_QUALITY),
  );
}
