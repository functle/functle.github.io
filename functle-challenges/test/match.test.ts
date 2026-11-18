import { describe, expect, it } from 'vitest';
import { advance, cancelCountdown, COUNTDOWN_MS, forfeit, MATCH_MS, nextAlarm, phase, RESULT_MS, snapshot, startCountdown, submit, type Room } from '../src/match';

function lobby(): Room {
	return { expiresAt: 900_000, seats: [1, 2].map((number) => ({ number, name: 'Player ' + number, hash: 'seat-' + number, ready: true })) };
}

function playing() {
	const room = lobby();
	room.round = { startsAt: 0, endsAt: MATCH_MS, answer: { kind: 'quadratic', a: 1, b: 0, c: 0 } };
	return room;
}

describe('two-player matches', () => {
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
