import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { users } from "../db/schema";
import {
	createAuthorizationUrl,
	decodeIdToken,
	validateCallback,
} from "./google";
import { createSession, deleteSession, validateSession } from "./session";

const OAUTH_COOKIE_MAX_AGE = 60 * 10; // 10 minutes

export const authRoutes = new Elysia({ prefix: "/auth" })
	.get(
		"/google",
		({ cookie: { oauth_state, oauth_code_verifier }, redirect }) => {
			const { url, state, codeVerifier } = createAuthorizationUrl();

			// Store state and code verifier in cookies for validation in callback
			oauth_state.value = state;
			oauth_state.httpOnly = true;
			oauth_state.secure = process.env.NODE_ENV === "production";
			oauth_state.sameSite = "lax";
			oauth_state.maxAge = OAUTH_COOKIE_MAX_AGE;
			oauth_state.path = "/";

			oauth_code_verifier.value = codeVerifier;
			oauth_code_verifier.httpOnly = true;
			oauth_code_verifier.secure = process.env.NODE_ENV === "production";
			oauth_code_verifier.sameSite = "lax";
			oauth_code_verifier.maxAge = OAUTH_COOKIE_MAX_AGE;
			oauth_code_verifier.path = "/";

			return redirect(url.toString());
		},
		{
			cookie: t.Cookie({
				oauth_state: t.Optional(t.String()),
				oauth_code_verifier: t.Optional(t.String()),
			}),
		},
	)
	.get(
		"/google/callback",
		async ({
			query,
			cookie: { oauth_state, oauth_code_verifier, session },
			redirect,
			set,
		}) => {
			const { code, state } = query;
			const storedState = oauth_state.value;
			const storedCodeVerifier = oauth_code_verifier.value;

			// Clear OAuth cookies
			oauth_state.remove();
			oauth_code_verifier.remove();

			// Validate state
			if (!code || !state || !storedState || state !== storedState) {
				set.status = 400;
				return { error: "Invalid OAuth state" };
			}

			if (!storedCodeVerifier) {
				set.status = 400;
				return { error: "Missing code verifier" };
			}

			try {
				// Exchange code for tokens
				const { idToken } = await validateCallback(code, storedCodeVerifier);

				// Decode ID token to get user info
				const googleUser = decodeIdToken(idToken);

				// Find or create user in database
				let user = db
					.select()
					.from(users)
					.where(eq(users.email, googleUser.email))
					.get();

				if (!user) {
					// Create new user
					const result = db
						.insert(users)
						.values({
							email: googleUser.email,
							name: googleUser.name,
							avatarUrl: googleUser.picture,
						})
						.returning()
						.get();
					user = result;
				} else {
					// Update existing user with latest info from Google
					db.update(users)
						.set({
							name: googleUser.name,
							avatarUrl: googleUser.picture,
						})
						.where(eq(users.id, user.id))
						.run();
				}

				// Create server-side session
				const { token: sessionToken, expiresAt } = createSession(user.id);

				// Store session token in secure cookie
				session.value = sessionToken;
				session.httpOnly = true;
				session.secure = process.env.NODE_ENV === "production";
				session.sameSite = "lax";
				session.maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
				session.path = "/";

				// Redirect to frontend after successful login
				const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:4321";
				return redirect(`${frontendUrl}/library`);
			} catch (error) {
				console.error("OAuth callback error:", error);
				set.status = 500;
				return { error: "Authentication failed" };
			}
		},
		{
			query: t.Object({
				code: t.Optional(t.String()),
				state: t.Optional(t.String()),
				error: t.Optional(t.String()),
			}),
			cookie: t.Cookie({
				oauth_state: t.Optional(t.String()),
				oauth_code_verifier: t.Optional(t.String()),
				session: t.Optional(t.String()),
			}),
		},
	)
	.get(
		"/me",
		({ cookie: { session }, set }) => {
			const sessionToken = session.value;

			if (!sessionToken) {
				set.status = 401;
				return { error: "Not authenticated" };
			}

			const result = validateSession(sessionToken);

			if (!result) {
				// Clear invalid cookie
				session.remove();
				set.status = 401;
				return { error: "Invalid or expired session" };
			}

			return {
				id: result.user.id,
				email: result.user.email,
				name: result.user.name,
				avatarUrl: result.user.avatarUrl,
			};
		},
		{
			cookie: t.Cookie({
				session: t.Optional(t.String()),
			}),
		},
	)
	.post(
		"/logout",
		({ cookie: { session } }) => {
			const sessionToken = session.value;

			// Delete session from database if it exists
			if (sessionToken) {
				deleteSession(sessionToken);
			}

			// Clear the cookie
			session.remove();
			return { message: "Logged out successfully" };
		},
		{
			cookie: t.Cookie({
				session: t.Optional(t.String()),
			}),
		},
	);
