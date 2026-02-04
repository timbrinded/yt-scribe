/**
 * Chat Effect Service
 *
 * Provides conversational AI for video transcript Q&A using OpenAI GPT.
 * Depends on the OpenAI service for API access.
 *
 * Key patterns demonstrated:
 * - Service dependency via `yield* OpenAI` in Layer.effect
 * - Stream.Stream for streaming responses
 * - Typed error handling with ChatApiError
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const chat = yield* Chat
 *   const response = yield* chat.chatComplete(
 *     "Transcript text here...",
 *     [],
 *     "What is this video about?",
 *     "Video Title"
 *   )
 *   console.log(response)
 * })
 *
 * // Run with live OpenAI client
 * await Effect.runPromise(
 *   program.pipe(
 *     Effect.provide(Chat.Live),
 *     Effect.provide(OpenAI.Live)
 *   )
 * )
 * ```
 */

import { Context, Effect, Layer, Stream } from "effect";
import type OpenAIClient from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { OpenAI } from "./OpenAI";
import { ChatApiError } from "../errors";
import type { ChatService, ChatMessage } from "./types";

// =============================================================================
// SERVICE TAG
// =============================================================================

/**
 * Chat service Context.Tag for dependency injection.
 *
 * Usage:
 * ```typescript
 * const chat = yield* Chat
 * const response = yield* chat.chatComplete(transcript, messages, userMessage)
 * ```
 */
export class Chat extends Context.Tag("@ytscribe/Chat")<Chat, ChatService>() {
	// =========================================================================
	// LIVE LAYER
	// =========================================================================
	/**
	 * Production layer that provides chat using OpenAI GPT-4o.
	 *
	 * IMPORTANT: Do NOT call Layer.provide(OpenAI.Live) here.
	 * Layer composition happens in src/effect/layers/Live.ts.
	 *
	 * Dependencies: OpenAI service
	 */
	static readonly Live = Layer.effect(
		Chat,
		Effect.gen(function* () {
			// Get the OpenAI client from context
			const { client } = yield* OpenAI;

			return createChatService(client);
		}),
	);

