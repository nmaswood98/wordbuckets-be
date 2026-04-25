import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

type MockDailyGameRow = {
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

type MockAdminRow = {
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

type MockColorSchemeRow = {
	id: number;
	hex: string | null;
	borderColor: string | null;
	highlightColor: string | null;
	textColor: string | null;
};

function createEnv(row: MockDailyGameRow | null) {
	const first = vi.fn().mockResolvedValue(row);
	const bind = vi.fn(() => ({ first }));
	const prepare = vi.fn(() => ({ bind }));

	return {
		env: {
			DB: {
				prepare,
			},
		} as unknown as Env,
		prepare,
		bind,
		first,
	};
}

function createAdminEnv(options: {
	rows?: MockAdminRow[];
	groups?: Record<string, string>;
	outsideRefs?: Record<string, string | null>;
	existingDates?: string[];
	colorSchemes?: MockColorSchemeRow[];
} = {}) {
	const rows = options.rows ?? [];
	const colorSchemes = options.colorSchemes ?? [];
	const groups = new Map(Object.entries(options.groups ?? {}));
	const outsideRefs = new Map(Object.entries(options.outsideRefs ?? {}));
	const existingDates = new Set(options.existingDates ?? []);
	const prepared: Array<{ sql: string; bindings: unknown[] }> = [];
	const batch = vi.fn().mockResolvedValue([]);

	const prepare = vi.fn((sql: string) => {
		const makeStatement = (bindings: unknown[] = []) => {
			const statement = {
				sql,
				bindings,
				bind: vi.fn((...nextBindings: unknown[]) => makeStatement(nextBindings)),
				all: vi.fn(async () => {
					if (sql.includes("FROM color_scheme")) {
						return { results: colorSchemes };
					}

					if (sql.includes("FROM daily_game") && sql.includes("BETWEEN")) {
						const [startDate, endDate] = bindings as [string, string];
						return {
							results: rows.filter(
								(row) => row.date >= startDate && row.date <= endDate,
							),
						};
					}

					if (sql.includes("FROM daily_game")) {
						return { results: rows };
					}

					return { results: [] };
				}),
				first: vi.fn(async () => {
					if (sql.includes('FROM "group"')) {
						const groupID = bindings[0] as string;
						const words = groups.get(groupID);
						return words === undefined ? null : { groupID, words };
					}

					if (sql.includes("SELECT date") && sql.includes("FROM daily_game")) {
						if (sql.includes("WHERE date = ?")) {
							const date = bindings[0] as string;
							return existingDates.has(date) ? { date } : null;
						}

						const groupID = bindings[0] as string;
						const date = outsideRefs.get(groupID);
						return date ? { date } : null;
					}

					return null;
				}),
				run: vi.fn(async () => ({
					success: true,
					meta: { last_row_id: 99 },
				})),
			};
			prepared.push({ sql, bindings });
			return statement;
		};

		return makeStatement();
	});

	return {
		env: {
			DB: {
				prepare,
				batch,
			},
		} as unknown as Env,
		prepare,
		batch,
		prepared,
	};
}

function sampleAdminRow(overrides: Partial<MockAdminRow> = {}): MockAdminRow {
	return {
		id: 1,
		name: "Sample Daily Game",
		date: "2026-04-24",
		order: '["A","B"]',
		groupA: "animals",
		groupB: "fruits",
		colorA: 1,
		colorB: 2,
		groupAWords: '["tiger"]',
		groupBWords: '["apple"]',
		...overrides,
	};
}

function validUploadLevel(overrides: Record<string, unknown> = {}) {
	return {
		date: "2026-04-26",
		sourceId: "staged_001",
		name: "Animals / Fruits",
		colorA: 1,
		colorB: 2,
		groups: {
			A: { topic: "animals", words: ["tiger"] },
			B: { topic: "fruits", words: ["apple"] },
		},
		order: ["A", "B"],
		...overrides,
	};
}

describe("daily game endpoint", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-24T16:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("returns today's daily game with order and groups", async () => {
		const { env, bind } = createEnv({
			id: 1,
			name: "Sample Daily Game",
			date: "2026-04-24",
			order: '["A","B","A","B"]',
			groupA: "animals",
			groupB: "fruits",
			colorAId: 1,
			colorBId: 1,
			colorAHex: "#FFF9EF",
			colorABorderColor: "#FFE4B5",
			colorAHighlightColor: "#FFE1AF",
			colorATextColor: "#FCC874",
			colorBHex: "#FFF9EF",
			colorBBorderColor: "#FFE4B5",
			colorBHighlightColor: "#FFE1AF",
			colorBTextColor: "#FCC874",
			groupAWords: '["tiger","otter","eagle","panda","whale"]',
			groupBWords: '["apple","mango","peach","grape","lemon"]',
		});

		const response = await worker.fetch(
			new Request("https://wordbuckets.example/daily-game"),
			env,
		);

		await expect(response.json()).resolves.toEqual({
			id: 1,
			name: "Sample Daily Game",
			date: "2026-04-24",
			order: ["A", "B", "A", "B"],
			groups: [
				{
					key: "A",
					groupID: "animals",
					colorScheme: {
						id: 1,
						hex: "#FFF9EF",
						borderColor: "#FFE4B5",
						highlightColor: "#FFE1AF",
						textColor: "#FCC874",
					},
					words: ["tiger", "otter", "eagle", "panda", "whale"],
				},
				{
					key: "B",
					groupID: "fruits",
					colorScheme: {
						id: 1,
						hex: "#FFF9EF",
						borderColor: "#FFE4B5",
						highlightColor: "#FFE1AF",
						textColor: "#FCC874",
					},
					words: ["apple", "mango", "peach", "grape", "lemon"],
				},
			],
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("application/json");
		expect(bind).toHaveBeenCalledWith("2026-04-24");
	});

	it("returns null color schemes and nullable color values", async () => {
		const { env } = createEnv({
			id: 1,
			name: "Sample Daily Game",
			date: "2026-04-24",
			order: '["A","B"]',
			groupA: "animals",
			groupB: "fruits",
			colorAId: null,
			colorBId: 2,
			colorAHex: null,
			colorABorderColor: null,
			colorAHighlightColor: null,
			colorATextColor: null,
			colorBHex: null,
			colorBBorderColor: null,
			colorBHighlightColor: "#FFE1AF",
			colorBTextColor: null,
			groupAWords: '["tiger"]',
			groupBWords: '["apple"]',
		});

		const response = await worker.fetch(
			new Request("https://wordbuckets.example/daily-game"),
			env,
		);

		await expect(response.json()).resolves.toMatchObject({
			groups: [
				{
					key: "A",
					colorScheme: null,
				},
				{
					key: "B",
					colorScheme: {
						id: 2,
						hex: null,
						borderColor: null,
						highlightColor: "#FFE1AF",
						textColor: null,
					},
				},
			],
		});
		expect(response.status).toBe(200);
	});

	it("returns a 404 when today's daily game is missing", async () => {
		const { env, bind } = createEnv(null);

		const response = await worker.fetch(
			new Request("https://wordbuckets.example/daily-game"),
			env,
		);

		await expect(response.json()).resolves.toEqual({
			error: "No daily game found for today",
			date: "2026-04-24",
		});
		expect(response.status).toBe(404);
		expect(bind).toHaveBeenCalledWith("2026-04-24");
	});

	it("uses the America/New_York date for the daily lookup", async () => {
		vi.setSystemTime(new Date("2026-04-24T03:30:00.000Z"));
		const { env, bind } = createEnv(null);

		await worker.fetch(new Request("https://wordbuckets.example/daily-game"), env);

		expect(bind).toHaveBeenCalledWith("2026-04-23");
	});

	it("returns a 405 for non-GET daily game requests", async () => {
		const { env, prepare } = createEnv(null);

		const response = await worker.fetch(
			new Request("https://wordbuckets.example/daily-game", { method: "POST" }),
			env,
		);

		await expect(response.json()).resolves.toEqual({
			error: "Method not allowed",
		});
		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("GET");
		expect(prepare).not.toHaveBeenCalled();
	});

	it("returns a 404 for unsupported routes", async () => {
		const { env, prepare } = createEnv(null);

		const response = await worker.fetch(
			new Request("https://wordbuckets.example/unknown"),
			env,
		);

		await expect(response.json()).resolves.toEqual({ error: "Not found" });
		expect(response.status).toBe(404);
		expect(prepare).not.toHaveBeenCalled();
	});

	it("returns a 500 when stored JSON cannot be parsed", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { env } = createEnv({
			id: 1,
			name: "Sample Daily Game",
			date: "2026-04-24",
			order: "not json",
			groupA: "animals",
			groupB: "fruits",
			colorAId: 1,
			colorBId: 1,
			colorAHex: "#FFF9EF",
			colorABorderColor: "#FFE4B5",
			colorAHighlightColor: "#FFE1AF",
			colorATextColor: "#FCC874",
			colorBHex: "#FFF9EF",
			colorBBorderColor: "#FFE4B5",
			colorBHighlightColor: "#FFE1AF",
			colorBTextColor: "#FCC874",
			groupAWords: '["tiger"]',
			groupBWords: '["apple"]',
		});

		const response = await worker.fetch(
			new Request("https://wordbuckets.example/daily-game"),
			env,
		);

		await expect(response.json()).resolves.toEqual({
			error: "Failed to load daily game",
		});
		expect(response.status).toBe(500);
	});
});

describe("level editor admin routes", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("keeps the public daily-game route independent from admin routes", async () => {
		const { env, bind } = createEnv({
			id: 1,
			name: "Sample Daily Game",
			date: "2026-04-24",
			order: '["A","B"]',
			groupA: "animals",
			groupB: "fruits",
			colorAId: null,
			colorBId: null,
			colorAHex: null,
			colorABorderColor: null,
			colorAHighlightColor: null,
			colorATextColor: null,
			colorBHex: null,
			colorBBorderColor: null,
			colorBHighlightColor: null,
			colorBTextColor: null,
			groupAWords: '["tiger"]',
			groupBWords: '["apple"]',
		});

		const response = await worker.fetch(
			new Request("https://wordbuckets.example/daily-game"),
			env,
		);

		expect(response.status).toBe(200);
		expect(bind).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
	});

	it("blocks level editor and admin routes outside localhost", async () => {
		const { env } = createAdminEnv();

		const editor = await worker.fetch(
			new Request("https://wordbuckets.example/level-editor"),
			env,
		);
		const status = await worker.fetch(
			new Request("https://wordbuckets.example/__admin/level-editor/status"),
			env,
		);

		expect(editor.status).toBe(403);
		expect(status.status).toBe(403);
	});

	it("serves the level editor HTML on localhost", async () => {
		const { env } = createAdminEnv();

		const response = await worker.fetch(
			new Request("http://127.0.0.1:8787/level-editor"),
			env,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
		expect(response.headers.get("cache-control")).toBe("no-store");
		await expect(response.text()).resolves.toContain("Level Architect");
	});

	it("returns status for localhost admin sessions", async () => {
		const { env } = createAdminEnv();

		const response = await worker.fetch(
			new Request("http://localhost:8787/__admin/level-editor/status"),
			env,
		);

		await expect(response.json()).resolves.toEqual({
			enabled: true,
			mode: "localhost-only",
			database: "DB",
		});
		expect(response.status).toBe(200);
	});

	it("allows Wrangler remote preview requests forwarded from localhost", async () => {
		const { env } = createAdminEnv();

		const response = await worker.fetch(
			new Request("https://wordbuckets-be.example.workers.dev/__admin/level-editor/status", {
				headers: {
					"mf-original-url":
						"http://127.0.0.1:8787/__admin/level-editor/status",
				},
			}),
			env,
		);

		expect(response.status).toBe(200);
	});

	it("returns 405 for unsupported status methods", async () => {
		const { env } = createAdminEnv();

		const response = await worker.fetch(
			new Request("http://localhost:8787/__admin/level-editor/status", {
				method: "POST",
			}),
			env,
		);

		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("GET");
	});

	it("returns 405 with DELETE listed for unsupported daily-games methods", async () => {
		const { env } = createAdminEnv();

		const response = await worker.fetch(
			new Request("http://localhost:8787/__admin/daily-games", {
				method: "PUT",
			}),
			env,
		);

		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("GET, POST, DELETE");
	});
});

describe("admin daily game reads", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("loads all games in editor-level shape", async () => {
		const { env } = createAdminEnv({
			rows: [
				sampleAdminRow({
					order: '["A","B","A","B"]',
					groupAWords: '["tiger","otter"]',
					groupBWords: '["apple","mango"]',
				}),
			],
		});

		const response = await worker.fetch(
			new Request("http://127.0.0.1:8787/__admin/daily-games?all=1"),
			env,
		);

		await expect(response.json()).resolves.toEqual({
			games: [
				{
					date: "2026-04-24",
					exists: true,
					dailyGame: {
						id: 1,
						name: "Sample Daily Game",
						date: "2026-04-24",
						groupA: "animals",
						groupB: "fruits",
						order: ["A", "B", "A", "B"],
						colorA: 1,
						colorB: 2,
					},
					level: {
						level_id: "db_20260424",
						theme_link: "Sample Daily Game",
						tier: 2,
						tier_label: "DB",
						main: {
							group_a: {
								topic: "animals",
								color: "yellow",
								members: ["otter", "tiger"],
							},
							group_b: {
								topic: "fruits",
								color: "blue",
								members: ["mango", "apple"],
							},
							order: ["A", "B", "A", "B"],
						},
						alternatives: [],
						db: {
							id: 1,
							date: "2026-04-24",
							colorA: 1,
							colorB: 2,
						},
					},
				},
			],
		});
		expect(response.status).toBe(200);
	});

	it("returns a 500 when admin stored JSON is invalid", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { env } = createAdminEnv({
			rows: [sampleAdminRow({ order: "not json" })],
		});

		const response = await worker.fetch(
			new Request("http://127.0.0.1:8787/__admin/daily-games?all=1"),
			env,
		);

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({
			error: "Failed to handle admin daily games request",
		});
	});

	it("loads a date range with missing dates", async () => {
		const { env } = createAdminEnv({
			rows: [sampleAdminRow()],
		});

		const response = await worker.fetch(
			new Request(
				"http://127.0.0.1:8787/__admin/daily-games?startDate=2026-04-24&count=2",
			),
			env,
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			startDate: "2026-04-24",
			count: 2,
			dates: [
				{ date: "2026-04-24", exists: true },
				{ date: "2026-04-25", exists: false, dailyGame: null, level: null },
			],
		});
	});

	it("validates range parameters", async () => {
		const { env } = createAdminEnv();

		const response = await worker.fetch(
			new Request(
				"http://127.0.0.1:8787/__admin/daily-games?startDate=2026-99-24&count=2",
			),
			env,
		);

		expect(response.status).toBe(400);
	});
});

