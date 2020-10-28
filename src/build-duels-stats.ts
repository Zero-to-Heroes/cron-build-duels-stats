/* eslint-disable @typescript-eslint/no-use-before-define */
import { AllCardsService } from '@firestone-hs/reference-data';
import { getConnection } from './db/rds';
import { HeroPowerStat, HeroStat, SignatureTreasureStat, TreasureStat } from './stat';
import { formatDate } from './utils/util-functions';

const cards = new AllCardsService();

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event): Promise<any> => {
	// console.log('event', JSON.stringify(event, null, 4));
	await cards.initializeCardsDb();
	const mysql = await getConnection();

	// For now, just build stats overall, but also build for several time periods (last patch, last N days, etc.)
	// const today = toCreationDate(new Date());
	// const earliestStartDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

	const heroStats = await buildHeroStats(mysql);
	const heroPowerStats = await buildHeroPowerStats(mysql);
	const signatureTreasureStats = await buildSignatureTreasureStats(mysql);
	const treasureStats = await buildTreasureStats(mysql);

	return { statusCode: 200, body: null };
};

const buildTreasureStats = async (mysql): Promise<readonly TreasureStat[]> => {
	const lastJobQuery = `
		SELECT periodStart FROM duels_stats_treasure
		ORDER BY periodStart DESC
		LIMIT 1
	`;
	console.log('running last job query', lastJobQuery);
	const lastJobData: readonly any[] = await mysql.query(lastJobQuery);
	console.log('lastJobData', lastJobData && lastJobData.length > 0 && lastJobData[0].periodStart);

	const startDate = lastJobData && lastJobData.length > 0 ? lastJobData[0].periodStart : null;
	const startDateStatemenet = startDate ? `AND t1.creationDate >= '${formatDate(startDate)}' ` : '';

	const endDate = new Date();
	endDate.setHours(0, 0, 0, 0);
	const periodDate = formatDate(endDate);

	const query = `
		SELECT t1.creationDate, t2.playerClass, t1.option1, t1.option2, t1.option3, t1.chosenOptionIndex
		FROM dungeon_run_loot_info t1
		INNER JOIN replay_summary t2 ON t1.reviewId = t2.reviewId
		AND t2.playerCardId like 'PVPDR_Hero%'
		${startDateStatemenet}
		WHERE t1.adventureType = 'duels'
		AND t1.bundleType = 'treasure'
		ORDER BY t2.playerClass;
	`;
	console.log('running query', query);
	const results: readonly InternalTreasureRow[] = await mysql.query(query);
	console.log('treasureResults', results);

	if (!results || results.length === 0) {
		console.log('no new treasure info');
		return;
	}

	const stats: MutableTreasureStat[] = [];

	for (const dbRow of results) {
		const option1Treasure = findTreasureAndInsertIfMissing(
			stats,
			dbRow,
			periodDate,
			(dbRow: InternalTreasureRow) => dbRow.option1,
		);
		option1Treasure.totalOffered++;
		if (dbRow.chosenOptionIndex === 1) {
			option1Treasure.totalPicked++;
		}

		const option2Treasure = findTreasureAndInsertIfMissing(
			stats,
			dbRow,
			periodDate,
			(dbRow: InternalTreasureRow) => dbRow.option2,
		);
		option2Treasure.totalOffered++;
		if (dbRow.chosenOptionIndex === 2) {
			option2Treasure.totalPicked++;
		}

		const option3Treasure = findTreasureAndInsertIfMissing(
			stats,
			dbRow,
			periodDate,
			(dbRow: InternalTreasureRow) => dbRow.option3,
		);
		option3Treasure.totalOffered++;
		if (dbRow.chosenOptionIndex === 3) {
			option3Treasure.totalPicked++;
		}
	}

	const values = stats
		.map(
			stat =>
				`('${stat.periodStart}', '${stat.cardId}', '${stat.playerClass}', ${stat.totalOffered}, ${stat.totalPicked})`,
		)
		.join(',\n');
	const insertionQuery = `
		INSERT INTO duels_stats_treasure
		(periodStart, cardId, playerClass, totalOffered, totalPicked)
		VALUES ${values}
	`;
	console.log('running query', insertionQuery);
	await mysql.query(insertionQuery);
	return stats;
};

