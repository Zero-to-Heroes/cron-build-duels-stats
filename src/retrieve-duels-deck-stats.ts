/* eslint-disable @typescript-eslint/no-use-before-define */
import { ServerlessMysql } from 'serverless-mysql';
import { DeckStat } from './stat';
import { formatDate } from './utils/util-functions';

export const loadDeckStats = async (mysql: ServerlessMysql): Promise<readonly DeckStat[]> => {
	const query = `
		SELECT * FROM duels_stats_deck
		WHERE gameMode = 'paid-duels'
		AND rating >= 4000
		ORDER BY id DESC;
	`;
	console.log('running query', query);
	const rows: InternalDuelsDeckStatRow[] = await mysql.query(query);
	console.log('building decks');
	return rows
		.sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime())
		.map(row => ({
			id: row.id,
			gameMode: row.gameMode,
			periodStart: formatDate(row.periodStart),
			buildNumber: row.buildNumber,
			decklist: row.decklist,
			finalDecklist: row.finalDecklist,
			hero: row.heroCardId,
			playerClass: row.playerClass,
			heroCardId: row.heroCardId,
			heroPowerCardId: row.heroPowerCardId,
			signatureTreasureCardId: row.signatureTreasureCardId,
			treasuresCardIds: row.treasuresCardIds.split(',').filter(t => !!t),
			runId: row.runId,
			wins: row.wins,
			losses: row.losses,
			rating: row.rating,
			runStartDate: formatDate(row.runStartDate),
		}))
		.slice(0, 1000);
};

interface InternalDuelsDeckStatRow {
	readonly id: number;
	readonly gameMode: 'duels' | 'paid-duels';
	readonly periodStart: Date;
	readonly playerClass: string;
	readonly decklist: string;
	readonly heroCardId: string;
	readonly heroPowerCardId: string;
	readonly signatureTreasureCardId: string;
	readonly treasuresCardIds: string;
	readonly runId: string;
	readonly finalDecklist: string;
	readonly wins: number;
	readonly losses: number;
	readonly rating: number;
	readonly runStartDate: Date;
	readonly buildNumber: number;
}
