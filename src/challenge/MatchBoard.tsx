import { useEffect, useRef, useState } from 'react';
import { CurvePlot, type PlotData } from '../components/Graph';
import GameRules from '../components/GameRules';
import GuessInput from '../components/GuessInput';
import GuessRow from '../components/GuessRow';
import TeX from '../components/TeX';
import { formatCurve, latexCurve, sameCurve } from '../lib/curve';
import { parseCurve } from '../lib/parse';
import { buildShareText, copyToClipboard } from '../lib/share';
import type { Grade, Guess } from '../lib/types';

interface Player {
  number: number;
  name: string;
  connected: boolean;
  guesses?: { raw: string; grade: Grade }[];
}

export interface BoardProps {
  view: {
    graph: PlotData;
    players: Player[];
    maxGuesses: number;
    startsAt: number;
    rematch?: number[];
    result?: { answer: string };
  };
  you: number;
  verdict: string;
  disabled: boolean;
  online: boolean;
  onRematch: (accept: boolean) => void;
  onGuess: (raw: string) => Promise<string | null>;
}

function history(player: Player): Guess[] {
  return (player.guesses ?? []).map(({ raw, grade }) => {
    const parsed = parseCurve(raw);
    if (!parsed.ok) throw new Error('Could not display the saved guess.');
    return { raw, grade, curve: parsed.curve };
  });
}

export default function MatchBoard({ view, you, verdict, disabled, onGuess, online, onRematch }: BoardProps) {
  const [toggles, setToggles] = useState<Set<number>>(() => new Set());
  const [copied, setCopied] = useState(false);
  const outcome = useRef<HTMLDivElement>(null);
  const finished = Boolean(view.result);
  useEffect(() => { if (finished) outcome.current?.focus(); }, [finished]);

  const me = view.players.find(player => player.number === you)!;
  const opponent = view.players.find(player => player.number !== you)!;
  const requested = view.rematch?.includes(you) ?? false;
  const offered = view.rematch?.includes(opponent.number) ?? false;
  const guesses = history(me);
  const remaining = view.maxGuesses - guesses.length;
  const otherGuesses = finished ? history(opponent) : [];
  const answer = view.result && parseCurve(view.result.answer);
  // Reserve six graph slots per player so toggling a curve never shifts row colours.
  const ghosts = Array.from({ length: view.maxGuesses }, (_, i) =>
    toggles.has(i) ? null : guesses[i]?.curve ?? null
  ).concat(otherGuesses.map((g, i) => toggles.has(i + view.maxGuesses) ? g.curve : null));

  function rows(items: Guess[], own: boolean) {
    return (
      <ol className="guesses">
        {items.map((guess, i) => {
          const slot = own ? i : view.maxGuesses + i;
          return <GuessRow key={i} guess={guess} index={i} shown={own !== toggles.has(slot)}
            onToggle={() => setToggles(prev => {
              const next = new Set(prev);
              if (!next.delete(slot)) next.add(slot);
              return next;
            })} />;
        })}
      </ol>
    );
  }

  async function share() {
    const text = verdict + '\n' + buildShareText('1v1', guesses, guesses.some(guess => guess.grade.won));
    const ok = await copyToClipboard(text);
    setCopied(ok);
    if (!ok) window.prompt('Copy your result:', text);
  }

  return <>
    <CurvePlot plot={view.graph} ghosts={ghosts} />
    {finished ? (
      <div className="outcome" tabIndex={-1} ref={outcome}>
        <p className="outcome__verdict">{verdict}</p>
        <p className="outcome__answer">{answer?.ok ? <TeX source={latexCurve(answer.curve)} /> : view.result?.answer}</p>
        <div className="result-actions">
          {view.rematch && (
            <button type="button" className="outcome__share" disabled={!online || (!requested && !opponent.connected)}
              onClick={() => onRematch(!requested)}>
              {requested ? 'Cancel rematch' : offered ? 'Accept rematch' : 'Rematch'}
            </button>
          )}
          <button type="button" className="outcome__share" onClick={share}>{copied ? 'Copied' : 'Copy result'}</button>
        </div>
        {view.rematch && <p className="outcome__next" role="status">
          {!opponent.connected ? `${opponent.name} is offline.`
            : requested ? `Waiting for ${opponent.name} to accept.` : offered ? `${opponent.name} wants a rematch.` : ''}
        </p>}
      </div>
    ) : remaining > 0 ? (
      <GuessInput disabled={disabled} nextIndex={guesses.length} onGuess={(raw, curve) =>
        guesses.some(guess => sameCurve(guess.curve, curve)) ? `You already tried ${formatCurve(curve)}.` : onGuess(raw)
      } />
    ) : <p className="tally" role="status">All six guesses used. Waiting for your opponent.</p>}
    {finished && <h3>Your guesses ({guesses.length})</h3>}
    {guesses.length > 0 && rows(guesses, true)}
    {!finished && remaining > 0 && guesses.length > 0 && (
      <p className="tally" aria-live="polite">{remaining} {remaining === 1 ? 'guess' : 'guesses'} left</p>
    )}
    {finished && <>
      <h3>{opponent.name}’s guesses ({otherGuesses.length})</h3>
      {otherGuesses.length > 0 && rows(otherGuesses, false)}
    </>}
    <footer className="game-footer"><GameRules /></footer>
  </>;
}

