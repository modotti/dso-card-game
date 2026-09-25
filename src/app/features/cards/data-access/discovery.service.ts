import { Injectable, computed, inject, signal } from '@angular/core';
import cardsData from '../../../../assets/data/cards.json';
import { AnalyticsService } from '../../../core/analytics/analytics.service';

const STORAGE_KEY = 'dsd-discovered-card-ids';

export type DiscoveryGameMode = 'cpu' | 'multiplayer';

export interface DiscoverableCard {
  readonly id: string;
  readonly kind: 'astronomical' | 'effect';
  readonly objectType: string;
}

@Injectable({ providedIn: 'root' })
export class DiscoveryService {
  private readonly analytics = inject(AnalyticsService);
  private readonly validIds = new Set(cardsData.map((card) => card.id));
  private readonly ids = signal<readonly string[]>(this.read());

  readonly discoveredCardIds = this.ids.asReadonly();
  readonly discoveredCount = computed(() => this.ids().length);
  readonly totalCount = cardsData.length;

  isDiscovered(cardId: string): boolean {
    return this.ids().includes(cardId);
  }

  discover(card: DiscoverableCard, gameMode: DiscoveryGameMode): boolean {
    if (card.kind !== 'astronomical' || !this.validIds.has(card.id) || this.isDiscovered(card.id)) return false;

    const next = [...this.ids(), card.id];
    this.ids.set(next);
    this.persist(next);
    this.analytics.track('card_discovered', {
      card_id: card.id,
      object_type: card.objectType,
      game_mode: gameMode,
    });
    if (next.length === this.totalCount) {
      this.analytics.trackOnce('catalog_completed', 'discovery-catalog');
    }
    return true;
  }

  discoverRevealed(cards: readonly DiscoverableCard[], gameMode: DiscoveryGameMode): readonly string[] {
    return cards.filter((card) => this.discover(card, gameMode)).map((card) => card.id);
  }

  reset(): void {
    this.ids.set([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // In-memory progress still resets when storage is unavailable.
    }
  }

  private read(): readonly string[] {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      if (!Array.isArray(stored)) return [];
      return [...new Set(stored.filter((id): id is string => typeof id === 'string' && this.validIds.has(id)))];
    } catch {
      return [];
    }
  }

  private persist(ids: readonly string[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // Discovery must never interfere with gameplay.
    }
  }
}
