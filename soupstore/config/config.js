/** Soup Store client config. Copied to config/config.js by soupstore/build.sh. */
/** @type {import('../play.pokemonshowdown.com/src/client-main').PSConfig} */
var Config = Config || {};

/* version */ Config.version = "0";

Config.bannedHosts = [];

// Links to these domains open without a "this link leads outside" warning in chat.
Config.whitelist = [
	'soupstore.dev',
	'pokemonshowdown.com',
	'smogon.com',
	'wikipedia.org',
];

// The Soup Store game server.
Config.defaultserver = {
	id: 'soupstore',
	host: 'showdown.soupstore.dev',
	port: 443,
	httpport: 80,
	altport: 80,
	registered: false,
};

// Logins go straight to PS's login server so everyone uses their existing PS
// account (see play.pokemonshowdown.com/src/oldclient/client.js).
Config.loginServerHost = 'play.pokemonshowdown.com';


Config.roomsFirstOpenScript = function () {
};

Config.customcolors = {};
