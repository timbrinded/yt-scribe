/**
 * Effect-TS Main Entry Point
 *
 * This is the production entry point for the YTScribe API server.
 * It composes all services and handlers into a single HTTP server
 * using the Effect-TS platform.
 *
 * Architecture:
 * - HttpApiBuilder.api creates the API layer from YTScribeApi
 * - Handler layers (VideosGroupLive, ChatGroupLive, AuthGroupLive) provide endpoint implementations
 * - AuthorizationLive provides bearer token middleware
 * - LiveLayer provides all business services (Database, OpenAI, YouTube, etc.)
 * - BunHttpServer.layer provides the Bun HTTP server implementation
 *
 * @example
 * ```bash
 * # Start the server
 * bun src/effect/main.ts
 *
 * # Start with hot reload
 * bun --hot src/effect/main.ts
 * ```
 */

import { HttpApiBuilder, HttpMiddleware } from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Config, Effect, Layer, Logger, LogLevel } from "effect";
import { YTScribeApi } from "./api";
import { VideosGroupLive } from "./api/handlers/videos";
import { ChatGroupLive } from "./api/handlers/chat";
import { AuthGroupLive } from "./api/handlers/auth";
import { AuthorizationLive } from "./api/middleware/auth";
import { LiveLayer } from "./layers/Live";

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Server configuration read from environment variables.
 */
const ServerConfig = Config.all({
	port: Config.integer("PORT").pipe(Config.withDefault(3001)),
	host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
});

// =============================================================================
// HTTP LAYER COMPOSITION
// =============================================================================

/**
 * API Handlers layer - provides implementations for all API endpoints.
 *
 * Each handler group implements a subset of the API:
 * - VideosGroupLive: Video CRUD, retry, status streaming
 * - ChatGroupLive: Chat messages, session listing
 * - AuthGroupLive: OAuth flow, logout, current user
 */
const HandlersLive = Layer.mergeAll(
	VideosGroupLive,
	ChatGroupLive,
	AuthGroupLive,
);

/**
 * HTTP API layer.
 *
 * HttpApiBuilder.api creates a layer from the API schema that:
 * - Builds a router from the YTScribeApi schema
 * - Requires handler implementations for each endpoint group
 *
 * Dependencies:
 * - HandlersLive: Endpoint implementations
 * - AuthorizationLive: Bearer token middleware
 * - LiveLayer: All business services
 */
const ApiLive = HttpApiBuilder.api(YTScribeApi).pipe(
	// Provide handler implementations
	Layer.provide(HandlersLive),
	// Provide authorization middleware
	Layer.provide(AuthorizationLive),
	// Provide all business services
	Layer.provide(LiveLayer),
);

/**
 * HTTP server layer with CORS and logging middleware.
 *
 * Composes:
 * - ApiLive: The API handlers and middleware
 * - middlewareCors: Cross-origin resource sharing
 * - HttpMiddleware.logger: Request/response logging
 * - BunHttpServer.layer: Bun's HTTP server implementation
 */
const HttpLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
	// Add CORS middleware allowing all origins (configure for production)
	Layer.provide(HttpApiBuilder.middlewareCors()),
	// Provide the API layer
	Layer.provide(ApiLive),
);

// =============================================================================
// MAIN PROGRAM
// =============================================================================

/**
 * Main program that starts the HTTP server.
 *
 * 1. Reads configuration from environment
 * 2. Logs server startup information
 * 3. Launches the HTTP server layer
 *
 * The server runs until interrupted (SIGINT/SIGTERM).
 */
const main = Effect.gen(function* () {
	const config = yield* ServerConfig;

	yield* Effect.logInfo(`Starting YTScribe API server...`);
	yield* Effect.logInfo(`Listening on http://${config.host}:${config.port}`);

	// Launch the HTTP server
	yield* Layer.launch(HttpLive);
}).pipe(
	// Provide the BunHttpServer layer with config
	Effect.provide(
		Layer.unwrapEffect(
			Effect.map(ServerConfig, (config) =>
				BunHttpServer.layer({ port: config.port, hostname: config.host }),
			),
		),
	),
	// Set minimum log level
	Logger.withMinimumLogLevel(LogLevel.Debug),
);

// =============================================================================
// ENTRY POINT
// =============================================================================

/**
 * Run the main program with the Bun runtime.
 *
 * BunRuntime.runMain provides:
 * - Proper handling of SIGINT/SIGTERM for graceful shutdown
 * - Bun-specific performance optimizations
 * - Process exit code handling
 */
BunRuntime.runMain(main);
