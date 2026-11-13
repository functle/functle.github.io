import { describe, expect, it } from 'vitest';
import { archiveDateRange, parseArchiveDate } from './archive';
import { dateKey, puzzleFor } from './puzzle';

const today = new Date(2026, 10, 13, 0, 15);

describe('archive dates', () => {
  it('allows the first puzzle and yesterday, using the local calendar', () => {
    expect(archiveDateRange(today)).toEqual({ min: '2026-09-01', max: '2026-11-12' });
    const first = parseArchiveDate('2026-09-01', today)!;
    const yesterday = parseArchiveDate('2026-11-12', today)!;
    expect(dateKey(first)).toBe('2026-09-01');
    expect(puzzleFor(first).number).toBe(1);
    expect(yesterday.getFullYear()).toBe(2026);
    expect(yesterday.getMonth()).toBe(10);
    expect(yesterday.getDate()).toBe(12);
    expect(yesterday.getHours()).toBe(0);
  });

  it.each(['', '2026-9-1', 'not-a-date', '2026-09-31', '2026-10-32',
    '2026-08-31', '2026-11-13', '2026-11-14', '2027-01-01'])('rejects unavailable or invalid date %j', (value) => {
    expect(parseArchiveDate(value, today)).toBeNull();
  });

  it('handles month, year, and daylight-saving boundaries', () => {
    expect(archiveDateRange(new Date(2026, 10, 1)).max).toBe('2026-10-31');
    expect(archiveDateRange(new Date(2026, 10, 2)).max).toBe('2026-11-01');
    expect(archiveDateRange(new Date(2027, 0, 1)).max).toBe('2026-12-31');
  });

  it('offers no archive dates on or before the first puzzle', () => {
    const firstDay = new Date(2026, 8, 1);
    expect(archiveDateRange(firstDay).max).toBe('2026-08-31');
    expect(parseArchiveDate('2026-09-01', firstDay)).toBeNull();
  });
});
