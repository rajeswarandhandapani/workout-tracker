// Dates, totals and backup checks. No page access here, so all of it can be unit tested.

import {
  addDays,
  daysBetween,
  fromIso,
  localToday,
  mondayOf,
  nextMonday,
  toIso,
  weekDates,
  weekdayOf,
} from '../kit/dates';
import { makeCalendar as makeKitCalendar, reminderDue as kitReminderDue } from '../kit/ics';
import type {
  CardioEntry,
  CardioType,
  CustomKind,
  CustomMoveDef,
  DayGym,
  DayStatus,
  EffortId,
  ExerciseHistoryPoint,
  LastPerformance,
  MoveDef,
  NextSuggestion,
  ReminderSettings,
  SetEntry,
  WeekRow,
  WorkoutDay,
  WorkoutSettings,
} from './models';
import {
  CARDIO_GOAL,
  CARDIO_TYPES,
  CUSTOM_KINDS,
  EFFORTS,
  MAX_SETS,
  SCHEDULE,
  STEP_IDS,
  WEEKS,
  WEIGHT_STEPS,
  lookupMove,
  sameFamily,
} from './plan';

export { addDays, daysBetween, fromIso, localToday, mondayOf, nextMonday, toIso, weekDates, weekdayOf };

/** Week 1 is the Monday-to-Sunday week holding the start date. Earlier dates give 0 or less. */
export const programWeek = (iso: string, start: string): number =>
  Math.floor(daysBetween(mondayOf(start), iso) / 7) + 1;

