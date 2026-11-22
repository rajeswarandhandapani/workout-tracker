import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { shortDate } from '../../kit/dates';
import { ToastService } from '../../kit/toast.service';
import {
  ArtThumbComponent,
  ExerciseDemoComponent,
  MuscleMapComponent,
} from '../../components/exercise-art.component';
import { hasArt } from '../../domain/art';
import {
  dayExerciseIds,
  lastPerformance,
  num,
  programWeek,
  readyToIncrease,
  setCountFor,
  setsDone,
  suggestNext,
} from '../../domain/logic';
import type {
  EffortId,
  MoveDef,
  SetEntry,
  WorkoutDay,
} from '../../domain/models';
import {
  EFFORTS,
  MAX_SETS,
  alternatesOf,
  gifUrl,
  target,
  videoUrl,
} from '../../domain/plan';
import { RestTimerService } from '../../services/rest-timer.service';
import { WorkoutStateService } from '../../services/workout-state.service';

interface DraftRow {
  weightStr: string;
  valueStr: string;
  done: boolean;
}

const stamp = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

@Component({
  selector: 'wt-exercise-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ArtThumbComponent, ExerciseDemoComponent, MuscleMapComponent],
  template: `
    <article
      #cardRef
      class="exercise"
      [class.complete]="allDone()"
      [attr.data-exercise]="slot().id"
    >
      <div class="flex items-center gap-2.5">
        @if (hasArtFor(activeMove().id, activeMove().kind)) {
          @if (!activeMove().custom) {
            <button
              type="button"
              class="art-thumb shrink-0"
              [attr.aria-expanded]="'' + demoOpen()"
              [attr.aria-label]="'Show how to do ' + activeMove().name"
              (click)="demoOpen.set(!demoOpen())"
            >
              <wt-art-thumb [moveId]="activeMove().id" [kind]="activeMove().kind" />
              <span class="art-hint" aria-hidden="true">{{ demoOpen() ? 'Hide' : 'How to' }}</span>
            </button>
          } @else {
            <div class="art-thumb art-placeholder shrink-0">
              <wt-art-thumb [moveId]="activeMove().id" [kind]="activeMove().kind" />
              <span class="art-hint" aria-hidden="true">Custom</span>
            </div>
          }
        }

        <div class="flex-1 min-w-0">
          <h3 class="text-base font-bold leading-snug m-0">{{ activeMove().name }}</h3>
          <p class="text-xs opacity-75 inline-flex items-center gap-1.5 flex-wrap m-0">
            <wt-muscle-map [focus]="activeMove().focus" />
            <span>{{ focusText() }}</span>
          </p>
        </div>

        <span class="target text-sm font-semibold tabular-nums whitespace-nowrap">{{ targetText() }}</span>
      </div>

      @if (hasArtFor(activeMove().id, activeMove().kind) && !activeMove().custom) {
        <div [hidden]="!demoOpen()">
          <wt-exercise-demo
            [moveId]="activeMove().id"
            [name]="activeMove().name"
            [kind]="activeMove().kind"
            [active]="demoOpen()"
          />
        </div>
      }

      @if (activeMove().how; as howText) {
        <p class="text-xs opacity-75 m-0">{{ howText }}</p>
      }

      <div class="flex items-center justify-between gap-x-3 gap-y-1 flex-wrap">
        @if (swapChoices().length) {
          <button
            type="button"
            class="link text-xs swap-btn"
            [attr.aria-label]="'Swap ' + activeMove().name"
            (click)="swapOpen.set(!swapOpen())"
          >
            {{ swapped() ? 'Change' : (slot().id === 'plank' ? 'Swap exercise' : 'Machine taken? Swap') }}
          </button>
        }
        <a
          class="link ext-link text-xs opacity-80"
          [href]="vUrl()"
          target="_blank"
          rel="noopener noreferrer"
          [attr.aria-label]="'Watch ' + activeMove().name + ' video'"
        >Video ↗</a>
        <a
          class="link ext-link text-xs opacity-80"
          [href]="gUrl()"
          target="_blank"
          rel="noopener noreferrer"
          [attr.aria-label]="'View ' + activeMove().name + ' animated GIF'"
        >GIF ↗</a>
        <button
          type="button"
          class="link text-xs opacity-80 ml-auto remove-ex"
          [attr.aria-label]="'Remove ' + activeMove().name"
          (click)="onRemoveClick()"
        >Remove</button>
      </div>

      @if (swapChoices().length) {
        <div class="flex flex-col gap-1.5 swap-list" [hidden]="!swapOpen()">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <span class="text-xs opacity-75">{{ slot().family || 'Swap options' }}</span>
            @if (inRoutine()) {
              <div class="inline-flex gap-1 flex-wrap" role="group" aria-label="Swap scope">
                <button
                  type="button"
                  class="btn btn-xs btn-outline rounded-full chip-btn"
                  [attr.aria-pressed]="'' + (swapScope() === 'today')"
                  (click)="swapScope.set('today')"
                >Today only</button>
                <button
                  type="button"
                  class="btn btn-xs btn-outline rounded-full chip-btn"
                  [attr.aria-pressed]="'' + (swapScope() === 'always')"
                  (click)="swapScope.set('always')"
                >Every workout</button>
              </div>
            }
          </div>

          @if (swapped() && inRoutine()) {
            <div>
              <button
                type="button"
                class="btn btn-outline btn-xs h-auto min-h-8 py-1 whitespace-normal text-left"
                (click)="swapTo(activeMove(), 'always')"
              >Use {{ activeMove().name }} every workout</button>
            </div>
          }

          @for (choice of swapChoices(); track choice.id) {
            <button
              type="button"
              class="btn btn-outline h-auto min-h-11 py-2 px-3 justify-start gap-2.5 text-left font-normal swap-option"
              (click)="swapTo(choice, swapScope())"
            >
              @if (hasArtFor(choice.id, choice.kind)) {
                <span class="w-16 shrink-0 rounded-lg overflow-hidden">
                  <wt-art-thumb [moveId]="choice.id" [kind]="choice.kind" />
                </span>
              }
              <span class="flex flex-col gap-0.5 min-w-0">
                <span class="flex items-center gap-1.5 flex-wrap">
                  <strong class="text-sm font-semibold">
                    {{ choice.id === slot().id ? choice.name + ' (planned)' : choice.name }}
                  </strong>
                  @if (choice.fallback) {
                    <span class="badge badge-warning badge-xs">{{ choice.fallback }}</span>
                  }
                </span>
                @if (choice.unit !== slot().unit || choice.low !== slot().low || choice.high !== slot().high) {
                  <span class="text-xs opacity-70">{{ targetOf(choice) }}</span>
                }
                @if (choice.how) {
                  <span class="text-xs opacity-75 font-normal">{{ choice.how }}</span>
                }
              </span>
            </button>
          }
        </div>
      }

      @if (removeOpen()) {
        <div class="bg-warning/15 border border-warning/30 rounded-lg p-2.5 flex flex-col gap-2 remove-box">
          <span class="text-xs font-medium">Remove {{ activeMove().name }}?</span>
          <div class="flex flex-wrap items-center gap-2">
            @if (inRoutine()) {
              <button type="button" class="btn btn-sm btn-outline" (click)="removeFrom('today')">Today only</button>
            }
            <button type="button" class="btn btn-sm btn-outline" (click)="removeFrom('always')">
              {{ inRoutine() ? 'Every workout' : 'Remove' }}
            </button>
            <button type="button" class="btn btn-sm btn-ghost" (click)="removeOpen.set(false)">Cancel</button>
          </div>
        </div>
      }

      @if (lastPerf(); as lp) {
        <p class="text-xs opacity-75 m-0 last-time">
          Last, {{ formatShortDate(lp.date) }}: {{ formatLastSets(lp.sets) }}
        </p>
      }

      @if (suggestion(); as sug) {
        <p
          class="text-xs bg-primary/10 rounded-lg px-2.5 py-1.5 m-0"
          data-testid="suggestion"
          [attr.data-action]="sug.action"
        >Suggested: {{ sug.text }}</p>
      } @else if (nudgeWeight(); as nextW) {
        <div class="text-xs bg-primary/10 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2 flex-wrap">
          <span>
            {{ activeMove().assisted
              ? 'You reached the top of the range. If every rep felt controlled, try a little less assistance.'
              : 'You reached the top of the range. If every rep felt controlled, try a small increase.' }}
          </span>
          <button
            type="button"
            class="btn btn-xs btn-outline rounded-full chip-btn"
            (click)="applyNudge(nextW)"
          >Try {{ nextW }} lb</button>
        </div>
      }

      <div class="set head text-xs opacity-70 text-center" aria-hidden="true">
        <span>Set</span>
        <span>{{ activeMove().weighted ? (activeMove().assisted ? 'assist lb' : 'lb') : activeMove().unit === 'sec' ? 'timer' : '' }}</span>
        <span>{{ activeMove().unit }}</span>
        <span></span>
      </div>

      @for (row of drafts(); track $index) {
        <div class="set" [class.done]="row.done">
          <span class="set-n text-center font-semibold opacity-75 tabular-nums">{{ $index + 1 }}</span>

          @if (activeMove().weighted) {
            <input
              type="number"
              inputmode="decimal"
              min="0"
              step="any"
              class="input input-bordered input-sm min-h-11 w-full text-center tabular-nums"
              [attr.aria-label]="activeMove().name + ' set ' + ($index + 1) + ' weight in pounds'"
              [value]="row.weightStr"
              (focus)="selectOnFocus($event)"
              (input)="onWeightInput($index, $event)"
              (change)="commitDrafts()"
            />
          } @else if (activeMove().unit === 'sec') {
            <button
              type="button"
              class="btn btn-outline btn-sm set-timer min-h-11 w-full tabular-nums"
              [attr.aria-label]="'Start timer for ' + activeMove().name + ' set ' + ($index + 1)"
              (click)="startHoldTimer($index)"
            >{{ holdStamp(row.valueStr) }}</button>
          } @else {
            <span class="text-center opacity-60">–</span>
          }

          <input
            type="number"
            inputmode="numeric"
            min="0"
            step="1"
            class="input input-bordered input-sm min-h-11 w-full text-center tabular-nums"
            [attr.aria-label]="activeMove().name + ' set ' + ($index + 1) + ' ' + (activeMove().unit === 'sec' ? 'seconds' : 'reps')"
            [value]="row.valueStr"
            (focus)="selectOnFocus($event)"
            (input)="onValueInput($index, $event)"
            (change)="commitDrafts()"
          />

          <button
            type="button"
            class="tick"
            [attr.aria-pressed]="'' + row.done"
            [attr.aria-label]="activeMove().name + ' set ' + ($index + 1) + ' done'"
            (click)="toggleSet($index)"
          >✓</button>
        </div>
      }

      <div class="flex items-center justify-between gap-2">
        <button
          type="button"
          class="btn btn-outline btn-sm"
          [attr.aria-label]="'Add set to ' + activeMove().name"
          [disabled]="count() >= maxSets"
          (click)="addSet()"
        >+ Add set</button>

        @if (count() > activeMove().sets) {
          <button
            type="button"
            class="link text-xs opacity-80"
            [attr.aria-label]="'Remove last set from ' + activeMove().name"
            (click)="removeSet()"
          >Remove set</button>
        }
      </div>

      <div class="effort flex flex-col gap-1.5 mt-1" [hidden]="!allDone()">
        <span class="text-xs opacity-75">How hard was that?</span>
        <div class="grid grid-cols-2 gap-1.5">
          @for (eff of efforts; track eff.id) {
            <button
              type="button"
              class="btn btn-outline h-auto min-h-12 py-1.5 px-2.5 flex-col items-start gap-0.5 text-left font-normal effort-btn"
              [attr.data-effort]="eff.id"
              [attr.aria-pressed]="'' + (currentEffort() === eff.id)"
              [attr.aria-label]="activeMove().name + ' felt: ' + eff.label"
              (click)="toggleEffort(eff.id)"
            >
              <strong class="text-sm font-semibold">{{ eff.label }}</strong>
              <span class="text-xs opacity-75 font-normal">
                {{ activeMove().unit === 'sec' ? eff.time : eff.reps }}
              </span>
            </button>
          }
        </div>
        <p class="text-xs bg-primary/10 rounded-lg px-2.5 py-1.5 m-0" data-testid="next-time" [hidden]="!nextTimeText()">
          {{ nextTimeText() }}
        </p>
      </div>
    </article>
  `,
})
export class ExerciseCardComponent {
  readonly state = inject(WorkoutStateService);
  private readonly toast = inject(ToastService);
  private readonly timer = inject(RestTimerService);

