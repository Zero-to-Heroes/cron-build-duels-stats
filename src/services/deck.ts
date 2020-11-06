import { AllCardsService, GameFormat } from '@firestone-hs/reference-data';
import { DeckDefinition, decode, encode } from 'deckstrings';
import { DeckStat } from '../stat';
import { formatDate, toCreationDate } from '../utils/util-functions';

// TODO: move this to a specific lambda that is triggered after every match (or at least only if it's a 12 win)
// so that we have the info in real time, which might make it easier on the DB
export const buildDecks = async (mysql, cards: AllCardsService): Promise<readonly DeckStat[]> => {
	const lastJobQuery = `
		SELECT periodStart FROM duels_stats_deck
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

	const decksQuery = `
		SELECT x1.creationDate, x1.playerClass, x1.playerCardId, x1.playerRank, x1.playerDecklist, x2.statValue AS runId, x3.bundleType, 
		CASE  
			WHEN x3.chosenOptionIndex = 1 THEN x3.option1 
			WHEN x3.chosenOptionIndex = 2 THEN x3.option2  
			ELSE x3.option3 END as pickedTreasure 
		FROM replay_summary x1 
		INNER JOIN match_stats x2 ON x1.reviewId = x2.reviewId 
		INNER JOIN dungeon_run_loot_info x3 ON x3.runId = x2.statValue 
		WHERE x2.statValue IN 
		(
			SELECT t2.statValue AS runId
			FROM replay_summary t1
			INNER JOIN match_stats t2 ON t1.reviewId = t2.reviewId
			WHERE gameMode = 'duels'
			AND additionalResult IN ('11-0', '11-1', '11-2')
			AND result = 'won'
			AND playerDecklist IS NOT null
			AND statName = 'duels-run-id'
		)
		AND x1.playerDecklist IS NOT null 
		AND x1.additionalResult = '0-0' 
		AND x3.bundleType IN ('treasure', 'hero-power', 'signature-treasure') 
		ORDER BY creationDate DESC;
	`;
	console.log('running query', decksQuery);
	const decksResults: readonly any[] = await mysql.query(decksQuery);
	console.log('decksResult');

	if (!decksResults || decksResults.length === 0) {
		console.log('no new deck info');
		return;
	}

	const stats = decksResults
		.filter(result => result.bundleType === 'hero-power')
		.map(result => {
			const decklist = cleanDecklist(result.playerDecklist, result.playerCardId, cards);
			if (!decklist) {
				console.log('invalid decklist', result.playerDecklist, result);
				return null;
			}
			return {
				periodStart: periodDate,
				playerClass: result.playerClass,
				decklist: decklist,
				heroPowerCardId: result.pickedTreasure,
				signatureTreasureCardId: findSignatureTreasureCardId(decksResults, result.runId),
				treasuresCardIds: findTreasuresCardIds(decksResults, result.runId),
				runId: result.runId,
				rating: result.playerRank,
				runStartDate: toCreationDate(result.creationDate),
			} as DeckStat;
		})
		.filter(stat => stat);

	const values = stats
		.map(
			stat =>
				`('${stat.periodStart}', '${stat.playerClass}', '${stat.decklist}', '${stat.heroPowerCardId}', '${
					stat.signatureTreasureCardId
				}', '${stat.treasuresCardIds.join(',')}', '${stat.runId}', ${stat.rating}, '${stat.runStartDate}')`,
		)
		.join(',\n');
	const query = `
		INSERT INTO duels_stats_deck (periodStart, playerClass, decklist, heroPowerCardId, signatureTreasureCardId, treasuresCardIds, runId, rating, runStartDate)
		VALUES ${values}
	`;
	console.log('running query', query);
	await mysql.query(query);
	return stats;
};

const cleanDecklist = (initialDecklist: string, playerCardId: string, cards: AllCardsService): string => {
	console.log('cleaning decklist', initialDecklist);
	const decoded = decode(initialDecklist);
	console.log('decoded', decoded);
	const validCards = decoded.cards.filter(dbfCardId => cards.getCardFromDbfId(dbfCardId[0]).collectible);
	if (validCards.length !== 15) {
		console.error('Invalid deck list', initialDecklist, decoded);
		return null;
	}
	console.log('valid cards', validCards);
	const hero = getHero(playerCardId, cards);
	console.log('hero', playerCardId, hero);
	const newDeck: DeckDefinition = {
		cards: validCards,
		heroes: !hero ? decoded.heroes : [hero],
		format: GameFormat.FT_WILD,
	};
	console.log('new deck', newDeck);
	const newDeckstring = encode(newDeck);
	console.log('new deckstring', newDeckstring);
	return newDeckstring;
};

const getHero = (playerCardId: string, cards: AllCardsService): number => {
	const playerClass = cards.getCard(playerCardId)?.playerClass;
	switch (playerClass) {
		case 'DemonHunter':
			return 56550;
		case 'Druid':
			return 274;
		case 'Hunter':
			return 31;
		case 'Mage':
			return 637;
		case 'Paladin':
			return 671;
		case 'Priest':
			return 813;
		case 'Rogue':
			return 930;
		case 'Shaman':
			return 1066;
		case 'Warlock':
			return 893;
		case 'Warrior':
		default:
			return 7;
	}
};

const findSignatureTreasureCardId = (decksResults: readonly any[], runId: string): string => {
	const sigs = decksResults
		.filter(result => result.runId === runId)
		.filter(result => result.bundleType === 'signature-treasure');
	return sigs.length === 0 ? null : sigs[0].pickedTreasure;
};

const findTreasuresCardIds = (decksResults: readonly any[], runId: string): readonly string[] => {
	return decksResults
		.filter(result => result.runId === runId)
		.filter(result => result.bundleType === 'treasure')
		.map(result => result.pickedTreasure);
};
