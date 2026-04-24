export type DailyGameRow = {
	id: number;
	name: string;
	date: string;
	order: string;
	groupA: string;
	groupB: string;
	colorA: string;
	colorB: string;
	groupAWords: string;
	groupBWords: string;
};

export type DailyGameGroup = {
	key: "A" | "B";
	groupID: string;
	color: string;
	words: string[];
};

export type DailyGameResponse = {
	id: number;
	name: string;
	date: string;
	order: Array<"A" | "B">;
	groups: DailyGameGroup[];
};

export type ErrorResponse = {
	error: string;
	date?: string;
};