  readonly day = input.required<WorkoutDay>();
  readonly slot = input.required<MoveDef>();

  private readonly cardRef = viewChild<ElementRef<HTMLElement>>('cardRef');

  readonly demoOpen = signal(false);
  readonly swapOpen = signal(false);
  readonly removeOpen = signal(false);
  readonly swapScope = signal<'today' | 'always'>('today');
  readonly drafts = signal<DraftRow[]>([]);

  readonly efforts = EFFORTS;
  readonly maxSets = MAX_SETS;

  readonly activeMove = computed<MoveDef>(() => {
    const d = this.day();
    const s = this.slot();
    const swappedId = d.gym?.swaps?.[s.id];
    return (swappedId ? this.state.findMove(swappedId) : undefined) || s;
  });

  readonly swapped = computed(() => this.activeMove().id !== this.slot().id);
  readonly inRoutine = computed(() => this.state.routineIds().includes(this.slot().id));
  readonly focusText = computed(() => {
    const ex = this.activeMove();
    const slot = this.slot();
    if (this.swapped()) return ex.family ? `Instead of ${slot.name} · ${ex.family}` : `Instead of ${slot.name}`;
    return ex.family ? `${ex.family} · ${ex.focus}` : ex.focus;
  });
  readonly targetText = computed(() => target(this.activeMove()));

