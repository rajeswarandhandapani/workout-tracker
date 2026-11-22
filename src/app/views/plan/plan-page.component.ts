import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MuscleMapComponent } from '../../components/exercise-art.component';
import { addDays, fromIso, programWeek, weekdayOf } from '../../domain/logic';
import {
  ALL_FAMILIES,
  CARDIO_NOTES,
  CHECK_FIRST,
  EXERCISES,
  FOLLOW_UP,
  FOOD_NOTES,
  GYM_NOTES,
  PHASES,
  ROUTINES,
  type RoutineKey,
  SAFETY,
  SCHEDULE,
  SCHEDULE_ORDER,
  alternatesOf,
  gifUrl,
  target,
  videoUrl,
} from '../../domain/plan';
import type { MoveDef } from '../../domain/models';
import { WorkoutStateService } from '../../services/workout-state.service';

const SHORT_WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

@Component({
  selector: 'wt-plan-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MuscleMapComponent],
  template: `
    <h1 class="text-2xl font-bold tracking-tight">12-week plan</h1>

    <nav class="flex flex-wrap gap-1.5" aria-label="Plan sections">
      @for (j of jumps; track j.id) {
        <button type="button" class="btn btn-xs btn-outline rounded-full" (click)="jumpTo(j.id)">
          {{ j.label }}
        </button>
      }
    </nav>

    <section class="card bg-base-100 border border-base-300 shadow-xs" id="plan-schedule">
      <div class="card-body p-4 gap-2">
        <h2 class="text-base font-bold m-0">Weekly schedule</h2>
        <div class="overflow-x-auto">
          <table class="table table-xs w-full">
            <tbody>
              @for (d of scheduleRows; track d.dayIndex) {
                <tr [class.bg-primary/10]="d.dayIndex === todayWeekday()">
                  <th scope="row" class="font-semibold">{{ d.dayName }}</th>
                  <td>{{ d.title }}</td>
                  <td class="text-right opacity-75 tabular-nums">{{ d.time }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="card bg-base-100 border border-base-300 shadow-xs">
      <div class="card-body p-4 gap-2">
        <h2 class="text-base font-bold m-0">Stages</h2>
        @for (p of phases; track p.from) {
          <div
            class="flex flex-col px-2.5 py-2 rounded-lg"
            [class.bg-primary/10]="currentWeek() >= p.from && currentWeek() <= p.to"
          >
            <strong class="text-sm font-semibold">Weeks {{ p.from }}–{{ p.to }}</strong>
            <span class="text-sm opacity-85">{{ p.name }}</span>
          </div>
        }
      </div>
    </section>

    <section class="card bg-base-100 border border-base-300 shadow-xs" id="plan-gym">
      <div class="card-body p-4 gap-3">
        <h2 class="text-base font-bold m-0">Full-body gym workout</h2>
        <div class="overflow-x-auto">
          <table class="table table-xs w-full">
            <tbody>
              @for (e of exercises; track e.id) {
                <tr>
                  <th scope="row" class="font-semibold align-top">{{ e.name }}</th>
                  <td class="opacity-80">
                    <span class="inline-flex items-center gap-1.5">
                      <wt-muscle-map [focus]="e.focus" />
                      <span>{{ e.focus }}</span>
                    </span>
                    <div class="flex items-center gap-2.5 flex-wrap mt-0.5">
                      <a
                        class="link ext-link text-xs"
                        [href]="vUrl(e)"
                        target="_blank"
                        rel="noopener noreferrer"
                        [attr.aria-label]="'Watch ' + e.name + ' video'"
                      >Video ↗</a>
                      <a
                        class="link ext-link text-xs"
                        [href]="gUrl(e)"
                        target="_blank"
                        rel="noopener noreferrer"
                        [attr.aria-label]="'View ' + e.name + ' animated GIF'"
                      >GIF ↗</a>
                    </div>
                  </td>
                  <td class="text-right align-top tabular-nums whitespace-nowrap">{{ targetText(e) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <h3 class="text-sm font-bold mt-2 m-0">Each gym visit</h3>
        <ul class="list-disc pl-5 text-sm space-y-1 m-0">
          @for (note of gymNotes; track note) {
            <li>{{ note }}</li>
          }
        </ul>
      </div>
    </section>

    <section class="card bg-base-100 border border-base-300 shadow-xs" id="plan-swap">
      <div class="card-body p-4 gap-3">
        <h2 class="text-base font-bold m-0">If a machine is taken</h2>
        <p class="text-sm opacity-75 m-0">
          Tap Swap on an exercise during your workout to pick another movement in the same family. Each alternate keeps its own weight history.
        </p>

        @for (fam of swapFamilies; track fam.family.id) {
          <div class="pt-2 border-t border-base-300 first-of-type:border-t-0 first-of-type:pt-0">
            <h3 class="text-sm font-bold m-0">{{ fam.family.name }}</h3>
            @if (fam.family.family) {
              <p class="text-xs opacity-70 m-0">{{ fam.family.family }}</p>
            }
            <ul class="list-disc pl-5 text-sm space-y-1 mt-1.5 m-0">
              @for (a of fam.alternates; track a.id) {
                <li>
                  <span>{{ a.name }}{{ a.fallback ? ' (' + a.fallback + ')' : '' }}: {{ a.how }} </span>
                  <a
                    class="link ext-link text-xs"
                    [href]="vUrl(a)"
                    target="_blank"
                    rel="noopener noreferrer"
                    [attr.aria-label]="'Watch ' + a.name + ' video'"
                  >Video ↗</a>
                  <span> · </span>
                  <a
                    class="link ext-link text-xs"
                    [href]="gUrl(a)"
                    target="_blank"
                    rel="noopener noreferrer"
                    [attr.aria-label]="'View ' + a.name + ' animated GIF'"
                  >GIF ↗</a>
                </li>
              }
            </ul>
          </div>
        }
      </div>
    </section>

    <section class="card bg-base-100 border border-base-300 shadow-xs" id="plan-warm">
      <div class="card-body p-4 gap-3">
        <h2 class="text-base font-bold m-0">Warm-up and stretching</h2>
        @for (sec of routineSections; track sec.key) {
          <div class="pt-2 border-t border-base-300 first-of-type:border-t-0 first-of-type:pt-0">
            <h3 class="text-sm font-bold m-0">{{ sec.label }}</h3>
            <ul class="list-disc pl-5 text-sm space-y-1 mt-1.5 m-0">
              @for (s of sec.steps; track s.id) {
                <li>{{ s.text }}: {{ s.detail }}</li>
              }
            </ul>
          </div>
        }
      </div>
    </section>

    <section class="card bg-base-100 border border-base-300 shadow-xs" id="plan-cardio">
      <div class="card-body p-4 gap-2">
        <h2 class="text-base font-bold m-0">Cardio and heart rate</h2>
        <ul class="list-disc pl-5 text-sm space-y-1 m-0">
          @for (note of cardioNotes; track note) {
            <li>{{ note }}</li>
          }
        </ul>
      </div>
    </section>

    <section class="card bg-base-100 border border-base-300 shadow-xs" id="plan-food">
      <div class="card-body p-4 gap-2">
        <h2 class="text-base font-bold m-0">Food habits</h2>
        <ul class="list-disc pl-5 text-sm space-y-1 m-0">
          @for (note of foodNotes; track note) {
            <li>{{ note }}</li>
          }
        </ul>
      </div>
    </section>

    <section class="card bg-base-100 border border-base-300 shadow-xs">
      <div class="card-body p-4 gap-2">
        <h2 class="text-base font-bold m-0">Follow-up</h2>
        <p class="text-sm m-0">{{ followUp }}</p>
      </div>
    </section>

    <section class="card bg-warning/15 border border-warning/30 shadow-xs">
      <div class="card-body p-4 gap-2">
        <h2 class="text-base font-bold m-0">Safety</h2>
        <p class="text-sm m-0">{{ safety }}</p>
        <p class="text-sm m-0">{{ checkFirst }}</p>
      </div>
    </section>
  `,
})
export class PlanPageComponent {
  readonly state = inject(WorkoutStateService);

