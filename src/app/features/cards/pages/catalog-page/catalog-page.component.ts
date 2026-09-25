import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import cardsData from '../../../../../assets/data/cards.json';
import imageCredits from '../../../../../assets/data/image-credits.json';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { DiscoveryService } from '../../data-access/discovery.service';

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

interface SpecialCatalogEntry {
  readonly id: string;
  readonly effectKey: string;
  readonly asset: string;
}

@Component({
  selector: 'app-catalog-page',
  templateUrl: './catalog-page.component.html',
  styleUrl: './catalog-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogPageComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly discovery = inject(DiscoveryService);
  protected readonly selectedCard = signal<CatalogEntry | null>(null);
  protected readonly selectedSpecialCard = signal<SpecialCatalogEntry | null>(null);
  protected readonly cards: readonly CatalogEntry[] = cardsData.map((card) => {
    const image = imageCredits.find((credit) => credit.cardId === card.id);
    return { ...card, image: image ?? null };
  });
  protected readonly specialCards: readonly SpecialCatalogEntry[] = [
    { id: 'clouds', effectKey: 'cancel_round', asset: '/assets/cards/clouds.jpg' },
    {
      id: 'stellar-winds',
      effectKey: 'defeat_emission_nebula',
      asset: '/assets/cards/stellar-winds.jpg',
    },
    {
      id: 'galactic-collision',
      effectKey: 'defeat_galaxy',
      asset: '/assets/cards/galactic-collision.jpg',
    },
    {
      id: 'tidal-disruption',
      effectKey: 'defeat_star_cluster',
      asset: '/assets/cards/tidal-disruption.jpg',
    },
  ];

  openCard(card: CatalogEntry): void {
    if (!this.discovery.isDiscovered(card.id)) return;
    this.selectedCard.set(card);
  }

  resetDiscovery(): void {
    if (window.confirm(this.i18n.text('catalog.discovery.resetConfirm'))) this.discovery.reset();
  }

  openSpecialCard(card: SpecialCatalogEntry): void {
    this.selectedSpecialCard.set(card);
  }

  closeCard(): void {
    this.selectedCard.set(null);
    this.selectedSpecialCard.set(null);
  }

  format(value: number, maximumFractionDigits = 1): string {
    return value.toLocaleString(this.i18n.language(), { maximumFractionDigits });
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.closeCard();
  }
}