  readonly lastPerf = computed(() =>
    lastPerformance(this.state.days(), this.activeMove().id, this.day().date),
  );

  readonly count = computed(() =>
    setCountFor(this.day(), this.activeMove(), this.lastPerf()),
  );

  readonly suggestion = computed(() => {
    const start = this.state.settings().startDate;
    const week = start ? programWeek(this.day().date, start) : 99;
    return suggestNext(this.activeMove(), this.lastPerf(), {
      week,
      step: this.state.settings().step,
    });
  });

  readonly nudgeWeight = computed<number | null>(() => {
    if (this.suggestion()) return null;
    const ex = this.activeMove();
    const last = this.lastPerf();
    if (!readyToIncrease(last, ex) || !last) return null;
    const lastW = last.sets[last.sets.length - 1].weight ?? 0;
    const step = this.state.settings().step;
    const nextW = ex.assisted ? Math.max(step, lastW - step) : lastW + step;
    return nextW !== lastW ? nextW : null;
  });

  readonly swapChoices = computed<MoveDef[]>(() => {
    const d = this.day();
    const slot = this.slot();
    const ex = this.activeMove();
    const alts = alternatesOf(slot);
    if (!alts.length) return [];
    const slotIds = dayExerciseIds(d, this.state.routineIds());
    const taken = slotIds
      .map(id => this.state.findMove(id))
      .filter((m): m is MoveDef => Boolean(m))
      .map(s => (d.gym?.swaps?.[s.id] ? this.state.findMove(d.gym.swaps[s.id]) || s : s).id);
    return [slot, ...alts].filter(m => m.id !== ex.id && !taken.includes(m.id));
  });

