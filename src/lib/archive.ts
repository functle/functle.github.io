import { dateKey, FIRST_PUZZLE_DATE } from './puzzle';

export function archiveDateRange(when: Date = new Date()) {
  const yesterday = new Date(when.getFullYear(), when.getMonth(), when.getDate() - 1);
  return { min: FIRST_PUZZLE_DATE, max: dateKey(yesterday) };
}

/** Parse a past puzzle date using local calendar parts, without a UTC shift. */
export function parseArchiveDate(value: string, when: Date = new Date()): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  // Reject normalized dates such as September 31, which becomes October 1.
  if (dateKey(date) !== value) return null;
  const { min, max } = archiveDateRange(when);
  return value >= min && value <= max ? date : null;
}

/** Keep the deployed base path, other query parameters, and fragment intact. */
export function archiveUrlForDate(href: string, dateKey: string): string {
  const url = new URL(href);
  url.searchParams.set('date', dateKey);
  return `${url.pathname}${url.search}${url.hash}`;
}
