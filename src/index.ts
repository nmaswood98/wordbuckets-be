import { getDailyGame, getTodayInNewYork } from "./services/dailyGame";
import type { DailyGameResponse, ErrorResponse } from "./types/dailyGame";

function jsonResponse(
	body: DailyGameResponse | ErrorResponse,
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

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname !== "/daily-game") {
			return jsonResponse({ error: "Not found" }, 404);
		}

		if (request.method !== "GET") {
			return jsonResponse({ error: "Method not allowed" }, 405, {
				allow: "GET",
			});
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
	},
} satisfies ExportedHandler<Env>;
