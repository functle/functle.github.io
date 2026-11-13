'use client';

/**
 * Game shell: holds the day's guesses, decides when the game is over, and
 * remembers both across reloads.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Graph from './components/Graph';
import GuessInput from './components/GuessInput';
import GuessRow from './components/GuessRow';
import TeX from './components/TeX';
import { formatCurve, latexCurve, sameCurve } from './lib/curve';
import { gradeGuess } from './lib/grade';
import { MAX_GUESSES } from './lib/puzzle';
import { buildShareText, copyToClipboard } from './lib/share';
import { loadDay, saveDay } from './lib/storage';
import type { Curve, GameStatus, Guess, Puzzle } from './lib/types';

interface AppProps {
  puzzle: Puzzle;
  /** Also use this as the React key to reset game state when switching puzzles. */
  storageKey: string;
  rulesAction?: ReactNode;
}

export default function App({ puzzle, storageKey, rulesAction }: AppProps) {
  const [guesses, setGuesses] = useState<Guess[]>(() =>
    loadDay(storageKey, puzzle.dateKey)
  );
  const [copied, setCopied] = useState(false);
  // Indices of guesses hidden from the graph. View state only, so not saved.
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const endRef = useRef<HTMLDivElement>(null);

  const status: GameStatus = guesses.some((g) => g.grade.won)
    ? 'won'
    : guesses.length >= MAX_GUESSES
      ? 'lost'
      : 'playing';

  useEffect(() => {
    saveDay(storageKey, puzzle.dateKey, guesses);
  }, [storageKey, puzzle.dateKey, guesses]);

  // Move focus to the outcome when the game ends, so a keyboard or screen
  // reader user is told rather than left in a disabled text box.
  useEffect(() => {
    if (status !== 'playing') endRef.current?.focus();
  }, [status]);

  function handleGuess(raw: string, curve: Curve): string | null {
    if (guesses.some((g) => sameCurve(g.curve, curve))) {
      return `You already tried ${formatCurve(curve)}.`;
    }

    setGuesses((prev) => [
      ...prev,
      { raw, curve, grade: gradeGuess(curve, puzzle.answer) },
    ]);
    return null;
  }

  async function handleShare() {
    const text = buildShareText(puzzle.number, guesses, status === 'won');
    const ok = await copyToClipboard(text);
    setCopied(ok);
    if (!ok) window.prompt('Copy your result:', text);
  }

  const remaining = MAX_GUESSES - guesses.length;

  return (
    <main className="page">
      <header className="masthead">
        <h1 className="masthead__title">Functle</h1>
        {/* The type is deliberately not named: working it out from the graph
            is part of the puzzle, and each guess row reports it. */}
        <p className="masthead__sub">
          Puzzle {puzzle.number} · Read the curve, guess the function
        </p>
      </header>

      <Graph
        curve={puzzle.answer}
        ghosts={guesses.map((g, i) => (hidden.has(i) ? null : g.curve))}
      />

      {status === 'playing' ? (
        <GuessInput
          disabled={false}
          nextIndex={guesses.length}
          onGuess={handleGuess}
        />
      ) : (
        <div className="outcome" tabIndex={-1} ref={endRef}>
          <p className="outcome__verdict">
            {status === 'won'
              ? `Solved in ${guesses.length}.`
              : 'Out of guesses.'}
          </p>
          <p className="outcome__answer">
            <TeX source={latexCurve(puzzle.answer)} />
          </p>
          <button className="outcome__share" type="button" onClick={handleShare}>
            {copied ? 'Copied' : 'Copy result'}
          </button>
          <p className="outcome__next">A new curve arrives at midnight.</p>
        </div>
      )}

      {guesses.length > 0 && (
        <>
          <ol className="guesses">
            {/* The index is what pairs a row with its curve: Graph draws
                ghosts in this same order, so both sides call guessStyle(i)
                and land on the same colour. */}
            {guesses.map((guess, i) => (
              <GuessRow
                key={i}
                guess={guess}
                index={i}
                shown={!hidden.has(i)}
                onToggle={() =>
                  setHidden((prev) => {
                    const next = new Set(prev);
                    if (!next.delete(i)) next.add(i);
                    return next;
                  })
                }
              />
            ))}
          </ol>
          {status === 'playing' && (
            <p className="tally" aria-live="polite">
              {remaining} {remaining === 1 ? 'guess' : 'guesses'} left
            </p>
          )}
        </>
      )}

      <footer className="game-footer">
        <details className="rules">
          <summary>How it works</summary>
          {/* One line each, so the tall fraction gets a line to itself instead
              of pushing a sentence apart mid-way. */}
          <ul className="rules__lines">
            <li>Guess the function on the graph in 6 tries.</li>
            <li>It is either a polynomial or a rational function.</li>
            <li>Green means a number is right. ↑ or ↓ shows which way to move it.</li>
          </ul>
        </details>
        {rulesAction && <div className="game-footer__action">{rulesAction}</div>}
      </footer>
    </main>
  );
}
