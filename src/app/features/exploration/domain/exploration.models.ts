import type { GameCard } from '../../game/domain/game.models';

export const EXPLORATION_ATTRIBUTES = [
  'distance_light_years',
  'apparent_magnitude',
  'apparent_size_arcmin',
  'physical_size_light_years',
] as const;

export type ExplorationAttribute = (typeof EXPLORATION_ATTRIBUTES)[number];
export type ExplorationStatus = 'choosing' | 'revealed' | 'complete';

export interface ExplorationRound {
  readonly attribute: ExplorationAttribute;
  readonly cards: readonly [GameCard, GameCard];
}

export interface ExplorationResult {
  readonly winnerId: string | null;
  readonly isTie: boolean;
  readonly isCorrect: boolean;
}

export interface EducationalContent {
  readonly key: string;
  readonly source: 'contextual' | 'card' | 'type' | 'attribute';
}
