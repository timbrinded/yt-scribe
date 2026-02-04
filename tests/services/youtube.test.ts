import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
	downloadAudio,
	extractVideoId,
	getVideoMetadata,
	isValidYouTubeUrl,
} from "../../src/services/youtube";

describe("YouTube URL Validation", () => {
	describe("isValidYouTubeUrl", () => {
		test("accepts standard youtube.com/watch URL", () => {
			expect(
				isValidYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
			).toBe(true);
		});

		test("accepts youtube.com/watch URL without www", () => {
			expect(isValidYouTubeUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
				true,
			);
		});

		test("accepts http URLs", () => {
			expect(
				isValidYouTubeUrl("http://www.youtube.com/watch?v=dQw4w9WgXcQ"),
			).toBe(true);
		});

		test("accepts URLs without protocol", () => {
			expect(isValidYouTubeUrl("www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
				true,
			);
			expect(isValidYouTubeUrl("youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
		});

		test("accepts youtu.be short URLs", () => {
			expect(isValidYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
			expect(isValidYouTubeUrl("http://youtu.be/dQw4w9WgXcQ")).toBe(true);
			expect(isValidYouTubeUrl("youtu.be/dQw4w9WgXcQ")).toBe(true);
		});

		test("accepts embed URLs", () => {
			expect(
				isValidYouTubeUrl("https://www.youtube.com/embed/dQw4w9WgXcQ"),
			).toBe(true);
			expect(isValidYouTubeUrl("https://youtube.com/embed/dQw4w9WgXcQ")).toBe(
				true,
			);
		});

		test("accepts old v/ URLs", () => {
			expect(isValidYouTubeUrl("https://www.youtube.com/v/dQw4w9WgXcQ")).toBe(
				true,
			);
		});

		test("accepts shorts URLs", () => {
			expect(
				isValidYouTubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
			).toBe(true);
			expect(isValidYouTubeUrl("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe(
				true,
			);
		});

		test("accepts live URLs", () => {
			expect(
				isValidYouTubeUrl("https://www.youtube.com/live/dQw4w9WgXcQ"),
			).toBe(true);
		});

		test("accepts URLs with additional query parameters", () => {
			expect(
				isValidYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123"),
			).toBe(true);
			expect(
				isValidYouTubeUrl(
					"https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxx",
				),
			).toBe(true);
			expect(
				isValidYouTubeUrl(
					"https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123&list=PLxxx",
				),
			).toBe(true);
		});

		test("accepts URLs with query param before v", () => {
			expect(
				isValidYouTubeUrl(
					"https://www.youtube.com/watch?list=PLxxx&v=dQw4w9WgXcQ",
				),
			).toBe(true);
		});

		test("rejects invalid URLs", () => {
			expect(isValidYouTubeUrl("https://google.com")).toBe(false);
			expect(isValidYouTubeUrl("https://vimeo.com/123456")).toBe(false);
			expect(isValidYouTubeUrl("not a url")).toBe(false);
			expect(isValidYouTubeUrl("")).toBe(false);
		});

		test("rejects YouTube URLs without video ID", () => {
			expect(isValidYouTubeUrl("https://www.youtube.com")).toBe(false);
			expect(isValidYouTubeUrl("https://www.youtube.com/watch")).toBe(false);
			expect(isValidYouTubeUrl("https://www.youtube.com/channel/UCxxx")).toBe(
				false,
			);
		});

		test("rejects URLs with invalid video ID format", () => {
			// Video IDs must be exactly 11 characters
			expect(isValidYouTubeUrl("https://youtu.be/short")).toBe(false);
			expect(isValidYouTubeUrl("https://youtu.be/toolongvideoid123")).toBe(
				false,
			);
		});

		test("accepts video IDs with hyphens and underscores", () => {
			expect(isValidYouTubeUrl("https://youtu.be/abc-_123DEF")).toBe(true);
			expect(isValidYouTubeUrl("https://youtu.be/___________")).toBe(true);
			expect(isValidYouTubeUrl("https://youtu.be/-----------")).toBe(true);
		});
	});

	describe("extractVideoId", () => {
		test("extracts ID from standard watch URL", () => {
			expect(
				extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
			).toBe("dQw4w9WgXcQ");
		});

		test("extracts ID from youtu.be URL", () => {
			expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe(
				"dQw4w9WgXcQ",
			);
		});

		test("extracts ID from embed URL", () => {
			expect(extractVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
				"dQw4w9WgXcQ",
			);
		});

		test("extracts ID from shorts URL", () => {
			expect(extractVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
				"dQw4w9WgXcQ",
			);
		});

		test("extracts ID from URL with extra query params", () => {
			expect(
				extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123"),
			).toBe("dQw4w9WgXcQ");
			expect(
				extractVideoId(
					"https://www.youtube.com/watch?list=PLxxx&v=dQw4w9WgXcQ&t=60",
				),
			).toBe("dQw4w9WgXcQ");
		});

		test("returns null for invalid URLs", () => {
			expect(extractVideoId("https://google.com")).toBe(null);
			expect(extractVideoId("not a url")).toBe(null);
			expect(extractVideoId("")).toBe(null);
			expect(extractVideoId("https://www.youtube.com")).toBe(null);
		});

		test("handles IDs with special characters", () => {
			expect(extractVideoId("https://youtu.be/abc-_123DEF")).toBe(
				"abc-_123DEF",
			);
		});
	});
});

describe("YouTube Metadata Extraction", () => {
	// Using a well-known, stable public domain video for testing
	// "Big Buck Bunny" - a short, publicly available video
	const TEST_VIDEO_URL = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";

	// Integration test - requires network access and may fail due to YouTube bot detection
	const runIntegrationTests = !!process.env.YOUTUBE_INTEGRATION_TESTS;

	test.skipIf(!runIntegrationTests)("fetches metadata for a real public video", async () => {
		const metadata = await getVideoMetadata(TEST_VIDEO_URL);

		expect(metadata.id).toBe("aqz-KE-bpKQ");
		expect(typeof metadata.title).toBe("string");
		expect(metadata.title.length).toBeGreaterThan(0);
		expect(typeof metadata.duration).toBe("number");
		expect(metadata.duration).toBeGreaterThan(0);
		expect(metadata.thumbnailUrl).toMatch(/^https?:\/\//);
		expect(typeof metadata.channelName).toBe("string");
		expect(typeof metadata.uploadDate).toBe("string");
	}, 30000); // 30s timeout for network request

	test("throws error for invalid URL", async () => {
		await expect(getVideoMetadata("https://google.com")).rejects.toThrow(
			"Invalid YouTube URL",
		);
	});

	test("throws error for non-existent video", async () => {
		// This ID shouldn't exist - random string
		await expect(
			getVideoMetadata("https://www.youtube.com/watch?v=xxxxxxxxxxx"),
		).rejects.toThrow();
	}, 30000);
});

describe("YouTube Audio Download", () => {
	// Use a very short public domain video for download testing
	// "Big Buck Bunny" excerpt - short and publicly available
	const TEST_VIDEO_URL = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
	const TEST_VIDEO_ID = "aqz-KE-bpKQ";

	// Custom test output directory to avoid polluting the main downloads folder
	const TEST_DOWNLOADS_DIR = "data/downloads/test";

	// Integration tests - require network access and may fail due to YouTube bot detection
	const runIntegrationTests = !!process.env.YOUTUBE_INTEGRATION_TESTS;

	// Clean up test files after all tests
	afterAll(() => {
		if (existsSync(TEST_DOWNLOADS_DIR)) {
			rmSync(TEST_DOWNLOADS_DIR, { recursive: true, force: true });
		}
	});

	test.skipIf(!runIntegrationTests)("downloads audio from a real public video", async () => {
		const outputPath = join(TEST_DOWNLOADS_DIR, `${TEST_VIDEO_ID}.m4a`);
		const result = await downloadAudio(TEST_VIDEO_URL, outputPath);

		// Should return the path to the downloaded file
		expect(result).toBe(outputPath);

		// File should exist
		expect(existsSync(result)).toBe(true);

		// File should have content (not be empty)
		const file = Bun.file(result);
		const size = file.size;
		expect(size).toBeGreaterThan(0);
	}, 120000); // 120s timeout - downloads can take time

	test.skip("uses default path when outputPath not provided", async () => {
		const expectedPath = `data/downloads/${TEST_VIDEO_ID}.m4a`;

		// Clean up if file exists from previous run
		if (existsSync(expectedPath)) {
			rmSync(expectedPath);
		}

		const result = await downloadAudio(TEST_VIDEO_URL);

		// Should return the default path
		expect(result).toBe(expectedPath);

		// File should exist
		expect(existsSync(result)).toBe(true);

		// Clean up
		rmSync(result);
	}, 120000);

	test("throws error for invalid URL", async () => {
		await expect(downloadAudio("https://google.com")).rejects.toThrow(
			"Invalid YouTube URL",
		);
	});

	test("throws error for non-existent video", async () => {
		// This ID shouldn't exist - random string
		await expect(
			downloadAudio("https://www.youtube.com/watch?v=xxxxxxxxxxx"),
		).rejects.toThrow();
	}, 60000);

	test.skip("creates output directory if it doesn't exist", async () => {
		const nestedDir = join(TEST_DOWNLOADS_DIR, "nested", "deep");
		const outputPath = join(nestedDir, `${TEST_VIDEO_ID}.m4a`);

		// Ensure directory doesn't exist
		if (existsSync(nestedDir)) {
			rmSync(nestedDir, { recursive: true, force: true });
		}

		const result = await downloadAudio(TEST_VIDEO_URL, outputPath);

		// Directory should have been created
		expect(existsSync(nestedDir)).toBe(true);

		// File should exist
		expect(existsSync(result)).toBe(true);
	}, 120000);
});
