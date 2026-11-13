import type { Guess } from './types';

/** Daily keys retain the original format so existing progress is preserved. */
export function gameStorageKey(mode: 'daily' | 'archive', dateKey: string): string {
  return mode === 'daily' ? `functle:${dateKey}` : `functle:archive:${dateKey}`;
}

/**
 * Bumped if the saved shape ever changes, so old saves are discarded not
 * crashed. Version 2 added the curve family: a version 1 guess stored bare
 * coefficients and a grade of three named fields, neither of which the current
 * history row can render. Version 3 added the type verdict to each grade.
 */
const SAVE_VERSION = 3;

interface SavedDay {
  version: number;
  dateKey: string;
  guesses: Guess[];
}

export function loadDay(storageKey: string, dateKey: string): Guess[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedDay;
    if (parsed.version !== SAVE_VERSION || parsed.dateKey !== dateKey) return [];
    return Array.isArray(parsed.guesses) ? parsed.guesses : [];
  } catch {
    // Private-mode Safari throws on localStorage entirely. Losing progress is
    // an acceptable outcome; a blank page is not.
    return [];
  }
}

export function saveDay(storageKey: string, dateKey: string, guesses: Guess[]): void {
  try {
    const payload: SavedDay = { version: SAVE_VERSION, dateKey, guesses };
    localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    /* Not worth interrupting play over. */
  }
}
