import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-gameplay-tip',
  templateUrl: './gameplay-tip.component.html',
  styleUrl: './gameplay-tip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameplayTipComponent {
  readonly text = input.required<string>();
  readonly mobileOnly = input(false);
}
