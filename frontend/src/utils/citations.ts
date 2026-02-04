/**
 * Citation parsing utilities for extracting and handling timestamps in chat messages
 */

/**
 * Represents a parsed citation with timestamp
 */
export interface Citation {
	/** The full matched text (e.g., "[2:30]") */
	text: string;
	/** Timestamp in seconds */
	seconds: number;
	/** Start index in the original string */
	startIndex: number;
	/** End index in the original string */
	endIndex: number;
}

/**
 * Represents a text segment that may or may not be a citation
 */
export type TextSegment =
	| { type: "text"; content: string }
	| { type: "citation"; citation: Citation };

/**
 * Parse a timestamp string to seconds
 * Supports formats: MM:SS, H:MM:SS, HH:MM:SS
 * @param timestamp - Timestamp string like "2:30" or "1:05:30"
 * @returns Number of seconds, or null if invalid
 */
export function parseTimestampToSeconds(timestamp: string): number | null {
	const parts = timestamp.split(":").map((p) => Number.parseInt(p, 10));

	// Validate all parts are numbers
	if (parts.some((p) => Number.isNaN(p))) {
		return null;
	}

	if (parts.length === 2) {
		// MM:SS format
		const [minutes, seconds] = parts;
		if (minutes < 0 || seconds < 0 || seconds >= 60) return null;
		return minutes * 60 + seconds;
	}

	if (parts.length === 3) {
		// HH:MM:SS format
		const [hours, minutes, seconds] = parts;
		if (hours < 0 || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) return null;
		return hours * 3600 + minutes * 60 + seconds;
	}

	return null;
}

/**
 * Format seconds back to timestamp string (MM:SS or HH:MM:SS)
 */
export function formatSecondsToTimestamp(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	}
	return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Regular expression to match timestamp citations in text
 * Matches: [0:30], [2:15], [1:05:30], [12:34:56]
 */
const CITATION_REGEX = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;

/**
 * Extract all citations from a text string
 * @param text - The text to search for citations
 * @returns Array of citations found
 */
export function extractCitations(text: string): Citation[] {
	const citations: Citation[] = [];
	let match: RegExpExecArray | null;

	// Reset regex state
	CITATION_REGEX.lastIndex = 0;

	while ((match = CITATION_REGEX.exec(text)) !== null) {
		const timestamp = match[1];
		const seconds = parseTimestampToSeconds(timestamp);

		if (seconds !== null) {
			citations.push({
				text: match[0],
				seconds,
				startIndex: match.index,
				endIndex: match.index + match[0].length,
			});
		}
	}

	return citations;
}

/**
 * Parse text into segments of plain text and citations
 * @param text - The text to parse
 * @returns Array of text segments
 */
export function parseTextWithCitations(text: string): TextSegment[] {
	const citations = extractCitations(text);
	const segments: TextSegment[] = [];

	let lastIndex = 0;

	for (const citation of citations) {
		// Add text before this citation
		if (citation.startIndex > lastIndex) {
			segments.push({
				type: "text",
				content: text.slice(lastIndex, citation.startIndex),
			});
		}

		// Add the citation
		segments.push({
			type: "citation",
			citation,
		});

		lastIndex = citation.endIndex;
	}

	// Add remaining text after last citation
	if (lastIndex < text.length) {
		segments.push({
			type: "text",
			content: text.slice(lastIndex),
		});
	}

	return segments;
}
