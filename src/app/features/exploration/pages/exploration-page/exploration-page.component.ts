import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { ElementRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import cardsData from '../../../../../assets/data/cards.json';
import imageCredits from '../../../../../assets/data/image-credits.json';
import { AnalyticsService } from '../../../../core/analytics/analytics.service';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { DiscoveryService } from '../../../cards/data-access/discovery.service';
import type { CardAttributeValue, GameCard } from '../../../game/domain/game.models';
import { GameCardComponent } from '../../../game/ui/game-card/game-card.component';
import { ExplorationProgressService } from '../../data-access/exploration-progress.service';
import {
  advanceExplorationProgress,
  chooseEducationalContent,
  pairRatio,
  resolveExplorationChoice,
  selectExplorationRound,
} from '../../domain/exploration-rules';
import type { ExplorationResult, ExplorationRound, ExplorationStatus } from '../../domain/exploration.models';

interface RawExplorationCard {
  readonly id: string;
  readonly catalogName: string;
  readonly commonName: string;
  readonly objectType: string;
  readonly constellation: string;
  readonly distanceLightYears: number;
  readonly apparentMagnitude: number;
  readonly apparentSizeArcmin: number;
  readonly physicalSizeLightYears: number;
  readonly educationalFacts?: readonly string[];
}

function toGameCard(card: RawExplorationCard): GameCard {
  const credit = imageCredits.find((item) => item.cardId === card.id);
  const value = (
    id: string,
    labelKey: string,
    unit: string,
    comparison: CardAttributeValue['comparison'],
    displayOrder: number,
    amount: number,
    isApproximate = false,
  ): CardAttributeValue => ({ id, labelKey, unit, comparison, displayOrder, value: amount, isApproximate });
  return {
    id: card.id,
    kind: 'astronomical',
    effectKey: null,
    catalogName: card.catalogName,
    commonName: card.commonName,
    objectType: card.objectType,
    constellation: card.constellation,
    image: credit
      ? {
          id: credit.id,
          src: credit.asset,
          collectionName: credit.collectionName,
          photographerName: credit.photographer,
          photographerHandle: credit.handle,
        }
      : null,
    attributes: [
      value('distance_light_years', 'attribute.distance', 'ly', 'higher_wins', 1, card.distanceLightYears, true),
      value('apparent_magnitude', 'attribute.apparentMagnitude', 'mag', 'lower_wins', 2, card.apparentMagnitude),
      value('apparent_size_arcmin', 'attribute.apparentSize', 'arcmin', 'higher_wins', 3, card.apparentSizeArcmin),
      value(
        'physical_size_light_years',
        'attribute.physicalSize',
        'ly',
        'higher_wins',
        4,
        card.physicalSizeLightYears,
        true,
      ),
    ],
    educationalFacts: card.educationalFacts,
  };
}

@Component({
  selector: 'app-exploration-page',
  imports: [RouterLink, GameCardComponent],
  templateUrl: './exploration-page.component.html',
  styleUrl: './exploration-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorationPageComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly progress = inject(ExplorationProgressService);
  private readonly analytics = inject(AnalyticsService);
  private readonly discovery = inject(DiscoveryService);
  private readonly cards = cardsData.map(toGameCard);
  protected readonly streak = signal(0);
  protected readonly status = signal<ExplorationStatus>('choosing');
  protected readonly round = signal<ExplorationRound>(selectExplorationRound(this.cards, 0));
  protected readonly choiceId = signal<string | null>(null);
  protected readonly result = signal<ExplorationResult | null>(null);
  protected readonly factKey = signal<string>('');
  private previousIds: readonly string[] = [];

  protected readonly attributeKey = computed(() => `exploration.attribute.${this.round().attribute}`);
  protected readonly questionKey = computed(() => `exploration.question.${this.round().attribute}`);
  protected readonly ruleKey = computed(() =>
    this.round().attribute === 'apparent_magnitude' ? 'exploration.rule.lower' : 'exploration.rule.higher',
  );
  protected readonly comparison = computed(() => this.comparisonText());
  private readonly resultPanel = viewChild<ElementRef<HTMLElement>>('roundResult');
  private readonly roundIntro = viewChild<ElementRef<HTMLElement>>('roundIntro');

  constructor() {
    this.revealDiscoveries();
    this.analytics.track('exploration_started');
    afterNextRender(() => this.scrollToRoundIntro());
  }

  protected choose(card: GameCard): void {
    if (this.status() !== 'choosing') return;
    const result = resolveExplorationChoice(this.round().cards, this.round().attribute, card.id);
    this.choiceId.set(card.id);
    this.result.set(result);
    const winner = this.round().cards.find((item) => item.id === result.winnerId) ?? null;
    this.factKey.set(chooseEducationalContent(this.round(), winner).key);
    this.status.set('revealed');
    const progress = advanceExplorationProgress(this.streak(), result);
    this.streak.set(progress.streak);
    this.progress.record(progress.streak);
    this.analytics.track('exploration_round_completed', {
      streak: this.streak(),
      result: result.isCorrect ? 'correct' : 'incorrect',
      attribute: this.round().attribute,
    });
    if (progress.complete) {
      this.analytics.track('exploration_completed', { streak: this.streak() });
    }
    requestAnimationFrame(() => {
      const panel = this.resultPanel()?.nativeElement;
      panel?.focus({ preventScroll: true });
      panel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  protected next(): void {
    if (!this.result()?.isCorrect) return void this.status.set('complete');
    this.previousIds = this.round().cards.map((card) => card.id);
    this.round.set(selectExplorationRound(this.cards, this.streak(), Math.random, this.previousIds));
    this.choiceId.set(null);
    this.result.set(null);
    this.factKey.set('');
    this.status.set('choosing');
    this.revealDiscoveries();
    requestAnimationFrame(() => this.scrollToRoundIntro());
  }

  protected restart(): void {
    this.streak.set(0);
    this.previousIds = [];
    this.round.set(selectExplorationRound(this.cards, 0));
    this.choiceId.set(null);
    this.result.set(null);
    this.factKey.set('');
    this.status.set('choosing');
    this.revealDiscoveries();
    this.analytics.track('exploration_started');
    requestAnimationFrame(() => this.scrollToRoundIntro());
  }

  protected winner(card: GameCard): boolean {
    return this.result()?.winnerId === card.id;
  }

  private revealDiscoveries(): void {
    this.discovery.discoverRevealed(this.round().cards, 'exploration');
  }

  private scrollToRoundIntro(): void {
    const intro = this.roundIntro()?.nativeElement;
    intro?.focus({ preventScroll: true });
    intro?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private comparisonText(): string {
    const ratio = pairRatio(this.round());
    const result = this.result();
    if (!ratio || !result?.winnerId) return '';
    const winner = this.round().cards.find((card) => card.id === result.winnerId);
    const loser = this.round().cards.find((card) => card.id !== result.winnerId);
    if (!winner || !loser) return '';
    const rounded = ratio >= 100 ? Math.round(ratio) : Number(ratio.toFixed(1));
    const template = this.i18n.text(`exploration.comparison.${this.round().attribute}`);
    return template
      .replace('{winner}', winner.catalogName)
      .replace('{loser}', loser.catalogName)
      .replace('{ratio}', rounded.toLocaleString(this.i18n.language()));
  }
}
