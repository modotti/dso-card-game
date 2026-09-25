import { Injectable, computed, inject, signal } from '@angular/core';
import { AnalyticsService } from '../../../core/analytics/analytics.service';
import { DiscoveryService, type DiscoveryGameMode } from '../../cards/data-access/discovery.service';
import type { GameCard, RevealedCard } from '../../game/domain/game.models';
import {
  ACHIEVEMENTS,
  type AchievementDefinition,
  type AchievementId,
  type ObjectMacroCategory,
  objectMacroCategory,
} from '../domain/achievement-definitions';

const STORAGE_KEY = 'dsd-achievements';

interface MatchTracker {
  readonly processedRounds: readonly number[];
  readonly outcomes: readonly ('win' | 'loss')[];
  readonly hadClouds: boolean;
}

interface AchievementState {
  readonly unlockedIds: readonly AchievementId[];
  readonly wins: number;
  readonly winStreak: number;
  readonly hunterCardIds: Readonly<Record<ObjectMacroCategory, readonly string[]>>;
  readonly completedMatchIds: readonly string[];
  readonly matches: Readonly<Record<string, MatchTracker>>;
}

export interface AchievementView extends AchievementDefinition {
  readonly unlocked: boolean;
  readonly current: number | null;
  readonly targetValue: number | null;
}

export interface RoundAchievementInput {
  readonly matchId: string;
  readonly roundNumber: number;
  readonly playerId: string;
  readonly winnerId: string | null;
  readonly isCancelled: boolean;
  readonly revealedCards: readonly RevealedCard[];
  readonly gameMode: DiscoveryGameMode;
}

export interface MatchAchievementInput {
  readonly matchId: string;
  readonly result: 'win' | 'loss' | 'tie';
  readonly gameMode: DiscoveryGameMode;
  readonly cpuDifficulty?: 'easy' | 'medium' | 'hard';
}

const EMPTY_STATE: AchievementState = {
  unlockedIds: [],
  wins: 0,
  winStreak: 0,
  hunterCardIds: { nebula: [], galaxy: [], cluster: [] },
  completedMatchIds: [],
  matches: {},
};

@Injectable({ providedIn: 'root' })
export class AchievementService {
  private readonly analytics = inject(AnalyticsService);
  private readonly discovery = inject(DiscoveryService);
  private readonly state = signal<AchievementState>(this.read());

  readonly achievements = computed<readonly AchievementView[]>(() =>
    ACHIEVEMENTS.map((definition) => ({
      ...definition,
      unlocked: this.state().unlockedIds.includes(definition.id) || this.discoveryConditionMet(definition.id),
      current: this.progress(definition).current,
      targetValue: this.progress(definition).target,
    })),
  );
  readonly unlockedCount = computed(() => this.achievements().filter((item) => item.unlocked).length);
  readonly totalCount = ACHIEVEMENTS.length;

  syncDiscovery(gameMode?: DiscoveryGameMode): readonly AchievementId[] {
    return this.unlock(
      ['first-light', 'deep-sky-explorer', 'cosmic-surveyor', 'deep-sky-atlas'].filter((id) =>
        this.discoveryConditionMet(id as AchievementId),
      ) as AchievementId[],
      gameMode,
    );
  }

  recordRound(input: RoundAchievementInput): readonly AchievementId[] {
    const existing = this.state().matches[input.matchId] ?? { processedRounds: [], outcomes: [], hadClouds: false };
    if (existing.processedRounds.includes(input.roundNumber)) return [];

    const won = !input.isCancelled && input.winnerId === input.playerId;
    const localCard = input.revealedCards.find((selection) => selection.playerId === input.playerId)?.card;
    const opponentCard = input.revealedCards.find((selection) => selection.playerId !== input.playerId)?.card;
    const candidates: AchievementId[] = [];
    let hunterCardIds = this.state().hunterCardIds;

    if (won && localCard?.kind === 'astronomical') {
      const category = objectMacroCategory(localCard.objectType);
      if (category) {
        const ids = [...new Set([...hunterCardIds[category], localCard.id])];
        hunterCardIds = { ...hunterCardIds, [category]: ids };
        if (ids.length >= 5) candidates.push(`${category}-hunter` as AchievementId);
      }
    }
    if (won && localCard?.kind === 'effect' && opponentCard?.kind === 'astronomical') {
      const counter = this.successfulCounter(localCard, opponentCard);
      if (counter) candidates.push(counter);
    }

    const tracker: MatchTracker = {
      processedRounds: [...existing.processedRounds, input.roundNumber],
      outcomes: input.isCancelled || !input.winnerId ? existing.outcomes : [...existing.outcomes, won ? 'win' : 'loss'],
      hadClouds: existing.hadClouds || input.isCancelled,
    };
    this.update({
      ...this.state(),
      hunterCardIds,
      matches: { ...this.state().matches, [input.matchId]: tracker },
    });
    return this.unlock(candidates, input.gameMode);
  }

