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
import { pointerIn } from '../../kit/chart-kit';
import { dayName, daysBetween, shortDate } from '../../kit/dates';
import type { ExerciseHistoryPoint, MoveDef } from '../../domain/models';

function rangeScale(values: number[]): { lo: number; hi: number; step: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(max * 0.2, 10);
  const step = [1, 2, 5, 10, 20, 25, 50, 100].find(s => span / s <= 4) || 200;
  const pad = max === min ? step : 0;
  const lo = Math.max(0, Math.floor((min - pad) / step) * step);
  const hi = Math.max(lo + step, Math.ceil((max + pad) / step) * step);
  return { lo, hi, step };
}

@Component({
  selector: 'wt-exercise-line-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #plotBox class="chart-plot" style="min-height: 210px;">
      @if (chart(); as c) {
        <svg
          [attr.width]="c.W"
          [attr.height]="c.H"
          [attr.viewBox]="'0 0 ' + c.W + ' ' + c.H"
          role="img"
          [attr.aria-label]="'Progress in ' + unit()"
          (pointermove)="onPointer($event)"
          (pointerdown)="onPointer($event)"
          (pointerleave)="onLeave($event)"
        >
          @for (tick of c.yTicks; track tick.v) {
            <line [attr.x1]="c.left" [attr.x2]="c.W - c.right" [attr.y1]="tick.y" [attr.y2]="tick.y" class="grid" />
            <text [attr.x]="c.left - 6" [attr.y]="tick.y + 4" text-anchor="end" class="axis">{{ tick.v }}</text>
          }

          @if (hoverPoint(); as hp) {
            <line [attr.x1]="hp.x" [attr.x2]="hp.x" [attr.y1]="c.top - 6" [attr.y2]="c.baseline" class="crosshair" />
          }

          <path [attr.d]="c.linePath" class="line-gym" />

          @for (pt of c.coords; track pt.point.date) {
            <circle [attr.cx]="pt.x" [attr.cy]="pt.y" r="4" class="dot-gym" />
          }

          <text
            [attr.x]="c.endLabelX"
            [attr.y]="c.endCoord.y - 10"
            [attr.text-anchor]="c.coords.length > 1 ? 'end' : 'middle'"
            class="axis strong-tick"
          >{{ c.endCoord.point.value }} {{ unit() }}</text>

          <text
            [attr.x]="c.span ? c.left : c.coords[0].x"
            [attr.y]="c.H - 7"
            [attr.text-anchor]="c.span ? 'start' : 'middle'"
            class="axis"
          >{{ c.firstLabel }}</text>

          @if (c.span) {
            <text [attr.x]="c.W - c.right" [attr.y]="c.H - 7" text-anchor="end" class="axis">
              {{ c.endLabel }}
            </text>
          }
        </svg>

        @if (hoverPoint(); as hp) {
          <div class="chart-tip" [style.left.px]="hp.tipX" [style.top.px]="hp.tipY">
            <strong>{{ hp.title }}</strong>
            <div>{{ hp.subtitle }}</div>
          </div>
        }
      }
    </div>
  `,
})
export class ExerciseLineChartComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly plotBoxRef = viewChild<ElementRef<HTMLDivElement>>('plotBox');

  readonly points = input.required<ExerciseHistoryPoint[]>();
  readonly unit = input.required<string>();
  readonly exercise = input.required<MoveDef>();

  readonly width = signal(340);
  readonly hoverPoint = signal<{
    x: number;
    tipX: number;
    tipY: number;
    title: string;
    subtitle: string;
  } | null>(null);

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
    const points = this.points();
    if (!points.length) return null;
    const W = Math.max(200, this.width());
    const H = 210;
    const left = 40;
    const right = 18;
    const top = 22;
    const baseline = H - 24;
    const { lo, hi, step } = rangeScale(points.map(p => p.value));
    const yFn = (v: number) => baseline - ((v - lo) / (hi - lo)) * (baseline - top);
    const first = points[0].date;
    const span = daysBetween(first, points[points.length - 1].date);
    const xFn = (p: ExerciseHistoryPoint) =>
      span ? left + (daysBetween(first, p.date) / span) * (W - left - right) : (left + W - right) / 2;

    const yTicks: Array<{ v: number; y: number }> = [];
    for (let v = lo; v <= hi; v += step) yTicks.push({ v, y: yFn(v) });

    const coords = points.map(point => ({ point, x: xFn(point), y: yFn(point.value) }));
    const linePath = coords.map((c, i) => `${i ? 'L' : 'M'}${c.x},${c.y}`).join('');
    const endCoord = coords[coords.length - 1];

    return {
      W,
      H,
      left,
      right,
      top,
      baseline,
      span,
      yTicks,
      coords,
      linePath,
      endCoord,
      endLabelX: Math.min(endCoord.x, W - right),
      firstLabel: shortDate(first),
      endLabel: shortDate(endCoord.point.date),
    };
  });

  onPointer(event: PointerEvent): void {
    const c = this.chart();
    const box = this.plotBoxRef()?.nativeElement;
    const svg = box?.querySelector('svg');
    if (!c || !box || !svg) return;
    const at = pointerIn(svg, event);
    const near = c.coords.reduce((a, b) => (Math.abs(b.x - at.x) < Math.abs(a.x - at.x) ? b : a));
    const ex = this.exercise();
    const desc = near.point.sets
      .map(s => (ex.weighted ? `${s.weight} lb${ex.assisted ? ' assist' : ''} × ${s.value}` : `${s.value} ${ex.unit}`))
      .join(', ');
    this.hoverPoint.set({
      x: near.x,
      tipX: Math.max(2, Math.min(near.x + 12, box.clientWidth - 150)),
      tipY: Math.max(0, near.y - 44),
      title: dayName(near.point.date),
      subtitle: desc,
    });
  }

  onLeave(event: PointerEvent): void {
    if (event.pointerType === 'mouse') this.hoverPoint.set(null);
  }
}
