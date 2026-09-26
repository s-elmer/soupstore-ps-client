// Soup Store: teambuilder behavior for our formats (see soupstore/README.md).
// Needs a full build against our server repo (soupstore/build.sh).
const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const {describe, it} = require('node:test');
const vm = require('vm');

const data = '../../play.pokemonshowdown.com/data/';
global.window = global;
global.BattlePokedex = require(data + 'pokedex.js').BattlePokedex;
global.BattleMovedex = require(data + 'moves.js').BattleMovedex;
global.BattleItems = require(data + 'items.js').BattleItems;
global.BattleAbilities = require(data + 'abilities.js').BattleAbilities;
global.BattleTypeChart = require(data + 'typechart.js').BattleTypeChart;
global.BattleLearnsets = require(data + 'learnsets.js').BattleLearnsets;
global.BattleTeambuilderTable = require(data + 'teambuilder-tables.js').BattleTeambuilderTable;
global.BattleText = require(data + 'text/en.js').BattleText;
require('../../play.pokemonshowdown.com/js/battle-dex-data.js');
require('../../play.pokemonshowdown.com/js/battle-dex.js');
// Its classes are script globals, not exports
const searchPath = path.resolve(__dirname, '../../play.pokemonshowdown.com/js/battle-dex-search.js');
const DexSearch = vm.runInThisContext(`${fs.readFileSync(searchPath, 'utf8')}\nDexSearch;`, {filename: searchPath});

const FORMAT = 'gen9soupstoreseason4';

function learnableMoves(species) {
	const search = new DexSearch('', 'move', FORMAT);
	search.setType('move', FORMAT, {species, moves: []});
	return search.typedSearch.getResults().filter(([type]) => type === 'move').map(([, id]) => id);
}

describe('Soup Store teambuilder', () => {
	it('generates the format move bans from the server rules', () => {
		const bans = BattleTeambuilderTable.natdexchampions.metagameMoveBans.soupstoreseason4;
		for (const id of ['hiddenpower', 'hiddenpowerfire', 'shedtail', 'lastrespects', 'doubleteam', 'fissure']) {
			assert.ok(id in bans, id);
		}
		// Complex bans (e.g. Lopunnite + Swords Dance) don't ban the move itself
		assert.ok(!('swordsdance' in bans));
		assert.ok(!('batonpass' in bans));
	});

	it("doesn't list banned moves as learnable", () => {
		const moves = learnableMoves('Clefable');
		assert.ok(moves.includes('moonblast'));
		assert.ok(!moves.some(id => id.startsWith('hiddenpower')));
		assert.ok(!learnableMoves('Smeargle').includes('shedtail'));
	});

	it('shows Champions move text', () => {
		const dex = Dex.forFormat(FORMAT);
		assert.equal(dex.modid, 'champions');
		assert.match(dex.text.get(dex.moves.get('Moonblast')).shortDesc, /10% chance/);
		assert.match(dex.text.get(dex.moves.get('Rage Fist')).shortDesc, /Resets on switch-out/);
	});
});
