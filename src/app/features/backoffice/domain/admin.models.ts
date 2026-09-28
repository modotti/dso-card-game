import type { PhotoTargetType } from '../../photo-submissions/domain/photo-submission';

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface AdminPhotoSubmission {
  readonly id: string;
  readonly photographerName: string;
  readonly instagram: string | null;
  readonly targetName: string;
  readonly targetType: PhotoTargetType;
  readonly storagePath: string;
  readonly status: SubmissionStatus;
  readonly termsVersion: string;
  readonly createdAt: string;
  readonly originalFilename: string | null;
  readonly mimeType: string | null;
  readonly fileSize: number | null;
  readonly imageWidth: number | null;
  readonly imageHeight: number | null;
  readonly reviewedAt: string | null;
  readonly reviewNotes: string | null;
  readonly previewUrl: string | null;
}
