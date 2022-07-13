/* eslint-disable @typescript-eslint/no-use-before-define */
import { AllCardsService, CardIds } from '@firestone-hs/reference-data';
import { ServerlessMysql } from 'serverless-mysql';
import { DateMark, DeckStat, DuelsHeroStat, DuelsTreasureStat, InternalDuelsStat, MmrPercentile } from './stat';
import { formatDate, groupByFunction, http } from './utils/util-functions';

export const TREASURES_REMOVED_CARDS = [
	CardIds.RobesOfGaudiness,
	CardIds.HeadmasterKelthuzad_MrBigglesworthToken,
	CardIds.GattlingGunner,
	CardIds.PhaorisBlade_ULDA_043,
	CardIds.SandySurpriseTavernBrawl,
	CardIds.LunarBandTavernBrawl,
	CardIds.StickyFingers,
	CardIds.BandOfBees,
	// 21.6
	CardIds.SmallPouchesTavernBrawl,
	CardIds.RhoninsScryingOrbTavernBrawl,
	CardIds.Caltrops,
	CardIds.ScatteredCaltropsTavernBrawl,
	// 22.2
	CardIds.FireshaperTavernBrawl,
	CardIds.EverChangingElixirTavernBrawl,
	CardIds.LocuuuustsTavernBrawl,
	CardIds.ConduitOfTheStormsTavernBrawl,
	// 23.2
	CardIds.DragonAffinity,
	CardIds.DragonAffinityTavernBrawl,
	CardIds.DisksOfLegend,
];

const allCards = new AllCardsService();

export const loadStats = async (mysql: ServerlessMysql): Promise<InternalDuelsStat> => {
	await allCards.initializeCardsDb();
	const [lastPatch] = await Promise.all([getLastPatch()]);
	console.debug('last patch', lastPatch);
	const rows: readonly InternalDuelsRow[] = await loadRows(mysql);
	const mmrPercentiles: readonly MmrPercentile[] = buildMmrPercentiles(rows);
	const heroes = buildHeroes(rows, lastPatch, mmrPercentiles);
	console.log('finished building heroes');
	const treasures = buildTreasures(rows, lastPatch, mmrPercentiles);
	console.log('finished building treasures');
	const decks = loadDeckStats(rows);
	console.log('finished building decks');

	return {
		lastUpdateDate: formatDate(new Date()),
		mmrPercentiles: mmrPercentiles,
		dates: ['all-time', 'last-patch', 'past-seven', 'past-three'],
		heroes: heroes,
		treasures: treasures,
		decks: decks,
	};
};

const buildMmrPercentiles = (rows: readonly InternalDuelsRow[]): readonly MmrPercentile[] => {
	const sortedMmrs = rows.map(row => +row.rating).sort((a, b) => a - b);
	const median = sortedMmrs[Math.floor(sortedMmrs.length / 2)];
	const top25 = sortedMmrs[Math.floor((sortedMmrs.length / 4) * 3)];
	const top10 = sortedMmrs[Math.floor((sortedMmrs.length / 10) * 9)];
	const top1 = sortedMmrs[Math.floor((sortedMmrs.length / 100) * 99)];
	console.debug('percentiles', median, top25, top10, top1);
	return [
		{
			percentile: 100,
			mmr: 0,
		},
		{
			percentile: 50,
			mmr: median,
		},
		{
			percentile: 25,
			mmr: top25,
		},
		{
			percentile: 10,
			mmr: top10,
		},
		{
			percentile: 1,
			mmr: top1,
		},
	];
};

const loadRows = async (mysql: ServerlessMysql): Promise<readonly InternalDuelsRow[]> => {
	const query = `
		SELECT * FROM duels_stats_by_run
		WHERE runEndDate > DATE_SUB(NOW(), INTERVAL 70 DAY)
		AND decklist IS NOT NULL;
	`;
	console.log('running query', query);
	const rows: any[] = await mysql.query(query);
	console.log('rows', rows?.length);
	return rows;
};

const buildHeroes = (
	rows: readonly InternalDuelsRow[],
	lastPatch: PatchInfo,
	mmrPercentiles: readonly MmrPercentile[],
): readonly DuelsHeroStat[] => {
	return mmrPercentiles
		.map(
			mmrPercentile =>
				[mmrPercentile, rows.filter(row => row.rating >= mmrPercentile.mmr)] as [
					MmrPercentile,
					readonly InternalDuelsRow[],
				],
		)
		.map(([mmr, rows]) =>
			buildHeroesForMmr(rows, lastPatch).map(stat => ({ ...stat, mmrPercentile: mmr.percentile })),
		)
		.reduce((a, b) => [...a, ...b], []);
};

