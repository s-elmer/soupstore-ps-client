// Soup Store: "Log in with Pokémon Showdown" (src/oldclient/soupstore-login.js)
const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {describe, it} = require('node:test');

const DAY = 24 * 60 * 60 * 1000;

/**
 * Loads the module into a fake browser. `responses` are the login server's answers, in
 * order: {body} (a text response), {error: true} (network failure).
 */
function load({config, stored, responses = [], challstr = '4|abc', storageBroken = false} = {}) {
	const store = new Map();
	if (stored) store.set('soupstore_login', JSON.stringify(stored));
	const calls = [];
	const events = [];
	const user = {
		challstr,
		loaded: false,
		values: {},
		set(key, value) { this.values[key] = value; },
		finishRename(name, assertion) { events.push(['finishRename', name, assertion]); },
		upkeep() { events.push(['upkeep']); },
	};
	const $ = {
		ajax(options) {
			calls.push(options);
			const response = responses.shift() || {error: true};
			const request = {
				done(callback) {
					if (!response.error) callback(options.dataType === 'json' ? JSON.parse(response.body) : response.body);
					return request;
				},
				fail(callback) { if (response.error) callback(); return request; },
			};
			return request;
		},
		param: obj => new URLSearchParams(obj).toString(),
	};
	const window = {
		Config: config === undefined ? {} : {oauth: config},
		app: {user, addPopupMessage(message) { events.push(['message', message]); }},
		toUserid: name => String(name).toLowerCase().replace(/[^a-z0-9]/g, ''),
		location: {protocol: 'https:', host: 'play.soupstore.dev', href: ''},
		open: url => { events.push(['open', url]); return {}; },
		addEventListener: (type, handler) => events.push(['listen', type]),
		console: {warn() {}},
		crypto: require('crypto').webcrypto,
		localStorage: storageBroken ? null : {
			getItem: key => store.has(key) ? store.get(key) : null,
			setItem: (key, value) => { store.set(key, String(value)); },
			removeItem: key => { store.delete(key); },
		},
	};
	if (storageBroken) {
		Object.defineProperty(window, 'localStorage', {get() { throw new Error('denied'); }});
	}
	const file = path.resolve(__dirname, '../play.pokemonshowdown.com/src/oldclient/soupstore-login.js');
	vm.runInNewContext(fs.readFileSync(file, 'utf8'), {window, jQuery: $}, {filename: file});
	return {SoupStoreLogin: window.SoupStoreLogin, window, store, calls, events, user, stored: () => JSON.parse(store.get('soupstore_login') || 'null')};
}

const CONFIG = {clientId: 'abc123'};
const ASSERTION = 'nonce,sam42,2,1700000000,sim3.psim.us;deadbeef';
const LOGIN = {token: 'tok1', user: 'sam42', name: 'Sam42', issuedAt: Date.now()};

describe('Soup Store login: off unless configured', () => {
	for (const config of [undefined, {}, {clientId: ''}, {clientId: 5}, null]) {
		it(`is disabled for Config.oauth = ${JSON.stringify(config)}`, () => {
			const t = load({config, stored: LOGIN});
			assert.equal(t.SoupStoreLogin.enabled(), false);
			assert.equal(t.SoupStoreLogin.popupHTML(), '');
			assert.equal(t.SoupStoreLogin.logoutNote(), '');
			assert.equal(t.SoupStoreLogin.tryRestore(t.user), false);
			t.SoupStoreLogin.start();
			assert.equal(t.calls.length, 0, 'no requests');
			assert.deepEqual(t.events, [], 'nothing opened, shown or listened for');
		});
	}
	it('is enabled once a client ID is set', () => {
		const t = load({config: CONFIG});
		assert.equal(t.SoupStoreLogin.enabled(), true);
		assert.match(t.SoupStoreLogin.popupHTML(), /name="soupstoreLogin"/);
	});
});

