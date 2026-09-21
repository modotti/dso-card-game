import { normalizeRoomCode } from './lobby.models';

describe('normalizeRoomCode', () => {
  it('normalizes pasted codes', () => expect(normalizeRoomCode(' m42-k9q ')).toBe('M42K9Q'));
  it('limits codes to six characters', () => expect(normalizeRoomCode('ABCDEFGHI')).toBe('ABCDEF'));
});
