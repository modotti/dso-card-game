import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { AchievementService } from '../../data-access/achievement.service';

@Component({
  selector: 'app-achievements-page',
  templateUrl: './achievements-page.component.html',
  styleUrl: './achievements-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AchievementsPageComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly achievements = inject(AchievementService);

  constructor() {
    this.achievements.syncDiscovery();
  }

  reset(): void {
    if (window.confirm(this.i18n.text('achievements.resetConfirm'))) this.achievements.reset();
  }
}
