'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import App from '../App';
import { puzzleFor } from '../lib/puzzle';
import { gameStorageKey } from '../lib/storage';
import { loadPriorStreak } from '../lib/streak';

export default function DailyPuzzle() {
  // Keep the same local day's puzzle until reload, even across midnight.
  // The daily page loads this component only in the browser.
  const [puzzle] = useState(() => puzzleFor());
  const storageKey = gameStorageKey('daily', puzzle.dateKey);
  const [priorStreak, setPriorStreak] = useState(() => loadPriorStreak(puzzle.dateKey));

  useEffect(() => {
    // Yesterday's puzzle may still be open and solved in another tab.
    function refreshHistory(event: StorageEvent) {
      if (event.key === null || (event.key.startsWith('functle:') && event.key < storageKey)) {
        setPriorStreak(loadPriorStreak(puzzle.dateKey));
      }
    }
    window.addEventListener('storage', refreshHistory);
    return () => window.removeEventListener('storage', refreshHistory);
  }, [puzzle.dateKey, storageKey]);

  return (
    <App
      key={storageKey}
      puzzle={puzzle}
      storageKey={storageKey}
      priorStreak={priorStreak}
      puzzleNavigation={
        <nav className="daily-navigation" aria-label="Play modes">
          <a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/challenge/`}>
            Challenge a friend
          </a>
          <Link href="/archive">Play the archive</Link>
        </nav>
      }
    />
  );
}
