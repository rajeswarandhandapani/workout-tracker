import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { shortDate } from '../../kit/dates';
import { ToastService } from '../../kit/toast.service';
import { DayCellComponent } from '../../components/day-cell.component';
import {
  addDays,
  cardioOf,
  cleanSettings,
  dayExerciseIds,
  lastPerformance,
  nextMonday,
  planDone,
  programWeek,
  setCountFor,
  setsDone,
  weekDates,
  weekdayOf,
} from '../../domain/logic';
import type { CustomKind, MoveDef } from '../../domain/models';
import {
  CARDIO_GOAL,
  CHECK_FIRST,
  CUSTOM_KINDS,
  EXERCISES,
  GYM_PER_WEEK,
  ROUTINES,
  type RoutineKey,
  SAFETY,
  SCHEDULE,
  WEEKS,
  phaseOf,
} from '../../domain/plan';
import { dayLetter, longDate, mondayOf } from '../../kit/dates';
import { WorkoutStateService } from '../../services/workout-state.service';
import { CardioCardComponent } from './cardio-card.component';
import { ExerciseCardComponent } from './exercise-card.component';
import { RoutineCardComponent } from './routine-card.component';

@Component({
  selector: 'wt-today-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DayCellComponent, RoutineCardComponent, ExerciseCardComponent, CardioCardComponent],
  template: `
    @if (!state.settings().startDate) {
      <h1 class="text-2xl font-bold tracking-tight">Start your 12 weeks</h1>

      <section class="card bg-base-100 border border-base-300 shadow-xs">
        <div class="card-body p-4 gap-3">
          <p class="text-sm m-0">
            Three gym days, three cardio days and one rest day each week, with your weights and minutes saved as you go.
          </p>
          <label class="flex flex-col gap-1">
            <span class="text-xs opacity-75">Week 1 starts</span>
            <input
              #setupDateInput
              type="date"
              class="input input-bordered w-full min-h-11"
              aria-label="Plan start date"
              [value]="setupDate()"
              (input)="setupDate.set($any($event.target).value)"
            />
          </label>
          <p class="text-xs opacity-75 m-0">Weeks run Monday to Sunday. Your logs stay on this device.</p>
          <button type="button" class="btn btn-primary min-h-11" (click)="startPlan()">Start the plan</button>
        </div>
      </section>

      <section class="card bg-warning/15 border border-warning/30 shadow-xs">
        <div class="card-body p-4 gap-2">
          <h2 class="text-base font-bold m-0">Before you begin</h2>
          <p class="text-sm m-0">{{ checkFirst }}</p>
          <p class="text-sm m-0">{{ safety }}</p>
        </div>
      </section>
    } @else {
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn btn-outline btn-square min-h-11 min-w-11 text-xl leading-none"
          aria-label="Previous day"
          (click)="shiftDate(-1)"
        >‹</button>

        <div class="flex-1 min-w-0 text-center">
          <h1 class="text-xl font-bold tracking-tight m-0">
            {{ isToday() ? 'Today, ' + formatShort(activeDate()) : formatLong(activeDate()) }}
          </h1>
          <p class="text-xs opacity-75 m-0">{{ weekLine() }}</p>
          @if (!isToday()) {
            <button
              type="button"
              class="btn btn-xs btn-outline rounded-full mt-1.5"
              (click)="state.openDate(state.today())"
            >Back to today →</button>
          }
        </div>

        <button
          type="button"
          class="btn btn-outline btn-square min-h-11 min-w-11 text-xl leading-none"
          aria-label="Next day"
          [disabled]="activeDate() >= state.today()"
          (click)="shiftDate(1)"
        >›</button>
      </div>

      <div class="flex flex-col gap-3">
        <div class="strip">
          @for (d of weekDays(); track d) {
            <div class="flex flex-col items-center gap-1">
              <span class="text-xs opacity-70">{{ letterOf(d) }}</span>
              <wt-day-cell [iso]="d" [selected]="d === activeDate()" [showDay]="true" class="w-full" />
            </div>
          }
        </div>

        <div class="grid grid-cols-2 max-[480px]:grid-cols-1 gap-2.5">
          <div class="card bg-base-100 border border-base-300 shadow-xs">
            <div class="card-body p-3 gap-1">
              <span class="text-xs opacity-75">Cardio this week</span>
              <b class="text-lg tabular-nums" data-testid="week-cardio">
                {{ weekSum().cardio }} of {{ cardioGoal }} min
              </b>
              <progress
                class="progress progress-primary w-full"
                [value]="weekSum().cardio"
                [max]="cardioGoal"
                aria-label="Cardio minutes this week"
              ></progress>
            </div>
          </div>

          <div class="card bg-base-100 border border-base-300 shadow-xs">
            <div class="card-body p-3 gap-1">
              <span class="text-xs opacity-75">Gym this week</span>
              <b class="text-lg tabular-nums" data-testid="week-gym">
                {{ weekSum().gym }} of {{ gymPerWeek }} visits
              </b>
              <progress
                class="progress progress-primary w-full"
                [value]="weekSum().gym"
                [max]="gymPerWeek"
                aria-label="Gym visits this week"
              ></progress>
            </div>
          </div>
        </div>
      </div>

      <section class="flex items-center justify-between gap-3 px-0.5">
        <div>
          <span class="text-xs opacity-70">{{ isToday() ? 'Planned today' : 'Planned' }}</span>
          <h2 class="text-base font-bold m-0">{{ plan().title }}</h2>
        </div>
        <div class="text-right shrink-0">
          @if (isPlanDone()) {
            <span class="badge badge-success badge-soft font-semibold">Done</span>
          } @else {
            <span class="text-xs opacity-75">{{ plan().time }}</span>
          }
        </div>
      </section>

      @if (day().rest) {
        <section class="card bg-base-100 border border-base-300 shadow-xs">
          <div class="card-body p-4">
            <p class="text-sm m-0">Rest day saved. Recovery is part of the plan.</p>
          </div>
        </section>
      }

      @if (preRoutineKey(); as pk) {
        <wt-routine-card [day]="day()" [routineKey]="pk" />
      }

      @if (plan().kind === 'cardio') {
        @if (showCardio()) {
          <wt-cardio-card [day]="day()" [plan]="plan()" />
        }
        @if (showGym()) {
          <ng-container>
            <section class="card bg-base-100 border border-base-300 shadow-xs">
              <div class="card-body p-4 gap-3">
                <div class="flex flex-col gap-1.5">
                  <div class="flex items-center justify-between gap-2">
                    <h2 class="text-base font-bold m-0">Gym workout</h2>
                    <span class="text-sm opacity-75 tabular-nums" data-testid="set-count">
                      {{ gymDoneSets() }} of {{ gymTotalSets() }} sets
                    </span>
                  </div>
                  <progress
                    class="progress progress-success w-full"
                    aria-label="Gym workout sets completed"
                    [value]="gymDoneSets()"
                    [max]="gymTotalSets() || 1"
                  ></progress>
                </div>

                @if (slots().length === 0) {
                  <p class="text-sm opacity-75 m-0">No exercises for this day. Add one below.</p>
                }
                @for (slot of slots(); track slot.id) {
                  <wt-exercise-card [day]="day()" [slot]="slot" />
                }

                <div class="flex flex-col gap-2">
                  <div>
                    <button
                      type="button"
                      class="btn btn-outline btn-sm min-h-10"
                      (click)="addPanelOpen.set(!addPanelOpen())"
                    >+ Add exercise</button>
                  </div>
                  @if (addPanelOpen()) {
                    <div class="border-t border-base-300 pt-3 flex flex-col gap-2.5 add-panel">
                      <label class="flex flex-col gap-1">
                        <span class="text-xs opacity-75">Add to</span>
                        <select
                          class="select select-bordered select-sm min-h-11 w-full"
                          aria-label="Add to"
                          [value]="addScope()"
                          (change)="addScope.set($any($event.target).value)"
                        >
                          <option value="always">Every workout</option>
                          <option value="today">Today only</option>
                        </select>
                      </label>

                      @if (availableCount() > 0) {
                        <label class="flex flex-col gap-1">
                          <span class="text-xs opacity-75">Exercise</span>
                          <select
                            class="select select-bordered select-sm min-h-11 w-full"
                            aria-label="Exercise to add"
                            [value]="selectedAddId()"
                            (change)="selectedAddId.set($any($event.target).value)"
                          >
                            @if (availPlan().length) {
                              <optgroup label="From the plan">
                                @for (m of availPlan(); track m.id) {
                                  <option [value]="m.id">{{ m.name }}</option>
                                }
                              </optgroup>
                            }
                            @if (availOptional().length) {
                              <optgroup label="Optional families">
                                @for (m of availOptional(); track m.id) {
                                  <option [value]="m.id">{{ m.name }}</option>
                                }
                              </optgroup>
                            }
                            @if (availAlternates().length) {
                              <optgroup label="Alternates">
                                @for (m of availAlternates(); track m.id) {
                                  <option [value]="m.id">{{ m.name }}</option>
                                }
                              </optgroup>
                            }
                            @if (availCustom().length) {
                              <optgroup label="Your exercises">
                                @for (m of availCustom(); track m.id) {
                                  <option [value]="m.id">{{ m.name }}</option>
                                }
                              </optgroup>
                            }
                          </select>
                        </label>
                        <button type="button" class="btn btn-primary min-h-11" (click)="addSelectedMove()">Add</button>
                      }

                      <h3 class="text-sm font-bold mt-1.5 m-0">Not listed? Create your own</h3>
                      <label class="flex flex-col gap-1">
                        <span class="text-xs opacity-75">Name</span>
                        <input
                          #newNameInput
                          type="text"
                          maxlength="60"
                          placeholder="For example, cable crunch"
                          aria-label="New exercise name"
                          class="input input-bordered input-sm min-h-11 w-full"
                          [value]="newMoveName()"
                          (input)="newMoveName.set($any($event.target).value)"
                        />
                      </label>
                      <label class="flex flex-col gap-1">
                        <span class="text-xs opacity-75">Type</span>
                        <select
                          class="select select-bordered select-sm min-h-11 w-full"
                          aria-label="New exercise type"
                          [value]="newMoveKind()"
                          (change)="newMoveKind.set($any($event.target).value)"
                        >
                          @for (k of customKinds; track k[0]) {
                            <option [value]="k[0]">{{ k[1] }}</option>
                          }
                        </select>
                      </label>
                      <button type="button" class="btn btn-outline min-h-11" (click)="createAndAdd()">Create and add</button>
                    </div>
                  }
                </div>

                <p class="text-xs opacity-75 m-0">
                  Use weights that leave about 2–3 good reps in reserve. Ask gym staff to check your form on anything new.
                </p>
              </div>
            </section>
          </ng-container>
        }
      } @else {
        @if (showGym()) {
          <section class="card bg-base-100 border border-base-300 shadow-xs">
            <div class="card-body p-4 gap-3">
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center justify-between gap-2">
                  <h2 class="text-base font-bold m-0">Gym workout</h2>
                  <span class="text-sm opacity-75 tabular-nums" data-testid="set-count">
                    {{ gymDoneSets() }} of {{ gymTotalSets() }} sets
                  </span>
                </div>
                <progress
                  class="progress progress-success w-full"
                  aria-label="Gym workout sets completed"
                  [value]="gymDoneSets()"
                  [max]="gymTotalSets() || 1"
                ></progress>
              </div>

              @if (slots().length === 0) {
                <p class="text-sm opacity-75 m-0">No exercises for this day. Add one below.</p>
              }
              @for (slot of slots(); track slot.id) {
                <wt-exercise-card [day]="day()" [slot]="slot" />
              }

              <div class="flex flex-col gap-2">
                <div>
                  <button
                    type="button"
                    class="btn btn-outline btn-sm min-h-10"
                    (click)="addPanelOpen.set(!addPanelOpen())"
                  >+ Add exercise</button>
                </div>
                @if (addPanelOpen()) {
                  <div class="border-t border-base-300 pt-3 flex flex-col gap-2.5 add-panel">
                    <label class="flex flex-col gap-1">
                      <span class="text-xs opacity-75">Add to</span>
                      <select
                        class="select select-bordered select-sm min-h-11 w-full"
                        aria-label="Add to"
                        [value]="addScope()"
                        (change)="addScope.set($any($event.target).value)"
                      >
                        <option value="always">Every workout</option>
                        <option value="today">Today only</option>
                      </select>
                    </label>

                    @if (availableCount() > 0) {
                      <label class="flex flex-col gap-1">
                        <span class="text-xs opacity-75">Exercise</span>
                        <select
                          class="select select-bordered select-sm min-h-11 w-full"
                          aria-label="Exercise to add"
                          [value]="selectedAddId()"
                          (change)="selectedAddId.set($any($event.target).value)"
                        >
                          @if (availPlan().length) {
                            <optgroup label="From the plan">
                              @for (m of availPlan(); track m.id) {
                                <option [value]="m.id">{{ m.name }}</option>
                              }
                            </optgroup>
                          }
                          @if (availOptional().length) {
                            <optgroup label="Optional families">
                              @for (m of availOptional(); track m.id) {
                                <option [value]="m.id">{{ m.name }}</option>
                              }
                            </optgroup>
                          }
                          @if (availAlternates().length) {
                            <optgroup label="Alternates">
                              @for (m of availAlternates(); track m.id) {
                                <option [value]="m.id">{{ m.name }}</option>
                              }
                            </optgroup>
                          }
                          @if (availCustom().length) {
                            <optgroup label="Your exercises">
                              @for (m of availCustom(); track m.id) {
                                <option [value]="m.id">{{ m.name }}</option>
                              }
                            </optgroup>
                          }
                        </select>
                      </label>
                      <button type="button" class="btn btn-primary min-h-11" (click)="addSelectedMove()">Add</button>
                    }

                    <h3 class="text-sm font-bold mt-1.5 m-0">Not listed? Create your own</h3>
                    <label class="flex flex-col gap-1">
                      <span class="text-xs opacity-75">Name</span>
                      <input
                        #newNameInput
                        type="text"
                        maxlength="60"
                        placeholder="For example, cable crunch"
                        aria-label="New exercise name"
                        class="input input-bordered input-sm min-h-11 w-full"
                        [value]="newMoveName()"
                        (input)="newMoveName.set($any($event.target).value)"
                      />
                    </label>
                    <label class="flex flex-col gap-1">
                      <span class="text-xs opacity-75">Type</span>
                      <select
                        class="select select-bordered select-sm min-h-11 w-full"
                        aria-label="New exercise type"
                        [value]="newMoveKind()"
                        (change)="newMoveKind.set($any($event.target).value)"
                      >
                        @for (k of customKinds; track k[0]) {
                          <option [value]="k[0]">{{ k[1] }}</option>
                        }
                      </select>
                    </label>
                    <button type="button" class="btn btn-outline min-h-11" (click)="createAndAdd()">Create and add</button>
                  </div>
                }
              </div>

              <p class="text-xs opacity-75 m-0">
                Use weights that leave about 2–3 good reps in reserve. Ask gym staff to check your form on anything new.
              </p>
            </div>
          </section>
        }
        @if (showCardio()) {
          <wt-cardio-card [day]="day()" [plan]="plan()" />
        }
      }

      @if (postRoutineKey(); as pk) {
        <wt-routine-card [day]="day()" [routineKey]="pk" />
      }

      @if (hasActionButtons()) {
        <div class="flex flex-wrap gap-2">
          @if (!showGym()) {
            <button type="button" class="btn btn-outline flex-1 min-w-36 min-h-11" (click)="addExtra('gym')">Add gym workout</button>
          } @else if (state.addingGymDate() === activeDate() && plan().kind !== 'gym' && gymDoneSets() === 0) {
            <button type="button" class="btn btn-outline flex-1 min-w-36 min-h-11" (click)="hideExtra('gym')">Hide gym workout</button>
          }

          @if (!showCardio()) {
            <button type="button" class="btn btn-outline flex-1 min-w-36 min-h-11" (click)="addExtra('cardio')">Add cardio</button>
          } @else if (state.addingCardioDate() === activeDate() && plan().kind !== 'cardio' && cardioList().length === 0) {
            <button type="button" class="btn btn-outline flex-1 min-w-36 min-h-11" (click)="hideExtra('cardio')">Hide cardio</button>
          }

          @if (nothingLogged()) {
            <button type="button" class="btn btn-outline flex-1 min-w-36 min-h-11" (click)="toggleRest()">
              {{ day().rest ? 'Undo rest day' : 'Mark as rest day' }}
            </button>
          }
        </div>
      }

      <section class="card bg-base-100 border border-base-300 shadow-xs">
        <div class="card-body p-4 gap-2">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-base font-bold m-0">Note</h2>
            <span class="text-xs opacity-75" data-testid="note-status">
              {{ noteText().trim() ? 'Saved' : '' }}
            </span>
          </div>
          <textarea
            rows="2"
            maxlength="2000"
            aria-label="Note for this day"
            placeholder="How did it feel? Anything to remember?"
            class="textarea textarea-bordered w-full"
            [value]="noteText()"
            (input)="onNoteInput($event)"
            (change)="onNoteInput($event)"
          ></textarea>
        </div>
      </section>

      <p class="text-xs text-warning px-0.5 m-0">{{ safety }}</p>
    }
  `,
})
export class TodayPageComponent {
  readonly state = inject(WorkoutStateService);
  private readonly toast = inject(ToastService);

