import { afterEach, expect, it, vi } from 'vitest';
import { ChallengeRoom } from '../src/room';
import { EMPTY_ROOM_MS, LOBBY_MS, type Room } from '../src/match';

vi.mock('cloudflare:workers', () => ({
	DurableObject: class {
		constructor(readonly ctx: DurableObjectState) {}
	},
}));

afterEach(() => vi.useRealTimers());

function fixture() {
	vi.useFakeTimers();
	vi.setSystemTime(0);
	const values = new Map<string, Room>();
	const sockets = new Map<WebSocket, string>();
	const setAlarm = vi.fn().mockResolvedValue(undefined);
	const ctx = {
		storage: {
			kv: {
				get: (key: string) => structuredClone(values.get(key)),
				put: (key: string, room: Room) => values.set(key, structuredClone(room)),
			},
			setAlarm,
			deleteAll: () => values.clear(),
		},
		getWebSockets: (tag?: string) => [...sockets.keys()].filter(s => !tag || sockets.get(s) === tag),
		getTags: (s: WebSocket) => [sockets.get(s)],
		waitUntil: vi.fn(),
	};
	const load = () => new ChallengeRoom(ctx as unknown as DurableObjectState, {} as Env);
	const room = load();
	function connectSeat(tag: string) {
		const socket = { readyState: WebSocket.OPEN, send: vi.fn(), close: vi.fn() } as unknown as WebSocket;
		sockets.set(socket, tag);
		room.webSocketMessage(socket, 'unready');
		return socket;
	}
	function disconnect(socket: WebSocket) {
		room.webSocketClose(socket);
		sockets.delete(socket);
	}
	return { room, load, setAlarm, values, connectSeat, disconnect };
}

it('keeps a vacated invite joinable for one minute and deletes the room at the deadline', async () => {
	const { room, load, connectSeat, setAlarm, values } = fixture();
	await room.create('Host', 'host');
	connectSeat('host');
	vi.setSystemTime(1000);
	expect(room.leave('host')).toBe('left');
	expect(setAlarm).toHaveBeenLastCalledWith(1000 + EMPTY_ROOM_MS);
	vi.setSystemTime(1000 + EMPTY_ROOM_MS - 1);
	expect(load().inspect('host')).toEqual({ status: 'join' });
	expect(await room.create('Another host', 'other')).toBe(false);
	vi.setSystemTime(1000 + EMPTY_ROOM_MS);
	expect(load().join('Late player', 'late')).toBe('expired');
	await load().alarm();
	expect(values.size).toBe(0);
});

it('counts every open player tab and restarts the grace period after a return', async () => {
	const { room, connectSeat, disconnect, setAlarm } = fixture();
	await room.create('Host', 'host');
	const first = connectSeat('host');
	const otherTab = connectSeat('host');
	room.join('Friend', 'friend');
	const friend = connectSeat('friend');
	disconnect(first);
	disconnect(friend);
	expect(setAlarm).toHaveBeenLastCalledWith(LOBBY_MS);
	vi.setSystemTime(1000);
	disconnect(otherTab);
	expect(setAlarm).toHaveBeenLastCalledWith(1000 + EMPTY_ROOM_MS);
	vi.setSystemTime(EMPTY_ROOM_MS);
	const returned = connectSeat('friend');
	await room.alarm(); // A stale alarm must respect the new presence.
	vi.setSystemTime(1000 + EMPTY_ROOM_MS);
	expect(room.inspect('friend')).toMatchObject({ status: 'member' });
	disconnect(returned);
	expect(setAlarm).toHaveBeenLastCalledWith(1000 + EMPTY_ROOM_MS * 2);
});

it('allows a new seat to join just before expiry and establish its connection', async () => {
	const { room, connectSeat, setAlarm } = fixture();
	await room.create('Host', 'host');
	connectSeat('host');
	room.leave('host');
	vi.setSystemTime(EMPTY_ROOM_MS - 1);
	expect(room.join('Returned', 'new-seat')).toBe('joined');
	vi.setSystemTime(EMPTY_ROOM_MS + 1);
	connectSeat('new-seat');
	expect(room.inspect('new-seat')).toMatchObject({ status: 'member', you: 1 });
	expect(room.inspect('host')).toEqual({ status: 'join' });
	expect(setAlarm).toHaveBeenLastCalledWith(LOBBY_MS);
});

it('honours a match deadline during the empty minute without extending the cleanup timer', async () => {
	const { room, values, setAlarm } = fixture();
	values.set('lobby', {
		seats: [], expiresAt: LOBBY_MS, emptyExpiresAt: EMPTY_ROOM_MS,
		round: { startsAt: 0, endsAt: 10_000, answer: { kind: 'quadratic', a: 1, b: 2, c: 3 } },
	});
	vi.setSystemTime(10_000);
	await room.alarm();
	expect(values.get('lobby')?.round?.result?.reason).toBe('timeout');
	expect(setAlarm).toHaveBeenLastCalledWith(EMPTY_ROOM_MS);
	vi.setSystemTime(EMPTY_ROOM_MS);
	await room.alarm();
	expect(values.size).toBe(0);
});
