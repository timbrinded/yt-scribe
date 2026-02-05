/**
 * Effect-TS HttpApi Definition for YTScribe
 *
 * This file defines the main HttpApi schema that composes all API groups.
 * The API is built using @effect/platform's HttpApi modules with the chainable API.
 *
 * Groups:
 * - videos: Video management endpoints (CRUD, retry, status stream)
 * - chat: Chat conversation endpoints
 * - auth: Authentication endpoints (OAuth, logout)
 *
 * @example
 * ```typescript
 * import { YTScribeApi } from "./api"
 * import { HttpApiBuilder } from "@effect/platform"
 *
 * const HttpLive = HttpApiBuilder.serve(YTScribeApi).pipe(
 *   Layer.provide(VideosGroupLive),
 *   Layer.provide(ChatGroupLive),
 *   Layer.provide(AuthGroupLive),
 * )
 * ```
 */

import { HttpApi, OpenApi } from "@effect/platform";
import { VideosGroup } from "./groups/videos";
import { ChatGroup } from "./groups/chat";
import { AuthGroup } from "./groups/auth";
import { AdminGroup } from "./groups/admin";
import { HealthGroup } from "./groups/health";

/**
 * YTScribe API definition.
 *
 * Composes all endpoint groups into a single API.
 * OpenAPI documentation is automatically generated from the schema.
 */
export const YTScribeApi = HttpApi.make("ytscribe")
	.add(VideosGroup)
	.add(ChatGroup)
	.add(AuthGroup)
	.add(AdminGroup)
	.add(HealthGroup)
	.annotate(OpenApi.Title, "YTScribe API")
	.annotate(
		OpenApi.Description,
		"YouTube Video Knowledge Base with LLM Chat - API for managing video transcriptions and AI-powered conversations",
	)
	.annotate(OpenApi.Version, "1.0.0");

// Re-export groups for handler implementations
export { VideosGroup } from "./groups/videos";
export { ChatGroup } from "./groups/chat";
export { AuthGroup } from "./groups/auth";
export { AdminGroup } from "./groups/admin";
export { HealthGroup } from "./groups/health";
