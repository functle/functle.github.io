'use client';

import { useState } from 'react';
import App from '../App';
import { puzzleFor } from '../lib/puzzle';
import { gameStorageKey } from '../lib/storage';

export default function DailyPuzzle() {
  // Keep the same local day's puzzle until reload, even across midnight.
  // The daily page loads this component only in the browser.
  const [puzzle] = useState(() => puzzleFor());
  const storageKey = gameStorageKey('daily', puzzle.dateKey);

  return <App key={storageKey} puzzle={puzzle} storageKey={storageKey} />;
}
