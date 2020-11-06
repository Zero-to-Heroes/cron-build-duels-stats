import { HeroStat } from '../stat';
import { formatDate } from '../utils/util-functions';

export const buildHeroStats = async (mysql, cards): Promise<readonly HeroStat[]> => {
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

	// const totalGames = allHeroesResult.map(result => result.count).reduce((a, b) => a + b, 0);
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
