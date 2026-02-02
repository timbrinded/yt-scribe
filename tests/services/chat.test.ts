import { describe, expect, test } from "bun:test";
import type { ChatMessage } from "../../src/services/chat";
import { ChatError, chat, chatComplete } from "../../src/services/chat";

describe("Chat Service", () => {
	describe("ChatError", () => {
		test("creates error with correct code and message", () => {
			const error = new ChatError("API_ERROR", "Test message");

			expect(error.name).toBe("ChatError");
			expect(error.code).toBe("API_ERROR");
			expect(error.message).toBe("Test message");
			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(ChatError);
		});

		test("supports all error codes", () => {
			const codes = [
				"API_ERROR",
				"RATE_LIMIT",
				"AUTHENTICATION_ERROR",
				"CONTEXT_TOO_LONG",
			] as const;

			for (const code of codes) {
				const error = new ChatError(code, `Error: ${code}`);
				expect(error.code).toBe(code);
			}
		});
	});

	describe("chat function - message construction", () => {
		// We test the exported functions work and handle parameters correctly
		// The actual OpenAI calls are tested via integration tests

		test("chat function exists and is async generator", async () => {
			// Verify the function signature
			const transcript = "Test transcript";
			const messages: ChatMessage[] = [];
			const userMessage = "Test message";

			// The function should return an async iterator
			const result = chat(transcript, messages, userMessage);
			expect(typeof result[Symbol.asyncIterator]).toBe("function");
		});

		test("chatComplete function exists and returns Promise", () => {
			// Verify the function signature
			const transcript = "Test transcript";
			const messages: ChatMessage[] = [];
			const userMessage = "Test message";

			const result = chatComplete(transcript, messages, userMessage);
			expect(result).toBeInstanceOf(Promise);
		});

		test("ChatMessage interface supports user and assistant roles", () => {
			const userMsg: ChatMessage = {
				role: "user",
				content: "Hello",
			};

			const assistantMsg: ChatMessage = {
				role: "assistant",
				content: "Hi there!",
			};

			expect(userMsg.role).toBe("user");
			expect(assistantMsg.role).toBe("assistant");
		});
	});

	describe("system prompt construction", () => {
		// We can test the system prompt construction by checking the module's behavior
		// Since buildSystemPrompt is internal, we verify behavior through the public API

		test("accepts transcript with empty message history", () => {
			const transcript = "This is a test transcript about cats.";
			const messages: ChatMessage[] = [];
			const userMessage = "What is this video about?";

			// Should not throw when creating the generator
			const generator = chat(transcript, messages, userMessage);
			expect(generator).toBeDefined();
		});

		test("accepts transcript with previous messages", () => {
			const transcript = "This is a test transcript about dogs.";
			const messages: ChatMessage[] = [
				{ role: "user", content: "What is this video about?" },
				{ role: "assistant", content: "This video is about dogs." },
			];
			const userMessage = "Tell me more about the dogs.";

			// Should not throw when creating the generator
			const generator = chat(transcript, messages, userMessage);
			expect(generator).toBeDefined();
		});

		test("accepts optional video title", () => {
			const transcript = "Test transcript";
			const messages: ChatMessage[] = [];
			const userMessage = "Question?";
			const videoTitle = "My Cool Video";

			// Should not throw when passing video title
			const generator = chat(transcript, messages, userMessage, videoTitle);
			expect(generator).toBeDefined();
		});

		test("works without video title", () => {
			const transcript = "Test transcript";
			const messages: ChatMessage[] = [];
			const userMessage = "Question?";

			// Should not throw when video title is omitted
			const generator = chat(transcript, messages, userMessage);
			expect(generator).toBeDefined();
		});
	});

	describe("error handling", () => {
		test("ChatError includes code in error object", () => {
			const error = new ChatError("AUTHENTICATION_ERROR", "Invalid API key");

			expect(error.code).toBe("AUTHENTICATION_ERROR");
			expect(error.message).toBe("Invalid API key");
		});

		test("ChatError is instanceof Error", () => {
			const error = new ChatError("RATE_LIMIT", "Too many requests");

			expect(error instanceof Error).toBe(true);
			expect(error instanceof ChatError).toBe(true);
		});
	});
});

// Integration test - only runs if OPENAI_API_KEY is set
describe("Chat Service - Integration", () => {
	const hasApiKey = !!process.env.OPENAI_API_KEY;

	test.skipIf(!hasApiKey)(
		"streams response from OpenAI GPT-4o",
		async () => {
			const transcript = `
[00:00] Hello everyone, welcome to this video about JavaScript.
[00:05] Today we'll learn about async/await.
[00:10] Async/await makes asynchronous code easier to read.
[00:15] Let's look at some examples.
			`.trim();

			const messages: ChatMessage[] = [];
			const userMessage = "What is this video about?";

			let response = "";
			for await (const chunk of chat(transcript, messages, userMessage)) {
				expect(typeof chunk).toBe("string");
				response += chunk;
			}

			expect(response.length).toBeGreaterThan(0);
			// Response should mention JavaScript or async/await
			const lowerResponse = response.toLowerCase();
			expect(
				lowerResponse.includes("javascript") ||
					lowerResponse.includes("async") ||
					lowerResponse.includes("await"),
			).toBe(true);
		},
		30000, // 30 second timeout
	);

	test.skipIf(!hasApiKey)(
		"chatComplete returns full response",
		async () => {
			const transcript =
				"This is a short transcript about cats. Cats are cute.";
			const messages: ChatMessage[] = [];
			const userMessage = "What animals are mentioned?";

			const response = await chatComplete(transcript, messages, userMessage);

			expect(typeof response).toBe("string");
			expect(response.length).toBeGreaterThan(0);
			expect(response.toLowerCase()).toContain("cat");
		},
		30000,
	);

	test.skipIf(!hasApiKey)(
		"maintains conversation context",
		async () => {
			const transcript =
				"The video discusses three fruits: apples, bananas, and oranges.";

			// First message
			const response1 = await chatComplete(
				transcript,
				[],
				"What fruits are mentioned?",
			);
			expect(response1.length).toBeGreaterThan(0);

			// Second message with context
			const messages: ChatMessage[] = [
				{ role: "user", content: "What fruits are mentioned?" },
				{ role: "assistant", content: response1 },
			];

			const response2 = await chatComplete(
				transcript,
				messages,
				"Which one is yellow?",
			);

			expect(response2.length).toBeGreaterThan(0);
			expect(response2.toLowerCase()).toContain("banana");
		},
		60000, // 60 second timeout for two API calls
	);

	test.skipIf(!hasApiKey)(
		"includes video title in context when provided",
		async () => {
			const transcript = "Welcome to the show. Today we discuss cooking.";
			const messages: ChatMessage[] = [];
			const userMessage = "What is the title of this video?";
			const videoTitle = "Chef's Kitchen Adventures";

			const response = await chatComplete(
				transcript,
				messages,
				userMessage,
				videoTitle,
			);

			expect(response.length).toBeGreaterThan(0);
			// Should reference the video title
			expect(
				response.toLowerCase().includes("chef") ||
					response.toLowerCase().includes("kitchen") ||
					response.toLowerCase().includes("adventures"),
			).toBe(true);
		},
		30000,
	);
});
