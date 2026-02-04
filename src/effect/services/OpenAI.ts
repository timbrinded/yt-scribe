/**
 * OpenAI Effect Service
 *
 * Provides access to the OpenAI SDK client for Whisper transcription
 * and GPT chat completions. This is a leaf service with no Effect-TS
 * service dependencies.
 *
 * Uses Layer.effect to read the API key from Config during layer construction.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const { client } = yield* OpenAI
 *   const response = await client.chat.completions.create({
 *     model: "gpt-4o",
 *     messages: [{ role: "user", content: "Hello!" }],
 *   })
 *   return response.choices[0].message.content
 * })
 *
 * // Run with live OpenAI client
 * await Effect.runPromise(program.pipe(Effect.provide(OpenAI.Live)))
 *
 * // Run with mock client for testing
 * await Effect.runPromise(program.pipe(Effect.provide(OpenAI.Test)))
 * ```
 */

import { Context, Effect, Layer, Config } from "effect";
import OpenAIClient from "openai";
import type { OpenAIService } from "./types";

// =============================================================================
// SERVICE TAG
// =============================================================================

/**
 * OpenAI service Context.Tag for dependency injection.
 *
 * Usage:
 * ```typescript
 * const { client } = yield* OpenAI
 * const transcription = await client.audio.transcriptions.create({
 *   file: audioFile,
 *   model: "whisper-1",
 * })
 * ```
 */
export class OpenAI extends Context.Tag("@ytscribe/OpenAI")<
	OpenAI,
	OpenAIService
>() {
	// =========================================================================
	// LIVE LAYER
	// =========================================================================
	/**
	 * Production layer that creates an OpenAI client with the API key from environment.
	 *
	 * Requires OPENAI_API_KEY environment variable to be set.
	 * The client is created once during layer construction and reused.
	 */
	static readonly Live = Layer.effect(
		OpenAI,
		Effect.gen(function* () {
			// Read API key from config (required, no default)
			const apiKey = yield* Config.string("OPENAI_API_KEY");

			// Create OpenAI client with the API key
			const client = new OpenAIClient({ apiKey });

			return { client } satisfies OpenAIService;
		}),
	);

	// =========================================================================
	// TEST LAYER
	// =========================================================================
	/**
	 * Test layer providing a mock OpenAI client.
	 *
	 * The mock client throws helpful errors indicating which method
	 * was called but not mocked. Use makeOpenAITestLayer() for
	 * specific mock implementations in tests.
	 */
	static readonly Test = Layer.succeed(OpenAI, {
		client: createMockOpenAIClient(),
	} satisfies OpenAIService);
}

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Creates a mock OpenAI client that throws helpful errors.
 *
 * Each method throws an error indicating it was called but not mocked,
 * making it easy to identify which methods need mock implementations.
 */
function createMockOpenAIClient(): OpenAIClient {
	// Create a proxy that throws helpful errors for any method access
	const createNotImplementedHandler = (path: string): unknown =>
		new Proxy(
			{},
			{
				get(_target, prop) {
					// Don't proxy these special properties to avoid Promise detection issues
					if (prop === "then" || prop === "catch" || prop === "finally") {
						return undefined;
					}
					if (typeof prop === "string") {
						const newPath = path ? `${path}.${prop}` : prop;
						// Return a function that throws for method calls
						const handler = (..._args: unknown[]) => {
							throw new Error(
								`OpenAI mock: client.${newPath}() was called but not mocked. ` +
									"Use makeOpenAITestLayer() to provide a mock implementation.",
							);
						};
						// Also proxy property access for nested objects
						return new Proxy(handler, {
							get(_t, p) {
								if (
									p === "then" ||
									p === "catch" ||
									p === "finally"
								) {
									return undefined;
								}
								if (typeof p === "string") {
									return createNotImplementedHandler(`${newPath}.${p}`);
								}
								return undefined;
							},
						});
					}
					return undefined;
				},
			},
		);

	return createNotImplementedHandler("") as unknown as OpenAIClient;
}

/**
 * Factory function for creating test layers with partial mock implementations.
 *
 * Use when you need to mock specific OpenAI API methods for testing.
 *
 * @example
 * ```typescript
 * // Mock Whisper transcription
 * const testLayer = makeOpenAITestLayer({
 *   audio: {
 *     transcriptions: {
 *       create: async () => ({
 *         text: "Mocked transcription",
 *         language: "en",
 *         duration: 60,
 *         segments: [{ start: 0, end: 5, text: "Mocked" }],
 *       }),
 *     },
 *   },
 * })
 *
 * // Mock chat completions
 * const chatTestLayer = makeOpenAITestLayer({
 *   chat: {
 *     completions: {
 *       create: async () => ({
 *         id: "mock-id",
 *         object: "chat.completion",
 *         created: Date.now(),
 *         model: "gpt-4o",
 *         choices: [{
 *           index: 0,
 *           message: { role: "assistant", content: "Mocked response" },
 *           finish_reason: "stop",
 *         }],
 *       }),
 *     },
 *   },
 * })
 * ```
 */
export function makeOpenAITestLayer(
	partialClient: DeepPartial<OpenAIClient>,
): Layer.Layer<OpenAI> {
	return Layer.succeed(OpenAI, {
		client: createPartialMockClient(partialClient),
	} satisfies OpenAIService);
}

/**
 * Deep partial type for nested object mocking.
 */
type DeepPartial<T> = T extends object
	? { [P in keyof T]?: DeepPartial<T[P]> }
	: T;

/**
 * Creates a mock client that uses provided implementations
 * and falls back to the base mock for unimplemented methods.
 */
function createPartialMockClient(
	partial: DeepPartial<OpenAIClient>,
): OpenAIClient {
	const baseMock = createMockOpenAIClient();

	// Recursively merge partial into base mock
	function merge(base: unknown, override: unknown): unknown {
		if (override === undefined) {
			return base;
		}
		if (
			typeof override === "function" ||
			typeof override !== "object" ||
			override === null
		) {
			return override;
		}
		if (typeof base !== "object" || base === null) {
			return override;
		}

		// Create a proxy that merges base and override
		return new Proxy(base, {
			get(target, prop) {
				const overrideValue = (override as Record<string | symbol, unknown>)[
					prop
				];
				const baseValue = (target as Record<string | symbol, unknown>)[prop];

				if (overrideValue !== undefined) {
					return merge(baseValue, overrideValue);
				}
				return baseValue;
			},
		});
	}

	return merge(baseMock, partial) as OpenAIClient;
}
