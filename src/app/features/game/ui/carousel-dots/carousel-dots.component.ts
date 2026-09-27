import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-carousel-dots',
  templateUrl: './carousel-dots.component.html',
  styleUrl: './carousel-dots.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CarouselDotsComponent {
  readonly total = input.required<number>();
  readonly current = input.required<number>();
  protected readonly dots = computed(() => Array.from({ length: this.total() }));
}
