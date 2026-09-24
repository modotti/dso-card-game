import { ChangeDetectionStrategy, Component, input, inject } from '@angular/core';
import { TranslationService } from '../../../../core/i18n/translation.service';
import type { CardAttributeValue, GameCard } from '../../domain/game.models';

@Component({
  selector: 'app-game-card',
  templateUrl: './game-card.component.html',
  styleUrl: './game-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameCardComponent {
  readonly card = input.required<GameCard>();
  readonly attribute = input<string | null>(null);
  readonly ownerLabel = input<string>('');
  readonly selected = input(false);
  readonly winner = input(false);
  readonly imagePriority = input(false);
  protected readonly i18n = inject(TranslationService);
  protected imageSource(): string {
    const specialImages: Readonly<Record<string, string>> = {
      cancel_round: '/assets/cards/clouds.jpg',
      defeat_emission_nebula: '/assets/cards/stellar-winds.jpg',
      defeat_galaxy: '/assets/cards/galactic-collision.jpg',
      defeat_star_cluster: '/assets/cards/tidal-disruption.jpg',
    };
    const effectKey = this.card().effectKey;
    const effectImage = effectKey ? specialImages[effectKey] : null;
    return effectImage ?? this.card().image?.src ?? `/assets/cards/${this.card().id}.jpg`;
  }
  protected cardName(): string {
    return this.card().effectKey ? this.i18n.text(`card.effect.${this.card().effectKey}.name`) : this.card().commonName;
  }
  protected effectText(part: 'effect' | 'description'): string {
    return this.i18n.text(`card.effect.${this.card().effectKey}.${part}`);
  }
  protected objectTypeLabel(): string {
    return this.i18n.text(`objectType.${this.card().objectType}`);
  }
  protected highlightedValue(): string {
    const attribute = this.card().attributes.find((item) => item.id === this.attribute());
    return attribute && attribute.value !== null ? this.format(attribute) : this.i18n.text('attribute.notApplicable');
  }
  protected format(attribute: CardAttributeValue): string {
    if (attribute.value === null) return this.i18n.text('attribute.notApplicable');
    const value = attribute.value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return attribute.unit === 'arcmin' ? `${value}′` : attribute.unit === 'mag' ? value : `${value} ${attribute.unit}`;
  }
}
