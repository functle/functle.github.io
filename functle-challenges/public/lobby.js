import { renderGraph } from './graph.js';

const el = (id) => document.getElementById(id);
const code = location.pathname.match(/^\/challenge\/([a-f0-9]{12})\/?$/)?.[1];
const roomApi = code && '/api/rooms/' + code;
let socket;
let you;
let myReady = false;
let retryDelay = 500;
let retryTimer;
let currentView;
let serverOffset = 0;
let graphStart;
let sending = false;
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

function updateSubmit() {
	const view = currentView;
	const me = view?.players.find((player) => player.number === you);
	el('send').disabled = !me || view.phase !== 'playing' || me.used >= view.maxGuesses ||
		Date.now() + serverOffset >= view.endsAt || socket?.readyState !== WebSocket.OPEN || sending;
}

function drawMatch(view) {
	const finished = view.phase === 'finished';
	el('clock').hidden = finished;
	el('guess-form').hidden = finished;
	el('answer').textContent = finished ? 'Answer: ' + view.result.answer : '';
	if (graphStart !== view.startsAt) {
		el('graph').replaceChildren(renderGraph(view.graph));
		graphStart = view.startsAt;
	}
	const histories = [];
	for (const player of view.players) {
		if (!player.guesses || (!finished && !player.used)) continue;
		const heading = document.createElement('h3');
		heading.textContent = player.number === you ? 'Your guesses' : player.name + '’s guesses';
		const list = document.createElement('ol');
		for (const { raw, grade } of player.guesses) {
			const item = document.createElement('li');
			const hint = document.createElement('small');
			hint.textContent = [grade.kindCorrect ? 'Correct family' : 'Different family', ...grade.cells.map(
				(cell) => cell.name + ' = ' + cell.value + ' (' + (cell.state === 'unknown' ? 'ungraded' : cell.state) + ')'
			)].join(' · ');
			item.append(raw, hint);
			list.append(item);
		}
		if (!player.used) heading.textContent += ' (0)';
		histories.push(heading, list);
	}
	el('histories').replaceChildren(...histories);
	const me = view.players.find((player) => player.number === you);
	if (finished) {
		const { reason, winner } = view.result;
		const opponent = view.players.find((player) => player.number !== you);
		el('status').textContent = winner === null
			? (reason === 'timeout' ? 'Draw. Time is up.' : 'Draw. Both players used all six guesses.')
			: (winner === you ? 'You won!' : opponent.name + ' won!') + (reason === 'forfeit' ? ' A player forfeited.' : '');
	} else {
		el('status').textContent = me.used >= view.maxGuesses ? 'All six guesses used. Waiting for your opponent.' : 'First to solve the graph wins.';
	}
	updateTime();
}

async function api(path, body) {
	const options = body === undefined ? {} : {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	};
	const response = await fetch(path, { ...options, cache: 'no-store' });
	const result = await response.json();
	if (!response.ok) throw Object.assign(new Error(result.error), { status: response.status });
	return result;
}

function form(joining) {
	el('title').textContent = joining ? 'Join a challenge' : 'Create a challenge';
	el('status').textContent = joining ? 'Choose a name to join your friend.' : 'Create a room to get an invite link.';
	el('submit').textContent = joining ? 'Join room' : 'Create room';
	el('entry').hidden = false;
	el('room').hidden = true;
	el('create-another').hidden = true;
}

function unavailable(message) {
	clearTimeout(retryTimer);
	currentView = undefined;
	el('title').textContent = 'Challenge lobby';
	el('status').textContent = message;
	el('entry').hidden = true;
	el('room').hidden = true;
	el('feedback').textContent = '';
	el('create-another').hidden = false;
}

