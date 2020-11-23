/* eslint-disable @typescript-eslint/no-use-before-define */
import { AllCardsService } from '@firestone-hs/reference-data';
import { gzipSync } from 'zlib';
import { getConnection } from './db/rds';
import { S3 } from './db/s3';
import { loadStats } from './retrieve-duels-global-stats';
import { buildHeroStats } from './services/hero';
import { buildHeroPositionStats } from './services/hero-position';
import { buildHeroPowerStats } from './services/hero-power';
import { buildHeroPowerPositionStats } from './services/hero-power-position';
import { buildSignatureTreasureStats } from './services/signature-treasure';
import { buildSignatureTreasurePositionStats } from './services/signature-treasure-position';
import { buildTreasureStats } from './services/treasure';

const cards = new AllCardsService();
const s3 = new S3();

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event): Promise<any> => {
	// console.log('event', JSON.stringify(event, null, 4));
	await cards.initializeCardsDb();
	const mysql = await getConnection();

	await buildStats(mysql, cards, 'duels');
	await buildStats(mysql, cards, 'paid-duels');
	console.log('new stats inserted in db');

	// TODO: load stats, and save as JSON
	const stats = await loadStats(mysql);
	console.log('built stats to cache');
	await mysql.end();
	const stringResults = JSON.stringify(stats);
	console.log('stringified results');
	const gzippedResults = gzipSync(stringResults);
	console.log('zipped results');
	await s3.writeFile(
		gzippedResults,
		'static.zerotoheroes.com',
		'api/duels-global-stats.json',
		'application/json',
		'gzip',
	);
	console.log('new stats saved to s3');

	return { statusCode: 200, body: null };
};

const buildStats = async (mysql, cards, gameMode) => {
	const heroStats = await buildHeroStats(mysql, cards, gameMode);
	const heroPowerStats = await buildHeroPowerStats(mysql, cards, gameMode);
	const signatureTreasureStats = await buildSignatureTreasureStats(mysql, cards, gameMode);
	const treasureStats = await buildTreasureStats(mysql, cards, gameMode);
	const heroPositionStats = await buildHeroPositionStats(mysql, cards, gameMode);
	const heroPowerPositionStats = await buildHeroPowerPositionStats(mysql, cards, gameMode);
	const signatureTreasurePositionStats = await buildSignatureTreasurePositionStats(mysql, cards, gameMode);
};
