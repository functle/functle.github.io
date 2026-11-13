'use client';

import dynamic from 'next/dynamic';

// The puzzle follows the player's local date and restores browser storage.
// Mount it only in the browser so neither is evaluated during prerendering.
const DailyPuzzle = dynamic(() => import('./daily-puzzle'), {
  ssr: false,
  loading: () => (
    <main className="page">
      <header className="masthead">
        <h1 className="masthead__title">Functle</h1>
        <p className="masthead__sub" role="status">Loading your daily puzzle...</p>
      </header>
      <noscript>Enable JavaScript to play Functle.</noscript>
    </main>
  ),
});

export default function DailyGame() {
  return <DailyPuzzle />;
}
