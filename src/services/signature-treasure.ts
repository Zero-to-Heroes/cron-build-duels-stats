import { AllCardsService } from '@firestone-hs/reference-data';
import { SignatureTreasureStat } from '../stat';
import { formatDate, getCardFromCardId } from '../utils/util-functions';

export const buildSignatureTreasureStats = async (
	mysql,
	cards: AllCardsService,
	gameMode: 'duels' | 'paid-duels',
): Promise<readonly SignatureTreasureStat[]> => {
	const lastJobQuery = `
		SELECT periodStart FROM duels_stats_signature_treasure
		WHERE gameMode = '${gameMode}'
		ORDER BY periodStart DESC
		LIMIT 1
	`;
	const lastJobData: readonly any[] = await mysql.query(lastJobQuery);

	const startDate = lastJobData && lastJobData.length > 0 ? lastJobData[0].periodStart : null;
	const startDateStatemenet = startDate ? `AND t1.creationDate >= '${formatDate(startDate)}' ` : '';

	const endDate = new Date();
	const periodDate = formatDate(endDate);

	const allSignatureTreasuresQuery = `
		SELECT t2.option1 as signatureTreasure, t1.playerClass, count(*) as count
		FROM replay_summary t1
		INNER JOIN dungeon_run_loot_info t2 ON t1.runId = t2.runId
		WHERE t1.gameMode = '${gameMode}' 
		AND t1.playerCardId like 'PVPDR_Hero%'
		${startDateStatemenet}
		AND t2.bundleType = 'signature-treasure'
		GROUP BY signatureTreasure, t1.playerClass;
	`;
	const allSignatureTreasuresResult: readonly any[] = await mysql.query(allSignatureTreasuresQuery);

	if (!allSignatureTreasuresResult || allSignatureTreasuresResult.length === 0) {
		return;
	}

	const allSignatureTreasuresWonQuery = `
		SELECT t2.option1 as signatureTreasure, t1.playerClass, count(*) as count
		FROM replay_summary t1
		INNER JOIN dungeon_run_loot_info t2 ON t1.runId = t2.runId
		WHERE t1.gameMode = '${gameMode}' 
		AND t1.playerCardId like 'PVPDR_Hero%'
		${startDateStatemenet}
		AND t1.result = 'won'
		AND t2.bundleType = 'signature-treasure'
		GROUP BY signatureTreasure, t1.playerClass;
	`;
	const allSignatureTreasuresWonResult: readonly any[] = await mysql.query(allSignatureTreasuresWonQuery);

	// const totalGames = allSignatureTreasuresResult.map(result => result.count).reduce((a, b) => a + b, 0);
	const stats = allSignatureTreasuresResult
		.map(
			result =>
				({
					periodStart: periodDate,
					signatureTreasureCardId: getCardFromCardId(result.signatureTreasure, cards)?.id,
					heroClass: result.playerClass,
					totalMatches: result.count,
					totalWins:
						allSignatureTreasuresWonResult.find(
							hero =>
								hero.signatureTreasure === result.signatureTreasure &&
								hero.playerClass === result.playerClass,
						)?.count || 0,
				} as SignatureTreasureStat),
		)
		.filter(result => {
			const card = getCardFromCardId(result.signatureTreasureCardId, cards);
			return card.classes?.length
				? card.classes.includes(result.heroClass.toUpperCase())
				: card.playerClass?.toLowerCase() === result.heroClass.toLowerCase();
		});
	const values = stats
		.map(
			stat =>
				`('${gameMode}', '${stat.periodStart}', '${stat.signatureTreasureCardId}', '${stat.heroClass}', ${stat.totalMatches}, ${stat.totalWins})`,
		)
		.join(',\n');
	const query = `
		INSERT INTO duels_stats_signature_treasure (gameMode, periodStart, signatureTreasureCardId, heroClass, totalMatches, totalWins)
		VALUES ${values}
	`;
	await mysql.query(query);
	return stats;
};
