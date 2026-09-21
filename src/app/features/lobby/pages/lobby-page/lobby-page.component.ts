import type { OnDestroy, OnInit } from '@angular/core';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { normalizeRoomCode } from '../../domain/lobby.models';
import { LobbyFacade } from '../../state/lobby.facade';

@Component({
  selector: 'app-lobby-page',
  providers: [LobbyFacade],
  templateUrl: './lobby-page.component.html',
  styleUrl: './lobby-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LobbyPageComponent implements OnInit, OnDestroy {
  protected readonly facade = inject(LobbyFacade);
  protected readonly i18n = inject(TranslationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly copied = signal(false);
  protected readonly code = normalizeRoomCode(this.route.snapshot.paramMap.get('code') ?? '');
  private readonly gameRedirect = effect(() => {
    if (this.facade.isReady()) void this.router.navigate(['/game', this.code]);
  });

  async ngOnInit(): Promise<void> {
    await this.facade.connect(this.code);
    if (this.facade.error() === 'ROOM_NOT_FOUND') {
      await this.router.navigate(['/join', this.code], { replaceUrl: true });
    }
  }
  ngOnDestroy(): void {
    void this.facade.disconnect();
  }

  async copyInvite(): Promise<void> {
    await navigator.clipboard.writeText(`${location.origin}/join/${this.code}`);
    this.copied.set(true);
    window.setTimeout(() => this.copied.set(false), 1800);
  }

  leave(): void {
    void this.router.navigate(['/']);
  }
}
