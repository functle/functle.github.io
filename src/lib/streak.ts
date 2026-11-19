import { daysBetween } from './puzzle';
import { loadDay } from './storage';
import type { GameStatus } from './types';

export interface Streak {
  current: number;
  best: number;
}

/** History through yesterday. The open puzzle's live verdict is applied separately. */
export function loadPriorStreak(puzzleDate: string): Streak {
  const wins: string[] = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      const date = key?.match(/^functle:(\d{4}-\d{2}-\d{2})$/)?.[1];
      if (!key || !date || date >= puzzleDate) continue;
      if (loadDay(key, date).some((guess) => guess?.grade?.won === true)) wins.push(date);
    }
  } catch {
    // Browser storage can be unavailable even when the current game is playable.
    return { current: 0, best: 0 };
  }

  let previous: string | undefined;
  let run = 0;
  let best = 0;
  for (const date of wins.sort()) {
    run = previous && daysBetween(previous, date) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  const current = previous && daysBetween(previous, puzzleDate) === 1 ? run : 0;
  return { current, best };
}

export function streakForResult(prior: Streak, status: GameStatus): Streak {
  if (status === 'playing') return prior;
  const current = status === 'won' ? prior.current + 1 : 0;
  return { current, best: Math.max(prior.best, current) };
}