describe("admin color schemes", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("lists existing color schemes", async () => {
		const { env } = createAdminEnv({
			colorSchemes: [
				{
					id: 1,
					hex: "#FFF9EF",
					borderColor: "#FFE4B5",
					highlightColor: "#FFE1AF",
					textColor: "#FCC874",
				},
			],
		});

		const response = await worker.fetch(
			new Request("http://127.0.0.1:8787/__admin/color-schemes"),
			env,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			colorSchemes: [
				{
					id: 1,
					hex: "#FFF9EF",
					borderColor: "#FFE4B5",
					highlightColor: "#FFE1AF",
					textColor: "#FCC874",
				},
			],
		});
	});

	it("creates a color scheme", async () => {
		const { env, prepared } = createAdminEnv();

		const response = await worker.fetch(
			new Request("http://127.0.0.1:8787/__admin/color-schemes", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					hex: "#fff9ef",
					borderColor: "#ffe4b5",
					highlightColor: "#ffe1af",
					textColor: "#fcc874",
				}),
			}),
			env,
		);

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toEqual({
			id: 99,
			hex: "#FFF9EF",
			borderColor: "#FFE4B5",
			highlightColor: "#FFE1AF",
			textColor: "#FCC874",
		});
		expect(prepared.some((stmt) => stmt.sql.includes("INSERT INTO color_scheme"))).toBe(
			true,
		);
	});

	it("validates new color schemes", async () => {
		const { env } = createAdminEnv();

		const response = await worker.fetch(
			new Request("http://127.0.0.1:8787/__admin/color-schemes", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					hex: "red",
					borderColor: "#FFE4B5",
					highlightColor: "#FFE1AF",
					textColor: "#FCC874",
				}),
			}),
			env,
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: "hex must be a #RRGGBB color",
		});
	});
});