const buildHeroesForMmr = (rows: readonly InternalDuelsRow[], lastPatch: PatchInfo): readonly DuelsHeroStat[] => {
	console.log('building heroes for mmr', rows.length);

	const allTimeHeroes = buildHeroStats(rows, 'all-time');
	console.log('built all-time heroes');

	const lastPatchHeroes = buildHeroStats(
		rows.filter(
			row =>
				row.buildNumber >= lastPatch.number ||
				row.runEndDate.getTime() > new Date(lastPatch.date).getTime() + 24 * 60 * 60 * 1000,
		),
		'last-patch',
	);
	console.log('built last-patch heroes');

	const threeDaysHeroes = buildHeroStats(
		rows.filter(row => row.runEndDate >= new Date(new Date().getTime() - 3 * 24 * 60 * 60 * 1000)),
		'past-three',
	);
	console.log('built past-three heroes');

	const sevenDaysHeroes = buildHeroStats(
		rows.filter(row => row.runEndDate >= new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000)),
		'past-seven',
	);
	console.log('built past-seven heroes');

	return [...allTimeHeroes, ...lastPatchHeroes, ...threeDaysHeroes, ...sevenDaysHeroes];
};

const buildTreasures = (
	rows: readonly InternalDuelsRow[],
	lastPatch: PatchInfo,
	mmrPercentiles: readonly MmrPercentile[],
): readonly DuelsTreasureStat[] => {
	console.log('building treasures');
	return mmrPercentiles
		.map(
			mmrPercentile =>
				[mmrPercentile, rows.filter(row => row.rating >= mmrPercentile.mmr)] as [
					MmrPercentile,
					readonly InternalDuelsRow[],
				],
		)
		.map(([mmr, rows]) =>
			buildTreasuresForMmr(rows, lastPatch).map(stat => ({ ...stat, mmrPercentile: mmr.percentile })),
		)
		.reduce((a, b) => [...a, ...b], []);
};

const buildTreasuresForMmr = (
	rows: readonly InternalDuelsRow[],
	lastPatch: PatchInfo,
): readonly DuelsTreasureStat[] => {
	// So that we have one treasure per row
	console.log('building treasures for mmr');
	const denormalizedRows: readonly InternalDuelsTreasureRow[] = rows
		.map(row => [
			...row.treasures.split(',').map(treasure => ({
				...row,
				treasure: treasure,
				type: 'treasure' as any,
			})),
			...row.passives.split(',').map(treasure => ({
				...row,
				treasure: treasure,
				type: 'passive' as any,
			})),
		])
		.reduce((a, b) => a.concat(b), [])
		.map(row => {
			// Happens when users don't have the updated cards DB yet
			if (+row.treasure > 0) {
				return {
					...row,
					treasure: allCards.getCardFromDbfId(+row.treasure)?.id,
				};
			}
			return row;
		})
		.filter(info => !TREASURES_REMOVED_CARDS.includes(info.treasure as CardIds));
	console.log('denormalized rows');

	const allTimeTreasures = buildTreasureStats(denormalizedRows, 'all-time');
	console.log('built all-time');

	const lastPatchTreasures = buildTreasureStats(
		denormalizedRows.filter(
			row =>
				row.buildNumber >= lastPatch.number ||
				row.runEndDate.getTime() > new Date(lastPatch.date).getTime() + 24 * 60 * 60 * 1000,
		),
		'last-patch',
	);
	console.log('built last-patch');

	const threeDaysTreasures = buildTreasureStats(
		denormalizedRows.filter(row => row.runEndDate >= new Date(new Date().getTime() - 3 * 24 * 60 * 60 * 1000)),
		'past-three',
	);
	console.log('built past-three');

	const sevenDaysTreasures = buildTreasureStats(
		denormalizedRows.filter(row => row.runEndDate >= new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000)),
		'past-seven',
	);
	console.log('built past-seven');

	return [...allTimeTreasures, ...lastPatchTreasures, ...threeDaysTreasures, ...sevenDaysTreasures];
};

