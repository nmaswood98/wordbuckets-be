export type ColorScheme = {
	id: number;
	hex: string;
	borderColor: string;
	highlightColor: string;
	textColor: string;
};

export type DailyGameRow = {
	id: number;
	name: string;
	date: string;
	order: string;
	groupA: string;
	groupB: string;
	colorAId: number;
	colorBId: number;
	colorAHex: string;
	colorABorderColor: string;
	colorAHighlightColor: string;
	colorATextColor: string;
	colorBHex: string;
	colorBBorderColor: string;
	colorBHighlightColor: string;
	colorBTextColor: string;
	groupAWords: string;
	groupBWords: string;
};

export type DailyGameGroup = {
	key: "A" | "B";
	groupID: string;
	colorScheme: ColorScheme;
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