describe('Soup Store login: starting a login', () => {
	it('opens PS with the client ID, the challstr and our callback', () => {
		const t = load({config: CONFIG});
		t.SoupStoreLogin.start();
		const open = t.events.find(e => e[0] === 'open');
		const url = new URL(open[1]);
		assert.equal(url.origin + url.pathname, 'https://play.pokemonshowdown.com/api/oauth/authorize');
		assert.equal(url.searchParams.get('client_id'), 'abc123');
		assert.equal(url.searchParams.get('challenge'), '4|abc');
		const redirect = new URL(url.searchParams.get('redirect_uri'));
		assert.equal(redirect.origin + redirect.pathname, 'https://play.soupstore.dev/soupstore/oauth-callback.html');
		const pending = JSON.parse(t.store.get('soupstore_login_pending'));
		assert.equal(redirect.searchParams.get('n'), pending.n, 'the nonce is remembered for the callback');
		assert.match(pending.n, /^[0-9a-f]{32}$/);
		assert.equal(pending.mode, 'popup');
	});
	it('falls back to leaving the page when the popup is blocked', () => {
		const t = load({config: CONFIG});
		t.window.open = () => null;
		t.SoupStoreLogin.start();
		assert.match(t.window.location.href, /^https:\/\/play\.pokemonshowdown\.com\/api\/oauth\/authorize\?/);
		assert.equal(JSON.parse(t.store.get('soupstore_login_pending')).mode, 'redirect');
	});
	it('waits for the connection', () => {
		const t = load({config: CONFIG, challstr: ''});
		t.SoupStoreLogin.start();
		assert.ok(!t.events.some(e => e[0] === 'open'));
		assert.ok(t.events.some(e => e[0] === 'message'));
	});
	it('can use another login server root (for tests)', () => {
		const t = load({config: {clientId: 'x', root: 'http://localhost:8090/'}});
		assert.equal(t.SoupStoreLogin.root(), 'http://localhost:8090');
	});
});

describe('Soup Store login: returning players', () => {
	it('does nothing without a saved login', () => {
		const t = load({config: CONFIG});
		assert.equal(t.SoupStoreLogin.tryRestore(t.user), false);
		assert.equal(t.calls.length, 0);
	});
	it('logs in from the saved token with the current challstr', () => {
		const t = load({config: CONFIG, stored: LOGIN, responses: [{body: ASSERTION}]});
		assert.equal(t.SoupStoreLogin.tryRestore(t.user), true);
		const call = t.calls[0];
		assert.equal(call.url, 'https://play.pokemonshowdown.com/api/oauth/api/getassertion');
		assert.deepEqual({...call.data}, {client_id: 'abc123', token: 'tok1', challenge: '4|abc'});
		assert.deepEqual(t.events, [['finishRename', 'Sam42', ASSERTION]]);
		assert.equal(t.user.loaded, true);
		assert.deepEqual({...t.user.values.registered}, {username: 'Sam42', userid: 'sam42'});
	});
	it('falls back to the userid when the capitalized name is unknown, and looks it up once', () => {
		const t = load({config: CONFIG, stored: {...LOGIN, name: undefined}, responses: [
			{body: ASSERTION},
			{body: JSON.stringify({username: 'Sam42', userid: 'sam42'})},
		]});
		t.SoupStoreLogin.tryRestore(t.user);
		assert.deepEqual(t.events, [['finishRename', 'Sam42', ASSERTION]]);
		assert.equal(t.calls[1].url, 'https://pokemonshowdown.com/users/sam42.json');
		assert.equal(t.stored().name, 'Sam42', 'remembered');

		const failing = load({config: CONFIG, stored: {...LOGIN, name: undefined}, responses: [{body: ASSERTION}, {error: true}]});
		failing.SoupStoreLogin.tryRestore(failing.user);
		assert.deepEqual(failing.events, [['finishRename', 'sam42', ASSERTION]]);
		const wrong = load({config: CONFIG, stored: {...LOGIN, name: undefined}, responses: [{body: ASSERTION}, {body: JSON.stringify({username: 'Someone Else'})}]});
		wrong.SoupStoreLogin.tryRestore(wrong.user);
		assert.deepEqual(wrong.events, [['finishRename', 'sam42', ASSERTION]], 'a name that is not this userid is ignored');
	});
	it('rescues a just-expired token with a refresh, then retries once', () => {
		const t = load({config: CONFIG, stored: LOGIN, responses: [
			{body: ']{"success":false}'},
			{body: ']{"success":"tok2","expires":1}'},
			{body: ASSERTION},
		]});
		t.SoupStoreLogin.tryRestore(t.user);
		assert.deepEqual(t.calls.map(c => c.url.split('/').pop()), ['getassertion', 'refreshtoken', 'getassertion']);
		assert.equal(t.calls[2].data.token, 'tok2');
		assert.equal(t.stored().token, 'tok2');
		assert.deepEqual(t.events, [['finishRename', 'Sam42', ASSERTION]]);
	});
	it('forgets the login and carries on as a guest when the token is dead', () => {
		const t = load({config: CONFIG, stored: LOGIN, responses: [{body: ']{"success":false}'}, {body: ']{"success":false}'}]});
		t.SoupStoreLogin.tryRestore(t.user);
		assert.equal(t.stored(), null);
		assert.deepEqual(t.events.map(e => e[0]), ['message', 'upkeep']);
		assert.match(t.events[0][1], /expired/);
	});
	it('gives up after one refresh-and-retry', () => {
		const t = load({config: CONFIG, stored: LOGIN, responses: [
			{body: ']{"success":false}'}, {body: ']{"success":"tok2"}'}, {body: ']{"success":false}'},
		]});
		t.SoupStoreLogin.tryRestore(t.user);
		assert.equal(t.calls.length, 3);
		assert.equal(t.stored(), null);
		assert.deepEqual(t.events.map(e => e[0]), ['message', 'upkeep']);
	});
	it('keeps the login when the login server can not be reached', () => {
		const t = load({config: CONFIG, stored: LOGIN, responses: [{error: true}]});
		t.SoupStoreLogin.tryRestore(t.user);
		assert.deepEqual(t.stored().token, 'tok1');
		assert.deepEqual(t.events, [['upkeep']]);
	});
	it('keeps the login on a setup error (e.g. wrong origin) and carries on', () => {
		const t = load({config: CONFIG, stored: LOGIN, responses: [{body: ']{"actionerror":"This origin is not permitted to use this OAuth client."}'}]});
		t.SoupStoreLogin.tryRestore(t.user);
		assert.equal(t.stored().token, 'tok1');
		assert.deepEqual(t.events, [['upkeep']]);
	});
	it('lets the usual popups explain a refused name', () => {
		const t = load({config: CONFIG, stored: LOGIN, responses: [{body: ';;Your username is no longer available.'}]});
		t.SoupStoreLogin.tryRestore(t.user);
		assert.deepEqual(t.events, [['finishRename', 'Sam42', ';;Your username is no longer available.']]);
		assert.equal(t.stored(), null);
	});
	it('ignores a saved login that is malformed', () => {
		for (const bad of [{token: 5, user: 'x'}, {user: 'x'}, {token: 'x'}, 'nope']) {
			const t = load({config: CONFIG, stored: bad});
			assert.equal(t.SoupStoreLogin.tryRestore(t.user), false);
		}
	});
});

