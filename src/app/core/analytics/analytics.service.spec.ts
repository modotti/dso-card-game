import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { ANALYTICS_CLIENT_LOADER, ANALYTICS_CONFIG, AnalyticsService, type AnalyticsConfig } from './analytics.service';

describe('AnalyticsService', () => {
  const enabledConfig: AnalyticsConfig = {
    enabled: true,
    posthogKey: 'phc_test',
    posthogHost: 'https://us.i.posthog.com',
  };
  let client: {
    init: jasmine.Spy;
    capture: jasmine.Spy;
    identify: jasmine.Spy;
  };

  function configure(config: AnalyticsConfig): AnalyticsService {
    client = {
      init: jasmine.createSpy('init'),
      capture: jasmine.createSpy('capture'),
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

  it('forwards allowed events and properties to PostHog', fakeAsync(() => {
    const service = configure(enabledConfig);

    service.track('game_completed', {
      game_id: 'game-1',
      game_mode: 'multiplayer',
      rounds_played: 4,
      result: 'win',
    });
    flushMicrotasks();

    expect(client.capture).toHaveBeenCalledOnceWith('game_completed', {
      game_id: 'game-1',
      game_mode: 'multiplayer',
      rounds_played: 4,
      result: 'win',
    });
  }));

  it('does nothing when analytics is disabled', () => {
    const service = configure({ ...enabledConfig, enabled: false });

    service.identify('player-1');
    service.track('app_opened');

    expect(client.init).not.toHaveBeenCalled();
    expect(client.identify).not.toHaveBeenCalled();
    expect(client.capture).not.toHaveBeenCalled();
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

    expect(client.capture).toHaveBeenCalledOnceWith('game_started', {
      game_id: 'game-1',
      game_mode: 'cpu',
    });
  }));
});
