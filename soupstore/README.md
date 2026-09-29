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
| `build-tools/build-indexes` | Generates each Soup Store format's species, move, item and ability bans (items also include those outside the format's item pool, like Z-Crystals, and Mega Stones for banned Megas) and combination bans (e.g. Alakazite + Nasty Plot) from the server's rule table. The item, ability and combination bans (`metagameItemBans`, `metagameAbilityBans`, `metagameComplexBans`) aren't used by this client; they're read by the [Soup Store Showdex](https://github.com/s-elmer/soupstore-showdex) extension |
| `src/oldclient/client-teambuilder.js` | Soup Store teams use Champions data for species and moves, but keep the mainline EV/IV editor and Level 100; Tera is hidden (banned) |
| `src/battle.ts`, `src/battle-tooltips.ts`, `src/battle-dex.ts` | Soup Store battles use Champions move data, PP and mechanics |
| `src/oldclient/soupstore.js` (new), `src/oldclient/client-teambuilder.js` | **Import from Champions** button in the teambuilder's Import/Export view: converts a pasted Champions team (e.g. `[Gen 9 Champions] NatDex Draft`) to Soup Store Season 4. Stat Points become the equivalent EVs (first point 4 EVs, then 8 each, so stats match exactly), Level 50 becomes 100, IVs and Tera are cleared. Spreads over 510 EVs lose the excess from their smallest invested stat, with a warning |
| `src/oldclient/client-mainmenu.js`, `src/oldclient/client-topbar.js`, `src/oldclient/client-teambuilder.js` | Format lists only show Soup Store formats unless **Show all formats** is on in Options (`allformats` pref). The home Battle! box, challenges and new teams start in ours either way |
| `src/soupstore-matchups.ts` (new), `src/oldclient/client-teambuilder.js` | **Type matchups** in the team view: a collapsible strip under each Pokémon's card (weaknesses, resistances and immunities; types its best move hits super-effectively, is resisted by, or can't affect) and a collapsible team summary table with weighted deltas (in both the defense and offense columns, + is good). Hovering a type in a Pokémon's offense rows lists every damaging move and how it hits that type. Accounts for abilities (via `BattleTooltips.getTypeAbilityWeakness`, plus Filter/Wonder Guard/Tinted Lens and others), Air Balloon/Iron Ball, the Mega a held Mega Stone turns it into, and moves like Freeze-Dry, Flying Press and -ate abilities (mirroring `BattleTooltips#getMoveType`). Collapse state is saved in the `soupstorematchups` pref; styles are in `soupstore/soupstore.css` |
| `src/oldclient/soupstore-login.js` (new), `client.js`, `client-topbar.js`, `soupstore/oauth-callback.{html,js}` (new) | **Log in with Pokémon Showdown** (stay logged in), hidden until `Config.oauth.clientId` is set. See [below](#log-in-with-pokémon-showdown-stay-logged-in). `client.js`: `receiveChallstr` tries a saved login first (the old `upkeep` code moved to `User.upkeep`), and `logout` forgets it |
| `index-old.html`, `testclient-old.html` | Load `soupstore.js`, `soupstore-login.js` and `soupstore-matchups.js` |

Why: the format uses Pokémon Champions mechanics with National Dex Pokémon and learnsets, but mainline Level 100 EVs/IVs. The upstream client picks all of this from the format name, and a name containing "Champions" would force Champions' Level 50 and Stat Points editor.

Soup Store config (`config/`, not tracked upstream) lives in `soupstore/config/` and is copied in by the build.

Branding is applied to the **build output** by `soupstore/brand.mjs`, so upstream files stay untouched:
- The logo, favicons and manifest are replaced with the files from the server repo's `brand/` folder.
- The page title, header logo alt text, news placeholder and main-menu footer are rewritten.
- `soupstore/soupstore.css` (green header, news styling) is added after the upstream styles.

If upstream changes the markup, `brand.mjs` fails loudly instead of silently skipping a step.

The build also produces `js/replay-embed.js`, which our replay site uses as its replay player so replays get the same Soup Store handling (Champions move data). `soupstore/Caddyfile` allows the replay site to load this site's fonts (CORS). Its Content-Security-Policy also allows what the [Soup Store Showdex](https://github.com/s-elmer/soupstore-showdex) extension loads into the page: Google Fonts, preset data from `pkmn.github.io`, and (in Firefox) the extension's own files. It also allows PokePaste (`pokepast.es`, plus `gist.githubusercontent.com` for importing), which the teambuilder's "Upload to PokePaste" and "Import from text or URL" use.

## Log in with Pokémon Showdown (stay logged in)

PS's own client stays logged in through a `sid` cookie from play.pokemonshowdown.com, which is a third-party cookie on our domain, so on its own our site forgets everyone between visits. This uses PS's OAuth-like flow ([OAUTH.md](https://github.com/smogon/pokemon-showdown-loginserver/blob/master/OAUTH.md)) instead:

1. **Login popup / password popup:** a "Log in with Pokémon Showdown" button opens `play.pokemonshowdown.com/api/oauth/authorize` in a popup (the player must already be logged in to PS in that browser). PS redirects to `soupstore/oauth-callback.html`, which saves the token in `localStorage` (`soupstore_login`), hands the assertion to the client window, and closes. If the browser blocks the popup, the same happens by leaving the page and coming back.
2. **Every later connection:** `receiveChallstr` trades the saved token and the server's challstr for a fresh assertion (`/api/oauth/api/getassertion`) and logs in with it. If that fails, it tries one `refreshtoken` (a just-expired token can still be rescued), and otherwise forgets the login, says so, and carries on as before (guest, password login still works).
3. **Rotation:** a token older than a week is replaced (`/api/oauth/api/refreshtoken`), as OAUTH.md advises. A login therefore lasts as long as the player visits at least every two weeks.
4. **Log out** forgets the token locally. PS has no way to revoke it from another site; players can do that at https://play.pokemonshowdown.com/api/oauth/authorized.

Things to know:
- **Off by default.** Nothing renders, listens or requests anything until `Config.oauth.clientId` is set in `soupstore/config/config.js` (it's a commented-out example). Removing it hides the feature again.
- **One token per account.** PS gives every browser and device of an account the same token, and a rotation replaces it, so a second browser is logged out when the first rotates and needs one click on the button.
- **Capitalized names.** OAuth only returns the lowercase userid; the proper capitalization comes from `https://pokemonshowdown.com/users/<id>.json` (allowed in the CSP), falling back to the id if it can't be fetched.
- **No `state` in PS's flow,** so the callback only acts on a login this browser started (a random nonce in `redirect_uri`, kept for 10 minutes). The token is stored by the callback page itself, so it never passes through the opener's JavaScript, and the URL is cleaned before anything else happens.
- The game server needs nothing: OAuth assertions carry the hostname `sim3.psim.us` (no server id is sent), which is already in `PS_LEGALHOSTS`. If a game server ever says an assertion is "for the wrong server", check that setting.

**Enabling it:**
1. Submit PS's form, [Pokemon Showdown OAuth Application](https://forms.gle/VAoSjqHn4zwem7tp9). Its four required fields: the `redirect_uri` (`https://play.soupstore.dev/soupstore/oauth-callback.html`; the origin is registered exactly, the path can change later), a Discord tag, the PS username of the site's operator, and a short description of what the app does.
2. When the client ID arrives, uncomment `Config.oauth` in `soupstore/config/config.js` with it (the ID is public), and deploy the client.
3. Try it from https://play.soupstore.dev: log in at play.pokemonshowdown.com in the same browser first, then use the button, reload, and check you're still logged in.

It can only be tried against the real login server from the registered origin, so local builds use a mock: `SOUPSTORE_OAUTH_CLIENT_ID`, `SOUPSTORE_OAUTH_ROOT` and `SOUPSTORE_OAUTH_USERS_ROOT` (environment variables for `build.sh`) turn it on and point it at one.

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

The image serves the built client with Caddy on port 8080, behind the main Caddy in the server repo's `deploy/` stack. The client only uses its configured game server when served over HTTPS from exactly `Config.routes.client`. `SOUPSTORE_CLIENT_HOST`, `SOUPSTORE_SERVER` and `SOUPSTORE_REPLAYS_HOST` (environment variables for `build.sh`, build args for the Dockerfile) override the hostnames, and `SOUPSTORE_LOCAL=1` builds a local test version in PS's test-client mode that works over plain HTTP. The server repo's `deploy/docker-compose.local.yml` uses these to run the client and server together on your laptop (see its `deploy/README.md`, "Local testing"). Never deploy a `SOUPSTORE_LOCAL` build.

Sprites and sounds aren't part of this repository; the client loads them from `play.pokemonshowdown.com`, and the build downloads PS's sprite-size data (`data/pokedex-mini*.js`) to match.
