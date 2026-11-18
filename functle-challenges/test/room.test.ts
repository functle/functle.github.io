import { expect, it, vi } from 'vitest';
import { ChallengeRoom } from '../src/room';
import { LOBBY_MS } from '../src/match';

vi.mock('cloudflare:workers', () => ({
	DurableObject: class {
		constructor(readonly ctx: DurableObjectState) {}
	},
}));

it('releases the last seat while keeping the invite valid until the original expiry', async () => {
	vi.useFakeTimers();
	try {
		const created = Date.now();
		const values = new Map();
		const ctx = {
			storage: {
				kv: { get: values.get.bind(values), put: values.set.bind(values), delete: values.delete.bind(values) },
				setAlarm: vi.fn().mockResolvedValue(undefined),
			},
			getWebSockets: () => [],
			waitUntil: vi.fn(),
		};
		const room = new ChallengeRoom(ctx as unknown as DurableObjectState, {} as Env);
		expect(await room.create('Host', 'original-seat')).toBe(true);
		vi.setSystemTime(created + 60_000);
		expect(room.leave('original-seat')).toBe('left');
		expect(room.inspect('original-seat')).toEqual({ status: 'join' });
		expect(await room.create('Another host', 'other-seat')).toBe(false);
		expect(room.join('Returning player', 'new-seat')).toBe('joined');
		expect(room.inspect('new-seat')).toMatchObject({ status: 'member', you: 1 });
		expect(room.inspect('original-seat')).toEqual({ status: 'join' });
		vi.setSystemTime(created + LOBBY_MS);
		expect(room.inspect('new-seat')).toBeNull();
		expect(room.join('Late player', 'late-seat')).toBe('expired');
	} finally {
		vi.useRealTimers();
	}
});
