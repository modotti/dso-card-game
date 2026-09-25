import { TestBed } from '@angular/core/testing';
import cardsData from '../../../../assets/data/cards.json';
import { AnalyticsService } from '../../../core/analytics/analytics.service';
import { DiscoveryService, type DiscoverableCard } from './discovery.service';

describe('DiscoveryService', () => {
  let analytics: jasmine.SpyObj<AnalyticsService>;

  function create(): DiscoveryService {
    analytics = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', ['track', 'trackOnce']);
    TestBed.configureTestingModule({ providers: [{ provide: AnalyticsService, useValue: analytics }] });
    return TestBed.inject(DiscoveryService);
  }

  const card = (id = 'm16'): DiscoverableCard => ({ id, kind: 'astronomical', objectType: 'emission_nebula' });

  beforeEach(() => localStorage.clear());
  afterEach(() => TestBed.resetTestingModule());

  it('stores a first discovery and does not discover it twice', () => {
    const service = create();
    expect(service.discover(card(), 'cpu')).toBeTrue();
    expect(service.discover(card(), 'multiplayer')).toBeFalse();
    expect(service.discoveredCardIds()).toEqual(['m16']);
    expect(JSON.parse(localStorage.getItem('dsd-discovered-card-ids') ?? '[]')).toEqual(['m16']);
    expect(analytics.track).toHaveBeenCalledTimes(1);
  });

  it('restores valid unique IDs and ignores invalid storage data', () => {
    localStorage.setItem('dsd-discovered-card-ids', JSON.stringify(['m16', 'm16', 'future-or-invalid']));
    expect(create().discoveredCardIds()).toEqual(['m16']);
    TestBed.resetTestingModule();
    localStorage.setItem('dsd-discovered-card-ids', '{broken');
    expect(create().discoveredCardIds()).toEqual([]);
  });

  it('ignores special cards', () => {
    const service = create();
    expect(service.discover({ id: 'clouds', kind: 'effect', objectType: 'special_effect' }, 'cpu')).toBeFalse();
    expect(service.discoveredCount()).toBe(0);
  });

  it('discovers both players revealed cards in CPU and multiplayer games', () => {
    const service = create();
    expect(service.discoverRevealed([card('m16'), card('m7')], 'cpu')).toEqual(['m16', 'm7']);
    expect(service.discoverRevealed([card('m6'), card('m11')], 'multiplayer')).toEqual(['m6', 'm11']);
    expect(service.discoveredCount()).toBe(4);
  });

  it('tracks catalog completion once when all current target cards are discovered', () => {
    const service = create();
    for (const item of cardsData) service.discover(card(item.id), 'cpu');
    expect(service.discoveredCount()).toBe(cardsData.length);
    expect(analytics.trackOnce).toHaveBeenCalledOnceWith('catalog_completed', 'discovery-catalog');
  });

  it('resets discovery without affecting other preferences', () => {
    localStorage.setItem('dsd-language', 'pt-BR');
    const service = create();
    service.discover(card(), 'cpu');
    service.reset();
    expect(service.discoveredCount()).toBe(0);
    expect(localStorage.getItem('dsd-discovered-card-ids')).toBeNull();
    expect(localStorage.getItem('dsd-language')).toBe('pt-BR');
  });
});
