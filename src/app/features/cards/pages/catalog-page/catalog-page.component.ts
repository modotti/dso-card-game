import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import cardsData from '../../../../../assets/data/cards.json';
import imageCredits from '../../../../../assets/data/image-credits.json';
import { TranslationService } from '../../../../core/i18n/translation.service';

interface CatalogEntry {
  readonly id: string;
  readonly catalogName: string;
  readonly commonName: string;
  readonly objectType: string;
  readonly constellation: string;
  readonly distanceLightYears: number;
  readonly apparentMagnitude: number;
  readonly apparentSizeArcmin: number;
  readonly physicalSizeLightYears: number;
  readonly sourceUrl: string;
  readonly image: {
    readonly asset: string;
    readonly collectionName: string;
    readonly photographer: string;
    readonly handle: string;
  } | null;
}

@Component({
  selector: 'app-catalog-page',
  templateUrl: './catalog-page.component.html',
  styleUrl: './catalog-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogPageComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly selectedCard = signal<CatalogEntry | null>(null);
  protected readonly cards: readonly CatalogEntry[] = cardsData.map((card) => {
    const image = imageCredits.find((credit) => credit.cardId === card.id);
    return { ...card, image: image ?? null };
  });

  openCard(card: CatalogEntry): void {
    this.selectedCard.set(card);
  }

  closeCard(): void {
    this.selectedCard.set(null);
  }

  format(value: number, maximumFractionDigits = 1): string {
    return value.toLocaleString(this.i18n.language(), { maximumFractionDigits });
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.closeCard();
  }
}
