const el = (id) => document.getElementById(id);
const code = location.pathname.match(/^\/challenge\/([a-f0-9]{12})\/?$/)?.[1];
const roomApi = code && '/api/rooms/' + code;
let socket;
let you;
let myReady = false;
let retryDelay = 500;
let retryTimer;

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
	el('title').textContent = 'Challenge lobby';
	el('status').textContent = message;
	el('entry').hidden = true;
	el('room').hidden = true;
	el('feedback').textContent = '';
	el('create-another').hidden = false;
}

function draw(view) {
	el('entry').hidden = true;
	el('room').hidden = false;
	el('title').textContent = 'Challenge lobby';
	el('invite').value = location.origin + '/challenge/' + code;
	const rows = [1, 2].map((number) => {
		const player = view.players.find((item) => item.number === number);
		const row = document.createElement('li');
		const name = document.createElement('strong');
		name.textContent = player ? player.name + (number === you ? ' (you)' : '') : 'Open seat';
		const state = document.createElement('span');
		if (player) {
			state.textContent = player.connected ? (player.ready ? 'Connected · Ready' : 'Connected · Not ready') : 'Offline';
			if (player.ready && player.connected) state.className = 'ready';
		}
		row.append(name, state);
		return row;
	});
	el('players').replaceChildren(...rows);
	myReady = view.players.find((item) => item.number === you)?.ready ?? false;
	el('ready').textContent = myReady ? 'Cancel ready' : 'Ready';
	el('ready').setAttribute('aria-pressed', String(myReady));
	el('ready').disabled = socket?.readyState !== WebSocket.OPEN;
	if (view.players.length < 2) el('status').textContent = 'Share the invite link with a friend.';
	else if (view.players.every((player) => player.connected && player.ready)) el('status').textContent = 'Both players are ready.';
	else el('status').textContent = 'Waiting for both players to be ready.';
}

function reconnect() {
	el('ready').disabled = true;
	el('status').textContent = 'Reconnecting to the lobby…';
	clearTimeout(retryTimer);
	retryTimer = setTimeout(load, retryDelay);
	retryDelay = Math.min(5000, retryDelay * 2);
}

function connect() {
	const url = new URL(roomApi + '/socket', location.origin);
	url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
	socket = new WebSocket(url);
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
	try {
		await api(roomApi + '/leave', {});
		location.replace('/challenge');
	} catch (error) {
		el('feedback').textContent = error.message;
	}
};

void load();
