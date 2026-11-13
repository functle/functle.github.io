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
    <>
      <nav className="game-nav" aria-label="Game modes">
        <Link href="/archive">Play the archive</Link>
      </nav>
      <App key={storageKey} puzzle={puzzle} storageKey={storageKey} />
    </>
  );
}
