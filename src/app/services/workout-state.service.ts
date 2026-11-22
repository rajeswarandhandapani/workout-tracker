import { Injectable, computed, inject, signal } from '@angular/core';
import { ToastService } from '../kit/toast.service';
import {
  DEFAULT_REMINDER,
  isEmptyDay,
  localToday,
  mondayOf,
  parseBackup,
  weekSummary,
} from '../domain/logic';
import {
  EXERCISES,
  MOVES,
  customMove,
  lookupMove,
} from '../domain/plan';
import type {
  CustomMoveDef,
  DayGym,
  MoveDef,
  WorkoutDay,
  WorkoutSettings,
} from '../domain/models';
import { WorkoutStoreService } from './workout-store.service';

export function defaultSettings(): WorkoutSettings {
  return {
    startDate: null,
    rest: 90,
    beep: true,
    step: 5,
    routine: null,
    custom: [],
    reminder: { ...DEFAULT_REMINDER, days: [...DEFAULT_REMINDER.days] },
  };
}

function mergeSettings(saved: Partial<WorkoutSettings> | undefined): WorkoutSettings {
  const base = defaultSettings();
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    custom: Array.isArray(saved.custom) ? [...saved.custom] : [],
    routine: saved.routine === null ? null : Array.isArray(saved.routine) ? [...saved.routine] : null,
    reminder: {
      ...base.reminder,
      ...(saved.reminder || {}),
      days: Array.isArray(saved.reminder?.days) ? [...saved.reminder.days] : [...base.reminder.days],
    },
  };
}

@Injectable({ providedIn: 'root' })
export class WorkoutStateService {
  private readonly store = inject(WorkoutStoreService);
  private readonly toast = inject(ToastService);

  readonly today = signal(localToday());
  readonly date = signal(localToday());
  readonly days = signal<Record<string, WorkoutDay>>({});
  readonly settings = signal<WorkoutSettings>(defaultSettings());
  readonly addingGymDate = signal<string | null>(null);
  readonly addingCardioDate = signal<string | null>(null);
  readonly selectedExercise = signal<string>(EXERCISES[0].id);
  readonly lastBackup = signal<string | null>(null);
  readonly lastReminder = signal<string | null>(null);

  readonly routineIds = computed<string[]>(() => {
    const r = this.settings().routine;
    return r === null ? EXERCISES.map(e => e.id) : r;
  });

  readonly allMoves = computed<MoveDef[]>(() => [
    ...MOVES,
    ...(this.settings().custom || []).map(customMove),
  ]);

  readonly currentDay = computed<WorkoutDay>(() => {
    const d = this.date();
    return this.days()[d] ?? { date: d };
  });

  readonly activeWeekSummary = computed(() => weekSummary(this.days(), mondayOf(this.date())));

  async init(): Promise<void> {
    await this.loadAll();
  }

  async loadAll(): Promise<void> {
    const list = await this.store.allDays();
    this.days.set(Object.fromEntries(list.map(d => [d.date, d])));
    const saved = await this.store.getKv<Partial<WorkoutSettings>>('settings');
    this.settings.set(mergeSettings(saved));
    this.lastBackup.set((await this.store.getKv<string>('lastBackup')) || null);
    this.lastReminder.set((await this.store.getKv<string>('lastReminder')) || null);
  }

  refreshTodayIfChanged(): void {
    const now = localToday();
    const prev = this.today();
    if (now === prev) return;
    const wasToday = this.date() === prev;
    this.today.set(now);
    if (wasToday) this.date.set(now);
  }

  findMove(id: string): MoveDef | undefined {
    return lookupMove(this.settings().custom, id);
  }

  openDate(iso: string): void {
    this.date.set(iso);
  }

  async updateSettings(updater: (prev: WorkoutSettings) => WorkoutSettings): Promise<void> {
    const next = updater(structuredClone(this.settings()));
    this.settings.set(next);
    await this.store.setKv('settings', next);
  }

  async mutateDay(dateIso: string, mutator: (day: WorkoutDay) => void): Promise<WorkoutDay> {
    const copy: WorkoutDay = structuredClone(this.days()[dateIso] ?? { date: dateIso });
    mutator(copy);
    this.days.set({ ...this.days(), [dateIso]: copy });
    if (isEmptyDay(copy)) {
      try {
        await this.store.deleteDay(dateIso);
      } catch {
        this.toast.show('That could not be saved. Check the storage space on this device.');
      }
    } else {
      try {
        await this.store.putDay(copy);
      } catch {
        this.toast.show('That could not be saved. Check the storage space on this device.');
      }
    }
    return copy;
  }

  async restoreFromBackupText(text: string): Promise<{ daysCount: number; parsed: ReturnType<typeof parseBackup> } | null> {
    let parsed: ReturnType<typeof parseBackup>;
    try {
      parsed = parseBackup(text);
    } catch (e) {
      this.toast.show(e instanceof Error ? e.message : 'That file is not a Workout Tracker backup.');
      return null;
    }
    return { daysCount: parsed.days.length, parsed };
  }

  async applyRestoredBackup(parsed: ReturnType<typeof parseBackup>): Promise<void> {
    const nextSettings = mergeSettings(parsed.settings);
    await this.store.replaceAll(parsed.days, nextSettings);
    await this.loadAll();
    this.date.set(this.today());
    this.addingGymDate.set(null);
    this.addingCardioDate.set(null);
    this.toast.show('Backup restored.');
  }

  async eraseAllData(): Promise<void> {
    await this.store.eraseAll();
    this.days.set({});
    this.settings.set(defaultSettings());
    this.lastBackup.set(null);
    this.lastReminder.set(null);
    this.addingGymDate.set(null);
    this.addingCardioDate.set(null);
    this.date.set(this.today());
  }

  async recordBackupExported(isoTimestamp: string): Promise<void> {
    this.lastBackup.set(isoTimestamp);
    await this.store.setKv('lastBackup', isoTimestamp);
    this.toast.show('Backup saved.');
  }

  addCustomExercise(def: CustomMoveDef): void {
    void this.updateSettings(prev => ({
      ...prev,
      custom: [...(prev.custom || []), def],
    }));
  }

  ensureGym(day: WorkoutDay): DayGym {
    if (!day.gym) day.gym = { sets: {} };
    if (!day.gym.sets) day.gym.sets = {};
    return day.gym;
  }
}