  readonly allDone = computed(() => {
    const rows = this.drafts();
    return rows.length > 0 && rows.every(r => r.done);
  });

  readonly currentEffort = computed<EffortId | undefined>(
    () => this.day().gym?.effort?.[this.activeMove().id],
  );

  readonly nextTimeText = computed(() => {
    const ex = this.activeMove();
    const effort = this.currentEffort();
    if (!effort) return '';
    const doneSets = (this.day().gym?.sets?.[ex.id] || []).filter((s): s is SetEntry => Boolean(s && s.done));
    const start = this.state.settings().startDate;
    const week = start ? programWeek(this.day().date, start) : 99;
    const next = suggestNext(ex, { sets: doneSets, effort }, { week, step: this.state.settings().step });
    return next ? `Next time: ${next.text}` : '';
  });

  private prevSyncSig = '';

  constructor() {
    effect(() => {
      const d = this.day();
      const ex = this.activeMove();
      const cnt = this.count();
      const last = this.lastPerf();
      const sug = this.suggestion();
      const savedList = d.gym?.sets?.[ex.id] || [];
      const savedSig = JSON.stringify({
        date: d.date,
        id: ex.id,
        cnt,
        saved: savedList,
        sugW: sug?.weight ?? null,
        sugV: sug?.value ?? null,
        lastD: last?.date ?? null,
      });

      if (savedSig === this.prevSyncSig) return;
      this.prevSyncSig = savedSig;

      untracked(() => {
        const nextRows: DraftRow[] = [];
        for (let i = 0; i < cnt; i++) {
          const saved = savedList[i];
          const prior = last?.sets[i] ?? last?.sets[last.sets.length - 1];
          const wVal = saved?.weight ?? sug?.weight ?? prior?.weight;
          const vVal = saved?.value ?? sug?.value ?? prior?.value ?? ex.low;
          nextRows.push({
            weightStr: wVal != null ? String(wVal) : '',
            valueStr: vVal != null ? String(vVal) : '',
            done: saved?.done === true,
          });
        }
        this.drafts.set(nextRows);
      });
    });
  }

