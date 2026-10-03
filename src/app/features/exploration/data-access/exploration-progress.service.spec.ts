import { TestBed } from '@angular/core/testing';
import { ExplorationProgressService } from './exploration-progress.service';

describe('ExplorationProgressService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('persists only the best streak', () => {
    const service = TestBed.inject(ExplorationProgressService);
    expect(service.record(7)).toBe(7);
    expect(service.record(3)).toBe(7);
    expect(localStorage.getItem('dsd-exploration-best-streak')).toBe('7');
    TestBed.resetTestingModule();
    expect(TestBed.inject(ExplorationProgressService).bestStreak()).toBe(7);
  });
});
