import type { OnInit } from '@angular/core';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AnalyticsService } from '../../../../core/analytics/analytics.service';
import type { TranslationKey } from '../../../../core/i18n/translation.service';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { SupabaseService } from '../../../../core/supabase/supabase.service';
import { normalizeRoomCode } from '../../../lobby/domain/lobby.models';
import { LobbyFacade } from '../../../lobby/state/lobby.facade';

type Intent = 'create' | 'join';

@Component({
  selector: 'app-home-page',
  imports: [ReactiveFormsModule],
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
  protected readonly form = new FormGroup({
    displayName: new FormControl(localStorage.getItem('dsd-display-name') ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(32)],
    }),
    roomCode: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.analytics.track('landing_view');
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
      const result =
        this.intent() === 'create'
          ? await this.facade.create(displayName)
          : await this.facade.join(normalizeRoomCode(this.form.controls.roomCode.value), displayName);
      this.analytics.track(this.intent() === 'create' ? 'game_created' : 'game_joined');
      await this.router.navigate(['/lobby', result.code]);
    } catch {
      this.errorKey.set('home.error.generic');
      this.submitting.set(false);
    }
  }
}
