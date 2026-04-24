import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

type MockDailyGameRow = {
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
