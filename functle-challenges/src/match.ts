import { formatCurve, sameCurve } from '../../src/lib/curve';
import { gradeGuess } from '../../src/lib/grade';
import { parseCurve } from '../../src/lib/parse';
import { curveBranches, describeCurve, SCALE } from '../../src/lib/plot';
import { answerForSeed, isPlayable, MAX_GUESSES, VIEW_LIMIT } from '../../src/lib/puzzle';
import type { Curve, Guess } from '../../src/lib/types';

export const LOBBY_MS = 15 * 60_000;
export const COUNTDOWN_MS = 3_000;
export const MATCH_MS = 5 * 60_000;
export const RESULT_MS = 24 * 60 * 60_000;

type Attempt = Guess & { id: string };
export type Seat = { number: number; name: string; hash: string; ready: boolean; guesses?: Attempt[] };
type Result = { reason: 'solved' | 'forfeit' | 'timeout' | 'exhausted'; winner: number | null };
type Round = { startsAt: number; endsAt: number; answer?: Curve; result?: Result; rematch?: number[] };
// Rooms created by the original lobby have neither a round nor guess histories.
export type Room = { seats: Seat[]; expiresAt: number; round?: Round; previousAnswer?: Curve };

export function phase(room: Room) {
	if (!room.round) return 'waiting';
	if (room.round.result) return 'finished';
	return room.round.answer ? 'playing' : 'countdown';
}

export function nextAlarm(room: Room) {
	const round = room.round;
	if (!round || round.result) return room.expiresAt;
	return round.answer ? round.endsAt : round.startsAt;
}

export function startCountdown(room: Room, now: number) {
	const startsAt = now + COUNTDOWN_MS;
	room.round = { startsAt, endsAt: startsAt + MATCH_MS };
}

export function setRematch(room: Room, seat: Seat, startsAt: number, accept: boolean, now: number, bothOnline: boolean) {
	const round = room.round;
	if (!round?.result || round.startsAt !== startsAt || (accept && !bothOnline)) return false;
	const votes = new Set(round.rematch);
	if (votes.has(seat.number) === accept) return false;
	if (accept) votes.add(seat.number);
	else votes.delete(seat.number);
	round.rematch = [...votes];
	if (votes.size === 2) {
		room.previousAnswer = round.answer;
		for (const player of room.seats) {
			delete player.guesses;
			player.ready = true;
		}
		startCountdown(room, now);
	}
	return true;
}

// Older clients omitted the round timestamp. Their requests are valid only in the first game.
export function matchesRound(room: Room, startsAt?: number | null) {
	if (startsAt === undefined) return !room.previousAnswer;
	return startsAt === (room.round?.startsAt ?? null);
}

export function cancelCountdown(room: Room, now: number) {
	delete room.round;
	for (const seat of room.seats) seat.ready = false;
	room.expiresAt = now + LOBBY_MS;
}

function finish(room: Room, now: number, result: Result) {
	room.round!.result = result;
	room.expiresAt = now + RESULT_MS;
}

export function forfeit(room: Room, seat: Seat, now: number) {
	const opponent = room.seats.find((other) => other.number !== seat.number)!;
	finish(room, now, { reason: 'forfeit', winner: opponent.number });
}

// Run before every command and snapshot as well as on alarms. A late wake-up
// must never extend the original deadline or accept a guess after it.
export function advance(room: Room, now: number) {
	const round = room.round;
	if (!round || round.result || now < nextAlarm(room)) return false;
	if (!round.answer) {
		do { round.answer = answerForSeed(crypto.randomUUID()); }
		while (!isPlayable(round.answer) || (room.previousAnswer && sameCurve(round.answer, room.previousAnswer)));
	}
	if (now >= round.endsAt) finish(room, round.endsAt, { reason: 'timeout', winner: null });
	return true;
}

export function submit(room: Room, seat: Seat, id: string, raw: string, now: number) {
	const previous = seat.guesses?.find((guess) => guess.id === id);
	if (previous) return previous.raw === raw ? undefined : 'This submission ID was already used.';
	if (phase(room) !== 'playing') return 'The match is not accepting guesses.';
	const guesses = seat.guesses ??= [];
	if (guesses.length >= MAX_GUESSES) return 'You have used all six guesses.';
	const parsed = parseCurve(raw);
	if (!parsed.ok) return parsed.error;
	if (guesses.some((guess) => sameCurve(guess.curve, parsed.curve))) return 'You already guessed that function.';
	const grade = gradeGuess(parsed.curve, room.round!.answer!);
	guesses.push({ raw, curve: parsed.curve, grade, id });
	if (grade.won) finish(room, now, { reason: 'solved', winner: seat.number });
	else if (room.seats.every((player) => player.guesses?.length === MAX_GUESSES)) {
		finish(room, now, { reason: 'exhausted', winner: null });
	}
}

export function snapshot(room: Room, you: Seat, connected: (hash: string) => boolean, now: number) {
	const round = room.round;
	const answer = round?.answer;
	return {
		phase: phase(room), serverNow: now, startsAt: round?.startsAt, endsAt: round?.endsAt,
		rematch: round?.result ? round.rematch ?? [] : undefined,
		expiresAt: room.expiresAt, maxGuesses: MAX_GUESSES,
		players: room.seats.map((seat) => ({
			number: seat.number, name: seat.name, ready: seat.ready, connected: connected(seat.hash),
			used: seat.guesses?.length ?? 0,
			guesses: seat === you || round?.result ? (seat.guesses ?? []).map(({ raw, grade }) => ({ raw, grade })) : undefined,
		})),
		graph: answer ? {
			paths: curveBranches(answer), label: describeCurve(answer).replace("Today's", 'The'),
			limit: VIEW_LIMIT, scale: SCALE,
			guides: answer.kind === 'rational' ? [answer.h * SCALE, -answer.k * SCALE] : undefined,
		} : undefined,
		result: round?.result && answer ? { ...round.result, answer: formatCurve(answer) } : undefined,
	};
}
