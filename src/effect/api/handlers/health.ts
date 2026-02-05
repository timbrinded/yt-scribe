/**
 * Effect-TS Handler Implementation for Health Group
 *
 * Provides simple health check endpoint implementation.
 */

import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";
import { YTScribeApi } from "../index";

/**
 * Health group handler implementation.
 *
 * Returns 200 OK with current timestamp.
 */
export const HealthGroupLive = HttpApiBuilder.group(
	YTScribeApi,
	"health",
	(handlers) =>
		handlers.handle("healthCheck", () =>
			Effect.succeed({
				status: "ok" as const,
				timestamp: new Date().toISOString(),
			}),
		),
).pipe(Layer.provide(Layer.empty));
