export type AttributeComparison = 'higher_wins' | 'lower_wins';
export type RoundStatus = 'choosing_attribute' | 'choosing_cards' | 'resolved';
export interface AttributeDefinition {
  readonly id: string;
  readonly labelKey: string;
  readonly unit: string;
  readonly comparison: AttributeComparison;
  readonly displayOrder: number;
}
export interface CardAttributeValue extends AttributeDefinition {
  readonly value: number | null;
  readonly isApproximate: boolean;
}
export interface GameCard {
  readonly id: string;
  readonly catalogName: string;
  readonly commonName: string;
  readonly objectType: string;
  readonly constellation: string;
  readonly attributes: readonly CardAttributeValue[];
}
export interface GamePlayer {
  readonly id: string;
  readonly displayName: string;
  readonly seat: number;
  readonly score: number;
  readonly isCpu: boolean;
}
export interface RevealedCard {
  readonly playerId: string;
  readonly card: GameCard;
}
export interface GameRound {
  readonly number: number;
  readonly activePlayerId: string;
  readonly status: RoundStatus;
  readonly attribute: string | null;
  readonly winnerId: string | null;
  readonly isTie: boolean;
  readonly actionDeadline: string | null;
  readonly selectedPlayerIds: readonly string[];
  readonly revealedCards: readonly RevealedCard[];
}
export interface GameView {
  readonly id: string;
  readonly code: string;
  readonly status: 'in_progress' | 'finished';
  readonly rules: { readonly handSize: number; readonly roundsToPlay: number; readonly actionTimeoutSeconds: number };
  readonly players: readonly GamePlayer[];
  readonly availableAttributes: readonly AttributeDefinition[];
  readonly hand: readonly GameCard[];
  readonly round: GameRound;
}