	// =========================================================================
	// TEST LAYER
	// =========================================================================
	/**
	 * Test layer providing a mock chat service.
	 *
	 * Returns a helpful error message indicating the service needs mocking.
	 * Use makeChatTestLayer() for specific mock implementations.
	 */
	static readonly Test = Layer.succeed(Chat, {
		chat: (_transcript, _messages, _userMessage, _videoTitle) =>
			Stream.fail(
				new ChatApiError({
					reason:
						"Chat mock: chat() was called but not mocked. " +
						"Use makeChatTestLayer() to provide a mock implementation.",
					retryable: false,
				}),
			),
		chatComplete: (_transcript, _messages, _userMessage, _videoTitle) =>
			Effect.fail(
				new ChatApiError({
					reason:
						"Chat mock: chatComplete() was called but not mocked. " +
						"Use makeChatTestLayer() to provide a mock implementation.",
					retryable: false,
				}),
			),
	} satisfies ChatService);
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * Creates a ChatService implementation using the provided OpenAI client.
 */
function createChatService(client: OpenAIClient): ChatService {
	return {
		chat: (transcript, messages, userMessage, videoTitle) =>
			chatStream(client, transcript, messages, userMessage, videoTitle),

		chatComplete: (transcript, messages, userMessage, videoTitle) =>
			chatCompleteEffect(client, transcript, messages, userMessage, videoTitle),
	};
}

/**
 * Builds the system prompt with transcript content.
 */
function buildSystemPrompt(transcript: string, videoTitle?: string): string {
	const titleSection = videoTitle ? `Video Title: "${videoTitle}"\n\n` : "";

	return `You are a helpful assistant that answers questions about a YouTube video based on its transcript.

${titleSection}Transcript:
${transcript}

Instructions:
- Answer questions based on the transcript content above
- If the information is not in the transcript, say so clearly
- When referencing specific parts of the video, ALWAYS include timestamps in the format [MM:SS] or [HH:MM:SS] for longer videos
- Use timestamps like [0:30], [2:15], [1:05:30] to cite specific moments - these become clickable links for the user
- Be concise but thorough in your responses
- If asked about topics not covered in the transcript, politely redirect to what is available`;
}

/**
 * Converts ChatMessage array to OpenAI chat completion message format.
 */
function convertToOpenAIMessages(
	messages: ReadonlyArray<ChatMessage>,
): ChatCompletionMessageParam[] {
	return messages.map((msg) => ({
		role: msg.role as "user" | "assistant",
		content: msg.content,
	}));
}

/**
 * Streams chat responses from OpenAI GPT.
 *
 * Uses Stream.async to wrap the OpenAI streaming API response.
 */
function chatStream(
	client: OpenAIClient,
	transcript: string,
	messages: ReadonlyArray<ChatMessage>,
	userMessage: string,
	videoTitle?: string,
): Stream.Stream<string, ChatApiError> {
	const systemPrompt = buildSystemPrompt(transcript, videoTitle);

	const allMessages: ChatCompletionMessageParam[] = [
		{ role: "system", content: systemPrompt },
		...convertToOpenAIMessages(messages),
		{ role: "user", content: userMessage },
	];

	return Stream.async<string, ChatApiError>((emit) => {
		// Create a streaming chat completion
		const makeRequest = async () => {
			try {
				const stream = await client.chat.completions.create({
					model: "gpt-4o",
					messages: allMessages,
					stream: true,
				});

				for await (const chunk of stream) {
					const content = chunk.choices[0]?.delta?.content;
					if (content) {
						emit.single(content);
					}
				}

				emit.end();
			} catch (error) {
				emit.fail(mapOpenAIError(error));
			}
		};

		makeRequest();
	});
}

/**
 * Returns the complete chat response (non-streaming).
 *
 * Convenience method that collects the stream into a single string.
 */
function chatCompleteEffect(
	client: OpenAIClient,
	transcript: string,
	messages: ReadonlyArray<ChatMessage>,
	userMessage: string,
	videoTitle?: string,
): Effect.Effect<string, ChatApiError> {
	const stream = chatStream(
		client,
		transcript,
		messages,
		userMessage,
		videoTitle,
	);

	// Collect all stream chunks into a single string
	return Stream.runFold(stream, "", (acc, chunk) => acc + chunk);
}

/**
 * Maps OpenAI API errors to ChatApiError.
 */
function mapOpenAIError(error: unknown): ChatApiError {
	// Check for OpenAI API error structure
	if (
		error &&
		typeof error === "object" &&
		"status" in error &&
		"message" in error
	) {
		const apiError = error as { status: number; message: string };

		if (apiError.status === 401) {
			return new ChatApiError({
				reason: "Invalid OpenAI API key",
				retryable: false,
			});
		}
		if (apiError.status === 429) {
			return new ChatApiError({
				reason: "OpenAI API rate limit exceeded. Please try again later.",
				retryable: true,
			});
		}
		if (apiError.status === 400 && apiError.message.includes("context")) {
			return new ChatApiError({
				reason:
					"The conversation is too long. Please start a new chat session.",
				retryable: false,
			});
		}
		return new ChatApiError({
			reason: `OpenAI API error: ${apiError.message}`,
			retryable: false,
		});
	}

	return new ChatApiError({
		reason: `Chat failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		retryable: false,
	});
}

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Factory function for creating test layers with custom mock implementations.
 *
 * @example
 * ```typescript
 * // Mock that returns a fixed response
 * const testLayer = makeChatTestLayer({
 *   chatComplete: (_transcript, _messages, _userMessage, _videoTitle) =>
 *     Effect.succeed("This video is about testing."),
 * })
 *
 * // Mock that streams response chunks
 * const streamingTestLayer = makeChatTestLayer({
 *   chat: (_transcript, _messages, _userMessage, _videoTitle) =>
 *     Stream.fromIterable(["Hello ", "world!"]),
 * })
 * ```
 */
export function makeChatTestLayer(
	implementation: Partial<ChatService>,
): Layer.Layer<Chat> {
	const defaultImplementation: ChatService = {
		chat: (_transcript, _messages, _userMessage, _videoTitle) =>
			Stream.fail(
				new ChatApiError({
					reason: "chat() not mocked",
					retryable: false,
				}),
			),
		chatComplete: (_transcript, _messages, _userMessage, _videoTitle) =>
			Effect.fail(
				new ChatApiError({
					reason: "chatComplete() not mocked",
					retryable: false,
				}),
			),
	};

	return Layer.succeed(Chat, {
		...defaultImplementation,
		...implementation,
	} satisfies ChatService);
}