describe("admin daily game uploads", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("rejects malformed JSON", async () => {
		const { env } = createAdminEnv();

		const response = await worker.fetch(
			new Request("http://127.0.0.1:8787/__admin/daily-games", {
				method: "POST",
				body: "{",
			}),
			env,
		);

		expect(response.status).toBe(400);
	});

	it.each([
		["missing levels", {}, 400],
		["empty levels", { levels: [] }, 400],
		[
			"duplicate dates",
			{ levels: [validUploadLevel(), validUploadLevel()] },
			400,
		],
		[
			"missing topic",
			{
				levels: [
					validUploadLevel({
						groups: {
							A: { topic: "", words: ["tiger"] },
							B: { topic: "fruits", words: ["apple"] },
						},
					}),
				],
			},
			400,
		],
		[
			"empty words",
			{
				levels: [
					validUploadLevel({
						groups: {
							A: { topic: "animals", words: [] },
							B: { topic: "fruits", words: ["apple"] },
						},
					}),
				],
			},
			400,
		],
		[
			"invalid order value",
			{ levels: [validUploadLevel({ order: ["A", "C"] })] },
			400,
		],
		[
			"order count mismatch",
			{ levels: [validUploadLevel({ order: ["A", "B", "B"] })] },
			400,
		],
		[
			"missing color",
			{ levels: [validUploadLevel({ colorA: null })] },
			400,
		],
		[
			"same topic with different words",
			{
				levels: [
					validUploadLevel(),
					validUploadLevel({
						date: "2026-04-27",
						groups: {
							A: { topic: "animals", words: ["otter"] },
							B: { topic: "colors", words: ["blue"] },
						},
					}),
				],
			},
			409,
		],
	])("rejects invalid upload payloads: %s", async (_name, payload, status) => {
		const { env, batch } = createAdminEnv();

		const response = await worker.fetch(
			new Request("http://127.0.0.1:8787/__admin/daily-games", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
			}),
			env,
		);

		expect(response.status).toBe(status);
		expect(batch).not.toHaveBeenCalled();
	});

	it("rejects shared group collisions before writes", async () => {
		const { env, batch } = createAdminEnv({
			groups: {
				animals: '["old"]',
				fruits: '["apple"]',
			},
			outsideRefs: {
				animals: "2026-04-24",
			},
		});

		const response = await worker.fetch(
			new Request("http://127.0.0.1:8787/__admin/daily-games", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ levels: [validUploadLevel()] }),
			}),
			env,
		);

		expect(response.status).toBe(409);
		expect(batch).not.toHaveBeenCalled();
		await expect(response.json()).resolves.toEqual({
			error:
				'Group "animals" is used by 2026-04-24; upload would change another game',
		});
	});

	it("uploads games, reuses same groups, updates allowed groups, and preserves colors", async () => {
		const { env, batch } = createAdminEnv({
			groups: {
				animals: '["old"]',
				fruits: '["apple"]',
			},
		});

		const response = await worker.fetch(
			new Request("http://127.0.0.1:8787/__admin/daily-games", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					levels: [
						validUploadLevel({
							colorA: 1,
							colorB: 2,
						}),
					],
				}),
			}),
			env,
		);

		await expect(response.json()).resolves.toEqual({
			count: 1,
			dates: ["2026-04-26"],
		});
		expect(response.status).toBe(200);
		expect(batch).toHaveBeenCalledTimes(1);
		const statements = batch.mock.calls[0][0];
		expect(statements).toHaveLength(2);
		expect(statements[0].sql).toContain('UPDATE "group" SET words');
		expect(statements[1].sql).toContain("INSERT INTO daily_game");
		expect(statements[1].bindings).toEqual([
			"Animals / Fruits",
			"2026-04-26",
			"animals",
			"fruits",
			'["A","B"]',
			1,
			2,
		]);
	});

	it("inserts new groups and uses selected colors", async () => {
		const { env, batch } = createAdminEnv();

		const response = await worker.fetch(
			new Request("http://127.0.0.1:8787/__admin/daily-games", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ levels: [validUploadLevel()] }),
			}),
			env,
		);

		expect(response.status).toBe(200);
		const statements = batch.mock.calls[0][0];
		expect(statements).toHaveLength(3);
		expect(statements[0].sql).toContain('INSERT INTO "group"');
		expect(statements[1].sql).toContain('INSERT INTO "group"');
		expect(statements[2].bindings.at(-2)).toBe(1);
		expect(statements[2].bindings.at(-1)).toBe(2);
	});

	it("reverses editor word order before writing groups", async () => {
		const { env, batch } = createAdminEnv();

		const response = await worker.fetch(
			new Request("http://127.0.0.1:8787/__admin/daily-games", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					levels: [
						validUploadLevel({
							groups: {
								A: { topic: "animals", words: ["tiger", "otter"] },
								B: { topic: "fruits", words: ["apple"] },
							},
							order: ["A", "A", "B"],
						}),
					],
				}),
			}),
			env,
		);

		expect(response.status).toBe(200);
		const statements = batch.mock.calls[0][0];
		expect(statements[0].bindings).toEqual(["animals", '["otter","tiger"]']);
	});
});

