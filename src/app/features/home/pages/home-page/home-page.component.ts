import type { OnInit } from '@angular/core';
import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AnalyticsService } from '../../../../core/analytics/analytics.service';
import type { TranslationKey } from '../../../../core/i18n/translation.service';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { SupabaseService } from '../../../../core/supabase/supabase.service';
import type { CpuDifficulty } from '../../../lobby/domain/lobby.models';
import { normalizeRoomCode } from '../../../lobby/domain/lobby.models';
import { LobbyFacade } from '../../../lobby/state/lobby.facade';
import cardsData from '../../../../../assets/data/cards.json';
import imageCredits from '../../../../../assets/data/image-credits.json';
import type { GameCard } from '../../../game/domain/game.models';
import { GameCardComponent } from '../../../game/ui/game-card/game-card.component';

type Intent = 'create' | 'join' | 'cpu';
interface HomeCard {
  readonly id: string;
  readonly catalogName: string;
  readonly commonName: string;
  readonly objectType: string;
}
interface CatalogCard extends HomeCard {
  readonly constellation: string;
  readonly distanceLightYears: number;
  readonly apparentMagnitude: number;
  readonly apparentSizeArcmin: number;
  readonly physicalSizeLightYears: number;
}

export function pickFeaturedCards<T extends HomeCard>(
  cards: readonly T[],
  count = 3,
  random: () => number = Math.random,
): readonly T[] {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  const selected: T[] = [];
  const usedTypes = new Set<string>();

  for (const card of shuffled) {
    if (!usedTypes.has(card.objectType)) {
      selected.push(card);
      usedTypes.add(card.objectType);
    }
    if (selected.length === count) return selected;
  }

  for (const card of shuffled) {
    if (!selected.includes(card)) selected.push(card);
    if (selected.length === count) break;
  }
  return selected;
}

function toGameCard(card: CatalogCard): GameCard {
  const credit = imageCredits.find((item) => item.cardId === card.id);
  const attribute = (
    id: string,
    labelKey: string,
    unit: string,
    comparison: 'higher_wins' | 'lower_wins',
    displayOrder: number,
    value: number,
    isApproximate: boolean,
  ) => ({ id, labelKey, unit, comparison, displayOrder, value, isApproximate });

  return {
    id: card.id,
    kind: 'astronomical',
    effectKey: null,
    catalogName: card.catalogName,
    commonName: card.commonName,
    objectType: card.objectType,
    constellation: card.constellation,
    image: credit
      ? {
          id: credit.id,
          src: credit.asset,
          collectionName: credit.collectionName,
          photographerName: credit.photographer,
          photographerHandle: credit.handle,
        }
      : null,
    attributes: [
      attribute('distance_light_years', 'attribute.distance', 'ly', 'higher_wins', 1, card.distanceLightYears, true),
      attribute(
        'apparent_magnitude',
        'attribute.apparentMagnitude',
        'mag',
        'lower_wins',
        2,
        card.apparentMagnitude,
        false,
      ),
      attribute(
        'apparent_size_arcmin',
        'attribute.apparentSize',
        'arcmin',
        'higher_wins',
        3,
        card.apparentSizeArcmin,
        false,
      ),
      attribute(
        'physical_size_light_years',
        'attribute.physicalSize',
        'ly',
        'higher_wins',
        4,
        card.physicalSizeLightYears,
        true,
      ),
    ],
  };
}

@Component({
  selector: 'app-home-page',
  imports: [ReactiveFormsModule, RouterLink, GameCardComponent],
  providers: [LobbyFacade],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent implements OnInit {
  protected readonly i18n = inject(TranslationService);
  private readonly analytics = inject(AnalyticsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly facade = inject(LobbyFacade);
  private readonly supabase = inject(SupabaseService);
  protected readonly intent = signal<Intent | null>(null);
  protected readonly submitting = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly showHowToPlay = signal(false);
  protected readonly featuredCards = pickFeaturedCards(cardsData).map(toGameCard);
  protected readonly form = new FormGroup({
    displayName: new FormControl(localStorage.getItem('dsd-display-name') ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(32)],
    }),
    roomCode: new FormControl('', { nonNullable: true }),
    cpuDifficulty: new FormControl<CpuDifficulty>('medium', { nonNullable: true }),
  });

  ngOnInit(): void {
    const invitedCode = normalizeRoomCode(this.route.snapshot.paramMap.get('code') ?? '');
    if (invitedCode) {
      this.form.controls.roomCode.setValue(invitedCode);
      this.choose('join');
    } else if (this.route.snapshot.queryParamMap.get('action') === 'create') {
      this.choose('create');
    }
  }
  choose(intent: Intent): void {
    this.intent.set(intent);
    this.errorKey.set(null);
    if (intent === 'join') this.form.controls.roomCode.addValidators(Validators.required);
  }
  back(): void {
    this.intent.set(null);
    this.errorKey.set(null);
  }
  normalizeCode(): void {
    this.form.controls.roomCode.setValue(normalizeRoomCode(this.form.controls.roomCode.value));
  }
  @HostListener('document:keydown.escape')
  closeHowToPlay(): void {
    this.showHowToPlay.set(false);
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.controls.displayName.invalid) return void this.errorKey.set('home.error.requiredName');
    if (this.intent() === 'join' && !normalizeRoomCode(this.form.controls.roomCode.value))
      return void this.errorKey.set('home.error.requiredCode');
    if (!this.supabase.isConfigured) return void this.errorKey.set('home.error.config');

    this.submitting.set(true);
    this.errorKey.set(null);
    const displayName = this.form.controls.displayName.value.trim();
    localStorage.setItem('dsd-display-name', displayName);
    try {
      const intent = this.intent();
      const result =
        intent === 'create'
          ? await this.facade.create(displayName)
          : intent === 'cpu'
            ? await this.facade.createCpu(displayName, this.form.controls.cpuDifficulty.value)
            : await this.facade.join(normalizeRoomCode(this.form.controls.roomCode.value), displayName);
      this.analytics.track(intent === 'join' ? 'game_joined' : 'game_created', {
        game_id: result.gameId,
        game_mode: intent === 'cpu' ? 'cpu' : 'multiplayer',
        ...(intent === 'cpu' ? { cpu_difficulty: this.form.controls.cpuDifficulty.value } : {}),
      });
      await this.router.navigate([intent === 'cpu' ? '/game' : '/lobby', result.code]);
    } catch {
      this.errorKey.set('home.error.generic');
      this.submitting.set(false);
    }
  }
}
