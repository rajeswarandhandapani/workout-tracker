import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { barPath, pointerIn } from '../../kit/chart-kit';
import { shortDate } from '../../kit/dates';
import type { WeekRow } from '../../domain/models';

@Component({
  selector: 'wt-weekly-bars-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #plotBox class="chart-plot" style="min-height: 220px;">
      @if (chart(); as c) {
        <svg
          [attr.width]="c.W"
          [attr.height]="c.H"
          [attr.viewBox]="'0 0 ' + c.W + ' ' + c.H"
          role="img"
          aria-label="Cardio minutes per week"
          (pointerleave)="onSvgLeave($event)"
        >
          @for (tick of c.yTicks; track tick.v) {
            <line [attr.x1]="c.left" [attr.x2]="c.W" [attr.y1]="tick.y" [attr.y2]="tick.y" class="grid" />
            <text [attr.x]="c.left - 6" [attr.y]="tick.y + 4" text-anchor="end" class="axis">{{ tick.v }}</text>
          }

          @for (bar of c.bars; track bar.row.week) {
            @if (bar.d) {
              <path [attr.d]="bar.d" class="bar-cardio" />
            }
            <text
              [attr.x]="bar.cx"
              [attr.y]="c.H - 7"
              text-anchor="middle"
              [attr.class]="'axis' + (bar.row.week === currentWeek() ? ' strong-tick' : '')"
            >{{ bar.row.week }}</text>
          }

          <line [attr.x1]="c.left" [attr.x2]="c.W" [attr.y1]="c.goalY" [attr.y2]="c.goalY" class="goal-line" />
          <text [attr.x]="c.W" [attr.y]="c.goalY - 5" text-anchor="end" class="axis strong-tick">
            {{ goal() }} min goal
          </text>

          @for (bar of c.bars; track bar.row.week) {
            <rect
              [attr.x]="bar.hitX"
              y="0"
              [attr.width]="bar.band"
              [attr.height]="c.H"
              fill="transparent"
              (pointermove)="showTip(bar.row, $event)"
              (pointerdown)="showTip(bar.row, $event)"
            />
          }
        </svg>

        @if (tip(); as t) {
          <div class="chart-tip" [style.left.px]="t.x" [style.top.px]="t.y">
            <strong>{{ t.title }}</strong>
            <div>{{ t.subtitle }}</div>
          </div>
        }
      }
    </div>
  `,
})
export class WeeklyBarsChartComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly plotBoxRef = viewChild<ElementRef<HTMLDivElement>>('plotBox');

  readonly rows = input.required<WeekRow[]>();
  readonly goal = input.required<number>();
  readonly currentWeek = input.required<number>();

  readonly width = signal(340);
  readonly tip = signal<{ x: number; y: number; title: string; subtitle: string } | null>(null);

  constructor() {
    afterNextRender(() => {
      const box = this.plotBoxRef()?.nativeElement;
      if (!box) return;
      if (box.clientWidth > 0) this.width.set(box.clientWidth);
      if (typeof ResizeObserver === 'undefined') return;
      const obs = new ResizeObserver(([entry]) => {
        const w = Math.round(entry.contentRect.width);
        if (w > 0 && w !== this.width()) this.width.set(w);
      });
      obs.observe(box);
      this.destroyRef.onDestroy(() => obs.disconnect());
    });
  }

  readonly chart = computed(() => {
    const rows = this.rows();
    const goal = this.goal();
    const W = Math.max(200, this.width());
    const H = 220;
    const left = 34;
    const top = 14;
    const baseline = H - 24;
    const peak = Math.max(goal, ...rows.map(r => r.cardio));
    const step = peak > 300 ? 100 : 50;
    const ceil = Math.ceil((peak + 1) / step) * step;
    const y = (v: number) => baseline - (v / ceil) * (baseline - top);
    const band = rows.length ? (W - left) / rows.length : W - left;
    const barW = Math.max(4, Math.min(26, band - 2));

    const yTicks: Array<{ v: number; y: number }> = [];
    for (let v = 0; v <= ceil; v += step) yTicks.push({ v, y: y(v) });

    const bars = rows.map((row, i) => {
      const hitX = left + band * i;
      const cx = hitX + band / 2;
      return {
        row,
        hitX,
        band,
        cx,
        d: row.cardio > 0 ? barPath(cx - barW / 2, baseline, y(row.cardio), barW) : '',
      };
    });

    return { W, H, left, yTicks, bars, goalY: y(goal) };
  });

  showTip(row: WeekRow, event: PointerEvent): void {
    const box = this.plotBoxRef()?.nativeElement;
    const svg = box?.querySelector('svg');
    if (!box || !svg) return;
    const p = pointerIn(svg, event);
    this.tip.set({
      x: Math.max(2, Math.min(p.x + 12, box.clientWidth - 150)),
      y: Math.max(0, p.y - 44),
      title: `Week ${row.week}, from ${shortDate(row.monday)}`,
      subtitle: `${row.cardio} of ${this.goal()} min`,
    });
  }

  onSvgLeave(event: PointerEvent): void {
    if (event.pointerType === 'mouse') this.tip.set(null);
  }
}
