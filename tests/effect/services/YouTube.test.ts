import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Effect, Exit, Cause } from "effect";
import { YouTube, makeYouTubeTestLayer } from "../../../src/effect/services/YouTube";
import {
	InvalidYouTubeUrlError,
	DownloadFailedError,
} from "../../../src/effect/errors";
import type { VideoMetadata } from "../../../src/effect/services/types";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

// =============================================================================
// Test Setup
// =============================================================================

const TEST_DOWNLOADS_DIR = "data/test-downloads-effect";

beforeAll(() => {
	// Clean up any existing test downloads
	if (existsSync(TEST_DOWNLOADS_DIR)) {
		rmSync(TEST_DOWNLOADS_DIR, { recursive: true });
	}
	mkdirSync(TEST_DOWNLOADS_DIR, { recursive: true });
});

afterAll(() => {
	// Clean up test downloads
	if (existsSync(TEST_DOWNLOADS_DIR)) {
		rmSync(TEST_DOWNLOADS_DIR, { recursive: true });
	}
});

// =============================================================================
// Test Layer
// =============================================================================

describe("YouTube Effect Service", () => {
	// =========================================================================
	// URL Validation (pure functions, synchronous)
	// =========================================================================
	describe("isValidUrl", () => {
		it("validates standard youtube.com/watch URLs", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return youtube.isValidUrl(
					"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
				);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(YouTube.Test)),
			);
			expect(result).toBe(true);
		});

		it("validates youtu.be short URLs", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return youtube.isValidUrl("https://youtu.be/dQw4w9WgXcQ");
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(YouTube.Test)),
			);
			expect(result).toBe(true);
		});

		it("validates youtube.com/embed URLs", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return youtube.isValidUrl(
					"https://www.youtube.com/embed/dQw4w9WgXcQ",
				);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(YouTube.Test)),
			);
			expect(result).toBe(true);
		});

		it("validates youtube.com/shorts URLs", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return youtube.isValidUrl(
					"https://www.youtube.com/shorts/dQw4w9WgXcQ",
				);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(YouTube.Test)),
			);
			expect(result).toBe(true);
		});

		it("validates youtube.com/live URLs", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return youtube.isValidUrl(
					"https://www.youtube.com/live/dQw4w9WgXcQ",
				);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(YouTube.Test)),
			);
			expect(result).toBe(true);
		});

		it("rejects non-YouTube URLs", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return youtube.isValidUrl("https://vimeo.com/123456");
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(YouTube.Test)),
			);
			expect(result).toBe(false);
		});

		it("rejects URLs with invalid video IDs", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				// Video ID must be exactly 11 characters
				return youtube.isValidUrl(
					"https://www.youtube.com/watch?v=tooshort",
				);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(YouTube.Test)),
			);
			expect(result).toBe(false);
		});

		it("rejects random strings", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return youtube.isValidUrl("not-a-url-at-all");
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(YouTube.Test)),
			);
			expect(result).toBe(false);
		});
	});

	// =========================================================================
	// Video ID Extraction (pure functions, synchronous)
	// =========================================================================
	describe("extractVideoId", () => {
		it("extracts video ID from watch URL", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return youtube.extractVideoId(
					"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
				);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(YouTube.Test)),
			);
			expect(result).toBe("dQw4w9WgXcQ");
		});

		it("extracts video ID from short URL", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return youtube.extractVideoId("https://youtu.be/dQw4w9WgXcQ");
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(YouTube.Test)),
			);
			expect(result).toBe("dQw4w9WgXcQ");
		});

		it("extracts video ID from watch URL with additional params", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return youtube.extractVideoId(
					"https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120&list=PLxxx",
				);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(YouTube.Test)),
			);
			expect(result).toBe("dQw4w9WgXcQ");
		});

		it("returns null for invalid URL", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return youtube.extractVideoId("not-a-valid-url");
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(YouTube.Test)),
			);
			expect(result).toBeNull();
		});

		it("returns null for non-YouTube URL", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return youtube.extractVideoId("https://vimeo.com/123456");
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(YouTube.Test)),
			);
			expect(result).toBeNull();
		});
	});

	// =========================================================================
	// Test Layer Behavior
	// =========================================================================
	describe("Test layer", () => {
		it("provides working URL validation", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return {
					valid: youtube.isValidUrl(
						"https://youtube.com/watch?v=dQw4w9WgXcQ",
					),
					invalid: youtube.isValidUrl("not-a-url"),
				};
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(YouTube.Test)),
			);
			expect(result.valid).toBe(true);
			expect(result.invalid).toBe(false);
		});

		it("getMetadata fails with InvalidYouTubeUrlError for invalid URLs", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return yield* youtube.getMetadata("not-a-valid-url");
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(YouTube.Test)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = Cause.failureOption(exit.cause);
				expect(error._tag).toBe("Some");
				if (error._tag === "Some") {
					expect(error.value).toBeInstanceOf(InvalidYouTubeUrlError);
					expect((error.value as InvalidYouTubeUrlError).url).toBe(
						"not-a-valid-url",
					);
				}
			}
		});

		it("getMetadata fails with DownloadFailedError for valid URLs (mock not implemented)", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return yield* youtube.getMetadata(
					"https://youtube.com/watch?v=dQw4w9WgXcQ",
				);
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(YouTube.Test)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = Cause.failureOption(exit.cause);
				expect(error._tag).toBe("Some");
				if (error._tag === "Some") {
					expect(error.value).toBeInstanceOf(DownloadFailedError);
					expect((error.value as DownloadFailedError).reason).toContain(
						"Mock",
					);
				}
			}
		});

		it("downloadAudio fails with InvalidYouTubeUrlError for invalid URLs", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return yield* youtube.downloadAudio("invalid-url");
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(YouTube.Test)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = Cause.failureOption(exit.cause);
				expect(error._tag).toBe("Some");
				if (error._tag === "Some") {
					expect(error.value).toBeInstanceOf(InvalidYouTubeUrlError);
				}
			}
		});

		it("downloadAudio fails with DownloadFailedError for valid URLs (mock not implemented)", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return yield* youtube.downloadAudio(
					"https://youtube.com/watch?v=dQw4w9WgXcQ",
				);
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(YouTube.Test)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = Cause.failureOption(exit.cause);
				expect(error._tag).toBe("Some");
				if (error._tag === "Some") {
					expect(error.value).toBeInstanceOf(DownloadFailedError);
					expect((error.value as DownloadFailedError).reason).toContain(
						"Mock",
					);
				}
			}
		});
	});

	// =========================================================================
	// makeYouTubeTestLayer Factory
	// =========================================================================
	describe("makeYouTubeTestLayer", () => {
		it("allows mocking getMetadata with custom implementation", async () => {
			const mockMetadata: VideoMetadata = {
				id: "test123abc",
				title: "Test Video Title",
				duration: 120,
				thumbnailUrl: "https://example.com/thumb.jpg",
				channelName: "Test Channel",
				uploadDate: "2024-01-15",
			};

			const testLayer = makeYouTubeTestLayer({
				getMetadata: (url) => {
					if (url.includes("test123abc")) {
						return Effect.succeed(mockMetadata);
					}
					return Effect.fail(
						new DownloadFailedError({ youtubeUrl: url, reason: "Not found" }),
					);
				},
			});

			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return yield* youtube.getMetadata(
					"https://youtube.com/watch?v=test123abc",
				);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result).toEqual(mockMetadata);
		});

		it("allows mocking downloadAudio with custom implementation", async () => {
			const testLayer = makeYouTubeTestLayer({
				downloadAudio: (_url, outputPath) =>
					Effect.succeed(outputPath ?? "/tmp/mock-audio.m4a"),
			});

			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return yield* youtube.downloadAudio(
					"https://youtube.com/watch?v=abc12345678",
					"/custom/path/audio.m4a",
				);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result).toBe("/custom/path/audio.m4a");
		});

		it("allows mocking both getMetadata and downloadAudio", async () => {
			const testLayer = makeYouTubeTestLayer({
				getMetadata: () =>
					Effect.succeed({
						id: "mock-id",
						title: "Mock Title",
						duration: 60,
						thumbnailUrl: "https://mock.com/thumb.jpg",
						channelName: "Mock Channel",
						uploadDate: "2024-06-01",
					}),
				downloadAudio: () => Effect.succeed("/mock/path.m4a"),
			});

			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				const metadata = yield* youtube.getMetadata(
					"https://youtube.com/watch?v=dQw4w9WgXcQ",
				);
				const audioPath = yield* youtube.downloadAudio(
					"https://youtube.com/watch?v=dQw4w9WgXcQ",
				);
				return { metadata, audioPath };
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result.metadata.id).toBe("mock-id");
			expect(result.metadata.title).toBe("Mock Title");
			expect(result.audioPath).toBe("/mock/path.m4a");
		});

		it("preserves URL validation when not overridden", async () => {
			const testLayer = makeYouTubeTestLayer({
				getMetadata: () =>
					Effect.succeed({
						id: "id",
						title: "Title",
						duration: 60,
						thumbnailUrl: "url",
						channelName: "channel",
						uploadDate: "2024-01-01",
					}),
			});

			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return {
					valid: youtube.isValidUrl(
						"https://youtube.com/watch?v=dQw4w9WgXcQ",
					),
					invalid: youtube.isValidUrl("not-valid"),
					extractedId: youtube.extractVideoId(
						"https://youtu.be/dQw4w9WgXcQ",
					),
				};
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(result.valid).toBe(true);
			expect(result.invalid).toBe(false);
			expect(result.extractedId).toBe("dQw4w9WgXcQ");
		});

		it("allows mocking to simulate errors", async () => {
			const testLayer = makeYouTubeTestLayer({
				getMetadata: (url) =>
					Effect.fail(
						new DownloadFailedError({
							youtubeUrl: url,
							reason: "Network timeout",
						}),
					),
			});

			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return yield* youtube.getMetadata(
					"https://youtube.com/watch?v=dQw4w9WgXcQ",
				);
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(testLayer)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = Cause.failureOption(exit.cause);
				expect(error._tag).toBe("Some");
				if (error._tag === "Some") {
					expect(error.value).toBeInstanceOf(DownloadFailedError);
					expect((error.value as DownloadFailedError).reason).toBe(
						"Network timeout",
					);
				}
			}
		});
	});

	// =========================================================================
	// Live Layer Integration Tests (require network and yt-dlp)
	// =========================================================================
	describe("Live layer integration", () => {
		// Big Buck Bunny trailer - a reliable public domain video
		const TEST_URL = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
		const TEST_VIDEO_ID = "aqz-KE-bpKQ";

		it.skip("getMetadata fetches real video metadata", async () => {
			// Skip: Requires network and yt-dlp installed
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return yield* youtube.getMetadata(TEST_URL);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(YouTube.Live)),
			);

			expect(result.id).toBe(TEST_VIDEO_ID);
			expect(result.title).toBeTruthy();
			expect(result.duration).toBeGreaterThan(0);
			expect(result.thumbnailUrl).toContain("http");
			expect(result.channelName).toBeTruthy();
		}, 60000);

		it.skip("downloadAudio downloads audio from real video", async () => {
			// Skip: Requires network and yt-dlp installed
			const outputPath = join(TEST_DOWNLOADS_DIR, `${TEST_VIDEO_ID}.m4a`);

			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return yield* youtube.downloadAudio(TEST_URL, outputPath);
			});

			const result = await Effect.runPromise(
				program.pipe(Effect.provide(YouTube.Live)),
			);

			expect(result).toBe(outputPath);
			expect(existsSync(outputPath)).toBe(true);
		}, 120000);

		it("Live layer returns InvalidYouTubeUrlError for invalid URLs", async () => {
			const program = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return yield* youtube.getMetadata("not-a-youtube-url");
			});

			const exit = await Effect.runPromiseExit(
				program.pipe(Effect.provide(YouTube.Live)),
			);

			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const error = Cause.failureOption(exit.cause);
				expect(error._tag).toBe("Some");
				if (error._tag === "Some") {
					expect(error.value).toBeInstanceOf(InvalidYouTubeUrlError);
				}
			}
		});
	});

	// =========================================================================
	// Service isolation between layers
	// =========================================================================
	describe("layer isolation", () => {
		it("Test and custom layers provide independent services", async () => {
			const customLayer = makeYouTubeTestLayer({
				getMetadata: () =>
					Effect.succeed({
						id: "custom-id",
						title: "Custom",
						duration: 1,
						thumbnailUrl: "custom",
						channelName: "custom",
						uploadDate: "2024-01-01",
					}),
			});

			// Test layer should fail with mock error
			const testProgram = Effect.gen(function* () {
				const youtube = yield* YouTube;
				return yield* youtube.getMetadata(
					"https://youtube.com/watch?v=dQw4w9WgXcQ",
				);
			});

			const testExit = await Effect.runPromiseExit(
				testProgram.pipe(Effect.provide(YouTube.Test)),
			);
			expect(Exit.isFailure(testExit)).toBe(true);

			// Custom layer should succeed with mock data
			const customResult = await Effect.runPromise(
				testProgram.pipe(Effect.provide(customLayer)),
			);
			expect(customResult.id).toBe("custom-id");
		});
	});
});
