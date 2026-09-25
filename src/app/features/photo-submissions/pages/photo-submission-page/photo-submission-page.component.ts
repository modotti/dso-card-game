import type { OnDestroy } from '@angular/core';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { PhotoSubmissionService } from '../../data-access/photo-submission.service';
import {
  PHOTO_MAX_BYTES,
  PHOTO_MAX_DIMENSION,
  PHOTO_MIN_DIMENSION,
  type PhotoTargetType,
  type PhotoValidationError,
  validatePhoto,
} from '../../domain/photo-submission';

export function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve({ width: image.naturalWidth, height: image.naturalHeight }));
    image.addEventListener('error', () => reject(new Error('INVALID_IMAGE')));
    image.src = url;
  });
}

@Component({
  selector: 'app-photo-submission-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './photo-submission-page.component.html',
  styleUrl: './photo-submission-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoSubmissionPageComponent implements OnDestroy {
  protected readonly i18n = inject(TranslationService);
  private readonly submissions = inject(PhotoSubmissionService);
  protected readonly submitting = signal(false);
  protected readonly succeeded = signal(false);
  protected readonly submitFailed = signal(false);
  protected readonly photo = signal<File | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly photoError = signal<PhotoValidationError | 'invalid'>(null);
  protected readonly limits = { maxBytes: PHOTO_MAX_BYTES, min: PHOTO_MIN_DIMENSION, max: PHOTO_MAX_DIMENSION };

  protected readonly form = new FormGroup({
    photographerName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    instagram: new FormControl('', {
      nonNullable: true,
      validators: [Validators.pattern(/^@[A-Za-z0-9._]{1,30}$/)],
    }),
    targetName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    targetType: new FormControl<PhotoTargetType | ''>('', { nonNullable: true, validators: [Validators.required] }),
    terms: new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] }),
  });

  ngOnDestroy(): void {
    this.releasePreview();
  }

  async selectPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.releasePreview();
    this.photo.set(null);
    this.photoError.set(null);
    if (!file) return;
    const metadataError = validatePhoto(file);
    if (metadataError) return void this.photoError.set(metadataError);

    const url = URL.createObjectURL(file);
    try {
      const dimensions = await loadImageDimensions(url);
      const dimensionError = validatePhoto(file, dimensions);
      if (dimensionError) {
        URL.revokeObjectURL(url);
        return void this.photoError.set(dimensionError);
      }
      this.photo.set(file);
      this.previewUrl.set(url);
    } catch {
      URL.revokeObjectURL(url);
      this.photoError.set('invalid');
    }
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    const photo = this.photo();
    if (this.form.invalid || !photo) {
      if (!photo && !this.photoError()) this.photoError.set('invalid');
      return;
    }
    this.submitting.set(true);
    this.submitFailed.set(false);
    try {
      await this.submissions.submit({
        photographerName: this.form.controls.photographerName.value,
        instagram: this.form.controls.instagram.value,
        targetName: this.form.controls.targetName.value,
        targetType: this.form.controls.targetType.value as PhotoTargetType,
        photo,
      });
      this.succeeded.set(true);
      this.releasePreview();
    } catch {
      this.submitFailed.set(true);
    } finally {
      this.submitting.set(false);
    }
  }

  private releasePreview(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
  }
}