  hasArtFor(id: string, kind?: string): boolean {
    return hasArt(id, kind);
  }

  vUrl(): string {
    return videoUrl(this.activeMove());
  }

  gUrl(): string {
    return gifUrl(this.activeMove());
  }

  targetOf(m: MoveDef): string {
    return target(m);
  }

  formatShortDate(iso: string): string {
    return shortDate(iso);
  }

  formatLastSets(sets: SetEntry[]): string {
    const ex = this.activeMove();
    return sets
      .map(s => (ex.weighted ? `${s.weight} lb${ex.assisted ? ' assist' : ''} × ${s.value}` : `${s.value} ${ex.unit}`))
      .join(', ');
  }

  holdStamp(valueStr: string): string {
    const ex = this.activeMove();
    const secs = num(valueStr) || ex.low;
    return stamp(secs);
  }

  selectOnFocus(event: Event): void {
    (event.target as HTMLInputElement).select?.();
  }

  onWeightInput(index: number, event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.drafts.update(prev =>
      prev.map((row, j) => {
        if (j === index) return { ...row, weightStr: val };
        if (j > index && !row.done) return { ...row, weightStr: val };
        return row;
      }),
    );
  }

  onValueInput(index: number, event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.drafts.update(prev =>
      prev.map((row, j) => (j === index ? { ...row, valueStr: val } : row)),
    );
  }

  private toSetEntry(row: DraftRow): SetEntry {
    const ex = this.activeMove();
    return {
      weight: ex.weighted ? num(row.weightStr) : null,
      value: num(row.valueStr),
      done: row.done,
    };
  }

  private dayTotalSets(dayCopy: WorkoutDay): number {
    const slots = dayExerciseIds(dayCopy, this.state.routineIds())
      .map(id => this.state.findMove(id))
      .filter((m): m is MoveDef => Boolean(m));
    return slots.reduce((n, slot) => {
      const move = (dayCopy.gym?.swaps?.[slot.id] ? this.state.findMove(dayCopy.gym.swaps[slot.id]) : undefined) || slot;
      return n + setCountFor(dayCopy, move, lastPerformance(this.state.days(), move.id, dayCopy.date));
    }, 0);
  }

  async commitDrafts(): Promise<void> {
    const ex = this.activeMove();
    const rows = this.drafts();
    if (!rows.some(r => r.done) && !this.day().gym?.sets?.[ex.id]?.some(s => s?.done)) return;
    const entries = rows.map(r => this.toSetEntry(r));
    await this.state.mutateDay(this.day().date, copy => {
      const gym = this.state.ensureGym(copy);
      gym.sets[ex.id] = entries;
    });
  }

