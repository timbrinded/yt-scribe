import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	email: text("email").notNull().unique(),
	name: text("name"),
	avatarUrl: text("avatar_url"),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
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
