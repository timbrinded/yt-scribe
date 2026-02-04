import { EventEmitter } from "node:events";

/**
 * Video processing progress tracking via EventEmitter
 * Enables real-time status updates via SSE
 */

/**
 * Processing stages that match frontend ProcessingAnimation
 */
export type ProcessingStage =
	| "pending"
	| "downloading"
	| "extracting"
	| "transcribing"
	| "complete"
	| "error";

/**
 * Progress event data emitted during video processing
 */
export interface ProgressEvent {
	videoId: number;
	stage: ProcessingStage;
	progress?: number; // 0-100 percentage for current stage
	message?: string;
	error?: string;
	timestamp: string;
}

/**
 * Global event emitter for video processing progress
 * Singleton pattern ensures all parts of the app use the same emitter
 */
class VideoProgressEmitter extends EventEmitter {
	private static instance: VideoProgressEmitter;

	private constructor() {
		super();
		// Allow many listeners (one per SSE connection)
		this.setMaxListeners(100);
	}

	static getInstance(): VideoProgressEmitter {
		if (!VideoProgressEmitter.instance) {
			VideoProgressEmitter.instance = new VideoProgressEmitter();
		}
		return VideoProgressEmitter.instance;
	}

	/**
	 * Emit a progress event for a video
	 */
	emitProgress(event: Omit<ProgressEvent, "timestamp">): void {
		const fullEvent: ProgressEvent = {
			...event,
			timestamp: new Date().toISOString(),
		};
		this.emit(`video:${event.videoId}`, fullEvent);
		this.emit("video:*", fullEvent); // Global listener for all videos
	}

	/**
	 * Subscribe to progress events for a specific video
	 */
	onVideoProgress(
		videoId: number,
		callback: (event: ProgressEvent) => void,
	): () => void {
		const handler = (event: ProgressEvent) => callback(event);
		this.on(`video:${videoId}`, handler);
		return () => this.off(`video:${videoId}`, handler);
	}

	/**
	 * Subscribe to progress events for all videos
	 */
	onAllProgress(callback: (event: ProgressEvent) => void): () => void {
		const handler = (event: ProgressEvent) => callback(event);
		this.on("video:*", handler);
		return () => this.off("video:*", handler);
	}
}

/**
 * Exported singleton instance
 */
export const progressEmitter = VideoProgressEmitter.getInstance();

/**
 * Helper function to emit progress updates from pipeline
 */
export function emitVideoProgress(
	videoId: number,
	stage: ProcessingStage,
	options?: {
		progress?: number;
		message?: string;
		error?: string;
	},
): void {
	progressEmitter.emitProgress({
		videoId,
		stage,
		progress: options?.progress,
		message: options?.message,
		error: options?.error,
	});
}
