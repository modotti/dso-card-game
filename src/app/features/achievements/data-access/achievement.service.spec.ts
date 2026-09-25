import { TestBed } from '@angular/core/testing';
import cardsData from '../../../../assets/data/cards.json';
import { AnalyticsService } from '../../../core/analytics/analytics.service';
import { DiscoveryService } from '../../cards/data-access/discovery.service';
import type { GameCard, RevealedCard } from '../../game/domain/game.models';
import { AchievementService } from './achievement.service';

describe('AchievementService', () => {
  let analytics: jasmine.SpyObj<AnalyticsService>;

  function create(): AchievementService {
    analytics = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', ['track', 'trackOnce']);
    TestBed.configureTestingModule({ providers: [{ provide: AnalyticsService, useValue: analytics }] });
    return TestBed.inject(AchievementService);
  }

  function astronomical(id: string, objectType: string): GameCard {
    return {
      id,
      kind: 'astronomical',
      effectKey: null,
      catalogName: id,
      commonName: id,
      objectType,
      constellation: '',
      image: null,
      attributes: [],
    };
  }

  function effect(id: string, effectKey: string): GameCard {
    return {
      id,
      kind: 'effect',
      effectKey,
      catalogName: id,
      commonName: id,
      objectType: 'special_effect',
      constellation: '',
      image: null,
      attributes: [],
    };
  }

  function round(
    service: AchievementService,
    matchId: string,
    number: number,
    winnerId: string | null,
    localCard: GameCard,
    opponentCard: GameCard,
    isCancelled = false,
    gameMode: 'cpu' | 'multiplayer' = 'cpu',
  ): readonly string[] {
    const revealedCards: RevealedCard[] = [
      { playerId: 'local', card: localCard },
      { playerId: 'opponent', card: opponentCard },
    ];
    return service.recordRound({
      matchId,
      roundNumber: number,
      playerId: 'local',
      winnerId,
      isCancelled,
      revealedCards,
      gameMode,
    });
  }

  const unlocked = (service: AchievementService, id: string): boolean =>
    service.achievements().find((item) => item.id === id)?.unlocked ?? false;

  beforeEach(() => localStorage.clear());
  afterEach(() => TestBed.resetTestingModule());

  it('derives all Discovery achievements and the atlas total dynamically', () => {
    const service = create();
    const discovery = TestBed.inject(DiscoveryService);
    discovery.discover({ ...astronomical(cardsData[0].id, cardsData[0].objectType) }, 'cpu');
    expect(service.syncDiscovery('cpu')).toContain('first-light');
    for (const card of cardsData.slice(1, 10)) discovery.discover(astronomical(card.id, card.objectType), 'cpu');
    expect(service.syncDiscovery('cpu')).toContain('deep-sky-explorer');
    for (const card of cardsData.slice(10, 25)) discovery.discover(astronomical(card.id, card.objectType), 'cpu');
    expect(service.syncDiscovery('cpu')).toContain('cosmic-surveyor');
    for (const card of cardsData.slice(25)) discovery.discover(astronomical(card.id, card.objectType), 'cpu');
    expect(service.syncDiscovery('cpu')).toContain('deep-sky-atlas');
    const atlas = service.achievements().find((item) => item.id === 'deep-sky-atlas');
    expect(atlas?.targetValue).toBe(cardsData.length);
  });

  it('unlocks victory achievements at 1, 10, and 25 wins', () => {
    const service = create();
    for (let index = 1; index <= 25; index++)
      service.recordMatch({ matchId: `match-${index}`, result: 'win', gameMode: 'cpu' });
    expect(unlocked(service, 'first-victory')).toBeTrue();
    expect(unlocked(service, 'seasoned-observer')).toBeTrue();
    expect(unlocked(service, 'deep-sky-veteran')).toBeTrue();
  });

  it('counts only completed games and separates victories from defeats', () => {
    const service = create();
    const card = astronomical('m16', 'emission_nebula');
    round(service, 'abandoned', 1, 'local', card, card);
    expect(service.record().completedGames).toBe(0);

    service.recordMatch({ matchId: 'cpu-win', result: 'win', gameMode: 'cpu' });
    service.recordMatch({ matchId: 'multiplayer-loss', result: 'loss', gameMode: 'multiplayer' });
    expect(service.record().completedGames).toBe(2);
    expect(service.record().victories).toBe(1);
  });

  it('counts only local decisive round victories', () => {
    const service = create();
    const card = astronomical('m16', 'emission_nebula');
    round(service, 'rounds', 1, 'local', card, card, false, 'multiplayer');
    round(service, 'rounds', 2, 'opponent', card, card, false, 'multiplayer');
    round(service, 'rounds', 3, null, effect('clouds', 'cancel_round'), card, true, 'multiplayer');
    round(service, 'rounds', 4, null, card, card, false, 'multiplayer');
    expect(service.record().roundsWon).toBe(1);
  });

  it('only unlocks Against the Odds for a Hard CPU victory', () => {
    const service = create();
    service.recordMatch({ matchId: 'easy', result: 'win', gameMode: 'cpu', cpuDifficulty: 'easy' });
    service.recordMatch({ matchId: 'multi', result: 'win', gameMode: 'multiplayer' });
    expect(unlocked(service, 'against-the-odds')).toBeFalse();
    service.recordMatch({ matchId: 'hard', result: 'win', gameMode: 'cpu', cpuDifficulty: 'hard' });
    expect(unlocked(service, 'against-the-odds')).toBeTrue();
  });

  it('unlocks Unstoppable at three wins and resets the streak after a loss', () => {
    const service = create();
    service.recordMatch({ matchId: '1', result: 'win', gameMode: 'cpu' });
    service.recordMatch({ matchId: '2', result: 'win', gameMode: 'cpu' });
    service.recordMatch({ matchId: 'loss', result: 'loss', gameMode: 'cpu' });
    service.recordMatch({ matchId: '3', result: 'win', gameMode: 'cpu' });
    service.recordMatch({ matchId: '4', result: 'win', gameMode: 'cpu' });
    expect(unlocked(service, 'unstoppable')).toBeFalse();
    service.recordMatch({ matchId: '5', result: 'win', gameMode: 'cpu' });
    expect(unlocked(service, 'unstoppable')).toBeTrue();
    expect(service.record().bestWinStreak).toBe(3);
    service.recordMatch({ matchId: 'second-loss', result: 'loss', gameMode: 'cpu' });
    expect(service.achievements().find((item) => item.id === 'unstoppable')?.current).toBe(0);
    expect(service.record().bestWinStreak).toBe(3);
  });

  it('tracks five unique winning cards for each Hunter and ignores duplicates', () => {
    const service = create();
    const types = { nebula: 'emission_nebula', galaxy: 'spiral_galaxy', cluster: 'open_cluster' };
    for (const [category, type] of Object.entries(types)) {
      for (let index = 0; index < 5; index++)
        round(
          service,
          category,
          index + 1,
          'local',
          astronomical(`${category}-${index}`, type),
          astronomical('other', 'cometary_globule'),
        );
      round(
        service,
        `${category}-duplicate`,
        1,
        'local',
        astronomical(`${category}-0`, type),
        astronomical('other', 'cometary_globule'),
      );
      expect(unlocked(service, `${category}-hunter`)).toBeTrue();
      expect(service.achievements().find((item) => item.id === `${category}-hunter`)?.current).toBe(5);
    }
  });

  it('unlocks each successful special counter and rejects unsuccessful counters', () => {
    const service = create();
    expect(
      round(
        service,
        'bad',
        1,
        'opponent',
        effect('winds', 'defeat_emission_nebula'),
        astronomical('m16', 'emission_nebula'),
      ),
    ).not.toContain('stellar-winds');
    expect(
      round(
        service,
        'winds',
        1,
        'local',
        effect('winds', 'defeat_emission_nebula'),
        astronomical('m16', 'emission_nebula'),
      ),
    ).toContain('stellar-winds');
    expect(
      round(
        service,
        'collision',
        1,
        'local',
        effect('collision', 'defeat_galaxy'),
        astronomical('m31', 'spiral_galaxy'),
      ),
    ).toContain('cosmic-collision');
    expect(
      round(service, 'tidal', 1, 'local', effect('tidal', 'defeat_star_cluster'), astronomical('m7', 'open_cluster')),
    ).toContain('tidal-disruption');
  });

  it('handles Clear Skies, Perfect Observation, Comeback, and neutral Clouds rounds', () => {
    const service = create();
    const card = astronomical('m16', 'emission_nebula');
    round(service, 'perfect', 1, 'local', card, card);
    round(service, 'perfect', 2, null, effect('clouds', 'cancel_round'), card, true);
    round(service, 'perfect', 3, 'local', card, card);
    service.recordMatch({ matchId: 'perfect', result: 'win', gameMode: 'cpu' });
    expect(unlocked(service, 'perfect-observation')).toBeTrue();
    expect(unlocked(service, 'clear-skies')).toBeFalse();

    round(service, 'comeback', 1, null, effect('clouds', 'cancel_round'), card, true);
    round(service, 'comeback', 2, 'opponent', card, card);
    round(service, 'comeback', 3, 'opponent', card, card);
    round(service, 'comeback', 4, 'local', card, card);
    service.recordMatch({ matchId: 'comeback', result: 'win', gameMode: 'multiplayer' });
    expect(unlocked(service, 'comeback')).toBeTrue();
  });

  it('unlocks Clear Skies when a winning match has no cancelled round', () => {
    const service = create();
    round(service, 'clear', 1, 'local', astronomical('m16', 'emission_nebula'), astronomical('m31', 'spiral_galaxy'));
    service.recordMatch({ matchId: 'clear', result: 'win', gameMode: 'cpu' });
    expect(unlocked(service, 'clear-skies')).toBeTrue();
  });

  it('uses only the local multiplayer player actions', () => {
    const service = create();
    for (let index = 0; index < 5; index++)
      round(
        service,
        'multi',
        index + 1,
        'opponent',
        astronomical(`local-${index}`, 'spiral_galaxy'),
        astronomical(`remote-${index}`, 'spiral_galaxy'),
        false,
        'multiplayer',
      );
    expect(unlocked(service, 'galaxy-hunter')).toBeFalse();
  });

  it('persists progress, tolerates corruption, and never unlocks twice', () => {
    let service = create();
    const first = service.recordMatch({ matchId: 'one', result: 'win', gameMode: 'cpu' });
    expect(first).toContain('first-victory');
    expect(service.recordMatch({ matchId: 'one', result: 'win', gameMode: 'cpu' })).toEqual([]);
    TestBed.resetTestingModule();
    service = create();
    expect(unlocked(service, 'first-victory')).toBeTrue();
    TestBed.resetTestingModule();
    localStorage.setItem('dsd-achievements', '{broken');
    service = create();
    expect(service.unlockedCount()).toBe(0);
  });

  it('migrates existing Achievement state without losing prior progress', () => {
    localStorage.setItem(
      'dsd-achievements',
      JSON.stringify({
        unlockedIds: ['first-victory'],
        wins: 7,
        winStreak: 2,
        hunterCardIds: { nebula: ['m16'], galaxy: [], cluster: [] },
        completedMatchIds: ['old-match'],
        matches: {},
      }),
    );
    const service = create();
    expect(service.record().completedGames).toBe(0);
    expect(service.record().victories).toBe(7);
    expect(service.record().roundsWon).toBe(0);
    expect(service.record().bestWinStreak).toBe(0);
    expect(unlocked(service, 'first-victory')).toBeTrue();
    expect(service.achievements().find((item) => item.id === 'nebula-hunter')?.current).toBe(1);
  });

  it('derives Record totals from Discovery and Achievement definitions', () => {
    const service = create();
    const discovery = TestBed.inject(DiscoveryService);
    discovery.discover(astronomical(cardsData[0].id, cardsData[0].objectType), 'cpu');
    service.syncDiscovery();
    expect(service.record().objectsDiscovered).toBe(1);
    expect(service.record().totalObjects).toBe(cardsData.length);
    expect(service.record().achievementsUnlocked).toBe(1);
    expect(service.record().totalAchievements).toBe(service.totalCount);
    expect(service.record().totalObjects).not.toBe(cardsData.length + 4);
  });

  it('returns multiple fresh unlocks together for sequential notification queues', () => {
    const service = create();
    round(
      service,
      'multi-unlock',
      1,
      'local',
      astronomical('m16', 'emission_nebula'),
      astronomical('m31', 'spiral_galaxy'),
    );
    const unlockedIds = service.recordMatch({ matchId: 'multi-unlock', result: 'win', gameMode: 'cpu' });
    expect(unlockedIds).toContain('first-victory');
    expect(unlockedIds).toContain('clear-skies');
    expect(unlockedIds).toContain('perfect-observation');
  });

  it('resets gameplay progress but restores achievements derived from Discovery', () => {
    const service = create();
    TestBed.inject(DiscoveryService).discover(astronomical(cardsData[0].id, cardsData[0].objectType), 'cpu');
    service.syncDiscovery();
    service.recordMatch({ matchId: 'one', result: 'win', gameMode: 'cpu' });
    service.reset();
    expect(unlocked(service, 'first-light')).toBeTrue();
    expect(unlocked(service, 'first-victory')).toBeFalse();
  });
});
