import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { AdminPhotoSubmission, SubmissionStatus } from '../domain/admin.models';

interface SubmissionRow {
  id: string;
  photographer_name: string;
  instagram: string | null;
  target_name: string;
  target_type: AdminPhotoSubmission['targetType'];
  storage_path: string;
  status: SubmissionStatus;
  terms_version: string;
  created_at: string;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  image_width: number | null;
  image_height: number | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

@Injectable({ providedIn: 'root' })
export class PhotoReviewRepository {
  private readonly supabase = inject(SupabaseService);

  async list(status: SubmissionStatus): Promise<AdminPhotoSubmission[]> {
    const { data, error } = await this.supabase.client
      .from('photo_submissions')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return Promise.all(((data ?? []) as SubmissionRow[]).map((row) => this.mapRow(row)));
  }

  async review(id: string, status: SubmissionStatus, notes: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('review_photo_submission', {
      target_submission_id: id,
      target_status: status,
      notes,
    });
    if (error) throw error;
  }

  async download(submission: AdminPhotoSubmission): Promise<void> {
    const { data, error } = await this.supabase.client.storage
      .from('photo-submissions')
      .download(submission.storagePath);
    if (error) throw error;
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = submission.originalFilename || submission.storagePath.split('/').at(-1) || 'photo';
    link.click();
    URL.revokeObjectURL(url);
  }

  private async mapRow(row: SubmissionRow): Promise<AdminPhotoSubmission> {
    const { data } = await this.supabase.client.storage
      .from('photo-submissions')
      .createSignedUrl(row.storage_path, 60 * 60);
    return {
      id: row.id,
      photographerName: row.photographer_name,
      instagram: row.instagram,
      targetName: row.target_name,
      targetType: row.target_type,
      storagePath: row.storage_path,
      status: row.status,
      termsVersion: row.terms_version,
      createdAt: row.created_at,
      originalFilename: row.original_filename,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      imageWidth: row.image_width,
      imageHeight: row.image_height,
      reviewedAt: row.reviewed_at,
      reviewNotes: row.review_notes,
      previewUrl: data?.signedUrl ?? null,
    };
  }
}
