/**
 * Soup Store: type matchups for the teambuilder (see soupstore/README.md)
 *
 * For each Pokémon: which attacking types it's weak to, resists or is immune
 * to (defense), and how well its best damaging move hits each type (offense).
 * For the team: a weighted delta per type.
 *
 * Besides types, this accounts for effects the teambuilder knows about: the
 * set's ability and item, the Mega a held Mega Stone turns it into, and moves
 * whose type or effectiveness is special. Battle-dependent effects (weather set
 * by others, terrain, Tera, volatiles) are ignored.
 *
 * The move rules mirror BattleTooltips#getMoveType and #getMoveEffectiveness
 * (battle-tooltips.ts), which need a live battle so can't be called here. Keep
 * them in sync.
 *
 * Dependencies: battledata, battle-tooltips
 */

import { BattleLog } from "./battle-log";
import { BattleTooltips } from "./battle-tooltips";
import { Dex, type ModdedDex, toID } from "./battle-dex";

declare const require: any;
declare const global: any;

export interface MatchupSet {
	name?: string;
	species: string;
	item?: string;
	ability?: string;
	moves?: string[];
}

export interface Matchup {
	/** Damage multiplier: 0, 0.25, 0.5, 1, 2, 4, or in-between with abilities */
	mult: number;
	/** Why it differs from plain type effectiveness, e.g. "Levitate" */
	notes: string[];
	/** Offense only: the best move against this type */
	move?: string;
	/** Offense only: every damaging move against this type, best first */
	moves?: MoveMatchup[];
}

export interface MoveMatchup {
	name: string;
	mult: number;
	notes: string[];
}

export interface SetMatchups {
	name: string;
	/** The Mega it battles as, if it holds its Mega Stone */
	mega: string | null;
	/** attacking type -> how it hits this Pokémon */
	defense: Record<string, Matchup>;
	/** defending type -> this Pokémon's best move against it; null if it has no damaging moves */
	offense: Record<string, Matchup> | null;
}

export interface TypeSummary {
	type: Dex.TypeName;
	weak: string[];
	resist: string[];
	immune: string[];
	/** + means the team handles this type well */
	defenseDelta: number;
	superEffective: string[];
	resisted: string[];
	noEffect: string[];
	/** + means the team hits this type well */
	offenseDelta: number;
}

const EFFECTIVENESS = [1, 2, 0.5, 0];
/** Moves -ate abilities and Normalize don't change (BattleTooltips#getMoveType's noTypeOverride) */
const NO_TYPE_OVERRIDE = [
	'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'struggle', 'technoblast', 'terrainpulse', 'weatherball',
];
const ATE_ABILITIES: { [abilityid: string]: Dex.TypeName } = {
	aerilate: 'Flying', dragonize: 'Dragon', galvanize: 'Electric', pixilate: 'Fairy', refrigerate: 'Ice',
};
/** Abilities that set weather or terrain on switch-in, for Weather Ball and Terrain Pulse */
const WEATHER_BALL_TYPES: { [abilityid: string]: Dex.TypeName } = {
	drought: 'Fire', orichalcumpulse: 'Fire', megasol: 'Fire', drizzle: 'Water', sandstream: 'Rock', snowwarning: 'Ice',
};
const TERRAIN_PULSE_TYPES: { [abilityid: string]: Dex.TypeName } = {
	electricsurge: 'Electric', hadronengine: 'Electric', grassysurge: 'Grass', mistysurge: 'Fairy', psychicsurge: 'Psychic',
};
const FORME_MOVE_TYPES: { [moveid: string]: { [species: string]: Dex.TypeName } } = {
	ivycudgel: {
		'Ogerpon-Wellspring': 'Water', 'Ogerpon-Hearthflame': 'Fire', 'Ogerpon-Cornerstone': 'Rock',
	},
	ragingbull: {
		'Tauros-Paldea-Combat': 'Fighting', 'Tauros-Paldea-Blaze': 'Fire', 'Tauros-Paldea-Aqua': 'Water',
	},
};

