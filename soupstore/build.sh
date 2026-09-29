#!/usr/bin/env bash
# Builds the Soup Store client.
#
#   soupstore/build.sh <path to soupstore-ps-server checkout> [output dir]
#
# The teambuilder data (Pokedex, learnsets, formats, bans) is generated from our
# server repo, so it includes the championssoup mod and Soup Store formats. The
# server checkout needs its dependencies installed (npm ci) first.
# Output: a static site directory (default: soupstore/dist/) with no symlinks.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
server=$(cd "${1:?usage: soupstore/build.sh <server checkout> [output dir]}" && pwd)
out=${2:-"$repo/soupstore/dist"}
cd "$repo"

[ -f "$server/pokemon-showdown" ] || { echo "Not a pokemon-showdown checkout: $server" >&2; exit 1; }

# build-indexes reads server data from caches/pokemon-showdown
mkdir -p caches
if [ -L caches/pokemon-showdown ] || [ ! -e caches/pokemon-showdown ]; then
	ln -sfn "$server" caches/pokemon-showdown
else
	echo "caches/pokemon-showdown exists and isn't a symlink; remove it first" >&2; exit 1
fi

# Soup Store config (config/ is gitignored; routes.json is tracked upstream, so
# restore it afterwards to keep the working tree clean)
restore_routes() { git -C "$repo" checkout -- config/routes.json 2>/dev/null || true; }
trap restore_routes EXIT
mkdir -p config
cp soupstore/config/config.js soupstore/config/colors.json soupstore/config/coil.json config/
cp soupstore/config/routes.json config/routes.json

# Optional overrides, e.g. for a local test build over plain HTTP:
#   SOUPSTORE_LOCAL=1 SOUPSTORE_CLIENT_HOST=localhost:8081 SOUPSTORE_SERVER=localhost:8000 \
#   SOUPSTORE_REPLAYS_HOST=localhost:8080 soupstore/build.sh ../soupstore-ps-server
# SOUPSTORE_LOCAL turns on PS's test-client mode: the client normally only uses its
# configured server when served over HTTPS from Config.routes.client.
node - <<'NODE'
const fs = require('fs');
const env = process.env;
if (env.SOUPSTORE_CLIENT_HOST || env.SOUPSTORE_REPLAYS_HOST) {
	const routes = JSON.parse(fs.readFileSync('config/routes.json', 'utf8'));
	if (env.SOUPSTORE_CLIENT_HOST) routes.client = env.SOUPSTORE_CLIENT_HOST;
	if (env.SOUPSTORE_REPLAYS_HOST) routes.replays = env.SOUPSTORE_REPLAYS_HOST;
	fs.writeFileSync('config/routes.json', JSON.stringify(routes, null, 4) + '\n');
}
// For tests: turn on "Log in with Pokemon Showdown" against a mock login server
if (env.SOUPSTORE_OAUTH_CLIENT_ID) {
	const oauth = { clientId: env.SOUPSTORE_OAUTH_CLIENT_ID };
	if (env.SOUPSTORE_OAUTH_ROOT) oauth.root = env.SOUPSTORE_OAUTH_ROOT;
	if (env.SOUPSTORE_OAUTH_USERS_ROOT) oauth.usersRoot = env.SOUPSTORE_OAUTH_USERS_ROOT;
	fs.appendFileSync('config/config.js', `\nConfig.oauth = ${JSON.stringify(oauth)};\n`);
}
if (env.SOUPSTORE_SERVER) {
	const [host, port = '443'] = env.SOUPSTORE_SERVER.split(':');
	let config = fs.readFileSync('config/config.js', 'utf8');
	config = config.replace(/host: '[^']*'/, `host: '${host}'`)
		.replace(/\bport: \d+/, `port: ${Number(port)}`)
		.replace(/httpport: \d+/, `httpport: ${Number(port)}`);
	fs.writeFileSync('config/config.js', config);
}
if (env.SOUPSTORE_LOCAL) {
	const replays = env.SOUPSTORE_REPLAYS_HOST || 'localhost:8080';
	fs.appendFileSync('config/config.js', `
// Local test build (SOUPSTORE_LOCAL): never deploy this
Config.testclient = true;
// Test-client mode proxies login requests through manual popups unless a key is set;
// our logins already go straight to PS's login server with this placeholder session id.
var POKEMON_SHOWDOWN_TESTCLIENT_KEY = 'a';
Config.newsURL = 'http://${replays}/api/news';
`);
}
NODE

[ -d node_modules ] || npm ci --no-audit --no-fund
node build full --no-update

# Assemble the static site: copy, replace symlinks (config/*) with the files
# they point to, and drop server-side PHP and dev-only pages we don't serve.
rm -rf "$out"
mkdir -p "$out"
cp -R play.pokemonshowdown.com/. "$out/"
find "$out" -type l | while read -r link; do
	# Resolve from the link's original location (relative links point elsewhere after the copy)
	src="play.pokemonshowdown.com/${link#"$out"/}"
	rm "$link"
	if [ -f "$src" ]; then cp -L "$src" "$link"; fi
done
rm -rf "$out"/src "$out"/sprites "$out"/audio "$out"/swf "$out"/dirindex
find "$out" \( -name '*.php' -o -name 'testclient-*.html' -o -name 'index-new.html' -o -name '.htaccess' \) -delete
# Drop the tag for clean-cookies.php (PHP isn't served)
sed -i.bak '/clean-cookies\.php/d' "$out/caches/index-old.html" && rm -f "$out/caches/index-old.html.bak"

# Soup Store logo, icons, colors and footer (brand assets live in the server repo)
node soupstore/brand.mjs "$server/brand" "$out"

# Sprite dimension data is generated from the sprite images, which live on PS's
# servers (and are loaded from there), so use PS's copy.
OUT="$out" node -e '
	const fs = require("fs");
	(async () => {
		for (const f of ["pokedex-mini.js", "pokedex-mini-bw.js"]) {
			const res = await fetch("https://play.pokemonshowdown.com/data/" + f);
			if (!res.ok) throw new Error(f + ": HTTP " + res.status);
			fs.writeFileSync(process.env.OUT + "/data/" + f, await res.text());
		}
	})().catch(e => { console.error(e); process.exit(1); });
'


[ -f "$out/caches/index-old.html" ] && [ -f "$out/config/config.js" ] && [ -s "$out/data/pokedex-mini.js" ] \
	|| { echo "Build output incomplete" >&2; exit 1; }
echo "Built Soup Store client into $out"