  recordMatch(input: MatchAchievementInput): readonly AchievementId[] {
    const state = this.state();
    if (state.completedMatchIds.includes(input.matchId)) return [];
    const won = input.result === 'win';
    const wins = state.wins + (won ? 1 : 0);
    const winStreak = won ? state.winStreak + 1 : input.result === 'loss' ? 0 : state.winStreak;
    const tracker = state.matches[input.matchId] ?? { processedRounds: [], outcomes: [], hadClouds: false };
    const candidates: AchievementId[] = [];
    if (wins >= 1) candidates.push('first-victory');
    if (wins >= 10) candidates.push('seasoned-observer');
    if (wins >= 25) candidates.push('deep-sky-veteran');
    if (winStreak >= 3) candidates.push('unstoppable');
    if (won && input.gameMode === 'cpu' && input.cpuDifficulty === 'hard') candidates.push('against-the-odds');
    if (won && !tracker.hadClouds) candidates.push('clear-skies');
    if (won && tracker.outcomes.length > 0 && tracker.outcomes.every((outcome) => outcome === 'win')) {
      candidates.push('perfect-observation');
    }
    if (won && tracker.outcomes[0] === 'loss' && tracker.outcomes[1] === 'loss') candidates.push('comeback');

    const remainingMatches = { ...state.matches };
    delete remainingMatches[input.matchId];
    this.update({
      ...state,
      wins,
      winStreak,
      completedMatchIds: [...state.completedMatchIds.slice(-99), input.matchId],
      matches: remainingMatches,
    });
    return this.unlock(candidates, input.gameMode);
  }

  reset(): void {
    this.state.set(EMPTY_STATE);
    this.persist(EMPTY_STATE);
    this.syncDiscovery();
  }

  private successfulCounter(effect: GameCard, opponent: GameCard): AchievementId | null {
    const category = objectMacroCategory(opponent.objectType);
    if (effect.effectKey === 'defeat_emission_nebula' && opponent.objectType === 'emission_nebula')
      return 'stellar-winds';
    if (effect.effectKey === 'defeat_galaxy' && category === 'galaxy') return 'cosmic-collision';
    if (effect.effectKey === 'defeat_star_cluster' && category === 'cluster') return 'tidal-disruption';
    return null;
  }

  private discoveryConditionMet(id: AchievementId): boolean {
    const count = this.discovery.discoveredCount();
    if (id === 'first-light') return count >= 1;
    if (id === 'deep-sky-explorer') return count >= 10;
    if (id === 'cosmic-surveyor') return count >= 25;
    if (id === 'deep-sky-atlas') return count === this.discovery.totalCount;
    return false;
  }

  private progress(definition: AchievementDefinition): { current: number | null; target: number | null } {
    if (!definition.progressKind) return { current: null, target: null };
    const target = definition.target === 'catalog' ? this.discovery.totalCount : (definition.target ?? null);
    const current =
      definition.progressKind === 'discoveries'
        ? this.discovery.discoveredCount()
        : definition.progressKind === 'wins'
          ? this.state().wins
          : definition.progressKind === 'streak'
            ? this.state().winStreak
            : this.state().hunterCardIds[definition.progressKind].length;
    return { current: Math.min(current, target ?? current), target };
  }

  private unlock(candidates: readonly AchievementId[], gameMode?: DiscoveryGameMode): readonly AchievementId[] {
    const fresh = [...new Set(candidates)].filter((id) => !this.state().unlockedIds.includes(id));
    if (!fresh.length) return [];
    this.update({ ...this.state(), unlockedIds: [...this.state().unlockedIds, ...fresh] });
    for (const id of fresh) this.analytics.track('achievement_unlocked', { achievement_id: id, game_mode: gameMode });
    return fresh;
  }

  private update(state: AchievementState): void {
    this.state.set(state);
    this.persist(state);
  }

  private read(): AchievementState {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_STATE;
      const value = raw as Partial<AchievementState>;
      const validIds = new Set(ACHIEVEMENTS.map((item) => item.id));
      const list = (items: unknown, valid?: ReadonlySet<string>): string[] =>
        Array.isArray(items)
          ? [
              ...new Set(
                items.filter((item): item is string => typeof item === 'string' && (!valid || valid.has(item))),
              ),
            ]
          : [];
      const matches: Record<string, MatchTracker> = {};
      if (value.matches && typeof value.matches === 'object' && !Array.isArray(value.matches)) {
        for (const [key, candidate] of Object.entries(value.matches)) {
          if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
          const tracker = candidate as Partial<MatchTracker>;
          matches[key] = {
            processedRounds: Array.isArray(tracker.processedRounds)
              ? [...new Set(tracker.processedRounds.filter((item) => Number.isInteger(item) && item > 0))]
              : [],
            outcomes: Array.isArray(tracker.outcomes)
              ? tracker.outcomes.filter((item): item is 'win' | 'loss' => item === 'win' || item === 'loss')
              : [],
            hadClouds: tracker.hadClouds === true,
          };
        }
      }
      return {
        unlockedIds: list(value.unlockedIds, validIds) as AchievementId[],
        wins: Number.isInteger(value.wins) && (value.wins ?? -1) >= 0 ? value.wins! : 0,
        winStreak: Number.isInteger(value.winStreak) && (value.winStreak ?? -1) >= 0 ? value.winStreak! : 0,
        hunterCardIds: {
          nebula: list(value.hunterCardIds?.nebula),
          galaxy: list(value.hunterCardIds?.galaxy),
          cluster: list(value.hunterCardIds?.cluster),
        },
        completedMatchIds: list(value.completedMatchIds),
        matches,
      };
    } catch {
      return EMPTY_STATE;
    }
  }

  private persist(state: AchievementState): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Local progression must never interfere with gameplay.
    }
  }
}
