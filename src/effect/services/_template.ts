/**
 * Effect-TS Service Definition Pattern Template
 *
 * This file serves as a reference pattern for defining services in the YTScribe
 * Effect-TS architecture. It demonstrates:
 *
 * 1. Service interface definition
 * 2. Context.Tag class creation with unique identifier
 * 3. Layer.effect() vs Layer.scoped() vs Layer.sync() vs Layer.succeed()
 * 4. Live and Test layer implementations
 * 5. Service dependency patterns
 *
 * ============================================================================
 * NAMING CONVENTIONS
 * ============================================================================
 *
 * - FooService: The TypeScript interface describing the service shape
 * - Foo: The Context.Tag class used for dependency injection
 * - Foo.Live: Layer providing the production implementation
 * - Foo.Test: Layer providing the test/mock implementation
 *
 * ============================================================================
 * WHEN TO USE EACH LAYER CONSTRUCTOR
 * ============================================================================
 *
 * Layer.sync(Tag, () => impl)
 *   Use when: Implementation is synchronous with no side effects
 *   Example: Pure calculations, configuration objects
 *
 * Layer.succeed(Tag, impl)
 *   Use when: Implementation is a static value (no function needed)
 *   Example: Test mocks, static configurations
 *
 * Layer.effect(Tag, effect)
 *   Use when: Implementation requires async operations or other services
 *   Example: Services that need to read config, depend on other services
 *
 * Layer.scoped(Tag, effect)
 *   Use when: Service manages a resource with lifecycle (acquire/release)
 *   Example: Database connections, file handles, WebSocket connections
 *
 * ============================================================================
 * LAYER COMPOSITION RULES
 * ============================================================================
 *
 * 1. Services should NOT call Layer.provide() on their dependencies internally
 *    Instead, dependency wiring happens at the composition layer (src/effect/layers/)
 *
 * 2. Layer memoization: Store composed layers in constants to share instances
 *    ```typescript
 *    const AppLayer = Layer.mergeAll(DatabaseLive, OpenAILive)
 *    // Use AppLayer everywhere - services are created once
 *    ```
 *
 * 3. Composition order: leaf services → dependent services → orchestration
 *    - Leaf services have no dependencies (Database, YouTube)
 *    - Dependent services rely on leaf services (Transcription → OpenAI)
 *    - Orchestration services compose multiple services (Pipeline → all)
 *
 * ============================================================================
 */

import { Context, Effect, Layer } from "effect";

// ============================================================================
// 1. SERVICE INTERFACE DEFINITION
// ============================================================================
/**
 * Define the service interface as a plain TypeScript interface.
 * This describes what the service provides to consumers.
 *
 * Best practices:
 * - Methods should return Effect<Success, Error> for effectful operations
 * - Use readonly to prevent mutation
 * - Keep the interface focused on the service's responsibility
 */
export interface ExampleService {
	/**
	 * Example method that performs an effectful operation.
	 * Returns an Effect because it may fail or need other services.
	 */
	readonly doSomething: (input: string) => Effect.Effect<string>;

	/**
	 * Example method that can fail with a typed error.
	 */
	readonly doSomethingThatMayFail: (
		input: string,
	) => Effect.Effect<string, ExampleError>;

	/**
	 * Example method returning a pure value (no Effect needed).
	 * Use this for synchronous, infallible operations.
	 */
	readonly getValue: () => string;
}

/**
 * Typed error for the service.
 * Use Schema.TaggedError in real services (see src/effect/errors/).
 */
export class ExampleError extends Error {
	readonly _tag = "ExampleError";
	constructor(message: string) {
		super(message);
		this.name = "ExampleError";
	}
}

// ============================================================================
// 2. CONTEXT.TAG CLASS DEFINITION
// ============================================================================
/**
 * Create a Context.Tag for dependency injection.
 *
 * Pattern: class ServiceName extends Context.Tag("@app/ServiceName")<ServiceName, ServiceInterface>() {}
 *
 * The string identifier should be unique across the application.
 * Convention: "@ytscribe/ServiceName"
 *
 * Why extend Context.Tag?
 * - Enables type-safe dependency injection
 * - The tag becomes a type-level identifier for the service
 * - Consumers use `yield* Example` to access the service
 */
export class Example extends Context.Tag("@ytscribe/Example")<
	Example,
	ExampleService
>() {
	// ========================================================================
	// 3. STATIC LIVE LAYER
	// ========================================================================
	/**
	 * Layer.sync: Use when implementation is synchronous with no dependencies.
	 *
	 * For services that need dependencies, use Layer.effect with Effect.gen:
	 * ```typescript
	 * static readonly Live = Layer.effect(
	 *   Example,
	 *   Effect.gen(function* () {
	 *     const config = yield* Config  // Access dependency
	 *     return { ... } satisfies ExampleService
	 *   })
	 * )
	 * ```
	 */
	static readonly Live = Layer.sync(Example, () => ({
		doSomething: (input: string) =>
			Effect.succeed(`[Live] Processed: ${input}`),

		doSomethingThatMayFail: (input: string) =>
			input === "fail"
				? Effect.fail(new ExampleError("Input was 'fail'"))
				: Effect.succeed(`[Live] Result: ${input}`),

		getValue: () => "live-value",
	}));

	// ========================================================================
	// 4. STATIC TEST LAYER
	// ========================================================================
	/**
	 * Layer.succeed: Use for test/mock implementations with static values.
	 *
	 * This provides a default mock that can be overridden in specific tests.
	 * For partial mocking, see makeTestLayer() factory pattern below.
	 */
	static readonly Test = Layer.succeed(Example, {
		doSomething: (input: string) =>
			Effect.succeed(`[Test] Mocked: ${input}`),

		doSomethingThatMayFail: (input: string) =>
			Effect.succeed(`[Test] Always succeeds: ${input}`),

		getValue: () => "test-value",
	} satisfies ExampleService);
}

