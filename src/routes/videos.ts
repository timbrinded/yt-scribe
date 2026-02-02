import { and, desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { transcripts, videos } from "../db/schema";
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
	)
	.get(
		"/",
		({ user, query }) => {
			const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
			const offset = Math.max(query.offset ?? 0, 0);

			const userVideos = db
				.select({
					id: videos.id,
					youtubeUrl: videos.youtubeUrl,
					youtubeId: videos.youtubeId,
					title: videos.title,
					duration: videos.duration,
					thumbnailUrl: videos.thumbnailUrl,
					status: videos.status,
					createdAt: videos.createdAt,
					updatedAt: videos.updatedAt,
				})
				.from(videos)
				.where(eq(videos.userId, user.id))
				.orderBy(desc(videos.createdAt))
				.limit(limit)
				.offset(offset)
				.all();

			return {
				videos: userVideos.map((video) => ({
					...video,
					createdAt: video.createdAt.toISOString(),
					updatedAt: video.updatedAt.toISOString(),
				})),
				pagination: {
					limit,
					offset,
					count: userVideos.length,
				},
			};
		},
		{
			auth: true,
			query: t.Object({
				limit: t.Optional(t.Numeric()),
				offset: t.Optional(t.Numeric()),
			}),
		},
	)
	.get(
		"/:id",
		({ params, user, set }) => {
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

			// Fetch transcript if video is completed
			let transcript = null;
			if (video.status === "completed") {
				const transcriptRecord = db
					.select()
					.from(transcripts)
					.where(eq(transcripts.videoId, videoId))
					.get();

				if (transcriptRecord) {
					transcript = {
						id: transcriptRecord.id,
						content: transcriptRecord.content,
						segments: transcriptRecord.segments,
						language: transcriptRecord.language,
						createdAt: transcriptRecord.createdAt.toISOString(),
					};
				}
			}

			return {
				id: video.id,
				youtubeUrl: video.youtubeUrl,
				youtubeId: video.youtubeId,
				title: video.title,
				duration: video.duration,
				thumbnailUrl: video.thumbnailUrl,
				status: video.status,
				createdAt: video.createdAt.toISOString(),
				updatedAt: video.updatedAt.toISOString(),
				transcript,
			};
		},
		{
			auth: true,
			params: t.Object({
				id: t.Numeric(),
			}),
		},
	);
