import { HeroPowerStat } from '../stat';
import { formatDate } from '../utils/util-functions';

export const buildHeroPowerStats = async (mysql, cards): Promise<readonly HeroPowerStat[]> => {
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