  private readonly newNameRef = viewChild<ElementRef<HTMLInputElement>>('newNameInput');

  readonly setupDate = signal(nextMonday(this.state.today()));
  readonly addPanelOpen = signal(false);
  readonly addScope = signal<'always' | 'today'>('always');
  readonly selectedAddId = signal('');
  readonly newMoveName = signal('');
  readonly newMoveKind = signal<CustomKind>('weight');

  readonly checkFirst = CHECK_FIRST;
  readonly safety = SAFETY;
  readonly cardioGoal = CARDIO_GOAL;
  readonly gymPerWeek = GYM_PER_WEEK;
  readonly customKinds = CUSTOM_KINDS;

  readonly activeDate = computed(() => this.state.date());
  readonly isToday = computed(() => this.activeDate() === this.state.today());
  readonly day = computed(() => this.state.currentDay());
  readonly plan = computed(() => SCHEDULE[weekdayOf(this.activeDate())]);
  readonly weekDays = computed(() => weekDates(mondayOf(this.activeDate())));
  readonly weekSum = computed(() => this.state.activeWeekSummary());
  readonly isPlanDone = computed(() => planDone(this.activeDate(), this.day()));

  readonly weekLine = computed(() => {
    const startDate = this.state.settings().startDate;
    const d = this.activeDate();
    if (!startDate) return '';
    if (d < startDate) return `The plan starts ${shortDate(startDate)}`;
    const week = programWeek(d, startDate);
    if (week > WEEKS) return `Week ${week}. The 12 weeks are done, so keep the routine going`;
    return `Week ${week} of ${WEEKS}: ${phaseOf(week)?.name ?? ''}`;
  });

