import type { GameCard } from '../../game/domain/game.models';
import {
  EXPLORATION_ATTRIBUTES,
  type EducationalContent,
  type ExplorationAttribute,
  type ExplorationResult,
  type ExplorationRound,
} from './exploration.models';

export function attributeValue(card: GameCard, attribute: ExplorationAttribute): number {
  const value = card.attributes.find((item) => item.id === attribute)?.value;
  if (value === null || value === undefined) throw new Error(`Missing exploration attribute: ${attribute}`);
  return value;
}

export function resolveExplorationChoice(
  cards: readonly [GameCard, GameCard],
  attribute: ExplorationAttribute,
  chosenId: string,
): ExplorationResult {
  const [left, right] = cards;
  const leftValue = attributeValue(left, attribute);
  const rightValue = attributeValue(right, attribute);
  if (leftValue === rightValue) return { winnerId: null, isTie: true, isCorrect: true };
  const lowerWins = attribute === 'apparent_magnitude';
  const winner = (lowerWins ? leftValue < rightValue : leftValue > rightValue) ? left : right;
  return { winnerId: winner.id, isTie: false, isCorrect: winner.id === chosenId };
}

export function advanceExplorationProgress(
  streak: number,
  result: ExplorationResult,
): { readonly streak: number; readonly complete: boolean } {
  return result.isCorrect ? { streak: streak + 1, complete: false } : { streak, complete: true };
}

export function pairRatio(round: ExplorationRound): number | null {
  const values = round.cards.map((card) => attributeValue(card, round.attribute));
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (low <= 0 || high / low < 1.5) return null;
  return high / low;
}

export function selectExplorationRound(
  cards: readonly GameCard[],
  streak: number,
  random: () => number = Math.random,
  previousIds: readonly string[] = [],
): ExplorationRound {
  const normal = cards.filter((card) => card.kind === 'astronomical');
  if (normal.length < 2) throw new Error('Exploration requires at least two astronomical cards');
  const attribute = EXPLORATION_ATTRIBUTES[Math.floor(random() * EXPLORATION_ATTRIBUTES.length)];
  const targetMinimumRatio = streak < 3 ? 3 : streak < 7 ? 1.8 : 1.05;
  const candidates: Array<{ cards: [GameCard, GameCard]; ratio: number }> = [];
  for (let left = 0; left < normal.length; left++) {
    for (let right = left + 1; right < normal.length; right++) {
      const pair: [GameCard, GameCard] = [normal[left], normal[right]];
      const values = pair.map((card) => attributeValue(card, attribute));
      const ratio = Math.max(...values) / Math.max(Math.min(...values), Number.EPSILON);
      if (!pair.every((card) => previousIds.includes(card.id))) candidates.push({ cards: pair, ratio });
    }
  }
  const eligible = candidates.filter((candidate) => candidate.ratio >= targetMinimumRatio);
  const pool = eligible.length ? eligible : candidates;
  const chosen = pool[Math.floor(random() * pool.length)] ?? candidates[0];
  return { attribute, cards: chosen.cards };
}

export function chooseEducationalContent(round: ExplorationRound, winner: GameCard | null): EducationalContent {
  if (winner) {
    const contextualKeys = [
      `exploration.fact.contextual.${round.attribute}.${winner.id}`,
      `exploration.fact.contextual.${round.attribute}.${winner.objectType}`,
    ];
    const contextual = contextualKeys.find((key) => CONTEXTUAL_FACTS.has(key));
    if (contextual) return { key: contextual, source: 'contextual' };
    const factIndex = EXPLORATION_ATTRIBUTES.indexOf(round.attribute);
    const cardFacts = winner.educationalFacts ?? [];
    const cardFact = cardFacts[factIndex % cardFacts.length];
    if (cardFact) return { key: cardFact, source: 'card' };
    const typeFacts = TYPE_FACTS[winner.objectType] ?? [];
    const typeFact = typeFacts[factIndex % typeFacts.length];
    if (typeFact) return { key: typeFact, source: 'type' };
  }
  return { key: `exploration.fact.attribute.${round.attribute}`, source: 'attribute' };
}

const CONTEXTUAL_FACTS = new Set([
  'exploration.fact.contextual.apparent_size_arcmin.m31',
  'exploration.fact.contextual.physical_size_light_years.globular_cluster',
]);
const TYPE_FACTS: Readonly<Record<string, readonly string[]>> = {
  emission_nebula: ['exploration.fact.type.emission_nebula', 'exploration.fact.type.emission_nebula.2'],
  reflection_nebula: ['exploration.fact.type.reflection_nebula', 'exploration.fact.type.reflection_nebula.2'],
  dark_nebula: ['exploration.fact.type.dark_nebula', 'exploration.fact.type.dark_nebula.2'],
  planetary_nebula: ['exploration.fact.type.planetary_nebula', 'exploration.fact.type.planetary_nebula.2'],
  supernova_remnant: ['exploration.fact.type.supernova_remnant', 'exploration.fact.type.supernova_remnant.2'],
  cometary_globule: ['exploration.fact.type.cometary_globule', 'exploration.fact.type.cometary_globule.2'],
  spiral_galaxy: ['exploration.fact.type.spiral_galaxy', 'exploration.fact.type.spiral_galaxy.2'],
  elliptical_galaxy: ['exploration.fact.type.elliptical_galaxy', 'exploration.fact.type.elliptical_galaxy.2'],
  irregular_galaxy: ['exploration.fact.type.irregular_galaxy', 'exploration.fact.type.irregular_galaxy.2'],
  globular_cluster: ['exploration.fact.type.globular_cluster', 'exploration.fact.type.globular_cluster.2'],
  open_cluster: ['exploration.fact.type.open_cluster', 'exploration.fact.type.open_cluster.2'],
};
