# Soup Store client

This is the [Soup Store](https://soupstore.dev) draft league's build of the [Pokémon Showdown client](https://github.com/smogon/pokemon-showdown-client), served at **https://play.soupstore.dev**. It connects to our game server (`showdown.soupstore.dev`) and uses PS's own login server, so everyone signs in with their existing Pokémon Showdown account.

The client is licensed under the **AGPLv3** (see [`LICENSE`](../LICENSE)); this repository is the source for what runs at play.soupstore.dev. The game server lives in a separate repository.

## Branches

- `master`: an untouched copy of upstream `smogon/pokemon-showdown-client`
- `soupstore` (default): our changes on top of it

To pull in upstream changes:

```bash
git fetch upstream
git switch master && git merge --ff-only upstream/master && git push origin master
git switch soupstore && git merge master
```

## What we changed

All Soup Store-specific code is either in this `soupstore/` folder or marked with a `Soup Store` comment:

| File | Change |
|---|---|
| `src/oldclient/client.js` | `Config.loginServerHost`: login requests go straight to PS's login server (which allows cross-origin requests) with a placeholder session id, since PS's session cookie is third-party on our domain |
| `src/oldclient/client-topbar.js` | Login popup notes that the password goes directly to PS's login server |
| `src/oldclient/client-mainmenu.js` | `Config.newsURL`: the News box loads posts live from our replay site's `/api/news` (Markdown posts plus `/news` chat posts), with the same unread tracking as upstream |
| `src/oldclient/client.js` | `Config.title` names the site in browser tabs |
| `src/battle-dex-search.ts` | Soup Store formats (`gen9soupstore*`) search the Champions + National Dex tables and apply that format's banlist; banned moves aren't listed as learnable (they appear under "Illegal results") |
| `build-tools/build-indexes` | Generates each Soup Store format's species and move bans from the server's rule table |
| `src/oldclient/client-teambuilder.js` | Soup Store teams use Champions data for species and moves, but keep the mainline EV/IV editor and Level 100; Tera is hidden (banned) |
| `src/battle.ts`, `src/battle-tooltips.ts`, `src/battle-dex.ts` | Soup Store battles use Champions move data, PP and mechanics |

Why: the format uses Pokémon Champions mechanics with National Dex Pokémon and learnsets, but mainline Level 100 EVs/IVs. The upstream client picks all of this from the format name, and a name containing "Champions" would force Champions' Level 50 and Stat Points editor.

Soup Store config (`config/`, not tracked upstream) lives in `soupstore/config/` and is copied in by the build.

Branding is applied to the **build output** by `soupstore/brand.mjs`, so upstream files stay untouched:
- The logo, favicons and manifest are replaced with the files from the server repo's `brand/` folder.
- The page title, header logo alt text, news placeholder and main-menu footer are rewritten.
- `soupstore/soupstore.css` (green header, news styling) is added after the upstream styles.

If upstream changes the markup, `brand.mjs` fails loudly instead of silently skipping a step.

The build also produces `js/replay-embed.js`, which our replay site uses as its replay player so replays get the same Soup Store handling (Champions move data). `soupstore/Caddyfile` allows the replay site to load this site's fonts (CORS).

## Building

The teambuilder data is generated from **our server repo**, so it includes our formats and bans. Check both repos out side by side, then:

```bash
(cd ../soupstore-ps-server && npm ci)
npm ci
soupstore/build.sh ../soupstore-ps-server    # output: soupstore/dist/
```

`npm test` afterwards includes `test/full/soupstore.test.js` (move bans and Champions move text for our formats).

As a container (what production runs):

```bash
docker build -f soupstore/Dockerfile --build-context server=../soupstore-ps-server -t soupstore-client .
```

Production images are built by the server repo's GitHub Actions workflow, which checks out this repo's `soupstore` branch. Pushing to `soupstore` here starts that workflow (`.github/workflows/soupstore-deploy.yml`, if the `SERVER_DEPLOY_TOKEN` secret is set), so client changes deploy automatically.

The image serves the built client with Caddy on port 8080, behind the main Caddy in the server repo's `deploy/` stack. The client only uses its configured game server when served over HTTPS from exactly `Config.routes.client`, so a meaningful end-to-end test needs the real domain. `SOUPSTORE_CLIENT_HOST`, `SOUPSTORE_SERVER` and `SOUPSTORE_REPLAYS_HOST` (environment variables for `build.sh`, build args for the Dockerfile) override the hostnames for staging setups.

Sprites and sounds aren't part of this repository; the client loads them from `play.pokemonshowdown.com`, and the build downloads PS's sprite-size data (`data/pokedex-mini*.js`) to match.