  readonly gymDoneSets = computed(() => setsDone(this.day()));
  readonly cardioList = computed(() => cardioOf(this.day()));

  readonly showGym = computed(() => {
    const d = this.day();
    return !d.rest && (this.plan().kind === 'gym' || this.gymDoneSets() > 0 || this.state.addingGymDate() === d.date);
  });

  readonly showCardio = computed(() => {
    const d = this.day();
    return this.cardioList().length > 0 || (!d.rest && (this.plan().kind === 'cardio' || this.state.addingCardioDate() === d.date));
  });

  readonly preRoutineKey = computed<RoutineKey | null>(() => {
    const g = this.showGym();
    const c = this.showCardio();
    const steps = this.day().steps;
    const hasSteps = (key: RoutineKey) => ROUTINES[key].steps.some(s => steps?.[s.id] === true);
    if (g && c) return hasSteps('cardio-pre') && !hasSteps('gym-pre') ? 'cardio-pre' : 'gym-pre';
    if (g) return 'gym-pre';
    if (c) return 'cardio-pre';
    return null;
  });

  readonly postRoutineKey = computed<RoutineKey | null>(() => {
    const g = this.showGym();
    const c = this.showCardio();
    const steps = this.day().steps;
    const hasSteps = (key: RoutineKey) => ROUTINES[key].steps.some(s => steps?.[s.id] === true);
    if (g && c) return hasSteps('cardio-post') && !hasSteps('gym-post') ? 'cardio-post' : 'gym-post';
    if (g) return 'gym-post';
    if (c) return 'cardio-post';
    return null;
  });

