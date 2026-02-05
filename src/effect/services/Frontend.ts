/**
 * Frontend Service for Serving Astro SSR Application
 *
 * This service bridges the Astro Node.js adapter's handler with Effect-TS's
 * HttpApi. It converts Node.js style (req, res) handlers to Effect-TS HttpApp.
 *
 * Architecture:
 * - Astro builds to frontend/dist/ with SSR enabled
 * - The entry.mjs exports a `handler` function for Node.js HTTP
 * - This service wraps that handler for Effect-TS compatibility
 *
 * @module
 */

import { Context, Effect, Layer } from "effect";
import {
	HttpServerRequest,
	HttpServerResponse,
	HttpApp,
} from "@effect/platform";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import path from "node:path";

// =============================================================================
// SERVICE INTERFACE
// =============================================================================

/**
 * Frontend service interface.
 * Provides the Astro SSR handler as an Effect-TS HttpApp.
 */
export interface FrontendService {
	/**
	 * The Astro SSR handler wrapped as an Effect HttpApp.
	 * Handles all frontend routes (pages, assets, etc.)
	 */
	readonly handler: HttpApp.Default<never>;
}

// =============================================================================
// SERVICE TAG
// =============================================================================

/**
 * Frontend service tag for Effect dependency injection.
 */
export class Frontend extends Context.Tag("@ytscribe/Frontend")<
	Frontend,
	FrontendService
