import type { Routes } from '@angular/router';
import { TodayPageComponent } from './views/today/today-page.component';

export const routes: Routes = [
  { path: '', component: TodayPageComponent, pathMatch: 'full' },
  {
    path: 'progress',
    loadComponent: () => import('./views/progress/progress-page.component').then(m => m.ProgressPageComponent),
  },
  {
    path: 'plan',
    loadComponent: () => import('./views/plan/plan-page.component').then(m => m.PlanPageComponent),
  },
  {
    path: 'data',
    loadComponent: () => import('./views/data/data-page.component').then(m => m.DataPageComponent),
  },
  { path: '**', redirectTo: '' },
];
