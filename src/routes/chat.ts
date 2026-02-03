import { asc, count, desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { getDb } from "../db";
import {
	type ChatSession,
	chatSessions,
	messages,
	transcripts,
	videos,
} from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { type ChatMessage, chatComplete } from "../services/chat";

/**
 * Chat API routes
 * Handles chat sessions and conversations about video transcripts
 */
export const chatRoutes = new Elysia({ prefix: "/api/videos" })
	.use(authMiddleware)
	.post(
		"/:id/chat",
		async ({ params, body, user, set }) => {
			const db = getDb();
			const videoId = params.id;
			const { sessionId, message } = body;

			// Fetch the video
			const video = db
				.select()
				.from(videos)
				.where(eq(videos.id, videoId))
				.get();

			// Return 404 if video doesn't exist
			if (!video) {
				set.status = 404;
				return { error: "Video not found" };
			}

			// Return 403 if video belongs to a different user
			if (video.userId !== user.id) {
				set.status = 403;
				return { error: "Access denied" };
			}

			// Return 400 if video is not completed (no transcript available)
			if (video.status !== "completed") {
				set.status = 400;
				return {
					error: "Video transcript not available",
					currentStatus: video.status,
				};
			}

			// Load transcript for the video
			const transcript = db
				.select()
				.from(transcripts)
				.where(eq(transcripts.videoId, videoId))
				.get();

			if (!transcript) {
				set.status = 400;
				return { error: "Transcript not found for this video" };
			}

			let chatSession: ChatSession;

			// Handle session - create new or validate existing
			if (sessionId) {
				// Validate existing session
				const existingSession = db
					.select()
					.from(chatSessions)
					.where(eq(chatSessions.id, sessionId))
					.get();

				if (!existingSession) {
					set.status = 404;
					return { error: "Chat session not found" };
				}

				// Verify session belongs to this video and user
				if (existingSession.videoId !== videoId) {
					set.status = 400;
					return { error: "Session does not belong to this video" };
				}

				if (existingSession.userId !== user.id) {
					set.status = 403;
					return { error: "Access denied to this chat session" };
				}

				chatSession = existingSession;
			} else {
				// Create new chat session
				chatSession = db
					.insert(chatSessions)
					.values({
						videoId,
						userId: user.id,
					})
					.returning()
					.get();
			}

			// Load previous messages if existing session
			const previousMessages = db
				.select({
					role: messages.role,
					content: messages.content,
				})
				.from(messages)
				.where(eq(messages.sessionId, chatSession.id))
				.orderBy(asc(messages.createdAt))
				.all() as ChatMessage[];

			// Save user message to database
			db.insert(messages)
				.values({
					sessionId: chatSession.id,
					role: "user",
					content: message,
				})
				.run();

			// Call chat service
			const response = await chatComplete(
				transcript.content,
				previousMessages,
				message,
				video.title ?? undefined,
			);

			// Save assistant message to database
			db.insert(messages)
				.values({
					sessionId: chatSession.id,
					role: "assistant",
					content: response,
				})
				.run();

			// Update session's updatedAt timestamp
			db.update(chatSessions)
				.set({ updatedAt: new Date() })
				.where(eq(chatSessions.id, chatSession.id))
				.run();

			return {
				sessionId: chatSession.id,
				response,
			};
		},
		{
			auth: true,
			params: t.Object({
				id: t.Numeric(),
			}),
			body: t.Object({
				sessionId: t.Optional(t.Number()),
				message: t.String(),
			}),
		},
	)
	.get(
		"/:id/sessions",
		({ params, user, set }) => {
			const db = getDb();
			const videoId = params.id;

			// Fetch the video
			const video = db
				.select()
				.from(videos)
				.where(eq(videos.id, videoId))
				.get();

			// Return 404 if video doesn't exist
			if (!video) {
				set.status = 404;
				return { error: "Video not found" };
			}

			// Return 403 if video belongs to a different user
			if (video.userId !== user.id) {
				set.status = 403;
				return { error: "Access denied" };
			}

			// Fetch chat sessions with message counts
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
				.where(eq(chatSessions.videoId, videoId))
				.groupBy(chatSessions.id)
				.orderBy(desc(chatSessions.updatedAt))
				.all();

			return {
				sessions: sessionsWithCounts.map((s) => ({
					id: s.id,
					title: s.title,
					messageCount: s.messageCount,
					createdAt: s.createdAt.toISOString(),
					updatedAt: s.updatedAt.toISOString(),
				})),
			};
		},
		{
			auth: true,
			params: t.Object({
				id: t.Numeric(),
			}),
		},
	);
