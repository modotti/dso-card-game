import { ChangeDetectionStrategy, Component, HostListener, inject, signal, viewChild } from '@angular/core';
import type { ElementRef } from '@angular/core';
import cardsData from '../../../../../assets/data/cards.json';
import imageCredits from '../../../../../assets/data/image-credits.json';
import { TranslationService } from '../../../../core/i18n/translation.service';
import type { CardAttributeValue, GameCard } from '../../../game/domain/game.models';
import { GameCardComponent } from '../../../game/ui/game-card/game-card.component';
import { CardShareService } from '../../data-access/card-share.service';
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
  imports: [GameCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogPageComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly discovery = inject(DiscoveryService);
  private readonly cardShare = inject(CardShareService);
  private readonly exportCard = viewChild<ElementRef<HTMLElement>>('exportCard');
  protected readonly selectedCard = signal<CatalogEntry | null>(null);
  protected readonly selectedSpecialCard = signal<SpecialCatalogEntry | null>(null);
  protected readonly isExporting = signal(false);
  protected readonly shareError = signal(false);
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
    this.shareError.set(false);
  }

  protected asGameCard(card: CatalogEntry): GameCard {
    const attributes: readonly CardAttributeValue[] = [
      this.attribute('distance_light_years', 'attribute.distance', 'ly', 'higher_wins', 1, card.distanceLightYears),
      this.attribute(
        'apparent_magnitude',
        'attribute.apparentMagnitude',
        'mag',
        'lower_wins',
        2,
        card.apparentMagnitude,
      ),
      this.attribute(
        'apparent_size_arcmin',
        'attribute.apparentSize',
        'arcmin',
        'higher_wins',
        3,
        card.apparentSizeArcmin,
      ),
      this.attribute(
        'physical_size_light_years',
        'attribute.physicalSize',
        'ly',
        'higher_wins',
        4,
        card.physicalSizeLightYears,
      ),
    ];

    return {
      id: card.id,
      kind: 'astronomical',
      effectKey: null,
      catalogName: card.catalogName,
      commonName: card.commonName,
      objectType: card.objectType,
      constellation: card.constellation,
      image: card.image
        ? {
            id: `${card.id}-catalog`,
            src: card.image.asset,
            collectionName: card.image.collectionName,
            photographerName: card.image.photographer,
            photographerHandle: card.image.handle || null,
          }
        : null,
      attributes,
    };
  }

  protected async shareCard(card: CatalogEntry): Promise<void> {
    const node = this.exportCard()?.nativeElement;
    if (!node || this.isExporting()) return;

    this.isExporting.set(true);
    this.shareError.set(false);
    try {
      const image = await this.cardShare.createImage(node);
      await this.cardShare.shareOrDownload(image, card.commonName);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.shareError.set(true);
    } finally {
      this.isExporting.set(false);
    }
  }

  format(value: number, maximumFractionDigits = 1): string {
    return value.toLocaleString(this.i18n.language(), { maximumFractionDigits });
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.closeCard();
  }

  private attribute(
    id: string,
    labelKey: string,
    unit: string,
    comparison: CardAttributeValue['comparison'],
    displayOrder: number,
    value: number,
  ): CardAttributeValue {
    return { id, labelKey, unit, comparison, displayOrder, value, isApproximate: true };
  }
}
