'use client';

import dynamic from 'next/dynamic';

// Date limits and saved progress follow the player's browser, as in daily play.
const ArchivePicker = dynamic(() => import('./archive-picker'), {
  ssr: false,
  loading: () => (
    <main className="page">
      <h1 className="masthead__title">Functle archive</h1>
      <p role="status">Loading past puzzles...</p>
      <noscript>Enable JavaScript to play Functle.</noscript>
    </main>
  ),
});

export default function ArchiveGame() {
  return <ArchivePicker />;
}