  readonly slots = computed<MoveDef[]>(() =>
    dayExerciseIds(this.day(), this.state.routineIds())
      .map(id => this.state.findMove(id))
      .filter((m): m is MoveDef => Boolean(m)),
  );

  readonly gymTotalSets = computed(() => {
    const d = this.day();
    return this.slots().reduce((n, slot) => {
      const active = (d.gym?.swaps?.[slot.id] ? this.state.findMove(d.gym.swaps[slot.id]) : undefined) || slot;
      return n + setCountFor(d, active, lastPerformance(this.state.days(), active.id, d.date));
    }, 0);
  });

  readonly availableMoves = computed<MoveDef[]>(() => {
    const d = this.day();
    const used = new Set(
      this.slots().flatMap(s => {
        const active = (d.gym?.swaps?.[s.id] ? this.state.findMove(d.gym.swaps[s.id]) : undefined) || s;
        return [s.id, active.id];
      }),
    );
    return this.state.allMoves().filter(m => !used.has(m.id));
  });

  readonly availableCount = computed(() => this.availableMoves().length);
  readonly availPlan = computed(() => this.availableMoves().filter(m => !m.slot && !m.optionalFamily && !m.custom));
  readonly availOptional = computed(() => this.availableMoves().filter(m => !m.slot && m.optionalFamily));
  readonly availAlternates = computed(() => this.availableMoves().filter(m => Boolean(m.slot)));
  readonly availCustom = computed(() => this.availableMoves().filter(m => Boolean(m.custom)));

