/* eslint-disable @typescript-eslint/no-use-before-define */
import { getConnection, S3 } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { constants, gzipSync } from 'zlib';
import { loadDeckStats } from './retrieve-duels-deck-stats';
import { loadStats } from './retrieve-duels-global-stats';
import { DeckStat, DuelsStat, DuelsStatDecks, InternalDuelsStat } from './stat';

const cards = new AllCardsService();
const s3 = new S3();

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event): Promise<any> => {
	await cards.initializeCardsDb();

	await handleSplitDuelsStats();

	return { statusCode: 200, body: null };
};

const handleSplitDuelsStats = async () => {
	console.log('building new stats with hero class');
	const mysql = await getConnection();
	const stats: InternalDuelsStat = await loadStats(mysql);
	await mysql.end();
	if (!stats) {
		console.error('no stats');
		return;
	}

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
			delete (partialStats as any).decks;
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
	const mysql2 = await getConnection();
	const decks: readonly DeckStat[] = await loadDeckStats(mysql2);
	await mysql2.end();
	const statsForDecks: DuelsStatDecks = {
		lastUpdateDate: stats.lastUpdateDate,
		decks: decks,
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
