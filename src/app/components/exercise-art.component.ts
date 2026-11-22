import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  hasAnimation,
  isHoldScene,
  momentOf,
  muscleMapSpecs,
  panelSpecs,
  renderSvgSpecs,
  thumbSpecs,
} from '../domain/art';
import { gifUrl, videoUrl } from '../domain/plan';

@Component({
  selector: 'wt-muscle-map',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      #svgRef
      viewBox="0 0 32 40"
      class="muscle-map"
      aria-hidden="true"
    ></svg>
  `,
})
export class MuscleMapComponent {
  readonly focus = input.required<string>();
  private readonly svgRef = viewChild<ElementRef<SVGSVGElement>>('svgRef');

  constructor() {
    effect(() => {
      const el = this.svgRef()?.nativeElement;
      const focus = this.focus();
      if (el) renderSvgSpecs(el, muscleMapSpecs(focus));
    });
  }
}

@Component({
  selector: 'wt-art-thumb',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      #svgRef
      viewBox="0 0 240 180"
      class="art art-thumb-img"
      aria-hidden="true"
    ></svg>
  `,
})
export class ArtThumbComponent {
  readonly moveId = input.required<string>();
  readonly kind = input<string | undefined>(undefined);
  private readonly svgRef = viewChild<ElementRef<SVGSVGElement>>('svgRef');

  constructor() {
    effect(() => {
      const el = this.svgRef()?.nativeElement;
      const id = this.moveId();
      const kind = this.kind();
      if (el) renderSvgSpecs(el, thumbSpecs(id, { kind }));
    });
  }
}

@Component({
  selector: 'wt-exercise-demo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="art-demo">
      @if (useStill()) {
        <svg
          #stillSvg
          [attr.viewBox]="isHold() ? '0 0 240 180' : '0 0 490 180'"
          class="art art-full"
          [class.art-single]="isHold()"
          role="img"
          [attr.aria-label]="isHold() ? name() + ': position to hold' : name() + ': start and finish positions'"
        ></svg>
      } @else {
        <svg
          #animSvg
          viewBox="0 0 240 180"
          class="art art-anim"
          role="img"
          [attr.aria-label]="name() + ': animated demonstration'"
        >
          <g #animGroup></g>
        </svg>
        <button
          type="button"
          class="btn btn-outline btn-sm art-pause"
          [attr.aria-label]="(playing() ? 'Pause ' : 'Play ') + name() + ' demonstration'"
          (click)="togglePlay()"
        >
          {{ playing() ? 'Pause' : 'Play' }}
        </button>
      }
      @if (showLinks()) {
        <div class="media-links">
          <a
            class="link ext-link"
            [href]="vUrl()"
            target="_blank"
            rel="noopener noreferrer"
            [attr.aria-label]="'Watch ' + name() + ' video'"
          >Watch form video ↗</a>
          <a
            class="link ext-link"
            [href]="gUrl()"
            target="_blank"
            rel="noopener noreferrer"
            [attr.aria-label]="'View ' + name() + ' animated GIF'"
          >Animated GIFs ↗</a>
        </div>
      }
    </div>
  `,
})
export class ExerciseDemoComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly moveId = input.required<string>();
  readonly name = input.required<string>();
  readonly kind = input<string | undefined>(undefined);
  readonly active = input<boolean>(false);
  readonly showLinks = input<boolean>(true);

  readonly playing = signal(false);
  private readonly reducedMotion = signal(false);

  private readonly stillRef = viewChild<ElementRef<SVGSVGElement>>('stillSvg');
  private readonly animSvgRef = viewChild<ElementRef<SVGSVGElement>>('animSvg');
  private readonly animGroupRef = viewChild<ElementRef<SVGGElement>>('animGroup');

  private clock = 0;
  private lastTs: number | null = null;
  private rafId: number | null = null;
  private shownKey = '';

  constructor() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion.set(mql.matches);
      const onChange = (e: MediaQueryListEvent) => this.reducedMotion.set(e.matches);
      mql.addEventListener?.('change', onChange);
      this.destroyRef.onDestroy(() => mql.removeEventListener?.('change', onChange));
    }

    // Render still frames reactively
    effect(() => {
      const el = this.stillRef()?.nativeElement;
      if (!el) return;
      const id = this.moveId();
      const kind = this.kind();
      if (isHoldScene(id, kind)) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        renderSvgSpecs(g, panelSpecs(id, 0, { kind, label: 'Hold' }));
        el.replaceChildren(g);
      } else {
        const g1 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        renderSvgSpecs(g1, panelSpecs(id, 0, { kind, label: 'Start', showArrow: true }));
        const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g2.setAttribute('transform', 'translate(250 0)');
        renderSvgSpecs(g2, panelSpecs(id, 1, { kind, label: 'Finish' }));
        el.replaceChildren(g1, g2);
      }
    });

    // Manage animation frame lifecycle when active changes
    effect(() => {
      const isActive = this.active();
      const still = this.useStill();
      this.moveId(); // reset when exercise changes
      this.clock = 0;
      this.lastTs = null;
      this.shownKey = '';
      if (still) {
        this.halt();
        return;
      }
      this.drawFrame();
      if (isActive) {
        this.play();
      } else {
        this.halt();
      }
    });

    this.destroyRef.onDestroy(() => this.halt());
  }

  isHold(): boolean {
    return isHoldScene(this.moveId(), this.kind());
  }

  useStill(): boolean {
    return this.isHold() || !hasAnimation(this.moveId()) || this.reducedMotion();
  }

  vUrl(): string {
    return videoUrl(this.name());
  }

  gUrl(): string {
    return gifUrl(this.name());
  }

  togglePlay(): void {
    if (this.playing()) this.halt();
    else this.play();
  }

  private drawFrame(): void {
    const group = this.animGroupRef()?.nativeElement;
    if (!group) return;
    const id = this.moveId();
    const { t, label } = momentOf(id, this.clock);
    const key = `${t.toFixed(3)}|${label}`;
    if (key === this.shownKey) return;
    this.shownKey = key;
    renderSvgSpecs(group, panelSpecs(id, t, { kind: this.kind(), label }));
  }

  private tick = (now: number): void => {
    this.rafId = null;
    const svg = this.animSvgRef()?.nativeElement;
    if (!svg || !svg.isConnected || !this.playing()) return;
    if (this.lastTs != null) this.clock += Math.min(now - this.lastTs, 100);
    this.lastTs = now;
    this.drawFrame();
    this.rafId = requestAnimationFrame(this.tick);
  };

  private play(): void {
    if (this.useStill()) return;
    this.halt();
    this.lastTs = null;
    this.playing.set(true);
    this.drawFrame();
    this.rafId = requestAnimationFrame(this.tick);
  }

  private halt(): void {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.playing.set(false);
  }
}