  readonly nothingLogged = computed(() => this.gymDoneSets() === 0 && this.cardioList().length === 0);
  readonly hasActionButtons = computed(() => {
    const p = this.plan();
    const g = this.showGym();
    const c = this.showCardio();
    return Boolean(
      !g ||
        (g && this.state.addingGymDate() === this.activeDate() && p.kind !== 'gym' && this.gymDoneSets() === 0) ||
        !c ||
        (c && this.state.addingCardioDate() === this.activeDate() && p.kind !== 'cardio' && this.cardioList().length === 0) ||
        this.nothingLogged(),
    );
  });

  readonly noteText = computed(() => this.day().note || '');

  constructor() {
    effect(() => {
      const avail = this.availableMoves();
      const ordered = [
        ...avail.filter(m => !m.slot && !m.optionalFamily && !m.custom),
        ...avail.filter(m => !m.slot && m.optionalFamily),
        ...avail.filter(m => Boolean(m.slot)),
        ...avail.filter(m => Boolean(m.custom)),
      ];
      const cur = this.selectedAddId();
      if (!ordered.some(m => m.id === cur)) {
        this.selectedAddId.set(ordered[0]?.id ?? '');
      }
    });
  }

  formatShort(iso: string): string {
    return shortDate(iso);
  }

  formatLong(iso: string): string {
    return longDate(iso);
  }

