// Applies Soup Store branding to the built client (soupstore/build.sh runs this).
// Works on the build output instead of upstream files, so upstream merges stay clean.
//   node soupstore/brand.mjs <brand dir> <output dir>
import fs from 'node:fs';
import path from 'node:path';

const [brandDir, out] = process.argv.slice(2);
if (!brandDir || !out) throw new Error('usage: brand.mjs <brand dir> <output dir>');
const here = import.meta.dirname;
const copy = (from, to) => fs.copyFileSync(path.join(brandDir, from), path.join(out, to));

// Images: same file names and sizes the upstream HTML already references
copy('header-logo.png', 'pokemonshowdownbeta.png');
copy('header-logo@2x.png', 'pokemonshowdownbeta@2x.png');
copy('favicon.ico', 'favicon.ico');
copy('icon-16.png', 'favicon-16.png');
copy('icon-32.png', 'favicon-32.png');
copy('icon-192.png', 'favicon-256.png');
copy('apple-touch-icon.png', 'apple-touch-icon.png');

fs.mkdirSync(path.join(out, 'soupstore'), { recursive: true });
fs.copyFileSync(path.join(here, 'soupstore.css'), path.join(out, 'soupstore', 'soupstore.css'));

// Web app manifest
const manifestPath = path.join(out, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
Object.assign(manifest, { short_name: 'Soup Store', name: 'Soup Store Showdown', theme_color: '#5c8477' });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// Page shell
const indexPath = path.join(out, 'caches', 'index-old.html');
let html = fs.readFileSync(indexPath, 'utf8');
const replace = (pattern, value, label) => {
	if (!pattern.test(html)) throw new Error(`brand.mjs: couldn't find ${label} in index-old.html (did upstream change it?)`);
	html = html.replace(pattern, value);
};
const version = Date.now().toString(36);
replace(/<title>[^<]*<\/title>/, '<title>Soup Store Showdown</title>', 'the <title>');
replace(/alt="Pok&eacute;mon Showdown! \(beta\)"/, 'alt="Soup Store"', 'the logo alt text');
replace(/(<link rel="stylesheet" href="[^"]*font-awesome\.css[^"]*"[^>]*>)/, `$1\n<link rel="stylesheet" href="/soupstore/soupstore.css?v=${version}" />`, 'the font-awesome stylesheet link');
replace(/\[failed to retrieve news\]/, '<p><em>Loading news&hellip;</em></p>', 'the news placeholder');
replace(/<div class="mainmenufooter">[\s\S]*?<\/small>\s*<\/div>/, `<div class="mainmenufooter">
		<div class="bgcredit"></div>
		<small>
			<a href="https://soupstore.dev" target="_blank">Soup Store</a> | <a href="https://replay.soupstore.dev" target="_blank">Replays</a> | <a href="//dex.pokemonshowdown.com/" target="_blank">Pok&eacute;dex</a> | <a href="https://github.com/s-elmer/soupstore-ps-client" target="_blank">Source</a> | Powered by <a href="https://pokemonshowdown.com" target="_blank">Pok&eacute;mon Showdown</a>
		</small>
	</div>`, 'the main menu footer');
fs.writeFileSync(indexPath, html);
console.log('Applied Soup Store branding');
