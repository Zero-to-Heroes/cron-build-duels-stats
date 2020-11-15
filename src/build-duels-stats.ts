/* eslint-disable @typescript-eslint/no-use-before-define */
import { AllCardsService } from '@firestone-hs/reference-data';
import { getConnection } from './db/rds';
import { buildSignatureTreasurePositionStats } from './services/signature-treasure-position';

const cards = new AllCardsService();

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event): Promise<any> => {
	// console.log('event', JSON.stringify(event, null, 4));
	await cards.initializeCardsDb();
	const mysql = await getConnection();

	// For now, just build stats overall, but also build for several time periods (last patch, last N days, etc.)
	// const today = toCreationDate(new Date());
	// const earliestStartDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

	// const heroStats = await buildHeroStats(mysql, cards, 'duels');
	// const heroPowerStats = await buildHeroPowerStats(mysql, cards, 'duels');
	// const signatureTreasureStats = await buildSignatureTreasureStats(mysql, cards, 'duels');
	// const treasureStats = await buildTreasureStats(mysql, 'duels');
	// const heroPositionStats = await buildHeroPositionStats(mysql, cards, 'duels');
	// const heroPowerPositionStats = await buildHeroPowerPositionStats(mysql, cards, 'duels');
	const signatureTreasurePositionStats = await buildSignatureTreasurePositionStats(mysql, cards, 'duels');

	return { statusCode: 200, body: null };
};
