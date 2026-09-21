import { Injectable, computed, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from '../../../core/auth/auth.service';
import { LobbyRepository } from '../data-access/lobby.repository';
import type { Lobby, RoomResult } from '../domain/lobby.models';

export type ConnectionState = 'connecting' | 'connected' | 'error';

@Injectable()
export class LobbyFacade {
  private readonly auth = inject(AuthService);
  private readonly repository = inject(LobbyRepository);
  private channel?: RealtimeChannel;
  private activeCode?: string;

  readonly lobby = signal<Lobby | null>(null);
  readonly currentPlayerId = signal<string | null>(null);
  readonly connection = signal<ConnectionState>('connecting');
  readonly error = signal<string | null>(null);
  readonly isReady = computed(() => this.lobby()?.players.length === 2);

  async create(displayName: string): Promise<RoomResult> {
    this.currentPlayerId.set(await this.auth.ensurePlayerIdentity());
    return this.repository.create(displayName);
  }

  async createCpu(displayName: string): Promise<RoomResult> {
    this.currentPlayerId.set(await this.auth.ensurePlayerIdentity());
    return this.repository.createCpu(displayName);
  }

  async join(code: string, displayName: string): Promise<RoomResult> {
    this.currentPlayerId.set(await this.auth.ensurePlayerIdentity());
    return this.repository.join(code, displayName);
  }

  async connect(code: string): Promise<void> {
    this.activeCode = code;
    this.connection.set('connecting');
    try {
      this.currentPlayerId.set(await this.auth.ensurePlayerIdentity());
      await this.refresh();
      const gameId = this.lobby()?.id;
      if (!gameId) throw new Error('ROOM_NOT_FOUND');
      this.channel = this.repository.subscribe(gameId, () => void this.refresh());
      this.connection.set('connected');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
            ? error.message
            : 'LOBBY_LOAD_FAILED';
      this.error.set(message);
      this.connection.set('error');
    }
  }

  async disconnect(): Promise<void> {
    if (this.channel) await this.repository.unsubscribe(this.channel);
  }

  private async refresh(): Promise<void> {
    if (!this.activeCode) return;
    this.lobby.set(await this.repository.get(this.activeCode));
  }
}
