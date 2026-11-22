import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppShellComponent, type KitNavItem } from './kit/app-shell.component';
import { RestTimerComponent } from './components/rest-timer.component';
import { WorkoutStateService } from './services/workout-state.service';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppShellComponent, RouterOutlet, RestTimerComponent],
  template: `
    <kit-app-shell brand="Workout Tracker" [navItems]="navItems" (click)="onShellClick($event)">
      <router-outlet />
    </kit-app-shell>
    <wt-rest-timer />
  `,
})
export class App {
  private readonly state = inject(WorkoutStateService);

  readonly navItems: KitNavItem[] = [
    { label: 'Today', path: '/', exact: true },
    { label: 'Progress', path: '/progress' },
    { label: 'Plan', path: '/plan' },
    { label: 'Data', path: '/data' },
  ];

  onShellClick(event: Event): void {
    const btn = (event.target as HTMLElement | null)?.closest('header nav button');
    if (btn?.textContent?.trim() === 'Today') {
      this.state.openDate(this.state.today());
    }
  }
}
