import { TestBed } from '@angular/core/testing';
import { AchievementsPageComponent } from './achievements-page.component';

describe('AchievementsPageComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('dsd-language', 'en');
    TestBed.configureTestingModule({ imports: [AchievementsPageComponent] });
  });

  it('renders the Deep Sky Record before all achievement cards', () => {
    const fixture = TestBed.createComponent(AchievementsPageComponent);
    fixture.detectChanges();
    const native = fixture.nativeElement as HTMLElement;
    expect(native.querySelector('.deep-sky-record')).not.toBeNull();
    expect(
      native.querySelector('.deep-sky-record')?.compareDocumentPosition(native.querySelector('.achievements-hero')!),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(native.querySelectorAll('.record-grid article')).toHaveSize(6);
    expect(native.querySelectorAll('.achievement-card')).toHaveSize(18);
  });
});
