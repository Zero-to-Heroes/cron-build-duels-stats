import { ReferencePlayerClass } from '@firestone-hs/reference-data';

// This contains all the non-deck stats
export interface DuelsStat {
	readonly lastUpdateDate: string;
	readonly heroes: readonly DuelsHeroStat[];
	readonly treasures: readonly DuelsTreasureStat[];
	readonly mmrPercentiles: readonly MmrPercentile[];
	readonly dates: readonly DateMark[];
}

export interface DuelsStatDecks {
	readonly lastUpdateDate: string;
	readonly decks: readonly DeckStat[];
}

export interface InternalDuelsStat {
	readonly lastUpdateDate: string;
	readonly heroes: readonly DuelsHeroStat[];
	readonly treasures: readonly DuelsTreasureStat[];
	readonly mmrPercentiles: readonly MmrPercentile[];
	readonly dates: readonly DateMark[];
}

export type DateMark = 'all-time' | 'last-patch' | 'past-seven' | 'past-three';

export interface DuelsHeroStat {
	readonly date: DateMark;
	readonly hero: string;
	readonly playerClass: 'all' | string;
	readonly heroPowerCardId: string;
	readonly signatureTreasureCardId: string;
	readonly gameMode: 'paid-duels';
	readonly mmrPercentile: 100 | 50 | 25 | 10 | 1;
	readonly totalRuns: number;
	// Ties are ignored
	readonly totalMatches: number;
	readonly totalWins: number;
	readonly totalLosses: number;
	readonly winDistribution: { [winNumber: string]: number };
}

// Not the same as the DuelsHeroStat, as severalTreasureCardIds count towards the same run
export interface DuelsTreasureStat {
	readonly date: DateMark;
	readonly hero: string;
	readonly playerClass: 'all' | string;
	readonly treasureCardId: string;
	readonly treasureType: 'treasure' | 'passive';
	readonly heroPowerCardId: string;
	readonly signatureTreasureCardId: string;
	readonly gameMode: 'paid-duels';
	readonly mmrPercentile: 100 | 50 | 25 | 10 | 1;
	readonly totalRuns: number;
	readonly totalMatches: number;
	readonly totalWins: number;
	readonly totalLosses: number;
	readonly winDistribution: { [winNumber: string]: number };
}

export interface MmrPercentile {
	readonly mmr: number;
	readonly percentile: 100 | 50 | 25 | 10 | 1;
}

// This will ultimately only contain the deck stats
export interface DuelsGlobalStats {
	readonly lastUpdateDate: string;
	readonly duels: DuelsGlobalStatsForGameMode;
	readonly paidDuels: DuelsGlobalStatsForGameMode;
	readonly both: DuelsGlobalStatsForGameMode;
}

export interface DuelsGlobalStatsForGameMode {
	readonly statsForFullPeriod: DuelsGlobalStatsForPeriod;
	readonly statsSinceLastPatch: DuelsGlobalStatsForPeriod;
	readonly statsForThreeDays: DuelsGlobalStatsForPeriod;
	readonly statsForSevenDays: DuelsGlobalStatsForPeriod;
}

export interface DuelsGlobalStatsForPeriod {
	readonly heroStats: readonly HeroStat[];
	readonly heroPowerStats: readonly HeroPowerStat[];
	readonly signatureTreasureStats: readonly SignatureTreasureStat[];
	readonly treasureStats: readonly TreasureStat[];
	readonly deckStats: readonly DeckStat[];
}

export interface HeroStat {
	readonly creationDate: string;
	readonly periodStart: string;
	readonly heroCardId: string;
	readonly heroClass: ReferencePlayerClass;
	readonly totalMatches: number;
	readonly totalWins: number;
	readonly winDistribution: { [winNumber: string]: number };
}

export interface HeroPowerStat {
	readonly creationDate: string;
	readonly periodStart: string;
	readonly heroPowerCardId: string;
	readonly heroClass: ReferencePlayerClass;
	readonly totalMatches: number;
	readonly totalWins: number;
	readonly winDistribution: { [winNumber: string]: number };
}

export interface SignatureTreasureStat {
	readonly creationDate: string;
	readonly periodStart: string;
	readonly signatureTreasureCardId: string;
	readonly heroClass: ReferencePlayerClass;
	readonly totalMatches: number;
	readonly totalWins: number;
	readonly winDistribution: { [winNumber: string]: number };
}

export interface TreasureStat {
	readonly periodStart: string;
	readonly cardId: string;
	readonly playerClass: string;
	readonly totalOffered: number;
	readonly totalPicked: number;
	readonly matchesPlayed: number;
	readonly totalWins: number;
	readonly totalLosses: number;
	readonly totalTies: number;
}

export interface DeckStat {
	readonly id: number;
	readonly periodStart: string;
	readonly gameMode: 'duels' | 'paid-duels';
	readonly buildNumber: number;
	readonly decklist: string;
	readonly finalDecklist: string;
	readonly playerClass: string;
	readonly heroCardId: string;
	readonly heroPowerCardId: string;
	readonly signatureTreasureCardId: string;
	readonly treasuresCardIds: readonly string[];
	readonly runId: string;
	readonly wins: number;
	readonly losses: number;
	readonly rating: number;
	readonly runStartDate: string;
}

export interface HeroPositionStat {
	readonly creationDate: string;
	readonly periodStart: string;
	readonly heroCardId: string;
	readonly heroClass: ReferencePlayerClass;
	readonly totalMatches: number;
	readonly totalWins: number;
}
