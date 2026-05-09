// lib/seal/types.ts

export type SealState =
  | "filled"
  | "today"
  | "empty"
  | "future"
  | "freeze"
  | "pre-signup";

export interface KanjiEntry {
  kanji: string;
  romaji: string;
  meaning: string;
  themes: string[];
}

export interface SealEntry {
  date: string;            // 'YYYY-MM-DD'
  kanji: string;
  romaji: string;
  meaning: string;
  state: SealState;
  sealKanji: string;       // from daily_puzzles.skin_id → skins.seal_kanji
  elapsedSeconds?: number; // present when state='filled'
}

export interface YearSeries {
  year: number;
  todayIndex: number;       // 0..364
  seals: SealEntry[];       // length = 365 or 366 (leap)
}
