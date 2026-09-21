import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { ANALYTICS_CLIENT_LOADER, ANALYTICS_CONFIG, AnalyticsService, type AnalyticsConfig } from './analytics.service';

describe('AnalyticsService', () => {
  const enabledConfig: AnalyticsConfig = {
    enabled: true,
    umamiWebsiteId: 'website-test',
    umamiHostUrl: 'https://cloud.umami.is',
  };
  let client: {
    track: jasmine.Spy;
    identify: jasmine.Spy;
  };

  function configure(config: AnalyticsConfig): AnalyticsService {
    client = {
      track: jasmine.createSpy('track'),
      identify: jasmine.createSpy('identify'),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: ANALYTICS_CONFIG, useValue: config },
        { provide: ANALYTICS_CLIENT_LOADER, useValue: () => Promise.resolve(client) },
      ],
    });
    return TestBed.inject(AnalyticsService);
  }

  afterEach(() => TestBed.resetTestingModule());

  it('forwards allowed events and properties to Umami without exposing the route', fakeAsync(() => {
    const service = configure(enabledConfig);

    service.track('game_completed', {
      game_id: 'game-1',
      game_mode: 'multiplayer',
      rounds_played: 4,
      result: 'win',
    });
    flushMicrotasks();

    expect(client.track).toHaveBeenCalledTimes(1);
    const transform = client.track.calls.mostRecent().args[0] as (
      defaults: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(transform({ hostname: 'game.example', url: '/game/SECRET' })).toEqual({
      hostname: 'game.example',
      url: '/',
      referrer: '',
      title: 'Deep Space Duel',
      name: 'game_completed',
      data: {
        game_id: 'game-1',
        game_mode: 'multiplayer',
        rounds_played: 4,
        result: 'win',
      },
    });
  }));

  it('does nothing when analytics is disabled', () => {
    const service = configure({ ...enabledConfig, enabled: false });

    service.identify('player-1');
    service.track('app_opened');

    expect(client.identify).not.toHaveBeenCalled();
    expect(client.track).not.toHaveBeenCalled();
  });

  it('drops private and unknown properties before capture', fakeAsync(() => {
    const service = configure(enabledConfig);

    service.track('game_started', {
      game_id: 'game-1',
      game_mode: 'cpu',
      email: 'private@example.com',
      display_name: 'Private name',
      access_token: 'secret',
    });
    flushMicrotasks();

    const transform = client.track.calls.mostRecent().args[0] as (
      defaults: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(transform({})['data']).toEqual({
      game_id: 'game-1',
      game_mode: 'cpu',
    });
  }));
});
