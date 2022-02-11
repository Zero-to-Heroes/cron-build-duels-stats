/* eslint-disable @typescript-eslint/no-use-before-define */
import { AllCardsService } from '@firestone-hs/reference-data';
import { ServerlessMysql } from 'serverless-mysql';
import { constants, gzipSync } from 'zlib';
import { getConnection } from './db/rds';
import { S3 } from './db/s3';
import { loadStats } from './retrieve-duels-global-stats';
import { DateMark, DuelsStat, DuelsStatDecks, InternalDuelsStat, MmrPercentile } from './stat';

const cards = new AllCardsService();
const s3 = new S3();

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event): Promise<any> => {
	await cards.initializeCardsDb();
	const mysql = await getConnection();

	// console.log('building new stats');
	// const newStats = await loadNewStats(mysql);

	// console.log('saving stats');
	// const gzippedNewResults = gzipSync(JSON.stringify(newStats), {
	// 	level: constants.Z_BEST_COMPRESSION,
	// });
	// await s3.writeFile(
	// 	gzippedNewResults,
	// 	'static.zerotoheroes.com',
	// 	'api/duels-global-stats-heroes.gz.json',
	// 	'application/json',
	// 	'gzip',
	// );

	await handleSplitDuelsStats(mysql);
	await mysql.end();

	return { statusCode: 200, body: null };
};

const handleSplitDuelsStats = async (mysql: ServerlessMysql) => {
	console.log('building new stats with hero class');
	const stats: InternalDuelsStat = await loadStats(mysql);

	console.log('saving global statsstats');
	const gzippedNewResults2 = gzipSync(JSON.stringify(stats), {
		level: constants.Z_BEST_COMPRESSION,
	});
	await s3.writeFile(
		gzippedNewResults2,
		'static.zerotoheroes.com',
		'api/duels-global-stats-hero-class.gz.json',
		'application/json',
		'gzip',
	);

	// Now split the stats in smaller files, based on:
	// - MMR
	// - Time
	const combinations: { percentile: MmrPercentile; date: DateMark }[] = [];
	for (const percentile of stats.mmrPercentiles) {
		for (const dateMark of stats.dates) {
			console.log('filtering stats for', percentile, dateMark);
			const partialStats: DuelsStat = {
				...stats,
				heroes: stats.heroes
					.filter(stat => stat.mmrPercentile === percentile.percentile)
					.filter(stat => stat.date === dateMark),
				treasures: stats.treasures
					.filter(stat => stat.mmrPercentile === percentile.percentile)
					.filter(stat => stat.date === dateMark),
			};
			const gzipped = gzipSync(JSON.stringify(partialStats), {
				level: constants.Z_BEST_COMPRESSION,
			});
			console.log('gzipped');
			await s3.writeFile(
				gzipped,
				'static.zerotoheroes.com',
				`api/duels/duels-global-stats-hero-class-${percentile.percentile}-${dateMark}.gz.json`,
				'application/json',
				'gzip',
			);
			console.log('file saved');
		}
	}

	console.log('building stats for decks');
	const statsForDecks: DuelsStatDecks = {
		lastUpdateDate: stats.lastUpdateDate,
		decks: stats.decks,
	};
	const gzipped = gzipSync(JSON.stringify(statsForDecks), {
		level: constants.Z_BEST_COMPRESSION,
	});
	console.log('gzipped statsForDecks');
	await s3.writeFile(
		gzipped,
		'static.zerotoheroes.com',
		`api/duels/duels-global-stats-hero-class-decks.gz.json`,
		'application/json',
		'gzip',
	);
	console.log('file saved statsForDecks');
};
