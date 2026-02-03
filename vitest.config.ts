import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
		},
		// Use isolated pool to ensure clean process exit
		pool: "forks",
		// Reduce teardown timeout to exit faster
		teardownTimeout: 1000,
	},
});
