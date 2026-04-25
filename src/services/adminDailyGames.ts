import type {
	AdminDailyGame,
	AdminDailyGameItem,
	AdminDailyGameRow,
	AdminColorScheme,
	AdminColorSchemesResponse,
	AdminCreateColorSchemeInput,
	AdminDeleteDailyGameResponse,
	AdminDailyGamesAllResponse,
	AdminDailyGamesRangeResponse,
	AdminEditorLevel,
	AdminUploadLevelInput,
	AdminUploadRequest,
	AdminUploadResponse,
} from "../types/adminDailyGame";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export class AdminRequestError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message);
	}
}

export function isAdminRequestError(error: unknown): error is AdminRequestError {
	return error instanceof AdminRequestError;
}

export function isValidDateString(value: string) {
	if (!DATE_RE.test(value)) return false;
	const date = new Date(`${value}T00:00:00.000Z`);
	return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function addDaysToDateString(date: string, days: number) {
	const next = new Date(`${date}T00:00:00.000Z`);
	next.setUTCDate(next.getUTCDate() + days);
	return next.toISOString().slice(0, 10);
}

export function parseRangeParams(searchParams: URLSearchParams) {
	const startDate = searchParams.get("startDate") ?? "";
	const countRaw = searchParams.get("count") ?? "";
	const count = Number.parseInt(countRaw, 10);

	if (!isValidDateString(startDate)) {
		throw new AdminRequestError(400, "startDate must be a YYYY-MM-DD date");
	}

	if (!Number.isInteger(count) || String(count) !== countRaw || count < 1 || count > 366) {
		throw new AdminRequestError(400, "count must be an integer from 1 to 366");
	}

	return { startDate, count };
}

export async function getAllAdminDailyGames(
	env: Env,
): Promise<AdminDailyGamesAllResponse> {
	const rows = await queryAdminDailyGameRows(
		env,
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
			ORDER BY daily_game.date ASC
		`,
	);

	return { games: rows.map(rowToAdminDailyGameItem) };
}

export async function getAdminDailyGamesRange(
	env: Env,
	startDate: string,
	count: number,
): Promise<AdminDailyGamesRangeResponse> {
	const endDate = addDaysToDateString(startDate, count - 1);
	const rows = await queryAdminDailyGameRows(
		env,
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
			WHERE daily_game.date BETWEEN ? AND ?
			ORDER BY daily_game.date ASC
		`,
		startDate,
		endDate,
	);
	const itemsByDate = new Map(rows.map((row) => [row.date, rowToAdminDailyGameItem(row)]));
	const dates: AdminDailyGameItem[] = [];

	for (let i = 0; i < count; i++) {
		const date = addDaysToDateString(startDate, i);
		dates.push(
			itemsByDate.get(date) ?? {
				date,
				exists: false,
				dailyGame: null,
				level: null,
			},
		);
	}

	return { startDate, count, dates };
}

async function queryAdminDailyGameRows(
	env: Env,
	sql: string,
	...bindings: Array<string | number | null>
) {
	const query = env.DB.prepare(sql);
	const result =
		bindings.length > 0
			? await query.bind(...bindings).all<AdminDailyGameRow>()
			: await query.all<AdminDailyGameRow>();

	return result.results ?? [];
}

function rowToAdminDailyGameItem(row: AdminDailyGameRow): AdminDailyGameItem {
	const order = parseOrder(row.order);
	const groupAWords = parseWords(row.groupAWords).reverse();
	const groupBWords = parseWords(row.groupBWords).reverse();
	const dailyGame: AdminDailyGame = {
		id: row.id,
		name: row.name,
		date: row.date,
		groupA: row.groupA,
		groupB: row.groupB,
		order,
		colorA: row.colorA,
		colorB: row.colorB,
	};

	return {
		date: row.date,
		exists: true,
		dailyGame,
		level: {
			level_id: `db_${row.date.replaceAll("-", "")}`,
			theme_link: row.name,
			tier: 2,
			tier_label: "DB",
			main: {
				group_a: {
					topic: row.groupA,
					color: "yellow",
					members: groupAWords,
				},
				group_b: {
					topic: row.groupB,
					color: "blue",
					members: groupBWords,
				},
				order,
			},
			alternatives: [],
			db: {
				id: row.id,
				date: row.date,
				colorA: row.colorA,
				colorB: row.colorB,
			},
		} satisfies AdminEditorLevel,
	};
}

function parseOrder(raw: string) {
	const parsed = JSON.parse(raw);
	if (!Array.isArray(parsed) || parsed.some((value) => value !== "A" && value !== "B")) {
		throw new Error("daily_game.order must be an array of A/B values");
	}
	return parsed as Array<"A" | "B">;
}

function parseWords(raw: string) {
	const parsed = JSON.parse(raw);
	if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
		throw new Error("group.words must be an array of strings");
	}
	return parsed as string[];
}

type NormalizedGroup = {
	groupID: string;
	words: string[];
	wordsJson: string;
	dates: Set<string>;
};

