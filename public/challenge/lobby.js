import { mountBoard } from './game/match.js?v=result-leave';
import { readRoomInvite } from './room-invite.js';
import { roomPath, validRoomCode } from './room-code.js';

const el = (id) => document.getElementById(id);
const configuredApi = document.querySelector('meta[name="challenge-api"]').content;
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const apiOrigin = configuredApi ? (local ? 'http://' + location.hostname + ':8787' : configuredApi) : location.origin;
const onPages = apiOrigin !== location.origin;
const requestedCode = new URLSearchParams(location.search).get('room');
const code = (onPages ? requestedCode : roomPath.exec(location.pathname)?.[1])?.toLowerCase();
const lobbyPath = onPages ? new URL('.', import.meta.url).pathname : '/challenge';
const roomLink = (id) => onPages ? lobbyPath + '?room=' + id : '/challenge/' + id;
const seatKey = (id) => 'functle:seat:' + id;
el('create-another').href = lobbyPath;
const roomApi = code && '/api/rooms/' + code;
let socket;
let you;
let myReady = false;
let retryDelay = 500;
let retryTimer;
let currentView;
let serverOffset = 0;
const renderBoard = mountBoard(el('board'));
let inputDisabled = true;
let delivery;
const pendingKey = 'functle:pending:' + code;

function updateTime() {
	if (!currentView) return;
	const now = Date.now() + serverOffset;
	if (currentView.phase === 'countdown') {
		const seconds = Math.max(0, Math.ceil((currentView.startsAt - now) / 1000));
		el('status').textContent = seconds ? 'Starting in ' + seconds + '…' : 'Starting…';
	}
	if (currentView.phase === 'playing') {
		const seconds = Math.max(0, Math.ceil((currentView.endsAt - now) / 1000));
		el('clock').textContent = 'Time left ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
		updateSubmit();
	}
}

function disabled(view) {
	return view.phase !== 'playing' || Date.now() + serverOffset >= view.endsAt ||
		socket?.readyState !== WebSocket.OPEN || Boolean(delivery);
}

function updateSubmit() {
	if (currentView?.phase === 'playing' && inputDisabled !== disabled(currentView)) drawMatch(currentView);
}

function drawMatch(view) {
	const finished = view.phase === 'finished';
	el('clock').hidden = finished;
	let verdict = '';
	if (finished) {
		const { reason, winner } = view.result;
		if (winner === you) {
			verdict = 'You won!';
		} else if (winner === null) {
			verdict = reason === 'timeout' ? 'Draw. Time is up.' : 'Draw. Both players used all six guesses.';
		} else {
			const opponent = view.players.find((player) => player.number === winner);
			verdict = opponent.name + ' won!';
			if (reason === 'forfeit') verdict += ' A player forfeited.';
		}
	}
	el('status').textContent = finished ? '' : 'First to solve the graph wins.';
	inputDisabled = disabled(view);
	renderBoard({ view, you, verdict, disabled: inputDisabled, onGuess: submitGuess, onLeave: leaveFinishedRoom,
		online: socket?.readyState === WebSocket.OPEN, onRematch: (accept) => {
			if (socket?.readyState === WebSocket.OPEN) socket.send((accept ? 'rematch:' : 'cancel-rematch:') + view.startsAt);
		} });
}

async function api(path, body, seat = onPages && code ? localStorage.getItem(seatKey(code)) : null) {
	const options = body === undefined ? {} : {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	};
	const headers = new Headers(options.headers);
	if (seat) headers.set('Authorization', 'Bearer ' + seat);
	const response = await fetch(new URL(path, apiOrigin), {
		...options, headers, cache: 'no-store', credentials: onPages ? 'omit' : 'same-origin',
	});
	const result = await response.json();
	if (!response.ok) throw Object.assign(new Error(result.error), { status: response.status });
	return result;
}

function form(joining) {
	el('title').textContent = joining ? 'Join a challenge' : 'Create a challenge';
	el('status').textContent = joining ? 'Choose a name to join your friend.' : 'Create a room to get a code and an invite link.';
	el('submit').textContent = joining ? 'Join room' : 'Create room';
	el('entry').hidden = false;
	el('find-room').hidden = joining;
	el('room').hidden = true;
	el('create-another').hidden = true;
	renderBoard(null);
}

