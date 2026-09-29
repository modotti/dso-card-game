import { pickFeaturedCards } from './home-page.component';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { HomePageComponent } from './home-page.component';

describe('pickFeaturedCards', () => {
  const cards = [
    { id: '1', catalogName: 'One', commonName: 'One', objectType: 'nebula' },
    { id: '2', catalogName: 'Two', commonName: 'Two', objectType: 'nebula' },
    { id: '3', catalogName: 'Three', commonName: 'Three', objectType: 'galaxy' },
    { id: '4', catalogName: 'Four', commonName: 'Four', objectType: 'cluster' },
  ];

  it('picks distinct cards and prioritizes different object types', () => {
    const selected = pickFeaturedCards(cards, 3, () => 0.5);

    expect(selected).toHaveSize(3);
    expect(new Set(selected.map((card) => card.id)).size).toBe(3);
    expect(new Set(selected.map((card) => card.objectType)).size).toBe(3);
  });

  it('falls back to repeated object types when needed', () => {
    const sameType = cards.slice(0, 2);

    expect(pickFeaturedCards(sameType, 3, () => 0.5)).toEqual(sameType);
  });
});

describe('HomePageComponent photo submission invitation', () => {
  it('links the photo submission CTA to the submission page', () => {
    TestBed.configureTestingModule({ imports: [HomePageComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(HomePageComponent);
    fixture.detectChanges();
    const cta = fixture.nativeElement.querySelector('.photo-invitation a') as HTMLAnchorElement;
    expect(cta).not.toBeNull();
    expect(cta.getAttribute('href')).toBe('/submit-photo');
  });
});

describe('HomePageComponent game actions', () => {
  it('presents CPU play as the primary action while keeping multiplayer actions available', () => {
    TestBed.configureTestingModule({ imports: [HomePageComponent], providers: [provideRouter([])] });
    TestBed.inject(TranslationService).setLanguage('en');
    const fixture = TestBed.createComponent(HomePageComponent);
    fixture.detectChanges();

    const actions = fixture.nativeElement.querySelector('.actions') as HTMLElement;
    const primaryAction = actions.querySelector('.button--primary') as HTMLButtonElement;
    const secondaryActions = actions.querySelectorAll('.button--ghost');

    expect(primaryAction.textContent).toContain('Play vs CPU');
    expect(secondaryActions).toHaveSize(2);
    expect(actions.querySelector('.multiplayer__label')?.textContent).toContain('1 vs 1 with a friend');
    expect(secondaryActions[0].textContent).toContain('Create match');
    expect(secondaryActions[1].textContent).toContain('Join with code');
    expect(actions.querySelector('.promise')?.textContent).toContain('Quick 1–2 minute matches. No signup required.');
  });
});