  async toggleSet(index: number): Promise<void> {
    const ex = this.activeMove();
    const rows = this.drafts();
    const cur = rows[index];
    if (!cur) return;

    if (!cur.done) {
      if (ex.weighted && !(Number(num(cur.weightStr)) > 0)) {
        this.toast.show('Enter the weight first.');
        const input = this.cardRef()?.nativeElement.querySelectorAll('.set:not(.head)')[index]?.querySelector('input');
        (input as HTMLInputElement | undefined)?.focus();
        return;
      }
      if (!(Number(num(cur.valueStr)) > 0)) {
        this.toast.show(`Enter the ${ex.unit === 'sec' ? 'seconds' : 'reps'} first.`);
        const inputs = this.cardRef()?.nativeElement.querySelectorAll('.set:not(.head)')[index]?.querySelectorAll('input');
        const targetInput = ex.weighted ? inputs?.[1] : inputs?.[0];
        (targetInput as HTMLInputElement | undefined)?.focus();
        return;
      }
    }

    const nextDone = !cur.done;
    const updatedRows = rows.map((r, j) => (j === index ? { ...r, done: nextDone } : r));
    this.drafts.set(updatedRows);

    const entries = updatedRows.map(r => this.toSetEntry(r));
    const saved = await this.state.mutateDay(this.day().date, copy => {
      const gym = this.state.ensureGym(copy);
      gym.sets[ex.id] = entries;
    });

    if (!nextDone) return;
    if (setsDone(saved) === this.dayTotalSets(saved)) {
      this.timer.stop();
      this.toast.show('All sets done. Finish with your cool-down and stretches.');
    } else {
      this.timer.start(this.state.settings().rest, {
        beep: this.state.settings().beep,
        label: `Rest · ${ex.name}`,
      });
    }
  }

  startHoldTimer(index: number): void {
    const ex = this.activeMove();
    const row = this.drafts()[index];
    const secs = num(row?.valueStr) || ex.low;
    this.timer.start(secs, {
      beep: this.state.settings().beep,
      label: `${ex.name} (set ${index + 1})`,
    });
  }

  applyNudge(nextW: number): void {
    const ex = this.activeMove();
    const updated = this.drafts().map(r =>
      r.done ? r : { ...r, weightStr: String(nextW), valueStr: String(ex.low) },
    );
    this.drafts.set(updated);
    if (updated.some(r => r.done)) {
      const entries = updated.map(r => this.toSetEntry(r));
      void this.state.mutateDay(this.day().date, copy => {
        const gym = this.state.ensureGym(copy);
        gym.sets[ex.id] = entries;
      });
    }
    this.toast.show(`Set to ${nextW} lb × ${ex.low}.`);
  }

  addSet(): void {
    const ex = this.activeMove();
    const curRows = this.drafts();
    const cnt = curRows.length;
    if (cnt >= MAX_SETS) return;
    const lastRow = curRows[cnt - 1] ?? { weightStr: '', valueStr: String(ex.low), done: false };
    const nextRows = [...curRows, { ...lastRow, done: false }];
    this.drafts.set(nextRows);
    const entries = nextRows.map(r => this.toSetEntry(r));
    void this.state.mutateDay(this.day().date, copy => {
      const gym = this.state.ensureGym(copy);
      gym.sets[ex.id] = entries;
      if (!gym.counts) gym.counts = {};
      gym.counts[ex.id] = cnt + 1;
    });
  }

  removeSet(): void {
    const ex = this.activeMove();
    const curRows = this.drafts();
    const cnt = curRows.length;
    if (!cnt) return;
    if (curRows[cnt - 1].done) {
      this.toast.show('Untick the last set before removing it.');
      return;
    }
    const nextRows = curRows.slice(0, cnt - 1);
    this.drafts.set(nextRows);
    const entries = nextRows.map(r => this.toSetEntry(r));
    void this.state.mutateDay(this.day().date, copy => {
      const gym = this.state.ensureGym(copy);
      gym.sets[ex.id] = entries;
      if (!gym.counts) gym.counts = {};
      gym.counts[ex.id] = cnt - 1;
    });
  }

