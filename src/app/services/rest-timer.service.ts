// Countdown rest/hold timer with Wake Lock, 880 Hz double beep, and ±15s / Skip controls.

import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

const stamp = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

@Injectable({ providedIn: 'root' })
export class RestTimerService {
  private readonly destroyRef = inject(DestroyRef);

  readonly running = signal(false);
  readonly label = signal('Rest');
  readonly remainingSec = signal(0);
  readonly progressPct = signal(100);
  readonly formattedTime = computed(() => stamp(this.remainingSec()));

  private end = 0;
  private total = 0;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private audio: AudioContext | null = null;
  private beepOn = true;
  private wake: WakeLockSentinel | null = null;

  constructor() {
    if (typeof document !== 'undefined') {
      const onVis = () => {
        if (document.visibilityState === 'visible' && this.ticker) {
          this.update();
          if (this.ticker) this.keepAwake(true);
        }
      };
      document.addEventListener('visibilitychange', onVis);
      this.destroyRef.onDestroy(() => {
        document.removeEventListener('visibilitychange', onVis);
        this.stop();
      });
    }
  }

  start(seconds: number, { beep = true, label = 'Rest' }: { beep?: boolean; label?: string } = {}): void {
    this.beepOn = beep;
    this.label.set(label);
    if (beep && typeof AudioContext !== 'undefined') {
      try {
        this.audio ??= new AudioContext();
        this.audio.resume();
      } catch {
        this.audio = null;
      }
    }
    this.total = seconds * 1000;
    this.end = Date.now() + this.total;
    this.running.set(true);
    this.update();
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = setInterval(() => this.update(), 250);
    this.keepAwake(true);
  }

  adjust(deltaSeconds: number): void {
    if (!this.running()) return;
    this.end = Math.max(Date.now() + 1000, this.end + deltaSeconds * 1000);
    this.total = Math.max(this.total, this.end - Date.now());
    this.update();
  }

  stop(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    this.running.set(false);
    this.keepAwake(false);
  }

  private update(): void {
    const rem = this.end - Date.now();
    const left = Math.ceil(rem / 1000);
    if (left <= 0) {
      this.stop();
      if (rem > -3000) {
        this.beep();
        try {
          navigator?.vibrate?.([200, 100, 200]);
        } catch {}
      }
      return;
    }
    this.remainingSec.set(left);
    this.progressPct.set(this.total > 0 ? Math.max(0, Math.min(100, (rem / this.total) * 100)) : 0);
  }

  private beep(): void {
    if (!this.beepOn || !this.audio) return;
    for (const at of [0, 0.28]) {
      const osc = this.audio.createOscillator();
      const gain = this.audio.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(this.audio.destination);
      osc.start(this.audio.currentTime + at);
      osc.stop(this.audio.currentTime + at + 0.18);
    }
  }

  private async keepAwake(on: boolean): Promise<void> {
    try {
      if (on && !this.wake && navigator?.wakeLock) {
        this.wake = await navigator.wakeLock.request('screen');
        this.wake.addEventListener?.('release', () => {
          this.wake = null;
        });
      }
      if (!on && this.wake) {
        await this.wake.release();
        this.wake = null;
      }
    } catch {
      this.wake = null;
    }
  }
}
