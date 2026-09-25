import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../../core/auth/auth.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { PHOTO_TERMS_VERSION } from '../domain/photo-submission';
import { PhotoSubmissionService } from './photo-submission.service';

describe('PhotoSubmissionService', () => {
  it('creates a submission with the required terms version and photo', async () => {
    const invoke = jasmine.createSpy('invoke').and.resolveTo({ data: { id: 'submission-1' }, error: null });
    const ensurePlayerIdentity = jasmine.createSpy('ensurePlayerIdentity').and.resolveTo('player-1');
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { ensurePlayerIdentity } },
        { provide: SupabaseService, useValue: { client: { functions: { invoke } } } },
      ],
    });
    const photo = new File(['photo'], 'target.jpg', { type: 'image/jpeg' });

    await TestBed.inject(PhotoSubmissionService).submit({
      photographerName: '  Ada Astro  ',
      instagram: ' @ada.astro ',
      targetName: '  Orion Nebula  ',
      targetType: 'emission_nebula',
      photo,
    });

    expect(ensurePlayerIdentity).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('submit-photo', { body: jasmine.any(FormData) });
    const body = invoke.calls.mostRecent().args[1].body as FormData;
    expect(body.get('photographerName')).toBe('Ada Astro');
    expect(body.get('instagram')).toBe('@ada.astro');
    expect(body.get('targetName')).toBe('Orion Nebula');
    expect(body.get('targetType')).toBe('emission_nebula');
    expect(body.get('termsAccepted')).toBe('true');
    expect(body.get('termsVersion')).toBe(PHOTO_TERMS_VERSION);
    expect(body.get('photo')).toBe(photo);
  });
});
