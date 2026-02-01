import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { videos } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { processVideo } from "../services/pipeline";
import { extractVideoId, isValidYouTubeUrl } from "../services/youtube";

/**
 * Videos API routes
 * Handles video creation, listing, and management
 */
export const videoRoutes = new Elysia({ prefix: "/api/videos" })
	.use(authMiddleware)
	.post(
		"/",
		async ({ body, user, set }) => {
			const { url } = body;

			// Validate YouTube URL format
			if (!isValidYouTubeUrl(url)) {
				set.status = 400;
				return { error: "Invalid YouTube URL" };
			}

			// Extract video ID
			const youtubeId = extractVideoId(url);
			if (!youtubeId) {
				set.status = 400;
				return { error: "Could not extract video ID from URL" };
			}

			// Check for duplicate (same youtubeId + userId)
			const existingVideo = db
				.select()
				.from(videos)
				.where(and(eq(videos.youtubeId, youtubeId), eq(videos.userId, user.id)))
				.get();

			if (existingVideo) {
				set.status = 409;
				return {
					error: "Video already exists in your library",
					existingVideoId: existingVideo.id,
				};
			}

			// Create video record with status 'pending'
			const video = db
				.insert(videos)
				.values({
					userId: user.id,
					youtubeUrl: url,
					youtubeId,
					status: "pending",
				})
				.returning()
				.get();

			// Trigger pipeline processing (fire and forget)
			processVideo(video.id).catch((error) => {
				console.error(`Pipeline failed for video ${video.id}:`, error);
			});

			// Return video record with 201 status
			set.status = 201;
			return {
				id: video.id,
				youtubeUrl: video.youtubeUrl,
				youtubeId: video.youtubeId,
				status: video.status,
				createdAt: video.createdAt.toISOString(),
			};
		},
		{
			auth: true,
			body: t.Object({
				url: t.String(),
			}),
		},
	);
