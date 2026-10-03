import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'dsd-exploration-best-streak';

@Injectable({ providedIn: 'root' })
export class ExplorationProgressService {
  private readonly best = signal(this.read());
  readonly bestStreak = this.best.asReadonly();

  record(streak: number): number {
    const next = Math.max(this.best(), Math.max(0, Math.floor(streak)));
    this.best.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Persistence must never interrupt exploration.
    }
    return next;
  }

  private read(): number {
    try {
      const value = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch {
      return 0;
    }
  }
}
