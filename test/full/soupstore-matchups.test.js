// Soup Store: teambuilder type matchups (src/soupstore-matchups.ts).
// Needs a full build against our server repo (soupstore/build.sh).
const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const {describe, it} = require('node:test');
const vm = require('vm');

const data = '../../play.pokemonshowdown.com/data/';
global.window = global;
global.Config = {routes: {client: 'play.soupstore.dev'}};
global.BattlePokedex = require(data + 'pokedex.js').BattlePokedex;
global.BattleMovedex = require(data + 'moves.js').BattleMovedex;
global.BattleItems = require(data + 'items.js').BattleItems;
global.BattleAbilities = require(data + 'abilities.js').BattleAbilities;
global.BattleTypeChart = require(data + 'typechart.js').BattleTypeChart;
global.BattleTeambuilderTable = require(data + 'teambuilder-tables.js').BattleTeambuilderTable;
require('../../play.pokemonshowdown.com/js/battle-dex-data.js');
require('../../play.pokemonshowdown.com/js/battle-dex.js');
// Their classes are script globals, not exports
for (const file of ['battle-log.js', 'battle-tooltips.js', 'soupstore-matchups.js']) {
	const filename = path.resolve(__dirname, '../../play.pokemonshowdown.com/js', file);
	vm.runInThisContext(fs.readFileSync(filename, 'utf8'), {filename});
}
const Matchups = vm.runInThisContext('SoupStoreMatchups');
const dex = Dex.mod('champions');

function defense(set) {
	const result = {};
	for (const [type, {mult}] of Object.entries(Matchups.defense(set, dex))) result[type] = mult;
	return result;
}
function offense(set) {
	const table = Matchups.offense(set, dex);
	if (!table) return null;
	const result = {};
	for (const [type, {mult}] of Object.entries(table)) result[type] = mult;
	return result;
}

