import OpenAI from "openai";
import type { MessageRole } from "../db/schema";

/**
 * Chat service using OpenAI GPT-4o for transcript-based conversations
 */

const openai = new OpenAI();

/**
 * Message format for chat history
 */
export interface ChatMessage {
	role: MessageRole;
	content: string;
}

/**
 * Error types for chat failures
 */
export type ChatErrorCode =
	| "API_ERROR"
	| "RATE_LIMIT"
	| "AUTHENTICATION_ERROR"
	| "CONTEXT_TOO_LONG";

/**
 * Typed error for chat failures
 */
export class ChatError extends Error {
	code: ChatErrorCode;

	constructor(code: ChatErrorCode, message: string) {
		super(message);
		this.name = "ChatError";
		this.code = code;
	}
}

/**
 * Builds the system prompt with transcript content
 */
function buildSystemPrompt(transcript: string, videoTitle?: string): string {
	const titleSection = videoTitle ? `Video Title: "${videoTitle}"\n\n` : "";

	return `You are a helpful assistant that answers questions about a YouTube video based on its transcript.

${titleSection}Transcript:
${transcript}

Instructions:
- Answer questions based on the transcript content above
- If the information is not in the transcript, say so clearly
- When referencing specific parts, include approximate timestamps if available in the transcript
- Be concise but thorough in your responses
- If asked about topics not covered in the transcript, politely redirect to what is available`;
}

/**
 * Converts database messages to OpenAI chat format
 */
function convertToOpenAIMessages(
	messages: ChatMessage[],
): OpenAI.ChatCompletionMessageParam[] {
	return messages.map((msg) => ({
		role: msg.role as "user" | "assistant",
		content: msg.content,
	}));
}

/**
 * Chat with the assistant about video transcript content
 * @param transcript - The full transcript text
 * @param messages - Previous messages in the conversation
 * @param userMessage - The new user message
 * @param videoTitle - Optional video title for context
 * @returns Async iterator yielding response chunks for streaming
 */
export async function* chat(
	transcript: string,
	messages: ChatMessage[],
	userMessage: string,
	videoTitle?: string,
): AsyncGenerator<string, void, unknown> {
	const systemPrompt = buildSystemPrompt(transcript, videoTitle);

	const allMessages: OpenAI.ChatCompletionMessageParam[] = [
		{ role: "system", content: systemPrompt },
		...convertToOpenAIMessages(messages),
		{ role: "user", content: userMessage },
	];

	try {
		const stream = await openai.chat.completions.create({
			model: "gpt-4o",
			messages: allMessages,
			stream: true,
		});

		for await (const chunk of stream) {
			const content = chunk.choices[0]?.delta?.content;
			if (content) {
				yield content;
			}
		}
	} catch (error) {
		// Handle OpenAI-specific errors
		if (error instanceof OpenAI.APIError) {
			if (error.status === 401) {
				throw new ChatError("AUTHENTICATION_ERROR", "Invalid OpenAI API key");
			}
			if (error.status === 429) {
				throw new ChatError(
					"RATE_LIMIT",
					"OpenAI API rate limit exceeded. Please try again later.",
				);
			}
			if (error.status === 400 && error.message.includes("context")) {
				throw new ChatError(
					"CONTEXT_TOO_LONG",
					"The conversation is too long. Please start a new chat session.",
				);
			}
			throw new ChatError("API_ERROR", `OpenAI API error: ${error.message}`);
		}

		// Re-throw ChatErrors as-is
		if (error instanceof ChatError) {
			throw error;
		}

		// Unknown errors
		throw new ChatError(
			"API_ERROR",
			`Chat failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Non-streaming version of chat for simpler use cases
 * @param transcript - The full transcript text
 * @param messages - Previous messages in the conversation
 * @param userMessage - The new user message
 * @param videoTitle - Optional video title for context
 * @returns The complete assistant response
 */
export async function chatComplete(
	transcript: string,
	messages: ChatMessage[],
	userMessage: string,
	videoTitle?: string,
): Promise<string> {
	let response = "";
	for await (const chunk of chat(
		transcript,
		messages,
		userMessage,
		videoTitle,
	)) {
		response += chunk;
	}
	return response;
}
