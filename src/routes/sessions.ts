import { asc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { chatSessions, messages } from "../db/schema";
import { authMiddleware } from "../middleware/auth";

/**
 * Session API routes
 * Handles fetching session messages
 */
export const sessionRoutes = new Elysia({ prefix: "/api/sessions" })
	.use(authMiddleware)
	.get(
		"/:id/messages",
		({ params, user, set }) => {
			const sessionId = params.id;

			// Fetch the session
			const session = db
				.select()
				.from(chatSessions)
				.where(eq(chatSessions.id, sessionId))
				.get();

			// Return 404 if session doesn't exist
			if (!session) {
				set.status = 404;
				return { error: "Chat session not found" };
			}

			// Return 403 if session belongs to a different user
			if (session.userId !== user.id) {
				set.status = 403;
				return { error: "Access denied" };
			}

			// Fetch all messages for the session
			const sessionMessages = db
				.select({
					id: messages.id,
					role: messages.role,
					content: messages.content,
					createdAt: messages.createdAt,
				})
				.from(messages)
				.where(eq(messages.sessionId, sessionId))
				.orderBy(asc(messages.createdAt))
				.all();

			return {
				sessionId: session.id,
				videoId: session.videoId,
				title: session.title,
				messages: sessionMessages.map((m) => ({
					id: m.id,
					role: m.role,
					content: m.content,
					createdAt: m.createdAt.toISOString(),
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
