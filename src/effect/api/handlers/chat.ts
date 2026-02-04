/**
 * Effect-TS Chat Endpoint Handlers
 *
 * Implements the chat API endpoints using HttpApiBuilder.group pattern.
 * Each handler accesses the authenticated user via CurrentUser context
 * and uses the Database and Chat services for persistence and AI responses.
 *
 * Endpoints:
 * - sendMessage: POST /videos/:id/chat - Send message, get AI response
 * - listSessions: GET /videos/:id/sessions - List chat sessions for video
 *
 * @example
 * ```typescript
 * const ChatGroupLive = HttpApiBuilder.group(YTScribeApi, "chat", (handlers) =>
 *   handlers
 *     .handle("sendMessage", sendMessageHandler)
 *     .handle("listSessions", listSessionsHandler)
 * )
 * ```
 */

import { HttpApiBuilder } from "@effect/platform";
import { Effect, Option } from "effect";
import { and, count, desc, eq } from "drizzle-orm";
import { YTScribeApi } from "../index";
import { CurrentUser } from "../middleware/auth";
import { Database } from "../../services/Database";
import { Chat } from "../../services/Chat";
import { Analytics } from "../../services/Analytics";
import {
	BadRequestError,
	ForbiddenError,
	VideoNotFoundError,
} from "../../errors";
import { videos, transcripts, chatSessions, messages } from "../../../db/schema";
import type {
	ChatMessageResponse,
	ChatSessionsResponse,
	ChatSessionSummary,
} from "../groups/chat";

// =============================================================================
// HANDLER: sendMessage
// =============================================================================

/**
 * POST /videos/:id/chat - Send a chat message.
 *
 * 1. Validates video exists and belongs to user
 * 2. Validates video is in 'completed' status with transcript
 * 3. Creates or continues a chat session
 * 4. Loads previous messages if continuing session
 * 5. Calls chat service for AI response
 * 6. Saves both user and assistant messages
 * 7. Returns session ID and response
 */
const sendMessageHandler = ({
	path,
	payload,
}: {
	path: { id: number };
	payload: { message: string; sessionId: Option.Option<number> };
}) =>
	Effect.gen(function* () {
		const videoId = path.id;
		const userMessage = payload.message;
		const sessionIdOption = payload.sessionId;
		const user = yield* CurrentUser;
		const { db } = yield* Database;
		const chat = yield* Chat;
		const analyticsService = yield* Analytics;

		// Fetch the video
		const video = db.select().from(videos).where(eq(videos.id, videoId)).get();

		// Return 404 if video doesn't exist
		if (!video) {
			return yield* new VideoNotFoundError({ videoId });
		}

		// Return 403 if video belongs to different user
		if (video.userId !== user.id) {
			return yield* new ForbiddenError();
		}

		// Return 400 if video is not completed
		if (video.status !== "completed") {
			return yield* new BadRequestError({
				message: `Video must be in 'completed' status to chat. Current status: ${video.status}`,
			});
		}

		// Fetch the transcript
		const transcript = db
			.select()
			.from(transcripts)
			.where(eq(transcripts.videoId, videoId))
			.get();

		if (!transcript) {
			return yield* new BadRequestError({
				message: "Video transcript not found. Please retry transcription.",
			});
		}

		// Get or create chat session
		let sessionId: number;
		const existingSessionId = Option.getOrNull(sessionIdOption);

		if (existingSessionId !== null) {
			// Validate existing session
			const session = db
				.select()
				.from(chatSessions)
				.where(eq(chatSessions.id, existingSessionId))
				.get();

			if (!session) {
				return yield* new BadRequestError({
					message: `Chat session ${existingSessionId} not found`,
				});
			}

			// Validate session belongs to this video
			if (session.videoId !== videoId) {
				return yield* new BadRequestError({
					message: "Chat session belongs to a different video",
				});
			}

			// Validate session belongs to this user
			if (session.userId !== user.id) {
				return yield* new ForbiddenError();
			}

			sessionId = existingSessionId;
		} else {
			// Create new chat session
			const newSession = db
				.insert(chatSessions)
				.values({
					videoId,
					userId: user.id,
				})
				.returning()
				.get();

			sessionId = newSession.id;
		}

		// Load previous messages for the session
		const previousMessages = db
			.select({
				role: messages.role,
				content: messages.content,
			})
			.from(messages)
			.where(eq(messages.sessionId, sessionId))
			.orderBy(messages.createdAt)
			.all();

		// Call chat service for AI response
		const assistantResponse = yield* chat.chatComplete(
			transcript.content,
			previousMessages,
			userMessage,
			video.title ?? undefined,
		);

		// Save user message
		db.insert(messages)
			.values({
				sessionId,
				role: "user",
				content: userMessage,
			})
			.run();

		// Save assistant message
		db.insert(messages)
			.values({
				sessionId,
				role: "assistant",
				content: assistantResponse,
			})
			.run();

		// Update session timestamp
		db.update(chatSessions)
			.set({ updatedAt: new Date() })
			.where(eq(chatSessions.id, sessionId))
			.run();

		// Track chat_message_sent event
		yield* analyticsService
			.trackEvent(user.id, "chat_message_sent", {
				videoId,
				sessionId,
				messageLength: userMessage.length,
			})
			.pipe(Effect.catchAll(() => Effect.void)); // Don't fail on analytics errors

		return {
			sessionId,
			response: assistantResponse,
		} satisfies typeof ChatMessageResponse.Type;
	});

