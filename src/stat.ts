import { ReferencePlayerClass } from '@firestone-hs/reference-data';

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
