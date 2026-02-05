/**
 * Effect-TS Auth Endpoint Handlers (Clerk)
 *
 * With Clerk handling OAuth flows externally, this module is simplified to
 * just the current user endpoint. Clerk manages sign-in/sign-out UI.
 *
 * Endpoints:
 * - currentUser: GET /auth/me - Get current authenticated user
 *
 * @example
 * ```typescript
 * const AuthGroupLive = HttpApiBuilder.group(YTScribeApi, "auth", (handlers) =>
 *   handlers.handle("currentUser", currentUserHandler)
 * )
 * ```
 */

import { HttpApiBuilder } from "@effect/platform";
import { Effect } from "effect";
import { YTScribeApi } from "../index";
import { CurrentUser } from "../middleware/auth";
import type { CurrentUserResponse } from "../groups/auth";

// =============================================================================
// HANDLER: currentUser
// =============================================================================

/**
 * GET /auth/me - Get current authenticated user.
 *
 * Returns the authenticated user from the CurrentUser context.
 * The Authorization middleware has already validated the Clerk JWT.
 */
const currentUserHandler = () =>
	Effect.gen(function* () {
		const user = yield* CurrentUser;

		return {
			id: user.id,
			email: user.email,
			name: user.name,
			avatarUrl: user.avatarUrl,
		} satisfies typeof CurrentUserResponse.Type;
	});

// =============================================================================
// GROUP LAYER
// =============================================================================

/**
 * Live layer providing auth endpoint handlers.
 *
 * With Clerk, we only need the /auth/me endpoint.
 * Clerk handles sign-in, sign-out, and OAuth externally.
 */
export const AuthGroupLive = HttpApiBuilder.group(
	YTScribeApi,
	"auth",
	(handlers) => handlers.handle("currentUser", currentUserHandler),
);
