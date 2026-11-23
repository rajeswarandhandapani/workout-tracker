# Workout Tracker (Angular + Tailwind CSS + DaisyUI)

A daily log for a 12-week heart-health plan: three gym days, three cardio days, and one rest day each week. It runs entirely in the browser with no server or account, works offline via `@angular/service-worker`, and keeps all logs on the device in IndexedDB.

*(The original zero-build vanilla JS + `pwa-kit` v1.0.0 checkpoint is preserved on branch `main` at tag `v1-vanilla`.)*

## Live App & Deployment

- **URL:** `https://rajeswarandhandapani.com/workout-tracker/`
- Every push to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which runs `npm ci`, runs `npm test`, builds with `--base-href /workout-tracker/`, and deploys directly via `actions/deploy-pages` (GitHub Pages **Source: GitHub Actions**, custom domain blank so it inherits `rajeswarandhandapani.com`).

## Run locally

```powershell
npm.cmd install
npm.cmd start
```

Then open `http://localhost:4183`.

## Build & Test

```powershell
# Domain unit tests (plan, progressive suggestions, dates, .ics reminders, backups, SVG art specs)
npm.cmd test

# Production build (GitHub Pages subfolder base-href + service worker)
npm.cmd run build:pages

# Local production build (relative base-href) & full Playwright E2E + offline + v1 migration test
npm.cmd run build
npm.cmd run test:browser
```

Tests use made-up workouts. `.gitignore` blocks backup files so personal logs are not committed by accident.

## Architecture & Data Compatibility

Built with standalone, zoneless Angular (Signals, `@if`/`@for`, hash routing), **Tailwind CSS v4 + DaisyUI v5** (system-aware light/dark + user-selectable presets), and shared kit primitives synced from [`angular-pwa-kit`](../angular-pwa-kit) (`src/app/kit/`).

| Path | Purpose |
| --- | --- |
| `src/app/domain/` (`plan.ts`, `logic.ts`, `art.ts`, `models.ts`) | 12-week workout plan, progression logic, dates/reminders, SVG exercise art specs |
| `src/app/services/` (`workout-store`, `workout-state`, `rest-timer`, `reminder`) | IndexedDB persistence, reactive workout log state, rest timer, `.ics` reminders |
| `src/app/views/` (`today/`, `progress/`, `plan/`, `data/`) | Daily workout view, 12-week progress calendar & charts, plan overview, backups & theme settings |
| `src/app/kit/` | Shared `angular-pwa-kit` theme, IndexedDB helper, shell, toast, timer, and chart utilities |
| `ngsw-config.json` | Offline asset caching via `@angular/service-worker` |

- **Data continuity:** Preserves IndexedDB `'workout-tracker'` (v1: `days` keyed by `date` and `kv`) and `.json` backup compatibility so existing `v1-vanilla` workout logs, swaps, custom exercises, and settings continue to work seamlessly.
- **Security:** Enforces a strict Content Security Policy with zero external network requests.
- **Apple Watch note:** Web apps cannot start an Apple Watch workout or read HealthKit data directly, so the Watch steps in each routine act as reminders. To adjust the workout plan, edit `src/app/domain/plan.ts`.