const buildHeroStats = async (mysql): Promise<readonly HeroStat[]> => {
	const lastJobQuery = `
		SELECT periodStart FROM duels_stats_hero
		ORDER BY periodStart DESC
		LIMIT 1
	`;
	console.log('running last job query', lastJobQuery);
	const lastJobData: readonly any[] = await mysql.query(lastJobQuery);
	console.log('lastJobData', lastJobData && lastJobData.length > 0 && lastJobData[0].periodStart);

	const startDate = lastJobData && lastJobData.length > 0 ? lastJobData[0].periodStart : null;
	const startDateStatemenet = startDate ? `AND creationDate >= '${formatDate(startDate)}' ` : '';

	const endDate = new Date();
	endDate.setHours(0, 0, 0, 0);
	const periodDate = formatDate(endDate);

	const allHeroesQuery = `
		SELECT playerCardId, count(*) as count FROM replay_summary
		WHERE gameMode = 'duels' 
		AND playerCardId like 'PVPDR_Hero%'
		${startDateStatemenet}
		GROUP BY playerCardId;
	`;
	console.log('running query', allHeroesQuery);
	const allHeroesResult: readonly any[] = await mysql.query(allHeroesQuery);
	console.log('allHeroesResult', allHeroesResult);

	if (!allHeroesResult || allHeroesResult.length === 0) {
		console.log('no new hero info');
		return;
	}

	const allHeroesWonQuery = `
		SELECT playerCardId, count(*) as count FROM replay_summary
		WHERE gameMode = 'duels' 
		AND playerCardId like 'PVPDR_Hero%'
		AND result = 'won'
		${startDateStatemenet}
		GROUP BY playerCardId;
	`;
	console.log('running query', allHeroesWonQuery);
	const allHeroesWonResult: readonly any[] = await mysql.query(allHeroesWonQuery);
	console.log('allHeroesWonResult', allHeroesWonResult);

	const totalGames = allHeroesResult.map(result => result.count).reduce((a, b) => a + b, 0);
	const stats = allHeroesResult.map(
		result =>
			({
				periodStart: periodDate,
				heroCardId: result.playerCardId,
				heroClass: cards.getCard(result.playerCardId)?.playerClass,
				totalMatches: result.count,
				totalWins: allHeroesWonResult.find(hero => hero.playerCardId === result.playerCardId)?.count || 0,
			} as HeroStat),
	);
	const values = stats
		.map(
			stat =>
				`('${stat.periodStart}', '${stat.heroCardId}', '${stat.heroClass}', ${stat.totalMatches}, ${stat.totalWins})`,
		)
		.join(',\n');
	const query = `
		INSERT INTO duels_stats_hero (periodStart, heroCardId, heroClass, totalMatches, totalWins)
		VALUES ${values}
	`;
	console.log('running query', query);
	await mysql.query(query);
	return stats;
};

