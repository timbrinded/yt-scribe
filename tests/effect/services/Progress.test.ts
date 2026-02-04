import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
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
		it("creates event with current timestamp", () => {
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

		it("creates event without optional fields", () => {
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

		it("creates error event", () => {
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
		it.scoped("provides progress service", () =>
			Effect.gen(function* () {
				const progress = yield* Progress;
				expect(progress).toBeDefined();
				expect(typeof progress.emit).toBe("function");
				expect(typeof progress.subscribe).toBe("function");
				expect(typeof progress.subscribeAll).toBe("function");
			}).pipe(Effect.provide(Progress.Live)),
		);

		it.live("emit publishes event to subscribers", () =>
			Effect.scoped(
				Effect.gen(function* () {
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

					expect(collectedRef).toHaveLength(1);
					expect(collectedRef[0]?.videoId).toBe(1);
					expect(collectedRef[0]?.stage).toBe("downloading");
				}).pipe(Effect.provide(Progress.Live)),
			),
		);

		it.live("subscribe filters events by videoId", () =>
			Effect.scoped(
				Effect.gen(function* () {
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

					expect(collectedRef).toHaveLength(2);
					expect(collectedRef.every((e) => e.videoId === 1)).toBe(true);
					expect(collectedRef[0]?.stage).toBe("downloading");
					expect(collectedRef[1]?.stage).toBe("complete");
				}).pipe(Effect.provide(Progress.Live)),
			),
		);

		it.live("subscribeAll receives all events", () =>
			Effect.scoped(
				Effect.gen(function* () {
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

					expect(collectedRef).toHaveLength(3);
					expect(collectedRef.map((e) => e.videoId)).toEqual([1, 2, 3]);
				}).pipe(Effect.provide(Progress.Live)),
			),
		);

		it.live("multiple subscribers receive same events", () =>
			Effect.scoped(
				Effect.gen(function* () {
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

					expect(collected1).toHaveLength(1);
					expect(collected2).toHaveLength(1);
					expect(collected1[0]?.videoId).toBe(1);
					expect(collected2[0]?.videoId).toBe(1);
				}).pipe(Effect.provide(Progress.Live)),
			),
		);
	});

	describe("Progress.Test layer", () => {
		it.scoped("provides progress service", () =>
			Effect.gen(function* () {
				const progress = yield* Progress;
				expect(progress).toBeDefined();
			}).pipe(Effect.provide(Progress.Test)),
		);

		it.live("emit and subscribe work the same as Live", () =>
			Effect.scoped(
				Effect.gen(function* () {
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

					expect(collectedRef).toHaveLength(1);
					expect(collectedRef[0]?.videoId).toBe(1);
				}).pipe(Effect.provide(Progress.Test)),
			),
		);
	});

	describe("makeProgressTestLayer factory", () => {
		it.scoped("collects emitted events for assertions", () =>
			Effect.gen(function* () {
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

				const events = yield* program.pipe(Effect.provide(layer));

				expect(events).toHaveLength(3);
				expect(events[0]?.stage).toBe("pending");
				expect(events[1]?.stage).toBe("downloading");
				expect(events[1]?.progress).toBe(50);
				expect(events[2]?.stage).toBe("complete");
			}),
		);

		it.effect("events are isolated between test layers", () =>
			Effect.gen(function* () {
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

				const events1 = yield* Effect.scoped(program1.pipe(Effect.provide(layer1)));
				const events2 = yield* Effect.scoped(program2.pipe(Effect.provide(layer2)));

				expect(events1).toHaveLength(1);
				expect(events1[0]?.videoId).toBe(1);

				expect(events2).toHaveLength(1);
				expect(events2[0]?.videoId).toBe(2);
			}),
		);
	});

	describe("makeProgressMockLayer factory", () => {
		it.scoped("uses default no-op implementations", () =>
			Effect.gen(function* () {
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

				const result = yield* program.pipe(Effect.provide(layer));

				expect(result).toHaveLength(0);
			}),
		);

		it.scoped("allows custom emit implementation", () =>
			Effect.gen(function* () {
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
				});

				yield* program.pipe(Effect.provide(layer));

				expect(emitted).toHaveLength(1);
				expect(emitted[0]?.videoId).toBe(1);
			}),
		);

		it.scoped("allows custom subscribe implementation", () =>
			Effect.gen(function* () {
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

				const result = yield* program.pipe(Effect.provide(layer));

				expect(result).toHaveLength(2);
				expect(result[0]?.stage).toBe("downloading");
				expect(result[1]?.stage).toBe("complete");
			}),
		);
	});

	describe("processing stage types", () => {
		it.scoped("supports all processing stages", () =>
			Effect.gen(function* () {
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

				const events = yield* program.pipe(Effect.provide(layer));

				expect(events).toHaveLength(stages.length);
				expect(events.map((e) => e.stage)).toEqual([...stages]);
			}),
		);
	});
});
