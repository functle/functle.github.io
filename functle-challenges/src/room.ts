import { DurableObject } from 'cloudflare:workers';

type Seat = { number: number; name: string; hash: string; ready: boolean };
type Lobby = { seats: Seat[]; expiresAt: number };
const lifetime = 15 * 60 * 1000;

export class ChallengeRoom extends DurableObject<Env> {
	private current(): Lobby | undefined {
		const lobby = this.ctx.storage.kv.get<Lobby>('lobby');
		return lobby && Date.now() < lobby.expiresAt ? lobby : undefined;
	}

	async create(name: string, hash: string) {
		if (this.ctx.storage.kv.get('lobby')) return false;
		const expiresAt = Date.now() + lifetime;
		this.ctx.storage.kv.put<Lobby>('lobby', { expiresAt, seats: [{ name, hash, number: 1, ready: false }] });
		await this.ctx.storage.setAlarm(expiresAt);
		return true;
	}

	join(name: string, hash: string) {
		const lobby = this.current();
		if (!lobby) return 'expired';
		if (lobby.seats.some((seat) => seat.hash === hash)) return 'joined';
		if (lobby.seats.length >= 2) return 'full';
		const number = lobby.seats.some((seat) => seat.number === 1) ? 2 : 1;
		lobby.seats.push({ name, hash, number, ready: false });
		this.save(lobby);
		return 'joined';
	}

	leave(hash: string) {
		const lobby = this.current();
		if (!lobby || !lobby.seats.some((seat) => seat.hash === hash)) return;
		lobby.seats = lobby.seats.filter((seat) => seat.hash !== hash);
		for (const seat of lobby.seats) seat.ready = false;
		for (const socket of this.ctx.getWebSockets(hash)) socket.close(4001, 'Seat released');
		if (lobby.seats.length) this.save(lobby);
		else this.ctx.storage.kv.delete('lobby');
	}

	inspect(hash: string) {
		const lobby = this.current();
		if (!lobby) return null;
		const seat = lobby.seats.find((player) => player.hash === hash);
		if (!seat) return { status: lobby.seats.length === 2 ? 'full' : 'join' };
		return { status: 'member', you: seat.number, ...this.snapshot(lobby) };
	}

	fetch(request: Request) {
		const hash = request.headers.get('X-Seat-Hash');
		const lobby = this.current();
		if (!lobby) return new Response('Room expired', { status: 410 });
		if (!hash || !lobby.seats.some((seat) => seat.hash === hash)) return new Response('Join first', { status: 403 });
		const [client, server] = Object.values(new WebSocketPair());
		this.ctx.acceptWebSocket(server, [hash]);
		this.broadcast(lobby);
		return new Response(null, { status: 101, webSocket: client });
	}

	webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
		const lobby = this.current();
		if (!lobby) return socket.close(4000, 'Room expired');
		const [hash] = this.ctx.getTags(socket);
		const seat = lobby.seats.find((player) => player.hash === hash);
		if (!seat || (message !== 'ready' && message !== 'unready')) return socket.close(1008, 'Invalid lobby command');
		seat.ready = message === 'ready';
		this.save(lobby);
	}

	webSocketClose(socket: WebSocket) {
		const lobby = this.current();
		if (!lobby) return;
		const [hash] = this.ctx.getTags(socket);
		const seat = lobby.seats.find((player) => player.hash === hash);
		if (seat && !this.connected(hash, socket)) {
			seat.ready = false;
			this.ctx.storage.kv.put('lobby', lobby);
		}
		this.broadcast(lobby, socket);
	}

	webSocketError(socket: WebSocket) {
		this.webSocketClose(socket);
	}

	async alarm() {
		const lobby = this.current();
		if (lobby) {
			await this.ctx.storage.setAlarm(lobby.expiresAt);
			return;
		}
		for (const socket of this.ctx.getWebSockets()) socket.close(4000, 'Room expired');
		await this.ctx.storage.deleteAll();
	}

	private connected(hash: string, closing?: WebSocket) {
		return this.ctx.getWebSockets(hash).some((socket) => socket !== closing && socket.readyState === WebSocket.OPEN);
	}

	private snapshot(lobby: Lobby, closing?: WebSocket) {
		return {
			expiresAt: lobby.expiresAt,
			players: lobby.seats.map(({ number, name, ready, hash }) => ({ number, name, ready, connected: this.connected(hash, closing) })),
		};
	}

	private save(lobby: Lobby) {
		this.ctx.storage.kv.put('lobby', lobby);
		this.broadcast(lobby);
	}

	private broadcast(lobby: Lobby, closing?: WebSocket) {
		const message = JSON.stringify(this.snapshot(lobby, closing));
		for (const socket of this.ctx.getWebSockets()) {
			if (socket !== closing && socket.readyState === WebSocket.OPEN) {
				try { socket.send(message); } catch { /* A disconnected client fetches a fresh snapshot on reconnect. */ }
			}
		}
	}
}
