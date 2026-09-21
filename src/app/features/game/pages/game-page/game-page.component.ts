import type { OnDestroy, OnInit } from '@angular/core';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslationService } from '../../../../core/i18n/translation.service';
import type { AttributeDefinition, CardAttributeValue, GameCard } from '../../domain/game.models';
import { GameFacade } from '../../state/game.facade';
import { GameCardComponent } from '../../ui/game-card/game-card.component';

@Component({
  selector: 'app-game-page',
  imports: [GameCardComponent],
  providers: [GameFacade],
  templateUrl: './game-page.component.html',
  styleUrl: './game-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamePageComponent implements OnInit, OnDestroy {
  protected readonly facade = inject(GameFacade);
  protected readonly i18n = inject(TranslationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly selectedCard = signal<string | null>(null);
  protected readonly currentCardIndex = signal(1);
  protected readonly busy = signal(false);
  protected readonly secondsRemaining = signal(0);
  protected readonly nextRoundSeconds = signal(0);
  protected readonly showFinalModal = signal(false);
  private readonly code = this.route.snapshot.paramMap.get('code') ?? '';
  private timer?: ReturnType<typeof setInterval>;
  private finalModalTimer?: ReturnType<typeof setTimeout>;
  private resolvingTimeout = false;
  private lastResolutionAttempt = 0;
  private finalModalScheduled = false;
  private previousRoundNumber: number | null = null;

  constructor() {
    effect(() => {
      const finished = this.facade.game()?.status === 'finished';
      if (finished && !this.finalModalScheduled) {
        this.finalModalScheduled = true;
        this.finalModalTimer = setTimeout(() => this.showFinalModal.set(true), 2500);
      } else if (!finished) {
        this.finalModalScheduled = false;
        this.showFinalModal.set(false);
      }
    });
    effect((onCleanup) => {
      const game = this.facade.game();
      const canAdvance =
        game?.round.status === 'resolved' &&
        game.status !== 'finished' &&
        game.round.activePlayerId !== this.facade.playerId();
      if (!canAdvance) {
        this.nextRoundSeconds.set(0);
        return;
      }

      const deadline = Date.now() + 5000;
      const tick = (): void => {
        const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        this.nextRoundSeconds.set(remaining);
        if (remaining === 0 && !this.busy()) {
          clearInterval(interval);
          void this.advance().catch(() => undefined);
        }
      };
      const interval = setInterval(tick, 250);
      tick();
      onCleanup(() => clearInterval(interval));
    });
    effect(() => {
      const roundNumber = this.facade.game()?.round.number;
      if (roundNumber === undefined) return;
      if (this.previousRoundNumber !== null && roundNumber !== this.previousRoundNumber) {
        this.selectedCard.set(null);
        this.currentCardIndex.set(1);
        requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      }
      this.previousRoundNumber = roundNumber;
    });
  }

  ngOnInit(): void {
    void this.facade.connect(this.code);
    this.timer = setInterval(() => void this.updateTimer(), 250);
  }
  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.finalModalTimer) clearTimeout(this.finalModalTimer);
    void this.facade.disconnect();
  }
  async chooseAttribute(value: string): Promise<void> {
    await this.run(() => this.facade.chooseAttribute(value));
  }
  selectCard(card: GameCard): void {
    if (
      this.facade.game()?.round.status === 'choosing_cards' &&
      !this.facade.hasSelected() &&
      this.isCompatible(card)
    ) {
      if (this.selectedCard() === card.id) {
        void this.confirmCard();
      } else {
        this.selectedCard.set(card.id);
      }
    }
  }
  async confirmCard(): Promise<void> {
    const id = this.selectedCard();
    if (id) await this.run(() => this.facade.chooseCard(id));
  }
  async advance(): Promise<void> {
    this.selectedCard.set(null);
    this.currentCardIndex.set(1);
    await this.run(() => this.facade.advance());
  }
  updateCarouselIndex(event: Event): void {
    const carousel = event.currentTarget as HTMLElement;
    const cards = Array.from(carousel.children) as HTMLElement[];
    if (!cards.length) return;
    const step = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : cards[0].offsetWidth;
    this.currentCardIndex.set(Math.min(cards.length, Math.round(carousel.scrollLeft / step) + 1));
  }
  leave(): void {
    void this.router.navigate(['/']);
  }
  createGame(): void {
    void this.router.navigate(['/'], { queryParams: { action: 'create' } });
  }
  attributeLabel(value: string | null): string {
    if (!value) return '';
    const definition = this.facade.game()?.availableAttributes.find((attribute) => attribute.id === value);
    return definition ? this.i18n.text(definition.labelKey) : value;
  }
  isCompatible(card: GameCard): boolean {
    return (
      !this.facade.game()?.round.attribute ||
      card.attributes.some(
        (attribute) => attribute.id === this.facade.game()?.round.attribute && attribute.value !== null,
      )
    );
  }
  formatAttribute(attribute: CardAttributeValue | AttributeDefinition, value: number | null): string {
    if (value === null) return this.i18n.text('attribute.notApplicable');
    const formatted = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return attribute.unit === 'arcmin'
      ? `${formatted}′`
      : attribute.unit === 'mag'
        ? formatted
        : `${formatted} ${attribute.unit}`;
  }
  value(card: GameCard, attributeId: string | null): string {
    const attribute = card.attributes.find((item) => item.id === attributeId);
    return attribute ? this.formatAttribute(attribute, attribute.value) : this.i18n.text('attribute.notApplicable');
  }
  playerName(id: string | null): string {
    return this.facade.game()?.players.find((player) => player.id === id)?.displayName ?? '';
  }
  isMyAction(): boolean {
    const game = this.facade.game();
    if (!game) return false;
    if (game.round.status === 'choosing_attribute') return this.facade.isActivePlayer();
    if (game.round.status === 'choosing_cards') return !this.facade.hasSelected();
    return false;
  }
  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } finally {
      this.busy.set(false);
    }
  }

  private async updateTimer(): Promise<void> {
    const deadline = this.facade.game()?.round.actionDeadline;
    if (!deadline) {
      this.secondsRemaining.set(0);
      return;
    }
    const remaining = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
    this.secondsRemaining.set(remaining);
    if (remaining > 0 || this.resolvingTimeout || Date.now() - this.lastResolutionAttempt < 2000) return;
    this.resolvingTimeout = true;
    this.lastResolutionAttempt = Date.now();
    try {
      await this.facade.resolveExpired();
    } catch {
      return;
    } finally {
      this.resolvingTimeout = false;
    }
  }
}
