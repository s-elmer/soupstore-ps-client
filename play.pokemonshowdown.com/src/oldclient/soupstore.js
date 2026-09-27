/**
 * Soup Store helpers for the old client (see soupstore/README.md):
 *
 * - Converting teams built for Champions formats (e.g. [Gen 9 Champions] NatDex
 *   Draft) into Soup Store teams: Stat Points become the equivalent EVs, and
 *   Level 50 becomes Level 100.
 * - Hiding formats other than ours unless the "Show all formats" option is on.
 * - Defaulting new searches, challenges and teams to our format.
 */
(function (exports) {
	var STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
	var STAT_NAMES = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
	var MAX_STAT_POINTS = 32;
	var EV_LIMIT = 510;

	var SoupStore = {
		/** The format Champions teams are converted to */
		teamFormat: 'gen9soupstoreseason4',

		isSoupStoreFormat: function (formatid) {
			return !!formatid && formatid.indexOf('soupstore') >= 0;
		},

		/**
		 * Whether a format list should hide this format, i.e. it isn't one of ours
		 * and the player hasn't turned on "Show all formats" in Options.
		 */
		isFormatHidden: function (formatid) {
			return !Storage.prefs('allformats') && !SoupStore.isSoupStoreFormat(formatid);
		},

		/**
		 * The format that new searches, challenges or teams start with, even when
		 * all formats are shown: our first one that fits (selectType is 'search',
		 * 'challenge' or 'teambuilder', as in FormatPopup). '' if none.
		 */
		defaultFormat: function (selectType) {
			if (!window.BattleFormats) return '';
			for (var id in BattleFormats) {
				var format = BattleFormats[id];
				if (!SoupStore.isSoupStoreFormat(id)) continue;
				if (selectType === 'teambuilder' ? format.isTeambuilderFormat :
					format.effectType === 'Format' && !format.battleFormat && format[selectType + 'Show']) {
					return id;
				}
			}
			return '';
		},

		/**
		 * Champions stats use the mainline formula, with the first Stat Point in
		 * a stat worth 4 EVs and each one after it worth 8 (see the server's
		 * data/mods/champions/scripts.ts). So this conversion gives exactly the
		 * same stats at Level 50, and the intended spread at Level 100.
		 */
		statPointsToEVs: function (statPoints) {
			return statPoints > 0 ? statPoints * 8 - 4 : 0;
		},

		/**
		 * Converts sets imported from a Champions team (as parsed by
		 * Storage.importTeam) in place.
		 *
		 * Champions allows 66 Stat Points, and a few legal spreads come to more
		 * than 510 EVs (e.g. 32/32/2 is 252/252/12). Those lose the extra EVs from
		 * their smallest invested stat, and get a warning.
		 *
		 * Returns { sets, warnings }, or { error } if the team doesn't look like
		 * it uses Stat Points.
		 */
		convertChampionsSets: function (sets) {
			if (!sets || !sets.length) {
				return { error: "Paste a team exported from a Champions format, then press this button again." };
			}
			var warnings = [];
			for (var i = 0; i < sets.length; i++) {
				var set = sets[i];
				var label = set.name || set.species || 'Pokémon ' + (i + 1);

				var evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
				var total = 0;
				for (var j = 0; j < STATS.length; j++) {
					var stat = STATS[j];
					var statPoints = (set.evs && set.evs[stat]) || 0;
					if (statPoints > MAX_STAT_POINTS) {
						return {
							error: label + " has " + statPoints + " in " + STAT_NAMES[stat] + ", but Champions Stat Points only go up to " +
								MAX_STAT_POINTS + ". This team seems to use EVs already, so import it with the regular Import/Export button instead."
						};
					}
					evs[stat] = SoupStore.statPointsToEVs(statPoints);
					total += evs[stat];
				}

				var originalTotal = total;
				while (total > EV_LIMIT) {
					var smallest = null;
					for (var k = 0; k < STATS.length; k++) {
						if (evs[STATS[k]] && (!smallest || evs[STATS[k]] < evs[smallest])) smallest = STATS[k];
					}
					var before = evs[smallest];
					// EVs only count in multiples of 4, so round down to one
					evs[smallest] = Math.max(0, Math.floor((before - (total - EV_LIMIT)) / 4) * 4);
					total -= before - evs[smallest];
					warnings.push(
						label + "'s Stat Points convert to " + originalTotal + " EVs, over the limit of " + EV_LIMIT +
						", so its " + STAT_NAMES[smallest] + " EVs were lowered from " + before + " to " + evs[smallest] + "."
					);
				}

				set.evs = evs;
				// Level 100, all IVs 31 (Champions has no IVs), and no Tera (Terastal Clause)
				delete set.level;
				delete set.ivs;
				delete set.teraType;
			}
			return { sets: sets, warnings: warnings };
		}
	};

	exports.SoupStore = SoupStore;
})(window);
