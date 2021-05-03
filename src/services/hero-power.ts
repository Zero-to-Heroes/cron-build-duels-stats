import { HeroPowerStat } from '../stat';
import { formatDate, getCardFromCardId } from '../utils/util-functions';

export const buildHeroPowerStats = async (
	mysql,
	cards,
	gameMode: 'duels' | 'paid-duels',
): Promise<readonly HeroPowerStat[]> => {
	const lastJobQuery = `
		SELECT periodStart FROM duels_stats_hero_power
		WHERE gameMode = '${gameMode}'
		ORDER BY periodStart DESC
		LIMIT 1
	`;
	const lastJobData: readonly any[] = await mysql.query(lastJobQuery);

	const startDate = lastJobData && lastJobData.length > 0 ? lastJobData[0].periodStart : null;
	const startDateStatemenet = startDate ? `AND t1.creationDate >= '${formatDate(startDate)}' ` : '';

	const endDate = new Date();
	const periodDate = formatDate(endDate);

	const allHeroPowersQuery = `
		SELECT t2.option1 as heroPower, count(*) as count
		FROM replay_summary t1
		INNER JOIN dungeon_run_loot_info t2 ON t1.runId = t2.runId
		WHERE t1.gameMode = '${gameMode}' 
		AND t1.playerCardId like 'PVPDR_Hero%'
		${startDateStatemenet}
		AND t2.bundleType = 'hero-power'
		GROUP BY heroPower;
	`;
	const allHeroPowersResult: readonly any[] = await mysql.query(allHeroPowersQuery);

	if (!allHeroPowersResult || allHeroPowersResult.length === 0) {
		return;
	}

	const allHeroPowersWonQuery = `
		SELECT t2.option1 as heroPower, count(*) as count
		FROM replay_summary t1
		INNER JOIN dungeon_run_loot_info t2 ON t1.runId = t2.runId
		WHERE t1.gameMode = '${gameMode}' 
		AND t1.playerCardId like 'PVPDR_Hero%'
		AND t1.result = 'won'
		${startDateStatemenet}
		AND t2.bundleType = 'hero-power'
		GROUP BY heroPower;
	`;
	const allHeroPowersWonResult: readonly any[] = await mysql.query(allHeroPowersWonQuery);

	const totalGames = allHeroPowersResult.map(result => result.count).reduce((a, b) => a + b, 0);
	const stats = allHeroPowersResult.map(
		result =>
			({
				periodStart: periodDate,
				heroPowerCardId: getCardFromCardId(result.heroPower, cards)?.id,
				heroClass: getCardFromCardId(result.heroPower, cards)?.playerClass,
				totalMatches: result.count,
				totalWins: allHeroPowersWonResult.find(hero => hero.heroPower === result.heroPower)?.count || 0,
			} as HeroPowerStat),
	);
	const values = stats
		.map(
			stat =>
				`('${gameMode}', '${stat.periodStart}', '${stat.heroPowerCardId}', '${stat.heroClass}', ${stat.totalMatches}, ${stat.totalWins})`,
		)
		.join(',\n');
	const query = `
		INSERT INTO duels_stats_hero_power (gameMode, periodStart, heroPowerCardId, heroClass, totalMatches, totalWins)
		VALUES ${values}
	`;
	await mysql.query(query);
	return stats;
};
