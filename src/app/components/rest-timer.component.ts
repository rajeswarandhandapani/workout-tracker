// Floating rest/hold timer bar bound to RestTimerService.

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RestTimerService } from '../services/rest-timer.service';

@Component({
  selector: 'wt-rest-timer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      id="rest"
      class="rest-bar"
      role="timer"
      aria-label="Timer"
      [hidden]="!timer.running()"
    >
      <span id="rest-label">{{ timer.label() }}</span>
      <b id="rest-time">{{ timer.formattedTime() }}</b>
      <button
        type="button"
        class="btn btn-sm btn-outline"
        data-rest="-15"
        aria-label="15 seconds less"
        (click)="timer.adjust(-15)"
      >
        −15
      </button>
      <button
        type="button"
        class="btn btn-sm btn-outline"
        data-rest="15"
        aria-label="15 seconds more"
        (click)="timer.adjust(15)"
      >
        +15
      </button>
      <button
        type="button"
        class="btn btn-sm btn-outline"
        data-rest="skip"
        (click)="timer.stop()"
      >
        Skip
      </button>
      <div class="rest-track" aria-hidden="true">
        <i id="rest-fill" [style.width.%]="timer.progressPct()"></i>
      </div>
    </div>
  `,
})
export class RestTimerComponent {
  readonly timer = inject(RestTimerService);
}
