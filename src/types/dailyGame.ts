export type ColorScheme = {
	id: number;
	hex: string | null;
	borderColor: string | null;
	highlightColor: string | null;
	textColor: string | null;
};

export type DailyGameRow = {
	id: number;
	name: string;
	date: string;
	order: string;
	groupA: string;
	groupB: string;
	colorAId: number | null;
	colorBId: number | null;
	colorAHex: string | null;
	colorABorderColor: string | null;
	colorAHighlightColor: string | null;
	colorATextColor: string | null;
	colorBHex: string | null;
	colorBBorderColor: string | null;
	colorBHighlightColor: string | null;
	colorBTextColor: string | null;
	groupAWords: string;
	groupBWords: string;
};

export type DailyGameGroup = {
	key: "A" | "B";
	groupID: string;
	colorScheme: ColorScheme | null;
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
