import { DestroyRef, Injectable, inject } from '@angular/core';
import { ToastService } from '../kit/toast.service';
import { localToday, reminderDue, reminderFor, weekdayOf } from '../domain/logic';
import { SCHEDULE } from '../domain/plan';
import { WorkoutStateService } from './workout-state.service';
import { WorkoutStoreService } from './workout-store.service';

const localTime = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

@Injectable({ providedIn: 'root' })
export class ReminderService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly store = inject(WorkoutStoreService);
  private readonly state = inject(WorkoutStateService);
  private readonly toast = inject(ToastService);

  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  start(): void {
    if (this.started || typeof document === 'undefined') return;
    this.started = true;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      this.state.refreshTodayIfChanged();
      void this.check();
    };
    document.addEventListener('visibilitychange', onVis);
    this.timer = setInterval(() => void this.check(), 30000);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', onVis);
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    });
    void this.check();
  }

  async check(): Promise<void> {
    const date = localToday();
    const day = this.state.days()[date];
    const settings = this.state.settings();
    if (
      !reminderDue({
        reminder: settings.reminder,
        date,
        nowTime: localTime(),
        day,
        lastSent: this.state.lastReminder(),
      })
    ) {
      return;
    }
    this.state.lastReminder.set(date);
    await this.store.setKv('lastReminder', date);
    await this.show(date);
  }

  async show(date: string, { test = false }: { test?: boolean } = {}): Promise<void> {
    const info = reminderFor(date);
    let shown = false;
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const reg = await navigator.serviceWorker?.getRegistration?.();
        if (reg?.showNotification) {
          await reg.showNotification(info.title, {
            body: info.body,
            tag: 'workout-reminder',
            icon: 'icons/icon-192.png',
          });
          shown = true;
        } else {
          new Notification(info.title, {
            body: info.body,
            tag: 'workout-reminder',
            icon: 'icons/icon-192.png',
          });
          shown = true;
        }
      } catch {}
    }
    this.toast.show(
      test && shown
        ? `Reminder sent: ${info.title}`
        : `${info.title} (${SCHEDULE[weekdayOf(date)].time})`,
    );
  }
}
