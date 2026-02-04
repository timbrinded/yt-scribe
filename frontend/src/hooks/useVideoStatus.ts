import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Processing stages that match backend progress events
 */
export type ProcessingStage =
	| "pending"
	| "downloading"
	| "extracting"
	| "transcribing"
	| "complete"
	| "error";

/**
 * Alias for ProcessingAnimation compatibility
 */
export type { ProcessingStage as VideoProcessingStage };

/**
 * Progress event from SSE stream
 */
export interface ProgressEvent {
	videoId: number;
	stage: ProcessingStage;
	progress?: number;
	message?: string;
	error?: string;
	timestamp: string;
}

/**
 * Hook return type
 */
export interface UseVideoStatusReturn {
	stage: ProcessingStage;
	progress: number | undefined;
	message: string | undefined;
	error: string | undefined;
	isConnected: boolean;
	isComplete: boolean;
	isError: boolean;
}

/**
 * Get the API base URL for SSE connections
 */
function getApiBaseUrl(): string {
	if (typeof window !== "undefined") {
		return import.meta.env.PUBLIC_API_URL || "http://localhost:3000";
	}
	return "http://localhost:3000";
}

/**
 * Hook to subscribe to real-time video processing status via SSE
 *
 * @param videoId - The video ID to monitor
 * @param initialStatus - Optional initial status (from GET /api/videos/:id)
 * @returns Current processing state
 *
 * @example
 * ```tsx
 * const { stage, progress, message, isComplete } = useVideoStatus(videoId, "processing");
 *
 * if (isComplete) {
 *   // Reload video data
 * }
 *
 * return <ProcessingAnimation currentStage={stage} progress={progress} />;
 * ```
 */
export function useVideoStatus(
	videoId: number | undefined,
	initialStatus?: "pending" | "processing" | "completed" | "failed",
): UseVideoStatusReturn {
	const [stage, setStage] = useState<ProcessingStage>(() => {
		if (initialStatus === "completed") return "complete";
		if (initialStatus === "failed") return "error";
		return "pending";
	});
	const [progress, setProgress] = useState<number | undefined>(undefined);
	const [message, setMessage] = useState<string | undefined>(undefined);
	const [error, setError] = useState<string | undefined>(undefined);
	const [isConnected, setIsConnected] = useState(false);

	const eventSourceRef = useRef<EventSource | null>(null);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);

	const cleanup = useCallback(() => {
		if (eventSourceRef.current) {
			eventSourceRef.current.close();
			eventSourceRef.current = null;
		}
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}
		setIsConnected(false);
	}, []);

	useEffect(() => {
		// Don't connect if no video ID
		if (!videoId) {
			cleanup();
			return;
		}

		// Don't connect if video is already complete or failed
		if (initialStatus === "completed" || initialStatus === "failed") {
			setStage(initialStatus === "completed" ? "complete" : "error");
			return;
		}

		const connect = () => {
			// Close any existing connection
			cleanup();

			const apiUrl = getApiBaseUrl();
			const url = `${apiUrl}/api/videos/${videoId}/status/stream`;

			// Create EventSource with credentials for auth cookies
			const eventSource = new EventSource(url, {
				withCredentials: true,
			});
			eventSourceRef.current = eventSource;

			eventSource.onopen = () => {
				setIsConnected(true);
			};

			eventSource.onmessage = (event) => {
				try {
					const data: ProgressEvent = JSON.parse(event.data);
					setStage(data.stage);
					setProgress(data.progress);
					setMessage(data.message);
					if (data.error) {
						setError(data.error);
					}

					// Stream will close itself when complete or error
					// but we can also stop listening
					if (data.stage === "complete" || data.stage === "error") {
						cleanup();
					}
				} catch {
					// Ignore parsing errors (e.g., keepalive comments)
				}
			};

			eventSource.onerror = () => {
				setIsConnected(false);
				cleanup();

				// Only reconnect if not complete/error
				if (stage !== "complete" && stage !== "error") {
					reconnectTimeoutRef.current = setTimeout(connect, 3000);
				}
			};
		};

		connect();

		return cleanup;
	}, [videoId, initialStatus, cleanup, stage]);

	return {
		stage,
		progress,
		message,
		error,
		isConnected,
		isComplete: stage === "complete",
		isError: stage === "error",
	};
}

export default useVideoStatus;