export const num = (text: string | number | null | undefined): number | null => {
  const n = Number.parseFloat(String(text ?? ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const doneIn = (list: Array<SetEntry | null | undefined> | undefined): SetEntry[] =>
  (list || []).filter((s): s is SetEntry => Boolean(s && s.done));

export const setsDone = (day: Partial<WorkoutDay> | undefined): number =>
  Object.values(day?.gym?.sets || {}).reduce((n, list) => n + doneIn(list).length, 0);

export const cardioOf = (day: Partial<WorkoutDay> | undefined): CardioEntry[] => day?.cardio || [];

export const moderateMinutes = (day: Partial<WorkoutDay> | undefined): number =>
  cardioOf(day)
    .filter(c => c.type !== 'gentle')
    .reduce((n, c) => n + c.minutes, 0);

/** The exercises for a day: the routine, this day's changes, and anything already logged that day. */
export function dayExerciseIds(day: Partial<WorkoutDay> | undefined, routine: string[]): string[] {
  const gym = day?.gym;
  const skip = gym?.skip || [];
  const ids = [...routine.filter(id => !skip.includes(id)), ...(gym?.extra || [])];
  const slotOfSwap = Object.fromEntries(
    Object.entries(gym?.swaps || {}).map(([slot, move]) => [move, slot]),
  );
  for (const [id, list] of Object.entries(gym?.sets || {})) {
    if (doneIn(list).length) ids.push(slotOfSwap[id] || id);
  }
  return [...new Set(ids)];
}

export const isEmptyDay = (day: Partial<WorkoutDay> | undefined): boolean =>
  !setsDone(day) &&
  !Object.keys(day?.gym?.swaps || {}).length &&
  !Object.keys(day?.steps || {}).length &&
  !(day?.gym?.skip || []).length &&
  !(day?.gym?.extra || []).length &&
  !cardioOf(day).length &&
  !day?.rest &&
  !(day?.note || '').trim();

/** What a calendar cell shows: gym, cardio, both, rest, missed, future or open. */
export function statusOf(
  day: Partial<WorkoutDay> | undefined,
  iso: string,
  { today, start }: { today: string; start: string | null },
): DayStatus {
  const gym = setsDone(day) > 0;
  const cardio = cardioOf(day).length > 0;
  if (gym && cardio) return 'both';
  if (gym) return 'gym';
  if (cardio) return 'cardio';
  if (day?.rest) return 'rest';
  if (iso > today) return 'future';
  if (iso < today && start && iso >= start && !SCHEDULE[weekdayOf(iso)].optional) return 'missed';
  return 'open';
}

export function weekSummary(days: Record<string, WorkoutDay>, monday: string): { cardio: number; gym: number } {
  const dates = weekDates(monday);
  return {
    cardio: dates.reduce((n, d) => n + moderateMinutes(days[d]), 0),
    gym: dates.filter(d => setsDone(days[d]) > 0).length,
  };
}

export function programRows(days: Record<string, WorkoutDay>, start: string, count = WEEKS): WeekRow[] {
  const first = mondayOf(start);
  const latest = Object.keys(days)
    .filter(d => !isEmptyDay(days[d]))
    .sort()
    .pop();
  const total = Math.max(count, latest ? programWeek(latest, start) : 0);
  return Array.from({ length: total }, (_, i) => {
    const monday = addDays(first, i * 7);
    return { week: i + 1, monday, ...weekSummary(days, monday) };
  });
}

export function programTotals(rows: WeekRow[]): { gym: number; cardio: number; goalWeeks: number } {
  return {
    gym: rows.reduce((n, r) => n + r.gym, 0),
    cardio: rows.reduce((n, r) => n + r.cardio, 0),
    goalWeeks: rows.filter(r => r.cardio >= CARDIO_GOAL).length,
  };
}

/** The most recent day before `before` with this exercise done. Used to pre-fill the next session. */
export function lastPerformance(
  days: Record<string, WorkoutDay>,
  id: string,
  before: string,
): LastPerformance | null {
  const dates = Object.keys(days)
    .filter(d => d < before)
    .sort()
    .reverse();
  for (const date of dates) {
    const sets = doneIn(days[date].gym?.sets?.[id]);
    if (sets.length) return { date, sets, effort: days[date].gym?.effort?.[id] };
  }
  return null;
}

/**
 * What to do next session, from the last session's sets and effort rating. Reps go up first and
 * weight second, and weight only rises once every set reached the top of the range.
 */
export function suggestNext(
  ex: MoveDef,
  last: { effort?: EffortId; sets?: SetEntry[] } | null | undefined,
  { week = 99, step = 5 }: { week?: number; step?: number } = {},
): NextSuggestion | null {
  if (!last?.effort || !last.sets?.length) return null;
  const { effort, sets } = last;
  const lowest = Math.min(...sets.map(s => s.value ?? 0));
  const atTop = sets.length >= ex.sets && lowest >= ex.high;

  if (!ex.weighted) {
    const bump = ex.unit === 'sec' ? 5 : 1;
    const say = (action: NextSuggestion['action'], value: number, text?: string): NextSuggestion => ({
      action,
      weight: null,
      value,
      text: text || `Aim for ${value} ${ex.unit}.`,
    });
    if (effort === 'max') {
      return say('decrease', Math.max(ex.low, lowest - 2 * bump), `Aim for ${Math.max(ex.low, lowest - 2 * bump)} ${ex.unit} with solid form.`);
    }
    if (effort === 'hard') return say('hold', lowest, `Stay at ${lowest} ${ex.unit} until it feels steadier.`);
    if (lowest >= ex.high) {
      return say('hold', ex.high, 'You are at the top of the range. Slow the movement down to make it harder.');
    }
    return say('increase', Math.min(ex.high, lowest + (effort === 'easy' ? 2 : 1) * bump));
  }

  const weight = sets[sets.length - 1].weight;
  if (weight == null || weight <= 0) return null;
  const lighter = Math.max(step, Math.floor((weight * 0.9) / step) * step);
  const harder = Math.max(step, weight - step);
  const easier = Math.max(weight + step, Math.ceil((weight * 1.1) / step) * step);
  const hold = (value: number, text: string): NextSuggestion => ({ action: 'hold', weight, value, text });
  const drop = (text: string): NextSuggestion =>
    ex.assisted
      ? { action: 'decrease', weight: easier, value: ex.low, text }
      : lighter < weight
        ? { action: 'decrease', weight: lighter, value: ex.low, text }
        : hold(ex.low, `Stay at ${weight} lb and keep every rep controlled.`);
  const raise = (): NextSuggestion =>
    ex.assisted
      ? harder < weight
        ? { action: 'increase', weight: harder, value: ex.low, text: `Try ${harder} lb assistance for ${ex.low} reps if every rep feels controlled.` }
        : hold(ex.high, `Stay at ${weight} lb and keep every rep controlled.`)
      : { action: 'increase', weight: weight + step, value: ex.low, text: `Try ${weight + step} lb for ${ex.low} reps if every rep feels controlled.` };

  if (effort === 'max') {
    return drop(
      ex.assisted
        ? `Increase assistance to ${easier} lb and keep every rep controlled.`
        : `Drop to ${lighter} lb and keep every rep controlled.`,
    );
  }
  if (effort === 'hard') {
    return lowest < ex.low
      ? drop(
          ex.assisted
            ? `Increase assistance to ${easier} lb so you can reach ${ex.low} reps.`
            : `Drop to ${lighter} lb so you can reach ${ex.low} reps.`,
        )
      : hold(lowest, `Stay at ${weight} lb until it feels steadier.`);
  }
  if (atTop) {
    if (effort === 'good' && week < 3) {
      return hold(ex.high, `Weeks 1–2 are for technique, so stay at ${weight} lb.`);
    }
    return raise();
  }
  const value = effort === 'easy' ? ex.high : Math.min(ex.high, lowest + 1);
  return hold(value, `Stay at ${weight} lb and aim for ${value} reps.`);
}

/** How many set rows to show: today's choice, else at least the plan and what was done last time. */
export function setCountFor(day: Partial<WorkoutDay> | undefined, ex: MoveDef, last: LastPerformance | null): number {
  const chosen = day?.gym?.counts?.[ex.id];
  const saved = day?.gym?.sets?.[ex.id] || [];
  const lastTicked = saved.reduce((n, s, i) => (s?.done ? i + 1 : n), 0);
  return Math.min(MAX_SETS, Math.max(chosen ?? Math.max(ex.sets, last?.sets.length ?? 0), lastTicked));
}

/** True when every set reached the top of the range last time. Plank is timed, so it never asks. */
export const readyToIncrease = (last: { sets?: SetEntry[] } | null | undefined, ex: MoveDef): boolean =>
  Boolean(
    ex.weighted &&
      last &&
      last.sets &&
      last.sets.length >= ex.sets &&
      (last.sets[last.sets.length - 1].weight ?? 0) > (ex.assisted ? 5 : 0) &&
      last.sets.every(s => (s.value ?? 0) >= ex.high),
  );

export function lastCardio(days: Record<string, WorkoutDay>, before: string): CardioEntry | null {
  const dates = Object.keys(days)
    .filter(d => d < before)
    .sort()
    .reverse();
  for (const date of dates) {
    const entries = cardioOf(days[date]).filter(c => c.type !== 'gentle');
    if (entries.length) return entries[entries.length - 1];
  }
  return null;
}

/** One point per session: the heaviest weight, or longest hold for timed exercises. */
export function exerciseHistory(days: Record<string, WorkoutDay>, ex: MoveDef): ExerciseHistoryPoint[] {
  return Object.keys(days)
    .sort()
    .flatMap(date => {
      const sets = doneIn(days[date].gym?.sets?.[ex.id]);
      const values = sets
        .map(s => (ex.weighted ? s.weight : s.value))
        .filter((v): v is number => v != null);
      return values.length ? [{ date, value: Math.max(...values), sets }] : [];
    });
}

const APP = 'workout-tracker';
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const NOT_BACKUP = 'That file is not a Workout Tracker backup.';
const cleanNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

export const DEFAULT_REMINDER: ReminderSettings = {
  enabled: false,
  time: '16:00',
  days: [1, 2, 3, 4, 5, 6],
};
const KIND_LABEL: Record<string, string> = { gym: 'Gym day', cardio: 'Cardio day', rest: 'Rest day' };

export function planDone(date: string, day: Partial<WorkoutDay> | undefined): boolean {
  const plan = SCHEDULE[weekdayOf(date)];
  return Boolean(
    (plan.kind === 'gym' && setsDone(day) > 0) ||
      (plan.kind === 'cardio' && cardioOf(day).length > 0) ||
      (plan.kind === 'rest' && (day?.rest || cardioOf(day).length > 0)),
  );
}

export function reminderFor(date: string): { kind: string; title: string; body: string } {
  const plan = SCHEDULE[weekdayOf(date)];
  const label = KIND_LABEL[plan.kind] || 'Workout';
  return {
    kind: plan.kind,
    title: `${label}: ${plan.title}`,
    body: `${plan.time} · Open Workout Tracker to log today's session.`,
  };
}

export function reminderDue({
  reminder,
  date,
  nowTime,
  day,
  lastSent,
}: {
  reminder: Partial<ReminderSettings> | null | undefined;
  date: string;
  nowTime: string;
  day: Partial<WorkoutDay> | undefined;
  lastSent: string | null | undefined;
}): boolean {
  if (day?.rest || planDone(date, day)) return false;
  return kitReminderDue({
    reminder: reminder
      ? {
          enabled: reminder.enabled,
          time: reminder.time,
          days: Array.isArray(reminder.days) ? reminder.days : DEFAULT_REMINDER.days,
        }
      : null,
    date,
    nowTime,
    isDone: false,
    lastSent: lastSent ?? null,
  });
}

export function makeCalendar({
  startDate,
  reminder = DEFAULT_REMINDER,
  today,
}: {
  startDate?: string | null;
  reminder?: Partial<ReminderSettings> | null;
  today: string;
}): string {
  const base = ISO.test(startDate ?? '') ? (startDate as string) : today;
  const firstMonday = mondayOf(base);
  const time = TIME.test(reminder?.time ?? '') ? (reminder?.time as string) : DEFAULT_REMINDER.time;
  const days = Array.isArray(reminder?.days) ? reminder.days : DEFAULT_REMINDER.days;
  return makeKitCalendar({
    prodId: '-//Workout Tracker//EN',
    uidPrefix: 'workout-tracker',
    startDate: firstMonday,
    today,
    time,
    durationMin: 40,
    days,
    weeks: WEEKS,
    eventFor: iso => {
      const info = reminderFor(iso);
      return { title: info.title, body: info.body };
    },
  });
}

function cleanSet(s: unknown): SetEntry {
  const raw = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
  return {
    weight: cleanNumber(raw['weight']),
    value: cleanNumber(raw['value']),
    done: raw['done'] === true,
  };
}

function cleanDay(rawObj: Record<string, unknown>, known: (id: string) => unknown): WorkoutDay {
  const day: WorkoutDay = { date: String(rawObj['date']) };
  const rawGym = rawObj['gym'];
  if (rawGym && typeof rawGym === 'object' && !Array.isArray(rawGym)) {
    const g = rawGym as Record<string, unknown>;
    const sets: Record<string, SetEntry[]> = {};
    const rawSets = (g['sets'] && typeof g['sets'] === 'object' ? g['sets'] : {}) as Record<string, unknown>;
    for (const [id, list] of Object.entries(rawSets)) {
      if (known(id) && Array.isArray(list)) sets[id] = list.slice(0, MAX_SETS).map(cleanSet);
    }
    const gym: DayGym = { sets };
    const rawCounts = (g['counts'] && typeof g['counts'] === 'object' ? g['counts'] : {}) as Record<string, unknown>;
    const counts = Object.fromEntries(
      Object.entries(rawCounts).filter(
        ([id, n]) => known(id) && typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_SETS,
      ),
    ) as Record<string, number>;
    if (Object.keys(counts).length) gym.counts = counts;

    const ratings = EFFORTS.map(e => e.id as string);
    const rawEffort = (g['effort'] && typeof g['effort'] === 'object' ? g['effort'] : {}) as Record<string, unknown>;
    const effort = Object.fromEntries(
      Object.entries(rawEffort).filter(([id, val]) => known(id) && typeof val === 'string' && ratings.includes(val)),
    ) as Record<string, EffortId>;
    if (Object.keys(effort).length) gym.effort = effort;

    for (const key of ['skip', 'extra'] as const) {
      const rawArr = g[key];
      const ids = Array.isArray(rawArr) ? rawArr.filter((id): id is string => typeof id === 'string' && Boolean(known(id))) : [];
      if (ids.length) gym[key] = ids;
    }

    const rawSwaps = (g['swaps'] && typeof g['swaps'] === 'object' ? g['swaps'] : {}) as Record<string, unknown>;
    const swaps = Object.fromEntries(
      Object.entries(rawSwaps).filter(
        ([slot, move]) => typeof move === 'string' && sameFamily(slot, move),
      ),
    ) as Record<string, string>;
    if (Object.keys(swaps).length) gym.swaps = swaps;
    day.gym = gym;
  }

  const rawSteps = rawObj['steps'];
  if (rawSteps && typeof rawSteps === 'object' && !Array.isArray(rawSteps)) {
    const stepMap = rawSteps as Record<string, unknown>;
    const ticked = STEP_IDS.filter(id => stepMap[id] === true);
    if (ticked.length) day.steps = Object.fromEntries(ticked.map(id => [id, true]));
  }

  if (Array.isArray(rawObj['cardio'])) {
    const types = CARDIO_TYPES.map(t => t[0] as string);
    const entries: CardioEntry[] = [];
    for (const c of rawObj['cardio']) {
      if (!c || typeof c !== 'object') continue;
      const cr = c as Record<string, unknown>;
      const ctype = cr['type'];
      const mins = cleanNumber(cr['minutes']);
      if (typeof ctype === 'string' && types.includes(ctype) && mins != null && mins > 0) {
        entries.push({
          id: String(cr['id'] ?? `${day.date}-${ctype}-${mins}`),
          type: ctype as CardioType,
          minutes: mins,
          hr: cleanNumber(cr['hr']),
          talk: cr['talk'] === true,
        });
      }
    }
    if (entries.length) day.cardio = entries;
  }

  if (rawObj['rest'] === true) day.rest = true;
  if (typeof rawObj['note'] === 'string' && rawObj['note']) day.note = rawObj['note'].slice(0, 2000);
  return day;
}

function cleanCustom(list: unknown): CustomMoveDef[] {
  if (!Array.isArray(list)) return [];
  const kinds = CUSTOM_KINDS.map(k => k[0] as string);
  const out: CustomMoveDef[] = [];
  for (const m of list) {
    if (!m || typeof m !== 'object') continue;
    const mr = m as Record<string, unknown>;
    const id = typeof mr['id'] === 'string' ? mr['id'] : '';
    const name = typeof mr['name'] === 'string' ? mr['name'] : '';
    const kind = typeof mr['kind'] === 'string' ? mr['kind'] : '';
    if (/^custom-[\w-]+$/.test(id) && name.trim() && kinds.includes(kind)) {
      out.push({ id, name: name.trim().slice(0, 60), kind: kind as CustomKind });
      if (out.length >= 100) break;
    }
  }
  return out;
}

export function cleanSettings(raw: unknown): Partial<WorkoutSettings> {
  const out: Partial<WorkoutSettings> = {};
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  const custom = cleanCustom(r['custom']);
  if (custom.length) out.custom = custom;
  if (Array.isArray(r['routine'])) {
    out.routine = [...new Set(r['routine'])].filter(
      (id): id is string => typeof id === 'string' && Boolean(lookupMove(custom, id)),
    );
  }
  const sd = typeof r['startDate'] === 'string' ? r['startDate'] : '';
  if (ISO.test(sd)) out.startDate = sd;
  if (typeof r['rest'] === 'number' && [60, 75, 90].includes(r['rest'])) out.rest = r['rest'];
  if (typeof r['step'] === 'number' && (WEIGHT_STEPS as readonly number[]).includes(r['step'])) {
    out.step = r['step'];
  }
  if (typeof r['beep'] === 'boolean') out.beep = r['beep'];
  const rem = r['reminder'];
  if (rem && typeof rem === 'object' && !Array.isArray(rem)) {
    const rm = rem as Record<string, unknown>;
    const days = Array.isArray(rm['days'])
      ? [...new Set(rm['days'].filter((d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6))]
      : [...DEFAULT_REMINDER.days];
    const tm = typeof rm['time'] === 'string' ? rm['time'] : '';
    out.reminder = {
      enabled: rm['enabled'] === true,
      time: TIME.test(tm) ? tm : DEFAULT_REMINDER.time,
      days,
    };
  }
  return out;
}

export const makeBackup = (
  days: WorkoutDay[],
  settings: Partial<WorkoutSettings>,
  exportedAt: string,
): string => JSON.stringify({ app: APP, version: 1, exportedAt, settings, days }, null, 1);

/** Reads a backup file, keeping only known fields. Throws a readable message if it can't be used. */
export function parseBackup(text: string): { settings: Partial<WorkoutSettings>; days: WorkoutDay[] } {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error(NOT_BACKUP);
  }
  if (!file || typeof file !== 'object') throw new Error(NOT_BACKUP);
  const f = file as Record<string, unknown>;
  if (f['app'] !== APP || !Array.isArray(f['days'])) throw new Error(NOT_BACKUP);
  const settings = cleanSettings(f['settings']);
  const known = (id: string) => lookupMove(settings.custom, id);
  const days = f['days']
    .filter((d): d is Record<string, unknown> => Boolean(d && typeof d === 'object' && ISO.test(String((d as Record<string, unknown>)['date'] ?? ''))))
    .map(d => cleanDay(d, known))
    .filter(d => !isEmptyDay(d));
  return { settings, days };
}
