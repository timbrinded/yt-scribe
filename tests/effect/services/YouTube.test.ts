import { describe, expect, beforeAll, afterAll } from "vitest";
import { it } from "@effect/vitest";
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
		it.effect("validates standard youtube.com/watch URLs", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				const result = youtube.isValidUrl(
					"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
				);
				expect(result).toBe(true);
			}).pipe(Effect.provide(YouTube.Test)),
		);

		it.effect("validates youtu.be short URLs", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				const result = youtube.isValidUrl("https://youtu.be/dQw4w9WgXcQ");
				expect(result).toBe(true);
			}).pipe(Effect.provide(YouTube.Test)),
		);

		it.effect("validates youtube.com/embed URLs", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				const result = youtube.isValidUrl(
					"https://www.youtube.com/embed/dQw4w9WgXcQ",
				);
				expect(result).toBe(true);
			}).pipe(Effect.provide(YouTube.Test)),
		);

		it.effect("validates youtube.com/shorts URLs", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				const result = youtube.isValidUrl(
					"https://www.youtube.com/shorts/dQw4w9WgXcQ",
				);
				expect(result).toBe(true);
			}).pipe(Effect.provide(YouTube.Test)),
		);

		it.effect("validates youtube.com/live URLs", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				const result = youtube.isValidUrl(
					"https://www.youtube.com/live/dQw4w9WgXcQ",
				);
				expect(result).toBe(true);
			}).pipe(Effect.provide(YouTube.Test)),
		);

		it.effect("rejects non-YouTube URLs", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				const result = youtube.isValidUrl("https://vimeo.com/123456");
				expect(result).toBe(false);
			}).pipe(Effect.provide(YouTube.Test)),
		);

		it.effect("rejects URLs with invalid video IDs", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				// Video ID must be exactly 11 characters
				const result = youtube.isValidUrl(
					"https://www.youtube.com/watch?v=tooshort",
				);
				expect(result).toBe(false);
			}).pipe(Effect.provide(YouTube.Test)),
		);

		it.effect("rejects random strings", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				const result = youtube.isValidUrl("not-a-url-at-all");
				expect(result).toBe(false);
			}).pipe(Effect.provide(YouTube.Test)),
		);
	});

	// =========================================================================
	// Video ID Extraction (pure functions, synchronous)
	// =========================================================================
	describe("extractVideoId", () => {
		it.effect("extracts video ID from watch URL", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				const result = youtube.extractVideoId(
					"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
				);
				expect(result).toBe("dQw4w9WgXcQ");
			}).pipe(Effect.provide(YouTube.Test)),
		);

		it.effect("extracts video ID from short URL", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				const result = youtube.extractVideoId("https://youtu.be/dQw4w9WgXcQ");
				expect(result).toBe("dQw4w9WgXcQ");
			}).pipe(Effect.provide(YouTube.Test)),
		);

		it.effect("extracts video ID from watch URL with additional params", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				const result = youtube.extractVideoId(
					"https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120&list=PLxxx",
				);
				expect(result).toBe("dQw4w9WgXcQ");
			}).pipe(Effect.provide(YouTube.Test)),
		);

		it.effect("returns null for invalid URL", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				const result = youtube.extractVideoId("not-a-valid-url");
				expect(result).toBeNull();
			}).pipe(Effect.provide(YouTube.Test)),
		);

		it.effect("returns null for non-YouTube URL", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				const result = youtube.extractVideoId("https://vimeo.com/123456");
				expect(result).toBeNull();
			}).pipe(Effect.provide(YouTube.Test)),
		);
	});

	// =========================================================================
	// Test Layer Behavior
	// =========================================================================
	describe("Test layer", () => {
		it.effect("provides working URL validation", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				const result = {
					valid: youtube.isValidUrl(
						"https://youtube.com/watch?v=dQw4w9WgXcQ",
					),
					invalid: youtube.isValidUrl("not-a-url"),
				};
				expect(result.valid).toBe(true);
				expect(result.invalid).toBe(false);
			}).pipe(Effect.provide(YouTube.Test)),
		);

		it.effect("getMetadata fails with InvalidYouTubeUrlError for invalid URLs", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				const exit = yield* youtube.getMetadata("not-a-valid-url").pipe(Effect.exit);

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
			}).pipe(Effect.provide(YouTube.Test)),
		);

		it.effect("getMetadata fails with DownloadFailedError for valid URLs (mock not implemented)", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				const exit = yield* youtube.getMetadata(
					"https://youtube.com/watch?v=dQw4w9WgXcQ",
				).pipe(Effect.exit);

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
			}).pipe(Effect.provide(YouTube.Test)),
		);

		it.effect("downloadAudio fails with InvalidYouTubeUrlError for invalid URLs", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				const exit = yield* youtube.downloadAudio("invalid-url").pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const error = Cause.failureOption(exit.cause);
					expect(error._tag).toBe("Some");
					if (error._tag === "Some") {
						expect(error.value).toBeInstanceOf(InvalidYouTubeUrlError);
					}
				}
			}).pipe(Effect.provide(YouTube.Test)),
		);

		it.effect("downloadAudio fails with DownloadFailedError for valid URLs (mock not implemented)", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				const exit = yield* youtube.downloadAudio(
					"https://youtube.com/watch?v=dQw4w9WgXcQ",
				).pipe(Effect.exit);

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
			}).pipe(Effect.provide(YouTube.Test)),
		);
	});

	// =========================================================================
	// makeYouTubeTestLayer Factory
	// =========================================================================
	describe("makeYouTubeTestLayer", () => {
		it.effect("allows mocking getMetadata with custom implementation", () =>
			Effect.gen(function* () {
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

				const youtube = yield* Effect.provide(YouTube, testLayer);
				const result = yield* youtube.getMetadata(
					"https://youtube.com/watch?v=test123abc",
				);

				expect(result).toEqual(mockMetadata);
			}),
		);

		it.effect("allows mocking downloadAudio with custom implementation", () =>
			Effect.gen(function* () {
				const testLayer = makeYouTubeTestLayer({
					downloadAudio: (_url, outputPath) =>
						Effect.succeed(outputPath ?? "/tmp/mock-audio.m4a"),
				});

				const youtube = yield* Effect.provide(YouTube, testLayer);
				const result = yield* youtube.downloadAudio(
					"https://youtube.com/watch?v=abc12345678",
					"/custom/path/audio.m4a",
				);

				expect(result).toBe("/custom/path/audio.m4a");
			}),
		);

		it.effect("allows mocking both getMetadata and downloadAudio", () =>
			Effect.gen(function* () {
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

				const youtube = yield* Effect.provide(YouTube, testLayer);
				const metadata = yield* youtube.getMetadata(
					"https://youtube.com/watch?v=dQw4w9WgXcQ",
				);
				const audioPath = yield* youtube.downloadAudio(
					"https://youtube.com/watch?v=dQw4w9WgXcQ",
				);

				expect(metadata.id).toBe("mock-id");
				expect(metadata.title).toBe("Mock Title");
				expect(audioPath).toBe("/mock/path.m4a");
			}),
		);

		it.effect("preserves URL validation when not overridden", () =>
			Effect.gen(function* () {
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

				const youtube = yield* Effect.provide(YouTube, testLayer);
				const result = {
					valid: youtube.isValidUrl(
						"https://youtube.com/watch?v=dQw4w9WgXcQ",
					),
					invalid: youtube.isValidUrl("not-valid"),
					extractedId: youtube.extractVideoId(
						"https://youtu.be/dQw4w9WgXcQ",
					),
				};

				expect(result.valid).toBe(true);
				expect(result.invalid).toBe(false);
				expect(result.extractedId).toBe("dQw4w9WgXcQ");
			}),
		);

		it.effect("allows mocking to simulate errors", () =>
			Effect.gen(function* () {
				const testLayer = makeYouTubeTestLayer({
					getMetadata: (url) =>
						Effect.fail(
							new DownloadFailedError({
								youtubeUrl: url,
								reason: "Network timeout",
							}),
						),
				});

				const youtube = yield* Effect.provide(YouTube, testLayer);
				const exit = yield* youtube.getMetadata(
					"https://youtube.com/watch?v=dQw4w9WgXcQ",
				).pipe(Effect.exit);

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
			}),
		);
	});

	// =========================================================================
	// Live Layer Integration Tests (require network and yt-dlp)
	// =========================================================================
	describe("Live layer integration", () => {
		// Big Buck Bunny trailer - a reliable public domain video
		const TEST_URL = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
		const TEST_VIDEO_ID = "aqz-KE-bpKQ";

		it.skip("getMetadata fetches real video metadata", { timeout: 60000 }, () =>
			Effect.gen(function* () {
				// Skip: Requires network and yt-dlp installed
				const youtube = yield* YouTube;
				const result = yield* youtube.getMetadata(TEST_URL);

				expect(result.id).toBe(TEST_VIDEO_ID);
				expect(result.title).toBeTruthy();
				expect(result.duration).toBeGreaterThan(0);
				expect(result.thumbnailUrl).toContain("http");
				expect(result.channelName).toBeTruthy();
			}).pipe(Effect.provide(YouTube.Live)),
		);

		it.skip("downloadAudio downloads audio from real video", { timeout: 120000 }, () =>
			Effect.gen(function* () {
				// Skip: Requires network and yt-dlp installed
				const outputPath = join(TEST_DOWNLOADS_DIR, `${TEST_VIDEO_ID}.m4a`);

				const youtube = yield* YouTube;
				const result = yield* youtube.downloadAudio(TEST_URL, outputPath);

				expect(result).toBe(outputPath);
				expect(existsSync(outputPath)).toBe(true);
			}).pipe(Effect.provide(YouTube.Live)),
		);

		it.effect("Live layer returns InvalidYouTubeUrlError for invalid URLs", () =>
			Effect.gen(function* () {
				const youtube = yield* YouTube;
				const exit = yield* youtube.getMetadata("not-a-youtube-url").pipe(Effect.exit);

				expect(Exit.isFailure(exit)).toBe(true);
				if (Exit.isFailure(exit)) {
					const error = Cause.failureOption(exit.cause);
					expect(error._tag).toBe("Some");
					if (error._tag === "Some") {
						expect(error.value).toBeInstanceOf(InvalidYouTubeUrlError);
					}
				}
			}).pipe(Effect.provide(YouTube.Live)),
		);
	});

	// =========================================================================
	// Service isolation between layers
	// =========================================================================
	describe("layer isolation", () => {
		it.effect("Test and custom layers provide independent services", () =>
			Effect.gen(function* () {
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

				const testExit = yield* testProgram.pipe(
					Effect.provide(YouTube.Test),
					Effect.exit,
				);
				expect(Exit.isFailure(testExit)).toBe(true);

				// Custom layer should succeed with mock data
				const customResult = yield* testProgram.pipe(Effect.provide(customLayer));
				expect(customResult.id).toBe("custom-id");
			}),
		);
	});
});
