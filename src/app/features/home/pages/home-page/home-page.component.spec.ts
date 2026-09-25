import { pickFeaturedCards } from './home-page.component';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
