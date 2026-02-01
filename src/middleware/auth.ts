import { Elysia, t } from "elysia";
import { type SessionWithUser, validateSession } from "../auth/session";

export type AuthUser = SessionWithUser["user"];

/**
 * Auth middleware for protected routes.
 * Extracts session token from cookie, validates it, and attaches user to context.
 * Returns 401 for invalid or missing sessions.
 *
 * Usage:
 * ```typescript
 * const app = new Elysia()
 *   .use(authMiddleware)
 *   .get('/protected', ({ user }) => user, { auth: true })
 * ```
 */
export const authMiddleware = new Elysia({ name: "auth-middleware" })
	.guard({
		cookie: t.Cookie({
			session: t.Optional(t.String()),
		}),
	})
	.macro({
		auth: {
			resolve({ cookie: { session }, status }) {
				const sessionToken = session?.value;

				if (!sessionToken || typeof sessionToken !== "string") {
					return status(401, { error: "Not authenticated" });
				}

				const result = validateSession(sessionToken);

				if (!result) {
					// Clear invalid cookie
					session?.remove();
					return status(401, { error: "Invalid or expired session" });
				}

				return { user: result.user };
			},
		},
	});
