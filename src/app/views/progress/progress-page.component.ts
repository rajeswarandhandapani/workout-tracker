import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DayCellComponent } from '../../components/day-cell.component';
import { dayLetter, shortDate } from '../../kit/dates';
import {
  exerciseHistory,
  programRows,
  programTotals,
  programWeek,
  weekDates,
} from '../../domain/logic';
import type { ExerciseHistoryPoint, MoveDef } from '../../domain/models';
import { CARDIO_GOAL, EXERCISES, GYM_PER_WEEK, WEEKS } from '../../domain/plan';
import { WorkoutStateService } from '../../services/workout-state.service';
import { ExerciseLineChartComponent } from './exercise-line-chart.component';
import { WeeklyBarsChartComponent } from './weekly-bars-chart.component';

@Component({
  selector: 'wt-progress-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DayCellComponent, WeeklyBarsChartComponent, ExerciseLineChartComponent],
  template: `
    <h1 class="text-2xl font-bold tracking-tight">Progress</h1>

    @if (!state.settings().startDate) {
      <section class="card bg-base-100 border border-base-300 shadow-xs">
        <div class="card-body p-4">
          <p class="text-sm m-0">Choose a start date on the Today screen to begin.</p>
        </div>
      </section>
    } @else {
      <div class="grid grid-cols-3 max-[480px]:grid-cols-2 gap-2.5">
        <div class="card bg-base-100 border border-base-300 shadow-xs">
          <div class="card-body p-3 gap-1">
            <span class="text-xs opacity-75">Gym visits</span>
            <b class="text-lg tabular-nums" data-testid="total-gym">{{ totals().gym }} of {{ gymGoalTotal() }}</b>
            <progress class="progress progress-info w-full" [value]="totals().gym" [max]="gymGoalTotal()"></progress>
          </div>
        </div>

        <div class="card bg-base-100 border border-base-300 shadow-xs">
          <div class="card-body p-3 gap-1">
            <span class="text-xs opacity-75">Cardio minutes</span>
            <b class="text-lg tabular-nums" data-testid="total-cardio">{{ totals().cardio }}</b>
            <progress class="progress progress-warning w-full" [value]="totals().cardio" [max]="cardioGoalTotal()"></progress>
          </div>
        </div>

        <div class="card bg-base-100 border border-base-300 shadow-xs max-[480px]:col-span-2">
          <div class="card-body p-3 gap-1">
            <span class="text-xs opacity-75">Weeks at {{ cardioGoal }}+ min</span>
            <b class="text-lg tabular-nums">{{ totals().goalWeeks }} of {{ rows().length }}</b>
            <progress class="progress progress-success w-full" [value]="totals().goalWeeks" [max]="rows().length"></progress>
          </div>
        </div>
      </div>

      <section class="card bg-base-100 border border-base-300 shadow-xs">
        <div class="card-body p-4 gap-3">
          <h2 class="text-base font-bold m-0">12-week calendar</h2>

          <div class="calendar">
            <span></span>
            @for (d of headerDates(); track d) {
              <span class="text-xs opacity-70 text-center">{{ letterOf(d) }}</span>
            }
            @for (r of rows(); track r.week) {
              <span
                class="text-xs text-center tabular-nums"
                [class.font-bold]="r.week === currentWeek()"
                [class.opacity-70]="r.week !== currentWeek()"
              >{{ r.week }}</span>
              @for (d of weekOf(r.monday); track d) {
                <wt-day-cell [iso]="d" class="w-full" />
              }
            }
          </div>

          <div class="flex flex-wrap gap-x-4 gap-y-1.5 text-xs opacity-80">
            <span class="inline-flex items-center gap-1.5">
              <i class="cell mini" data-s="gym">G</i>Gym
            </span>
            <span class="inline-flex items-center gap-1.5">
              <i class="cell mini" data-s="cardio">C</i>Cardio
            </span>
            <span class="inline-flex items-center gap-1.5">
              <i class="cell mini" data-s="rest">R</i>Rest
            </span>
            <span class="inline-flex items-center gap-1.5">
              <i class="cell mini" data-s="missed">–</i>Missed
            </span>
          </div>
          <p class="text-xs opacity-75 m-0">Tap a past day to open or change it.</p>
        </div>
      </section>

      <section class="card bg-base-100 border border-base-300 shadow-xs">
        <div class="card-body p-4 gap-3">
          <h2 class="text-base font-bold m-0">Cardio minutes per week</h2>
          <wt-weekly-bars-chart [rows]="rows()" [goal]="cardioGoal" [currentWeek]="currentWeek()" />

          <details>
            <summary class="text-xs opacity-75 cursor-pointer">Show as a table</summary>
            <div class="overflow-x-auto mt-2">
              <table class="table table-xs w-full">
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>From</th>
                    <th class="text-right">Cardio min</th>
                    <th class="text-right">Gym visits</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of rows(); track r.week) {
                    <tr>
                      <td>{{ r.week }}</td>
                      <td>{{ formatShort(r.monday) }}</td>
                      <td class="text-right tabular-nums">{{ r.cardio }}</td>
                      <td class="text-right tabular-nums">{{ r.gym }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </section>

      <section class="card bg-base-100 border border-base-300 shadow-xs">
        <div class="card-body p-4 gap-3">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <h2 class="text-base font-bold m-0">{{ chartTitle() }}</h2>
            <select
              class="select select-bordered select-sm max-w-[58%]"
              aria-label="Exercise"
              [value]="activeExercise().id"
              (change)="onExercisePick($event)"
            >
              @for (opt of exerciseOptions(); track opt.id) {
                <option [value]="opt.id" [selected]="opt.id === activeExercise().id">{{ opt.name }}</option>
              }
            </select>
          </div>

          @if (historyPoints().length) {
            <wt-exercise-line-chart
              [points]="historyPoints()"
              [unit]="exerciseUnit()"
              [exercise]="activeExercise()"
            />
            <details>
              <summary class="text-xs opacity-75 cursor-pointer">Show as a table</summary>
              <div class="overflow-x-auto mt-2">
                <table class="table table-xs w-full">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Sets</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (p of reversedPoints(); track p.date) {
                      <tr>
                        <td>{{ formatShort(p.date) }}</td>
                        <td>{{ describePoint(p) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </details>
          } @else {
            <p class="text-sm opacity-75 m-0">
              Finish a set of {{ activeExercise().name.toLowerCase() }} to see it here.
            </p>
          }
        </div>
      </section>
    }
  `,
})
export class ProgressPageComponent {
  readonly state = inject(WorkoutStateService);
  readonly cardioGoal = CARDIO_GOAL;

