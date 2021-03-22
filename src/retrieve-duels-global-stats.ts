/* eslint-disable @typescript-eslint/no-use-before-define */
import { CardIds } from '@firestone-hs/reference-data';
import {
	DeckStat,
	DuelsGlobalStats,
	DuelsGlobalStatsForPeriod,
	HeroPowerStat,
	HeroStat,
	SignatureTreasureStat,
	TreasureStat,
} from './stat';
import { formatDate, groupByFunction, http } from './utils/util-functions';

const TREASURES_REMOVED_CARDS = [
	CardIds.NonCollectible.Neutral.RobesOfGaudiness,
	CardIds.NonCollectible.Neutral.HeadmasterKelThuzad_MrBigglesworthToken,
	CardIds.NonCollectible.Neutral.GattlingGunner,
];

export const loadStats = async (mysql): Promise<DuelsGlobalStats> => {
	try {
		const [lastPatch] = await Promise.all([getLastPatch()]);

		const fullPeriodStartDate = new Date(new Date().getTime() - 100 * 24 * 60 * 60 * 1000);
		const statsForFullPeriodDuels: DuelsGlobalStatsForPeriod = await loadStatsForPeriod(
			fullPeriodStartDate,
			mysql,
			'duels',
		);
		const statsForFullPeriodPaidDuels: DuelsGlobalStatsForPeriod = await loadStatsForPeriod(
			fullPeriodStartDate,
			mysql,
			'paid-duels',
		);
		const statsForFullPeriodBoth: DuelsGlobalStatsForPeriod = merge(
			fullPeriodStartDate,
			...[statsForFullPeriodDuels, statsForFullPeriodPaidDuels],
		);
		console.log('built stats for full period', statsForFullPeriodBoth);

		// Start the day after, the limit the occurences of old versions being included
		const lastPatchStartDate = new Date(new Date(lastPatch.date).getTime() + 24 * 60 * 60 * 1000);
		const statsSinceLastPatchDuels: DuelsGlobalStatsForPeriod = await loadStatsForPeriod(
			lastPatchStartDate,
			mysql,
			'duels',
		);
		const statsSinceLastPatchPaidDuels: DuelsGlobalStatsForPeriod = await loadStatsForPeriod(
			lastPatchStartDate,
			mysql,
			'paid-duels',
		);
		const statsSinceLastPatchBoth: DuelsGlobalStatsForPeriod = merge(
			lastPatchStartDate,
			...[statsSinceLastPatchDuels, statsSinceLastPatchPaidDuels],
		);
		console.log('built stats for full period', statsSinceLastPatchBoth);

		const lastThreeDaysStartDate = new Date(new Date().getTime() - 3 * 24 * 60 * 60 * 1000);
		const statsForThreeDaysDuels: DuelsGlobalStatsForPeriod = await loadStatsForPeriod(
			lastThreeDaysStartDate,
			mysql,
			'duels',
		);
		const statsForThreeDaysPaidDuels: DuelsGlobalStatsForPeriod = await loadStatsForPeriod(
			lastThreeDaysStartDate,
			mysql,
			'paid-duels',
		);
		const statsThreeDaysBoth: DuelsGlobalStatsForPeriod = merge(
			lastThreeDaysStartDate,
			...[statsForThreeDaysDuels, statsForThreeDaysPaidDuels],
		);
		console.log('built stats for full period', statsThreeDaysBoth);

		const lastSevenDaysStartDate = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000);
		const statsForSevenDaysDuels: DuelsGlobalStatsForPeriod = await loadStatsForPeriod(
			lastSevenDaysStartDate,
			mysql,
			'duels',
		);
		const statsForSevenDaysPaidDuels: DuelsGlobalStatsForPeriod = await loadStatsForPeriod(
			lastSevenDaysStartDate,
			mysql,
			'paid-duels',
		);
		const statsSevenDaysBoth: DuelsGlobalStatsForPeriod = merge(
			lastSevenDaysStartDate,
			...[statsForSevenDaysDuels, statsForSevenDaysPaidDuels],
		);
		console.log('built stats for full period', statsSevenDaysBoth);

		const result: DuelsGlobalStats = {
			lastUpdateDate: formatDate(new Date()),
			duels: {
				statsForFullPeriod: statsForFullPeriodDuels,
				statsSinceLastPatch: statsSinceLastPatchDuels,
				statsForThreeDays: statsForThreeDaysDuels,
				statsForSevenDays: statsForSevenDaysDuels,
			},
			paidDuels: {
				statsForFullPeriod: statsForFullPeriodPaidDuels,
				statsSinceLastPatch: statsSinceLastPatchPaidDuels,
				statsForThreeDays: statsForThreeDaysPaidDuels,
				statsForSevenDays: statsForSevenDaysPaidDuels,
			},
			both: {
				statsForFullPeriod: statsForFullPeriodBoth,
				statsSinceLastPatch: statsSinceLastPatchBoth,
				statsForThreeDays: statsThreeDaysBoth,
				statsForSevenDays: statsSevenDaysBoth,
			},
		};
		return result;
	} catch (e) {
		return null;
	}
};

