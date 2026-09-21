import { Injectable, inject } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { AttributeDefinition, CardAttributeValue, GameCard, GameView } from '../domain/game.models';

type RawCard = Record<string, unknown>;
@Injectable({ providedIn: 'root' })
export class GameRepository {
  private readonly supabase = inject(SupabaseService);
  async startReady(code: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('start_ready_game', { requested_code: code });
    if (error && error.message !== 'PLAYERS_NOT_READY') throw error;
  }
  async createCpuGame(displayName: string): Promise<string> {
    const { data, error } = await this.supabase.client.rpc('create_cpu_game', { player_name: displayName });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { room_code?: string } | null;
    if (!row?.room_code) throw new Error('CPU_GAME_CREATION_FAILED');
    return row.room_code;
  }
  async get(code: string): Promise<GameView> {
    const { data, error } = await this.supabase.client.rpc('get_game_state', { requested_code: code });
    if (error) throw error;
    const raw = data as Record<string, unknown>;
    const round = raw['round'] as Record<string, unknown>;
    return {
      id: String(raw['id']),
      code: String(raw['code']),
      status: raw['status'] as GameView['status'],
      rules: raw['rules'] as GameView['rules'],
      players: raw['players'] as GameView['players'],
      availableAttributes: (raw['availableAttributes'] as Array<Record<string, unknown>>).map((attribute) =>
        this.mapAttribute(attribute),
      ),
      hand: (raw['hand'] as RawCard[]).map(this.mapCard),
      round: {
        number: Number(round['number']),
        activePlayerId: String(round['activePlayerId']),
        status: round['status'] as GameView['round']['status'],
        attribute: round['attribute'] as GameView['round']['attribute'],
        winnerId: round['winnerId'] as string | null,
        isTie: Boolean(round['isTie']),
        isCancelled: Boolean(round['isCancelled']),
        actionDeadline: round['actionDeadline'] as string | null,
        selectedPlayerIds: round['selectedPlayerIds'] as string[],
        revealedCards: (round['revealedCards'] as Array<{ playerId: string; card: RawCard }>).map((item) => ({
          playerId: item.playerId,
          card: this.mapCard(item.card),
        })),
      },
    };
  }
  async chooseAttribute(gameId: string, attribute: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('choose_round_attribute', {
      target_game_id: gameId,
      attribute_key: attribute,
    });
    if (error) throw error;
  }
  async chooseCard(gameId: string, cardId: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('choose_round_card', {
      target_game_id: gameId,
      selected_card_id: cardId,
    });
    if (error) throw error;
  }
  async advance(gameId: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('advance_round', { target_game_id: gameId });
    if (error) throw error;
  }
  async playCpuTurn(gameId: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('play_cpu_turn', { target_game_id: gameId });
    if (error) throw error;
  }
  async resolveExpired(gameId: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('resolve_expired_action', { target_game_id: gameId });
    if (error) throw error;
  }
  subscribe(gameId: string, onChange: () => void): RealtimeChannel {
    return this.supabase.client
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_rounds', filter: `game_id=eq.${gameId}` },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'round_selections', filter: `game_id=eq.${gameId}` },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
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
  private readonly mapCard = (raw: RawCard): GameCard => ({
    id: String(raw['id']),
    kind: raw['kind'] as GameCard['kind'],
    effectKey: (raw['effect_key'] as string | null) ?? null,
    catalogName: String(raw['catalog_name']),
    commonName: String(raw['common_name']),
    objectType: String(raw['object_type']),
    constellation: String(raw['constellation']),
    attributes: (raw['attributes'] as Array<Record<string, unknown>>).map(
      (attribute) =>
        ({
          ...this.mapAttribute(attribute),
          value: attribute['value'] === null ? null : Number(attribute['value']),
          isApproximate: Boolean(attribute['isApproximate']),
        }) satisfies CardAttributeValue,
    ),
  });
  private readonly mapAttribute = (raw: Record<string, unknown>): AttributeDefinition => ({
    id: String(raw['id']),
    labelKey: String(raw['label_key'] ?? raw['labelKey']),
    unit: String(raw['unit']),
    comparison: raw['comparison'] as AttributeDefinition['comparison'],
    displayOrder: Number(raw['display_order'] ?? raw['displayOrder']),
  });
}
