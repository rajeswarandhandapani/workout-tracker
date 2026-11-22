export type EffortId = 'easy' | 'good' | 'hard' | 'max';
export type CardioType = 'walk' | 'cycle' | 'swim' | 'run' | 'gentle';
export type CustomKind = 'weight' | 'reps' | 'time';
export type MoveUnit = 'reps' | 'sec';
export type DayStatus = 'gym' | 'cardio' | 'both' | 'rest' | 'missed' | 'future' | 'open';

export interface SetEntry {
  weight: number | null;
  value: number | null;
  done: boolean;
}

export interface DayGym {
  sets: Record<string, SetEntry[]>;
  counts?: Record<string, number>;
  effort?: Record<string, EffortId>;
  skip?: string[];
  extra?: string[];
  swaps?: Record<string, string>;
}

export interface CardioEntry {
  id: string;
  type: CardioType;
  minutes: number;
  hr: number | null;
  talk: boolean;
}

export interface WorkoutDay {
  date: string;
  gym?: DayGym;
  steps?: Record<string, boolean>;
  cardio?: CardioEntry[];
  rest?: boolean;
  note?: string;
}

export interface CustomMoveDef {
  id: string;
  name: string;
  kind: CustomKind;
}

export interface ReminderSettings {
  enabled: boolean;
  time: string;
  days: number[];
}

export interface WorkoutSettings {
  startDate: string | null;
  rest: number;
  beep: boolean;
  step: number;
  routine: string[] | null;
  custom: CustomMoveDef[];
  reminder: ReminderSettings;
}

export interface MoveDef {
  id: string;
  name: string;
  family?: string;
  focus: string;
  sets: number;
  low: number;
  high: number;
  unit: MoveUnit;
  weighted: boolean;
  assisted?: boolean;
  how?: string;
  video?: string;
  text?: string;
  slot?: string;
  optionalFamily?: boolean;
  fallback?: string;
  custom?: boolean;
  kind?: CustomKind;
}

export interface AlternateDef {
  id: string;
  name: string;
  how: string;
  weighted?: boolean;
  assisted?: boolean;
  unit?: MoveUnit;
  low?: number;
  high?: number;
  fallback?: string;
}

export interface FamilyDef extends MoveDef {
  alternates?: AlternateDef[];
}

export interface RoutineStep {
  id: string;
  text: string;
  detail: string;
  watch?: boolean;
  seconds?: number;
}

export interface RoutineDef {
  title: string;
  time: string;
  steps: RoutineStep[];
}

export interface WeekRow {
  week: number;
  monday: string;
  cardio: number;
  gym: number;
}

export interface LastPerformance {
  date: string;
  sets: SetEntry[];
  effort?: EffortId;
}

export interface NextSuggestion {
  action: 'increase' | 'hold' | 'decrease';
  weight: number | null;
  value: number;
  text: string;
}

export interface ExerciseHistoryPoint {
  date: string;
  value: number;
  sets: SetEntry[];
}
