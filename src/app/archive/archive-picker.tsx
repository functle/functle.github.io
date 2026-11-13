'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import App from '../../App';
import { archiveDateRange, archiveUrlForDate, parseArchiveDate } from '../../lib/archive';
import { puzzleFor } from '../../lib/puzzle';
import { gameStorageKey } from '../../lib/storage';
import type { Puzzle } from '../../lib/types';

export default function ArchivePicker() {
  const searchParams = useSearchParams();
  const requestedDate = searchParams.get('date');

  // Browser Back/Forward restores the picker and game from the URL together.
  return <ArchiveSelection key={requestedDate === null ? 'picker' : `date:${requestedDate}`} requestedDate={requestedDate} />;
}

function ArchiveSelection({ requestedDate }: { requestedDate: string | null }) {
  const [openedAt] = useState(() => new Date());
  const range = archiveDateRange(openedAt);
  const hasPuzzles = range.max >= range.min;
  const [puzzle] = useState<Puzzle | null>(() => {
    const selectedDate = requestedDate === null ? null : parseArchiveDate(requestedDate, openedAt);
    return selectedDate ? puzzleFor(selectedDate) : null;
  });
  const [date, setDate] = useState(puzzle?.dateKey ?? (hasPuzzles ? range.max : ''));
  const invalidDateMessage = `Choose a date from ${range.min} through ${range.max}.`;
  const [error, setError] = useState<string | null>(
    requestedDate !== null && !puzzle ? invalidDateMessage : null
  );

  function play(event: FormEvent) {
    event.preventDefault();
    const selectedDate = parseArchiveDate(date);
    if (!selectedDate) {
      setError(invalidDateMessage);
      return;
    }
    setError(null);
    const href = window.location.href;
    const archiveUrl = archiveUrlForDate(href, date);
    if (archiveUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.pushState(null, '', archiveUrl);
    }
  }

  const storageKey = puzzle ? gameStorageKey('archive', puzzle.dateKey) : '';

  return (
    <>
      <header className="page archive-picker">
        <h1 className="masthead__title">Functle archive</h1>
        <p><Link href="/">Back to today’s game</Link></p>
        {hasPuzzles ? (
          <form onSubmit={play} noValidate>
            <label className="entry__label" htmlFor="archive-date">Puzzle date</label>
            <div className="entry__row">
              <input
                className="entry__field"
                id="archive-date"
                type="date"
                min={range.min}
                max={range.max}
                value={date}
                required
                aria-invalid={error !== null}
                aria-describedby={error ? 'archive-range archive-error' : 'archive-range'}
                onChange={(event) => {
                  setDate(event.target.value);
                  setError(null);
                }}
              />
              <button className="entry__submit" type="submit">Play</button>
            </div>
            <p className="entry__note" id="archive-range">
              Available from <time dateTime={range.min}>{range.min}</time> through{' '}
              <time dateTime={range.max}>{range.max}</time> (yesterday).
            </p>
            {error && <p className="entry__note entry__note--problem" id="archive-error" role="alert">{error}</p>}
          </form>
        ) : <p>Past puzzles will be available after the first daily puzzle.</p>}
      </header>
      {puzzle ? (
        <App key={storageKey} puzzle={puzzle} storageKey={storageKey} />
      ) : (
        <main className="page archive-empty"><p>Choose a date and press Play to start.</p></main>
      )}
    </>
  );
}