const buildTreasureStats = (
	rows: readonly InternalDuelsTreasureRow[],
	period: string,
): readonly DuelsTreasureStat[] => {
	const grouped: { [groupingKey: string]: readonly InternalDuelsTreasureRow[] } = groupByFunction(
		// hero is needed for Vanndar and Drekkar, since they can have multiple classes depending on their treasure
		(row: InternalDuelsTreasureRow) =>
			`${row.hero}-${row.playerClass}-${row.treasure}-${row.heroPower}-${row.signatureTreasure}`,
	)(rows);
	return Object.values(grouped).map(groupedRows => {
		const ref = groupedRows[0];
		const winsDistribution: { [winNumber: string]: number } = {};
		const groupedByWins: { [winNumber: string]: readonly InternalDuelsTreasureRow[] } = groupByFunction(
			(res: InternalDuelsTreasureRow) => '' + res.wins,
		)(groupedRows);
		for (let i = 0; i <= 12; i++) {
			winsDistribution[i] = (groupedByWins[i] || []).length;
		}
		return {
			date: period,
			gameMode: 'paid-duels',
			hero: ref.hero,
			playerClass: ref.playerClass,
			heroPowerCardId: ref.heroPower,
			treasureCardId: ref.treasure,
			treasureType: ref.type,
			signatureTreasureCardId: ref.signatureTreasure,
			totalLosses: groupedRows.reduce((total, row) => total + row.losses, 0),
			totalWins: groupedRows.reduce((total, row) => total + row.wins, 0),
			totalMatches: groupedRows.reduce((total, row) => total + row.losses + row.wins, 0),
			totalRuns: groupedRows.length,
			winDistribution: winsDistribution,
		} as DuelsTreasureStat;
	});
};

const buildHeroStats = (rows: readonly InternalDuelsRow[], period: DateMark): readonly DuelsHeroStat[] => {
	const grouped: { [groupingKey: string]: readonly InternalDuelsRow[] } = groupByFunction(
		(row: InternalDuelsRow) => `${row.hero}-${row.playerClass}-${row.heroPower}-${row.signatureTreasure}`,
	)(rows);
	console.log('grouped');
	return Object.values(grouped).map(groupedRows => {
		const ref = groupedRows[0];
		const winsDistribution: { [winNumber: string]: number } = {};
		const groupedByWins: { [winNumber: string]: readonly InternalDuelsRow[] } = groupByFunction(
			(res: InternalDuelsRow) => '' + res.wins,
		)(groupedRows);
		for (let i = 0; i <= 12; i++) {
			winsDistribution[i] = (groupedByWins[i] || []).length;
		}
		return {
			date: period,
			gameMode: 'paid-duels',
			hero: ref.hero,
			playerClass: ref.playerClass,
			heroPowerCardId: ref.heroPower,
			signatureTreasureCardId: ref.signatureTreasure,
			totalLosses: groupedRows.reduce((total, row) => total + row.losses, 0),
			totalWins: groupedRows.reduce((total, row) => total + row.wins, 0),
			totalMatches: groupedRows.reduce((total, row) => total + row.losses + row.wins, 0),
			totalRuns: groupedRows.length,
			winDistribution: winsDistribution,
		} as DuelsHeroStat;
	});
};

const loadDeckStats = (rows: readonly InternalDuelsRow[]): readonly DeckStat[] => {
	console.log('building decks');
	const afterFilter = rows.filter(row => row.rating >= 4000).filter(row => row.wins >= 10);
	console.log('filtered decks');
	return afterFilter
		.sort((a, b) => b.runEndDate.getTime() - a.runEndDate.getTime())
		.map(row => ({
			id: row.id,
			gameMode: row.gameMode,
			periodStart: formatDate(row.runEndDate),
			buildNumber: row.buildNumber,
			decklist: row.decklist,
			finalDecklist: row.finalDecklist,
			hero: row.hero,
			playerClass: row.playerClass,
			heroCardId: row.hero,
			heroPowerCardId: row.heroPower,
			signatureTreasureCardId: row.signatureTreasure,
			treasuresCardIds: [...row.passives.split(','), ...row.treasures.split(',')].filter(t => !!t),
			runId: row.runId,
			wins: row.wins,
			losses: row.losses,
			rating: row.rating,
			runStartDate: formatDate(row.runStartDate),
		}))
		.slice(0, 1000);
};

const getLastPatch = async (): Promise<PatchInfo> => {
	const patchInfo = await http(`https://static.zerotoheroes.com/hearthstone/data/patches.json?v=2`);
	const structuredPatch = JSON.parse(patchInfo);
	const patchNumber = structuredPatch.currentDuelsMetaPatch;
	return structuredPatch.patches.find(patch => patch.number === patchNumber);
};

interface PatchInfo {
	readonly number: number;
	readonly name: string;
	readonly version: string;
	readonly date: string;
}

interface InternalDuelsRow {
	readonly id: number;
	readonly runStartDate: Date;
	readonly runEndDate: Date;
	readonly buildNumber: number;
	readonly rating: number;
	readonly gameMode: 'paid-duels';
	readonly runId: string;
	readonly playerClass: string;
	readonly hero: string;
	readonly heroPower: string;
	readonly signatureTreasure: string;
	readonly decklist: string;
	readonly finalDecklist: string;
	readonly wins: number;
	readonly losses: number;
	readonly treasures: string;
	readonly passives: string;
}

interface InternalDuelsTreasureRow extends InternalDuelsRow {
	readonly type: 'passive' | 'treasure';
	readonly treasure: string;
}