  letterOf(iso: string): string {
    return dayLetter(iso);
  }

  async startPlan(): Promise<void> {
    const cleaned = cleanSettings({ startDate: this.setupDate() }).startDate;
    if (!cleaned) {
      this.toast.show('Choose a start date first.');
      return;
    }
    await this.state.updateSettings(prev => ({ ...prev, startDate: cleaned }));
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }

  shiftDate(delta: number): void {
    this.state.openDate(addDays(this.activeDate(), delta));
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }

  addSelectedMove(): void {
    const id = this.selectedAddId();
    if (!id) return;
    this.addMoveToDay(id);
  }

  async createAndAdd(): Promise<void> {
    const title = this.newMoveName().trim();
    if (!title) {
      this.toast.show('Enter a name for the exercise.');
      this.newNameRef()?.nativeElement.focus();
      return;
    }
    if (this.state.allMoves().some(m => m.name.toLowerCase() === title.toLowerCase())) {
      this.toast.show('That exercise already exists. Choose it from the list.');
      return;
    }
    const id = `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const scope = this.addScope();
    const routine = this.state.routineIds();
    await this.state.updateSettings(prev => ({
      ...prev,
      custom: [...(prev.custom || []), { id, name: title, kind: this.newMoveKind() }],
      routine: scope === 'always' && !routine.includes(id) ? [...routine, id] : prev.routine,
    }));
    this.newMoveName.set('');
    await this.mutateMoveAddedToDay(id, scope, title);
  }

  private addMoveToDay(id: string): void {
    const scope = this.addScope();
    const routine = this.state.routineIds();
    if (scope === 'always' && !routine.includes(id)) {
      void this.state.updateSettings(prev => ({ ...prev, routine: [...routine, id] }));
    }
    const move = this.state.findMove(id);
    void this.mutateMoveAddedToDay(id, scope, move?.name ?? 'Exercise');
  }

  private async mutateMoveAddedToDay(id: string, scope: 'always' | 'today', label: string): Promise<void> {
    const routine = this.state.routineIds();
    await this.state.mutateDay(this.activeDate(), copy => {
      const gym = this.state.ensureGym(copy);
      const unskip = () => {
        gym.skip = (gym.skip || []).filter(x => x !== id);
      };
      if (scope === 'always') unskip();
      else if (routine.includes(id)) unskip();
      else gym.extra = [...(gym.extra || []), id];
    });
    this.addPanelOpen.set(false);
    this.toast.show(`${label} added.`);
  }

  addExtra(kind: 'gym' | 'cardio'): void {
    const d = this.activeDate();
    if (kind === 'gym') this.state.addingGymDate.set(d);
    else this.state.addingCardioDate.set(d);
    if (this.day().rest) {
      void this.state.mutateDay(d, copy => {
        delete copy.rest;
      });
    }
  }

  hideExtra(kind: 'gym' | 'cardio'): void {
    if (kind === 'gym') this.state.addingGymDate.set(null);
    else this.state.addingCardioDate.set(null);
  }

  toggleRest(): void {
    const d = this.activeDate();
    const wasRest = Boolean(this.day().rest);
    this.state.addingGymDate.set(null);
    this.state.addingCardioDate.set(null);
    void this.state.mutateDay(d, copy => {
      if (wasRest) delete copy.rest;
      else copy.rest = true;
    });
  }

  onNoteInput(event: Event): void {
    const val = (event.target as HTMLTextAreaElement).value;
    void this.state.mutateDay(this.activeDate(), copy => {
      copy.note = val;
    });
  }
}
