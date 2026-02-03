import Elysia from "elysia";
import { createChildLogger, logger } from "../utils/logger";

/**
 * Request logging middleware for Elysia
 * Logs incoming requests and outgoing responses with timing information
 */
export const loggingMiddleware = new Elysia({ name: "logging-middleware" })
	.derive(({ request }) => {
		const startTime = performance.now();
		const requestId = crypto.randomUUID().slice(0, 8);
		const method = request.method;
		const url = new URL(request.url);
		const path = url.pathname;
		const query = url.search || undefined;

		const requestLogger = createChildLogger({
			requestId,
			method,
			path,
		});

		requestLogger.info(
			{ query, userAgent: request.headers.get("user-agent") },
			`→ ${method} ${path}${query || ""}`,
		);

		return {
			requestId,
			requestLogger,
			requestStartTime: startTime,
		};
	})
	.onAfterResponse(
		({ request, requestLogger, requestStartTime, set }) => {
			const durationMs = Math.round(performance.now() - requestStartTime);
			const status = typeof set.status === "number" ? set.status : 200;
			const method = request.method;
			const url = new URL(request.url);
			const path = url.pathname;

			const logFn = status >= 500 ? requestLogger.error : status >= 400 ? requestLogger.warn : requestLogger.info;

			logFn.call(
				requestLogger,
				{ status, durationMs },
				`← ${method} ${path} ${status} (${durationMs}ms)`,
			);
		},
	)
	.onError(({ error, request, requestLogger, requestStartTime, set }) => {
		const durationMs = Math.round(performance.now() - (requestStartTime || 0));
		const status = typeof set.status === "number" ? set.status : 500;
		const method = request.method;
		const url = new URL(request.url);
		const path = url.pathname;

		const errorLogger = requestLogger || logger;

		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorStack = error instanceof Error ? error.stack : undefined;

		errorLogger.error(
			{
				status,
				durationMs,
				error: errorMessage,
				stack: errorStack,
			},
			`✗ ${method} ${path} ${status} (${durationMs}ms) - ${errorMessage}`,
		);
	});
