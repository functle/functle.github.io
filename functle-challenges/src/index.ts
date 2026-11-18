// Keep the class export used by the starter's SQLite migration.
export { ChallengeRoom as MyDurableObject } from './room';

const roomRoute = /^\/api\/rooms\/([a-f0-9]{12})(?:\/(join|socket|leave|guess))?$/;
const lobbyPage = /^\/challenge(?:\/[a-f0-9]{12})?\/?$/;
const pagesOrigin = 'https://functle.github.io';
const seatId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function isPagesOrigin(origin: string | null, api: URL) {
	if (origin === pagesOrigin) return true;
	if (!origin || !['localhost', '127.0.0.1'].includes(api.hostname)) return false;
	const site = URL.parse(origin);
	return site?.hostname === api.hostname && site.protocol === 'http:' && site.origin !== api.origin;
}

function json(value: unknown, status = 200, cookie?: string) {
	const headers = new Headers({ 'Cache-Control': 'no-store' });
	if (cookie) headers.set('Set-Cookie', cookie);
	return Response.json(value, { status, headers });
}

function seatCookie(code: string, token: string, url: URL, age = 2 * 24 * 60 * 60) {
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

async function handle(request: Request, env: Env, pages: boolean): Promise<Response> {
	const url = new URL(request.url);
	if (request.method === 'GET' && (url.pathname === '/' || lobbyPage.test(url.pathname))) {
		const page = await env.ASSETS.fetch(new URL('/', url));
		return new HTMLRewriter()
			.on('head', { element: (head) => { head.prepend('<base href="/">', { html: true }); } })
			.on('meta[name="challenge-api"]', { element: (meta) => { meta.setAttribute('content', ''); } })
			.transform(page);
	}

	const isSocket = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
	if (!pages && (request.method === 'POST' || isSocket) && request.headers.get('Origin') !== url.origin) {
		return json({ error: 'Open this room on the Functle challenge site.' }, 403);
	}

	// Pages and the Worker are separate sites. Only the Pages client uses an
	// explicit seat credential. Its requests never read the Worker's cookies.
	const presented = isSocket
		? request.headers.get('Sec-WebSocket-Protocol')?.split(/,\s*/).find((p) => p.startsWith('seat.'))?.slice(5)
		: request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
	const token = pages ? (presented && seatId.test(presented) ? presented : undefined) : readToken(request);
	if (url.pathname === '/api/rooms' && request.method === 'POST') {
		const name = await readName(request);
		if (!name) return json({ error: 'Enter a name between 1 and 32 characters.' }, 400);
		if (pages && !token) return json({ error: 'A player session is required.' }, 403);
		const credential = pages ? token! : crypto.randomUUID();
		const hash = await hashToken(credential);
		for (let attempt = 0; attempt < 3; attempt++) {
			const code = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
			if (await env.ROOMS.getByName(code).create(name, hash)) {
				return json({ code }, 201, pages ? undefined : seatCookie(code, credential, url));
			}
		}
		return json({ error: 'Could not create the room. Try again.' }, 503);
	}

	const route = roomRoute.exec(url.pathname);
	if (!route) return json({ error: 'Page not found.' }, 404);
	const [, code, action] = route;
	const room = env.ROOMS.getByName(code);

	if (!action && request.method === 'GET') {
		// Give a guest a stable credential before joining so a retried join reclaims the same seat.
		const credential = token ?? crypto.randomUUID();
		const view = await room.inspect(await hashToken(credential));
		if (!view) return json({ error: 'This invite has expired or does not exist.' }, 410);
		return json(view, 200, !pages && view.status !== 'full' ? seatCookie(code, credential, url) : undefined);
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
		const state = await room.leave(hash);
		return json({ state }, 200, !pages && state === 'left' ? seatCookie(code, '', url, 0) : undefined);
	}
	if (action === 'guess' && request.method === 'POST') {
		const body = await request.json<{ id?: unknown; raw?: unknown }>().catch(() => null);
		if (typeof body?.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id) ||
			typeof body.raw !== 'string' || !body.raw.trim() || body.raw.length > 512) {
			return json({ error: 'Enter a function of up to 512 characters.' }, 400);
		}
		const result = await room.guess(hash, body.id, body.raw);
		return json(result, result.status);
	}
	if (action === 'socket' && isSocket && request.method === 'GET') {
		// Only this Worker can call the object. Replace any client-supplied credential header.
		const headers = new Headers(request.headers);
		headers.set('X-Seat-Hash', hash);
		headers.delete('Sec-WebSocket-Protocol');
		if (pages) headers.set('Sec-WebSocket-Protocol', 'functle');
		return room.fetch(new Request(request.url, { headers }));
	}
	return json({ error: 'Unknown room action.' }, 404);
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		const origin = request.headers.get('Origin');
		if (!origin || !url.pathname.startsWith('/api/rooms') || !isPagesOrigin(origin, url)) {
			return handle(request, env, false);
		}
		const cors = new Headers({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin' });
		if (request.method === 'OPTIONS') {
			cors.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
			cors.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
			cors.set('Access-Control-Max-Age', '600');
			return new Response(null, { status: 204, headers: cors });
		}
		const response = await handle(request, env, true);
		if (response.status === 101) return response;
		const copy = new Response(response.body, response);
		cors.forEach((value, name) => copy.headers.set(name, value));
		return copy;
	},
} satisfies ExportedHandler<Env>;
