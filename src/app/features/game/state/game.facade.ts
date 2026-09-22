import { Injectable, computed, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from '../../../core/auth/auth.service';
import { GameRepository } from '../data-access/game.repository';
import type { GameView } from '../domain/game.models';

@Injectable()
export class GameFacade {
  private readonly auth = inject(AuthService);
  private readonly repository = inject(GameRepository);
  private channel?: RealtimeChannel;
  private code = '';
  readonly game = signal<GameView | null>(null);
  readonly playerId = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly isActivePlayer = computed(() => this.game()?.round.activePlayerId === this.playerId());
  readonly hasSelected = computed(() => this.game()?.round.selectedPlayerIds.includes(this.playerId() ?? '') ?? false);
  readonly cpuPlayer = computed(() => this.game()?.players.find((player) => player.isCpu) ?? null);
  async connect(code: string): Promise<void> {
    this.code = code;
    try {
      this.playerId.set(await this.auth.ensurePlayerIdentity());
      await this.repository.startReady(code);
      await this.refresh();
      const id = this.game()?.id;
      if (id) this.channel = this.repository.subscribe(id, () => void this.refresh());
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.loading.set(false);
    }
  }
  async chooseAttribute(attribute: string): Promise<void> {
    const id = this.game()?.id;
    if (!id) return;
    await this.repository.chooseAttribute(id, attribute);
    await this.refresh();
  }
  async chooseCard(cardId: string): Promise<void> {
    const id = this.game()?.id;
    if (!id) return;
    await this.repository.chooseCard(id, cardId);
    await this.refresh();
  }
  async advance(): Promise<void> {
    const id = this.game()?.id;
    if (!id) return;
    await this.repository.advance(id);
    await this.refresh();
  }
  async resolveExpired(): Promise<void> {
    const id = this.game()?.id;
    if (!id) return;
    await this.repository.resolveExpired(id);
    await this.refresh();
  }
  async playCpuTurn(): Promise<void> {
    const id = this.game()?.id;
    if (!id) return;
    await this.repository.playCpuTurn(id);
    await this.refresh();
  }
  async createCpuRematch(): Promise<{ readonly gameId: string; readonly code: string }> {
    const player = this.game()?.players.find((item) => item.id === this.playerId() && !item.isCpu);
    if (!player) throw new Error('PLAYER_NOT_FOUND');
    return this.repository.createCpuGame(player.displayName, this.game()?.rules.cpuDifficulty ?? 'easy');
  }
  async requestRematch(): Promise<void> {
    const id = this.game()?.id;
    if (!id) return;
    await this.repository.requestRematch(id);
    await this.refresh();
  }
  async cancelRematch(): Promise<void> {
    const id = this.game()?.id;
    if (!id) return;
    await this.repository.cancelRematch(id);
    await this.refresh();
  }
  async disconnect(): Promise<void> {
    if (this.channel) await this.repository.unsubscribe(this.channel);
  }
  private async refresh(): Promise<void> {
    this.game.set(await this.repository.get(this.code));
  }
  private message(error: unknown): string {
    return typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : 'GAME_ERROR';
  }
}
