import { useRef } from "react";
import {
	AssistantRuntimeProvider,
	useLocalRuntime,
	type ChatModelAdapter,
	type ChatModelRunResult,
	ThreadPrimitive,
	ComposerPrimitive,
	MessagePrimitive,
} from "@assistant-ui/react";
import { MotionWrapper } from "./MotionWrapper";
import { m } from "framer-motion";

/**
 * API configuration
 */
const API_BASE_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:3000";

interface ChatInterfaceProps {
	/** Video ID to chat about */
	videoId: number;
	/** Optional initial session ID to continue a conversation */
	sessionId?: number;
	/** Optional class name for styling */
	className?: string;
}

/**
 * Custom ChatModelAdapter that connects to our backend API
 * Handles message history and session management
 */
function createChatAdapter(
	videoId: number,
	sessionIdRef: React.MutableRefObject<number | undefined>,
): ChatModelAdapter {
	return {
		async run({ messages, abortSignal }): Promise<ChatModelRunResult> {
			// Get only the latest user message
			const lastMessage = messages[messages.length - 1];
			if (lastMessage?.role !== "user") {
				throw new Error("Expected last message to be from user");
			}

			// Extract text content from the message
			const textContent = lastMessage.content.find((c) => c.type === "text");
			if (!textContent || textContent.type !== "text") {
				throw new Error("Expected text content in message");
			}

			const response = await fetch(
				`${API_BASE_URL}/api/videos/${videoId}/chat`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({
						sessionId: sessionIdRef.current,
						message: textContent.text,
					}),
					signal: abortSignal,
				},
			);

			if (response.status === 401) {
				throw new Error("Please sign in to chat about this video.");
			}

			if (response.status === 403) {
				throw new Error("You don't have access to this video.");
			}

			if (response.status === 404) {
				throw new Error("Video not found.");
			}

			if (response.status === 400) {
				const data = await response.json();
				throw new Error(
					data.error || "Cannot chat - video transcript not available.",
				);
			}

			if (!response.ok) {
				throw new Error(`Chat failed: ${response.statusText}`);
			}

			const data = (await response.json()) as {
				sessionId: number;
				response: string;
			};

			// Store the session ID for subsequent messages
			sessionIdRef.current = data.sessionId;

			return {
				content: [{ type: "text", text: data.response }],
			};
		},
	};
}

/**
 * Thread component styled for YTScribe
 */
function ChatThread() {
	return (
		<ThreadPrimitive.Root className="flex h-full flex-col">
			{/* Messages area */}
			<ThreadPrimitive.Viewport className="flex-1 overflow-y-auto p-4">
				<ThreadPrimitive.Messages
					components={{
						UserMessage,
						AssistantMessage,
					}}
				/>
				<ThreadPrimitive.Empty>
					<EmptyState />
				</ThreadPrimitive.Empty>
			</ThreadPrimitive.Viewport>

			{/* Composer */}
			<div className="border-t border-neutral-200 bg-white p-4">
				<Composer />
			</div>
		</ThreadPrimitive.Root>
	);
}

/**
 * Empty state shown when no messages yet
 */
function EmptyState() {
	return (
		<MotionWrapper>
			<m.div
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				className="flex flex-col items-center justify-center py-12 text-center"
			>
				<div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-100">
					<svg
						className="h-7 w-7 text-primary-600"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={1.5}
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
						/>
					</svg>
				</div>
				<h3 className="mb-2 text-lg font-semibold text-neutral-900">
					Ask about this video
				</h3>
				<p className="max-w-sm text-sm text-neutral-500">
					Ask questions about the video content, request summaries, or explore
					specific topics mentioned in the transcript.
				</p>
			</m.div>
		</MotionWrapper>
	);
}

/**
 * User message component
 */
function UserMessage() {
	return (
		<MessagePrimitive.Root className="mb-4 flex justify-end">
			<div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary-600 px-4 py-2.5 text-white shadow-sm">
				<MessagePrimitive.Content
					components={{
						Text: ({ text }) => (
							<p className="whitespace-pre-wrap text-sm">{text}</p>
						),
					}}
				/>
			</div>
		</MessagePrimitive.Root>
	);
}

/**
 * Assistant message component
 */
function AssistantMessage() {
	return (
		<MessagePrimitive.Root className="mb-4 flex">
			<div className="flex gap-3">
				{/* Avatar */}
				<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100">
					<svg
						className="h-4 w-4 text-neutral-600"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={1.5}
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
						/>
					</svg>
				</div>
				{/* Message content */}
				<div className="max-w-[85%] rounded-2xl rounded-tl-md bg-neutral-100 px-4 py-2.5 shadow-sm">
					<MessagePrimitive.Content
						components={{
							Text: ({ text }) => (
								<p className="whitespace-pre-wrap text-sm text-neutral-800">
									{text}
								</p>
							),
						}}
					/>
				</div>
			</div>
		</MessagePrimitive.Root>
	);
}

/**
 * Composer for sending messages
 */
function Composer() {
	return (
		<ComposerPrimitive.Root className="flex gap-3">
			<ComposerPrimitive.Input
				placeholder="Ask about this video..."
				className="flex-1 resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
				autoFocus
			/>
			<ComposerPrimitive.Send className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm transition-all hover:bg-primary-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50">
				<svg
					className="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={2}
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
					/>
				</svg>
			</ComposerPrimitive.Send>
		</ComposerPrimitive.Root>
	);
}

/**
 * ChatInterface component - provides chat functionality for a video
 * Uses assistant-ui with a custom adapter for our backend API
 */
export function ChatInterface({
	videoId,
	sessionId: initialSessionId,
	className = "",
}: ChatInterfaceProps) {
	// Use ref to store session ID so it persists across adapter calls
	const sessionIdRef = useRef<number | undefined>(initialSessionId);

	// Create adapter with video ID and session ref
	const adapter = createChatAdapter(videoId, sessionIdRef);

	// Create local runtime with our custom adapter
	const runtime = useLocalRuntime(adapter);

	return (
		<AssistantRuntimeProvider runtime={runtime}>
			<div className={`flex h-full flex-col bg-white ${className}`}>
				<ChatThread />
			</div>
		</AssistantRuntimeProvider>
	);
}
