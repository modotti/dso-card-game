import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { PHOTO_TERMS_VERSION } from '../../domain/photo-submission';

@Component({
  selector: 'app-photo-terms-page',
  imports: [RouterLink],
  templateUrl: './photo-terms-page.component.html',
  styleUrl: '../../../legal/pages/privacy-page/privacy-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoTermsPageComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly version = PHOTO_TERMS_VERSION;
}
