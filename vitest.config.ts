import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
		setupFiles: ["tests/vitest.setup.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
		},
		// Use isolated pool to ensure clean process exit
		pool: "forks",
		// Reduce teardown timeout to exit faster
		teardownTimeout: 1000,
		// Force exit after tests complete to avoid hanging from open handles
		// (e.g., OpenAI SDK HTTP connections, database connections)
		// @ts-expect-error - forceExit works at runtime with bun test but isn't in vitest types
		forceExit: true,
	},
});