function draw(view) {
	const inMatch = view.phase === 'playing' || view.phase === 'finished';
	if (view.phase !== currentView?.phase) {
		el('feedback').textContent = '';
		el('guess-feedback').textContent = '';
	}
	currentView = view;
	serverOffset = view.serverNow - Date.now();
	el('entry').hidden = true;
	el('room').hidden = false;
	el('title').textContent = inMatch ? (view.result ? 'Match result' : 'Challenge match') : 'Challenge lobby';
	el('sharing').hidden = inMatch;
	el('match').hidden = !inMatch;
	el('ready').hidden = inMatch;
	el('leave').hidden = view.phase === 'finished';
	el('leave').textContent = inMatch ? 'Forfeit match' : 'Leave room';
	el('create-another').hidden = view.phase !== 'finished';
	el('invite').value = location.origin + '/challenge/' + code;
	const rows = [1, 2].map((number) => {
		const player = view.players.find((item) => item.number === number);
		const row = document.createElement('li');
		const name = document.createElement('strong');
		name.textContent = player ? player.name + (number === you ? ' (you)' : '') : 'Open seat';
		const state = document.createElement('span');
		if (player) {
			state.textContent = inMatch ? (player.connected ? 'Connected' : 'Offline') + ' · ' + player.used + '/' + view.maxGuesses + ' guesses'
				: player.connected ? (player.ready ? 'Connected · Ready' : 'Connected · Not ready') : 'Offline';
			if (player.ready && player.connected) state.className = 'ready';
		}
		row.append(name, state);
		return row;
	});
	el('players').replaceChildren(...rows);
	if (inMatch) return drawMatch(view);
	myReady = view.players.find((item) => item.number === you)?.ready ?? false;
	el('ready').textContent = myReady ? 'Cancel ready' : 'Ready';
	el('ready').setAttribute('aria-pressed', String(myReady));
	el('ready').disabled = socket?.readyState !== WebSocket.OPEN;
	if (view.phase === 'countdown') updateTime();
	else if (view.players.length < 2) el('status').textContent = 'Share the invite link with a friend.';
	else if (view.players.every((player) => player.connected && player.ready)) el('status').textContent = 'Both players are ready.';
	else el('status').textContent = 'Waiting for both players to be ready.';
}

function reconnect() {
	el('ready').disabled = true;
	el('feedback').textContent = 'Reconnecting…';
	updateSubmit();
	clearTimeout(retryTimer);
	retryTimer = setTimeout(load, retryDelay);
	retryDelay = Math.min(5000, retryDelay * 2);
}

function connect() {
	const url = new URL(roomApi + '/socket', location.origin);
	url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
	socket = new WebSocket(url);
	socket.onopen = () => {
		el('feedback').textContent = '';
		void sendPending();
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

el('entry').onsubmit = async (event) => {
	event.preventDefault();
	el('submit').disabled = true;
	el('feedback').textContent = '';
	try {
		const result = await api(code ? roomApi + '/join' : '/api/rooms', { name: el('name').value });
		location.replace('/challenge/' + result.code);
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

el('leave').onclick = async () => {
	if (currentView?.phase === 'playing' && !confirm('Forfeit this match? Your opponent will win.')) return;
	try {
		const { state } = await api(roomApi + '/leave', {});
		if (state === 'left') location.replace('/challenge');
	} catch (error) {
		el('feedback').textContent = error.message;
	}
};

async function sendPending() {
	const stored = sessionStorage.getItem(pendingKey);
	if (!stored || sending) return;
	sending = true;
	updateSubmit();
	const guess = JSON.parse(stored);
	try {
		await api(roomApi + '/guess', guess);
		sessionStorage.removeItem(pendingKey);
		el('guess').value = '';
		el('guess-feedback').textContent = '';
	} catch (error) {
		if (error.status >= 400 && error.status < 500) {
			sessionStorage.removeItem(pendingKey);
			el('guess-feedback').textContent = error.message;
		} else {
			el('guess-feedback').textContent = 'Checking whether your guess arrived…';
			setTimeout(sendPending, 1500);
		}
	} finally {
		sending = false;
		updateSubmit();
	}
}

el('guess-form').onsubmit = (event) => {
	event.preventDefault();
	if (el('send').disabled) return;
	if (!sessionStorage.getItem(pendingKey)) {
		sessionStorage.setItem(pendingKey, JSON.stringify({ id: crypto.randomUUID(), raw: el('guess').value.trim() }));
	}
	void sendPending();
};

setInterval(updateTime, 250);
void load();
