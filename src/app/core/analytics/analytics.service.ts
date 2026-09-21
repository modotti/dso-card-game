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
  | 'game_abandoned';

export type AnalyticsProperties = Readonly<Record<string, string | number | boolean | null | undefined>>;

export interface AnalyticsConfig {
  readonly enabled: boolean;
  readonly posthogKey: string;
  readonly posthogHost: string;
}

interface AnalyticsClient {
  init(key: string, config: Record<string, unknown>): unknown;
  capture(eventName: string, properties?: Record<string, string | number | boolean>): unknown;
  identify(distinctId: string): unknown;
}

export const ANALYTICS_CONFIG = new InjectionToken<AnalyticsConfig>('ANALYTICS_CONFIG', {
  providedIn: 'root',
  factory: () => environment.analytics,
});

export const ANALYTICS_CLIENT_LOADER = new InjectionToken<() => Promise<AnalyticsClient>>('ANALYTICS_CLIENT_LOADER', {
  providedIn: 'root',
  factory: () => () => import('posthog-js/dist/module.slim').then((module) => module.default),
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
};

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly config = inject(ANALYTICS_CONFIG);
  private readonly loadClient = inject(ANALYTICS_CLIENT_LOADER);
  private readonly active = this.config.enabled && this.config.posthogKey.trim().length > 0;
  private readonly client: Promise<AnalyticsClient | null> | null;

  constructor() {
    this.client = this.active
      ? this.loadClient()
          .then((client) => {
            client.init(this.config.posthogKey, {
              api_host: this.config.posthogHost,
              autocapture: false,
              capture_pageview: false,
              capture_pageleave: false,
              capture_dead_clicks: false,
              capture_exceptions: false,
              capture_performance: false,
              disable_surveys: true,
              disable_session_recording: true,
              person_profiles: 'identified_only',
              persistence: 'localStorage',
              property_denylist: ['$current_url', '$pathname', '$referrer', '$referring_domain'],
            });
            return client;
          })
          .catch(() => null)
      : null;
  }

  identify(playerId: string): void {
    if (!this.active || !playerId) return;
    void this.client?.then((client) => client?.identify(playerId)).catch(() => undefined);
  }

  track(eventName: AnalyticsEvent, properties: AnalyticsProperties = {}): void {
    if (!this.active) return;
    const sanitized = this.sanitize(eventName, properties);
    void this.client?.then((client) => client?.capture(eventName, sanitized)).catch(() => undefined);
  }

  trackOnce(eventName: AnalyticsEvent, uniqueKey: string, properties: AnalyticsProperties = {}): void {
    if (!this.active) return;
    const storageKey = `dsd-analytics:${eventName}:${uniqueKey}`;
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
