import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ArtThumbComponent, ExerciseDemoComponent } from '../../components/exercise-art.component';
import { hasArt } from '../../domain/art';
import type { WorkoutDay } from '../../domain/models';
import { ROUTINES, type RoutineKey, gifUrl, videoUrl } from '../../domain/plan';
import { RestTimerService } from '../../services/rest-timer.service';
import { WorkoutStateService } from '../../services/workout-state.service';

const stamp = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

@Component({
  selector: 'wt-routine-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ArtThumbComponent, ExerciseDemoComponent],
  template: `
    <details
      #detailsRef
      class="card bg-base-100 border border-base-300 shadow-xs routine"
      [attr.data-routine]="routineKey()"
      [open]="initialOpen()"
    >
      <summary class="flex items-center justify-between gap-2.5 p-4 min-h-12 select-none">
        <span class="flex flex-1 items-baseline gap-2 flex-wrap min-w-0">
          <h2 class="text-base font-bold m-0">{{ routine().title }}</h2>
          <span class="text-xs opacity-70">{{ routine().time }}</span>
        </span>
        <span class="text-sm opacity-75 tabular-nums" [attr.data-testid]="routineKey() + '-count'">
          {{ doneCount() }} of {{ routine().steps.length }}
        </span>
      </summary>

      <div class="px-4 pb-3 flex flex-col">
        @for (step of routine().steps; track step.id) {
          <div class="border-t border-base-300 py-1.5">
            <div class="flex items-center gap-2">
              <label class="flex items-center gap-2.5 flex-1 min-w-0 min-h-11 cursor-pointer">
                <input
                  type="checkbox"
                  class="checkbox checkbox-primary checkbox-sm shrink-0"
                  [checked]="isStepDone(step.id)"
                  [attr.aria-label]="step.text"
                  (change)="toggleStep(step.id, $event)"
                />
                <span class="flex flex-col min-w-0">
                  <strong class="text-sm font-semibold leading-snug">{{ step.text }}</strong>
                  <span class="text-xs opacity-70 leading-snug">{{ step.detail }}</span>
                </span>
              </label>

              @if (hasArtFor(step.id)) {
                <button
                  type="button"
                  class="art-thumb step-thumb shrink-0"
                  [attr.aria-expanded]="'' + isDemoOpen(step.id)"
                  [attr.aria-label]="'Show how to do ' + step.text"
                  (click)="toggleDemo(step.id)"
                >
                  <wt-art-thumb [moveId]="step.id" />
                  <span class="art-hint" aria-hidden="true">{{ isDemoOpen(step.id) ? 'Hide' : 'How to' }}</span>
                </button>
              }

              @if (step.seconds; as secs) {
                <button
                  type="button"
                  class="btn btn-outline btn-sm min-w-16 shrink-0 tabular-nums"
                  [attr.aria-label]="'Start ' + formatStamp(secs) + ' timer for ' + step.text"
                  (click)="startTimer(secs, step.text)"
                >
                  {{ formatStamp(secs) }}
                </button>
              }
            </div>

            @if (hasArtFor(step.id)) {
              <div class="mt-2" [hidden]="!isDemoOpen(step.id)">
                <wt-exercise-demo
                  [moveId]="step.id"
                  [name]="step.text"
                  [active]="isDemoOpen(step.id)"
                  [showLinks]="!step.watch"
                />
                @if (!step.watch) {
                  <div class="hidden">{{ vLink(step.text) }}{{ gLink(step.text) }}</div>
                }
              </div>
            }
          </div>
        }
      </div>
    </details>
  `,
})
export class RoutineCardComponent {
  readonly state = inject(WorkoutStateService);
  private readonly timer = inject(RestTimerService);

  readonly day = input.required<WorkoutDay>();
  readonly routineKey = input.required<RoutineKey>();

  private readonly detailsRef = viewChild<ElementRef<HTMLDetailsElement>>('detailsRef');
  private readonly openDemos = signal<Record<string, boolean>>({});
  private prevDone = -1;

  readonly routine = computed(() => ROUTINES[this.routineKey()]);
  readonly doneCount = computed(() => {
    const steps = this.day().steps;
    return this.routine().steps.filter(s => steps?.[s.id] === true).length;
  });
  readonly initialOpen = computed(() => this.doneCount() < this.routine().steps.length);

  constructor() {
    effect(() => {
      const done = this.doneCount();
      const total = this.routine().steps.length;
      if (this.prevDone !== -1 && done === total && this.prevDone < total) {
        const el = this.detailsRef()?.nativeElement;
        if (el) el.open = false;
      }
      this.prevDone = done;
    });
  }

  hasArtFor(id: string): boolean {
    return hasArt(id);
  }

  isStepDone(id: string): boolean {
    return this.day().steps?.[id] === true;
  }

  isDemoOpen(id: string): boolean {
    return this.openDemos()[id] === true;
  }

  toggleDemo(id: string): void {
    this.openDemos.update(prev => ({ ...prev, [id]: !prev[id] }));
  }

  formatStamp(sec: number): string {
    return stamp(sec);
  }

  startTimer(sec: number, label: string): void {
    this.timer.start(sec, { beep: this.state.settings().beep, label });
  }

  vLink(text: string): string {
    return videoUrl(text);
  }

  gLink(text: string): string {
    return gifUrl(text);
  }

  toggleStep(stepId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const d = this.day();
    void this.state.mutateDay(d.date, copy => {
      if (!copy.steps) copy.steps = {};
      if (checked) copy.steps[stepId] = true;
      else delete copy.steps[stepId];
    });
  }
}
