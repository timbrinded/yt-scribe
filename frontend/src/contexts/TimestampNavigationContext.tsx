import {
	createContext,
	useContext,
	useState,
	useCallback,
	useMemo,
	type ReactNode,
} from "react";
import type { TranscriptSegment } from "../components/TranscriptPanel";

/**
 * Context value for timestamp navigation between transcript and chat panels
 */
interface TimestampNavigationContextValue {
	/** Currently active segment index (null if none) */
	activeSegmentIndex: number | null;
	/** Navigate to a specific segment index */
	navigateToSegment: (index: number | null) => void;
	/** Navigate to a specific timestamp (finds the corresponding segment) */
	navigateToTimestamp: (timestamp: number) => void;
	/** Current segments (needed for timestamp-to-index lookup) */
	segments: TranscriptSegment[];
	/** Set segments (called by TranscriptPanel when loaded) */
	setSegments: (segments: TranscriptSegment[]) => void;
}

const TimestampNavigationContext =
	createContext<TimestampNavigationContextValue | null>(null);

interface TimestampNavigationProviderProps {
	children: ReactNode;
}

/**
 * Find the segment index for a given timestamp
 */
function findSegmentIndex(
	segments: TranscriptSegment[],
	timestamp: number,
): number | null {
	if (segments.length === 0) return null;

	// Find the segment that contains this timestamp
	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i];
		if (timestamp >= segment.start && timestamp < segment.end) {
			return i;
		}
	}

	// If not found in any segment, find the closest preceding segment
	for (let i = segments.length - 1; i >= 0; i--) {
		if (segments[i].start <= timestamp) {
			return i;
		}
	}

	return 0;
}

/**
 * Provider component for timestamp navigation context
 */
export function TimestampNavigationProvider({
	children,
}: TimestampNavigationProviderProps) {
	const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(
		null,
	);
	const [segments, setSegments] = useState<TranscriptSegment[]>([]);

	const navigateToSegment = useCallback((index: number | null) => {
		setActiveSegmentIndex(index);
	}, []);

	const navigateToTimestamp = useCallback(
		(timestamp: number) => {
			const index = findSegmentIndex(segments, timestamp);
			setActiveSegmentIndex(index);
		},
		[segments],
	);

	const value = useMemo(
		(): TimestampNavigationContextValue => ({
			activeSegmentIndex,
			navigateToSegment,
			navigateToTimestamp,
			segments,
			setSegments,
		}),
		[
			activeSegmentIndex,
			navigateToSegment,
			navigateToTimestamp,
			segments,
			setSegments,
		],
	);

	return (
		<TimestampNavigationContext.Provider value={value}>
			{children}
		</TimestampNavigationContext.Provider>
	);
}

/**
 * Hook to use timestamp navigation context
 * @throws Error if used outside of TimestampNavigationProvider
 */
export function useTimestampNavigation(): TimestampNavigationContextValue {
	const context = useContext(TimestampNavigationContext);
	if (!context) {
		throw new Error(
			"useTimestampNavigation must be used within a TimestampNavigationProvider",
		);
	}
	return context;
}

/**
 * Hook to use timestamp navigation context (returns null if not in provider)
 * Use this when the component can work with or without the context
 */
export function useTimestampNavigationOptional(): TimestampNavigationContextValue | null {
	return useContext(TimestampNavigationContext);
}
