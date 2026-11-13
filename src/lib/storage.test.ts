import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gradeGuess } from './grade';
import { gameStorageKey, loadDay, saveDay } from './storage';
import type { Guess } from './types';

const dateKey = '2026-11-12';
const dailyKey = gameStorageKey('daily', dateKey);
const archiveKey = gameStorageKey('archive', dateKey);
const curve = { kind: 'quadratic', a: 1, b: 2, c: 3 } as const;
const guess: Guess = {
  raw: 'x^2+2x+3',
  curve,
  grade: gradeGuess(curve, curve),
};

describe('game progress storage', () => {
  let saved: Map<string, string>;

  beforeEach(() => {
    saved = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => { saved.set(key, value); },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('restores an existing daily save without migrating or modifying it', () => {
    const legacySave = JSON.stringify({ version: 3, dateKey, guesses: [guess] });
    saved.set(`functle:${dateKey}`, legacySave);

    expect(loadDay(dailyKey, dateKey)).toEqual([guess]);
    expect(loadDay(archiveKey, dateKey)).toEqual([]);
    expect(saved.get(`functle:${dateKey}`)).toBe(legacySave);
    expect(saved.size).toBe(1);
  });

  it('keeps daily progress intact when archive progress is saved for the same day', () => {
    saveDay(dailyKey, dateKey, [guess]);
    const dailySave = saved.get(dailyKey);

    saveDay(archiveKey, dateKey, []);

    expect(saved.get(dailyKey)).toBe(dailySave);
    expect(loadDay(dailyKey, dateKey)).toEqual([guess]);
    expect(JSON.parse(saved.get(`functle:archive:${dateKey}`)!)).toEqual({
      version: 3, dateKey, guesses: [],
    });
  });

  it('keeps archive progress intact when daily progress changes', () => {
    saveDay(archiveKey, dateKey, [guess]);
    saveDay(dailyKey, dateKey, []);

    expect(loadDay(archiveKey, dateKey)).toEqual([guess]);
    expect(loadDay(dailyKey, dateKey)).toEqual([]);
  });

  it('restores each archive date independently when switching puzzles', () => {
    const otherDate = '2026-11-11';
    const otherKey = gameStorageKey('archive', otherDate);
    saveDay(archiveKey, dateKey, [guess]);
    expect(loadDay(otherKey, otherDate)).toEqual([]);
    saveDay(otherKey, otherDate, []);

    expect(loadDay(archiveKey, dateKey)).toEqual([guess]);
    expect(loadDay(otherKey, otherDate)).toEqual([]);
    expect(loadDay(archiveKey, otherDate)).toEqual([]);
  });

  it.each(['daily', 'archive'] as const)('restores %s guesses after a fresh module load', async (mode) => {
    const key = gameStorageKey(mode, dateKey);
    const wrongCurve = { kind: 'quadratic', a: 2, b: 0, c: 0 } as const;
    const guesses: Guess[] = [
      { raw: '2x^2', curve: wrongCurve, grade: gradeGuess(wrongCurve, curve) },
      guess,
    ];
    saveDay(key, dateKey, guesses);

    vi.resetModules();
    const freshStorage = await import('./storage');
    const restored = freshStorage.loadDay(key, dateKey);
    expect(restored).toEqual(guesses);
    expect(restored.some((item) => item.grade.won)).toBe(true);
  });

  it.each([
    'not JSON',
    'null',
    JSON.stringify({ version: 2, dateKey, guesses: [guess] }),
    JSON.stringify({ version: 3, dateKey: '2026-11-11', guesses: [guess] }),
    JSON.stringify({ version: 3, dateKey, guesses: {} }),
  ])('ignores an unreadable or incompatible save: %s', (raw) => {
    saved.set(archiveKey, raw);
    expect(loadDay(archiveKey, dateKey)).toEqual([]);
  });

  it('continues to tolerate unavailable browser storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage unavailable'); },
      setItem: () => { throw new Error('Storage unavailable'); },
    });

    expect(loadDay(dailyKey, dateKey)).toEqual([]);
    expect(() => saveDay(archiveKey, dateKey, [guess])).not.toThrow();
  });
});
