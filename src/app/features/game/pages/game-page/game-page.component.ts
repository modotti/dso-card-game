import type { OnDestroy, OnInit } from '@angular/core';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AnalyticsService } from '../../../../core/analytics/analytics.service';
import { BackgroundAudioService } from '../../../../core/audio/background-audio.service';
import { TranslationService } from '../../../../core/i18n/translation.service';
import type { AttributeDefinition, CardAttributeValue, GameCard, RevealedCard } from '../../domain/game.models';
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
  private readonly analytics = inject(AnalyticsService);
  private readonly backgroundAudio = inject(BackgroundAudioService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly selectedCard = signal<string | null>(null);
  protected readonly currentCardIndex = signal(1);
  protected readonly busy = signal(false);
  protected readonly secondsRemaining = signal(0);
  protected readonly nextRoundSeconds = signal(0);
  protected readonly rematchSeconds = signal(0);
  protected readonly showFinalModal = signal(false);
  private readonly code = this.route.snapshot.paramMap.get('code') ?? '';
  private timer?: ReturnType<typeof setInterval>;
  private finalModalTimer?: ReturnType<typeof setTimeout>;
  private resolvingTimeout = false;
  private lastResolutionAttempt = 0;
  private finalModalScheduled = false;
  private previousRoundNumber: number | null = null;
  private previousRoundStatus: string | null = null;

  constructor() {
    effect(() => {
      const game = this.facade.game();
      const playerId = this.facade.playerId();
      if (!game || !playerId) return;
      const gameMode = this.gameMode();
      const eventIdentity = `${game.id}:${game.matchNumber}:${playerId}`;
      this.analytics.trackOnce('game_started', eventIdentity, {
        game_id: game.id,
        game_mode: gameMode,
      });
      if (game.round.status === 'resolved') {
        const result = this.roundResult();
        this.analytics.trackOnce('round_completed', `${eventIdentity}:${game.round.number}`, {
          game_id: game.id,
          game_mode: gameMode,
          round_number: game.round.number,
          result,
        });
        this.backgroundAudio.playRoundResult(result, `${game.id}:${game.matchNumber}:${game.round.number}`);
      }
      if (game.status === 'finished') {
        this.analytics.trackOnce('game_completed', eventIdentity, {
          game_id: game.id,
          game_mode: gameMode,
          rounds_played: game.round.number,
          result: this.gameResult(),
        });
      }
    });
    effect(() => {
      const finished = this.facade.game()?.status === 'finished';
      this.backgroundAudio.setGameFinished(finished);
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
      const canAdvance = game?.round.status === 'resolved' && game.status !== 'finished' && this.canAdvanceRound();
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
    effect((onCleanup) => {
      const game = this.facade.game();
      const cpu = this.facade.cpuPlayer();
      const cpuMustPlay =
        !!game &&
        !!cpu &&
        ((game.round.status === 'choosing_attribute' && game.round.activePlayerId === cpu.id) ||
          (game.round.status === 'choosing_cards' && !game.round.selectedPlayerIds.includes(cpu.id)));
      if (!cpuMustPlay) return;
      const cpuTimer = setTimeout(() => void this.facade.playCpuTurn().catch(() => undefined), 1200);
      onCleanup(() => clearTimeout(cpuTimer));
    });
    effect(() => {
      const round = this.facade.game()?.round;
      if (!round) return;
      const roundChanged = this.previousRoundNumber !== null && this.previousRoundNumber !== round.number;
      const statusChanged = this.previousRoundStatus !== null && this.previousRoundStatus !== round.status;
      const movedToCardChoice =
        !roundChanged && this.previousRoundStatus === 'choosing_attribute' && round.status === 'choosing_cards';
      this.previousRoundNumber = round.number;
      this.previousRoundStatus = round.status;
      if (!roundChanged && !statusChanged) return;
      if (roundChanged) {
        this.selectedCard.set(null);
        this.currentCardIndex.set(1);
      }
      if (!window.matchMedia('(max-width: 500px)').matches) return;
      requestAnimationFrame(() => {
        if (movedToCardChoice) {
          document.getElementById('player-hand')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
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
    const game = this.facade.game();
    const playerId = this.facade.playerId();
    if (game && playerId && game.status !== 'finished') {
      this.analytics.trackOnce('game_abandoned', `${game.id}:${playerId}`, {
        game_id: game.id,
        game_mode: this.gameMode(),
        rounds_played: game.round.status === 'resolved' ? game.round.number : Math.max(0, game.round.number - 1),
        disconnect_reason: 'explicit_exit',
      });
    }
    void this.router.navigate(['/']);
  }
  createGame(): void {
    void this.router.navigate(['/'], { queryParams: { action: 'create' } });
  }
  async playAgain(): Promise<void> {
    await this.run(async () => {
      const previousGameId = this.facade.game()?.id;
      if (!previousGameId) return;
      this.analytics.track('rematch_requested', { game_id: previousGameId, game_mode: 'cpu' });
      const rematch = await this.facade.createCpuRematch();
      this.analytics.track('rematch_started', {
        game_id: rematch.gameId,
        previous_game_id: previousGameId,
        game_mode: 'cpu',
      });
      this.backgroundAudio.setGameFinished(false);
      this.showFinalModal.set(false);
      await this.router.navigate(['/game', rematch.code]);
      await this.facade.reconnect(rematch.code);
    });
  }
  async requestRematch(): Promise<void> {
    const game = this.facade.game();
    if (!game) return;
    this.analytics.track('rematch_requested', {
      game_id: game.id,
      match_number: game.matchNumber,
      game_mode: 'multiplayer',
    });
    await this.run(() => this.facade.requestRematch());
  }
  async cancelRematch(): Promise<void> {
    await this.run(() => this.facade.cancelRematch());
  }
  hasRequestedRematch(): boolean {
    const playerId = this.facade.playerId();
    return (
      this.rematchSeconds() > 0 && !!playerId && !!this.facade.game()?.rematch.requestedPlayerIds.includes(playerId)
    );
  }
  opponentRequestedRematch(): boolean {
    const playerId = this.facade.playerId();
    return (
      this.rematchSeconds() > 0 &&
      !!this.facade.game()?.rematch.requestedPlayerIds.some((requestedId) => requestedId !== playerId)
    );
  }
  attributeLabel(value: string | null): string {
    if (!value) return '';
    const definition = this.facade.game()?.availableAttributes.find((attribute) => attribute.id === value);
    return definition ? this.i18n.text(definition.labelKey) : value;
  }
  isCompatible(card: GameCard): boolean {
    return (
      card.kind === 'effect' ||
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
  orderedRevealedCards(cards: readonly RevealedCard[], winnerId: string | null): readonly RevealedCard[] {
    const priority = (selection: RevealedCard): number =>
      selection.card.kind === 'effect' ? 2 : selection.playerId === winnerId ? 1 : 0;
    return [...cards].sort((first, second) => priority(second) - priority(first));
  }
  isFinalWinner(playerId: string): boolean {
    const players = this.facade.game()?.players;
    if (!players || players.length < 2 || players[0].score === players[1].score) return false;
    return (
      players.find((player) => player.id === playerId)?.score === Math.max(...players.map((player) => player.score))
    );
  }
  isMyAction(): boolean {
    const game = this.facade.game();
    if (!game) return false;
    if (game.round.status === 'choosing_attribute') return this.facade.isActivePlayer();
    if (game.round.status === 'choosing_cards') return !this.facade.hasSelected();
    return false;
  }
  canAdvanceRound(): boolean {
    const game = this.facade.game();
    return !!game && (!!this.facade.cpuPlayer() || game.round.activePlayerId !== this.facade.playerId());
  }
  private gameMode(): 'cpu' | 'multiplayer' {
    return this.facade.cpuPlayer() ? 'cpu' : 'multiplayer';
  }
  private roundResult(): 'win' | 'loss' | 'tie' | 'cancelled' {
    const round = this.facade.game()?.round;
    if (!round || round.isCancelled) return 'cancelled';
    if (round.isTie) return 'tie';
    return round.winnerId === this.facade.playerId() ? 'win' : 'loss';
  }
  private gameResult(): 'win' | 'loss' | 'tie' {
    const game = this.facade.game();
    const playerId = this.facade.playerId();
    if (!game || !playerId) return 'tie';
    const player = game.players.find((item) => item.id === playerId);
    const opponent = game.players.find((item) => item.id !== playerId);
    if (!player || !opponent || player.score === opponent.score) return 'tie';
    return player.score > opponent.score ? 'win' : 'loss';
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
    const game = this.facade.game();
    const rematchDeadline = game?.rematch.expiresAt;
    this.rematchSeconds.set(
      rematchDeadline ? Math.max(0, Math.ceil((new Date(rematchDeadline).getTime() - Date.now()) / 1000)) : 0,
    );
    const deadline = game?.round.actionDeadline;
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
