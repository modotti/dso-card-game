import { TestBed } from '@angular/core/testing';
import { CatalogPageComponent } from './catalog-page.component';

describe('CatalogPageComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('dsd-language', 'en');
    TestBed.configureTestingModule({
      imports: [CatalogPageComponent],
    });
  });

  it('renders every card in the collection', () => {
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.catalog-card')).toHaveSize(44);
    expect(fixture.nativeElement.querySelectorAll('.catalog-card--special')).toHaveSize(4);
  });

  it('opens and closes the card details modal', () => {
    localStorage.setItem('dsd-discovered-card-ids', JSON.stringify(['m16']));
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.catalog-card') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.card-modal')).not.toBeNull();

    (fixture.nativeElement.querySelector('.card-modal__close') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.card-modal')).toBeNull();
  });

  it('hides undiscovered card identities while preserving image credits', () => {
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();

    const firstCard = fixture.nativeElement.querySelector('.catalog-card') as HTMLButtonElement;
    expect(firstCard.classList).toContain('catalog-card--undiscovered');
    expect(firstCard.textContent).toContain('Undiscovered Object');
    expect(firstCard.textContent).not.toContain('Eagle Nebula');
    expect(firstCard.textContent).toContain('Fernando Modotti');
    firstCard.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.card-modal')).toBeNull();
  });

  it('shows discovered progress and resets it after confirmation', () => {
    localStorage.setItem('dsd-discovered-card-ids', JSON.stringify(['m16']));
    spyOn(window, 'confirm').and.returnValue(true);
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.discovery-progress strong').textContent).toContain('1 / 40');
    (fixture.nativeElement.querySelector('.discovery-progress button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.discovery-progress strong').textContent).toContain('0 / 40');
  });

  it('opens the special card details modal', () => {
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.catalog-card--special') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.card-modal--special')).not.toBeNull();
  });
});