const buildHeroPowerStats = async (mysql): Promise<readonly HeroPowerStat[]> => {
	const lastJobQuery = `
		SELECT periodStart FROM duels_stats_hero_power
		ORDER BY periodStart DESC
		LIMIT 1
	`;
	console.log('running last job query', lastJobQuery);
	const lastJobData: readonly any[] = await mysql.query(lastJobQuery);
	console.log('lastJobData', lastJobData && lastJobData.length > 0 && lastJobData[0].periodStart);

	const startDate = lastJobData && lastJobData.length > 0 ? lastJobData[0].periodStart : null;
	const startDateStatemenet = startDate ? `AND t1.creationDate >= '${formatDate(startDate)}' ` : '';

	const endDate = new Date();
	endDate.setHours(0, 0, 0, 0);
	const periodDate = formatDate(endDate);

	const allHeroPowersQuery = `
		SELECT t2.option1 as heroPower, count(*) as count
		FROM replay_summary t1
		INNER JOIN match_stats t3 ON t3.reviewId = t1.reviewId
		INNER JOIN dungeon_run_loot_info t2 ON t3.statValue = t2.runId
		WHERE t1.gameMode = 'duels' 
		AND t1.playerCardId like 'PVPDR_Hero%'
		${startDateStatemenet}
		AND t2.bundleType = 'hero-power'
		AND t3.statName = 'duels-run-id'
		GROUP BY heroPower;
	`;
	console.log('running query', allHeroPowersQuery);
	const allHeroPowersResult: readonly any[] = await mysql.query(allHeroPowersQuery);
	console.log('allHeroPowersResult', allHeroPowersResult);

	if (!allHeroPowersResult || allHeroPowersResult.length === 0) {
		console.log('no new hero power info');
		return;
	}

	const allHeroPowersWonQuery = `
		SELECT t2.option1 as heroPower, count(*) as count
		FROM replay_summary t1
		INNER JOIN match_stats t3 ON t3.reviewId = t1.reviewId
		INNER JOIN dungeon_run_loot_info t2 ON t3.statValue = t2.runId
		WHERE t1.gameMode = 'duels' 
		AND t1.playerCardId like 'PVPDR_Hero%'
		AND t1.result = 'won'
		${startDateStatemenet}
		AND t2.bundleType = 'hero-power'
		AND t3.statName = 'duels-run-id'
		GROUP BY heroPower;
	`;
	console.log('running query', allHeroPowersWonQuery);
	const allHeroPowersWonResult: readonly any[] = await mysql.query(allHeroPowersWonQuery);
	console.log('allHeroPowersWonResult', allHeroPowersWonResult);

	const totalGames = allHeroPowersResult.map(result => result.count).reduce((a, b) => a + b, 0);
	const stats = allHeroPowersResult.map(
		result =>
			({
				periodStart: periodDate,
				heroPowerCardId: result.heroPower,
				heroClass: cards.getCard(result.heroPower)?.playerClass,
				totalMatches: result.count,
				totalWins: allHeroPowersWonResult.find(hero => hero.heroPower === result.heroPower)?.count || 0,
			} as HeroPowerStat),
	);
	const values = stats
		.map(
			stat =>
				`('${stat.periodStart}', '${stat.heroPowerCardId}', '${stat.heroClass}', ${stat.totalMatches}, ${stat.totalWins})`,
		)
		.join(',\n');
	const query = `
		INSERT INTO duels_stats_hero_power (periodStart, heroPowerCardId, heroClass, totalMatches, totalWins)
		VALUES ${values}
	`;
	console.log('running query', query);
	await mysql.query(query);
	return stats;
};