export const SoupStoreMatchups = new class {
	types(dex: ModdedDex): readonly Dex.TypeName[] {
		return dex.types.names().filter(type => type !== 'Stellar');
	}

	/** The species and ability the set battles as: its Mega, if it holds its Mega Stone */
	battleForme(set: MatchupSet, dex: ModdedDex) {
		let species = dex.species.get(set.species);
		let ability = dex.abilities.get(set.ability || '').name || '';
		let isMega = false;
		const item = dex.items.get(set.item || '');
		const megaName = item.megaStone?.[species.name] || item.megaStone?.[species.baseSpecies];
		if (megaName) {
			const mega = dex.species.get(megaName);
			if (mega.exists) {
				species = mega;
				ability = mega.abilities[0];
				isMega = true;
			}
		}
		return { species, ability, isMega };
	}

	/** Plain type effectiveness of an attacking type against a defending type (1, 2, 0.5 or 0) */
	typeEffectiveness(attackType: string, defenseType: string, dex: ModdedDex) {
		const damageTaken = dex.types.get(defenseType).damageTaken as { [type: string]: Dex.WeaknessType } | undefined;
		return EFFECTIVENESS[damageTaken?.[attackType] || 0];
	}

	defense(set: MatchupSet, dex: ModdedDex): Record<string, Matchup> {
		const { species, ability } = this.battleForme(set, dex);
		const abilityid = toID(ability);
		const itemid = toID(set.item);
		const result: Record<string, Matchup> = {};
		for (const attackType of this.types(dex)) {
			const notes: string[] = [];
			let mult = 1;
			for (const type of species.types) {
				let factor = this.typeEffectiveness(attackType, type, dex);
				if (factor === 0 && itemid === 'ringtarget') {
					factor = 1;
					notes.push('Ring Target');
				}
				if (factor === 0 && attackType === 'Ground' && type === 'Flying' && itemid === 'ironball') {
					factor = 1;
					notes.push('Iron Ball');
				}
				mult *= factor;
			}
			if (mult !== 0) {
				const isLevitate = ['levitate', 'eelevate'].includes(abilityid);
				if (attackType === 'Ground' && isLevitate && itemid === 'ironball') {
					notes.push('Iron Ball');
				} else {
					const factor = BattleTooltips.getTypeAbilityWeakness(attackType, abilityid, dex, true);
					if (factor !== 1) {
						mult *= factor;
						notes.push(ability);
					}
				}
			}
			if (mult !== 0 && attackType === 'Ground' && itemid === 'airballoon') {
				mult = 0;
				notes.push('Air Balloon (until popped)');
			}
			if (mult !== 0 && attackType === 'Fire' && abilityid === 'dryskin') {
				mult *= 1.25;
				notes.push(ability);
			}
			if (mult > 1 && ['filter', 'solidrock', 'prismarmor'].includes(abilityid)) {
				mult *= 0.75;
				notes.push(ability);
			}
			if (mult > 0 && mult <= 1 && abilityid === 'wonderguard') {
				mult = 0;
				notes.push(ability);
			}
			result[attackType] = { mult, notes };
		}
		return result;
	}

	/** The type a move has when this set uses it, mirroring BattleTooltips#getMoveType */
	moveType(move: Dex.Move, set: MatchupSet, dex: ModdedDex): { type: Dex.TypeName, note: string } {
		const { species, ability } = this.battleForme(set, dex);
		const abilityid = toID(ability);
		const item = dex.items.get(set.item || '');
		let type = move.type;
		let note = '';
		if (move.id === 'revelationdance') type = species.types[0];
		if (move.id === 'multiattack' && item.onMemory) type = item.onMemory;
		if (move.id === 'judgment' && item.onPlate && !item.zMoveType) type = item.onPlate;
		if (move.id === 'technoblast' && item.onDrive) type = item.onDrive;
		if (move.id === 'weatherball' && WEATHER_BALL_TYPES[abilityid]) {
			type = WEATHER_BALL_TYPES[abilityid];
			note = ability;
		}
		if (move.id === 'terrainpulse' && TERRAIN_PULSE_TYPES[abilityid]) {
			type = TERRAIN_PULSE_TYPES[abilityid];
			note = ability;
		}
		const formeType = FORME_MOVE_TYPES[move.id]?.[species.name.replace(/-Tera$/, '')];
		if (formeType) type = formeType;

		if (!NO_TYPE_OVERRIDE.includes(move.id) && !move.id.startsWith('hiddenpower')) {
			if (type === 'Normal' && ATE_ABILITIES[abilityid]) {
				type = ATE_ABILITIES[abilityid];
				note = ability;
			}
			if (abilityid === 'normalize' && type !== 'Normal') {
				type = 'Normal';
				note = ability;
			}
			if (move.flags['sound'] && abilityid === 'liquidvoice' && type !== 'Water') {
				type = 'Water';
				note = ability;
			}
		}
		return { type, note: note && `${ability}: ${type}` };
	}

	/**
	 * How hard a damaging move hits a defending type, mirroring the
	 * battle-independent parts of BattleTooltips#getMoveEffectiveness
	 */
	moveEffectiveness(
		move: Dex.Move, moveType: string, defenseType: string, ability: string, dex: ModdedDex
	): { mult: number, note: string } {
		const abilityid = toID(ability);
		const mult = this.typeEffectiveness(moveType, defenseType, dex);
		if (mult === 0) {
			if (defenseType === 'Ghost' && ['Normal', 'Fighting'].includes(moveType) &&
				['scrappy', 'mindseye'].includes(abilityid)) {
				return { mult: 1, note: ability };
			}
			if (defenseType === 'Flying' && move.id === 'thousandarrows') return { mult: 1, note: move.name };
			return { mult: 0, note: '' };
		}
		// Fixed damage (Seismic Toss, Super Fang...) ignores effectiveness except immunities
		if (move.damage || move.ohko) return { mult: 1, note: mult === 1 ? '' : 'fixed damage' };
		if (move.id === 'freezedry' && defenseType === 'Water') return { mult: 2, note: move.name };
		if (move.id === 'flyingpress') {
			const flying = this.typeEffectiveness('Flying', defenseType, dex);
			if (flying !== 1) return { mult: mult * flying, note: `${move.name}: also Flying` };
		}
		if (mult < 1 && abilityid === 'tintedlens') return { mult: mult * 2, note: ability };
		return { mult, note: '' };
	}

	offense(set: MatchupSet, dex: ModdedDex): Record<string, Matchup> | null {
		const { ability } = this.battleForme(set, dex);
		const moves = (set.moves || []).map(name => dex.moves.get(name))
			.filter(move => move.exists && move.category !== 'Status');
		if (!moves.length) return null;

		const result: Record<string, Matchup> = {};
		for (const defenseType of this.types(dex)) {
			const all: MoveMatchup[] = [];
			for (const move of moves) {
				const { type, note: typeNote } = this.moveType(move, set, dex);
				const { mult, note } = this.moveEffectiveness(move, type, defenseType, ability, dex);
				all.push({ name: move.name, mult, notes: [typeNote, note].filter(Boolean) });
			}
			// Stable sort: ties keep the set's move order
			all.sort((a, b) => b.mult - a.mult);
			const best = all[0];
			result[defenseType] = { mult: best.mult, notes: best.notes, move: best.name, moves: all };
		}
		return result;
	}

	forSet(set: MatchupSet, dex: ModdedDex): SetMatchups {
		const { species, isMega } = this.battleForme(set, dex);
		return {
			name: set.name || dex.species.get(set.species).name,
			mega: isMega ? species.name : null,
			defense: this.defense(set, dex),
			offense: this.offense(set, dex),
		};
	}

	/**
	 * How much a multiplier counts toward a delta: 4x = +2, 2x = +1, 1/2 = -1,
	 * 1/4 and immune = -2 (in-between values, e.g. Filter's 1.5x, round toward 1x)
	 */
	multWeight(mult: number) {
		if (mult === 0 || mult <= 0.25) return -2;
		if (mult > 2) return 2;
		if (mult > 1) return 1;
		return mult < 1 ? -1 : 0;
	}

	/** + means the team handles the type well: resist +1, 4x resist or immune +2, weak -1, 4x weak -2 */
	defenseWeight(mult: number) {
		return -this.multWeight(mult) || 0;
	}

	/**
	 * A Pokémon's best move against the type; + means good coverage. Same scale as
	 * defense, though against a single type a move can't reach 4x or 1/4 today
	 */
	offenseWeight(mult: number) {
		return this.multWeight(mult);
	}

	teamSummary(sets: MatchupSet[], dex: ModdedDex): TypeSummary[] {
		const matchups = sets.filter(set => set.species).map(set => this.forSet(set, dex));
		return this.types(dex).map(type => {
			const summary: TypeSummary = {
				type, weak: [], resist: [], immune: [], defenseDelta: 0,
				superEffective: [], resisted: [], noEffect: [], offenseDelta: 0,
			};
			for (const pokemon of matchups) {
				const defense = pokemon.defense[type].mult;
				if (defense > 1) summary.weak.push(pokemon.name);
				if (defense > 0 && defense < 1) summary.resist.push(pokemon.name);
				if (defense === 0) summary.immune.push(pokemon.name);
				summary.defenseDelta += this.defenseWeight(defense);
				if (!pokemon.offense) continue;
				const offense = pokemon.offense[type].mult;
				if (offense > 1) summary.superEffective.push(pokemon.name);
				if (offense > 0 && offense < 1) summary.resisted.push(pokemon.name);
				if (offense === 0) summary.noEffect.push(pokemon.name);
				summary.offenseDelta += this.offenseWeight(offense);
			}
			return summary;
		});
	}

	/*********************************************************
	 * Rendering (HTML strings for the old client's teambuilder)
	 *********************************************************/

	/** e.g. "×4", "×½", "×1.25" (plain text; escape before use in HTML) */
	formatMult(mult: number) {
		const fractions: { [mult: string]: string } = { '0.25': '¼', '0.5': '½', '0.75': '¾' };
		return '×' + (fractions[String(mult)] || String(Math.round(mult * 100) / 100));
	}

	/** A type icon, with its multiplier if it isn't the usual ×2 or ×½, and the details in a tooltip */
	renderType(type: string, matchup: Matchup, verb: string) {
		let title: string;
		if (matchup.moves) {
			// Offense: every damaging move, e.g. "Fire: Moonblast ×½, Flamethrower ×½"
			title = `${type}: ` + matchup.moves.map(move =>
				`${move.name} ${this.formatMult(move.mult)}` + (move.notes.length ? ` (${move.notes.join(', ')})` : '')
			).join(', ');
		} else {
			title = `${type}: ${verb} ${this.formatMult(matchup.mult)}`;
			if (matchup.notes.length) title += ` (${matchup.notes.join(', ')})`;
		}
		const showMult = ![2, 0.5, 0].includes(matchup.mult);
		return `<span class="ss-type${matchup.notes.length ? ' ss-adjusted' : ''}" title="${BattleLog.escapeHTML(title)}">` +
			Dex.getTypeIcon(type) +
			(showMult ? `<small>${BattleLog.escapeHTML(this.formatMult(matchup.mult))}</small>` : '') +
			`</span>`;
	}

	renderRow(label: string, entries: [string, Matchup][], verb: string) {
		let buf = `<div class="ss-mrow"><label>${label}</label><span class="ss-icons">`;
		buf += entries.length ?
			entries.map(([type, matchup]) => this.renderType(type, matchup, verb)).join('') :
			'<em>None</em>';
		return buf + '</span></div>';
	}

	/** Collapsible matchups strip for a Pokémon's card in the team view */
	renderCardStrip(set: MatchupSet, dex: ModdedDex, open: boolean) {
		if (!set.species) return '';
		const { mega, defense, offense } = this.forSet(set, dex);
		const byMult = (table: Record<string, Matchup>, test: (mult: number) => boolean) =>
			Object.entries(table).filter(([, matchup]) => test(matchup.mult))
				.sort((a, b) => b[1].mult - a[1].mult);

		let buf = `<div class="ss-matchups${open ? ' ss-open' : ''}">`;
		buf += `<button class="ss-matchups-toggle" name="toggleMatchups" value="cards">`;
		buf += `<i class="fa fa-caret-${open ? 'down' : 'right'}"></i> Type matchups</button>`;
		if (mega) buf += `<small class="ss-mega">as ${BattleLog.escapeHTML(mega)}</small>`;
		buf += `<div class="ss-matchups-body"><div class="ss-mcol"><h4>Defense</h4>`;
		buf += this.renderRow('Weak to', byMult(defense, mult => mult > 1), 'takes');
		buf += this.renderRow('Resists', byMult(defense, mult => mult > 0 && mult < 1), 'takes');
		buf += this.renderRow('Immune to', byMult(defense, mult => mult === 0), 'takes');
		buf += `</div><div class="ss-mcol"><h4>Offense</h4>`;
		if (offense) {
			buf += this.renderRow('Super effective on', byMult(offense, mult => mult > 1), 'hits');
			buf += this.renderRow('Resisted by', byMult(offense, mult => mult > 0 && mult < 1), 'hits');
			buf += this.renderRow('No effect on', byMult(offense, mult => mult === 0), 'hits');
		} else {
			buf += `<div class="ss-mrow"><em>No damaging moves</em></div>`;
		}
		buf += `</div></div></div>`;
		return buf;
	}

	renderCount(names: string[], verb: string) {
		if (!names.length) return '<td class="ss-count ss-zero">0</td>';
		const title = BattleLog.escapeHTML(`${verb}: ${names.join(', ')}`);
		return `<td class="ss-count" title="${title}">${names.length}</td>`;
	}

	renderDelta(delta: number, goodWhenPositive: boolean) {
		const good = goodWhenPositive ? delta > 0 : delta < 0;
		const level = Math.min(Math.abs(delta), 3);
		const cls = delta ? ` ss-${good ? 'good' : 'bad'}${level}` : '';
		return `<td class="ss-delta${cls}">${delta > 0 ? '+' : delta < 0 ? '&minus;' : ''}${Math.abs(delta)}</td>`;
	}

	/** Collapsible team summary table for the bottom of the team view */
	renderTeamSummary(sets: MatchupSet[], dex: ModdedDex, open: boolean) {
		if (!sets.some(set => set.species)) return '';
		const summary = this.teamSummary(sets, dex);
		let buf = `<div class="ss-matchups ss-team-matchups${open ? ' ss-open' : ''}">`;
		buf += `<button class="ss-matchups-toggle" name="toggleMatchups" value="summary">`;
		buf += `<i class="fa fa-caret-${open ? 'down' : 'right'}"></i> Team type matchups</button>`;
		buf += `<div class="ss-matchups-body"><table class="ss-summary">`;
		buf += `<tr><th rowspan="2">Type</th><th colspan="4">Defense (when attacked by the type)</th>`;
		buf += `<th colspan="4">Offense (best move against the type)</th></tr>`;
		buf += `<tr><th>Weak</th><th>Resist</th><th>Immune</th><th title="Per Pok&eacute;mon: resists +1, 4&times; resists or immune +2, weak &minus;1, 4&times; weak &minus;2">&Delta;</th>`;
		buf += `<th>Super eff.</th><th>Resisted</th><th>No effect</th><th title="Per Pok&eacute;mon's best move: super effective +1, resisted &minus;1, no effect &minus;2">&Delta;</th></tr>`;
		for (const row of summary) {
			buf += `<tr><td class="ss-typecell">${Dex.getTypeIcon(row.type)}</td>`;
			buf += this.renderCount(row.weak, 'Weak') + this.renderCount(row.resist, 'Resists') +
				this.renderCount(row.immune, 'Immune') + this.renderDelta(row.defenseDelta, true);
			buf += this.renderCount(row.superEffective, 'Super effective') + this.renderCount(row.resisted, 'Resisted') +
				this.renderCount(row.noEffect, 'No effect') + this.renderDelta(row.offenseDelta, true);
			buf += `</tr>`;
		}
		buf += `</table>`;
		buf += `<p class="ss-legend">Hover a number to see which Pok&eacute;mon it counts. &Delta; is weighted: `;
		buf += `<span class="ss-bad2">red</span> is a weak spot, <span class="ss-good2">green</span> a strength.</p>`;
		buf += `</div></div>`;
		return buf;
	}
};

if (typeof require === 'function') {
	// in Node
	global.SoupStoreMatchups = SoupStoreMatchups;
}
