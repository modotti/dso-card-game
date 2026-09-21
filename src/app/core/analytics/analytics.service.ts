import { Injectable } from '@angular/core';
export type AnalyticsEvent =
  | 'landing_view'
  | 'game_created'
  | 'game_joined'
  | 'game_started'
  | 'game_completed'
  | 'rematch_started'
  | 'player_returned';
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  track(event: AnalyticsEvent, properties: Readonly<Record<string, string | number | boolean>> = {}): void {
    if (location.hostname === 'localhost') console.info('[analytics]', event, properties);
  }
}