const buildSignatureTreasureStats = async (mysql): Promise<readonly SignatureTreasureStat[]> => {
	const lastJobQuery = `
		SELECT periodStart FROM duels_stats_signature_treasure
		ORDER BY periodStart DESC
		LIMIT 1
	`;
	console.log('running last job query', lastJobQuery);
	const lastJobData: readonly any[] = await mysql.query(lastJobQuery);
	console.log('lastJobData', lastJobData && lastJobData.length > 0 && lastJobData[0].periodStart);

	const startDate = lastJobData && lastJobData.length > 0 ? lastJobData[0].periodStart : null;
	const startDateStatemenet = startDate ? `AND t1.creationDate >= '${formatDate(startDate)}' ` : '';

	const endDate = new Date();
	endDate.setHours(0, 0, 0, 0);
	const periodDate = formatDate(endDate);

	const allSignatureTreasuresQuery = `
		SELECT t2.option1 as signatureTreasure, count(*) as count
		FROM replay_summary t1
		INNER JOIN match_stats t3 ON t3.reviewId = t1.reviewId
		INNER JOIN dungeon_run_loot_info t2 ON t3.statValue = t2.runId
		WHERE t1.gameMode = 'duels' 
		AND t1.playerCardId like 'PVPDR_Hero%'
		${startDateStatemenet}
		AND t2.bundleType = 'signature-treasure'
		AND t3.statName = 'duels-run-id'
		GROUP BY signatureTreasure;
	`;
	console.log('running query', allSignatureTreasuresQuery);
	const allSignatureTreasuresResult: readonly any[] = await mysql.query(allSignatureTreasuresQuery);
	console.log('allSignatureTreasuresResult', allSignatureTreasuresResult);

	if (!allSignatureTreasuresResult || allSignatureTreasuresResult.length === 0) {
		console.log('no new signature treasure info');
		return;
	}

	const allSignatureTreasuresWonQuery = `
		SELECT t2.option1 as signatureTreasure, count(*) as count
		FROM replay_summary t1
		INNER JOIN match_stats t3 ON t3.reviewId = t1.reviewId
		INNER JOIN dungeon_run_loot_info t2 ON t3.statValue = t2.runId
		WHERE t1.gameMode = 'duels' 
		AND t1.playerCardId like 'PVPDR_Hero%'
		${startDateStatemenet}
		AND t1.result = 'won'
		AND t2.bundleType = 'signature-treasure'
		AND t3.statName = 'duels-run-id'
		GROUP BY signatureTreasure;
	`;
	console.log('running query', allSignatureTreasuresWonQuery);
	const allSignatureTreasuresWonResult: readonly any[] = await mysql.query(allSignatureTreasuresWonQuery);
	console.log('allSignatureTreasuresWonResult', allSignatureTreasuresWonResult);

	const totalGames = allSignatureTreasuresResult.map(result => result.count).reduce((a, b) => a + b, 0);
	const stats = allSignatureTreasuresResult.map(
		result =>
			({
				periodStart: periodDate,
				signatureTreasureCardId: result.signatureTreasure,
				heroClass: cards.getCard(result.signatureTreasure)?.playerClass,
				totalMatches: result.count,
				totalWins:
					allSignatureTreasuresWonResult.find(hero => hero.signatureTreasure === result.signatureTreasure)
						.count || 0,
			} as SignatureTreasureStat),
	);
	const values = stats
		.map(
			stat =>
				`('${stat.periodStart}', '${stat.signatureTreasureCardId}', '${stat.heroClass}', ${stat.totalMatches}, ${stat.totalWins})`,
		)
		.join(',\n');
	const query = `
		INSERT INTO duels_stats_signature_treasure (periodStart, signatureTreasureCardId, heroClass, totalMatches, totalWins)
		VALUES ${values}
	`;
	console.log('running query', query);
	await mysql.query(query);
	return stats;
};

const findTreasureAndInsertIfMissing = (
	stats: MutableTreasureStat[],
	dbRow: InternalTreasureRow,
	periodStart: string,
	extractor: (dbRow: InternalTreasureRow) => string,
): MutableTreasureStat => {
	const treasureId = extractor(dbRow);
	let treasure: MutableTreasureStat = stats.find(
		stat => stat.playerClass === dbRow.playerClass && stat.cardId === treasureId,
	);
	if (!treasure) {
		treasure = {
			cardId: treasureId,
			periodStart: periodStart,
			playerClass: dbRow.playerClass,
			totalOffered: 0,
			totalPicked: 0,
		};
		stats.push(treasure);
	}
	return treasure;
};

interface InternalTreasureRow {
	playerClass: string;
	option1: string;
	option2: string;
	option3: string;
	chosenOptionIndex: number;
}

interface MutableTreasureStat {
	periodStart: string;
	cardId: string;
	playerClass: string;
	totalOffered: number;
	totalPicked: number;
}
