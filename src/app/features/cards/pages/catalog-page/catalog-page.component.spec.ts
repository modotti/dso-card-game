import { TestBed } from '@angular/core/testing';
import { CatalogPageComponent } from './catalog-page.component';

describe('CatalogPageComponent', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [CatalogPageComponent],
    }),
  );

  it('renders every card in the collection', () => {
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.catalog-card')).toHaveSize(33);
  });

  it('opens and closes the card details modal', () => {
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.catalog-card') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.card-modal')).not.toBeNull();

    (fixture.nativeElement.querySelector('.card-modal__close') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.card-modal')).toBeNull();
  });
});
