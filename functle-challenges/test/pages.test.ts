import { expect, it, vi } from 'vitest';
import worker from '../src/index';

vi.mock('../src/room', () => ({ ChallengeRoom: class {} }));

const pages = 'https://functle.github.io';
const api = 'https://functle-challenges.zh0ngy0925.workers.dev/api/rooms';
const credential = crypto.randomUUID();
const create = vi.fn(async () => true);
const env = { ROOMS: { getByName: () => ({ create }) } } as unknown as Env;

function createRoom(origin: string, headers: Record<string, string>) {
	return worker.fetch(new Request(api, {
		method: 'POST',
		headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
		body: JSON.stringify({ name: 'Player' }),
	}), env);
}

it('accepts a Pages seat without a third-party cookie', async () => {
	const response = await createRoom(pages, { Authorization: 'Bearer ' + credential });
	expect(response.status).toBe(201);
	expect(response.headers.get('Access-Control-Allow-Origin')).toBe(pages);
	expect(response.headers.has('Set-Cookie')).toBe(false);
	expect(await response.json()).toEqual({ code: expect.stringMatching(/^[a-f0-9]{12}$/) });
});

it('keeps the Worker cookie separate from Pages sessions', async () => {
	const response = await createRoom(pages, { Cookie: 'seat=' + credential });
	expect(response.status).toBe(403);
	const legacy = await createRoom(new URL(api).origin, {});
	expect(legacy.status).toBe(201);
	expect(legacy.headers.get('Set-Cookie')).toContain('HttpOnly');
});

it('restricts browser access to the configured Pages origin', async () => {
	const response = await createRoom('https://another.github.io', { Authorization: 'Bearer ' + credential });
	expect(response.status).toBe(403);
	expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
});
