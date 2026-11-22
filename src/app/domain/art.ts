// Original side-view drawings of each exercise, built from pure geometry so they work offline,
// follow light and dark themes, and can be unit tested cleanly without a browser DOM.

export type Vec2 = [number, number];
export type SvgAttrs = Record<string, string | number>;
export interface SvgSpec {
  tag: string;
  attrs: SvgAttrs;
  text?: string;
}

export interface PoseInput {
  hip: Vec2;
  sh?: Vec2;
  head?: Vec2;
  lean?: number;
  arm?: number;
  arm2?: number;
  leg?: number;
  leg2?: number;
  hand: Vec2;
  hand2?: Vec2;
  foot: Vec2;
  foot2?: Vec2;
  toe?: number;
  toe2?: number;
  flip?: boolean;
}

export interface SolvedPose extends PoseInput {
  sh: Vec2;
  head: Vec2;
  up: Vec2;
  rear: Vec2;
  el: Vec2;
  ha: Vec2;
  kn: Vec2;
  an: Vec2;
  el2?: Vec2;
  ha2?: Vec2;
  kn2?: Vec2;
  an2?: Vec2;
}

interface SceneDef {
  poses: PoseInput[];
  hold?: boolean;
  arrow?: [Vec2, Vec2];
  draw: (p: SolvedPose, t: number) => { back: SvgSpec[]; front: SvgSpec[] };
  extra?: (p: SolvedPose) => SvgSpec[];
}

const G = 168; // floor height
const BODY = { torso: 46, upper: 25, fore: 24, thigh: 34, shin: 33, neck: 18, head: 10, toe: 13 };

const rad = (d: number): number => (d * Math.PI) / 180;
const add = (a: Vec2, b: Vec2, k = 1): Vec2 => [a[0] + b[0] * k, a[1] + b[1] * k];

/** Finds the middle joint of a limb. `bend` picks which side it folds to. */
function limb(from: Vec2, to: Vec2, a: number, b: number, bend: number): { mid: Vec2; end: Vec2 } {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const full = Math.hypot(dx, dy) || 1;
  const ux = dx / full;
  const uy = dy / full;
  const d = Math.min(full, a + b - 0.5);
  const x = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  return {
    mid: [from[0] + ux * x - uy * h * bend, from[1] + uy * x + ux * h * bend],
    end: [from[0] + ux * d, from[1] + uy * d],
  };
}

function solve(pose: PoseInput): SolvedPose {
  const { hip, lean = 0, arm = 1, leg = -1 } = pose;
  const up: Vec2 = pose.sh
    ? (() => {
        const v: Vec2 = [pose.sh[0] - hip[0], pose.sh[1] - hip[1]];
        const n = Math.hypot(...v) || 1;
        return [v[0] / n, v[1] / n];
      })()
    : [Math.sin(rad(lean)), -Math.cos(rad(lean))];
  const sh = pose.sh || add(hip, up, BODY.torso);
  const rear: Vec2 = [up[1], -up[0]];
  const p: SolvedPose = {
    ...pose,
    hip,
    sh,
    up,
    rear: pose.flip ? [-rear[0], -rear[1]] : rear,
    head: pose.head || add(sh, up, BODY.neck),
    el: [0, 0],
    ha: [0, 0],
    kn: [0, 0],
    an: [0, 0],
  };
  const a = limb(sh, pose.hand, BODY.upper, BODY.fore, arm);
  p.el = a.mid;
  p.ha = a.end;
  const l = limb(hip, pose.foot, BODY.thigh, BODY.shin, leg);
  p.kn = l.mid;
  p.an = l.end;
  if (pose.hand2) {
    const b = limb(sh, pose.hand2, BODY.upper, BODY.fore, pose.arm2 ?? arm);
    p.el2 = b.mid;
    p.ha2 = b.end;
  }
  if (pose.foot2) {
    const b = limb(hip, pose.foot2, BODY.thigh, BODY.shin, pose.leg2 ?? leg);
    p.kn2 = b.mid;
    p.an2 = b.end;
  }
  return p;
}

/* ---------- Drawing pieces ---------- */