// =============================================================================
// HANDLER: listSessions
// =============================================================================

/**
 * GET /videos/:id/sessions - List chat sessions for a video.
 *
 * Returns all chat sessions for the video with message counts,
 * ordered by most recently updated.
 */
const listSessionsHandler = ({ path }: { path: { id: number } }) =>
	Effect.gen(function* () {
		const videoId = path.id;
		const user = yield* CurrentUser;
		const { db } = yield* Database;

		// Fetch the video
		const video = db.select().from(videos).where(eq(videos.id, videoId)).get();

		// Return 404 if video doesn't exist
		if (!video) {
			return yield* new VideoNotFoundError({ videoId });
		}

		// Return 403 if video belongs to different user
		if (video.userId !== user.id) {
			return yield* new ForbiddenError();
		}

		// Query sessions with message counts using LEFT JOIN + groupBy
		const sessionsWithCounts = db
			.select({
				id: chatSessions.id,
				title: chatSessions.title,
				createdAt: chatSessions.createdAt,
				updatedAt: chatSessions.updatedAt,
				messageCount: count(messages.id),
			})
			.from(chatSessions)
			.leftJoin(messages, eq(messages.sessionId, chatSessions.id))
			.where(
				and(
					eq(chatSessions.videoId, videoId),
					eq(chatSessions.userId, user.id),
				),
			)
			.groupBy(chatSessions.id)
			.orderBy(desc(chatSessions.updatedAt))
			.all();

		// Map to response format
		const sessionSummaries: typeof ChatSessionSummary.Type[] =
			sessionsWithCounts.map((session) => ({
				id: session.id,
				title: session.title,
				messageCount: session.messageCount,
				createdAt: session.createdAt.toISOString(),
				updatedAt: session.updatedAt.toISOString(),
			}));

		return {
			sessions: sessionSummaries,
		} satisfies typeof ChatSessionsResponse.Type;
	});

// =============================================================================
// GROUP LAYER
// =============================================================================

/**
 * Live layer providing chat endpoint handlers.
 *
 * Dependencies:
 * - CurrentUser: Provided by Authorization middleware
 * - Database: For session/message persistence
 * - Chat: For AI response generation
 */
export const ChatGroupLive = HttpApiBuilder.group(
	YTScribeApi,
	"chat",
	(handlers) =>
		handlers
			.handle("sendMessage", sendMessageHandler)
			.handle("listSessions", listSessionsHandler),
);
