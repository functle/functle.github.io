import { DurableObject } from 'cloudflare:workers';

import { advance, cancelCountdown, EMPTY_ROOM_MS, forfeit, LOBBY_MS, matchesRound, nextAlarm, phase, setRematch, snapshot, startCountdown, submit, type Room } from './match';

export class ChallengeRoom extends DurableObject<Env> {
	private current(now = Date.now()): Room | undefined {
		const room = this.ctx.storage.kv.get<Room>('lobby');
		if (!room || (room.emptyExpiresAt !== undefined && now >= room.emptyExpiresAt)) return;
		const changed = advance(room, now);
		if (now >= nextAlarm(room)) return;
		// Older stored rooms may already be empty when first seen after an upgrade.
		if (changed || (room.emptyExpiresAt === undefined && !this.occupied(room))) this.save(room);
		return room;
	}

	async create(name: string, hash: string) {
		if (this.ctx.storage.kv.get('lobby')) return false;
		const now = Date.now();
		const room: Room = { expiresAt: now + LOBBY_MS, emptyExpiresAt: now + EMPTY_ROOM_MS, seats: [{ name, hash, number: 1, ready: false }] };
		this.ctx.storage.kv.put('lobby', room);
		await this.ctx.storage.setAlarm(nextAlarm(room));
		return true;
	}

	join(name: string, hash: string) {
		const lobby = this.current();
		if (!lobby) return 'expired';
		if (lobby.seats.some((seat) => seat.hash === hash)) return 'joined';
		if (lobby.seats.length >= 2) return 'full';
		const number = lobby.seats.some((seat) => seat.number === 1) ? 2 : 1;
		lobby.seats.push({ name, hash, number, ready: false });
		// A new player has claimed a seat and is about to open its socket.
		if (lobby.emptyExpiresAt !== undefined) lobby.emptyExpiresAt = Date.now() + EMPTY_ROOM_MS;
		this.save(lobby);
		return 'joined';
	}

	leave(hash: string, startsAt?: number | null) {
		const now = Date.now();
		const lobby = this.current(now);
		const leaving = lobby?.seats.find((seat) => seat.hash === hash);
		if (!lobby || !leaving) return 'left';
		if (!matchesRound(lobby, startsAt)) return 'stale';
		if (phase(lobby) === 'playing') {
			forfeit(lobby, leaving, now);
			this.save(lobby);
			return 'finished';
		}
		if (phase(lobby) === 'finished') return 'finished';
		if (lobby.round) cancelCountdown(lobby, now);
		lobby.seats = lobby.seats.filter((seat) => seat.hash !== hash);
		for (const seat of lobby.seats) seat.ready = false;
		for (const socket of this.ctx.getWebSockets(hash)) socket.close(4001, 'Seat released');
		this.save(lobby);
		return 'left';
	}

	guess(hash: string, id: string, raw: string, startsAt?: number) {
		const now = Date.now();
		const room = this.current(now);
		if (!room) return { error: 'This room has expired.', status: 410 };
		const seat = room.seats.find((player) => player.hash === hash);
		if (!seat) return { error: 'Join the room first.', status: 403 };
		if (!matchesRound(room, startsAt)) return { error: 'This guess belongs to an earlier match.', status: 409 };
		const before = seat.guesses?.length ?? 0;
		const error = submit(room, seat, id, raw, now);
		if (error) return { error, status: 409 };
		if (seat.guesses?.length !== before) this.save(room);
		return { status: 200 };
	}

	inspect(hash: string) {
		const lobby = this.current();
		if (!lobby) return null;
		const seat = lobby.seats.find((player) => player.hash === hash);
		if (!seat) return { status: lobby.seats.length === 2 ? 'full' : 'join' };
		return { status: 'member', you: seat.number, ...snapshot(lobby, seat, (hash) => this.connected(hash), Date.now()) };
	}

