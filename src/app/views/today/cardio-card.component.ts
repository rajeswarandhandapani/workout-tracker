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
import { ToastService } from '../../kit/toast.service';
import { cardioOf, lastCardio, num } from '../../domain/logic';
import type { CardioEntry, CardioType, WorkoutDay } from '../../domain/models';
import { CARDIO_GOAL, CARDIO_TYPES, HEART_RATE, type ScheduleSlot, cardioName } from '../../domain/plan';
import { WorkoutStateService } from '../../services/workout-state.service';

@Component({
  selector: 'wt-cardio-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card bg-base-100 border border-base-300 shadow-xs">
      <div class="card-body p-4 gap-3">
        <h2 class="text-base font-bold m-0">Cardio</h2>

        @if (entries().length) {
          <div class="flex flex-col">
            @for (entry of entries(); track entry.id) {
              <div class="flex items-center justify-between gap-2 py-2 border-t border-base-300 first:border-t-0 first:pt-0">
                <div>
                  <strong class="text-sm font-semibold">{{ cardioTitle(entry.type) }}</strong>
                  <p class="text-xs opacity-75 m-0">{{ entryFacts(entry) }}</p>
                </div>
                <button
                  type="button"
                  class="link text-xs opacity-80"
                  [attr.aria-label]="'Remove ' + cardioTitle(entry.type)"
                  (click)="removeEntry(entry)"
                >Remove</button>
              </div>
            }
          </div>
        }

        <div class="grid grid-cols-2 gap-2.5">
          <label class="flex flex-col gap-1">
            <span class="text-xs opacity-75">Activity</span>
            <select
              class="select select-bordered select-sm min-h-11 w-full"
              aria-label="Activity"
              [value]="activityType()"
              (change)="onTypeChange($event)"
            >
              @for (item of cardioTypes; track item[0]) {
                <option [value]="item[0]" [selected]="item[0] === activityType()">{{ item[1] }}</option>
              }
            </select>
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-xs opacity-75">Average heart rate</span>
            <input
              #hrInput
              type="number"
              inputmode="numeric"
              min="30"
              max="230"
              step="1"
              placeholder="Optional"
              aria-label="Average heart rate"
              class="input input-bordered input-sm min-h-11 w-full tabular-nums"
              [value]="hrValue()"
              (focus)="selectOnFocus($event)"
              (input)="hrValue.set($any($event.target).value)"
            />
          </label>

          <div class="col-span-2 flex flex-col gap-1">
            <span class="text-xs opacity-75">Minutes</span>
            <div class="grid grid-cols-[64px_1fr_64px] gap-2">
              <button
                type="button"
                class="btn btn-outline min-h-11 px-0"
                aria-label="5 minutes less"
                (click)="stepMinutes(-5)"
              >−5</button>
              <input
                #minInput
                type="number"
                inputmode="numeric"
                min="1"
                max="600"
                step="1"
                aria-label="Minutes"
                class="input input-bordered min-h-11 w-full text-center tabular-nums"
                [value]="minutesValue()"
                (focus)="selectOnFocus($event)"
                (input)="minutesValue.set($any($event.target).value)"
              />
              <button
                type="button"
                class="btn btn-outline min-h-11 px-0"
                aria-label="5 minutes more"
                (click)="stepMinutes(5)"
              >+5</button>
            </div>
          </div>
        </div>

        <label class="flex items-center gap-2.5 min-h-11 cursor-pointer">
          <input
            type="checkbox"
            class="checkbox checkbox-primary checkbox-sm"
            [checked]="talkPassed()"
            (change)="talkPassed.set($any($event.target).checked)"
          />
          <span class="text-sm">I could still speak in full sentences</span>
        </label>

        <p class="text-xs opacity-75 m-0">
          Moderate range is roughly {{ heartRateRange }}. Gentle walks are saved but not counted toward {{ cardioGoal }} minutes.
        </p>

        <button type="button" class="btn btn-primary min-h-11" (click)="log()">
          {{ entries().length ? 'Log more cardio' : 'Log cardio' }}
        </button>
      </div>
    </section>
  `,
})
export class CardioCardComponent {
  readonly state = inject(WorkoutStateService);
  private readonly toast = inject(ToastService);

  readonly day = input.required<WorkoutDay>();
  readonly plan = input.required<ScheduleSlot>();

  private readonly minRef = viewChild<ElementRef<HTMLInputElement>>('minInput');
  private readonly hrRef = viewChild<ElementRef<HTMLInputElement>>('hrInput');

  readonly cardioTypes = CARDIO_TYPES;
  readonly heartRateRange = HEART_RATE;
  readonly cardioGoal = CARDIO_GOAL;

  readonly activityType = signal<CardioType>('walk');
  readonly minutesValue = signal('20');
  readonly hrValue = signal('');
  readonly talkPassed = signal(false);

  readonly entries = computed(() => cardioOf(this.day()));

  private prevKey = '';

  constructor() {
    effect(() => {
      const date = this.day().date;
      const plan = this.plan();
      const key = `${date}:${plan.kind}`;
      if (key === this.prevKey) return;
      this.prevKey = key;

      const previous = lastCardio(this.state.days(), date);
      const resting = plan.kind === 'rest';
      this.activityType.set(resting ? 'gentle' : previous?.type ?? 'walk');
      const startMinutes = resting
        ? (plan.minutes ?? 20)
        : Math.max(plan.minutes ?? 20, previous?.minutes ?? 0);
      this.minutesValue.set(String(startMinutes));
      this.hrValue.set('');
      this.talkPassed.set(false);
    });
  }

  cardioTitle(type: string): string {
    return cardioName(type);
  }

  entryFacts(e: CardioEntry): string {
    return [`${e.minutes} min`, e.hr ? `${e.hr} bpm` : '', e.talk ? 'talk test passed' : '']
      .filter(Boolean)
      .join(' · ');
  }

  selectOnFocus(event: Event): void {
    (event.target as HTMLInputElement).select?.();
  }

  onTypeChange(event: Event): void {
    this.activityType.set((event.target as HTMLSelectElement).value as CardioType);
  }

  stepMinutes(delta: number): void {
    const cur = num(this.minutesValue()) ?? 0;
    this.minutesValue.set(String(Math.max(1, cur + delta)));
  }

  removeEntry(entry: CardioEntry): void {
    const d = this.day();
    const before = [...(d.cardio || [])];
    void this.state.mutateDay(d.date, copy => {
      copy.cardio = before.filter(c => c.id !== entry.id);
    });
    this.toast.show('Removed.', {
      label: 'Undo',
      run: () => {
        void this.state.mutateDay(d.date, copy => {
          copy.cardio = before;
        });
      },
    });
  }

  log(): void {
    const mins = num(this.minutesValue());
    if (!mins || mins > 600) {
      this.toast.show('Enter between 1 and 600 minutes.');
      this.minRef()?.nativeElement.focus();
      return;
    }
    const rawHr = this.hrValue().trim();
    const beats = rawHr === '' ? null : num(rawHr);
    if (rawHr !== '' && (beats == null || beats < 30 || beats > 230)) {
      this.toast.show('Check the heart rate, or leave it empty.');
      this.hrRef()?.nativeElement.focus();
      return;
    }
    const d = this.day();
    const newEntry: CardioEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: this.activityType(),
      minutes: mins,
      hr: beats,
      talk: this.talkPassed(),
    };
    void this.state.mutateDay(d.date, copy => {
      copy.cardio = [...cardioOf(copy), newEntry];
      delete copy.rest;
    });
    this.hrValue.set('');
    this.talkPassed.set(false);
    this.toast.show(`Logged ${mins} minutes.`);
  }
}
