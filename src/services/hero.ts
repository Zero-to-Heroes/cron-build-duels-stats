import { HeroStat } from '../stat';
import { formatDate, getCardFromCardId } from '../utils/util-functions';

export const buildHeroStats = async (mysql, cards, gameMode: 'duels' | 'paid-duels'): Promise<readonly HeroStat[]> => {
	const lastJobQuery = `
		SELECT periodStart FROM duels_stats_hero
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
		SELECT playerCardId, count(*) as count FROM replay_summary
		WHERE gameMode = '${gameMode}' 
		AND playerCardId like 'PVPDR_Hero%'
		${startDateStatemenet}
		GROUP BY playerCardId;
	`;
	const allHeroesResult: readonly any[] = await mysql.query(allHeroesQuery);

	if (!allHeroesResult || allHeroesResult.length === 0) {
		return;
	}

	const allHeroesWonQuery = `
		SELECT playerCardId, count(*) as count FROM replay_summary
		WHERE gameMode = '${gameMode}' 
		AND playerCardId like 'PVPDR_Hero%'
		AND result = 'won'
		${startDateStatemenet}
		GROUP BY playerCardId;
	`;
	const allHeroesWonResult: readonly any[] = await mysql.query(allHeroesWonQuery);

	// const totalGames = allHeroesResult.map(result => result.count).reduce((a, b) => a + b, 0);
	const stats = allHeroesResult.map(
		result =>
			({
				periodStart: periodDate,
				heroCardId: getCardFromCardId(result.playerCardId, cards)?.id,
				heroClass: getCardFromCardId(result.playerCardId, cards)?.playerClass,
				totalMatches: result.count,
				totalWins: allHeroesWonResult.find(hero => hero.playerCardId === result.playerCardId)?.count || 0,
			} as HeroStat),
	);
	const values = stats
		.map(
			stat =>
				`('${gameMode}', '${stat.periodStart}', '${stat.heroCardId}', '${stat.heroClass}', ${stat.totalMatches}, ${stat.totalWins})`,
		)
		.join(',\n');
	const query = `
		INSERT INTO duels_stats_hero (gameMode, periodStart, heroCardId, heroClass, totalMatches, totalWins)
		VALUES ${values}
	`;
	await mysql.query(query);
	return stats;
};