const merge = (periodStartDate: Date, ...stats: readonly DuelsGlobalStatsForPeriod[]): DuelsGlobalStatsForPeriod => {
	const heroStats = mergeHeroStats(
		periodStartDate,
		stats.map(stat => stat.heroStats).reduce((a, b) => a.concat(b), []),
	);
	const heroPowerStats = mergeHeroPowerStats(
		periodStartDate,
		stats.map(stat => stat.heroPowerStats).reduce((a, b) => a.concat(b), []),
	);
	const signatureTreasureStats = mergeSignatureTreasureStats(
		periodStartDate,
		stats.map(stat => stat.signatureTreasureStats).reduce((a, b) => a.concat(b), []),
	);
	const treasureStats = mergeTreasureStats(
		periodStartDate,
		stats.map(stat => stat.treasureStats).reduce((a, b) => a.concat(b), []),
	);
	const deckStats = stats.map(stat => stat.deckStats).reduce((a, b) => a.concat(b), []);

	return {
		heroStats: heroStats,
		heroPowerStats: heroPowerStats,
		signatureTreasureStats: signatureTreasureStats,
		treasureStats: treasureStats,
		deckStats: deckStats,
	};
};

const mergeTreasureStats = (periodStartDate: Date, stats: readonly TreasureStat[]): readonly TreasureStat[] => {
	const uniqueCardIds = [...new Set(stats.map(stat => stat.cardId))];
	return uniqueCardIds
		.map(treasureCardId => {
			const relevant: readonly TreasureStat[] = stats.filter(stat => stat.cardId === treasureCardId);
			// if (treasureCardId === 'FP1_006') {
			// 	console.debug('relevant', relevant);
			// }
			const uniquePlayerClasses: readonly string[] = [...new Set(relevant.map(stat => stat.playerClass))];
			// if (treasureCardId === 'FP1_006') {
			// 	console.debug('uniquePlayerClasses', uniquePlayerClasses);
			// }
			return uniquePlayerClasses.map(playerClass => {
				const relevantForClass: readonly TreasureStat[] = relevant.filter(
					stat => stat.playerClass === playerClass,
				);
				// if (treasureCardId === 'FP1_006') {
				// 	console.debug(
				// 		'relevantForClass',
				// 		relevantForClass,
				// 		relevantForClass.map(stat => stat.matchesPlayed).reduce((a, b) => a + b, 0),
				// 	);
				// }
				return {
					periodStart: periodStartDate.toISOString(),
					cardId: treasureCardId,
					playerClass: relevantForClass[0].playerClass,
					matchesPlayed: relevantForClass
						.map(stat => stat.matchesPlayed)
						.filter(value => value != null)
						.reduce((a, b) => a + b, 0),
					totalLosses: relevantForClass
						.map(stat => stat.totalLosses)
						.filter(value => value != null)
						.reduce((a, b) => a + b, 0),
					totalOffered: relevantForClass
						.map(stat => stat.totalOffered)
						.filter(value => value != null)
						.reduce((a, b) => a + b, 0),
					totalPicked: relevantForClass
						.map(stat => stat.totalPicked)
						.filter(value => value != null)
						.reduce((a, b) => a + b, 0),
					totalTies: relevantForClass
						.map(stat => stat.totalTies)
						.filter(value => value != null)
						.reduce((a, b) => a + b, 0),
					totalWins: relevantForClass
						.map(stat => stat.totalWins)
						.filter(value => value != null)
						.reduce((a, b) => a + b, 0),
				};
			});
		})
		.reduce((a, b) => a.concat(b), []);
};

