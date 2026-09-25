import { InjectionToken, Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

export type AnalyticsEvent =
  | 'app_opened'
  | 'game_created'
  | 'game_joined'
  | 'game_started'
  | 'round_completed'
  | 'game_completed'
  | 'rematch_requested'
  | 'rematch_started'
  | 'game_abandoned'
  | 'card_discovered'
  | 'catalog_completed'
  | 'achievement_unlocked';

export type AnalyticsProperties = Readonly<Record<string, string | number | boolean | null | undefined>>;

export interface AnalyticsConfig {
  readonly enabled: boolean;
  readonly umamiWebsiteId: string;
  readonly umamiHostUrl: string;
}

interface AnalyticsClient {
  track(payload: (properties: Record<string, unknown>) => Record<string, unknown>): unknown;
  identify(distinctId: string): unknown;
}

type AnalyticsClientLoader = (config: AnalyticsConfig) => Promise<AnalyticsClient>;

function loadUmami(config: AnalyticsConfig): Promise<AnalyticsClient> {
  const analyticsWindow = window as Window & { umami?: AnalyticsClient };
  if (analyticsWindow.umami) return Promise.resolve(analyticsWindow.umami);

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `${config.umamiHostUrl.replace(/\/$/, '')}/script.js`;
    script.dataset['websiteId'] = config.umamiWebsiteId;
    script.dataset['autoTrack'] = 'false';
    script.dataset['doNotTrack'] = 'true';
    script.dataset['excludeSearch'] = 'true';
    script.dataset['excludeHash'] = 'true';
    script.addEventListener('load', () =>
      analyticsWindow.umami ? resolve(analyticsWindow.umami) : reject(new Error('UMAMI_NOT_AVAILABLE')),
    );
    script.addEventListener('error', () => reject(new Error('UMAMI_LOAD_FAILED')));
    document.head.appendChild(script);
  });
}

export const ANALYTICS_CONFIG = new InjectionToken<AnalyticsConfig>('ANALYTICS_CONFIG', {
  providedIn: 'root',
  factory: () => environment.analytics,
});

export const ANALYTICS_CLIENT_LOADER = new InjectionToken<AnalyticsClientLoader>('ANALYTICS_CLIENT_LOADER', {
  providedIn: 'root',
  factory: () => loadUmami,
});

const allowedProperties: Readonly<Record<AnalyticsEvent, readonly string[]>> = {
  app_opened: [],
  game_created: ['game_id', 'game_mode'],
  game_joined: ['game_id', 'game_mode'],
  game_started: ['game_id', 'game_mode'],
  round_completed: ['game_id', 'game_mode', 'round_number', 'result'],
  game_completed: ['game_id', 'game_mode', 'rounds_played', 'result'],
  rematch_requested: ['game_id', 'game_mode'],
  rematch_started: ['game_id', 'previous_game_id', 'game_mode'],
  game_abandoned: ['game_id', 'game_mode', 'rounds_played', 'disconnect_reason'],
  card_discovered: ['card_id', 'object_type', 'game_mode'],
  catalog_completed: [],
  achievement_unlocked: ['achievement_id', 'game_mode'],
};

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly config = inject(ANALYTICS_CONFIG);
  private readonly loadClient = inject(ANALYTICS_CLIENT_LOADER);
  private readonly active = this.config.enabled && this.config.umamiWebsiteId.trim().length > 0;
  private readonly client: Promise<AnalyticsClient | null> | null;

  constructor() {
    this.client = this.active ? this.loadClient(this.config).catch(() => null) : null;
  }

  identify(playerId: string): void {
    if (!this.active || !playerId) return;
    void this.client?.then((client) => client?.identify(playerId)).catch(() => undefined);
  }

  track(eventName: AnalyticsEvent, properties: AnalyticsProperties = {}): void {
    if (!this.active) return;
    const sanitized = this.sanitize(eventName, properties);
    void this.client
      ?.then((client) =>
        client?.track((defaults) => ({
          ...defaults,
          url: '/',
          referrer: '',
          title: 'Deep Sky Duels',
          name: eventName,
          data: sanitized,
        })),
      )
      .catch(() => undefined);
  }

  trackOnce(eventName: AnalyticsEvent, uniqueKey: string, properties: AnalyticsProperties = {}): void {
    if (!this.active) return;
    const storageKey = `dsd-umami-analytics:${eventName}:${uniqueKey}`;
    try {
      if (localStorage.getItem(storageKey)) return;
      this.track(eventName, properties);
      localStorage.setItem(storageKey, '1');
    } catch {
      this.track(eventName, properties);
    }
  }

  private sanitize(
    eventName: AnalyticsEvent,
    properties: AnalyticsProperties,
  ): Record<string, string | number | boolean> {
    const sanitized: Record<string, string | number | boolean> = {};
    for (const key of allowedProperties[eventName]) {
      const value = properties[key];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') sanitized[key] = value;
    }
    return sanitized;
  }
}
