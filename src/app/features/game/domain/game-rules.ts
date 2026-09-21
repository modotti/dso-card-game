import type { AttributeComparison } from './game.models';
export type ComparisonResult = 'first' | 'second' | 'tie';
export function compareAttributeValues(
  first: number,
  second: number,
  comparison: AttributeComparison,
): ComparisonResult {
  if (first === second) return 'tie';
  const firstWins = comparison === 'lower_wins' ? first < second : first > second;
  return firstWins ? 'first' : 'second';
}