const mergeSignatureTreasureStats = (
	periodStartDate: Date,
	stats: readonly SignatureTreasureStat[],
): readonly SignatureTreasureStat[] => {
	const uniqueHeroCardIds = [...new Set(stats.map(stat => stat.signatureTreasureCardId))];
	return uniqueHeroCardIds.map(signatureTreasureCardId => {
		const relevant: readonly SignatureTreasureStat[] = stats.filter(
			stat => stat.signatureTreasureCardId === signatureTreasureCardId,
		);
		const winsDistribution: { [winNumber: string]: number } = {};
		for (let i = 0; i <= 12; i++) {
			winsDistribution[i] = relevant.map(stat => stat.winDistribution[i]).reduce((a, b) => a + b, 0);
		}
		return {
			periodStart: periodStartDate.toISOString(),
			creationDate: periodStartDate.toISOString(),
			signatureTreasureCardId: signatureTreasureCardId,
			heroClass: relevant[0]?.heroClass,
			totalMatches: relevant.map(stat => stat.totalMatches).reduce((a, b) => a + b, 0),
			totalWins: relevant.map(stat => stat.totalWins).reduce((a, b) => a + b, 0),
			winDistribution: winsDistribution,
		};
	});
};

const mergeHeroStats = (periodStartDate: Date, stats: readonly HeroStat[]): readonly HeroStat[] => {
	// console.log('merging', stats);
	const uniqueHeroCardIds = [...new Set(stats.map(stat => stat.heroCardId))];
	// console.log('uniqueHeroCardIds', uniqueHeroCardIds, stats);
	return uniqueHeroCardIds.map(heroCardId => {
		const relevant: readonly HeroStat[] = stats.filter(stat => stat.heroCardId === heroCardId);
		// console.log('relevant', relevant, heroCardId);
		const winsDistribution: { [winNumber: string]: number } = {};
		for (let i = 0; i <= 12; i++) {
			winsDistribution[i] = relevant.map(stat => stat.winDistribution[i]).reduce((a, b) => a + b, 0);
		}
		// console.log('win distribution', winsDistribution);
		return {
			periodStart: periodStartDate.toISOString(),
			creationDate: periodStartDate.toISOString(),
			heroCardId: heroCardId,
			heroClass: relevant[0]?.heroClass,
			totalMatches: relevant.map(stat => stat.totalMatches).reduce((a, b) => a + b, 0),
			totalWins: relevant.map(stat => stat.totalWins).reduce((a, b) => a + b, 0),
			winDistribution: winsDistribution,
		};
	});
};

const mergeHeroPowerStats = (periodStartDate: Date, stats: readonly HeroPowerStat[]): readonly HeroPowerStat[] => {
	const uniqueHeroCardIds = [...new Set(stats.map(stat => stat.heroPowerCardId))];
	return uniqueHeroCardIds.map(heroPowerCardId => {
		const relevant: readonly HeroPowerStat[] = stats.filter(stat => stat.heroPowerCardId === heroPowerCardId);
		const winsDistribution: { [winNumber: string]: number } = {};
		for (let i = 0; i <= 12; i++) {
			winsDistribution[i] = relevant.map(stat => stat.winDistribution[i]).reduce((a, b) => a + b, 0);
		}
		return {
			periodStart: periodStartDate.toISOString(),
			creationDate: periodStartDate.toISOString(),
			heroPowerCardId: heroPowerCardId,
			heroClass: relevant[0]?.heroClass,
			totalMatches: relevant.map(stat => stat.totalMatches).reduce((a, b) => a + b, 0),
			totalWins: relevant.map(stat => stat.totalWins).reduce((a, b) => a + b, 0),
			winDistribution: winsDistribution,
		};
	});
};

const loadStatsForPeriod = async (
	startDate: Date,
	mysql,
	gameMode: 'duels' | 'paid-duels',
): Promise<DuelsGlobalStatsForPeriod> => {
	const heroStats: readonly HeroStat[] = await loadHeroStats(startDate, mysql, gameMode);
	const heroPowerStats: readonly HeroPowerStat[] = await loadHeroPowerStats(startDate, mysql, gameMode);
	const signatureTreasureStats: readonly SignatureTreasureStat[] = await loadSignatureTreasureStats(
		startDate,
		mysql,
		gameMode,
	);
	const treasureStats: readonly TreasureStat[] = await loadTreasureStats(startDate, mysql, gameMode);
	const deckStats: readonly DeckStat[] = await loadDeckStats(startDate, mysql, gameMode);
	return {
		deckStats: deckStats,
		heroPowerStats: heroPowerStats,
		heroStats: heroStats,
		signatureTreasureStats: signatureTreasureStats,
		treasureStats: treasureStats,
	};
};

