const pagesOrigin = 'https://functle.github.io';
const workerOrigin = 'https://functle-challenges.zh0ngy0925.workers.dev';
const hexCode = /^[a-f0-9]{12}$/i;

export function readRoomInvite(value, siteOrigin, apiOrigin, lobbyPath) {
	const text = value.trim();
	if (hexCode.test(text)) return text.toLowerCase();
	if (/^[a-f0-9]{4}([ -])[a-f0-9]{4}\1[a-f0-9]{4}$/i.test(text)) {
		return text.replace(/[ -]/g, '').toLowerCase();
	}

	// Extract only the public code. The current site builds the destination.
	let url;
	try {
		url = new URL(text.startsWith('/') || /^https?:\/\//i.test(text) ? text : 'https://' + text, siteOrigin);
	} catch {
		return null;
	}
	if (url.username || url.password || ![siteOrigin, apiOrigin, pagesOrigin, workerOrigin].includes(url.origin)) return null;
	const path = url.pathname.replace(/\/$/, '');
	const codes = url.searchParams.getAll('room');
	if (path === '/challenge' || (url.origin === siteOrigin && path === lobbyPath.replace(/\/$/, ''))) {
		return codes.length === 1 && hexCode.test(codes[0]) ? codes[0].toLowerCase() : null;
	}
	const legacy = /^\/challenge\/([a-f0-9]{12})$/i.exec(path);
	return legacy && !codes.length ? legacy[1].toLowerCase() : null;
}
