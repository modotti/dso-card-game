import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { TranslationService } from '../../../../core/i18n/translation.service';
import type { AttributeDefinition } from '../../domain/game.models';

@Component({
  selector: 'app-attribute-picker',
  templateUrl: './attribute-picker.component.html',
  styleUrl: './attribute-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttributePickerComponent {
  readonly attributes = input.required<readonly AttributeDefinition[]>();
  readonly disabled = input(false);
  readonly selectedId = input<string | null>(null);
  readonly attributeSelected = output<string>();

  protected readonly i18n = inject(TranslationService);
}
