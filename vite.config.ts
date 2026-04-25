import { readFile } from "node:fs/promises";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		{
			name: "raw-html-for-worker-tests",
			load(id) {
				if (!id.endsWith(".html")) return null;
				return readFile(id, "utf8").then(
					(content) => `export default ${JSON.stringify(content)};`,
				);
			},
		},
	],
});