function unavailable(message) {
	clearTimeout(retryTimer);
	currentView = undefined;
	el('title').textContent = 'Challenge lobby';
	el('status').textContent = message;
	el('entry').hidden = true;
	el('find-room').hidden = false;
	el('room').hidden = true;
	el('feedback').textContent = '';
	el('create-another').hidden = false;
	renderBoard(null);
}

function draw(view) {
	const inMatch = view.phase === 'playing' || view.phase === 'finished';
	if (view.phase !== currentView?.phase) {
		el('feedback').textContent = '';

	}
	currentView = view;
	serverOffset = view.serverNow - Date.now();
	el('entry').hidden = true;
	el('find-room').hidden = true;
	el('room').hidden = false;
	el('title').textContent = inMatch ? (view.result ? 'Match result' : 'Challenge match') : 'Challenge lobby';
	el('sharing').hidden = inMatch;
	el('match').hidden = !inMatch;
	el('title').parentElement.classList.toggle('playing', inMatch);
	el('ready').hidden = inMatch;
	el('leave').textContent = view.phase === 'playing' ? 'Forfeit match' : 'Leave room';
	el('create-another').hidden = true;
	el('invite').value = location.origin + roomLink(code);
	el('room-code').textContent = code.toUpperCase().match(/.{4}/g).join('-');
	const rows = [1, 2].map((number) => {
		const player = view.players.find((item) => item.number === number);
		const row = document.createElement('li');
		const name = document.createElement('strong');
		name.textContent = player ? player.name + (number === you ? ' (you)' : '') : 'Open seat';
		const state = document.createElement('span');
		if (player) {
			if (inMatch) {
				state.textContent = player.used + '/' + view.maxGuesses + ' guesses';
			} else if (player.connected) {
				state.textContent = player.ready ? 'Ready' : 'Not ready';
			}
			if (!player.connected) {
				const offline = document.createElement('span');
				offline.className = 'offline';
				offline.textContent = 'Offline';
				state.prepend(offline, inMatch ? ' · ' : '');
			} else if (player.ready) {
				state.className = 'ready';
			}
		}
		row.append(name, state);
		return row;
	});
	el('players').replaceChildren(...rows);
	if (inMatch) {
		drawMatch(view);
		updateTime();
		return;
	}
	renderBoard(null);
	myReady = view.players.find((item) => item.number === you)?.ready ?? false;
	el('ready').textContent = myReady ? 'Cancel ready' : 'Ready';
	el('ready').setAttribute('aria-pressed', String(myReady));
	el('ready').disabled = socket?.readyState !== WebSocket.OPEN;
	if (view.phase === 'countdown') updateTime();
	else if (view.players.length < 2) el('status').textContent = 'Share the room code or invite link with a friend.';
	else if (view.players.every((player) => player.connected && player.ready)) el('status').textContent = 'Both players are ready.';
	else el('status').textContent = 'Waiting for both players to be ready.';
}

function reconnect() {
	el('ready').disabled = true;
	el('feedback').textContent = 'Reconnecting…';
	updateSubmit();
	if (currentView?.phase === 'finished') drawMatch(currentView);
	clearTimeout(retryTimer);
	retryTimer = setTimeout(load, retryDelay);
	retryDelay = Math.min(5000, retryDelay * 2);
}

function connect() {
	const url = new URL(roomApi + '/socket', apiOrigin);
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	socket = onPages ? new WebSocket(url, ['functle', 'seat.' + localStorage.getItem(seatKey(code))]) : new WebSocket(url);
	socket.onopen = () => {
		el('feedback').textContent = '';
		if (!delivery && sessionStorage.getItem(pendingKey)) {
			// After a refresh the original input no longer exists to report a rejection.
			void sendPending().then((reason) => { if (reason) el('feedback').textContent = reason; });
		}
	};
	socket.onmessage = (event) => {
		retryDelay = 500;
		draw(JSON.parse(event.data));
	};
	socket.onclose = (event) => {
		if (event.code === 4000) unavailable('This invite has expired.');
		else if (event.code === 4001) unavailable('You left this room.');
		else reconnect();
	};
}