type NormalizedUploadLevel = {
	date: string;
	name: string;
	groupA: NormalizedGroup;
	groupB: NormalizedGroup;
	order: Array<"A" | "B">;
	colorA: number | null;
	colorB: number | null;
};

export async function uploadAdminDailyGames(
	env: Env,
	payload: unknown,
): Promise<AdminUploadResponse> {
	const levels = validateUploadPayload(payload);
	const dates = levels.map((level) => level.date);
	const groups = collectUniqueGroups(levels);

	await assertNoSharedGroupCollisions(env, groups, dates);

	const statements: D1PreparedStatement[] = [];
	for (const group of groups.values()) {
		const existing = await getExistingGroup(env, group.groupID);
		if (!existing) {
			statements.push(
				env.DB.prepare(`INSERT INTO "group" (groupID, words) VALUES (?, ?)`).bind(
					group.groupID,
					group.wordsJson,
				),
			);
		} else if (existing.words !== group.wordsJson) {
			statements.push(
				env.DB.prepare(`UPDATE "group" SET words = ? WHERE groupID = ?`).bind(
					group.wordsJson,
					group.groupID,
				),
			);
		}
	}

	for (const level of levels) {
		statements.push(
			env.DB.prepare(
				`
					INSERT INTO daily_game (name, date, groupA, groupB, "order", colorA, colorB)
					VALUES (?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT(date) DO UPDATE SET
						name = excluded.name,
						groupA = excluded.groupA,
						groupB = excluded.groupB,
						"order" = excluded."order",
						colorA = excluded.colorA,
						colorB = excluded.colorB
				`,
			).bind(
				level.name,
				level.date,
				level.groupA.groupID,
				level.groupB.groupID,
				JSON.stringify(level.order),
				level.colorA,
				level.colorB,
			),
		);
	}

	if (statements.length > 0) {
		await env.DB.batch(statements);
	}

	return { count: levels.length, dates };
}

export async function deleteAdminDailyGame(
	env: Env,
	date: string,
): Promise<AdminDeleteDailyGameResponse> {
	if (!isValidDateString(date)) {
		throw new AdminRequestError(400, "date must be a YYYY-MM-DD date");
	}

	const existing = await env.DB.prepare(
		`SELECT date FROM daily_game WHERE date = ? LIMIT 1`,
	)
		.bind(date)
		.first<{ date: string }>();

	if (!existing) {
		throw new AdminRequestError(404, `No daily game found for ${date}`);
	}

	await env.DB.prepare(`DELETE FROM daily_game WHERE date = ?`).bind(date).run();
	return { deleted: true, date };
}

export async function getAdminColorSchemes(
	env: Env,
): Promise<AdminColorSchemesResponse> {
	const result = await env.DB.prepare(
		`
			SELECT id, hex, borderColor, highlightColor, textColor
			FROM color_scheme
			ORDER BY id ASC
		`,
	).all<AdminColorScheme>();

	return { colorSchemes: result.results ?? [] };
}

export async function createAdminColorScheme(
	env: Env,
	payload: unknown,
): Promise<AdminColorScheme> {
	const input = normalizeColorSchemePayload(payload);
	const inserted = await env.DB.prepare(
		`
			INSERT INTO color_scheme (hex, borderColor, highlightColor, textColor)
			VALUES (?, ?, ?, ?)
		`,
	)
		.bind(input.hex, input.borderColor, input.highlightColor, input.textColor)
		.run();

	return {
		id: inserted.meta.last_row_id,
		hex: input.hex,
		borderColor: input.borderColor,
		highlightColor: input.highlightColor,
		textColor: input.textColor,
	};
}

function validateUploadPayload(payload: unknown): NormalizedUploadLevel[] {
	if (!isRecord(payload) || !Array.isArray(payload.levels)) {
		throw new AdminRequestError(400, "Body must include a non-empty levels array");
	}

	const request = payload as AdminUploadRequest;
	if (request.levels.length === 0) {
		throw new AdminRequestError(400, "levels must not be empty");
	}

	const seenDates = new Set<string>();
	return request.levels.map((level, idx) => normalizeUploadLevel(level, idx, seenDates));
}

function normalizeUploadLevel(
	level: AdminUploadLevelInput,
	idx: number,
	seenDates: Set<string>,
): NormalizedUploadLevel {
	const label = level?.sourceId || `levels[${idx}]`;
	if (!isRecord(level)) {
		throw new AdminRequestError(400, `${label} must be an object`);
	}

	const date = typeof level.date === "string" ? level.date.trim() : "";
	if (!isValidDateString(date)) {
		throw new AdminRequestError(400, `${label} needs a valid YYYY-MM-DD date`);
	}
	if (seenDates.has(date)) {
		throw new AdminRequestError(400, `Duplicate upload date: ${date}`);
	}
	seenDates.add(date);

	const groupA = normalizeUploadGroup(level.groups?.A, `${label} group A`);
	const groupB = normalizeUploadGroup(level.groups?.B, `${label} group B`);
	const order = normalizeOrder(level.order, `${label} order`);
	const aCount = order.filter((value) => value === "A").length;
	const bCount = order.filter((value) => value === "B").length;
	if (aCount !== groupA.words.length || bCount !== groupB.words.length) {
		throw new AdminRequestError(400, `${label} order counts do not match word counts`);
	}

	return {
		date,
		name: normalizeOptionalName(level.name) || `${groupA.groupID} / ${groupB.groupID}`,
		groupA,
		groupB,
		order,
		colorA: normalizeRequiredColor(level.colorA, `${label} colorA`),
		colorB: normalizeRequiredColor(level.colorB, `${label} colorB`),
	};
}

