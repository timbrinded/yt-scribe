/**
 * Guard script preloaded by Bun's native test runner.
 * Prevents accidental use of `bun test` instead of `bun run test` (vitest).
 *
 * This project uses @effect/vitest for test helpers (it.effect, it.scoped)
 * which are incompatible with Bun's native test runner.
 */
throw new Error(
	"\n\n" +
	"╔══════════════════════════════════════════════════════════════╗\n" +
	"║  Wrong test runner! Use 'bun run test' not 'bun test'.     ║\n" +
	"║                                                            ║\n" +
	"║  This project uses vitest + @effect/vitest.                ║\n" +
	"║  Bun's native runner causes hanging tests & missing APIs.  ║\n" +
	"║                                                            ║\n" +
	"║  Commands:                                                 ║\n" +
	"║    bun run test        → vitest (correct)                  ║\n" +
	"║    bun run test:watch  → vitest watch mode                 ║\n" +
	"╚══════════════════════════════════════════════════════════════╝\n"
);
