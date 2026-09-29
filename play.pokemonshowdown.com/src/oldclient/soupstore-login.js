/**
 * Soup Store: "Log in with Pokémon Showdown" (see soupstore/README.md).
 *
 * PS's own client stays logged in through a `sid` cookie from
 * play.pokemonshowdown.com, which is a third-party cookie on our domain. Instead we
 * use PS's OAuth-like flow (https://github.com/smogon/pokemon-showdown-loginserver/blob/master/OAUTH.md):
 *
 *   - The player authorizes us once, in a popup on PS's own site, which sends a
 *     token back to soupstore/oauth-callback.html.
 *   - On every later connection we trade that token and the server's challstr for a
 *     fresh assertion (/api/oauth/api/getassertion) and log in with it, as `upkeep`
 *     does for a cookie session.
 *   - The token is rotated weekly (/api/oauth/api/refreshtoken).
 *
 * All of this is off unless `Config.oauth.clientId` is set (soupstore/config/config.js).
 * While it's unset nothing here renders, listens or makes a request.
 */
(function (exports, $) {
	var STORAGE_KEY = 'soupstore_login'; // { token, user, name, issuedAt }
	var PENDING_KEY = 'soupstore_login_pending'; // { n, t, mode }: a login we started
	var RESULT_KEY = 'soupstore_login_result'; // { user, assertion }: handed back by the popup
	var ROTATE_AFTER = 7 * 24 * 60 * 60 * 1000;
	var CALLBACK_PATH = '/soupstore/oauth-callback.html';

	function storage() {
		try {
			return window.localStorage || null;
		} catch (e) {
			return null;
		}
	}
	function readJSON(key) {
		var store = storage();
		if (!store) return null;
		try {
			var raw = store.getItem(key);
			return raw ? JSON.parse(raw) : null;
		} catch (e) {
			return null;
		}
	}
	function writeJSON(key, value) {
		var store = storage();
		if (!store) return false;
		try {
			store.setItem(key, JSON.stringify(value));
			return true;
		} catch (e) {
			return false;
		}
	}
	function removeKey(key) {
		var store = storage();
		if (!store) return;
		try {
			store.removeItem(key);
		} catch (e) {}
	}
	function randomNonce() {
		try {
			var bytes = new Uint8Array(16);
			window.crypto.getRandomValues(bytes);
			var out = '';
			for (var i = 0; i < bytes.length; i++) out += ('0' + bytes[i].toString(16)).slice(-2);
			return out;
		} catch (e) {
			return String(Math.random()).slice(2) + String(new Date().getTime());
		}
	}
	/**
	 * The login server answers with a raw assertion on success and JSON (after a
	 * leading `]`) for failures like { success: false } or { actionerror }.
	 */
	function parseResponse(text) {
		text = text || '';
		if (text.charAt(0) === ']') text = text.substr(1);
		try {
			var parsed = JSON.parse(text);
			if (parsed && typeof parsed === 'object') return parsed;
		} catch (e) {}
		return { data: text };
	}
	function request(action, data, callback) {
		$.ajax({
			url: SoupStoreLogin.root() + '/api/oauth/api/' + action,
			type: 'GET',
			data: data,
			dataType: 'text',
			timeout: 15000
		}).done(function (text) {
			callback(null, parseResponse(text));
		}).fail(function () {
			callback(new Error('request failed'), null);
		});
	}

	var SoupStoreLogin = {
		/** Whether the feature is turned on; everything else checks this first */
		enabled: function () {
			var config = window.Config && window.Config.oauth;
			return !!(config && typeof config.clientId === 'string' && config.clientId);
		},
		root: function () {
			return ((window.Config.oauth && window.Config.oauth.root) || 'https://play.pokemonshowdown.com').replace(/\/+$/, '');
		},
		usersRoot: function () {
			return ((window.Config.oauth && window.Config.oauth.usersRoot) || 'https://pokemonshowdown.com').replace(/\/+$/, '');
		},
		callbackURL: function (nonce) {
			return window.location.protocol + '//' + window.location.host + CALLBACK_PATH + '?n=' + encodeURIComponent(nonce);
		},
		authorizeURL: function (challstr, nonce) {
			return SoupStoreLogin.root() + '/api/oauth/authorize?' + $.param({
				client_id: window.Config.oauth.clientId,
				redirect_uri: SoupStoreLogin.callbackURL(nonce),
				challenge: challstr
			});
		},

		// stored login

		load: function () {
			var login = readJSON(STORAGE_KEY);
			return login && typeof login.token === 'string' && login.token && typeof login.user === 'string' && login.user ? login : null;
		},
		save: function (login) {
			return writeJSON(STORAGE_KEY, login);
		},
		clear: function () {
			removeKey(STORAGE_KEY);
			removeKey(PENDING_KEY);
			removeKey(RESULT_KEY);
		},

		// UI

		/** The login button for the login popups: nothing at all while the feature is off */
		popupHTML: function () {
			if (!SoupStoreLogin.enabled()) return '';
			return '<hr /><p class="buttonbar"><button type="button" name="soupstoreLogin" class="button"><strong>Log in with Pok&eacute;mon Showdown</strong></button></p>' +
				'<p><small>Stay logged in without typing your password. You need to be logged in at <a href="https://play.pokemonshowdown.com/" target="_blank" rel="noopener">play.pokemonshowdown.com</a> in this browser first.</small></p>';
		},
		/** Shown after logging out */
		logoutNote: function () {
			if (!SoupStoreLogin.enabled()) return '';
			return '<br /><br />This browser has forgotten its Pok&eacute;mon Showdown login. To also revoke this site\'s access, use <a href="https://play.pokemonshowdown.com/api/oauth/authorized" target="_blank" rel="noopener">your authorized applications</a> on Pok&eacute;mon Showdown.';
		},

		// logging in

		/** Called on the "Log in with Pokémon Showdown" button */
		start: function () {
			if (!SoupStoreLogin.enabled()) return;
			var challstr = window.app.user.challstr;
			if (!challstr) {
				window.app.addPopupMessage("Still connecting to the server. Try again in a moment.");
				return;
			}
			var nonce = randomNonce();
			var url = SoupStoreLogin.authorizeURL(challstr, nonce);
			var popup = window.open(url, 'soupstore-login', 'popup=1,width=520,height=680');
			// A blocked popup means leaving this page for PS instead; the callback then sends the
			// player back here and they're logged in from the saved token.
			writeJSON(PENDING_KEY, { n: nonce, t: new Date().getTime(), mode: popup ? 'popup' : 'redirect' });
			if (!popup) {
				window.location.href = url;
				return;
			}
			SoupStoreLogin.listen();
		},
		listening: false,
		listen: function () {
			if (SoupStoreLogin.listening) return;
			SoupStoreLogin.listening = true;
			window.addEventListener('storage', function (e) {
				if (e.key !== RESULT_KEY || !e.newValue) return;
				var result;
				try {
					result = JSON.parse(e.newValue);
				} catch (err) {
					return;
				}
				removeKey(RESULT_KEY);
				if (result && typeof result.assertion === 'string') SoupStoreLogin.finishLogin(result.assertion);
			}, false);
		},
		/** The popup authorized us: the callback page has saved the token and passed on the assertion */
		finishLogin: function (assertion) {
			var login = SoupStoreLogin.load();
			if (!login) return;
			SoupStoreLogin.withName(login, function (name) {
				SoupStoreLogin.logIn(name, assertion);
			});
		},
		logIn: function (name, assertion) {
			var user = window.app.user;
			user.loaded = true;
			user.set('registered', { username: name, userid: window.toUserid(name) });
			user.finishRename(name, assertion);
		},
		/**
		 * The OAuth `user` is a lowercase userid. Get the properly capitalized name from PS's
		 * public user API once and remember it; if that fails, the userid still works.
		 */
		withName: function (login, callback) {
			if (login.name) return callback(login.name);
			$.ajax({
				url: SoupStoreLogin.usersRoot() + '/users/' + encodeURIComponent(login.user) + '.json',
				dataType: 'json',
				timeout: 8000
			}).done(function (data) {
				var name = data && typeof data.username === 'string' ? data.username : '';
				if (name && window.toUserid(name) === window.toUserid(login.user)) {
					login.name = name;
					// only if it's still this login (it may have changed in another tab meanwhile)
					var current = SoupStoreLogin.load();
					if (current && current.token === login.token) SoupStoreLogin.save(login);
					return callback(name);
				}
				callback(login.user);
			}).fail(function () {
				callback(login.user);
			});
		},

		// returning players

		/**
		 * On a new connection (challstr received), log in from the saved token if there is one.
		 * Returns whether it took over; if so it calls user.upkeep() itself when it can't log in.
		 */
		tryRestore: function (user) {
			if (!SoupStoreLogin.enabled()) return false;
			var login = SoupStoreLogin.load();
			if (!login) return false;
			SoupStoreLogin.restore(user, login, false);
			return true;
		},
		restore: function (user, login, retried) {
			request('getassertion', {
				client_id: window.Config.oauth.clientId,
				token: login.token,
				challenge: user.challstr
			}, function (err, result) {
				if (err || result.actionerror) {
					// Can't ask right now (offline, or a setup problem): keep the login for next time
					if (result && result.actionerror && window.console) window.console.warn('Pokemon Showdown login: ' + result.actionerror);
					return user.upkeep();
				}
				if (result.success === false) {
					if (retried) return SoupStoreLogin.expire(user);
					// Expired, revoked or replaced by another browser's refresh. A refresh can still rescue a just-expired token.
					return SoupStoreLogin.refresh(login, function (state, newLogin) {
						if (state === 'ok') return SoupStoreLogin.restore(user, newLogin, true);
						if (state === 'error') return user.upkeep();
						SoupStoreLogin.expire(user);
					});
				}
				var assertion = result.data;
				if (typeof assertion !== 'string' || !assertion) return user.upkeep();
				if (assertion.charAt(0) === ';') {
					// e.g. the name is no longer available: let the usual popups explain
					SoupStoreLogin.clear();
					user.loaded = true;
					return user.finishRename(login.name || login.user, assertion);
				}
				SoupStoreLogin.withName(login, function (name) {
					SoupStoreLogin.logIn(name, assertion);
					if (new Date().getTime() - (login.issuedAt || 0) > ROTATE_AFTER) {
						SoupStoreLogin.refresh(login, function () {});
					}
				});
			});
		},
		/**
		 * Swap the token for a new one that lasts another 14 days, and keep it only if PS
		 * says it worked. callback(state, login): 'ok', 'rejected' (PS refused) or 'error'.
		 */
		refresh: function (login, callback) {
			request('refreshtoken', {
				client_id: window.Config.oauth.clientId,
				token: login.token
			}, function (err, result) {
				if (err) return callback('error', null);
				var latest = SoupStoreLogin.load();
				if (!result || typeof result.success !== 'string' || !result.success) {
					// Another tab may have rotated it first; that tab's token is the good one
					if (latest && latest.token !== login.token) return callback('ok', latest);
					return callback('rejected', null);
				}
				var newLogin = { token: result.success, user: login.user, name: login.name, issuedAt: new Date().getTime() };
				SoupStoreLogin.save(newLogin);
				callback('ok', newLogin);
			});
		},
		/** The saved token no longer works: forget it and carry on as a guest */
		expire: function (user) {
			SoupStoreLogin.clear();
			window.app.addPopupMessage("Your Pokémon Showdown login has expired, so you're not logged in. Choose \"Log in with Pokémon Showdown\" to log in again.");
			user.upkeep();
		}
	};

	exports.SoupStoreLogin = SoupStoreLogin;
})(window, jQuery);
