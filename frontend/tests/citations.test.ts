import { describe, it, expect } from "vitest";
import {
	parseTimestampToSeconds,
	formatSecondsToTimestamp,
	extractCitations,
	parseTextWithCitations,
} from "../src/utils/citations";

describe("parseTimestampToSeconds", () => {
	it("parses MM:SS format", () => {
		expect(parseTimestampToSeconds("0:30")).toBe(30);
		expect(parseTimestampToSeconds("2:15")).toBe(135);
		expect(parseTimestampToSeconds("10:00")).toBe(600);
		expect(parseTimestampToSeconds("59:59")).toBe(3599);
	});

	it("parses HH:MM:SS format", () => {
		expect(parseTimestampToSeconds("1:00:00")).toBe(3600);
		expect(parseTimestampToSeconds("1:30:45")).toBe(5445);
		expect(parseTimestampToSeconds("2:05:30")).toBe(7530);
		expect(parseTimestampToSeconds("12:34:56")).toBe(45296);
	});

	it("returns null for invalid formats", () => {
		expect(parseTimestampToSeconds("")).toBe(null);
		expect(parseTimestampToSeconds("invalid")).toBe(null);
		expect(parseTimestampToSeconds("1:2:3:4")).toBe(null);
		expect(parseTimestampToSeconds("1")).toBe(null);
	});

	it("returns null for invalid values", () => {
		expect(parseTimestampToSeconds("-1:00")).toBe(null);
		expect(parseTimestampToSeconds("1:60")).toBe(null);
		expect(parseTimestampToSeconds("1:00:60")).toBe(null);
		expect(parseTimestampToSeconds("1:60:00")).toBe(null);
	});
});

describe("formatSecondsToTimestamp", () => {
	it("formats to MM:SS for times under an hour", () => {
		expect(formatSecondsToTimestamp(0)).toBe("0:00");
		expect(formatSecondsToTimestamp(30)).toBe("0:30");
		expect(formatSecondsToTimestamp(135)).toBe("2:15");
		expect(formatSecondsToTimestamp(3599)).toBe("59:59");
	});

	it("formats to HH:MM:SS for times an hour or more", () => {
		expect(formatSecondsToTimestamp(3600)).toBe("1:00:00");
		expect(formatSecondsToTimestamp(5445)).toBe("1:30:45");
		expect(formatSecondsToTimestamp(45296)).toBe("12:34:56");
	});
});

describe("extractCitations", () => {
	it("extracts single citation", () => {
		const text = "Check out the intro at [0:30]";
		const citations = extractCitations(text);
		expect(citations).toHaveLength(1);
		expect(citations[0].text).toBe("[0:30]");
		expect(citations[0].seconds).toBe(30);
		expect(citations[0].startIndex).toBe(text.indexOf("[0:30]"));
		expect(citations[0].endIndex).toBe(text.indexOf("[0:30]") + 6);
	});

	it("extracts multiple citations", () => {
		const citations = extractCitations(
			"Start at [0:30], then see [2:15] and [1:00:00]"
		);
		expect(citations).toHaveLength(3);
		expect(citations[0].seconds).toBe(30);
		expect(citations[1].seconds).toBe(135);
		expect(citations[2].seconds).toBe(3600);
	});

	it("returns empty array for text without citations", () => {
		const citations = extractCitations("No timestamps here");
		expect(citations).toHaveLength(0);
	});

	it("ignores invalid timestamp formats", () => {
		const citations = extractCitations("[invalid] and [1:60]");
		expect(citations).toHaveLength(0);
	});

	it("handles citations at start and end of text", () => {
		const citations = extractCitations("[0:00] content [5:30]");
		expect(citations).toHaveLength(2);
		expect(citations[0].startIndex).toBe(0);
		expect(citations[1].endIndex).toBe(21);
	});

	it("handles HH:MM:SS format", () => {
		const citations = extractCitations("Long video at [1:30:45]");
		expect(citations).toHaveLength(1);
		expect(citations[0].seconds).toBe(5445);
	});
});

describe("parseTextWithCitations", () => {
	it("returns single text segment for text without citations", () => {
		const segments = parseTextWithCitations("Just plain text");
		expect(segments).toEqual([{ type: "text", content: "Just plain text" }]);
	});

	it("parses text with single citation", () => {
		const segments = parseTextWithCitations("See [0:30] here");
		expect(segments).toHaveLength(3);
		expect(segments[0]).toEqual({ type: "text", content: "See " });
		expect(segments[1]).toEqual({
			type: "citation",
			citation: {
				text: "[0:30]",
				seconds: 30,
				startIndex: 4,
				endIndex: 10,
			},
		});
		expect(segments[2]).toEqual({ type: "text", content: " here" });
	});

	it("parses text with multiple citations", () => {
		const segments = parseTextWithCitations("[0:00] and [1:00]");
		expect(segments).toHaveLength(3);
		expect(segments[0].type).toBe("citation");
		expect(segments[1]).toEqual({ type: "text", content: " and " });
		expect(segments[2].type).toBe("citation");
	});

	it("handles adjacent citations", () => {
		const segments = parseTextWithCitations("[0:30][1:00]");
		expect(segments).toHaveLength(2);
		expect(segments[0].type).toBe("citation");
		expect(segments[1].type).toBe("citation");
	});

	it("handles citation at end of text", () => {
		const segments = parseTextWithCitations("Ends with [5:00]");
		expect(segments).toHaveLength(2);
		expect(segments[0]).toEqual({ type: "text", content: "Ends with " });
		expect(segments[1].type).toBe("citation");
	});

	it("handles citation at start of text", () => {
		const segments = parseTextWithCitations("[0:00] starts here");
		expect(segments).toHaveLength(2);
		expect(segments[0].type).toBe("citation");
		expect(segments[1]).toEqual({ type: "text", content: " starts here" });
	});
});