describe('Soup Store login: weekly rotation', () => {
	it('refreshes a token older than a week after logging in, and keeps only a successful one', () => {
		const old = {...LOGIN, issuedAt: Date.now() - 8 * DAY};
		const t = load({config: CONFIG, stored: old, responses: [{body: ASSERTION}, {body: ']{"success":"tok2","expires":1}'}]});
		t.SoupStoreLogin.tryRestore(t.user);
		assert.equal(t.calls[1].url, 'https://play.pokemonshowdown.com/api/oauth/api/refreshtoken');
		assert.equal(t.stored().token, 'tok2');
		assert.ok(Date.now() - t.stored().issuedAt < 5000);
		assert.equal(t.stored().name, 'Sam42');

		const failing = load({config: CONFIG, stored: old, responses: [{body: ASSERTION}, {body: ']{"success":false}'}]});
		failing.SoupStoreLogin.tryRestore(failing.user);
		assert.equal(failing.stored().token, 'tok1');
		assert.deepEqual(failing.events, [['finishRename', 'Sam42', ASSERTION]]);

		const down = load({config: CONFIG, stored: old, responses: [{body: ASSERTION}, {error: true}]});
		down.SoupStoreLogin.tryRestore(down.user);
		assert.equal(down.stored().token, 'tok1');
	});
	it('does not refresh a recent token', () => {
		const t = load({config: CONFIG, stored: {...LOGIN, issuedAt: Date.now() - 6 * DAY}, responses: [{body: ASSERTION}]});
		t.SoupStoreLogin.tryRestore(t.user);
		assert.equal(t.calls.length, 1);
	});
});

describe('Soup Store login: logging out and storage problems', () => {
	it('forgets everything on logout', () => {
		const t = load({config: CONFIG, stored: LOGIN});
		t.store.set('soupstore_login_pending', '{}');
		t.store.set('soupstore_login_result', '{}');
		t.SoupStoreLogin.clear();
		assert.equal(t.store.size, 0);
	});
	it('does not throw when localStorage is unavailable', () => {
		const t = load({config: CONFIG, storageBroken: true});
		assert.equal(t.SoupStoreLogin.load(), null);
		assert.equal(t.SoupStoreLogin.tryRestore(t.user), false);
		assert.doesNotThrow(() => t.SoupStoreLogin.clear());
		assert.doesNotThrow(() => t.SoupStoreLogin.start());
	});
});
