import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { dayName } from '../kit/dates';
import { statusOf } from '../domain/logic';
import type { DayStatus } from '../domain/models';
import { WorkoutStateService } from '../services/workout-state.service';

const STATUS_WORD: Record<DayStatus, string> = {
  gym: 'gym workout',
  cardio: 'cardio',
  both: 'gym and cardio',
  rest: 'rest day',
  missed: 'missed',
  future: 'upcoming',
  open: 'nothing logged',
};

@Component({
  selector: 'wt-day-cell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="cell w-full"
      [class.is-today]="iso() === state.today()"
      [class.selected]="selected()"
      [attr.data-s]="status()"
      [attr.data-date]="iso()"
      [disabled]="iso() > state.today()"
      [attr.aria-label]="ariaLabel()"
      (click)="pick()"
    >
      @if (status() === 'both') {
        <span class="g">G</span>
        <span class="c">C</span>
      } @else if (glyph(); as g) {
        <span>{{ g }}</span>
      } @else if (showDay()) {
        <span class="cell-day text-xs font-medium opacity-75 tabular-nums">{{ dayNumber() }}</span>
      }
    </button>
  `,
})
export class DayCellComponent {
  readonly state = inject(WorkoutStateService);
  private readonly router = inject(Router);

  readonly iso = input.required<string>();
  readonly selected = input<boolean>(false);
  readonly showDay = input<boolean>(false);

  readonly status = computed<DayStatus>(() => {
    const d = this.iso();
    return statusOf(this.state.days()[d], d, {
      today: this.state.today(),
      start: this.state.settings().startDate,
    });
  });

  readonly glyph = computed<string>(() => {
    const map: Partial<Record<DayStatus, string>> = {
      gym: 'G',
      cardio: 'C',
      rest: 'R',
      missed: '–',
    };
    return map[this.status()] ?? '';
  });

  readonly dayNumber = computed(() => Number(this.iso().slice(8)));
  readonly ariaLabel = computed(() => `${dayName(this.iso())}: ${STATUS_WORD[this.status()]}`);

  pick(): void {
    this.state.openDate(this.iso());
    void this.router.navigateByUrl('/');
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }
}
