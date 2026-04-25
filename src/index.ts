import levelEditorHtml from "../LevelEditor/level_editor.html";
import {
	createAdminColorScheme,
	deleteAdminDailyGame,
	getAdminDailyGamesRange,
	getAdminColorSchemes,
	getAllAdminDailyGames,
	isAdminRequestError,
	parseRangeParams,
	uploadAdminDailyGames,
} from "./services/adminDailyGames";
import { getDailyGame, getTodayInNewYork } from "./services/dailyGame";

declare const process:
	| {
			env?: {
				NODE_ENV?: string;
			};
	  }
	| undefined;

function jsonResponse(
	body: unknown,
	status = 200,
	headers: HeadersInit = {},
) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json",
			...headers,
		},
	});
}

function htmlResponse(body: string, status = 200, headers: HeadersInit = {}) {
	return new Response(body, {
		status,
		headers: {
			"content-type": "text/html; charset=utf-8",
			"cache-control": "no-store",
			...headers,
		},
	});
}

function methodNotAllowed(allow: string) {
	return jsonResponse({ error: "Method not allowed" }, 405, { allow });
}

function isDevelopmentBuild() {
	return typeof process !== "undefined" && process.env?.NODE_ENV === "development";
}

function isLocalHostValue(value: string | null) {
	if (!value) return false;
	const host = value.toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
	return (
		host === "localhost" ||
		host.startsWith("localhost:") ||
		host === "127.0.0.1" ||
		host.startsWith("127.0.0.1:") ||
		host === "[::1]" ||
		host.startsWith("[::1]:") ||
		host === "::1"
	);
}

function isLocalAdminRequest(request: Request, url: URL) {
	return (
		isDevelopmentBuild() ||
		isLocalHostValue(url.host) ||
		isLocalHostValue(request.headers.get("host")) ||
		isLocalHostValue(request.headers.get("x-forwarded-host")) ||
		isLocalHostValue(request.headers.get("x-original-host")) ||
		isLocalHostValue(request.headers.get("mf-original-url")) ||
		isLocalHostValue(request.headers.get("origin")) ||
		isLocalHostValue(request.headers.get("referer")) ||
		request.headers.has("cf-workers-preview-token")
	);
}

function forbiddenAdminResponse() {
	return jsonResponse({ error: "Admin routes are only available on localhost" }, 403);
}

async function handleDailyGame(request: Request, env: Env) {
	if (request.method !== "GET") {
		return methodNotAllowed("GET");
	}

	const today = getTodayInNewYork();

	try {
		const dailyGame = await getDailyGame(env, today);

		if (!dailyGame) {
			return jsonResponse(
				{ error: "No daily game found for today", date: today },
				404,
			);
		}

		return jsonResponse(dailyGame);
	} catch (error) {
		console.error("Failed to load daily game", error);
		return jsonResponse({ error: "Failed to load daily game" }, 500);
	}
}

async function handleLevelEditor(request: Request, url: URL) {
	if (!isLocalAdminRequest(request, url)) {
		return forbiddenAdminResponse();
	}

	if (request.method !== "GET") {
		return methodNotAllowed("GET");
	}

	return htmlResponse(levelEditorHtml);
}

async function handleAdmin(request: Request, env: Env, url: URL) {
	if (!isLocalAdminRequest(request, url)) {
		return forbiddenAdminResponse();
	}

	if (url.pathname === "/__admin/level-editor/status") {
		if (request.method !== "GET") {
			return methodNotAllowed("GET");
		}

		return jsonResponse({
			enabled: true,
			mode: "localhost-only",
			database: "DB",
		});
	}

	if (url.pathname === "/__admin/daily-games") {
		try {
			if (request.method === "GET") {
				if (url.searchParams.get("all") === "1") {
					return jsonResponse(await getAllAdminDailyGames(env));
				}

				const { startDate, count } = parseRangeParams(url.searchParams);
				return jsonResponse(await getAdminDailyGamesRange(env, startDate, count));
			}

			if (request.method === "POST") {
				let payload: unknown;
				try {
					payload = await request.json();
				} catch {
					return jsonResponse({ error: "Body must be valid JSON" }, 400);
				}

				return jsonResponse(await uploadAdminDailyGames(env, payload));
			}

			if (request.method === "DELETE") {
				return jsonResponse(
					await deleteAdminDailyGame(env, url.searchParams.get("date") ?? ""),
				);
			}

			return methodNotAllowed("GET, POST, DELETE");
		} catch (error) {
			if (isAdminRequestError(error)) {
				return jsonResponse({ error: error.message }, error.status);
			}

			console.error("Failed to handle admin daily games request", error);
			return jsonResponse({ error: "Failed to handle admin daily games request" }, 500);
		}
	}

	if (url.pathname === "/__admin/color-schemes") {
		try {
			if (request.method === "GET") {
				return jsonResponse(await getAdminColorSchemes(env));
			}

			if (request.method === "POST") {
				let payload: unknown;
				try {
					payload = await request.json();
				} catch {
					return jsonResponse({ error: "Body must be valid JSON" }, 400);
				}

				return jsonResponse(await createAdminColorScheme(env, payload), 201);
			}

			return methodNotAllowed("GET, POST");
		} catch (error) {
			if (isAdminRequestError(error)) {
				return jsonResponse({ error: error.message }, error.status);
			}

			console.error("Failed to handle admin color schemes request", error);
			return jsonResponse({ error: "Failed to handle admin color schemes request" }, 500);
		}
	}

	return jsonResponse({ error: "Not found" }, 404);
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/daily-game") {
			return handleDailyGame(request, env);
		}

		if (url.pathname === "/level-editor") {
			return handleLevelEditor(request, url);
		}

		if (url.pathname.startsWith("/__admin/")) {
			return handleAdmin(request, env, url);
		}

		return jsonResponse({ error: "Not found" }, 404);
	},
} satisfies ExportedHandler<Env>;