  toggleEffort(effId: EffortId): void {
    const ex = this.activeMove();
    void this.state.mutateDay(this.day().date, copy => {
      const gym = this.state.ensureGym(copy);
      if (!gym.effort) gym.effort = {};
      if (gym.effort[ex.id] === effId) delete gym.effort[ex.id];
      else gym.effort[ex.id] = effId;
    });
  }

  swapTo(move: MoveDef, scope: 'today' | 'always'): void {
    if (this.drafts().some(r => r.done)) {
      this.toast.show('Untick the sets on this exercise before swapping.');
      return;
    }
    const d = this.day();
    const slot = this.slot();
    const ex = this.activeMove();
    this.swapOpen.set(false);
    this.demoOpen.set(false);
    this.prevSyncSig = '';

    if (scope === 'always' && this.inRoutine()) {
      const prevRoutine = this.state.settings().routine ? [...this.state.settings().routine!] : null;
      const prevGym = d.gym ? structuredClone(d.gym) : undefined;
      const nextRoutine = [...new Set(this.state.routineIds().map(id => (id === slot.id ? move.id : id)))];

      void this.state.updateSettings(prev => ({ ...prev, routine: nextRoutine }));
      void this.state.mutateDay(d.date, copy => {
        const gym = this.state.ensureGym(copy);
        if (move.id !== ex.id) {
          delete gym.sets?.[ex.id];
          delete gym.counts?.[ex.id];
          delete gym.effort?.[ex.id];
        }
        delete gym.swaps?.[slot.id];
      });

      this.toast.show(`${move.name} set for every workout.`, {
        label: 'Undo',
        run: () => {
          this.prevSyncSig = '';
          void this.state.updateSettings(prev => ({ ...prev, routine: prevRoutine }));
          void this.state.mutateDay(d.date, copy => {
            if (prevGym) copy.gym = prevGym;
            else delete copy.gym;
          });
        },
      });
      return;
    }

    void this.state.mutateDay(d.date, copy => {
      const gym = this.state.ensureGym(copy);
      if (!gym.swaps) gym.swaps = {};
      delete gym.sets?.[ex.id];
      delete gym.counts?.[ex.id];
      delete gym.effort?.[ex.id];
      if (move.id === slot.id) delete gym.swaps[slot.id];
      else gym.swaps[slot.id] = move.id;
    });
  }

  onRemoveClick(): void {
    if (this.drafts().some(r => r.done)) {
      this.toast.show('Untick this exercise’s sets before removing it.');
      return;
    }
    this.removeOpen.update(v => !v);
  }

  removeFrom(scope: 'today' | 'always'): void {
    const d = this.day();
    const slot = this.slot();
    const ex = this.activeMove();
    const prevRoutine = this.state.settings().routine ? [...this.state.settings().routine!] : null;
    const prevGym = d.gym ? structuredClone(d.gym) : undefined;
    const wasInRoutine = this.inRoutine();

    this.removeOpen.set(false);
    if (scope === 'always') {
      const filtered = this.state.routineIds().filter(id => id !== slot.id);
      void this.state.updateSettings(prev => ({ ...prev, routine: filtered }));
    }

    void this.state.mutateDay(d.date, copy => {
      const gym = this.state.ensureGym(copy);
      delete gym.sets?.[ex.id];
      delete gym.counts?.[ex.id];
      delete gym.swaps?.[slot.id];
      delete gym.effort?.[ex.id];
      gym.extra = (gym.extra || []).filter(id => id !== slot.id);
      if (scope === 'today' && wasInRoutine) {
        gym.skip = [...(gym.skip || []), slot.id];
      }
    });

    this.toast.show(
      scope === 'always' ? `${ex.name} removed from your routine.` : `${ex.name} removed for this day.`,
      {
        label: 'Undo',
        run: () => {
          this.prevSyncSig = '';
          void this.state.updateSettings(prev => ({ ...prev, routine: prevRoutine }));
          void this.state.mutateDay(d.date, copy => {
            if (prevGym) copy.gym = prevGym;
            else delete copy.gym;
          });
        },
      },
    );
  }
}