const spec = (tag: string, attrs: SvgAttrs, text?: string): SvgSpec => ({ tag, attrs, text });
const ln = (a: Vec2, b: Vec2, cls: string, w?: number): SvgSpec =>
  spec('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: cls, ...(w != null ? { 'stroke-width': w } : {}) });
const dot = (c: Vec2, r: number, cls: string): SvgSpec =>
  spec('circle', { cx: c[0], cy: c[1], r, class: cls });
const box = (x: number, y: number, w: number, h: number, cls: string, r = 1.5): SvgSpec =>
  spec('rect', { x, y, width: w, height: h, rx: r, class: cls });
const frame = (a: Vec2, b: Vec2, w = 6) => ln(a, b, 'art-frame', w);
const pad = (a: Vec2, b: Vec2, w = 13) => ln(a, b, 'art-pad', w);
const lever = (a: Vec2, b: Vec2, w = 6) => ln(a, b, 'art-lever', w);
const grip = (a: Vec2, b: Vec2, w = 7) => ln(a, b, 'art-grip', w);
const cable = (...points: Vec2[]): SvgSpec =>
  spec('polyline', { points: points.map(q => q.join(',')).join(' '), class: 'art-cable' });
const pulley = (c: Vec2) => dot(c, 5, 'art-pulley');
const floorBar = (a: number, b: number) => frame([a, G - 2], [b, G - 2], 7);

/** A point along the torso, `off` units towards the back (or the chest if negative). */
const along = (p: SolvedPose, f: number, off = 0): Vec2 =>
  add(add(p.hip, p.up, BODY.torso * f), p.rear, off);
const backPad = (p: SolvedPose, from = 0.08, to = 0.98, off = 13) =>
  pad(along(p, from, off), along(p, to, off));

function stack(x: number, t: number, top = 34): { parts: SvgSpec[]; lid: Vec2 } {
  const plate = 7;
  const count = 10;
  const moving = 4;
  const base = G - 7;
  const width = 26;
  const out: SvgSpec[] = [
    box(x + 3, top, width - 6, G - top - 3, 'art-tower', 3),
    frame([x, top], [x, G]),
    frame([x + width, top], [x + width, G]),
    frame([x - 3, top], [x + width + 3, top], 7),
  ];
  let lid: Vec2 = [x + width / 2, top];
  for (let i = 0; i < count; i++) {
    const y = base - (i + 1) * plate - (i >= count - moving ? t * 24 : 0);
    out.push(box(x + 4, y, width - 8, plate - 1.2, 'art-plate'));
    if (i === count - moving) out.push(dot([x + width / 2, y + 2.9], 2.6, 'art-pin'));
    lid = [x + width / 2, y];
  }
  return { parts: out, lid };
}

function dumbbell(c: Vec2, angle = 0, len = 24): SvgSpec[] {
  const u: Vec2 = [Math.cos(rad(angle)), Math.sin(rad(angle))];
  const a = add(c, u, -len / 2);
  const b = add(c, u, len / 2);
  return [
    ln(a, b, 'art-grip', 3.5),
    ln(add(a, u, -1), add(a, u, 3), 'art-grip', 12),
    ln(add(b, u, 1), add(b, u, -3), 'art-grip', 12),
  ];
}

function bench(x1: number, x2: number, y: number): SvgSpec[] {
  return [
    frame([x1 + 10, y + 6], [x1 + 10, G - 1]),
    frame([x2 - 10, y + 6], [x2 - 10, G - 1]),
    floorBar(x1 + 2, x2 - 2),
    pad([x1, y], [x2, y], 12),
  ];
}

function figure(p: SolvedPose): SvgSpec[] {
  const toe = rad(p.toe ?? 0);
  const out: SvgSpec[] = [];
  const tip = (an: Vec2, deg = toe) => add(an, [Math.cos(deg), Math.sin(deg)], BODY.toe);
  if (p.an2 && p.kn2) {
    out.push(
      ln(p.hip, p.kn2, 'art-far', 13),
      ln(p.kn2, p.an2, 'art-far', 10),
      ln(p.an2, tip(p.an2, rad(p.toe2 ?? 0)), 'art-far', 7.5),
    );
  }
  if (p.ha2 && p.el2) {
    out.push(ln(p.sh, p.el2, 'art-far', 8.5), ln(p.el2, p.ha2, 'art-far', 7.5));
  }
  out.push(
    ln(p.hip, p.kn, 'art-body', 14),
    ln(p.kn, p.an, 'art-body', 11),
    ln(p.an, tip(p.an), 'art-body', 8),
  );
  out.push(ln(p.hip, p.sh, 'art-body', 18));
  out.push(dot(p.head, BODY.head, 'art-body-fill'));
  return out;
}

const arm = (p: SolvedPose): SvgSpec[] => [
  ln(p.sh, p.el, 'art-body art-arm', 9.5),
  ln(p.el, p.ha, 'art-body art-arm', 8.5),
];

const seat = (x1: number, x2: number, y: number, postX: number): SvgSpec[] => [
  frame([postX, y], [postX, G - 1]),
  pad([x1, y], [x2, y], 12),
];

const shinBack = (p: SolvedPose): Vec2 => {
  const v: Vec2 = [p.an[0] - p.kn[0], p.an[1] - p.kn[1]];
  const n = Math.hypot(...v) || 1;
  return [-v[1] / n, v[0] / n];
};

const pulldownMachine = (_p: SolvedPose, t: number, handle: Vec2) => {
  const s = stack(172, t, 26);
  const top: Vec2 = [185, 20];
  return {
    back: [
      floorBar(70, 200),
      ...s.parts,
      frame([185, 20], [108, 20], 8),
      ...seat(76, 110, 143, 94),
      frame([146, 104], [146, G - 2], 6),
      frame([146, 104], [126, 104], 5),
      pad([106, 104], [126, 104], 11),
      cable([handle[0], handle[1]], [118, 22], top, s.lid),
      pulley([118, 22]),
      pulley(top),
    ],
    front: [] as SvgSpec[],
  };
};

const SCENES: Record<string, SceneDef> = {
  'leg-press': {
    poses: [
      { hip: [126, 112], lean: -24, hand: [146, 122], foot: [164, 104], toe: -78 },
      { hip: [100, 108], lean: -24, hand: [120, 118], foot: [164, 104], toe: -78 },
    ],
    arrow: [[108, 142], [80, 148]],
    draw: (p, t) => {
      const s = stack(6, t);
      return {
        back: [
          floorBar(10, 196),
          ...s.parts,
          frame([46, G - 3], [46, 150], 6),
          frame([40, 150], [182, 128], 7),
          frame([176, 128], [182, G - 2], 7),
          frame([180, 80], [180, 128], 7),
          cable(s.lid, [33, 30], [48, 30], [p.hip[0] - 18, p.hip[1] + 26]),
          lever(add(p.hip, [-10, 18]), add(p.hip, [-4, 30]), 7),
          pad(add(p.hip, [-20, 14]), add(p.hip, [16, 10]), 12),
          backPad(p),
        ],
        front: [pad([172, 76], [175, 128], 8), grip(add(p.ha, [-5, 0]), add(p.ha, [5, 0]))],
      };
    },
  },
  'chest-press': {
    poses: [
      { hip: [70, 128], lean: -6, hand: [90, 88], foot: [118, 162] },
      { hip: [70, 128], lean: -6, hand: [113, 86], foot: [118, 162] },
    ],
    arrow: [[104, 64], [132, 64]],
    draw: (p, t) => {
      const s = stack(172, t);
      return {
        back: [
          floorBar(30, 200),
          ...s.parts,
          ...seat(54, 88, 141, 70),
          frame([42, G - 2], [42, 80], 7),
          frame([42, 118], [70, 138], 6),
          backPad(p),
          lever([150, 158], p.ha, 7),
          frame([150, 158], [150, G - 2], 8),
          dot([150, 156], 6, 'art-pulley'),
          cable(add([150, 158], [p.ha[0] - 150, p.ha[1] - 158], 0.55), [176, 30], [185, 30], s.lid),
        ],
        front: [grip(add(p.ha, [0, -7]), add(p.ha, [0, 7]))],
      };
    },
  },
  'lat-pulldown': {
    poses: [
      { hip: [92, 130], lean: -8, hand: [118, 46], foot: [132, 162] },
      { hip: [92, 130], lean: -8, hand: [114, 84], foot: [132, 162] },
    ],
    arrow: [[140, 52], [140, 84]],
    draw: (p, t) => ({
      ...pulldownMachine(p, t, add(p.ha, [0, -4])),
      front: [grip(add(p.ha, [-20, -3]), add(p.ha, [20, -3]), 5)],
    }),
  },
  'seated-row': {
    poses: [
      { hip: [74, 130], lean: 2, hand: [122, 94], foot: [126, 160] },
      { hip: [74, 130], lean: -3, hand: [96, 98], foot: [126, 160] },
    ],
    arrow: [[124, 56], [98, 56]],
    draw: (p, t) => {
      const s = stack(172, t);
      return {
        back: [
          floorBar(50, 200),
          ...s.parts,
          ...seat(58, 92, 143, 74),
          frame([132, 165], [132, 150], 7),
          pad([120, 150], [140, 150], 7),
          frame([112, G - 2], [112, 96], 6),
          pad([104, 120], [104, 88], 11),
          frame([172, 40], [146, 40], 7),
          lever([146, 40], p.ha, 7),
          pulley([146, 40]),
          cable(add([146, 40], [p.ha[0] - 146, p.ha[1] - 40], 0.35), [168, 34], [185, 30], s.lid),
        ],
        front: [grip(add(p.ha, [0, -7]), add(p.ha, [0, 7]))],
      };
    },
  },
  'leg-curl': {
    poses: [
      { hip: [68, 118], lean: -14, hand: [90, 128], foot: [135, 118], toe: -70 },
      { hip: [68, 118], lean: -14, hand: [90, 128], foot: [94, 150], toe: 20 },
    ],
    arrow: [[150, 132], [122, 162]],
    draw: (p, t) => {
      const s = stack(4, t);
      const roller = add(p.an, shinBack(p), 11);
      const cam: Vec2 = [102, 118];
      return {
        back: [
          floorBar(8, 170),
          ...s.parts,
          ...seat(50, 104, 133, 72),
          backPad(p),
          frame([124, 92], [124, G - 2], 6),
          frame([100, 92], [124, 92], 5),
          cable(s.lid, [17, 30], [34, 32], cam),
          lever(cam, roller, 6),
          dot(roller, 8, 'art-pad-fill'),
        ],
        front: [pad([90, 99], [112, 99], 10), dot(cam, 6, 'art-pulley'), grip(add(p.ha, [-4, 0]), add(p.ha, [5, 0]))],
      };
    },
  },
  plank: {
    poses: [{ hip: [96, 140], lean: 79, hand: [166, 158], foot: [30, 155], arm: 1, toe: 80 }],
    hold: true,
    draw: () => ({ back: [pad([18, 165], [200, 165], 6)], front: [] }),
  },
  'hack-squat': {
    poses: [
      { hip: [106, 112], sh: [72, 81], hand: [106, 84], foot: [160, 146], toe: -28, arm: 1 },
      { hip: [128, 128], sh: [94, 97], hand: [128, 100], foot: [160, 146], toe: -28, arm: 1 },
    ],
    arrow: [[122, 60], [148, 84]],
    draw: p => ({
      back: [
        floorBar(16, 196),
        frame([30, 76], [126, 162], 7),
        frame([30, 76], [30, G - 2], 7),
        frame([170, 150], [170, G - 2], 7),
        lever(along(p, 0.4, 13), along(p, 0.4, 25), 7),
        backPad(p, 0, 0.98, 12),
        pad(along(p, 1.02, 1), along(p, 1.02, -9), 9),
      ],
      front: [pad([151, 160], [187, 139], 7), grip(add(p.ha, [-4, -4]), add(p.ha, [4, 4]))],
    }),
  },
  'goblet-squat': {
    poses: [
      { hip: [106, 96], lean: 4, hand: [128, 62], foot: [114, 160], arm: 1 },
      { hip: [84, 128], lean: 30, hand: [130, 94], foot: [114, 160], arm: 1 },
    ],
    arrow: [[160, 84], [160, 122]],
    draw: () => ({ back: [], front: [] }),
    extra: p => dumbbell(add(p.ha, [2, 0]), 90, 20),
  },
  'step-up': {
    poses: [
      { hip: [100, 106], lean: 8, hand: [108, 150], foot: [146, 141], foot2: [80, 160], leg2: -1, arm: -1 },
      { hip: [146, 76], lean: 2, hand: [154, 122], foot: [146, 141], foot2: [124, 116], leg2: 1, toe2: 40, arm: -1 },
    ],
    arrow: [[66, 100], [90, 66]],
    draw: () => ({ back: [box(118, 148, 66, 20, 'art-pad-fill', 3)], front: [] }),
    extra: p => dumbbell(add(p.ha, [0, 3]), 0, 18),
  },
  'db-bench': {
    poses: [
      { hip: [122, 106], lean: -90, hand: [76, 78], foot: [168, 162], arm: -1, flip: true },
      { hip: [122, 106], lean: -90, hand: [76, 58], foot: [168, 162], arm: -1, flip: true },
    ],
    arrow: [[44, 80], [44, 50]],
    draw: () => ({ back: bench(40, 142, 120), front: [] }),
    extra: p => dumbbell(add(p.ha, [0, -2]), 0, 20),
  },
  'cable-press': {
    poses: [
      { hip: [108, 102], lean: 10, hand: [134, 66], foot: [140, 160], foot2: [68, 160], leg2: -1, toe2: 0 },
      { hip: [108, 102], lean: 14, hand: [166, 58], foot: [140, 160], foot2: [68, 160], leg2: -1, toe2: 0 },
    ],
    arrow: [[150, 38], [182, 38]],
    draw: (p, t) => {
      const s = stack(6, t, 36);
      return {
        back: [floorBar(4, 38), ...s.parts, pulley([34, 64]), cable(s.lid, [19, 40], [34, 40], [34, 64], p.ha)],
        front: [grip(add(p.ha, [0, -7]), add(p.ha, [0, 7]))],
      };
    },
  },
  'incline-pushup': {
    poses: [
      { hip: [90, 130], sh: [132, 110], hand: [148, 124], foot: [30, 158], arm: 1, toe: 70 },
      { hip: [82, 117], sh: [119, 88], hand: [148, 124], foot: [30, 158], arm: 1, toe: 70 },
    ],
    arrow: [[96, 84], [96, 56]],
    draw: () => ({ back: bench(128, 204, 133), front: [] }),
  },
  'single-arm-pulldown': {
    poses: [
      { hip: [92, 130], lean: -6, hand: [116, 46], foot: [132, 162] },
      { hip: [92, 130], lean: -6, hand: [110, 98], foot: [132, 162] },
    ],
    arrow: [[140, 56], [140, 92]],
    draw: (p, t) => ({
      ...pulldownMachine(p, t, add(p.ha, [0, -6])),
      front: [grip(add(p.ha, [-7, -3]), add(p.ha, [7, -3]), 7)],
    }),
  },
  'straight-arm-pulldown': {
    poses: [
      { hip: [92, 97], lean: 12, hand: [150, 46], foot: [100, 160], arm: 1 },
      { hip: [92, 97], lean: 12, hand: [114, 100], foot: [100, 160], arm: 1 },
    ],
    arrow: [[160, 72], [146, 108]],
    draw: (p, t) => {
      const s = stack(174, t, 24);
      return {
        back: [floorBar(168, 204), ...s.parts, pulley([174, 30]), cable(s.lid, [187, 26], [174, 30], add(p.ha, [0, -3]))],
        front: [grip(add(p.ha, [-12, -3]), add(p.ha, [12, -3]), 5)],
      };
    },
  },
  'band-pulldown': {
    poses: [
      { hip: [96, 100], lean: 2, hand: [130, 40], foot: [106, 160], arm: 1 },
      { hip: [96, 100], lean: -2, hand: [118, 84], foot: [106, 160], arm: 1 },
    ],
    arrow: [[150, 56], [150, 90]],
    draw: p => ({
      back: [
        frame([190, 10], [190, G], 9),
        dot([186, 22], 5, 'art-pulley'),
        spec('line', { x1: 186, y1: 22, x2: p.ha[0], y2: p.ha[1], class: 'art-band', 'stroke-width': 4 }),
      ],
      front: [],
    }),
  },
  'chest-supported-row': {
    poses: [
      { hip: [76, 124], lean: 36, hand: [136, 130], foot: [108, 160], arm: 1 },
      { hip: [76, 124], lean: 36, hand: [106, 118], foot: [108, 160], arm: -1 },
    ],
    arrow: [[150, 150], [122, 150]],
    draw: p => ({
      back: [
        floorBar(44, 200),
        ...seat(58, 92, 138, 72),
        frame([186, 44], [186, G - 2], 8),
        frame([186, 58], along(p, 0.75, -20), 5),
        pad(along(p, 0.3, -15), along(p, 1.02, -15), 10),
      ],
      front: [lever([186, 58], p.ha, 6), dot([186, 58], 6, 'art-pulley'), grip(add(p.ha, [0, -7]), add(p.ha, [0, 7]))],
    }),
  },
  'cable-row': {
    poses: [
      { hip: [66, 134], lean: 14, hand: [122, 112], foot: [136, 132] },
      { hip: [66, 134], lean: -6, hand: [88, 110], foot: [136, 132] },
    ],
    arrow: [[132, 72], [102, 72]],
    draw: (p, t) => {
      const s = stack(174, t);
      return {
        back: [
          floorBar(30, 204),
          ...seat(44, 92, 147, 66),
          frame([92, 156], [152, 156], 6),
          frame([148, G - 2], [148, 124], 7),
          ...s.parts,
          pulley([164, 118]),
          cable(p.ha, [164, 118], [170, 30], [187, 30], s.lid),
        ],
        front: [grip(add(p.ha, [0, -7]), add(p.ha, [0, 7]))],
      };
    },
  },
  'db-row': {
    poses: [
      { hip: [82, 104], lean: 78, hand: [128, 138], foot: [52, 160], hand2: [150, 112], arm2: 1, foot2: [58, 113], leg2: 1, arm: 1, toe2: 180 },
      { hip: [82, 104], lean: 78, hand: [104, 108], foot: [52, 160], hand2: [150, 112], arm2: 1, foot2: [58, 113], leg2: 1, arm: 1, toe2: 180 },
    ],
    arrow: [[160, 150], [160, 116]],
    draw: () => ({ back: bench(62, 180, 124), front: [] }),
    extra: p => dumbbell(add(p.ha, [0, 3]), 0, 18),
  },
  'lying-curl': {
    poses: [
      { hip: [106, 100], lean: 90, hand: [176, 124], foot: [40, 101], toe: 110, leg: 1, arm: 1, flip: false },
      { hip: [106, 100], lean: 90, hand: [176, 124], foot: [64, 66], toe: 210, leg: 1, arm: 1, flip: false },
    ],
    arrow: [[32, 84], [44, 54]],
    draw: p => {
      const roller = add(p.an, shinBack(p), -10);
      const cam: Vec2 = [72, 112];
      return {
        back: [
          floorBar(30, 196),
          frame([60, 118], [60, G - 2], 7),
          frame([166, 118], [166, G - 2], 7),
          pad([58, 113], [188, 113], 12),
          frame([170, 126], [188, 126], 6),
        ],
        front: [lever(cam, roller, 6), dot(roller, 8, 'art-pad-fill'), dot(cam, 6, 'art-pulley'), grip(add(p.ha, [-5, 0]), add(p.ha, [5, 0]))],
      };
    },
  },
  'romanian-deadlift': {
    poses: [
      { hip: [100, 94], lean: 4, hand: [108, 139], foot: [108, 160], arm: -1 },
      { hip: [76, 100], lean: 68, hand: [120, 134], foot: [106, 160], arm: -1 },
    ],
    arrow: [[46, 80], [46, 108]],
    draw: () => ({ back: [], front: [] }),
    extra: p => dumbbell(add(p.ha, [0, 3]), 0, 18),
  },
  'glute-bridge': {
    poses: [
      { hip: [106, 151], sh: [62, 156], head: [44, 156], hand: [106, 160], foot: [146, 158] },
      { hip: [100, 122], sh: [60, 150], head: [42, 156], hand: [104, 160], foot: [146, 158] },
    ],
    arrow: [[160, 118], [160, 88]],
    draw: () => ({ back: [pad([24, 165], [190, 165], 6)], front: [] }),
  },
  'smith-squat': {
    poses: [
      { hip: [108, 96], lean: 6, hand: [114, 52], foot: [122, 160], arm: 1 },
      { hip: [84, 128], lean: 22, hand: [114, 84], foot: [122, 160], arm: 1 },
    ],
    arrow: [[154, 84], [154, 122]],
    draw: p => ({ back: [floorBar(70, 164), frame([114, 24], [114, G - 2], 7)], front: [dot(add(p.sh, [4, 2]), 7, 'art-plate')] }),
  },
  'split-squat': {
    poses: [
      { hip: [110, 102], lean: 4, hand: [116, 140], foot: [138, 160], foot2: [78, 158], leg: -1, leg2: 1, arm: -1, toe2: 45 },
      { hip: [108, 126], lean: 8, hand: [114, 154], foot: [138, 160], foot2: [74, 158], leg: -1, leg2: 1, arm: -1, toe2: 65 },
    ],
    arrow: [[156, 92], [156, 128]],
    draw: () => ({ back: [], front: [] }),
    extra: p => dumbbell(add(p.ha, [0, 3]), 0, 18),
  },
  'smith-bench': {
    poses: [
      { hip: [122, 106], lean: -90, hand: [76, 80], foot: [168, 162], arm: -1, flip: true },
      { hip: [122, 106], lean: -90, hand: [76, 54], foot: [168, 162], arm: -1, flip: true },
    ],
    arrow: [[44, 80], [44, 50]],
    draw: () => ({ back: [...bench(40, 142, 120), floorBar(28, 182), frame([76, 24], [76, G - 2], 7)], front: [] }),
    extra: p => [ln([64, p.ha[1]], [88, p.ha[1]], 'art-grip', 4), dot(p.ha, 7, 'art-plate')],
  },
  'db-floor-press': {
    poses: [
      { hip: [122, 150], lean: -90, hand: [78, 126], foot: [168, 160], arm: -1, flip: true },
      { hip: [122, 150], lean: -90, hand: [78, 102], foot: [168, 160], arm: -1, flip: true },
    ],
    arrow: [[44, 126], [44, 98]],
    draw: () => ({ back: [pad([24, 165], [190, 165], 6)], front: [] }),
    extra: p => dumbbell(add(p.ha, [0, -2]), 0, 20),
  },
  'assisted-pullup': {
    poses: [
      { hip: [104, 102], lean: 4, hand: [108, 30], foot: [86, 140], leg: -1, arm: 1, toe: 140 },
      { hip: [104, 78], lean: 4, hand: [108, 30], foot: [86, 116], leg: -1, arm: 1, toe: 140 },
    ],
    arrow: [[62, 92], [62, 60]],
    draw: (p, t) => {
      const s = stack(172, 1 - t, 34);
      return {
        back: [
          floorBar(74, 200),
          ...s.parts,
          frame([140, 22], [140, G - 2], 7),
          frame([94, 22], [140, 22], 7),
          lever([140, p.kn[1] + 6], p.kn, 6),
          pad(add(p.kn, [-10, 4]), add(p.kn, [10, 4]), 10),
        ],
        front: [grip([98, 28], [118, 28], 5)],
      };
    },
  },
  'kneeling-pulldown': {
    poses: [
      { hip: [96, 118], lean: 6, hand: [130, 56], foot: [72, 158], leg: -1, arm: 1, toe: 160 },
      { hip: [96, 118], lean: -2, hand: [110, 92], foot: [72, 158], leg: -1, arm: 1, toe: 160 },
    ],
    arrow: [[150, 54], [142, 88]],
    draw: (p, t) => {
      const s = stack(174, t, 24);
      return {
        back: [floorBar(64, 204), ...s.parts, pulley([174, 30]), cable(s.lid, [187, 26], [174, 30], p.ha), pad([64, 164], [124, 164], 6)],
        front: [grip(add(p.ha, [-6, -2]), add(p.ha, [6, -2]), 6)],
      };
    },
  },
  'incline-db-row': {
    poses: [
      { hip: [76, 126], lean: 44, hand: [116, 134], foot: [96, 160], arm: 1 },
      { hip: [76, 126], lean: 44, hand: [92, 110], foot: [96, 160], arm: -1 },
    ],
    arrow: [[144, 132], [122, 108]],
    draw: () => ({
      back: [frame([72, 138], [72, G - 2]), frame([116, 100], [116, G - 2]), floorBar(64, 124), pad([66, 136], [122, 86], 12)],
      front: [],
    }),
    extra: p => dumbbell(add(p.ha, [0, 3]), 0, 18),
  },
  'inverted-row': {
    poses: [
      { hip: [100, 128], sh: [136, 112], hand: [138, 72], foot: [62, 158], arm: 1, toe: -60 },
      { hip: [104, 108], sh: [136, 80], hand: [138, 72], foot: [62, 158], arm: 1, toe: -60 },
    ],
    arrow: [[98, 102], [114, 76]],
    draw: () => ({ back: [floorBar(120, 166), frame([142, 64], [142, G - 2], 7), grip([126, 72], [150, 72], 5)], front: [] }),
  },
  'standing-curl': {
    poses: [
      { hip: [106, 98], lean: 4, hand: [144, 86], foot: [110, 158], foot2: [102, 160], leg: -1, leg2: -1, arm: 1 },
      { hip: [106, 98], lean: 4, hand: [144, 86], foot: [72, 118], foot2: [102, 160], leg: -1, leg2: -1, arm: 1, toe: 110 },
    ],
    arrow: [[88, 152], [68, 122]],
    draw: (p, t) => {
      const s = stack(174, t);
      return {
        back: [
          floorBar(92, 200),
          ...s.parts,
          frame([148, 40], [148, G - 2], 7),
          cable(s.lid, [186, 30], [160, 126], p.an),
          lever([108, 126], p.an, 6),
          dot(p.an, 7, 'art-pad-fill'),
        ],
        front: [],
      };
    },
  },
  'ball-curl': {
    poses: [
      { hip: [94, 128], sh: [56, 150], head: [38, 154], hand: [90, 160], foot: [152, 134], leg: -1, arm: 1, toe: -70 },
      { hip: [94, 124], sh: [56, 150], head: [38, 154], hand: [90, 160], foot: [126, 132], leg: -1, arm: 1, toe: -60 },
    ],
    arrow: [[154, 114], [124, 114]],
    draw: p => ({ back: [pad([24, 165], [190, 165], 6), dot([p.an[0] + 2, 146], 20, 'art-pad-fill')], front: [] }),
  },
  'incline-plank': {
    poses: [
      { hip: [94, 134], sh: [142, 104], hand: [158, 118], foot: [38, 158], arm: 1, toe: 70 },
      { hip: [94, 130], sh: [142, 101], hand: [158, 118], foot: [38, 158], arm: 1, toe: 70 },
    ],
    arrow: [[94, 142], [94, 116]],
    draw: () => ({ back: bench(136, 204, 124), front: [] }),
  },
  'side-plank': {
    poses: [
      { hip: [98, 148], sh: [144, 128], hand: [162, 158], foot: [36, 158], arm: 1, toe: 80 },
      { hip: [98, 134], sh: [144, 122], hand: [162, 158], foot: [36, 158], arm: 1, toe: 80 },
    ],
    arrow: [[98, 154], [98, 126]],
    draw: () => ({ back: [pad([18, 165], [200, 165], 6)], front: [] }),
  },
  'dead-bug': {
    poses: [
      { hip: [120, 150], sh: [74, 152], head: [56, 154], hand: [76, 110], hand2: [80, 114], foot: [148, 116], foot2: [144, 118], leg: 1, leg2: 1, arm: -1, arm2: -1, flip: true },
      { hip: [120, 150], sh: [74, 152], head: [56, 154], hand: [36, 152], hand2: [80, 114], foot: [176, 152], foot2: [144, 118], leg: 1, leg2: 1, arm: -1, arm2: -1, flip: true },
    ],
    arrow: [[154, 118], [180, 146]],
    draw: () => ({ back: [pad([24, 165], [200, 165], 6)], front: [] }),
  },
  'bird-dog': {
    poses: [
      { hip: [86, 122], sh: [132, 120], hand: [134, 158], hand2: [126, 158], foot: [54, 158], foot2: [60, 158], leg: -1, leg2: -1, arm: 1, arm2: 1, toe: 170, toe2: 170 },
      { hip: [86, 122], sh: [132, 120], hand: [176, 116], hand2: [126, 158], foot: [28, 122], foot2: [60, 158], leg: -1, leg2: -1, arm: 1, arm2: 1, toe: 150, toe2: 170 },
    ],
    arrow: [[148, 110], [182, 110]],
    draw: () => ({ back: [pad([20, 165], [200, 165], 6)], front: [] }),
  },
  'pallof-press': {
    poses: [
      { hip: [112, 100], lean: 4, hand: [128, 72], foot: [118, 160], foot2: [104, 160], arm: 1 },
      { hip: [112, 100], lean: 4, hand: [160, 68], foot: [118, 160], foot2: [104, 160], arm: 1 },
    ],
    arrow: [[134, 48], [168, 48]],
    draw: (p, t) => {
      const s = stack(8, t, 36);
      return {
        back: [floorBar(6, 40), ...s.parts, pulley([36, 72]), cable(s.lid, [21, 40], [36, 40], [36, 72], p.ha)],
        front: [grip(add(p.ha, [0, -6]), add(p.ha, [0, 6]))],
      };
    },
  },
  'shoulder-press': {
    poses: [
      { hip: [92, 130], lean: -6, hand: [106, 80], foot: [124, 160], arm: 1 },
      { hip: [92, 130], lean: -6, hand: [106, 42], foot: [124, 160], arm: 1 },
    ],
    arrow: [[130, 78], [130, 44]],
    draw: (p, t) => {
      const s = stack(172, t);
      return {
        back: [floorBar(50, 200), ...s.parts, ...seat(74, 110, 143, 92), frame([68, G - 2], [68, 84], 7), backPad(p), lever([74, 90], p.ha, 6), cable([74, 90], [160, 34], [185, 34], s.lid)],
        front: [grip(add(p.ha, [-6, 0]), add(p.ha, [6, 0]))],
      };
    },
  },
  'seated-db-press': {
    poses: [
      { hip: [94, 130], lean: -6, hand: [106, 80], foot: [128, 160], arm: 1 },
      { hip: [94, 130], lean: -6, hand: [104, 42], foot: [128, 160], arm: 1 },
    ],
    arrow: [[130, 78], [130, 44]],
    draw: p => ({ back: [floorBar(68, 134), ...seat(76, 112, 143, 94), backPad(p)], front: [] }),
    extra: p => dumbbell(add(p.ha, [0, -3]), 0, 20),
  },
  'landmine-press': {
    poses: [
      { hip: [112, 102], lean: 8, hand: [130, 68], foot: [128, 160], foot2: [94, 160], arm: 1 },
      { hip: [112, 102], lean: 12, hand: [154, 38], foot: [128, 160], foot2: [94, 160], arm: 1 },
    ],
    arrow: [[136, 62], [162, 34]],
    draw: p => ({ back: [dot([44, 162], 5, 'art-pulley'), ln([44, 162], add(p.ha, [8, -4]), 'art-lever', 5), dot(p.ha, 7, 'art-plate')], front: [] }),
  },
  'cable-shoulder-press': {
    poses: [
      { hip: [112, 102], lean: 6, hand: [126, 68], foot: [128, 160], foot2: [94, 160], arm: 1 },
      { hip: [112, 102], lean: 6, hand: [128, 28], foot: [128, 160], foot2: [94, 160], arm: 1 },
    ],
    arrow: [[148, 66], [148, 30]],
    draw: (p, t) => {
      const s = stack(8, t, 36);
      return {
        back: [floorBar(6, 40), ...s.parts, pulley([34, 152]), cable(s.lid, [21, 40], [34, 40], [34, 152], p.ha)],
        front: [grip(add(p.ha, [-6, 0]), add(p.ha, [6, 0]))],
      };
    },
  },
  'back-extension': {
    poses: [
      { hip: [104, 108], lean: 74, hand: [142, 134], foot: [62, 154], leg: -1, arm: 1, toe: 130 },
      { hip: [104, 108], lean: 38, hand: [134, 84], foot: [62, 154], leg: -1, arm: 1, toe: 130 },
    ],
    arrow: [[154, 114], [142, 74]],
    draw: () => ({
      back: [floorBar(44, 146), frame([64, 154], [116, 112], 7), frame([112, 112], [112, G - 2], 7), pad([94, 114], [116, 110], 11), pad([54, 148], [68, 148], 8)],
      front: [],
    }),
  },
  'cable-pull-through': {
    poses: [
      { hip: [82, 102], lean: 66, hand: [86, 134], foot: [108, 160], arm: -1 },
      { hip: [106, 98], lean: 4, hand: [112, 136], foot: [110, 160], arm: -1 },
    ],
    arrow: [[84, 86], [114, 78]],
    draw: (p, t) => {
      const s = stack(8, t, 36);
      return {
        back: [floorBar(6, 40), ...s.parts, pulley([34, 150]), cable(s.lid, [21, 40], [34, 40], [34, 150], p.ha)],
        front: [grip(add(p.ha, [-5, 0]), add(p.ha, [5, 0]))],
      };
    },
  },
  'hip-thrust-machine': {
    poses: [
      { hip: [104, 146], sh: [72, 114], head: [54, 108], hand: [102, 132], foot: [148, 160], leg: -1, arm: 1 },
      { hip: [108, 114], sh: [72, 114], head: [54, 108], hand: [106, 118], foot: [148, 160], leg: -1, arm: 1 },
    ],
    arrow: [[124, 146], [124, 114]],
    draw: p => ({
      back: [floorBar(48, 168), frame([68, 118], [68, G - 2], 7), pad([54, 114], [82, 114], 12), lever([148, 158], p.hip, 6)],
      front: [pad(add(p.hip, [-10, -4]), add(p.hip, [10, -4]), 10)],
    }),
  },
  'kb-deadlift': {
    poses: [
      { hip: [106, 98], lean: 6, hand: [114, 136], foot: [112, 160], arm: 1 },
      { hip: [80, 114], lean: 66, hand: [120, 138], foot: [112, 160], arm: 1 },
    ],
    arrow: [[56, 84], [56, 114]],
    draw: () => ({ back: [], front: [] }),
    extra: p => dumbbell(add(p.ha, [0, 4]), 0, 18),
  },
  'calf-raise': {
    poses: [
      { hip: [84, 128], lean: -4, hand: [112, 118], foot: [122, 154], toe: 25, leg: -1, arm: 1 },
      { hip: [84, 128], lean: -4, hand: [112, 118], foot: [122, 144], toe: 45, leg: -1, arm: 1 },
    ],
    arrow: [[148, 148], [148, 126]],
    draw: p => ({
      back: [floorBar(52, 166), ...seat(66, 102, 142, 84), frame([128, 158], [128, G - 2], 7), pad([122, 158], [138, 158], 7), lever([84, 126], add(p.kn, [0, -10]), 6)],
      front: [pad(add(p.kn, [-8, -10]), add(p.kn, [8, -10]), 9), dot(add(p.kn, [18, -10]), 7, 'art-plate')],
    }),
  },
  'leg-press-calf': {
    poses: [
      { hip: [106, 110], lean: -22, hand: [126, 120], foot: [164, 108], toe: -85 },
      { hip: [100, 108], lean: -22, hand: [120, 118], foot: [164, 108], toe: -55 },
    ],
    arrow: [[160, 74], [182, 74]],
    draw: (p, t) => {
      const s = stack(6, t);
      return {
        back: [
          floorBar(10, 196),
          ...s.parts,
          frame([46, G - 3], [46, 150], 6),
          frame([40, 150], [182, 128], 7),
          frame([176, 128], [182, G - 2], 7),
          frame([180, 80], [180, 128], 7),
          cable(s.lid, [33, 30], [48, 30], [p.hip[0] - 18, p.hip[1] + 26]),
          pad(add(p.hip, [-20, 14]), add(p.hip, [16, 10]), 12),
          backPad(p),
        ],
        front: [pad([172, 76], [175, 128], 8), grip(add(p.ha, [-5, 0]), add(p.ha, [5, 0]))],
      };
    },
  },
  'standing-calf-raise': {
    poses: [
      { hip: [104, 102], lean: 2, hand: [110, 140], hand2: [142, 86], foot: [110, 160], arm: -1, arm2: 1, toe: 12 },
      { hip: [104, 94], lean: 2, hand: [110, 132], hand2: [142, 86], foot: [110, 152], arm: -1, arm2: 1, toe: 45 },
    ],
    arrow: [[82, 146], [82, 122]],
    draw: () => ({ back: [frame([146, 36], [146, G - 2], 7), box(100, 158, 28, 10, 'art-pad-fill', 2)], front: [] }),
    extra: p => dumbbell(add(p.ha, [0, 3]), 0, 18),
  },

  /* ---------- Warm-up and stretch steps ---------- */

  'gp-cardio': {
    poses: [
      { hip: [110, 96], lean: 6, hand: [146, 86], hand2: [92, 102], foot: [132, 156], foot2: [88, 156], leg2: -1, arm: 1, arm2: 1 },
      { hip: [110, 94], lean: 6, hand: [146, 86], hand2: [126, 96], foot: [90, 156], foot2: [134, 154], leg2: -1, arm: 1, arm2: 1 },
    ],
    arrow: [[70, 148], [44, 148]],
    draw: () => ({ back: [box(44, 160, 152, 7, 'art-pad-fill', 3), frame([168, 72], [156, 162], 6), frame([142, 82], [170, 72], 6)], front: [] }),
  },
  'gp-legs': {
    poses: [
      { hip: [112, 98], lean: 2, hand: [152, 88], foot: [76, 146], foot2: [114, 160], leg: 1, leg2: -1, arm: 1, toe: 40 },
      { hip: [112, 98], lean: -2, hand: [152, 88], foot: [148, 128], foot2: [114, 160], leg: -1, leg2: -1, arm: 1, toe: -45 },
    ],
    arrow: [[78, 132], [144, 114]],
    draw: () => ({ back: [frame([156, 36], [156, G - 2], 7)], front: [] }),
  },
  'cp-legs': {
    poses: [
      { hip: [112, 98], lean: 2, hand: [152, 88], foot: [76, 146], foot2: [114, 160], leg: 1, leg2: -1, arm: 1, toe: 40 },
      { hip: [112, 98], lean: -2, hand: [152, 88], foot: [148, 128], foot2: [114, 160], leg: -1, leg2: -1, arm: 1, toe: -45 },
    ],
    arrow: [[78, 132], [144, 114]],
    draw: () => ({ back: [frame([156, 36], [156, G - 2], 7)], front: [] }),
  },
  'gp-hips': {
    poses: [
      { hip: [98, 100], lean: 10, hand: [100, 98], foot: [112, 160], foot2: [96, 160], arm: -1 },
      { hip: [122, 100], lean: -8, hand: [120, 98], foot: [112, 160], foot2: [96, 160], arm: -1 },
    ],
    arrow: [[76, 98], [144, 98]],
    draw: () => ({ back: [], front: [] }),
  },
  'gp-arms': {
    poses: [
      { hip: [112, 100], lean: 0, hand: [148, 36], hand2: [98, 118], foot: [116, 160], foot2: [100, 160], arm: 1 },
      { hip: [112, 100], lean: 0, hand: [76, 92], hand2: [98, 118], foot: [116, 160], foot2: [100, 160], arm: -1 },
    ],
    arrow: [[154, 46], [154, 92]],
    draw: () => ({ back: [], front: [] }),
  },
  'gp-squat': {
    poses: [
      { hip: [108, 96], lean: 4, hand: [136, 86], foot: [116, 160], arm: 1 },
      { hip: [84, 128], lean: 28, hand: [148, 92], foot: [116, 160], arm: 1 },
    ],
    arrow: [[164, 84], [164, 122]],
    draw: () => ({ back: [], front: [] }),
  },
  'cp-ankle': {
    poses: [
      { hip: [108, 98], lean: 0, hand: [152, 88], foot: [136, 142], foot2: [108, 160], arm: 1, toe: -45 },
      { hip: [108, 98], lean: 0, hand: [152, 88], foot: [136, 144], foot2: [108, 160], arm: 1, toe: 45 },
    ],
    arrow: [[152, 132], [152, 154]],
    draw: () => ({ back: [frame([156, 36], [156, G - 2], 7)], front: [] }),
  },
  'gs-walk': {
    poses: [
      { hip: [112, 98], lean: 4, hand: [134, 102], hand2: [92, 106], foot: [134, 160], foot2: [90, 160], leg2: -1, arm: 1, arm2: -1 },
      { hip: [112, 96], lean: 4, hand: [94, 106], hand2: [132, 102], foot: [90, 160], foot2: [134, 160], leg2: -1, arm: -1, arm2: 1 },
    ],
    arrow: [[150, 62], [180, 62]],
    draw: () => ({ back: [], front: [] }),
  },
  'cp-easy': {
    poses: [
      { hip: [112, 98], lean: 4, hand: [134, 102], hand2: [92, 106], foot: [134, 160], foot2: [90, 160], leg2: -1, arm: 1, arm2: -1 },
      { hip: [112, 96], lean: 4, hand: [94, 106], hand2: [132, 102], foot: [90, 160], foot2: [134, 160], leg2: -1, arm: -1, arm2: 1 },
    ],
    arrow: [[150, 62], [180, 62]],
    draw: () => ({ back: [], front: [] }),
  },
  'cs-slow': {
    poses: [
      { hip: [112, 98], lean: 4, hand: [134, 102], hand2: [92, 106], foot: [134, 160], foot2: [90, 160], leg2: -1, arm: 1, arm2: -1 },
      { hip: [112, 96], lean: 4, hand: [94, 106], hand2: [132, 102], foot: [90, 160], foot2: [134, 160], leg2: -1, arm: -1, arm2: 1 },
    ],
    arrow: [[150, 62], [180, 62]],
    draw: () => ({ back: [], front: [] }),
  },
  'gs-quad': {
    poses: [{ hip: [116, 98], lean: 2, hand: [88, 106], hand2: [162, 86], foot: [88, 108], foot2: [118, 160], leg: 1, leg2: -1, arm: -1, arm2: 1, toe: 100 }],
    hold: true,
    draw: () => ({ back: [frame([166, 28], [166, G - 2], 7)], front: [] }),
  },
  'cs-quad': {
    poses: [{ hip: [116, 98], lean: 2, hand: [88, 106], hand2: [162, 86], foot: [88, 108], foot2: [118, 160], leg: 1, leg2: -1, arm: -1, arm2: 1, toe: 100 }],
    hold: true,
    draw: () => ({ back: [frame([166, 28], [166, G - 2], 7)], front: [] }),
  },
  'gs-ham': {
    poses: [{ hip: [84, 120], lean: 36, hand: [134, 126], foot: [150, 158], foot2: [112, 160], leg: -1, leg2: -1, arm: 1, toe: -65 }],
    hold: true,
    draw: () => ({ back: [...seat(58, 98, 134, 76)], front: [] }),
  },
  'cs-ham': {
    poses: [{ hip: [92, 102], lean: 36, hand: [122, 118], foot: [148, 146], foot2: [94, 160], leg: -1, leg2: -1, arm: 1, toe: -60 }],
    hold: true,
    draw: () => ({ back: [box(134, 152, 42, 16, 'art-pad-fill', 3)], front: [] }),
  },
  'gs-chest': {
    poses: [{ hip: [122, 98], lean: 6, hand: [104, 52], hand2: [134, 116], foot: [144, 160], foot2: [98, 160], leg2: -1, arm: 1, arm2: 1 }],
    hold: true,
    draw: () => ({ back: [frame([106, 16], [106, G - 2], 8), frame([92, 16], [120, 16], 6)], front: [] }),
  },
  'gs-lat': {
    poses: [{ hip: [114, 98], lean: -14, hand: [90, 26], hand2: [124, 112], foot: [122, 160], foot2: [100, 160], leg2: -1, arm: -1, arm2: 1 }],
    hold: true,
    draw: () => ({ back: [], front: [] }),
  },
  'gs-glute': {
    poses: [{ hip: [114, 150], sh: [64, 154], head: [44, 154], hand: [122, 120], foot: [136, 110], foot2: [152, 156], leg: -1, leg2: -1, arm: -1, toe: -40 }],
    hold: true,
    draw: () => ({ back: [pad([24, 165], [204, 165], 6)], front: [] }),
  },
  'cs-calf': {
    poses: [{ hip: [114, 102], lean: 22, hand: [168, 76], foot: [142, 160], foot2: [68, 160], leg: -1, leg2: 1, arm: 1, toe2: 0 }],
    hold: true,
    draw: () => ({ back: [frame([172, 24], [172, G - 2], 8)], front: [] }),
  },
  'cs-hip': {
    poses: [{ hip: [118, 114], lean: 2, hand: [140, 118], foot: [156, 158], foot2: [70, 158], leg: -1, leg2: 1, arm: 1, toe2: 85 }],
    hold: true,
    draw: () => ({ back: [pad([46, 165], [190, 165], 6)], front: [] }),
  },

  /* ---------- Custom exercise placeholders ---------- */

  'custom-weight': {
    poses: [
      { hip: [112, 98], lean: 0, hand: [126, 126], hand2: [98, 118], foot: [118, 160], foot2: [100, 160], arm: -1 },
      { hip: [112, 98], lean: 0, hand: [130, 82], hand2: [98, 118], foot: [118, 160], foot2: [100, 160], arm: -1 },
    ],
    hold: true,
    draw: () => ({ back: [], front: [] }),
    extra: p => dumbbell(add(p.ha, [2, 0]), 0, 20),
  },
  'custom-reps': {
    poses: [{ hip: [108, 98], lean: 4, hand: [138, 86], foot: [116, 160], foot2: [98, 160], arm: 1 }],
    hold: true,
    draw: () => ({ back: [], front: [] }),
  },
  'custom-time': {
    poses: [{ hip: [96, 140], lean: 79, hand: [166, 158], foot: [30, 155], arm: 1, toe: 80 }],
    hold: true,
    draw: () => ({ back: [pad([18, 165], [200, 165], 6)], front: [] }),
  },
};

const BEND_DEFAULTS = { arm: 1, leg: -1 };

function mixPose(a: PoseInput, b: PoseInput, t: number): PoseInput {
  const out: PoseInput = { ...b };
  for (const k of ['hip', 'sh', 'head', 'hand', 'foot', 'hand2', 'foot2'] as const) {
    const av = a[k];
    const bv = b[k];
    if (av && bv) out[k] = [av[0] + (bv[0] - av[0]) * t, av[1] + (bv[1] - av[1]) * t];
  }
  for (const k of ['lean', 'toe', 'toe2'] as const) {
    out[k] = (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * t;
  }
  for (const k of ['arm', 'leg'] as const) {
    out[k] = (a[k] ?? BEND_DEFAULTS[k]) + ((b[k] ?? BEND_DEFAULTS[k]) - (a[k] ?? BEND_DEFAULTS[k])) * t;
  }
  for (const k of ['arm2', 'leg2'] as const) {
    const av = a[k];
    const bv = b[k];
    if (av != null && bv != null) out[k] = av + (bv - av) * t;
  }
  return out;
}

export function panelSpecs(
  id: string,
  t: number,
  { kind, label, showArrow }: { kind?: string; label?: string; showArrow?: boolean } = {},
): SvgSpec[] {
  const scene = sceneFor(id, kind);
  if (!scene) return [];
  const [first, last = first] = scene.poses;
  const p = solve(mixPose(first, last, t));
  const { back, front } = scene.draw(p, t);
  const items: SvgSpec[] = [
    box(0, 0, 240, 180, 'art-bg', 12),
    ln([8, G], [232, G], 'art-floor', 1.5),
    ...back,
    ...figure(p),
    ...front,
    ...arm(p),
    ...(scene.extra ? scene.extra(p) : []),
  ];
  if (showArrow && scene.arrow) {
    const [a, b] = scene.arrow;
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const wing = (d: number) => add(b, [Math.cos(angle + d), Math.sin(angle + d)], -9);
    items.push(
      spec('polyline', { points: `${wing(0.55).join(',')} ${b.join(',')} ${wing(-0.55).join(',')}`, class: 'art-arrow' }),
      spec('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'art-arrow' }),
    );
  }
  if (label) {
    items.push(spec('text', { x: 12, y: 20, class: 'art-label' }, label));
  }
  return items;
}

const sceneFor = (id: string, kind?: string): SceneDef | null =>
  SCENES[id] || (/^custom-/.test(id) ? SCENES[`custom-${kind || 'reps'}`] || SCENES['custom-reps'] : null);

export const hasArt = (id: string, kind?: string): boolean => Boolean(sceneFor(id, kind));

export const isHoldScene = (id: string, kind?: string): boolean => Boolean(sceneFor(id, kind)?.hold);

export function thumbSpecs(id: string, { kind, at = 1 }: { kind?: string; at?: number } = {}): SvgSpec[] {
  const scene = sceneFor(id, kind);
  if (!scene) return [];
  return panelSpecs(id, scene.hold ? 0 : at, { kind });
}

/* ---------- Muscle diagram ---------- */

const MUSCLE_PARTS: Record<string, SvgSpec[]> = {
  'Legs and glutes': [
    spec('rect', { x: 10.5, y: 20, width: 11, height: 4.5, rx: 2, class: 'muscle-hit' }),
    spec('line', { x1: 12.2, y1: 24.5, x2: 11.2, y2: 31.5, class: 'muscle-hit-limb', 'stroke-width': 4.2 }),
    spec('line', { x1: 19.8, y1: 24.5, x2: 20.8, y2: 31.5, class: 'muscle-hit-limb', 'stroke-width': 4.2 }),
  ],
  'Chest, shoulders, triceps': [
    spec('rect', { x: 10.5, y: 10.5, width: 11, height: 5.5, rx: 2, class: 'muscle-hit' }),
    spec('circle', { cx: 8.8, cy: 12, r: 2.4, class: 'muscle-hit' }),
    spec('circle', { cx: 23.2, cy: 12, r: 2.4, class: 'muscle-hit' }),
    spec('line', { x1: 7.8, y1: 13.5, x2: 6.5, y2: 18.5, class: 'muscle-hit-limb', 'stroke-width': 3.2 }),
    spec('line', { x1: 24.2, y1: 13.5, x2: 25.5, y2: 18.5, class: 'muscle-hit-limb', 'stroke-width': 3.2 }),
  ],
  Back: [spec('polygon', { points: '9.5,10.5 22.5,10.5 20,19.5 12,19.5', class: 'muscle-hit' })],
  Hamstrings: [
    spec('line', { x1: 12.2, y1: 25, x2: 11.3, y2: 31.8, class: 'muscle-hit-limb', 'stroke-width': 4 }),
    spec('line', { x1: 19.8, y1: 25, x2: 20.7, y2: 31.8, class: 'muscle-hit-limb', 'stroke-width': 4 }),
  ],
  Core: [spec('rect', { x: 12, y: 15, width: 8, height: 6.5, rx: 1.8, class: 'muscle-hit' })],
  'Shoulders and triceps': [
    spec('circle', { cx: 8.8, cy: 12, r: 2.8, class: 'muscle-hit' }),
    spec('circle', { cx: 23.2, cy: 12, r: 2.8, class: 'muscle-hit' }),
    spec('line', { x1: 7.8, y1: 13.5, x2: 6.5, y2: 18.5, class: 'muscle-hit-limb', 'stroke-width': 3.5 }),
    spec('line', { x1: 24.2, y1: 13.5, x2: 25.5, y2: 18.5, class: 'muscle-hit-limb', 'stroke-width': 3.5 }),
  ],
  'Glutes and lower back': [
    spec('rect', { x: 11.5, y: 16.5, width: 9, height: 4, rx: 1.5, class: 'muscle-hit' }),
    spec('rect', { x: 10.5, y: 20, width: 11, height: 4.5, rx: 2, class: 'muscle-hit' }),
  ],
  Calves: [
    spec('line', { x1: 11.5, y1: 30, x2: 10.9, y2: 35.5, class: 'muscle-hit-limb', 'stroke-width': 4 }),
    spec('line', { x1: 20.5, y1: 30, x2: 21.1, y2: 35.5, class: 'muscle-hit-limb', 'stroke-width': 4 }),
  ],
  'Your exercise': [spec('rect', { x: 11.5, y: 11.5, width: 9, height: 9, rx: 2, class: 'muscle-hit' })],
};

const MUSCLE_BASE: SvgSpec[] = [
  spec('circle', { cx: 16, cy: 5, r: 3.2, class: 'muscle-base-fill' }),
  spec('rect', { x: 10.5, y: 10, width: 11, height: 12.5, rx: 2.5, class: 'muscle-base-fill' }),
  spec('line', { x1: 8.5, y1: 11.8, x2: 5.8, y2: 21.5, class: 'muscle-base', 'stroke-width': 2.8 }),
  spec('line', { x1: 23.5, y1: 11.8, x2: 26.2, y2: 21.5, class: 'muscle-base', 'stroke-width': 2.8 }),
  spec('line', { x1: 12.5, y1: 22.5, x2: 10.8, y2: 37, class: 'muscle-base', 'stroke-width': 3.4 }),
  spec('line', { x1: 19.5, y1: 22.5, x2: 21.2, y2: 37, class: 'muscle-base', 'stroke-width': 3.4 }),
];

export function muscleMapSpecs(focus: string): SvgSpec[] {
  return [...MUSCLE_BASE, ...(MUSCLE_PARTS[focus] || MUSCLE_PARTS['Your exercise'])];
}

/* ---------- Animation ---------- */

const CUES: Record<string, [string, string]> = {
  'leg-press': ['Push out', 'Lower with control'],
  'chest-press': ['Press forward', 'Return with control'],
  'lat-pulldown': ['Pull down', 'Return with control'],
  'seated-row': ['Pull back', 'Return with control'],
  'leg-curl': ['Curl down', 'Return with control'],
  'hack-squat': ['Lower with control', 'Drive up'],
  'goblet-squat': ['Squat down with control', 'Stand up'],
  'step-up': ['Step up', 'Step down with control'],
  'db-bench': ['Press up', 'Lower with control'],
  'cable-press': ['Press forward', 'Return with control'],
  'incline-pushup': ['Push up', 'Lower with control'],
  'single-arm-pulldown': ['Pull down', 'Return with control'],
  'straight-arm-pulldown': ['Pull to your thighs', 'Return with control'],
  'band-pulldown': ['Pull down', 'Return with control'],
  'chest-supported-row': ['Pull back', 'Return with control'],
  'cable-row': ['Pull back', 'Return with control'],
  'db-row': ['Pull up', 'Lower with control'],
  'lying-curl': ['Curl up', 'Lower with control'],
  'romanian-deadlift': ['Hinge at the hips with control', 'Stand tall'],
  'glute-bridge': ['Lift your hips', 'Lower with control'],
  'smith-squat': ['Squat down with control', 'Stand up'],
  'split-squat': ['Lower with control', 'Drive up'],
  'smith-bench': ['Press up', 'Lower with control'],
  'db-floor-press': ['Press up', 'Lower to floor'],
  'assisted-pullup': ['Pull up', 'Lower with control'],
  'kneeling-pulldown': ['Pull down', 'Return with control'],
  'incline-db-row': ['Pull back', 'Lower with control'],
  'inverted-row': ['Pull chest to bar', 'Lower with control'],
  'standing-curl': ['Curl heel up', 'Lower with control'],
  'ball-curl': ['Roll ball in', 'Extend with control'],
  'incline-plank': ['Brace your core', 'Hold steady'],
  'side-plank': ['Lift hips in line', 'Keep core braced'],
  'dead-bug': ['Extend opposite limbs', 'Return slowly'],
  'bird-dog': ['Reach arm and leg', 'Return with control'],
  'pallof-press': ['Press straight out', 'Return with control'],
  'shoulder-press': ['Press overhead', 'Lower with control'],
  'seated-db-press': ['Press overhead', 'Lower with control'],
  'landmine-press': ['Press up and forward', 'Lower with control'],
  'cable-shoulder-press': ['Press overhead', 'Lower with control'],
  'back-extension': ['Extend to straight line', 'Hinge down slowly'],
  'cable-pull-through': ['Drive hips forward', 'Hinge back with control'],
  'hip-thrust-machine': ['Drive hips up', 'Lower with control'],
  'kb-deadlift': ['Hinge down with control', 'Stand tall'],
  'calf-raise': ['Press onto toes', 'Lower slowly'],
  'leg-press-calf': ['Press through toes', 'Lower slowly'],
  'standing-calf-raise': ['Raise onto toes', 'Lower slowly'],
  'gp-cardio': ['Walk at an easy pace', 'Keep shoulders relaxed'],
  'gp-legs': ['Swing forward', 'Swing back with control'],
  'cp-legs': ['Swing forward', 'Swing back with control'],
  'gp-hips': ['Circle hips forward', 'Circle hips back'],
  'gp-arms': ['Circle arms forward', 'Circle arms back'],
  'gp-squat': ['Squat down slowly', 'Stand tall'],
  'cp-ankle': ['Point toes down', 'Pull toes up'],
  'gs-walk': ['Walk at an easy pace', 'Steady breathing'],
  'cp-easy': ['Walk at an easy pace', 'Steady breathing'],
  'cs-slow': ['Slow your pace down', 'Steady breathing'],
};

const LOWER_FIRST = new Set([
  'hack-squat',
  'goblet-squat',
  'romanian-deadlift',
  'smith-squat',
  'split-squat',
  'kb-deadlift',
  'gp-squat',
]);

const FAST = 1000;
const PAUSE = 350;
const SLOW = 1900;
const RESET = 450;
const ease = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

export const hasAnimation = (id: string): boolean => Boolean(SCENES[id] && !SCENES[id].hold && CUES[id]);

export function momentOf(id: string, ms: number): { t: number; label: string } {
  const out = LOWER_FIRST.has(id) ? SLOW : FAST;
  const back = LOWER_FIRST.has(id) ? FAST : SLOW;
  const [go, ret] = CUES[id] || ['Move', 'Return'];
  const m = ms % (out + PAUSE + back + RESET);
  if (m < out) return { t: ease(m / out), label: go };
  if (m < out + PAUSE) return { t: 1, label: 'Pause' };
  if (m < out + PAUSE + back) return { t: 1 - ease((m - out - PAUSE) / back), label: ret };
  return { t: 0, label: 'Reset' };
}

/** Builds DOM SVG nodes safely using createElementNS + textContent (no innerHTML). */
export function renderSvgSpecs(container: Element, specs: SvgSpec[]): void {
  const doc = container.ownerDocument;
  const nodes = specs.map(s => {
    const el = doc.createElementNS('http://www.w3.org/2000/svg', s.tag);
    for (const [k, v] of Object.entries(s.attrs)) el.setAttribute(k, String(v));
    if (s.text != null) el.textContent = s.text;
    return el;
  });
  container.replaceChildren(...nodes);
}
