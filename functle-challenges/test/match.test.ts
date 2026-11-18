import { describe, expect, it } from 'vitest';
import { advance, cancelCountdown, COUNTDOWN_MS, forfeit, matchesRound, MATCH_MS, nextAlarm, phase, RESULT_MS, setRematch, snapshot, startCountdown, submit, type Room } from '../src/match';

function lobby(): Room {
	return { expiresAt: 900_000, seats: [1, 2].map((number) => ({ number, name: 'Player ' + number, hash: 'seat-' + number, ready: true })) };
}

function playing() {
	const room = lobby();
	room.round = { startsAt: 0, endsAt: MATCH_MS, answer: { kind: 'quadratic', a: 1, b: 0, c: 0 } };
	return room;
}

describe('two-player matches', () => {
	it('keeps the result until both players accept, then starts a fresh match in their original seats', () => {
		const room = playing();
		const [one, two] = room.seats;
		expect(setRematch(room, one, 0, true, 1, true)).toBe(false);
		submit(room, one, 'miss', '0', 2);
		submit(room, two, 'win', 'x^2', 3);
		const previous = structuredClone(room.round!.answer);
		expect(setRematch(room, one, 0, true, 4, true)).toBe(true);
		expect(setRematch(room, one, 0, true, 5, true)).toBe(false);
		const view = snapshot(room, two, () => true, 5);
		expect(view.rematch).toEqual([1]);
		expect(view.result?.winner).toBe(2);
		expect(view.players[0].used).toBe(1);
		expect(setRematch(room, two, 0, true, 6, true)).toBe(true);
		const start = 6 + COUNTDOWN_MS;
		expect(phase(room)).toBe('countdown');
		expect(room.round?.endsAt).toBe(start + MATCH_MS);
		expect(setRematch(room, two, 0, true, 7, true)).toBe(false);
		expect(matchesRound(room, 0)).toBe(false);
		expect(matchesRound(room)).toBe(false);
		expect(matchesRound(room, start)).toBe(true);
		advance(room, start);
		expect(room.round?.answer).not.toEqual(previous);
		expect(room.seats.map(s => s.hash)).toEqual(['seat-1', 'seat-2']);
		expect(snapshot(room, one, () => true, start).players.map(p => p.used)).toEqual([0, 0]);
		expect(submit(room, two, 'next', '1', start)).toBeUndefined();
	});

	it('lets a player withdraw and rejects offline or outdated rematch requests', () => {
		const room = playing();
		advance(room, MATCH_MS);
		const [one, two] = room.seats;
		setRematch(room, one, 0, true, MATCH_MS, true);
		setRematch(room, one, 0, false, MATCH_MS, false);
		expect(setRematch(room, two, 0, true, MATCH_MS, false)).toBe(false);
		expect(setRematch(room, two, 1, true, MATCH_MS, true)).toBe(false);
		expect(room.round?.rematch).toEqual([]);
		expect(room.round?.result?.reason).toBe('timeout');
	});

	it('starts on the scheduled boundary, including after storage is reloaded', () => {
		const room = lobby();
		startCountdown(room, 1000);
		const start = nextAlarm(room);
		expect(start).toBe(1000 + COUNTDOWN_MS);
		expect(advance(room, start - 1)).toBe(false);
		expect(submit(room, room.seats[0], 'early', 'x', start - 1)).toContain('not accepting');
		expect(snapshot(room, room.seats[0], () => true, start - 1).graph).toBeUndefined();
		const restored = structuredClone(room);
		expect(advance(restored, start)).toBe(true);
		expect(phase(restored)).toBe('playing');
		expect(nextAlarm(restored)).toBe(start + MATCH_MS);
	});

	it('withdraws both ready flags when a countdown is cancelled', () => {
		const room = lobby();
		startCountdown(room, 0);
		cancelCountdown(room, 20);
		expect(room.seats.every((seat) => !seat.ready)).toBe(true);
		expect(advance(room, COUNTDOWN_MS)).toBe(false);
		expect(phase(room)).toBe('waiting');
	});

	it('rejects invalid and equivalent guesses and keeps the histories private until a win', () => {
		const room = playing();
		const [first, second] = room.seats;
		expect(submit(room, first, 'invalid', 'oops', 1)).toBeTruthy();
		expect(submit(room, first, 'one', 'x+x', 2)).toBeUndefined();
		expect(submit(room, first, 'duplicate', '2x', 3)).toContain('already');
		expect(submit(room, first, 'one', 'x+x', 3)).toBeUndefined();
		const view = snapshot(room, second, () => true, 3);
		expect(view.players[0].used).toBe(1);
		expect(view.players[0].guesses).toBeUndefined();
		expect(JSON.stringify(view)).not.toMatch(/"hash"|"answer"|"raw"/);
		expect(submit(room, second, 'win', 'x^2', 4)).toBeUndefined();
		expect(submit(room, first, 'late', 'x^2', 4)).toContain('not accepting');
		expect(submit(room, second, 'win', 'x^2', 5)).toBeUndefined();
		const result = snapshot(room, second, () => false, 6);
		expect(result.result).toMatchObject({ winner: 2, reason: 'solved' });
		expect(result.players[0].guesses?.[0].raw).toBe('x+x');
	});

	it('allows the other seat to play after the first runs out', () => {
		const room = playing();
		for (const seat of room.seats) {
			for (let i = 0; i < 6; i++) expect(submit(room, seat, String(i), String(i), i)).toBeUndefined();
			if (seat.number === 1) {
				expect(phase(room)).toBe('playing');
				expect(submit(room, seat, 'extra', 'x^2', 7)).toContain('all six');
			}
		}
		expect(room.round?.result).toEqual({ winner: null, reason: 'exhausted' });
	});

	it('draws exactly at the deadline and retains the result for one day', () => {
		const room = playing();
		expect(advance(room, MATCH_MS - 1)).toBe(false);
		expect(advance(room, MATCH_MS)).toBe(true);
		expect(submit(room, room.seats[0], 'late', 'x^2', MATCH_MS)).toContain('not accepting');
		expect(room.round?.result).toEqual({ winner: null, reason: 'timeout' });
		expect(nextAlarm(room)).toBe(MATCH_MS + RESULT_MS);
	});

	it('does not restart a missed round or overwrite a forfeit on a late alarm', () => {
		const missed = lobby();
		startCountdown(missed, 0);
		advance(missed, 2 * MATCH_MS);
		expect(missed.round?.result?.reason).toBe('timeout');
		const room = playing();
		forfeit(room, room.seats[0], 15);
		expect(advance(room, MATCH_MS)).toBe(false);
		expect(room.round?.result).toEqual({ winner: 2, reason: 'forfeit' });
	});
});