	fetch(request: Request) {
		const hash = request.headers.get('X-Seat-Hash');
		const lobby = this.current();
		if (!lobby) return new Response('Room expired', { status: 410 });
		if (!hash || !lobby.seats.some((seat) => seat.hash === hash)) return new Response('Join first', { status: 403 });
		const [client, server] = Object.values(new WebSocketPair());
		this.ctx.acceptWebSocket(server, [hash]);
		if (lobby.emptyExpiresAt !== undefined) this.save(lobby);
		else this.broadcast(lobby);
		const headers = new Headers();
		if (request.headers.get('Sec-WebSocket-Protocol') === 'functle') headers.set('Sec-WebSocket-Protocol', 'functle');
		return new Response(null, { status: 101, webSocket: client, headers });
	}

	webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
		const lobby = this.current();
		if (!lobby) return socket.close(4000, 'Room expired');
		const [hash] = this.ctx.getTags(socket);
		const seat = lobby.seats.find((player) => player.hash === hash);
		const vote = typeof message === 'string' && /^(rematch|cancel-rematch):(\d+)$/.exec(message);
		if (seat && vote) {
			const bothOnline = lobby.seats.length === 2 && lobby.seats.every((player) => this.connected(player.hash));
			if (setRematch(lobby, seat, Number(vote[2]), vote[1] === 'rematch', Date.now(), bothOnline)) this.save(lobby);
			return;
		}
		if (!seat || (message !== 'ready' && message !== 'unready')) return socket.close(1008, 'Invalid lobby command');
		if (phase(lobby) === 'playing' || phase(lobby) === 'finished') return;
		seat.ready = message === 'ready';
		if (lobby.round && !seat.ready) cancelCountdown(lobby, Date.now());
		else if (!lobby.round && lobby.seats.length === 2 && lobby.seats.every((s) => s.ready && this.connected(s.hash))) {
			startCountdown(lobby, Date.now());
		}
		this.save(lobby);
	}

	webSocketClose(socket: WebSocket) {
		const lobby = this.current();
		if (!lobby) return;
		const [hash] = this.ctx.getTags(socket);
		const seat = lobby.seats.find((player) => player.hash === hash);
		if (seat && lobby.round?.result && !this.connected(hash, socket) &&
			setRematch(lobby, seat, lobby.round.startsAt, false, Date.now(), false)) {
			this.save(lobby, socket);
			return;
		}
		if (seat && !this.connected(hash, socket) && seat.ready && !lobby.round?.answer) {
			if (lobby.round) cancelCountdown(lobby, Date.now());
			else seat.ready = false;
			this.save(lobby, socket);
			return;
		}
		this.save(lobby, socket);
	}

	webSocketError(socket: WebSocket) {
		this.webSocketClose(socket);
	}

	async alarm() {
		const lobby = this.current();
		if (lobby) {
			await this.ctx.storage.setAlarm(nextAlarm(lobby));
			return;
		}
		for (const socket of this.ctx.getWebSockets()) socket.close(4000, 'Room expired');
		await this.ctx.storage.deleteAll();
	}

	private connected(hash: string, closing?: WebSocket) {
		return this.ctx.getWebSockets(hash).some((socket) => socket !== closing && socket.readyState === WebSocket.OPEN);
	}

	private occupied(lobby: Room, closing?: WebSocket) {
		return lobby.seats.some((seat) => this.connected(seat.hash, closing));
	}

	private save(lobby: Room, closing?: WebSocket) {
		if (this.occupied(lobby, closing)) delete lobby.emptyExpiresAt;
		else lobby.emptyExpiresAt ??= Date.now() + EMPTY_ROOM_MS;
		this.ctx.storage.kv.put('lobby', lobby);
		this.ctx.waitUntil(this.ctx.storage.setAlarm(nextAlarm(lobby)));
		this.broadcast(lobby, closing);
	}

	private broadcast(lobby: Room, closing?: WebSocket) {
		for (const seat of lobby.seats) {
			const message = JSON.stringify(snapshot(lobby, seat, (hash) => this.connected(hash, closing), Date.now()));
			for (const socket of this.ctx.getWebSockets(seat.hash)) {
				if (socket !== closing && socket.readyState === WebSocket.OPEN) {
					try { socket.send(message); } catch { /* A disconnected client fetches a fresh snapshot on reconnect. */ }
				}
			}
		}
	}
}
