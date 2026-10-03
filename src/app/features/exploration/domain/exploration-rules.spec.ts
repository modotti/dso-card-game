import type { GameCard } from '../../game/domain/game.models';
import {
  advanceExplorationProgress,
  chooseEducationalContent,
  pairRatio,
  resolveExplorationChoice,
  selectExplorationRound,
} from './exploration-rules';
import type { ExplorationAttribute } from './exploration.models';

function card(
  id: string,
  values: readonly [number, number, number, number],
  kind: GameCard['kind'] = 'astronomical',
): GameCard {
  const attributes: readonly ExplorationAttribute[] = [
    'distance_light_years',
    'apparent_magnitude',
    'apparent_size_arcmin',
    'physical_size_light_years',
  ];
  return {
    id,
    kind,
    effectKey: kind === 'effect' ? 'cancel_round' : null,
    catalogName: id.toUpperCase(),
    commonName: id,
    objectType: 'planetary_nebula',
    constellation: 'Test',
    image: null,
    attributes: attributes.map((attribute, index) => ({
      id: attribute,
      labelKey: attribute,
      unit: 'ly',
      comparison: attribute === 'apparent_magnitude' ? 'lower_wins' : 'higher_wins',
      displayOrder: index + 1,
      value: values[index],
      isApproximate: false,
    })),
  };
}

describe('exploration rules', () => {
  const low = card('low', [10, 2, 4, 8]);
  const high = card('high', [100, 8, 40, 80]);

  it('selects only normal astronomical cards', () => {
    const round = selectExplorationRound([low, high, card('special', [999, 0, 999, 999], 'effect')], 0, () => 0);
    expect(round.cards.every((item) => item.kind === 'astronomical')).toBeTrue();
  });

  it('uses higher values for distance, apparent size and physical size', () => {
    for (const attribute of ['distance_light_years', 'apparent_size_arcmin', 'physical_size_light_years'] as const) {
      expect(resolveExplorationChoice([low, high], attribute, high.id).isCorrect).toBeTrue();
      expect(resolveExplorationChoice([low, high], attribute, low.id).isCorrect).toBeFalse();
    }
  });

  it('uses the lower value for apparent magnitude', () => {
    expect(resolveExplorationChoice([low, high], 'apparent_magnitude', low.id).winnerId).toBe(low.id);
  });

  it('treats a tie as correct with no winner', () => {
    const result = resolveExplorationChoice([low, card('same', [10, 9, 9, 9])], 'distance_light_years', low.id);
    expect(result).toEqual({ winnerId: null, isTie: true, isCorrect: true });
  });

  it('increments streak after a correct answer and completes after an error', () => {
    expect(advanceExplorationProgress(2, { winnerId: high.id, isTie: false, isCorrect: true })).toEqual({
      streak: 3,
      complete: false,
    });
    expect(advanceExplorationProgress(2, { winnerId: high.id, isTie: false, isCorrect: false })).toEqual({
      streak: 2,
      complete: true,
    });
  });

  it('allows progressively closer comparisons', () => {
    const close = card('close', [11, 2.1, 4.1, 8.1]);
    const early = selectExplorationRound([low, close, high], 0, () => 0.99);
    const advanced = selectExplorationRound([low, close, high], 10, () => 0);
    expect(pairRatio(early)).toBeGreaterThanOrEqual(3);
    expect(pairRatio(advanced)).toBeNull();
  });

  it('calculates useful relative comparisons and suppresses close ratios', () => {
    expect(pairRatio({ attribute: 'distance_light_years', cards: [low, high] })).toBe(10);
    expect(pairRatio({ attribute: 'distance_light_years', cards: [low, card('close', [12, 1, 1, 1])] })).toBeNull();
  });

  it('falls back to generic attribute education', () => {
    const unknown = { ...high, objectType: 'future_object_type' };
    const content = chooseEducationalContent({ attribute: 'distance_light_years', cards: [low, unknown] }, unknown);
    expect(content.source).toBe('attribute');
    expect(content.key).toBe('exploration.fact.attribute.distance_light_years');
  });

  it('prioritizes contextual facts and varies card facts by attribute', () => {
    const andromeda = {
      ...high,
      id: 'm31',
      objectType: 'spiral_galaxy',
      educationalFacts: ['exploration.fact.card.m31', 'exploration.fact.card.m31.2'],
    };
    expect(chooseEducationalContent({ attribute: 'apparent_size_arcmin', cards: [low, andromeda] }, andromeda)).toEqual(
      { key: 'exploration.fact.contextual.apparent_size_arcmin.m31', source: 'contextual' },
    );
    expect(chooseEducationalContent({ attribute: 'distance_light_years', cards: [low, andromeda] }, andromeda)).toEqual(
      { key: 'exploration.fact.card.m31', source: 'card' },
    );
    expect(chooseEducationalContent({ attribute: 'apparent_magnitude', cards: [low, andromeda] }, andromeda)).toEqual({
      key: 'exploration.fact.card.m31.2',
      source: 'card',
    });
  });
});
