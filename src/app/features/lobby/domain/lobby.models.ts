export type GameStatus = 'waiting' | 'ready' | 'in_progress' | 'finished';
export type CpuDifficulty = 'easy' | 'medium' | 'hard';

export interface LobbyPlayer {
  readonly id: string;
  readonly displayName: string;
  readonly seat: 1 | 2;
}

export interface Lobby {
  readonly id: string;
  readonly code: string;
  readonly status: GameStatus;
  readonly players: readonly LobbyPlayer[];
}

export interface RoomResult {
  readonly gameId: string;
  readonly code: string;
}

export function normalizeRoomCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}
