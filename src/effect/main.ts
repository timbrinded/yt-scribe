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
 * - Frontend.Live provides Astro SSR handler for frontend routes
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

import {
	HttpApiBuilder,
	HttpMiddleware,
	HttpApp,
	HttpServerRequest,
} from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Config, Effect, Layer, Logger, LogLevel, pipe } from "effect";
import { YTScribeApi } from "./api";
import { VideosGroupLive } from "./api/handlers/videos";
import { ChatGroupLive } from "./api/handlers/chat";
import { AuthGroupLive } from "./api/handlers/auth";
import { AdminGroupLive } from "./api/handlers/admin";
import { AuthorizationLive } from "./api/middleware/auth";
import { LiveLayer } from "./layers/Live";
import { Frontend } from "./services/Frontend";

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
	AdminGroupLive,
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
/**
 * Authorization layer with its Auth dependency satisfied.
 * AuthorizationLive depends on Auth service, which is in LiveLayer.
 */
const AuthorizationWithDeps = AuthorizationLive.pipe(Layer.provide(LiveLayer));

const ApiLive = HttpApiBuilder.api(YTScribeApi).pipe(
	// Provide handler implementations
	Layer.provide(HandlersLive),
	// Provide authorization middleware (with Auth dependency satisfied)
	Layer.provide(AuthorizationWithDeps),
	// Provide all business services
	Layer.provide(LiveLayer),
);

/**
 * Creates middleware that forwards non-API routes to the frontend.
 *
 * This allows the API to handle /api/* and /auth/* routes while forwarding
 * all other requests (like /, /library, /video/:id) to the Astro frontend.
 *
 * The frontend handler is passed in at layer construction time (via Layer.unwrapEffect)
 * so the middleware doesn't have runtime dependencies on Frontend service.
 *
 * Note: We check the URL path prefix rather than catching RouteNotFound because
 * HttpApp.Default has error type `never` after middleware processing.
 */
const createFrontendFallback =
	(frontendHandler: HttpApp.Default<never>) =>
	(httpApp: HttpApp.Default): HttpApp.Default =>
		Effect.gen(function* () {
			const request = yield* HttpServerRequest.HttpServerRequest;
			// request.url is a relative path like "/auth/me", not a full URL
			const pathname = request.url;

			// API and auth routes are handled by the HttpApi router
			if (pathname.startsWith("/api/") || pathname.startsWith("/auth/")) {
				return yield* httpApp;
			}

			// All other routes go to the Astro frontend
			return yield* frontendHandler;
		});

/**
 * HTTP server layer with CORS, logging, and frontend fallback.
 *
 * Composes:
 * - ApiLive: The API handlers and middleware
 * - middlewareCors: Cross-origin resource sharing
 * - HttpMiddleware.logger: Request/response logging
 * - withFrontendFallback: Forwards non-API routes to Astro frontend
 * - BunHttpServer.layer: Bun's HTTP server implementation
 *
 * Uses Layer.unwrapEffect to acquire the frontend service at layer construction,
 * then passes the handler to the middleware factory.
 */
const HttpLive = Layer.unwrapEffect(
	Effect.gen(function* () {
		const frontendService = yield* Frontend;
		const withFrontendFallback = createFrontendFallback(frontendService.handler);

		return HttpApiBuilder.serve((httpApp) =>
			pipe(httpApp, HttpMiddleware.logger, withFrontendFallback),
		).pipe(
			// Add CORS middleware allowing all origins (configure for production)
			Layer.provide(HttpApiBuilder.middlewareCors()),
			// Provide the API layer
			Layer.provide(ApiLive),
		);
	}).pipe(Effect.provide(Frontend.Live)),
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
 * On interruption, all scoped resources (database connections, PubSub, etc.)
 * are properly cleaned up via Effect's acquireRelease pattern.
 *
 * Graceful Shutdown:
 * - BunRuntime.runMain handles SIGINT/SIGTERM signals
 * - Layer.launch creates a scope for all layers
 * - When interrupted, the scope closes and all finalizers run:
 *   - Database: closes SQLite connection (via Effect.acquireRelease)
 *   - Progress: cleans up PubSub (via Layer.scoped)
 *   - HTTP Server: closes listening socket (via BunHttpServer.layer)
 */
const main = Effect.gen(function* () {
	const config = yield* ServerConfig;

	yield* Effect.logInfo(`Starting YTScribe API server...`);
	yield* Effect.logInfo(`Listening on http://${config.host}:${config.port}`);

	// Launch the HTTP server
	// Layer.launch keeps the server running until interrupted
	// When interrupted, all scoped layers get their release effects run
	yield* Layer.launch(HttpLive);
}).pipe(
	// Log shutdown message after server stops (on success, error, or interruption)
	Effect.ensuring(
		Effect.logInfo("Server shutdown complete. All resources cleaned up."),
	),
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
