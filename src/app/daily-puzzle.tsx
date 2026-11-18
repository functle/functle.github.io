'use client';

import { useState } from 'react';
import Link from 'next/link';
import App from '../App';
import { puzzleFor } from '../lib/puzzle';
import { gameStorageKey } from '../lib/storage';

export default function DailyPuzzle() {
  // Keep the same local day's puzzle until reload, even across midnight.
  // The daily page loads this component only in the browser.
  const [puzzle] = useState(() => puzzleFor());
  const storageKey = gameStorageKey('daily', puzzle.dateKey);

  return (
    <App
      key={storageKey}
      puzzle={puzzle}
      storageKey={storageKey}
      puzzleNavigation={
        <a className="challenge-link" href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/challenge/`}>
          Challenge a friend (1v1)
        </a>
      }
      rulesAction={<Link href="/archive">Play the archive</Link>}
    />
  );
}