async function load() {
	if (onPages && requestedCode !== null && !validRoomCode.test(requestedCode)) return unavailable('Invalid room invite.');
	if (!code) return form(false);
	try {
		const view = await api(roomApi);
		if (view.status === 'full') return unavailable('Room full. Both seats are taken.');
		if (view.status === 'join') return form(true);
		you = view.you;
		draw(view);
		connect();
	} catch (error) {
		if (error.status === 410) unavailable(error.message);
		else reconnect();
	}
}

el('room-invite').oninput = (event) => event.target.setCustomValidity('');
el('find-room').onsubmit = (event) => {
	event.preventDefault();
	const input = el('room-invite');
	const id = readRoomInvite(input.value, location.origin, apiOrigin, lobbyPath);
	if (!id) {
		input.setCustomValidity('Enter a 4-character room code or a Functle room invite link.');
		input.reportValidity();
		return;
	}
	location.assign(roomLink(id));
};

el('entry').onsubmit = async (event) => {
	event.preventDefault();
	el('submit').disabled = true;
	el('feedback').textContent = '';
	try {
		const seat = onPages ? (code && localStorage.getItem(seatKey(code))) || crypto.randomUUID() : null;
		if (seat && code) localStorage.setItem(seatKey(code), seat);
		const result = await api(code ? roomApi + '/join' : '/api/rooms', { name: el('name').value }, seat);
		if (seat) localStorage.setItem(seatKey(result.code), seat);
		location.replace(roomLink(result.code));
	} catch (error) {
		if (error.status === 409 || error.status === 410) unavailable(error.message);
		else el('feedback').textContent = error.message;
		el('submit').disabled = false;
	}
};

el('ready').onclick = () => {
	if (socket?.readyState === WebSocket.OPEN) {
		socket.send(myReady ? 'unready' : 'ready');
		el('ready').disabled = true;
	}
};

el('copy').onclick = async () => {
	try {
		await navigator.clipboard.writeText(el('invite').value);
		el('feedback').textContent = 'Invite link copied.';
	} catch {
		el('invite').select();
		el('feedback').textContent = 'Copy the selected invite link.';
	}
};

function leaveFinishedRoom() {
	clearTimeout(retryTimer);
	if (socket) {
		socket.onclose = null;
		socket.close(1000, 'Left room');
	}
	location.replace(lobbyPath);
}

el('leave').onclick = async () => {
	if (currentView?.phase === 'finished') return leaveFinishedRoom();
	if (currentView?.phase === 'playing' && !confirm('Forfeit this match? Your opponent will win.')) return;
	try {
		const { state } = await api(roomApi + '/leave', { startsAt: currentView?.startsAt ?? null });
		if (state === 'left') {
			if (onPages) localStorage.removeItem(seatKey(code));
			location.replace(lobbyPath);
		}
	} catch (error) {
		el('feedback').textContent = error.message;
	}
};

async function deliver(guess) {
	for (;;) {
		try {
			await api(roomApi + '/guess', guess);
			el('feedback').textContent = '';
			return null;
		} catch (error) {
			if (error.status >= 400 && error.status < 500) {
				el('feedback').textContent = '';
				return error.message;
			}
			el('feedback').textContent = 'Checking whether your guess arrived…';
			await new Promise((resolve) => setTimeout(resolve, 1500));
		}
	}
}

function sendPending() {
	const stored = sessionStorage.getItem(pendingKey);
	if (!stored || delivery) return delivery;
	delivery = deliver(JSON.parse(stored)).finally(() => {
		sessionStorage.removeItem(pendingKey);
		delivery = undefined;
		updateSubmit();
	});
	updateSubmit();
	return delivery;
}

function submitGuess(raw) {
	if (!sessionStorage.getItem(pendingKey)) {
		sessionStorage.setItem(pendingKey, JSON.stringify({ id: crypto.randomUUID(), raw, startsAt: currentView.startsAt }));
	}
	return sendPending();
}

setInterval(updateTime, 250);
void load();
