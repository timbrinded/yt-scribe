import { describe, expect, test } from "bun:test";
import { Chunk, Effect, Fiber, Stream } from "effect";
import {
	Progress,
	createProgressEvent,
	makeProgressMockLayer,
	makeProgressTestLayer,
} from "../../../src/effect/services/Progress";
import type { ProgressEvent } from "../../../src/effect/services/types";

describe("Progress Effect Service", () => {
	describe("createProgressEvent helper", () => {
		test("creates event with current timestamp", () => {
			const before = new Date().toISOString();

			const event = createProgressEvent({
				videoId: 1,
				stage: "downloading",
				progress: 50,
				message: "Downloading...",
			});

			const after = new Date().toISOString();

			expect(event.videoId).toBe(1);
			expect(event.stage).toBe("downloading");
			expect(event.progress).toBe(50);
			expect(event.message).toBe("Downloading...");
			expect(event.timestamp >= before).toBe(true);
			expect(event.timestamp <= after).toBe(true);
		});

		test("creates event without optional fields", () => {
			const event = createProgressEvent({
				videoId: 2,
				stage: "complete",
				message: "Done",
			});

			expect(event.videoId).toBe(2);
			expect(event.stage).toBe("complete");
			expect(event.message).toBe("Done");
			expect(event.progress).toBeUndefined();
			expect(event.error).toBeUndefined();
		});

		test("creates error event", () => {
			const event = createProgressEvent({
				videoId: 3,
				stage: "error",
				message: "Failed",
				error: "Network error",
			});

			expect(event.stage).toBe("error");
			expect(event.error).toBe("Network error");
		});
	});

	describe("Progress.Live layer", () => {
		test("provides progress service", async () => {
			const program = Effect.gen(function* () {
				const progress = yield* Progress;
				expect(progress).toBeDefined();
				expect(typeof progress.emit).toBe("function");
				expect(typeof progress.subscribe).toBe("function");
				expect(typeof progress.subscribeAll).toBe("function");
				return true;
			});

			const result = await Effect.runPromise(
				Effect.scoped(program.pipe(Effect.provide(Progress.Live))),
			);

			expect(result).toBe(true);
		});

		test("emit publishes event to subscribers", async () => {
			const program = Effect.gen(function* () {
				const progress = yield* Progress;

				// Start subscription in background
				const collectedRef: ProgressEvent[] = [];
				const fiber = yield* Effect.fork(
					progress.subscribeAll().pipe(
						Stream.take(1),
						Stream.runForEach((event) =>
							Effect.sync(() => {
								collectedRef.push(event);
							}),
						),
					),
				);

				// Small delay to ensure subscriber is ready
				yield* Effect.sleep("10 millis");

				// Emit event
				yield* progress.emit(
					createProgressEvent({
						videoId: 1,
						stage: "downloading",
						progress: 50,
						message: "Downloading...",
					}),
				);

				// Wait for subscriber to receive
				yield* Fiber.join(fiber);

				return collectedRef;
			});

			const result = await Effect.runPromise(
				Effect.scoped(program.pipe(Effect.provide(Progress.Live))),
			);

			expect(result).toHaveLength(1);
			expect(result[0]?.videoId).toBe(1);
			expect(result[0]?.stage).toBe("downloading");
		});

		test("subscribe filters events by videoId", async () => {
			const program = Effect.gen(function* () {
				const progress = yield* Progress;

				// Start subscription for video 1 only
				const collectedRef: ProgressEvent[] = [];
				const fiber = yield* Effect.fork(
					progress.subscribe(1).pipe(
						Stream.take(2),
						Stream.runForEach((event) =>
							Effect.sync(() => {
								collectedRef.push(event);
							}),
						),
					),
				);

				// Small delay to ensure subscriber is ready
				yield* Effect.sleep("10 millis");

				// Emit events for different videos
				yield* progress.emit(
					createProgressEvent({
						videoId: 1,
						stage: "downloading",
						message: "Video 1 downloading",
					}),
				);

				yield* progress.emit(
					createProgressEvent({
						videoId: 2,
						stage: "downloading",
						message: "Video 2 downloading (should be filtered)",
					}),
				);

				yield* progress.emit(
					createProgressEvent({
						videoId: 1,
						stage: "complete",
						message: "Video 1 complete",
					}),
				);

				// Wait for subscriber to receive 2 events
				yield* Fiber.join(fiber);

				return collectedRef;
			});

			const result = await Effect.runPromise(
				Effect.scoped(program.pipe(Effect.provide(Progress.Live))),
			);

			expect(result).toHaveLength(2);
			expect(result.every((e) => e.videoId === 1)).toBe(true);
			expect(result[0]?.stage).toBe("downloading");
			expect(result[1]?.stage).toBe("complete");
		});

		test("subscribeAll receives all events", async () => {
			const program = Effect.gen(function* () {
				const progress = yield* Progress;

				// Start subscription for all events
				const collectedRef: ProgressEvent[] = [];
				const fiber = yield* Effect.fork(
					progress.subscribeAll().pipe(
						Stream.take(3),
						Stream.runForEach((event) =>
							Effect.sync(() => {
								collectedRef.push(event);
							}),
						),
					),
				);

				// Small delay to ensure subscriber is ready
				yield* Effect.sleep("10 millis");

				// Emit events for different videos
				yield* progress.emit(
					createProgressEvent({
						videoId: 1,
						stage: "downloading",
						message: "Video 1",
					}),
				);

				yield* progress.emit(
					createProgressEvent({
						videoId: 2,
						stage: "transcribing",
						message: "Video 2",
					}),
				);

				yield* progress.emit(
					createProgressEvent({
						videoId: 3,
						stage: "complete",
						message: "Video 3",
					}),
				);

				// Wait for subscriber to receive
				yield* Fiber.join(fiber);

				return collectedRef;
			});

			const result = await Effect.runPromise(
				Effect.scoped(program.pipe(Effect.provide(Progress.Live))),
			);

			expect(result).toHaveLength(3);
			expect(result.map((e) => e.videoId)).toEqual([1, 2, 3]);
		});

		test("multiple subscribers receive same events", async () => {
			const program = Effect.gen(function* () {
				const progress = yield* Progress;

				// Start two subscriptions
				const collected1: ProgressEvent[] = [];
				const collected2: ProgressEvent[] = [];

				const fiber1 = yield* Effect.fork(
					progress.subscribeAll().pipe(
						Stream.take(1),
						Stream.runForEach((event) =>
							Effect.sync(() => {
								collected1.push(event);
							}),
						),
					),
				);

				const fiber2 = yield* Effect.fork(
					progress.subscribeAll().pipe(
						Stream.take(1),
						Stream.runForEach((event) =>
							Effect.sync(() => {
								collected2.push(event);
							}),
						),
					),
				);

				// Small delay to ensure subscribers are ready
				yield* Effect.sleep("10 millis");

				// Emit event
				yield* progress.emit(
					createProgressEvent({
						videoId: 1,
						stage: "downloading",
						message: "Test",
					}),
				);

				// Wait for both subscribers
				yield* Fiber.join(fiber1);
				yield* Fiber.join(fiber2);

				return { collected1, collected2 };
			});

			const result = await Effect.runPromise(
				Effect.scoped(program.pipe(Effect.provide(Progress.Live))),
			);

			expect(result.collected1).toHaveLength(1);
			expect(result.collected2).toHaveLength(1);
			expect(result.collected1[0]?.videoId).toBe(1);
			expect(result.collected2[0]?.videoId).toBe(1);
		});
	});

	describe("Progress.Test layer", () => {
		test("provides progress service", async () => {
			const program = Effect.gen(function* () {
				const progress = yield* Progress;
				expect(progress).toBeDefined();
				return true;
			});

			const result = await Effect.runPromise(
				Effect.scoped(program.pipe(Effect.provide(Progress.Test))),
			);

			expect(result).toBe(true);
		});

		test("emit and subscribe work the same as Live", async () => {
			const program = Effect.gen(function* () {
				const progress = yield* Progress;

				// Start subscription
				const collectedRef: ProgressEvent[] = [];
				const fiber = yield* Effect.fork(
					progress.subscribe(1).pipe(
						Stream.take(1),
						Stream.runForEach((event) =>
							Effect.sync(() => {
								collectedRef.push(event);
							}),
						),
					),
				);

				yield* Effect.sleep("10 millis");

				yield* progress.emit(
					createProgressEvent({
						videoId: 1,
						stage: "downloading",
						message: "Test",
					}),
				);

				yield* Fiber.join(fiber);

				return collectedRef;
			});

			const result = await Effect.runPromise(
				Effect.scoped(program.pipe(Effect.provide(Progress.Test))),
			);

			expect(result).toHaveLength(1);
			expect(result[0]?.videoId).toBe(1);
		});
	});

	describe("makeProgressTestLayer factory", () => {
		test("collects emitted events for assertions", async () => {
			const { layer, getEvents } = makeProgressTestLayer();

			const program = Effect.gen(function* () {
				const progress = yield* Progress;

				yield* progress.emit(
					createProgressEvent({
						videoId: 1,
						stage: "pending",
						message: "Starting",
					}),
				);

				yield* progress.emit(
					createProgressEvent({
						videoId: 1,
						stage: "downloading",
						progress: 50,
						message: "Downloading",
					}),
				);

				yield* progress.emit(
					createProgressEvent({
						videoId: 1,
						stage: "complete",
						message: "Done",
					}),
				);

				return yield* getEvents;
			});

			const events = await Effect.runPromise(
				Effect.scoped(program.pipe(Effect.provide(layer))),
			);

			expect(events).toHaveLength(3);
			expect(events[0]?.stage).toBe("pending");
			expect(events[1]?.stage).toBe("downloading");
			expect(events[1]?.progress).toBe(50);
			expect(events[2]?.stage).toBe("complete");
		});

		test("events are isolated between test layers", async () => {
			const { layer: layer1, getEvents: getEvents1 } = makeProgressTestLayer();
			const { layer: layer2, getEvents: getEvents2 } = makeProgressTestLayer();

			// Emit to layer1
			const program1 = Effect.gen(function* () {
				const progress = yield* Progress;
				yield* progress.emit(
					createProgressEvent({
						videoId: 1,
						stage: "downloading",
						message: "Layer 1",
					}),
				);
				return yield* getEvents1;
			});

			// Emit to layer2
			const program2 = Effect.gen(function* () {
				const progress = yield* Progress;
				yield* progress.emit(
					createProgressEvent({
						videoId: 2,
						stage: "transcribing",
						message: "Layer 2",
					}),
				);
				return yield* getEvents2;
			});

			const [events1, events2] = await Promise.all([
				Effect.runPromise(Effect.scoped(program1.pipe(Effect.provide(layer1)))),
				Effect.runPromise(Effect.scoped(program2.pipe(Effect.provide(layer2)))),
			]);

			expect(events1).toHaveLength(1);
			expect(events1[0]?.videoId).toBe(1);

			expect(events2).toHaveLength(1);
			expect(events2[0]?.videoId).toBe(2);
		});
	});

	describe("makeProgressMockLayer factory", () => {
		test("uses default no-op implementations", async () => {
			const layer = makeProgressMockLayer({});

			const program = Effect.gen(function* () {
				const progress = yield* Progress;

				// Emit should work without error
				yield* progress.emit(
					createProgressEvent({
						videoId: 1,
						stage: "downloading",
						message: "Test",
					}),
				);

				// Subscribe should return empty stream
				const events = yield* progress.subscribeAll().pipe(Stream.runCollect);

				return Chunk.toReadonlyArray(events);
			});

			const result = await Effect.runPromise(
				Effect.scoped(program.pipe(Effect.provide(layer))),
			);

			expect(result).toHaveLength(0);
		});

		test("allows custom emit implementation", async () => {
			const emitted: ProgressEvent[] = [];

			const layer = makeProgressMockLayer({
				emit: (event) =>
					Effect.sync(() => {
						emitted.push(event);
					}),
			});

			const program = Effect.gen(function* () {
				const progress = yield* Progress;

				yield* progress.emit(
					createProgressEvent({
						videoId: 1,
						stage: "downloading",
						message: "Test",
					}),
				);

				return true;
			});

			await Effect.runPromise(
				Effect.scoped(program.pipe(Effect.provide(layer))),
			);

			expect(emitted).toHaveLength(1);
			expect(emitted[0]?.videoId).toBe(1);
		});

		test("allows custom subscribe implementation", async () => {
			const mockEvents: ProgressEvent[] = [
				createProgressEvent({
					videoId: 1,
					stage: "downloading",
					message: "Mock event 1",
				}),
				createProgressEvent({
					videoId: 1,
					stage: "complete",
					message: "Mock event 2",
				}),
			];

			const layer = makeProgressMockLayer({
				subscribe: (videoId) =>
					Stream.fromIterable(mockEvents.filter((e) => e.videoId === videoId)),
			});

			const program = Effect.gen(function* () {
				const progress = yield* Progress;

				const events = yield* progress.subscribe(1).pipe(Stream.runCollect);

				return Chunk.toReadonlyArray(events);
			});

			const result = await Effect.runPromise(
				Effect.scoped(program.pipe(Effect.provide(layer))),
			);

			expect(result).toHaveLength(2);
			expect(result[0]?.stage).toBe("downloading");
			expect(result[1]?.stage).toBe("complete");
		});
	});

	describe("processing stage types", () => {
		test("supports all processing stages", async () => {
			const stages = [
				"pending",
				"downloading",
				"extracting",
				"transcribing",
				"complete",
				"error",
			] as const;

			const { layer, getEvents } = makeProgressTestLayer();

			const program = Effect.gen(function* () {
				const progress = yield* Progress;

				for (const stage of stages) {
					yield* progress.emit(
						createProgressEvent({
							videoId: 1,
							stage,
							message: `Stage: ${stage}`,
						}),
					);
				}

				return yield* getEvents;
			});

			const events = await Effect.runPromise(
				Effect.scoped(program.pipe(Effect.provide(layer))),
			);

			expect(events).toHaveLength(stages.length);
			expect(events.map((e) => e.stage)).toEqual([...stages]);
		});
	});
});
