export type AdminError = {
	status: number;
	message: string;
};

export type AdminDailyGameRow = {
	id: number;
	name: string;
	date: string;
	order: string;
	groupA: string;
	groupB: string;
	colorA: number | null;
	colorB: number | null;
	groupAWords: string;
	groupBWords: string;
};

export type AdminDailyGame = {
	id: number;
	name: string;
	date: string;
	groupA: string;
	groupB: string;
	order: Array<"A" | "B">;
	colorA: number | null;
	colorB: number | null;
};

export type AdminEditorGroup = {
	topic: string;
	color: "yellow" | "blue";
	members: string[];
};

export type AdminEditorLevel = {
	level_id: string;
	theme_link: string;
	tier: 2;
	tier_label: "DB";
	main: {
		group_a: AdminEditorGroup;
		group_b: AdminEditorGroup;
		order: Array<"A" | "B">;
	};
	alternatives: [];
	db: {
		id: number;
		date: string;
		colorA: number | null;
		colorB: number | null;
	};
};

export type AdminDailyGameItem = {
	date: string;
	exists: boolean;
	dailyGame: AdminDailyGame | null;
	level: AdminEditorLevel | null;
};

export type AdminDailyGamesAllResponse = {
	games: AdminDailyGameItem[];
};

export type AdminDailyGamesRangeResponse = {
	startDate: string;
	count: number;
	dates: AdminDailyGameItem[];
};

export type AdminUploadGroupInput = {
	topic: string;
	words: string[];
};

export type AdminUploadLevelInput = {
	date: string;
	sourceId?: string;
	name?: string;
	colorA?: number | null;
	colorB?: number | null;
	groups: {
		A: AdminUploadGroupInput;
		B: AdminUploadGroupInput;
	};
	order: Array<"A" | "B">;
};

export type AdminUploadRequest = {
	levels: AdminUploadLevelInput[];
};

export type AdminUploadResponse = {
	count: number;
	dates: string[];
};

export type AdminDeleteDailyGameResponse = {
	deleted: true;
	date: string;
};

export type AdminColorScheme = {
	id: number;
	hex: string | null;
	borderColor: string | null;
	highlightColor: string | null;
	textColor: string | null;
};

export type AdminColorSchemesResponse = {
	colorSchemes: AdminColorScheme[];
};

export type AdminCreateColorSchemeInput = {
	hex: string;
	borderColor: string;
	highlightColor: string;
	textColor: string;
};
