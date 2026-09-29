// Where Pokemon Showdown sends the player after they authorize us
// (https://play.soupstore.dev/soupstore/oauth-callback.html?n=<nonce>&assertion=...&token=...&user=...).
// It saves the token, hands the assertion to the client window that opened this popup, and closes.
// Only acts on a login this browser started: see soupstore-login.js in the client (start()).
(function () {
	var STORAGE_KEY = 'soupstore_login';
	var PENDING_KEY = 'soupstore_login_pending';
	var RESULT_KEY = 'soupstore_login_result';
	var MAX_AGE = 10 * 60 * 1000;

	function goHome() {
		window.location.replace('/');
	}

	var query = new URLSearchParams(window.location.search);
	var token = query.get('token') || '';
	var user = (query.get('user') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
	var assertion = query.get('assertion') || '';
	var nonce = query.get('n') || '';

	// Take the credentials out of the address bar (and so out of history) right away
	try {
		window.history.replaceState(null, '', window.location.pathname);
	} catch (e) {}

	var pending = null;
	try {
		pending = JSON.parse(window.localStorage.getItem(PENDING_KEY) || 'null');
		window.localStorage.removeItem(PENDING_KEY);
	} catch (e) {}
	if (!pending || !nonce || pending.n !== nonce || new Date().getTime() - pending.t > MAX_AGE || !token || !user || !assertion) {
		// Nothing of ours is waiting for this (or the feature is off): ignore it
		return goHome();
	}

	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: token, user: user, issuedAt: new Date().getTime() }));
		// Popup blocked earlier: this is the whole page, and the client logs in from the token when it loads
		if (pending.mode === 'redirect') return goHome();
		// The client window that opened this popup listens for this (a storage event) and logs in
		window.localStorage.setItem(RESULT_KEY, JSON.stringify({ user: user, assertion: assertion }));
	} catch (e) {
		return goHome();
	}
	document.getElementById('message').textContent = 'Logged in! You can close this window.';
	window.close();
})();
