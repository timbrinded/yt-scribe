import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Application logger configured for both development and production environments.
 *
 * Development: Pretty-printed output with colors and timestamps
 * Production: JSON structured logs for log aggregation systems
 */
export const logger = pino({
	level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
	...(isDev && {
		transport: {
			target: "pino-pretty",
			options: {
				colorize: true,
				translateTime: "SYS:HH:MM:ss",
				ignore: "pid,hostname",
			},
		},
	}),
});

/**
 * Creates a child logger with the given context
 * Useful for adding request-specific or component-specific metadata
 */
export function createChildLogger(context: Record<string, unknown>) {
	return logger.child(context);
}

/**
 * Logs the start of an operation and returns a function to log completion with duration
 */
export function logWithTiming(
	operationName: string,
	metadata?: Record<string, unknown>,
) {
	const startTime = performance.now();
	const operationLogger = metadata ? logger.child(metadata) : logger;

	operationLogger.info(
		{ operation: operationName },
		`Starting ${operationName}`,
	);

	return {
		success: (resultMetadata?: Record<string, unknown>) => {
			const durationMs = Math.round(performance.now() - startTime);
			operationLogger.info(
				{ operation: operationName, durationMs, ...resultMetadata },
				`Completed ${operationName} in ${durationMs}ms`,
			);
		},
		failure: (
			error: Error | unknown,
			resultMetadata?: Record<string, unknown>,
		) => {
			const durationMs = Math.round(performance.now() - startTime);
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			const errorStack = error instanceof Error ? error.stack : undefined;
			operationLogger.error(
				{
					operation: operationName,
					durationMs,
					error: errorMessage,
					stack: errorStack,
					...resultMetadata,
				},
				`Failed ${operationName} after ${durationMs}ms: ${errorMessage}`,
			);
		},
	};
}

/**
 * Structured error logging with consistent format
 */
export function logError(
	message: string,
	error: Error | unknown,
	metadata?: Record<string, unknown>,
) {
	const errorMessage = error instanceof Error ? error.message : String(error);
	const errorStack = error instanceof Error ? error.stack : undefined;
	const errorName = error instanceof Error ? error.name : "UnknownError";

	logger.error(
		{
			error: {
				name: errorName,
				message: errorMessage,
				stack: errorStack,
			},
			...metadata,
		},
		message,
	);
}

export default logger;
