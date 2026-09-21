import { compareAttributeValues } from './game-rules';
describe('compareAttributeValues', () => {
  it('supports higher wins', () => expect(compareAttributeValues(10, 5, 'higher_wins')).toBe('first'));
  it('supports lower wins', () => expect(compareAttributeValues(2, 4, 'lower_wins')).toBe('first'));
  it('allows ties', () => expect(compareAttributeValues(5, 5, 'higher_wins')).toBe('tie'));
});