const loadDeckStats = async (
	periodStart: Date,
	mysql,
	gameMode: 'duels' | 'paid-duels',
): Promise<readonly DeckStat[]> => {
	const query = `
		SELECT *
		FROM duels_stats_deck
		WHERE periodStart >= '${periodStart.toISOString()}'
		AND gameMode = '${gameMode}'
		ORDER BY id desc
		LIMIT 100;
	`;
	// console.log('running query', query);
	const dbResults: any[] = await mysql.query(query);
	// console.log('dbResults', dbResults);

	return dbResults.map(
		result =>
			({
				...result,
				// periodStart: periodStart.toISOString(),
				treasuresCardIds: (result.treasuresCardIds || '').split(','),
			} as DeckStat),
	);
};

const loadTreasureStats = async (
	periodStart: Date,
	mysql,
	gameMode: 'duels' | 'paid-duels',
): Promise<readonly TreasureStat[]> => {
	const pickQuery = `
		SELECT '${periodStart.toISOString()}' as periodStart, cardId, playerClass, SUM(totalOffered) as totalOffered, SUM(totalPicked) as totalPicked
		FROM duels_stats_treasure
		WHERE periodStart >= '${periodStart.toISOString()}'
		AND gameMode = '${gameMode}'
		GROUP BY cardId, playerClass;
	`;
	console.log('running query', pickQuery);
	const pickResults: any[] = await mysql.query(pickQuery);
	console.debug(
		'pickResults',
		pickResults.filter(res => res.cardId === 'ULDA_043'),
	);

	const winrateQuery = `
		SELECT '${periodStart.toISOString()}' as periodStart, cardId, playerClass, SUM(matchesPlayed) as matchesPlayed, SUM(totalLosses) as totalLosses, SUM(totalTies) as totalTies, SUM(totalWins) as totalWins
		FROM duels_stats_treasure_winrate
		WHERE periodStart >= '${periodStart.toISOString()}'
		AND gameMode = '${gameMode}'
		GROUP BY cardId, playerClass;
	`;
	console.log('running query', winrateQuery);
	const winrateResults: any[] = await mysql.query(winrateQuery);
	console.debug(
		'winrateResults',
		winrateResults.filter(res => res.cardId === 'ULDA_043'),
	);

	const result = pickResults
		.filter(result => !TREASURES_REMOVED_CARDS.includes(result.cardId))
		.map(result => {
			const winrateResult =
				winrateResults.find(res => res.cardId === result.cardId && res.playerClass === result.playerClass) ??
				{};
			// console.log('mapping', result, winrateResult);
			return {
				...result,
				...winrateResult,
			} as TreasureStat;
		});
	console.debug(
		'result',
		result.filter(res => res.cardId === 'ULDA_043'),
	);
	return result;
};

const loadHeroStats = async (
	periodStart: Date,
	mysql,
	gameMode: 'duels' | 'paid-duels',
): Promise<readonly HeroStat[]> => {
	const query = `
		SELECT '${periodStart.toISOString()}' as periodStart, heroCardId, heroClass, SUM(totalMatches) as totalMatches, SUM(totalWins) as totalWins
		FROM duels_stats_hero
		WHERE periodStart >= '${periodStart.toISOString()}'
		AND gameMode = '${gameMode}'
		GROUP BY heroCardId, heroClass;
	`;
	// console.log('running query', query);
	const dbResults: any[] = await mysql.query(query);
	// console.log('dbResults', dbResults);

	const positionQuery = `
		SELECT heroCardId, heroClass, totalWins, SUM(totalMatches) as totalMatches
		FROM duels_stats_hero_position
		WHERE periodStart >= '${periodStart.toISOString()}'
		AND gameMode = '${gameMode}'
		GROUP BY heroCardId, heroClass, totalWins
	`;
	// console.log('running query', positionQuery);
	const dbPositionResults: any[] = await mysql.query(positionQuery);
	// console.log('dbResults', dbPositionResults);

	return dbResults.map(result => {
		const winsForHero = dbPositionResults.filter(res => res.heroCardId === result.heroCardId);
		const groupedByWins: { [winNumber: string]: any[] } = groupByFunction((res: any) => res.totalWins)(winsForHero);
		const winsDistribution: { [winNumber: string]: number } = {};
		for (let i = 0; i <= 12; i++) {
			const totalWins = (groupedByWins[i] || [])
				.map(res => parseInt(res.totalMatches))
				.reduce((a, b) => a + b, 0);
			winsDistribution[i] = totalWins;
		}
		return {
			...result,
			winDistribution: winsDistribution,
		} as HeroStat;
	});
};

