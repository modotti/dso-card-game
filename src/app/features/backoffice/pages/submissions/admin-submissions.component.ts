import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PhotoReviewRepository } from '../../data-access/photo-review.repository';
import type { AdminPhotoSubmission, SubmissionStatus } from '../../domain/admin.models';

@Component({
  selector: 'app-admin-submissions',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './admin-submissions.component.html',
  styleUrl: './admin-submissions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSubmissionsComponent {
  private readonly repository = inject(PhotoReviewRepository);
  protected readonly status = signal<SubmissionStatus>('pending');
  protected readonly submissions = signal<AdminPhotoSubmission[]>([]);
  protected readonly loading = signal(true);
  protected readonly actionId = signal<string | null>(null);
  protected readonly error = signal(false);
  protected readonly selected = signal<AdminPhotoSubmission | null>(null);
  protected notes = '';
  protected readonly empty = computed(() => !this.loading() && this.submissions().length === 0);

  constructor() {
    void this.load();
  }

  protected async selectStatus(status: SubmissionStatus): Promise<void> {
    if (status === this.status()) return;
    this.status.set(status);
    await this.load();
  }

  protected open(submission: AdminPhotoSubmission): void {
    this.notes = submission.reviewNotes ?? '';
    this.selected.set(submission);
  }

  protected close(): void {
    this.selected.set(null);
  }

  protected async review(submission: AdminPhotoSubmission, status: SubmissionStatus): Promise<void> {
    if (this.actionId()) return;
    this.actionId.set(submission.id);
    this.error.set(false);
    try {
      await this.repository.review(submission.id, status, this.notes);
      this.selected.set(null);
      await this.load();
    } catch {
      this.error.set(true);
    } finally {
      this.actionId.set(null);
    }
  }

  protected async download(submission: AdminPhotoSubmission): Promise<void> {
    this.actionId.set(submission.id);
    try {
      await this.repository.download(submission);
    } catch {
      this.error.set(true);
    } finally {
      this.actionId.set(null);
    }
  }

  protected formatBytes(bytes: number | null): string {
    return bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '—';
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      this.submissions.set(await this.repository.list(this.status()));
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
