import { describe, expect, it } from 'vitest';
import { adjacentArchiveDate, archiveDateRange, archiveUrlForDate, parseArchiveDate } from './archive';
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

describe('archive URLs', () => {
  it.each(['/archive', '/archive/', '/functle/archive/'])(
    'keeps the deployed path %s when selecting a date', (path) => {
      expect(archiveUrlForDate(`https://example.com${path}`, '2026-11-12'))
        .toBe(`${path}?date=2026-11-12`);
    }
  );

  it('replaces the selected date while preserving other URL details', () => {
    const url = archiveUrlForDate(
      'https://example.com/functle/archive/?source=friend&date=2026-11-11#game',
      '2026-11-12'
    );
    expect(url).toBe('/functle/archive/?source=friend&date=2026-11-12#game');
    const parsedDate = parseArchiveDate(new URL(url, 'https://example.com').searchParams.get('date')!, today)!;
    expect(dateKey(parsedDate)).toBe('2026-11-12');
    expect(puzzleFor(parsedDate)).toEqual(puzzleFor(new Date(2026, 10, 12)));
  });

  it('replaces repeated date parameters with a single selected date', () => {
    expect(archiveUrlForDate('https://example.com/archive?date=bad&date=2026-11-11', '2026-11-12'))
      .toBe('/archive?date=2026-11-12');
  });
});

describe('archive navigation', () => {
  it('stops at the first puzzle and yesterday', () => {
    expect(adjacentArchiveDate('2026-09-01', -1, today)).toBeNull();
    expect(adjacentArchiveDate('2026-09-01', 1, today)).toBe('2026-09-02');
    expect(adjacentArchiveDate('2026-11-12', 1, today)).toBeNull();
    expect(adjacentArchiveDate('2026-11-12', -1, today)).toBe('2026-11-11');
  });

  it('moves by calendar days across month and daylight-saving boundaries', () => {
    expect(adjacentArchiveDate('2026-10-01', -1, today)).toBe('2026-09-30');
    expect(adjacentArchiveDate('2026-10-31', 1, today)).toBe('2026-11-01');
    expect(adjacentArchiveDate('2026-11-01', 1, today)).toBe('2026-11-02');
    expect(adjacentArchiveDate('2026-11-02', -1, today)).toBe('2026-11-01');
  });

  it('moves across the year boundary', () => {
    const january = new Date(2027, 0, 3);
    expect(adjacentArchiveDate('2026-12-31', 1, january)).toBe('2027-01-01');
    expect(adjacentArchiveDate('2027-01-01', -1, january)).toBe('2026-12-31');
  });

  it('does not navigate from invalid or unavailable dates', () => {
    expect(adjacentArchiveDate('2026-09-31', 1, today)).toBeNull();
    expect(adjacentArchiveDate('2026-11-13', -1, today)).toBeNull();
  });
});
