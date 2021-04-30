import { AllCardsService } from '@firestone-hs/reference-data';
import { formatDate, getCardFromCardId } from '../utils/util-functions';

export const buildTreasureStats = async (
	mysql,
	cards: AllCardsService,
	gameMode: 'duels' | 'paid-duels',
): Promise<readonly MutableTreasureStat[]> => {
	const lastJobQuery = `
		SELECT periodStart FROM duels_stats_treasure
		WHERE gameMode = '${gameMode}'
		ORDER BY periodStart DESC
		LIMIT 1
	`;
	const lastJobData: readonly any[] = await mysql.query(lastJobQuery);

	const startDate = lastJobData && lastJobData.length > 0 ? lastJobData[0].periodStart : null;
	const startDateStatemenet = startDate ? `AND t1.creationDate >= '${formatDate(startDate)}' ` : '';

	const endDate = new Date();
	const periodDate = formatDate(endDate);

	const query = `
		SELECT t1.creationDate, t2.playerClass, t1.option1, t1.option2, t1.option3, t1.chosenOptionIndex
		FROM dungeon_run_loot_info t1
		INNER JOIN replay_summary t2 ON t1.reviewId = t2.reviewId
		AND t2.playerCardId like 'PVPDR_Hero%'
		${startDateStatemenet}
		WHERE t1.adventureType = '${gameMode}'
		AND t1.bundleType = 'treasure'
		ORDER BY t2.playerClass;
	`;
	const results: readonly InternalTreasureRow[] = await mysql.query(query);

	if (!results || results.length === 0) {
		return;
	}

	const stats: MutableTreasureStat[] = [];

	for (const dbRow of results) {
		const option1Treasure = findTreasureAndInsertIfMissing(
			stats,
			dbRow,
			periodDate,
			(dbRow: InternalTreasureRow) => dbRow.option1,
			cards,
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
			cards,
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
			cards,
		);
		option3Treasure.totalOffered++;
		if (dbRow.chosenOptionIndex === 3) {
			option3Treasure.totalPicked++;
		}
	}

	const values = stats
		.map(
			stat =>
				`('${gameMode}', '${stat.periodStart}', '${stat.cardId}', '${stat.playerClass}', ${stat.totalOffered}, ${stat.totalPicked})`,
		)
		.join(',\n');
	const insertionQuery = `
		INSERT INTO duels_stats_treasure
		(gameMode, periodStart, cardId, playerClass, totalOffered, totalPicked)
		VALUES ${values}
	`;
	await mysql.query(insertionQuery);
	return stats;
};

const findTreasureAndInsertIfMissing = (
	stats: MutableTreasureStat[],
	dbRow: InternalTreasureRow,
	periodStart: string,
	extractor: (dbRow: InternalTreasureRow) => string,
	cards: AllCardsService,
): MutableTreasureStat => {
	const treasureId = extractor(dbRow);
	let treasure: MutableTreasureStat = stats.find(
		stat => stat.playerClass === dbRow.playerClass && stat.cardId === treasureId,
	);
	if (!treasure) {
		treasure = {
			cardId: getCardFromCardId(treasureId, cards)?.id,
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
