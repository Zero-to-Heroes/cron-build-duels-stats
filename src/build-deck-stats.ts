/* eslint-disable @typescript-eslint/no-use-before-define */
import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { GameTag } from '@firestone-hs/reference-data';
import { ServerlessMysql } from 'serverless-mysql';
import { DeckStat } from './stat';
import { formatDate } from './utils/util-functions';
import { cards } from './_build-duels-stats';

const MAXIMUM_DECKS_FOR_COMBINATION = 3;

export const loadDeckStats = async (mysql: ServerlessMysql): Promise<readonly DeckStat[]> => {
	const query = `
		SELECT * FROM duels_stats_deck
		WHERE gameMode = 'paid-duels'
		AND rating >= 4000
		AND periodStart > DATE_SUB(NOW(), INTERVAL 30 DAY)
		ORDER BY id DESC;
	`;
	console.log('running query', query);
	const rows: InternalDuelsDeckStatRow[] = await mysql.query(query);
	console.log('building decks');
	const groupedByHero = groupByFunction((row: InternalDuelsDeckStatRow) => row.heroCardId)(rows);
	const finalRows = Object.values(groupedByHero).flatMap(rows => extractInterestingDecksForHero(rows));
	return finalRows
		.sort((a, b) => b.id - a.id)
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
		}));
};

const extractInterestingDecksForHero = (rows: readonly InternalDuelsDeckStatRow[]): InternalDuelsDeckStatRow[] => {
	const groupedByHeroPower = groupByFunction((row: InternalDuelsDeckStatRow) => row.heroPowerCardId)(rows);
	return Object.values(groupedByHeroPower).flatMap(rows => extractInterestingDecksForHeroPower(rows));
};

const extractInterestingDecksForHeroPower = (rows: readonly InternalDuelsDeckStatRow[]): InternalDuelsDeckStatRow[] => {
	const groupedBySignatureTreasure = groupByFunction((row: InternalDuelsDeckStatRow) => row.signatureTreasureCardId)(
		rows,
	);
	return Object.values(groupedBySignatureTreasure).flatMap(rows => extractInterestingDecksForSignatureTreasure(rows));
};

const extractInterestingDecksForSignatureTreasure = (
	rows: readonly InternalDuelsDeckStatRow[],
): InternalDuelsDeckStatRow[] => {
	const groupedByPassives = groupByFunction((row: InternalDuelsDeckStatRow) =>
		row.treasuresCardIds
			.split(',')
			.map(cardId => cards.getCard(cardId))
			.filter(card => card.mechanics?.includes(GameTag[GameTag.DUNGEON_PASSIVE_BUFF]))
			.map(card => card.id)
			.sort()
			.join('-'),
	)(rows);
	return Object.values(groupedByPassives).flatMap(rows => extractInterestingDecksForPassives(rows));
};

const extractInterestingDecksForPassives = (rows: readonly InternalDuelsDeckStatRow[]): InternalDuelsDeckStatRow[] => {
	const groupedByDecklist = groupByFunction((row: InternalDuelsDeckStatRow) => row.decklist)(rows);
	return Object.values(groupedByDecklist).flatMap(rows =>
		[...rows].sort((a, b) => b.id - a.id).slice(0, MAXIMUM_DECKS_FOR_COMBINATION),
	);
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
