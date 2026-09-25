import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { PHOTO_TERMS_VERSION, type PhotoTargetType } from '../domain/photo-submission';

export interface PhotoSubmissionRequest {
  readonly photographerName: string;
  readonly instagram: string;
  readonly targetName: string;
  readonly targetType: PhotoTargetType;
  readonly photo: File;
}

@Injectable({ providedIn: 'root' })
export class PhotoSubmissionService {
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService);

  async submit(request: PhotoSubmissionRequest): Promise<void> {
    await this.auth.ensurePlayerIdentity();
    const body = new FormData();
    body.set('photographerName', request.photographerName.trim());
    body.set('instagram', request.instagram.trim());
    body.set('targetName', request.targetName.trim());
    body.set('targetType', request.targetType);
    body.set('photo', request.photo);
    body.set('termsAccepted', 'true');
    body.set('termsVersion', PHOTO_TERMS_VERSION);
    const { error } = await this.supabase.client.functions.invoke('submit-photo', { body });
    if (error) throw error;
  }
}
