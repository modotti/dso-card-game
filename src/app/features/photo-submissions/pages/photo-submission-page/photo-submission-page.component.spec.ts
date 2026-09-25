import type { WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { FormGroup } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { PhotoSubmissionService } from '../../data-access/photo-submission.service';
import { PhotoSubmissionPageComponent } from './photo-submission-page.component';

interface ComponentAccess {
  form: FormGroup;
  photo: WritableSignal<File | null>;
  photoError: WritableSignal<string | null>;
  succeeded: WritableSignal<boolean>;
  submitFailed: WritableSignal<boolean>;
  submit(): Promise<void>;
}

describe('PhotoSubmissionPageComponent', () => {
  let submit: jasmine.Spy;

  beforeEach(() => {
    localStorage.setItem('dsd-language', 'en');
    submit = jasmine.createSpy('submit').and.resolveTo();
    TestBed.configureTestingModule({
      imports: [PhotoSubmissionPageComponent],
      providers: [provideRouter([]), { provide: PhotoSubmissionService, useValue: { submit } }],
    });
  });

  function valid(component: ComponentAccess): File {
    component.form.patchValue({
      photographerName: 'Ada Astro',
      instagram: '@ada',
      targetName: 'Orion Nebula',
      targetType: 'emission_nebula',
      terms: true,
    });
    const photo = new File(['photo'], 'target.jpg', { type: 'image/jpeg' });
    component.photo.set(photo);
    return photo;
  }

  it('requires the form fields, a photo, and terms acceptance', async () => {
    const fixture = TestBed.createComponent(PhotoSubmissionPageComponent);
    const component = fixture.componentInstance as unknown as ComponentAccess;
    await component.submit();
    expect(component.form.invalid).toBeTrue();
    expect(component.photoError()).toBe('invalid');
    expect(submit).not.toHaveBeenCalled();
  });

  it('does not submit while the terms checkbox is unchecked', async () => {
    const fixture = TestBed.createComponent(PhotoSubmissionPageComponent);
    const component = fixture.componentInstance as unknown as ComponentAccess;
    valid(component);
    component.form.patchValue({ terms: false });
    await component.submit();
    expect(component.form.invalid).toBeTrue();
    expect(submit).not.toHaveBeenCalled();
  });

  it('requires the target name', async () => {
    const fixture = TestBed.createComponent(PhotoSubmissionPageComponent);
    const component = fixture.componentInstance as unknown as ComponentAccess;
    valid(component);
    component.form.patchValue({ targetName: '' });
    await component.submit();
    expect(component.form.invalid).toBeTrue();
    expect(submit).not.toHaveBeenCalled();
  });

  it('shows the success state after submission', async () => {
    const fixture = TestBed.createComponent(PhotoSubmissionPageComponent);
    const component = fixture.componentInstance as unknown as ComponentAccess;
    const photo = valid(component);
    await component.submit();
    fixture.detectChanges();
    expect(submit).toHaveBeenCalledWith(
      jasmine.objectContaining({ photographerName: 'Ada Astro', targetName: 'Orion Nebula', photo }),
    );
    expect(component.succeeded()).toBeTrue();
    expect(fixture.nativeElement.querySelector('.success')).not.toBeNull();
  });

  it('keeps the form and displays an error when upload fails', async () => {
    submit.and.rejectWith(new Error('UPLOAD_FAILED'));
    const fixture = TestBed.createComponent(PhotoSubmissionPageComponent);
    const component = fixture.componentInstance as unknown as ComponentAccess;
    valid(component);
    await component.submit();
    fixture.detectChanges();
    expect(component.submitFailed()).toBeTrue();
    expect(component.succeeded()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.submit-error')).not.toBeNull();
  });
});
