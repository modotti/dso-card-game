import type { OnInit } from '@angular/core';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AnalyticsService } from './core/analytics/analytics.service';
import { BackgroundAudioService } from './core/audio/background-audio.service';
import { TranslationService } from './core/i18n/translation.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  protected readonly i18n = inject(TranslationService);
  protected readonly backgroundAudio = inject(BackgroundAudioService);
  private readonly analytics = inject(AnalyticsService);

  ngOnInit(): void {
    this.analytics.track('app_opened');
  }
}