describe('Soup Store type matchups', () => {
	it('uses the 18 types', () => {
		assert.equal(Matchups.types(dex).length, 18);
		assert.ok(!Matchups.types(dex).includes('Stellar'));
	});

	it('combines both types defensively', () => {
		const garchomp = defense({species: 'Garchomp', ability: 'Rough Skin', moves: []});
		assert.equal(garchomp.Ice, 4);
		assert.equal(garchomp.Dragon, 2);
		assert.equal(garchomp.Fairy, 2);
		assert.equal(garchomp.Electric, 0);
		assert.equal(garchomp.Fire, 0.5);
		assert.equal(garchomp.Rock, 0.5);
		assert.equal(garchomp.Water, 1);
	});

	it('applies abilities and items', () => {
		assert.equal(defense({species: 'Rotom-Wash', ability: 'Levitate'}).Ground, 0);
		// Iron Ball grounds it, so its Electric type makes it weak
		assert.equal(defense({species: 'Rotom-Wash', ability: 'Levitate', item: 'Iron Ball'}).Ground, 2);
		assert.equal(defense({species: 'Heatran', ability: 'Flash Fire'}).Fire, 0);
		assert.equal(defense({species: 'Heatran', ability: 'Flame Body'}).Fire, 1);
		assert.equal(defense({species: 'Heatran', ability: 'Flame Body'}).Ground, 4);
		assert.equal(defense({species: 'Heatran', ability: 'Flame Body', item: 'Air Balloon'}).Ground, 0);
		assert.equal(defense({species: 'Mamoswine', ability: 'Thick Fat'}).Fire, 1);
		assert.equal(defense({species: 'Toxapex', ability: 'Regenerator'}).Ground, 2);
		assert.equal(defense({species: 'Skarmory', ability: 'Sturdy', item: 'Iron Ball'}).Ground, 2);
		assert.equal(defense({species: 'Tyranitar', ability: 'Sand Stream'}).Fighting, 4);
		assert.equal(defense({species: 'Paldean Wooper', ability: 'Water Absorb'}).Water, 0);
		assert.equal(defense({species: 'Jellicent', ability: 'Water Absorb'}).Water, 0);
		assert.equal(defense({species: 'Toxicroak', ability: 'Dry Skin'}).Fire, 1.25);
		// Filter: super-effective hits x0.75
		assert.equal(defense({species: 'Mr. Mime', ability: 'Filter'}).Poison, 1.5);
		assert.equal(defense({species: 'Shedinja', ability: 'Wonder Guard'}).Water, 0);
		assert.equal(defense({species: 'Shedinja', ability: 'Wonder Guard'}).Fire, 2);

		// 4x resistances
		const heatran = defense({species: 'Heatran', ability: 'Flame Body'});
		assert.equal(heatran.Bug, 0.25);
		assert.equal(heatran.Grass, 0.25);
		assert.equal(heatran.Steel, 0.25);

		const matchup = Matchups.defense({species: 'Rotom-Wash', ability: 'Levitate'}, dex).Ground;
		assert.deepEqual(matchup.notes, ['Levitate']);
	});

	it('uses the Mega forme when holding its Mega Stone', () => {
		const charizard = defense({species: 'Charizard', ability: 'Blaze', item: 'Charizardite X'});
		assert.equal(charizard.Ground, 2);
		assert.equal(charizard.Rock, 2);
		assert.equal(charizard.Flying, 1);
		assert.equal(charizard.Dragon, 2);
		assert.equal(charizard.Electric, 0.5);
		assert.equal(Matchups.forSet({species: 'Charizard', item: 'Charizardite X', moves: []}, dex).mega, 'Charizard-Mega-X');
		assert.equal(Matchups.forSet({species: 'Charizard', item: 'Leftovers', moves: []}, dex).mega, null);
		assert.match(Matchups.renderCardStrip({species: 'Charizard', item: 'Charizardite X', moves: []}, dex, true), /as Charizard-Mega-X/);
		// Mega abilities, e.g. Mega Metagross's Tough Claws doesn't keep Clear Body; Mega Latias keeps Levitate
		assert.equal(defense({species: 'Latias', ability: 'Levitate', item: 'Latiasite'}).Ground, 0);
		// Wrong species: no Mega
		assert.equal(defense({species: 'Blastoise', item: 'Charizardite X'}).Electric, 2);
	});

	it('picks the best damaging move against each type', () => {
		const chomp = offense({species: 'Garchomp', ability: 'Rough Skin', moves: ['Earthquake', 'Outrage', 'Swords Dance']});
		assert.equal(chomp.Fire, 2);
		assert.equal(chomp.Dragon, 2);
		assert.equal(chomp.Flying, 1); // Outrage
		assert.equal(chomp.Fairy, 1); // Earthquake
		assert.equal(chomp.Steel, 2);
		const table = Matchups.offense({species: 'Garchomp', moves: ['Earthquake', 'Outrage']}, dex);
		assert.equal(table.Fire.move, 'Earthquake');

		assert.equal(offense({species: 'Clefable', moves: ['Calm Mind', 'Moonlight']}), null);
		assert.equal(offense({species: 'Gengar', moves: ['Shadow Ball']}).Normal, 0);
		assert.equal(offense({species: 'Gengar', moves: ['Shadow Ball']}).Dark, 0.5);
	});

	it('handles special moves and abilities', () => {
		assert.equal(offense({species: 'Lapras', moves: ['Freeze-Dry']}).Water, 2);
		assert.equal(offense({species: 'Hawlucha', moves: ['Flying Press']}).Grass, 2);
		assert.equal(offense({species: 'Hawlucha', moves: ['Flying Press']}).Fighting, 2);
		assert.equal(offense({species: 'Hawlucha', moves: ['Flying Press']}).Ghost, 0);
		assert.equal(offense({species: 'Zygarde', moves: ['Thousand Arrows']}).Flying, 1);
		assert.equal(offense({species: 'Kangaskhan', ability: 'Scrappy', moves: ['Return']}).Ghost, 1);
		assert.equal(offense({species: 'Sylveon', ability: 'Pixilate', moves: ['Hyper Voice']}).Dragon, 2);
		assert.equal(offense({species: 'Sylveon', ability: 'Pixilate', moves: ['Hyper Voice']}).Ghost, 1);
		assert.equal(offense({species: 'Sylveon', ability: 'Cute Charm', moves: ['Hyper Voice']}).Ghost, 0);
		assert.equal(offense({species: 'Yanmega', ability: 'Tinted Lens', moves: ['Bug Buzz']}).Fire, 1);
		assert.equal(offense({species: 'Ninetales', ability: 'Drought', moves: ['Weather Ball']}).Grass, 2);
		assert.equal(offense({species: 'Ninetales', ability: 'Flash Fire', moves: ['Weather Ball']}).Grass, 1);
		assert.equal(offense({species: 'Ogerpon-Wellspring', moves: ['Ivy Cudgel']}).Fire, 2);
		// Fixed damage ignores resistances, but not immunities
		assert.equal(offense({species: 'Chansey', moves: ['Seismic Toss']}).Steel, 1);
		assert.equal(offense({species: 'Chansey', moves: ['Seismic Toss']}).Ghost, 0);
		// Mega abilities count too: Mega Altaria's Pixilate
		assert.equal(offense({species: 'Altaria', item: 'Altarianite', moves: ['Hyper Voice']}).Dragon, 2);
	});

	it('weights the team delta', () => {
		const team = [
			{species: 'Garchomp', ability: 'Rough Skin', moves: ['Earthquake', 'Outrage']},
			{species: 'Corviknight', ability: 'Pressure', moves: ['Brave Bird']},
			{species: 'Rotom-Wash', ability: 'Levitate', moves: ['Hydro Pump', 'Volt Switch']},
			{species: 'Clefable', ability: 'Magic Guard', moves: ['Calm Mind']},
		];
		const summary = Object.fromEntries(Matchups.teamSummary(team, dex).map(row => [row.type, row]));
		// Ice: Garchomp 4x (+2), Corviknight 1/2 (-1), Rotom-Wash 1x, Clefable 1x
		assert.equal(summary.Ice.defenseDelta, 1);
		assert.deepEqual(summary.Ice.weak, ['Garchomp']);
		// Bug: Garchomp 1x, Corviknight 1/4 (-2), Rotom-Wash 1x, Clefable 1/2 (-1)
		assert.equal(summary.Bug.defenseDelta, -3);
		assert.deepEqual(summary.Bug.resist, ['Corviknight', 'Clefable']);
		// Steel: Garchomp 1x, Corviknight 1/2 (-1), Rotom-Wash 1/4 (-2), Clefable 2x (+1)
		assert.equal(summary.Steel.defenseDelta, -2);
		// Ground: Garchomp 1x, Corviknight immune (-2), Rotom-Wash Levitate (-2), Clefable 1x
		assert.equal(summary.Ground.defenseDelta, -4);
		assert.deepEqual(summary.Ground.immune, ['Corviknight', 'Rotom-Wash']);
		// Offense against Steel: Garchomp EQ +1, Corviknight Brave Bird -1, Rotom Hydro Pump 0; Clefable has no attacks
		assert.equal(summary.Steel.offenseDelta, 0);
		assert.deepEqual(summary.Steel.superEffective, ['Garchomp']);
		// Against Ground: Garchomp EQ 0... Outrage 1x, Corviknight 1x, Rotom Hydro Pump +1
		assert.equal(summary.Ground.offenseDelta, 1);
	});

	it('weights 4x the same in both directions', () => {
		assert.deepEqual([4, 2, 1.5, 1, 0.5, 0.25, 0].map(mult => Matchups.defenseWeight(mult)), [2, 1, 1, 0, -1, -2, -2]);
		assert.deepEqual([4, 2, 1.5, 1, 0.5, 0.25, 0].map(mult => Matchups.offenseWeight(mult)), [2, 1, 1, 0, -1, -2, -2]);
		const strip = Matchups.renderCardStrip({species: 'Heatran', ability: 'Flame Body', moves: []}, dex, true);
		assert.match(strip, /Bug: takes ×¼/);
		assert.match(strip, /<small>×¼<\/small>/);
	});

	it('renders escaped HTML', () => {
		const strip = Matchups.renderCardStrip({species: 'Rotom-Wash', ability: 'Levitate', moves: ['Hydro Pump']}, dex, true);
		assert.match(strip, /class="ss-matchups ss-open"/);
		assert.match(strip, /Ground: takes ×0 \(Levitate\)/);
		const summary = Matchups.renderTeamSummary([{name: '<b>', species: 'Garchomp', moves: ['Earthquake']}], dex, false);
		assert.ok(!summary.includes('<b>'));
		assert.match(summary, /&lt;b&gt;/);
		assert.equal(Matchups.renderTeamSummary([{species: ''}], dex, true), '');
	});
});
