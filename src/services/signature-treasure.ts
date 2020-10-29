import { AllCardsService } from '@firestone-hs/reference-data';
import { SignatureTreasureStat } from '../stat';
import { formatDate } from '../utils/util-functions';

export const buildSignatureTreasureStats = async (
	mysql,
	cards: AllCardsService,
): Promise<readonly SignatureTreasureStat[]> => {
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