// ============================================================================
// LAYER.SCOPED PATTERN (for resources with lifecycle)
// ============================================================================
/**
 * Example of a service that manages a resource requiring cleanup.
 *
 * Use Layer.scoped when:
 * - Service opens connections (database, WebSocket)
 * - Service acquires handles that must be released
 * - Service has setup/teardown logic
 */
export interface ResourceService {
	readonly getData: () => Effect.Effect<string>;
}

export class Resource extends Context.Tag("@ytscribe/Resource")<
	Resource,
	ResourceService
>() {
	/**
	 * Layer.scoped with acquireRelease for resource lifecycle management.
	 *
	 * Effect.acquireRelease ensures the release function runs when the
	 * scope is closed, even if an error occurs.
	 */
	static readonly Live = Layer.scoped(
		Resource,
		Effect.gen(function* () {
			// Acquire the resource
			const handle = yield* Effect.acquireRelease(
				// Acquire: Open connection, allocate resource
				Effect.sync(() => {
					console.log("[Resource] Acquiring resource");
					return { id: crypto.randomUUID() };
				}),
				// Release: Close connection, cleanup resource
				// Receives the acquired resource and exit status
				(handle, _exit) =>
					Effect.sync(() => {
						console.log(`[Resource] Releasing resource ${handle.id}`);
					}),
			);

			// Return the service implementation using the acquired resource
			return {
				getData: () => Effect.succeed(`Data from resource ${handle.id}`),
			} satisfies ResourceService;
		}),
	);

	static readonly Test = Layer.succeed(Resource, {
		getData: () => Effect.succeed("test-data"),
	} satisfies ResourceService);
}

// ============================================================================
// SERVICE WITH DEPENDENCIES PATTERN
// ============================================================================
/**
 * Example of a service that depends on other services.
 *
 * Key pattern: Dependencies are declared via `yield* DependencyTag` inside
 * the Layer.effect generator. The Layer type signature automatically tracks
 * these requirements.
 *
 * DO NOT: Call Layer.provide() inside the service file.
 * Dependency wiring happens in src/effect/layers/Live.ts and Test.ts
 */
export interface DependentService {
	readonly process: (input: string) => Effect.Effect<string>;
}

export class Dependent extends Context.Tag("@ytscribe/Dependent")<
	Dependent,
	DependentService
>() {
	/**
	 * This layer requires Example service to be provided.
	 * Type: Layer<Dependent, never, Example>
	 *
	 * The Example requirement will be resolved when this layer
	 * is composed with Example.Live in the layer composition file.
	 */
	static readonly Live = Layer.effect(
		Dependent,
		Effect.gen(function* () {
			// Declare dependency by yielding the service tag
			const example = yield* Example;

			return {
				process: (input: string) =>
					Effect.gen(function* () {
						// Use the dependency
						const result = yield* example.doSomething(input);
						return `[Dependent] Processed via Example: ${result}`;
					}),
			} satisfies DependentService;
		}),
	);

	/**
	 * Test layer has no dependencies - it provides mocked behavior.
	 */
	static readonly Test = Layer.succeed(Dependent, {
		process: (input: string) =>
			Effect.succeed(`[Test Dependent] Mocked: ${input}`),
	} satisfies DependentService);
}

// ============================================================================
// TEST HELPER: PARTIAL MOCK FACTORY
// ============================================================================
/**
 * Factory function for creating test layers with partial mocks.
 *
 * Use when you want to override only specific methods in tests.
 * Default behavior falls back to Example.Test implementation.
 */
export function makeExampleTestLayer(
	overrides: Partial<ExampleService>,
): Layer.Layer<Example> {
	const defaultImpl: ExampleService = {
		doSomething: (input: string) =>
			Effect.succeed(`[PartialTest] Default: ${input}`),
		doSomethingThatMayFail: (input: string) =>
			Effect.succeed(`[PartialTest] Default success: ${input}`),
		getValue: () => "partial-test-value",
	};

	return Layer.succeed(Example, {
		...defaultImpl,
		...overrides,
	} satisfies ExampleService);
}

// ============================================================================
// USAGE EXAMPLES (for documentation, not exported)
// ============================================================================
/**
 * Example: Using a service in an Effect
 *
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const example = yield* Example
 *   const result = yield* example.doSomething("hello")
 *   console.log(result)
 * })
 *
 * // Provide the layer and run
 * Effect.runPromise(
 *   program.pipe(Effect.provide(Example.Live))
 * )
 * ```
 *
 * Example: Composing layers
 *
 * ```typescript
 * // In src/effect/layers/Live.ts
 * const LeafLayer = Layer.mergeAll(Example.Live, Resource.Live)
 * const DependentLayer = Dependent.Live.pipe(Layer.provide(LeafLayer))
 * export const AppLayer = Layer.merge(LeafLayer, DependentLayer)
 * ```
 *
 * Example: Testing with partial mocks
 *
 * ```typescript
 * const testLayer = makeExampleTestLayer({
 *   doSomething: (input) => Effect.succeed(`custom mock: ${input}`)
 * })
 *
 * Effect.runPromise(
 *   program.pipe(Effect.provide(testLayer))
 * )
 * ```
 */
