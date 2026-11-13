'use client';

import { useState } from 'react';
import App from '../App';
import { puzzleFor } from '../lib/puzzle';

export default function DailyPuzzle() {
  // Keep the same local day's puzzle until reload, even across midnight.
  // The daily page loads this component only in the browser.
  const [puzzle] = useState(() => puzzleFor());
  const storageKey = `functle:${puzzle.dateKey}`;

  return <App key={storageKey} puzzle={puzzle} storageKey={storageKey} />;
}