  readonly currentWeek = computed(() => {
    const start = this.state.settings().startDate;
    return start ? programWeek(this.state.today(), start) : 0;
  });

  readonly rows = computed(() => {
    const start = this.state.settings().startDate;
    if (!start) return [];
    const count = Math.max(WEEKS, programWeek(this.state.today(), start));
    return programRows(this.state.days(), start, count);
  });

  readonly totals = computed(() => programTotals(this.rows()));
  readonly gymGoalTotal = computed(() => this.rows().length * GYM_PER_WEEK);
  readonly cardioGoalTotal = computed(() => this.rows().length * CARDIO_GOAL);
  readonly headerDates = computed(() => (this.rows().length ? weekDates(this.rows()[0].monday) : []));

  readonly activeExercise = computed<MoveDef>(
    () => this.state.findMove(this.state.selectedExercise()) || EXERCISES[0],
  );

  readonly exerciseOptions = computed<MoveDef[]>(() => {
    const days = this.state.days();
    const map = new Map<string, MoveDef>();
    for (const id of this.state.routineIds()) {
      const m = this.state.findMove(id);
      if (m) map.set(m.id, m);
    }
    const cur = this.activeExercise();
    map.set(cur.id, cur);
    for (const m of this.state.allMoves()) {
      if (exerciseHistory(days, m).length) map.set(m.id, m);
    }
    return [...map.values()];
  });

  readonly historyPoints = computed(() => exerciseHistory(this.state.days(), this.activeExercise()));
  readonly reversedPoints = computed(() => [...this.historyPoints()].reverse());
  readonly exerciseUnit = computed(() => (this.activeExercise().weighted ? 'lb' : this.activeExercise().unit));
  readonly chartTitle = computed(() => {
    const ex = this.activeExercise();
    return ex.weighted ? 'Heaviest set' : ex.unit === 'sec' ? 'Longest hold' : 'Most reps';
  });

  letterOf(iso: string): string {
    return dayLetter(iso);
  }

  weekOf(monday: string): string[] {
    return weekDates(monday);
  }

  formatShort(iso: string): string {
    return shortDate(iso);
  }

  onExercisePick(event: Event): void {
    this.state.selectedExercise.set((event.target as HTMLSelectElement).value);
  }

  describePoint(p: ExerciseHistoryPoint): string {
    const ex = this.activeExercise();
    return p.sets
      .map(s => (ex.weighted ? `${s.weight} lb${ex.assisted ? ' assist' : ''} × ${s.value}` : `${s.value} ${ex.unit}`))
      .join(', ');
  }
}
