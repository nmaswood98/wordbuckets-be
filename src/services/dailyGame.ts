import type { DailyGameResponse, DailyGameRow } from "../types/dailyGame";

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
				daily_game.colorA,
				daily_game.colorB,
				group_a.words AS groupAWords,
				group_b.words AS groupBWords
			FROM daily_game
			JOIN "group" AS group_a ON group_a.groupID = daily_game.groupA
			JOIN "group" AS group_b ON group_b.groupID = daily_game.groupB
			LIMIT 1
		`,
	)
//		.bind(date)
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
				color: row.colorA,
				words: groupAWords,
			},
			{
				key: "B",
				groupID: row.groupB,
				color: row.colorB,
				words: groupBWords,
			},
		],
	} satisfies DailyGameResponse;
}
