import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	clerkId: text("clerk_id").unique(),
	email: text("email").notNull().unique(),
	name: text("name"),
	avatarUrl: text("avatar_url"),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const videoStatusEnum = [
	"pending",
	"processing",
	"completed",
	"failed",
] as const;
export type VideoStatus = (typeof videoStatusEnum)[number];

export const videos = sqliteTable("videos", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id),
	youtubeUrl: text("youtube_url").notNull(),
	youtubeId: text("youtube_id").notNull(),
	title: text("title"),
	duration: integer("duration"),
	thumbnailUrl: text("thumbnail_url"),
	status: text("status", { enum: videoStatusEnum })
		.notNull()
		.default("pending"),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;

export interface TranscriptSegment {
	start: number;
	end: number;
	text: string;
}

export const transcripts = sqliteTable("transcripts", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	videoId: integer("video_id")
		.notNull()
		.references(() => videos.id),
	content: text("content").notNull(),
	segments: text("segments", { mode: "json" })
		.notNull()
		.$type<TranscriptSegment[]>(),
	language: text("language").notNull().default("en"),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export type Transcript = typeof transcripts.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;

export const chatSessions = sqliteTable("chat_sessions", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	videoId: integer("video_id")
		.notNull()
		.references(() => videos.id),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id),
	title: text("title"),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;

export const messageRoleEnum = ["user", "assistant"] as const;
export type MessageRole = (typeof messageRoleEnum)[number];

export const messages = sqliteTable("messages", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	sessionId: integer("session_id")
		.notNull()
		.references(() => chatSessions.id),
	role: text("role", { enum: messageRoleEnum }).notNull(),
	content: text("content").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

// Analytics events for tracking user activity
export const analyticsEventEnum = [
	"video_added",
	"transcription_completed",
	"chat_message_sent",
] as const;
export type AnalyticsEventType = (typeof analyticsEventEnum)[number];

export const analytics = sqliteTable("analytics", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id),
	event: text("event", { enum: analyticsEventEnum }).notNull(),
	properties: text("properties", { mode: "json" }).$type<Record<string, unknown>>(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export type AnalyticsEvent = typeof analytics.$inferSelect;
export type NewAnalyticsEvent = typeof analytics.$inferInsert;
