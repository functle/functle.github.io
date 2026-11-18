// Keep the class export used by the starter's SQLite migration.
export { ChallengeRoom as MyDurableObject } from './room';

const roomRoute = /^\/api\/rooms\/([a-f0-9]{12})(?:\/(join|socket|leave))?$/;
const lobbyPage = /^\/challenge(?:\/[a-f0-9]{12})?\/?$/;

function json(value: unknown, status = 200, cookie?: string) {
	const headers = new Headers({ 'Cache-Control': 'no-store' });
	if (cookie) headers.set('Set-Cookie', cookie);
	return Response.json(value, { status, headers });
}

function seatCookie(code: string, token: string, url: URL, age = 900) {
	const secure = url.protocol === 'https:' ? '; Secure' : '';
	return `seat=${token}; Path=/api/rooms/${code}; HttpOnly; SameSite=Strict; Max-Age=${age}${secure}`;
}

function readToken(request: Request) {
	const match = request.headers.get('Cookie')?.match(/(?:^|;\s*)seat=([a-f0-9-]{36})(?:;|$)/);
	return match?.[1];
}

async function hashToken(token: string) {
	const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readName(request: Request) {
	if (!request.headers.get('Content-Type')?.startsWith('application/json')) return null;
	const body = await request.json<{ name?: unknown }>().catch(() => null);
	const name = typeof body?.name === 'string' ? body.name.trim() : '';
	return name.length > 0 && name.length <= 32 ? name : null;
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		if (request.method === 'GET' && lobbyPage.test(url.pathname)) {
			return env.ASSETS.fetch(new URL('/', url));
		}

		const isSocket = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
		if ((request.method === 'POST' || isSocket) && request.headers.get('Origin') !== url.origin) {
			return json({ error: 'Open this room on the Functle challenge site.' }, 403);
		}

		if (url.pathname === '/api/rooms' && request.method === 'POST') {
			const name = await readName(request);
			if (!name) return json({ error: 'Enter a name between 1 and 32 characters.' }, 400);
			const token = crypto.randomUUID();
			const hash = await hashToken(token);
			for (let attempt = 0; attempt < 3; attempt++) {
				const code = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
				if (await env.ROOMS.getByName(code).create(name, hash)) {
					return json({ code }, 201, seatCookie(code, token, url));
				}
			}
			return json({ error: 'Could not create the room. Try again.' }, 503);
		}

		const route = roomRoute.exec(url.pathname);
		if (!route) return json({ error: 'Page not found.' }, 404);
		const [, code, action] = route;
		const room = env.ROOMS.getByName(code);
		const token = readToken(request);

		if (!action && request.method === 'GET') {
			// Give a guest a stable credential before joining so a retried join reclaims the same seat.
			const credential = token ?? crypto.randomUUID();
			const view = await room.inspect(await hashToken(credential));
			if (!view) return json({ error: 'This invite has expired or does not exist.' }, 410);
			return json(view, 200, !token && view.status === 'join' ? seatCookie(code, credential, url) : undefined);
		}
		if (!token) return json({ error: 'Open the invite link to join this room.' }, 403);
		const hash = await hashToken(token);
		if (action === 'join' && request.method === 'POST') {
			const name = await readName(request);
			if (!name) return json({ error: 'Enter a name between 1 and 32 characters.' }, 400);
			const result = await room.join(name, hash);
			if (result === 'expired') return json({ error: 'This invite has expired.' }, 410);
			if (result === 'full') return json({ error: 'Room full.' }, 409);
			return json({ code });
		}
		if (action === 'leave' && request.method === 'POST') {
			await room.leave(hash);
			return json({ ok: true }, 200, seatCookie(code, '', url, 0));
		}
		if (action === 'socket' && isSocket && request.method === 'GET') {
			// Only this Worker can call the object. Replace any client-supplied credential header.
			const headers = new Headers(request.headers);
			headers.set('X-Seat-Hash', hash);
			return room.fetch(new Request(request.url, { headers }));
		}
		return json({ error: 'Unknown room action.' }, 404);
	},
} satisfies ExportedHandler<Env>;
