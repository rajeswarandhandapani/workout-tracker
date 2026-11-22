import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ConfirmDialogService } from '../../kit/confirm-dialog.service';
import { shortDate } from '../../kit/dates';
import { downloadFile } from '../../kit/storage-utils';
import { KIT_THEMES, ThemeService } from '../../kit/theme.service';
import { ToastService } from '../../kit/toast.service';
import {
  addDays,
  cleanSettings,
  exerciseHistory,
  fromIso,
  isEmptyDay,
  makeBackup,
  makeCalendar,
  reminderFor,
} from '../../domain/logic';
import type { CustomMoveDef } from '../../domain/models';
import { SCHEDULE, SCHEDULE_ORDER, WEIGHT_STEPS, customMove } from '../../domain/plan';
import { ReminderService } from '../../services/reminder.service';
import { WorkoutStateService } from '../../services/workout-state.service';
import { WorkoutStoreService } from '../../services/workout-store.service';

const SHORT_DAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const LONG_DAY = new Intl.DateTimeFormat('en-US', { weekday: 'long' });
const KIND_SHORT: Record<string, string> = { gym: 'Gym', cardio: 'Cardio', rest: 'Rest' };

@Component({
  selector: 'wt-data-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-2xl font-bold tracking-tight">Data</h1>

    <section class="card bg-base-100 border border-base-300 shadow-xs">
      <div class="card-body p-4 gap-3">
        <h2 class="text-base font-bold m-0">Appearance</h2>
        <label class="flex flex-col gap-1">
          <span class="text-xs opacity-75">Theme</span>
          <select
            class="select select-bordered w-full min-h-11"
            aria-label="Theme"
            [value]="themeSvc.theme()"
            (change)="onThemeChange($event)"
          >
            @for (t of themes; track t.id) {
              <option [value]="t.id" [selected]="t.id === themeSvc.theme()">{{ t.label }}</option>
            }
          </select>
        </label>
      </div>
    </section>

    <section class="card bg-base-100 border border-base-300 shadow-xs">
      <div class="card-body p-4 gap-3">
        <h2 class="text-base font-bold m-0">Settings</h2>

        <label class="flex flex-col gap-1">
          <span class="text-xs opacity-75">Week 1 starts</span>
          <input
            type="date"
            class="input input-bordered w-full min-h-11"
            aria-label="Plan start date"
            [value]="state.settings().startDate || ''"
            (change)="onStartDateChange($event)"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-xs opacity-75">Rest between sets</span>
          <select
            class="select select-bordered w-full min-h-11"
            aria-label="Rest between sets"
            [value]="'' + state.settings().rest"
            (change)="onRestChange($event)"
          >
            <option value="60">60 seconds</option>
            <option value="75">75 seconds</option>
            <option value="90">90 seconds</option>
          </select>
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-xs opacity-75">Smallest weight jump</span>
          <select
            class="select select-bordered w-full min-h-11"
            aria-label="Smallest weight jump"
            [value]="'' + state.settings().step"
            (change)="onStepChange($event)"
          >
            @for (w of weightSteps; track w) {
              <option [value]="w" [selected]="w === state.settings().step">{{ w }} lb</option>
            }
          </select>
        </label>

        <label class="flex items-center gap-2.5 min-h-11 cursor-pointer">
          <input
            type="checkbox"
            class="checkbox checkbox-primary checkbox-sm"
            [checked]="state.settings().beep"
            (change)="onBeepChange($event)"
          />
          <span class="text-sm">Beep when rest ends</span>
        </label>
      </div>
    </section>

    <section class="card bg-base-100 border border-base-300 shadow-xs">
      <div class="card-body p-4 gap-3">
        <h2 class="text-base font-bold m-0">Reminders</h2>
        <p class="text-xs opacity-75 m-0">Today’s alert: {{ todayReminderTitle() }}</p>

        <label class="flex items-center gap-2.5 min-h-11 cursor-pointer">
          <input
            type="checkbox"
            class="checkbox checkbox-primary checkbox-sm"
            aria-label="Daily workout reminder"
            [checked]="state.settings().reminder.enabled"
            (change)="onReminderToggle($event)"
          />
          <span class="text-sm">Daily workout reminder</span>
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-xs opacity-75">Reminder time</span>
          <input
            type="time"
            class="input input-bordered w-full min-h-11"
            aria-label="Reminder time"
            [value]="state.settings().reminder.time"
            (change)="onReminderTimeChange($event)"
          />
        </label>

        <div class="flex flex-col gap-1.5">
          <span class="text-xs opacity-75">Days</span>
          <div class="flex flex-wrap gap-1.5">
            @for (chip of dayChips; track chip.dayIndex) {
              <button
                type="button"
                class="btn btn-xs btn-outline rounded-full day-chip"
                [attr.aria-pressed]="'' + state.settings().reminder.days.includes(chip.dayIndex)"
                [attr.aria-label]="'Remind on ' + chip.longName"
                (click)="toggleReminderDay(chip.dayIndex)"
              >{{ chip.label }}</button>
            }
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn btn-outline btn-sm min-h-10" (click)="testReminder()">Test reminder</button>
          <button type="button" class="btn btn-outline btn-sm min-h-10" (click)="downloadCalendar()">
            Add to calendar (.ics)
          </button>
        </div>

        <p class="text-xs opacity-75 m-0">
          Browser alerts fire while the app is open or running in the background. For locked phones, add the calendar file to your phone calendar.
        </p>
      </div>
    </section>

    @if (state.settings().custom.length > 0) {
      <section class="card bg-base-100 border border-base-300 shadow-xs">
        <div class="card-body p-4 gap-2">
          <h2 class="text-base font-bold m-0">Your exercises</h2>
          @for (made of state.settings().custom; track made.id) {
            <div class="flex items-center justify-between gap-2 py-1.5 border-t border-base-300 first-of-type:border-t-0">
              <span class="text-sm">{{ made.name }}</span>
              @if (hasCustomHistory(made)) {
                <span class="text-xs opacity-70">Has logged sets</span>
              } @else {
                <button
                  type="button"
                  class="link text-xs opacity-80"
                  [attr.aria-label]="'Delete ' + made.name"
                  (click)="deleteCustom(made)"
                >Delete</button>
              }
            </div>
          }
        </div>
      </section>
    }

    <section class="card bg-base-100 border border-base-300 shadow-xs">
      <div class="card-body p-4 gap-3">
        <h2 class="text-base font-bold m-0">Backup</h2>
        <p class="text-sm m-0">
          {{ loggedCount() }} {{ loggedCount() === 1 ? 'day' : 'days' }} logged on this device. Nothing is sent anywhere, so a backup is the only copy if this phone is lost.
        </p>
        <p class="text-xs opacity-75 m-0">
          @if (state.lastBackup(); as ts) {
            Last backup: {{ formatShort(ts.slice(0, 10)) }}
          } @else {
            No backup yet.
          }
        </p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn btn-primary min-h-11" (click)="exportBackup()">Download backup</button>
          <button type="button" class="btn btn-outline min-h-11" (click)="restoreInput.click()">Restore a backup</button>
        </div>
        <input
          #restoreInput
          type="file"
          accept=".json,application/json"
          hidden
          (change)="onFileSelected($event)"
        />
        <p class="text-xs opacity-75 m-0">Backups are plain files, so keep them somewhere private.</p>
      </div>
    </section>

    <section class="card bg-base-100 border border-base-300 shadow-xs">
      <div class="card-body p-4 gap-3">
        <h2 class="text-base font-bold m-0">Erase</h2>
        <div>
          <button type="button" class="btn btn-outline btn-error min-h-11" (click)="confirmErase()">
            Erase all data
          </button>
        </div>
      </div>
    </section>
  `,
})
export class DataPageComponent {
  readonly state = inject(WorkoutStateService);
  readonly themeSvc = inject(ThemeService);
  private readonly store = inject(WorkoutStoreService);
  private readonly reminder = inject(ReminderService);
  private readonly confirmDlg = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly themes = KIT_THEMES;
  readonly weightSteps = WEIGHT_STEPS;

  readonly dayChips = SCHEDULE_ORDER.map(d => {
    const dt = fromIso(addDays('2026-11-09', (d + 6) % 7));
    return {
      dayIndex: d,
      longName: LONG_DAY.format(dt),
      label: `${SHORT_DAY.format(dt)} · ${KIND_SHORT[SCHEDULE[d].kind]}`,
    };
  });

  readonly todayReminderTitle = computed(() => reminderFor(this.state.today()).title);
  readonly loggedCount = computed(() => Object.values(this.state.days()).filter(d => !isEmptyDay(d)).length);

  formatShort(iso: string): string {
    return shortDate(iso);
  }

  onThemeChange(event: Event): void {
    this.themeSvc.setTheme((event.target as HTMLSelectElement).value);
  }

  async onStartDateChange(event: Event): Promise<void> {
    const val = (event.target as HTMLInputElement).value;
    if (!val) return;
    const cleaned = cleanSettings({ startDate: val }).startDate;
    if (!cleaned) return;
    await this.state.updateSettings(prev => ({ ...prev, startDate: cleaned }));
    this.toast.show('Start date changed. Your logs were not touched.');
  }

  onRestChange(event: Event): void {
    const rest = Number((event.target as HTMLSelectElement).value);
    void this.state.updateSettings(prev => ({ ...prev, rest }));
  }

  onStepChange(event: Event): void {
    const step = Number((event.target as HTMLSelectElement).value);
    void this.state.updateSettings(prev => ({ ...prev, step }));
  }

  onBeepChange(event: Event): void {
    const beep = (event.target as HTMLInputElement).checked;
    void this.state.updateSettings(prev => ({ ...prev, beep }));
  }

  async onReminderToggle(event: Event): Promise<void> {
    const enabled = (event.target as HTMLInputElement).checked;
    await this.state.updateSettings(prev => ({
      ...prev,
      reminder: { ...prev.reminder, enabled },
    }));
    if (enabled && typeof Notification !== 'undefined') {
      const perm =
        Notification.permission === 'default'
          ? await Notification.requestPermission?.().catch(() => Notification.permission)
          : Notification.permission;
      if (perm === 'denied') {
        this.toast.show('Browser notifications blocked. Use Add to calendar (.ics) for lock-screen alerts.');
      }
    }
    if (enabled) void this.reminder.check();
  }

  async onReminderTimeChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const cur = this.state.settings().reminder;
    const next = cleanSettings({ reminder: { ...cur, time: input.value } }).reminder?.time;
    if (!next) {
      input.value = cur.time;
      return;
    }
    this.state.lastReminder.set(null);
    await this.store.setKv('lastReminder', null);
    await this.state.updateSettings(prev => ({
      ...prev,
      reminder: { ...prev.reminder, time: next },
    }));
    void this.reminder.check();
  }

  toggleReminderDay(dayIndex: number): void {
    void this.state.updateSettings(prev => {
      const cur = prev.reminder.days;
      const days = cur.includes(dayIndex) ? cur.filter(x => x !== dayIndex) : [...cur, dayIndex];
      return { ...prev, reminder: { ...prev.reminder, days } };
    });
  }

  testReminder(): void {
    void this.reminder.show(this.state.today(), { test: true });
  }

  downloadCalendar(): void {
    const s = this.state.settings();
    downloadFile(
      'workout-reminders.ics',
      makeCalendar({ startDate: s.startDate, reminder: s.reminder, today: this.state.today() }),
      'text/calendar',
    );
    this.toast.show('Calendar reminders downloaded.');
  }

  hasCustomHistory(made: CustomMoveDef): boolean {
    return exerciseHistory(this.state.days(), customMove(made)).length > 0;
  }

  deleteCustom(made: CustomMoveDef): void {
    void this.state.updateSettings(prev => ({
      ...prev,
      custom: prev.custom.filter(m => m.id !== made.id),
      routine: prev.routine ? prev.routine.filter(id => id !== made.id) : null,
    }));
    this.toast.show(`${made.name} deleted.`);
  }

  async exportBackup(): Promise<void> {
    const days = Object.values(this.state.days()).filter(d => !isEmptyDay(d));
    const now = new Date().toISOString();
    downloadFile(
      `workout-tracker-${this.state.today()}.json`,
      makeBackup(days, this.state.settings(), now),
      'application/json',
    );
    await this.state.recordBackupExported(now);
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    const res = await this.state.restoreFromBackupText(text);
    if (!res) return;
    const ok = await this.confirmDlg.confirm(
      'Replace what is on this device?',
      `The backup holds ${res.daysCount} logged days. They will replace everything saved here now.`,
      'Replace',
    );
    if (!ok) return;
    await this.state.applyRestoredBackup(res.parsed);
    void this.router.navigateByUrl('/');
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }

  async confirmErase(): Promise<void> {
    const ok = await this.confirmDlg.confirm(
      'Erase everything on this device?',
      'All workouts and settings here will be deleted. Backup files are not affected.',
      'Erase',
    );
    if (!ok) return;
    await this.state.eraseAllData();
    void this.router.navigateByUrl('/');
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }
}
