import { SignatureTreasureStat } from '../stat';
import { formatDate, getCardFromCardId } from '../utils/util-functions';

export const buildSignatureTreasurePositionStats = async (
	mysql,
	cards,
	gameMode: 'duels' | 'paid-duels',
): Promise<readonly SignatureTreasureStat[]> => {
	const lastJobQuery = `
		SELECT periodStart FROM duels_stats_signature_treasure_position
		WHERE gameMode = '${gameMode}'
		ORDER BY periodStart DESC
		LIMIT 1
	`;
	const lastJobData: readonly any[] = await mysql.query(lastJobQuery);

	const startDate = lastJobData && lastJobData.length > 0 ? lastJobData[0].periodStart : null;
	const startDateStatemenet = startDate ? `AND t1.creationDate >= '${formatDate(startDate)}' ` : '';

	const endDate = new Date();
	const periodDate = formatDate(endDate);

	const allHeroesQuery = `
		SELECT t2.option1 as signatureTreasure, t1.playerClass, SUBSTRING_INDEX(t1.additionalResult, '-', 1) AS wins, t1.result, COUNT(*) as count
		FROM replay_summary t1
		INNER JOIN dungeon_run_loot_info t2 ON t1.runId = t2.runId
		WHERE t1.gameMode = '${gameMode}' 
		AND t1.playerCardId like 'PVPDR_Hero%'
		AND (
			(SUBSTRING_INDEX(t1.additionalResult, '-', 1) = 11 AND t1.result = 'won')
			OR (SUBSTRING_INDEX(t1.additionalResult, '-', -1) = 2 AND t1.result = 'lost')
		)
		${startDateStatemenet}
		AND t2.bundleType = 'signature-treasure'
		GROUP BY signatureTreasure, t1.playerClass, SUBSTRING_INDEX(t1.additionalResult, '-', 1), t1.result;
	`;
	const allHeroesResult: readonly any[] = await mysql.query(allHeroesQuery);

	if (!allHeroesResult || allHeroesResult.length === 0) {
		return;
	}

	const stats = allHeroesResult.map(
		result =>
			({
				periodStart: periodDate,
				signatureTreasureCardId: getCardFromCardId(result.signatureTreasure, cards)?.id,
				heroClass: result.playerClass?.toLowerCase(),
				totalMatches: result.count,
				totalWins: result.result === 'won' ? +result.wins + 1 : +result.wins,
			} as SignatureTreasureStat),
	);
	const values = stats
		.map(
			stat =>
				`('${gameMode}', '${stat.periodStart}', '${stat.signatureTreasureCardId}', '${stat.heroClass}', ${stat.totalMatches}, ${stat.totalWins})`,
		)
		.join(',\n');
	const query = `
		INSERT INTO duels_stats_signature_treasure_position (gameMode, periodStart, signatureTreasureCardId, heroClass, totalMatches, totalWins)
		VALUES ${values}
	`;
	await mysql.query(query);
	return stats;
};
