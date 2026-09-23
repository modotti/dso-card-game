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
    return this.card().effectKey === 'cancel_round'
      ? '/assets/cards/clouds.jpg'
      : (this.card().image?.src ?? `/assets/cards/${this.card().id}.jpg`);
  }
  protected cardName(): string {
    return this.card().effectKey === 'cancel_round' ? this.i18n.text('card.clouds.name') : this.card().commonName;
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
