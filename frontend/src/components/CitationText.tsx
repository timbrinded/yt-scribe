import { useMemo, useCallback } from "react";
import {
	parseTextWithCitations,
	formatSecondsToTimestamp,
} from "../utils/citations";
import { useTimestampNavigationOptional } from "../contexts/TimestampNavigationContext";

interface CitationTextProps {
	/** The text content that may contain timestamp citations */
	text: string;
	/** Optional additional className for the container */
	className?: string;
	/** Optional callback when a citation is clicked (in addition to navigation) */
	onCitationClick?: (seconds: number) => void;
}

/**
 * CitationText renders text with timestamp citations as clickable links
 * Citations in format [MM:SS] or [HH:MM:SS] become clickable and navigate
 * to the corresponding timestamp in the transcript panel
 */
export function CitationText({
	text,
	className = "",
	onCitationClick,
}: CitationTextProps) {
	const navigation = useTimestampNavigationOptional();

	// Parse text into segments on text change
	const segments = useMemo(() => parseTextWithCitations(text), [text]);

	// Handle citation click
	const handleCitationClick = useCallback(
		(seconds: number) => {
			// Navigate to timestamp if context is available
			navigation?.navigateToTimestamp(seconds);

			// Call optional callback
			onCitationClick?.(seconds);
		},
		[navigation, onCitationClick],
	);

	// If no citations, just render the text directly
	if (segments.length === 1 && segments[0].type === "text") {
		return (
			<span className={className} data-testid="citation-text">
				{text}
			</span>
		);
	}

	return (
		<span className={className} data-testid="citation-text">
			{segments.map((segment, index) => {
				if (segment.type === "text") {
					return <span key={index}>{segment.content}</span>;
				}

				// Render citation as clickable link
				const { citation } = segment;
				return (
					<button
						key={index}
						type="button"
						onClick={() => handleCitationClick(citation.seconds)}
						className="mx-0.5 inline-flex items-center gap-0.5 rounded bg-primary-100 px-1.5 py-0.5 font-mono text-xs font-medium text-primary-700 transition-colors hover:bg-primary-200 hover:text-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
						title={`Jump to ${formatSecondsToTimestamp(citation.seconds)}`}
						data-testid="citation-link"
						data-timestamp={citation.seconds}
					>
						<svg
							className="h-3 w-3"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						{formatSecondsToTimestamp(citation.seconds)}
					</button>
				);
			})}
		</span>
	);
}