function normalizeUploadGroup(group: unknown, label: string): NormalizedGroup {
	if (!isRecord(group)) {
		throw new AdminRequestError(400, `${label} must be an object`);
	}

	const groupID = typeof group.topic === "string" ? group.topic.trim() : "";
	if (!groupID) {
		throw new AdminRequestError(400, `${label} needs a topic`);
	}

	if (!Array.isArray(group.words)) {
		throw new AdminRequestError(400, `${label} words must be an array`);
	}

	const words = group.words.map((word) => (typeof word === "string" ? word.trim() : ""));
	if (words.length === 0 || words.some((word) => !word)) {
		throw new AdminRequestError(400, `${label} needs non-empty string words`);
	}

	const storedWords = [...words].reverse();
	return {
		groupID,
		words,
		wordsJson: JSON.stringify(storedWords),
		dates: new Set(),
	};
}

function normalizeOrder(order: unknown, label: string) {
	if (!Array.isArray(order) || order.length === 0) {
		throw new AdminRequestError(400, `${label} must be a non-empty array`);
	}
	if (order.some((value) => value !== "A" && value !== "B")) {
		throw new AdminRequestError(400, `${label} may only contain A or B`);
	}
	return order as Array<"A" | "B">;
}

function normalizeOptionalName(name: unknown) {
	return typeof name === "string" ? name.trim() : "";
}

function normalizeOptionalColor(value: unknown, label: string) {
	if (value === undefined || value === null) return null;
	if (!Number.isInteger(value)) {
		throw new AdminRequestError(400, `${label} must be an integer or null`);
	}
	return value as number;
}

function normalizeRequiredColor(value: unknown, label: string) {
	if (!Number.isInteger(value)) {
		throw new AdminRequestError(400, `${label} must be a color_scheme id`);
	}
	return value as number;
}

function normalizeColorSchemePayload(payload: unknown): AdminCreateColorSchemeInput {
	if (!isRecord(payload)) {
		throw new AdminRequestError(400, "Body must be a color scheme object");
	}

	const hex = normalizeHexColor(payload.hex, "hex");
	const borderColor = normalizeHexColor(payload.borderColor, "borderColor");
	const highlightColor = normalizeHexColor(payload.highlightColor, "highlightColor");
	const textColor = normalizeHexColor(payload.textColor, "textColor");
	return { hex, borderColor, highlightColor, textColor };
}

function normalizeHexColor(value: unknown, label: string) {
	const text = typeof value === "string" ? value.trim() : "";
	if (!HEX_COLOR_RE.test(text)) {
		throw new AdminRequestError(400, `${label} must be a #RRGGBB color`);
	}
	return text.toUpperCase();
}

function collectUniqueGroups(levels: NormalizedUploadLevel[]) {
	const groups = new Map<string, NormalizedGroup>();
	for (const level of levels) {
		for (const group of [level.groupA, level.groupB]) {
			const existing = groups.get(group.groupID);
			if (existing && existing.wordsJson !== group.wordsJson) {
				throw new AdminRequestError(
					409,
					`Group "${group.groupID}" appears multiple times with different words`,
				);
			}
			const target = existing ?? group;
			target.dates.add(level.date);
			groups.set(group.groupID, target);
		}
	}
	return groups;
}

async function assertNoSharedGroupCollisions(
	env: Env,
	groups: Map<string, NormalizedGroup>,
	uploadDates: string[],
) {
	for (const group of groups.values()) {
		const existing = await getExistingGroup(env, group.groupID);
		if (!existing || existing.words === group.wordsJson) continue;

		const outsideReference = await getOutsideGroupReference(env, group.groupID, uploadDates);
		if (outsideReference) {
			throw new AdminRequestError(
				409,
				`Group "${group.groupID}" is used by ${outsideReference.date}; upload would change another game`,
			);
		}
	}
}

async function getExistingGroup(env: Env, groupID: string) {
	return env.DB.prepare(`SELECT groupID, words FROM "group" WHERE groupID = ? LIMIT 1`)
		.bind(groupID)
		.first<{ groupID: string; words: string }>();
}

async function getOutsideGroupReference(env: Env, groupID: string, uploadDates: string[]) {
	const datePlaceholders = uploadDates.map(() => "?").join(", ");
	return env.DB.prepare(
		`
			SELECT date
			FROM daily_game
			WHERE (groupA = ? OR groupB = ?)
				AND date NOT IN (${datePlaceholders})
			LIMIT 1
		`,
	)
		.bind(groupID, groupID, ...uploadDates)
		.first<{ date: string }>();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