>() {
	/**
	 * Live implementation that loads the Astro SSR handler.
	 *
	 * Requires the frontend to be built: `cd frontend && bun run build`
	 */
	static readonly Live = Layer.effect(
		Frontend,
		Effect.gen(function* () {
			// Prevent Astro from auto-starting its own server
			// The entry.mjs calls `start()` on import which listens on a port
			// Setting ASTRO_NODE_AUTOSTART=disabled prevents this behavior
			process.env.ASTRO_NODE_AUTOSTART = "disabled";

			// Dynamically import the Astro SSR entry point
			const frontendDistPath = path.resolve(
				process.cwd(),
				"frontend/dist/server/entry.mjs",
			);

			const astroModule = yield* Effect.tryPromise({
				try: () =>
					import(/* webpackIgnore: true */ frontendDistPath) as Promise<{
						handler: (
							req: IncomingMessage,
							res: ServerResponse,
						) => void | Promise<void>;
					}>,
				catch: (error) => {
					console.error("Failed to load Astro frontend:", error);
					return new Error(
						`Failed to load Astro frontend from ${frontendDistPath}. ` +
							`Make sure to run 'cd frontend && bun run build' first.`,
					);
				},
			});

			const astroHandler = astroModule.handler;

			// Create an HttpApp that bridges Node.js handler to Effect-TS
			const handler: HttpApp.Default<never> = Effect.gen(function* () {
				const request = yield* HttpServerRequest.HttpServerRequest;

				// request.url is already a relative path like "/library" or "/video/123?foo=bar"
				// Effect-TS Headers is a plain object with string keys and values
				const headers: Record<string, string | string[] | undefined> = {};
				for (const [key, value] of Object.entries(request.headers)) {
					if (typeof value === "string") {
						headers[key.toLowerCase()] = value;
					}
				}

				// Create a mock IncomingMessage
				const mockReq = {
					method: request.method,
					url: request.url, // Already in correct format for Node.js handler
					headers,
					socket: {
						remoteAddress: headers["x-forwarded-for"] || "127.0.0.1",
					},
					// Make it a readable stream if there's a body
					...(request.method !== "GET" && request.method !== "HEAD"
						? createReadableFromRequest(request)
						: {}),
				} as unknown as IncomingMessage;

				// Create a mock ServerResponse that captures the response
				const responseData = yield* Effect.promise(() => {
					return new Promise<{
						statusCode: number;
						headers: Record<string, string | string[]>;
						body: Uint8Array[];
					}>((resolve) => {
						const chunks: Uint8Array[] = [];
						let statusCode = 200;
						const responseHeaders: Record<string, string | string[]> = {};
						let resolved = false;

						const doResolve = () => {
							if (resolved) return;
							resolved = true;
							resolve({
								statusCode,
								headers: responseHeaders,
								body: chunks,
							});
						};

						// Event emitter callbacks
						const listeners: Record<string, Array<() => void>> = {};

						const mockRes = {
							statusCode: 200,
							setHeader(name: string, value: string | string[]) {
								responseHeaders[name.toLowerCase()] = value;
							},
							getHeader(name: string) {
								return responseHeaders[name.toLowerCase()];
							},
							removeHeader(name: string) {
								delete responseHeaders[name.toLowerCase()];
							},
							writeHead(code: number, headersArg?: Record<string, string>) {
								statusCode = code;
								if (headersArg) {
									for (const [key, value] of Object.entries(headersArg)) {
										responseHeaders[key.toLowerCase()] = value;
									}
								}
								return this;
							},
							write(chunk: string | Uint8Array) {
								if (typeof chunk === "string") {
									chunks.push(new TextEncoder().encode(chunk));
								} else {
									chunks.push(chunk);
								}
								return true;
							},
							end(chunk?: string | Uint8Array) {
								if (chunk) {
									if (typeof chunk === "string") {
										chunks.push(new TextEncoder().encode(chunk));
									} else {
										chunks.push(chunk);
									}
								}
								// Emit 'finish' event before resolving
								(listeners["finish"] || []).forEach((fn) => fn());
								doResolve();
							},
							// Event emitter methods for streams
							on(event: string, fn: () => void) {
								listeners[event] = listeners[event] || [];
								listeners[event].push(fn);
								return this;
							},
							once(event: string, fn: () => void) {
								listeners[event] = listeners[event] || [];
								listeners[event].push(fn);
								return this;
							},
							emit(event: string) {
								(listeners[event] || []).forEach((fn) => fn());
								if (event === "finish" || event === "close") {
									doResolve();
								}
								return true;
							},
							// Additional properties that Astro might check
							headersSent: false,
							finished: false,
							writableEnded: false,
							writableFinished: false,
						} as unknown as ServerResponse;

						// Call the Astro handler
						const result = astroHandler(mockReq, mockRes);
						if (result instanceof Promise) {
							result
								.then(() => {
									// Handler finished successfully, resolve if not already done
									doResolve();
								})
								.catch((err) => {
									console.error("Astro handler error:", err);
									resolve({
										statusCode: 500,
										headers: { "content-type": "text/plain" },
										body: [new TextEncoder().encode("Internal Server Error")],
									});
								});
						}
					});
				});

				// Build Effect-TS response from captured data
				const totalLength = responseData.body.reduce(
					(sum, chunk) => sum + chunk.length,
					0,
				);
				const combinedBody = new Uint8Array(totalLength);
				let offset = 0;
				for (const chunk of responseData.body) {
					combinedBody.set(chunk, offset);
					offset += chunk.length;
				}

				// Convert headers to Headers object
				const responseHeaders = new Headers();
				for (const [key, value] of Object.entries(responseData.headers)) {
					if (Array.isArray(value)) {
						for (const v of value) {
							responseHeaders.append(key, v);
						}
					} else if (value) {
						responseHeaders.set(key, value);
					}
				}

				return HttpServerResponse.raw(
					new Response(combinedBody, {
						status: responseData.statusCode,
						headers: responseHeaders,
					}),
				);
			});

			return { handler } satisfies FrontendService;
		}),
	);

	/**
	 * Test implementation that returns a simple HTML response.
	 */
	static readonly Test = Layer.succeed(Frontend, {
		handler: Effect.succeed(
			HttpServerResponse.html("<html><body>Test Frontend</body></html>"),
		),
	} satisfies FrontendService);
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Creates a readable stream interface from a Fetch Request body.
 */
function createReadableFromRequest(
	request: HttpServerRequest.HttpServerRequest,
): Partial<IncomingMessage> {
	const webRequest = request.source as Request;
	if (!webRequest.body) {
		return {};
	}

	const readable = Readable.fromWeb(webRequest.body as never);
	return {
		read: readable.read.bind(readable),
		on: readable.on.bind(readable) as never,
		once: readable.once.bind(readable) as never,
		emit: readable.emit.bind(readable) as never,
		pipe: readable.pipe.bind(readable) as never,
	};
}
