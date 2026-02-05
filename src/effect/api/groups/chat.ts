/**
 * Effect-TS HttpApiGroup for Chat Endpoints
 *
 * Defines chat conversation endpoints:
 * - POST /videos/:id/chat - Send a message and receive AI response
 * - GET /videos/:id/sessions - List chat sessions for a video
 *
 * All endpoints require authentication via the Authorization middleware.
 */

import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "@effect/platform";
import { Schema } from "effect";
import {
	BadRequestError,
	ChatApiError,
	ForbiddenError,
	VideoNotFoundError,
} from "../../errors";
import { Authorization } from "../middleware/auth";

// =============================================================================
// REQUEST/RESPONSE SCHEMAS
// =============================================================================

/**
 * Request body for sending a chat message.
 */
export class ChatMessageRequest extends Schema.Class<ChatMessageRequest>(
	"ChatMessageRequest",
)({
	message: Schema.String.pipe(
		Schema.nonEmptyString(),
		Schema.annotations({
			description: "The user's message to send",
			examples: ["What is this video about?"],
		}),
	),
	sessionId: Schema.optionalWith(
		Schema.Number.pipe(
			Schema.annotations({
				description:
					"Optional session ID to continue an existing conversation. If not provided, a new session is created.",
			}),
		),
		{ as: "Option" },
	),
}) {}

/**
 * Response from sending a chat message.
 */
export class ChatMessageResponse extends Schema.Class<ChatMessageResponse>(
	"ChatMessageResponse",
)({
	sessionId: Schema.Number.pipe(
		Schema.annotations({
			description: "Chat session ID (use for subsequent messages)",
		}),
	),
	response: Schema.String.pipe(
		Schema.annotations({ description: "The assistant's response" }),
	),
}) {}

/**
 * A chat session summary for listing.
 */
export class ChatSessionSummary extends Schema.Class<ChatSessionSummary>(
	"ChatSessionSummary",
)({
	id: Schema.Number.pipe(Schema.annotations({ description: "Session ID" })),
	title: Schema.NullOr(Schema.String).pipe(
		Schema.annotations({ description: "Session title (null if not set)" }),
	),
	messageCount: Schema.Number.pipe(
		Schema.annotations({ description: "Number of messages in the session" }),
	),
	createdAt: Schema.String.pipe(
		Schema.annotations({
			description: "ISO timestamp when session was created",
		}),
	),
	updatedAt: Schema.String.pipe(
		Schema.annotations({ description: "ISO timestamp of last message" }),
	),
}) {}

/**
 * Response for listing chat sessions.
 */
export class ChatSessionsResponse extends Schema.Class<ChatSessionsResponse>(
	"ChatSessionsResponse",
)({
	sessions: Schema.Array(ChatSessionSummary),
}) {}

/**
 * Path parameters for video chat endpoints.
 */
export class VideoIdParam extends Schema.Class<VideoIdParam>("VideoIdParam")({
	id: Schema.NumberFromString.pipe(
		Schema.int(),
		Schema.positive(),
		Schema.annotations({ description: "Video ID" }),
	),
}) {}

// =============================================================================
// ENDPOINT DEFINITIONS
// =============================================================================

/**
 * POST /videos/:id/chat - Send a chat message.
 *
 * Sends a message to the AI about the video's content.
 * If sessionId is not provided, creates a new chat session.
 * The response includes timestamps as clickable citations.
 */
const sendMessage = HttpApiEndpoint.post("sendMessage", "/videos/:id/chat")
	.setPath(VideoIdParam)
	.setPayload(ChatMessageRequest)
	.addSuccess(ChatMessageResponse)
	.addError(VideoNotFoundError)
	.addError(ForbiddenError)
	.addError(BadRequestError)
	.addError(ChatApiError)
	.annotate(OpenApi.Summary, "Send a chat message")
	.annotate(
		OpenApi.Description,
		"Sends a message to the AI assistant about the video content. The assistant uses the transcript for context and includes timestamp citations in responses. Requires the video to be in 'completed' status.",
	);

/**
 * GET /videos/:id/sessions - List chat sessions for a video.
 *
 * Returns all chat sessions for the specified video, ordered by most recent.
 */
const listSessions = HttpApiEndpoint.get("listSessions", "/videos/:id/sessions")
	.setPath(VideoIdParam)
	.addSuccess(ChatSessionsResponse)
	.addError(VideoNotFoundError)
	.addError(ForbiddenError)
	.annotate(OpenApi.Summary, "List chat sessions")
	.annotate(
		OpenApi.Description,
		"Returns all chat sessions for the specified video, including message counts and timestamps. Sessions are ordered by most recently updated.",
	);

// =============================================================================
// GROUP DEFINITION
// =============================================================================

/**
 * Chat API group.
 *
 * All endpoints require authentication via the Authorization middleware.
 * Endpoints validate video ownership before allowing access.
 */
export const ChatGroup = HttpApiGroup.make("chat")
	.add(sendMessage)
	.add(listSessions)
	.middleware(Authorization)
	.prefix("/api")
	.annotate(OpenApi.Title, "Chat")
	.annotate(
		OpenApi.Description,
		"AI-powered chat endpoints for video conversations",
	);
