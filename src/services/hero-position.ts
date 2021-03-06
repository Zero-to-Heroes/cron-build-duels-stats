import { HeroPositionStat } from '../stat';
import { formatDate, getCardFromCardId } from '../utils/util-functions';

export const buildHeroPositionStats = async (
	mysql,
	cards,
	gameMode: 'duels' | 'paid-duels',
): Promise<readonly HeroPositionStat[]> => {
	const lastJobQuery = `
		SELECT periodStart FROM duels_stats_hero_position
		WHERE gameMode = '${gameMode}'
		ORDER BY periodStart DESC
		LIMIT 1
	`;
	const lastJobData: readonly any[] = await mysql.query(lastJobQuery);

	const startDate = lastJobData && lastJobData.length > 0 ? lastJobData[0].periodStart : null;
	const startDateStatemenet = startDate ? `AND creationDate >= '${formatDate(startDate)}' ` : '';

	const endDate = new Date();
	const periodDate = formatDate(endDate);

	const allHeroesQuery = `
		SELECT playerCardId, SUBSTRING_INDEX(additionalResult, '-', 1) AS wins, result, COUNT(*) as count
		FROM replay_summary
		WHERE gameMode = '${gameMode}' 
		AND playerCardId LIKE 'PVPDR_Hero%'
		AND (
			(SUBSTRING_INDEX(additionalResult, '-', 1) = 11 AND result = 'won')
			OR (SUBSTRING_INDEX(additionalResult, '-', -1) = 2 AND result = 'lost')
		)
		${startDateStatemenet}
		GROUP BY playerCardId, SUBSTRING_INDEX(additionalResult, '-', 1), result;
	`;
	const allHeroesResult: readonly any[] = await mysql.query(allHeroesQuery);

	if (!allHeroesResult || allHeroesResult.length === 0) {
		return;
	}

	// const totalGames = allHeroesResult.map(result => result.count).reduce((a, b) => a + b, 0);
	const stats: readonly HeroPositionStat[] = allHeroesResult.map(
		result =>
			({
				periodStart: periodDate,
				heroCardId: getCardFromCardId(result.playerCardId, cards)?.id,
				heroClass: getCardFromCardId(result.playerCardId, cards)?.playerClass,
				totalMatches: result.count,
				totalWins: result.result === 'won' ? +result.wins + 1 : +result.wins,
			} as HeroPositionStat),
	);
	const values = stats
		.map(
			stat =>
				`('${gameMode}', '${stat.periodStart}', '${stat.heroCardId}', '${stat.heroClass}', ${stat.totalMatches}, ${stat.totalWins})`,
		)
		.join(',\n');
	const query = `
		INSERT INTO duels_stats_hero_position (gameMode, periodStart, heroCardId, heroClass, totalMatches, totalWins)
		VALUES ${values}
	`;
	await mysql.query(query);
	return stats;
};