const loadHeroPowerStats = async (
	periodStart: Date,
	mysql,
	gameMode: 'duels' | 'paid-duels',
): Promise<readonly HeroPowerStat[]> => {
	const query = `
		SELECT '${periodStart.toISOString()}' as periodStart, heroPowerCardId, heroClass, SUM(totalMatches) as totalMatches, SUM(totalWins) as totalWins
		FROM duels_stats_hero_power
		WHERE periodStart >= '${periodStart.toISOString()}'
		AND gameMode = '${gameMode}'
		GROUP BY heroPowerCardId, heroClass;
	`;
	// console.log('running query', query);
	const dbResults: any[] = await mysql.query(query);
	// console.log('dbResults', dbResults);

	const positionQuery = `
		SELECT heroPowerCardId, heroClass, totalWins, SUM(totalMatches) as totalMatches
		FROM duels_stats_hero_power_position
		WHERE periodStart >= '${periodStart.toISOString()}'
		AND gameMode = '${gameMode}'
		GROUP BY heroPowerCardId, heroClass, totalWins
	`;
	// console.log('running query', positionQuery);
	const dbPositionResults: any[] = await mysql.query(positionQuery);
	// console.log('dbResults', dbPositionResults);

	return dbResults.map(result => {
		const winsForHero = dbPositionResults.filter(res => res.heroPowerCardId === result.heroPowerCardId);
		const groupedByWins: { [winNumber: string]: any[] } = groupByFunction((res: any) => res.totalWins)(winsForHero);
		const winsDistribution: { [winNumber: string]: number } = {};
		for (let i = 0; i <= 12; i++) {
			const totalWins = (groupedByWins[i] || [])
				.map(res => parseInt(res.totalMatches))
				.reduce((a, b) => a + b, 0);
			winsDistribution[i] = totalWins;
		}
		return {
			...result,
			winDistribution: winsDistribution,
		} as HeroPowerStat;
	});
};

const loadSignatureTreasureStats = async (
	periodStart: Date,
	mysql,
	gameMode: 'duels' | 'paid-duels',
): Promise<readonly SignatureTreasureStat[]> => {
	const query = `
		SELECT '${periodStart.toISOString()}' as periodStart, signatureTreasureCardId, heroClass, SUM(totalMatches) as totalMatches, SUM(totalWins) as totalWins
		FROM duels_stats_signature_treasure
		WHERE periodStart >= '${periodStart.toISOString()}'
		AND gameMode = '${gameMode}'
		GROUP BY signatureTreasureCardId, heroClass;
	`;
	// console.log('running query', query);
	const dbResults: any[] = await mysql.query(query);
	// console.log('dbResults', dbResults);

	const positionQuery = `
		SELECT signatureTreasureCardId, heroClass, totalWins, SUM(totalMatches) as totalMatches
		FROM duels_stats_signature_treasure_position
		WHERE periodStart >= '${periodStart.toISOString()}'
		AND gameMode = '${gameMode}'
		GROUP BY signatureTreasureCardId, heroClass, totalWins
	`;
	// console.log('running query', positionQuery);
	const dbPositionResults: any[] = await mysql.query(positionQuery);
	// console.log('dbResults', dbPositionResults);

	return dbResults.map(result => {
		const winsForHero = dbPositionResults.filter(
			res => res.signatureTreasureCardId === result.signatureTreasureCardId,
		);
		const groupedByWins: { [winNumber: string]: any[] } = groupByFunction((res: any) => res.totalWins)(winsForHero);
		const winsDistribution: { [winNumber: string]: number } = {};
		for (let i = 0; i <= 12; i++) {
			const totalWins = (groupedByWins[i] || [])
				.map(res => parseInt(res.totalMatches))
				.reduce((a, b) => a + b, 0);
			winsDistribution[i] = totalWins;
		}
		return {
			...result,
			winDistribution: winsDistribution,
		} as SignatureTreasureStat;
	});
};

export const getLastPatch = async (): Promise<any> => {
	const patchInfo = await http(`https://static.zerotoheroes.com/hearthstone/data/patches.json?v=2`);
	const structuredPatch = JSON.parse(patchInfo);
	const patchNumber = structuredPatch.currentDuelsMetaPatch;
	// console.log('retrieved patch info', structuredPatch, patchNumber);
	return structuredPatch.patches.find(patch => patch.number === patchNumber);
};