  readonly jumps = [
    { id: 'plan-schedule', label: 'Schedule' },
    { id: 'plan-gym', label: 'Gym' },
    { id: 'plan-swap', label: 'Alternates' },
    { id: 'plan-warm', label: 'Warm-up' },
    { id: 'plan-cardio', label: 'Cardio' },
    { id: 'plan-food', label: 'Food' },
  ];

  readonly scheduleRows = SCHEDULE_ORDER.map(d => {
    const plan = SCHEDULE[d];
    const name = SHORT_WEEKDAY.format(fromIso(addDays('2026-11-09', (d + 6) % 7)));
    return { dayIndex: d, dayName: name, title: plan.title, time: plan.time };
  });

  readonly phases = PHASES;
  readonly exercises = EXERCISES;
  readonly gymNotes = GYM_NOTES;
  readonly cardioNotes = CARDIO_NOTES;
  readonly foodNotes = FOOD_NOTES;
  readonly followUp = FOLLOW_UP;
  readonly safety = SAFETY;
  readonly checkFirst = CHECK_FIRST;

  readonly swapFamilies = ALL_FAMILIES.map(f => ({ family: f, alternates: alternatesOf(f) })).filter(
    x => x.alternates.length > 0,
  );

  readonly routineSections: Array<{ key: RoutineKey; label: string; steps: typeof ROUTINES['gym-pre']['steps'] }> = (
    [
      ['gym-pre', 'Gym warm-up'],
      ['gym-post', 'Gym cool-down and stretch'],
      ['cardio-pre', 'Cardio warm-up'],
      ['cardio-post', 'Cardio cool-down and stretch'],
    ] as const
  ).map(([key, label]) => ({ key, label, steps: ROUTINES[key].steps }));

  readonly todayWeekday = computed(() => weekdayOf(this.state.today()));
  readonly currentWeek = computed(() => {
    const start = this.state.settings().startDate;
    return start ? programWeek(this.state.today(), start) : 0;
  });

  vUrl(item: MoveDef): string {
    return videoUrl(item);
  }

  gUrl(item: MoveDef): string {
    return gifUrl(item);
  }

  targetText(item: MoveDef): string {
    return target(item);
  }

  jumpTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
