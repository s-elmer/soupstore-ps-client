// Soup Store: Champions team conversion and format filtering (src/oldclient/soupstore.js)
const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {describe, it} = require('node:test');

function load(prefs = {}, formats = undefined) {
	const context = {Storage: {prefs: prop => prefs[prop]}, BattleFormats: formats};
	context.window = context;
	const file = path.resolve(__dirname, '../play.pokemonshowdown.com/src/oldclient/soupstore.js');
	vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, {filename: file});
	return context.SoupStore;
}

function set(evs, extra) {
	return {species: 'Garchomp', name: '', evs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...evs}, ...extra};
}

describe('SoupStore.convertChampionsSets', () => {
	const SoupStore = load();

	it('converts Stat Points to the equivalent EVs', () => {
		assert.equal(SoupStore.statPointsToEVs(0), 0);
		assert.equal(SoupStore.statPointsToEVs(1), 4);
		assert.equal(SoupStore.statPointsToEVs(2), 12);
		assert.equal(SoupStore.statPointsToEVs(32), 252);

		// 65 Stat Points, 508 EVs
		const {sets, warnings} = SoupStore.convertChampionsSets([set({hp: 2, atk: 32, spe: 31})]);
		assert.deepEqual({...sets[0].evs}, {hp: 12, atk: 252, def: 0, spa: 0, spd: 0, spe: 244});
		assert.deepEqual(Array.from(warnings), []);
	});

	it('gives the same stats at Level 50 as Champions does', () => {
		// Champions: floor((2B + 31 + max(2SP - 1, 0)) * 50/100); mainline: floor((2B + 31 + floor(EV/4)) * 50/100)
		for (let sp = 0; sp <= 32; sp++) {
			assert.equal(Math.floor(SoupStore.statPointsToEVs(sp) / 4), Math.max(2 * sp - 1, 0), `${sp} SP`);
		}
	});

	it('sets Level 100 and clears IVs and Tera', () => {
		const {sets} = SoupStore.convertChampionsSets([
			set({atk: 32, spe: 32}, {level: 50, ivs: {hp: 31, atk: 0}, teraType: 'Fire'}),
		]);
		assert.equal(sets[0].level, undefined);
		assert.equal(sets[0].ivs, undefined);
		assert.equal(sets[0].teraType, undefined);
	});

	it('handles sets with no Stat Points', () => {
		const {sets} = SoupStore.convertChampionsSets([{species: 'Shuckle', name: ''}]);
		assert.deepEqual({...sets[0].evs}, {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0});
	});

	it('trims the smallest stat of spreads over 510 EVs, and warns', () => {
		// 32/32/2 is 252 + 252 + 12 = 516
		let {sets, warnings} = SoupStore.convertChampionsSets([set({hp: 32, def: 32, spd: 2}), set({hp: 2, atk: 32, spe: 31})]);
		assert.deepEqual({...sets[0].evs}, {hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0});
		assert.deepEqual({...sets[1].evs}, {hp: 12, atk: 252, def: 0, spa: 0, spd: 0, spe: 244});
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /^Garchomp's Stat Points convert to 516 EVs, over the limit of 510, so its SpD EVs were lowered from 12 to 4\.$/);

		// 32/31/3 is 252 + 244 + 20 = 516; 32/32/1/1 is 512
		({sets, warnings} = SoupStore.convertChampionsSets([set({atk: 32, spe: 31, hp: 3}, {name: 'Chompy'}), set({atk: 32, spe: 32, hp: 1, def: 1})]));
		assert.deepEqual({...sets[0].evs}, {hp: 12, atk: 252, def: 0, spa: 0, spd: 0, spe: 244});
		assert.deepEqual({...sets[1].evs}, {hp: 0, atk: 252, def: 4, spa: 0, spd: 0, spe: 252});
		assert.match(warnings[0], /^Chompy's .* HP EVs were lowered from 20 to 12\.$/);
		assert.match(warnings[1], /HP EVs were lowered from 4 to 0\.$/);
		for (const converted of sets) {
			assert.ok(Object.values(converted.evs).reduce((a, b) => a + b) <= 510);
		}
	});

	it("refuses teams that already use EVs", () => {
		const {error, sets} = SoupStore.convertChampionsSets([set({atk: 252, spe: 252, hp: 4})]);
		assert.equal(sets, undefined);
		assert.match(error, /^Garchomp has 252 in Atk, but Champions Stat Points only go up to 32/);
		assert.ok(SoupStore.convertChampionsSets([]).error);
	});
});

describe('SoupStore format filtering', () => {
	const formats = {
		gen9randombattle: {effectType: 'Format', searchShow: true, challengeShow: true, isTeambuilderFormat: false},
		gen9ou: {effectType: 'Format', searchShow: true, challengeShow: true, isTeambuilderFormat: true},
		gen9soupstoreseason4: {effectType: 'Format', searchShow: true, challengeShow: true, isTeambuilderFormat: true},
	};

	it('hides other formats unless all formats are shown', () => {
		assert.equal(load({}, formats).isFormatHidden('gen9ou'), true);
		assert.equal(load({}, formats).isFormatHidden('gen9soupstoreseason4'), false);
		assert.equal(load({allformats: true}, formats).isFormatHidden('gen9ou'), false);
	});

	it('defaults searches, challenges and new teams to our format', () => {
		for (const prefs of [{}, {allformats: true}]) {
			const SoupStore = load(prefs, formats);
			for (const selectType of ['search', 'challenge', 'teambuilder']) {
				assert.equal(SoupStore.defaultFormat(selectType), 'gen9soupstoreseason4', selectType);
			}
		}
		// If ours can't be searched for, searches keep PS's default
		const challengeOnly = {...formats, gen9soupstoreseason4: {...formats.gen9soupstoreseason4, searchShow: false}};
		assert.equal(load({}, challengeOnly).defaultFormat('search'), '');
		assert.equal(load({}, challengeOnly).defaultFormat('challenge'), 'gen9soupstoreseason4');
		assert.equal(load({}, undefined).defaultFormat('search'), '');
	});
});
