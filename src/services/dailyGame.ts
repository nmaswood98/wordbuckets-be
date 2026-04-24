import type {
	ColorScheme,
	DailyGameResponse,
	DailyGameRow,
} from "../types/dailyGame";

export function getTodayInNewYork() {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/New_York",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(new Date());

	const dateParts = Object.fromEntries(
		parts
			.filter((part) => part.type !== "literal")
			.map((part) => [part.type, part.value]),
	);

	return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

export async function getDailyGame(env: Env, date: string) {
	const row = await env.DB.prepare(
		`
			SELECT
				daily_game.id,
				daily_game.name,
				daily_game.date,
				daily_game."order",
				daily_game.groupA,
				daily_game.groupB,
				daily_game.colorA AS colorAId,
				daily_game.colorB AS colorBId,
				color_a.hex AS colorAHex,
				color_a.borderColor AS colorABorderColor,
				color_a.highlightColor AS colorAHighlightColor,
				color_a.textColor AS colorATextColor,
				color_b.hex AS colorBHex,
				color_b.borderColor AS colorBBorderColor,
				color_b.highlightColor AS colorBHighlightColor,
				color_b.textColor AS colorBTextColor,
				group_a.words AS groupAWords,
				group_b.words AS groupBWords
			FROM daily_game
			JOIN "group" AS group_a ON group_a.groupID = daily_game.groupA
			JOIN "group" AS group_b ON group_b.groupID = daily_game.groupB
			LEFT JOIN color_scheme AS color_a ON color_a.id = daily_game.colorA
			LEFT JOIN color_scheme AS color_b ON color_b.id = daily_game.colorB
			WHERE daily_game.date = ?
			LIMIT 1
		`,
	)
		.bind(date)
		.first<DailyGameRow>();

	if (!row) {
		return null;
	}

	const order = JSON.parse(row.order) as Array<"A" | "B">;
	const groupAWords = JSON.parse(row.groupAWords) as string[];
	const groupBWords = JSON.parse(row.groupBWords) as string[];

	return {
		id: row.id,
		name: row.name,
		date: row.date,
		order,
		groups: [
			{
				key: "A",
				groupID: row.groupA,
				colorScheme: toColorScheme(
					row.colorAId,
					row.colorAHex,
					row.colorABorderColor,
					row.colorAHighlightColor,
					row.colorATextColor,
				),
				words: groupAWords,
			},
			{
				key: "B",
				groupID: row.groupB,
				colorScheme: toColorScheme(
					row.colorBId,
					row.colorBHex,
					row.colorBBorderColor,
					row.colorBHighlightColor,
					row.colorBTextColor,
				),
				words: groupBWords,
			},
		],
	} satisfies DailyGameResponse;
}

function toColorScheme(
	id: number | null,
	hex: string | null,
	borderColor: string | null,
	highlightColor: string | null,
	textColor: string | null,
): ColorScheme | null {
	if (id === null) {
		return null;
	}

	return {
		id,
		hex,
		borderColor,
		highlightColor,
		textColor,
	};
}