describe("admin daily game deletes", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("validates delete dates", async () => {
		const { env } = createAdminEnv();

		const response = await worker.fetch(
			new Request("http://127.0.0.1:8787/__admin/daily-games?date=bad", {
				method: "DELETE",
			}),
			env,
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: "date must be a YYYY-MM-DD date",
		});
	});

	it("returns 404 when deleting a missing game", async () => {
		const { env } = createAdminEnv();

		const response = await worker.fetch(
			new Request("http://127.0.0.1:8787/__admin/daily-games?date=2026-04-26", {
				method: "DELETE",
			}),
			env,
		);

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({
			error: "No daily game found for 2026-04-26",
		});
	});

	it("deletes an existing game by date without deleting groups", async () => {
		const { env, prepared } = createAdminEnv({
			existingDates: ["2026-04-26"],
		});

		const response = await worker.fetch(
			new Request("http://127.0.0.1:8787/__admin/daily-games?date=2026-04-26", {
				method: "DELETE",
			}),
			env,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			deleted: true,
			date: "2026-04-26",
		});
		expect(prepared.some((stmt) => stmt.sql.includes("DELETE FROM daily_game"))).toBe(
			true,
		);
		expect(prepared.some((stmt) => stmt.sql.includes('DELETE FROM "group"'))).toBe(
			false,
		);
	});
});
