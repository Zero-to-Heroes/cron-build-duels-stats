import { ReferencePlayerClass } from '@firestone-hs/reference-data/lib/models/reference-cards/reference-player-class';

export interface HeroStat {
	readonly creationDate: string;
	readonly periodStart: string;
	readonly heroCardId: string;
	readonly heroClass: ReferencePlayerClass;
	readonly totalMatches: number;
	readonly totalWins: number;
}

export interface HeroPositionStat {
	readonly creationDate: string;
	readonly periodStart: string;
	readonly heroCardId: string;
	readonly heroClass: ReferencePlayerClass;
	readonly totalMatches: number;
	readonly totalWins: number;
}

export interface HeroPowerStat {
	readonly creationDate: string;
	readonly periodStart: string;
	readonly heroPowerCardId: string;
	readonly heroClass: ReferencePlayerClass;
	readonly totalMatches: number;
	readonly totalWins: number;
}

export interface SignatureTreasureStat {
	readonly creationDate: string;
	readonly periodStart: string;
	readonly signatureTreasureCardId: string;
	readonly heroClass: ReferencePlayerClass;
	readonly totalMatches: number;
	readonly totalWins: number;
}

export interface TreasureStat {
	readonly periodStart: string;
	readonly cardId: string;
	readonly playerClass: string;
	readonly totalOffered: number;
	readonly totalPicked: number;
}

export interface DeckStat {
	readonly periodStart: string;
	readonly decklist: string;
	readonly playerClass: string;
	readonly heroPowerCardId: string;
	readonly signatureTreasureCardId: string;
	readonly treasuresCardIds: readonly string[];
	readonly runId: string;
	readonly rating: number;
	readonly runStartDate: string;
}
