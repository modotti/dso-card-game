import { Injectable, inject } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { CpuDifficulty, Lobby, RoomResult } from '../domain/lobby.models';

interface LobbyRpcRow {
  game_id: string;
  room_code: string;
  game_status?: Lobby['status'];
  players?: Array<{ id: string; display_name: string; seat: 1 | 2 }>;
}

@Injectable({ providedIn: 'root' })
export class LobbyRepository {
  private readonly supabase = inject(SupabaseService);

  async create(displayName: string): Promise<RoomResult> {
    const { data, error } = await this.supabase.client.rpc('create_game', { player_name: displayName });
    if (error) throw error;
    const row = this.firstRow(data);
    return { gameId: row.game_id, code: row.room_code };
  }

  async createCpu(displayName: string, difficulty: CpuDifficulty): Promise<RoomResult> {
    const { data, error } = await this.supabase.client.rpc('create_cpu_game', {
      player_name: displayName,
      cpu_difficulty: difficulty,
    });
    if (error) throw error;
    const row = this.firstRow(data);
    return { gameId: row.game_id, code: row.room_code };
  }

  async join(code: string, displayName: string): Promise<RoomResult> {
    const { data, error } = await this.supabase.client.rpc('join_game', {
      requested_code: code,
      player_name: displayName,
    });
    if (error) throw error;
    const row = this.firstRow(data);
    return { gameId: row.game_id, code: row.room_code };
  }

  async get(code: string): Promise<Lobby> {
    const { data, error } = await this.supabase.client.rpc('get_game_lobby', { requested_code: code });
    if (error) throw error;
    const row = this.firstRow(data);
    return {
      id: row.game_id,
      code: row.room_code,
      status: row.game_status ?? 'waiting',
      players: (row.players ?? []).map((player) => ({
        id: player.id,
        displayName: player.display_name,
        seat: player.seat,
      })),
    };
  }

  subscribe(gameId: string, onChange: () => void): RealtimeChannel {
    return this.supabase.client
      .channel(`lobby:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        onChange,
      )
      .subscribe();
  }

  async unsubscribe(channel: RealtimeChannel): Promise<void> {
    await this.supabase.client.removeChannel(channel);
  }

  private firstRow(data: unknown): LobbyRpcRow {
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== 'object') throw new Error('ROOM_NOT_FOUND');
    return row as LobbyRpcRow;
  }
}
