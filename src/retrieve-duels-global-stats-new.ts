/* eslint-disable @typescript-eslint/no-use-before-define */
import { AllCardsService, CardIds } from '@firestone-hs/reference-data';
import { ServerlessMysql } from 'serverless-mysql';
import { DeckStat, DuelsHeroStat, DuelsStat, DuelsTreasureStat, MmrPercentile } from './stat';
import { formatDate, groupByFunction, http } from './utils/util-functions';

export const TREASURES_REMOVED_CARDS = [
	CardIds.NonCollectible.Neutral.RobesOfGaudiness,
	CardIds.NonCollectible.Neutral.HeadmasterKelThuzad_MrBigglesworthToken,
	CardIds.NonCollectible.Neutral.GattlingGunner,
	CardIds.NonCollectible.Neutral.PhaorisBladeTavernBrawl,
	CardIds.NonCollectible.Neutral.SandySurpriseTavernBrawl,
	CardIds.NonCollectible.Neutral.CannibalismTavernBrawl1,
	CardIds.NonCollectible.Neutral.LunarBand,
	CardIds.NonCollectible.Neutral.StickyFingersGILNEAS,
	CardIds.NonCollectible.Neutral.BandOfBees,
];

const allCards = new AllCardsService();

export const loadNewStats = async (mysql: ServerlessMysql): Promise<DuelsStat> => {
	await allCards.initializeCardsDb();
	const [lastPatch] = await Promise.all([getLastPatch()]);

	const rows: readonly InternalDuelsRow[] = await loadRows(mysql);
	const mmrPercentiles: readonly MmrPercentile[] = buildMmrPercentiles(rows);

	return {
		lastUpdateDate: formatDate(new Date()),
		heroes: buildHeroes(rows, lastPatch, mmrPercentiles),
		treasures: buildTreasures(rows, lastPatch, mmrPercentiles),
		decks: loadDeckStats(rows),
		mmrPercentiles: mmrPercentiles,
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
		WHERE runEndDate > DATE_SUB(NOW(), INTERVAL 100 DAY)
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
	const allTimeHeroes = buildHeroStats(rows, 'all-time');
	const lastPatchHeroes = buildHeroStats(
		rows.filter(row => row.buildNumber >= lastPatch.number && row.runEndDate > new Date(lastPatch.date)),
		'last-patch',
	);
	const threeDaysHeroes = buildHeroStats(
		rows.filter(row => row.runEndDate >= new Date(new Date().getTime() - 3 * 24 * 60 * 60 * 1000)),
		'past-three',
	);
	const sevenDaysHeroes = buildHeroStats(
		rows.filter(row => row.runEndDate >= new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000)),
		'past-seven',
	);
	return [...allTimeHeroes, ...lastPatchHeroes, ...threeDaysHeroes, ...sevenDaysHeroes];
};

const buildTreasures = (
	rows: readonly InternalDuelsRow[],
	lastPatch: PatchInfo,
	mmrPercentiles: readonly MmrPercentile[],
): readonly DuelsTreasureStat[] => {
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
		});
	const allTimeTreasures = buildTreasureStats(denormalizedRows, 'all-time');
	const lastPatchTreasures = buildTreasureStats(
		denormalizedRows.filter(
			row => row.buildNumber >= lastPatch.number && row.runEndDate > new Date(lastPatch.date),
		),
		'last-patch',
	);
	const threeDaysTreasures = buildTreasureStats(
		denormalizedRows.filter(row => row.runEndDate >= new Date(new Date().getTime() - 3 * 24 * 60 * 60 * 1000)),
		'past-three',
	);
	const sevenDaysTreasures = buildTreasureStats(
		denormalizedRows.filter(row => row.runEndDate >= new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000)),
		'past-seven',
	);
	return [...allTimeTreasures, ...lastPatchTreasures, ...threeDaysTreasures, ...sevenDaysTreasures];
};

const buildTreasureStats = (
	rows: readonly InternalDuelsTreasureRow[],
	period: string,
): readonly DuelsTreasureStat[] => {
	const grouped: { [groupingKey: string]: readonly InternalDuelsTreasureRow[] } = groupByFunction(
		(row: InternalDuelsTreasureRow) =>
			`${row.playerClass}-${row.treasure}-${row.heroPower}-${row.signatureTreasure}`,
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

const buildHeroStats = (rows: readonly InternalDuelsRow[], period: string): readonly DuelsHeroStat[] => {
	const grouped: { [groupingKey: string]: readonly InternalDuelsRow[] } = groupByFunction(
		(row: InternalDuelsRow) => `${row.playerClass}-${row.heroPower}-${row.signatureTreasure}`,
	)(rows);
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
	return rows
		.filter(row => row.rating >= 4000)
		.filter(row => row.wins >= 10)
		.sort((a, b) => b.runEndDate.getTime() - a.runEndDate.getTime())
		.map(row => ({
			id: row.id,
			gameMode: row.gameMode,
			periodStart: formatDate(row.runEndDate),
			buildNumber: row.buildNumber,
			decklist: row.decklist,
			finalDecklist: row.finalDecklist,
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