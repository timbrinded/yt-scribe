/**
 * Effect-TS Auth Endpoint Handlers
 *
 * Implements the authentication API endpoints using HttpApiBuilder.group pattern.
 * Handles Google OAuth flow, session management, and user operations.
 *
 * Endpoints:
 * - googleAuth: GET /auth/google - Redirect to Google OAuth consent screen
 * - googleCallback: GET /auth/google/callback - Handle OAuth callback
 * - logout: POST /auth/logout - Clear session and log out
 * - currentUser: GET /auth/me - Get current authenticated user
 *
 * Note: googleAuth, googleCallback, and logout use handleRaw since they need
 * to return raw HTTP responses (redirects or responses with custom cookies).
 *
 * @example
 * ```typescript
 * const AuthGroupLive = HttpApiBuilder.group(YTScribeApi, "auth", (handlers) =>
 *   handlers
 *     .handleRaw("googleAuth", googleAuthHandler)
 *     .handleRaw("googleCallback", googleCallbackHandler)
 *     .handleRaw("logout", logoutHandler)
 *     .handle("currentUser", currentUserHandler)
 * )
 * ```
 */

import {
	HttpApiBuilder,
	HttpServerRequest,
	HttpServerResponse,
} from "@effect/platform";
import { Effect, Option } from "effect";
import { eq } from "drizzle-orm";
import { YTScribeApi } from "../index";
import { CurrentUser } from "../middleware/auth";
import { Database } from "../../services/Database";
import { Auth } from "../../services/Auth";
import { users } from "../../../db/schema";
import {
	createAuthorizationUrl,
	decodeIdToken,
	validateCallback,
} from "../../../auth/google";
import type { CurrentUserResponse } from "../groups/auth";

// =============================================================================
// CONSTANTS
// =============================================================================

/** OAuth cookie expiration: 10 minutes */
const OAUTH_COOKIE_MAX_AGE_SECONDS = 60 * 10;

/** Is production environment */
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/** Frontend URL for redirects after OAuth */
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:4321";

/** Common cookie options */
const cookieOptions = {
	httpOnly: true,
	secure: IS_PRODUCTION,
	sameSite: "lax" as const,
	path: "/",
};

// =============================================================================
// HANDLER: googleAuth (raw)
// =============================================================================

/**
 * GET /auth/google - Initiate Google OAuth flow.
 *
 * Returns raw HttpServerResponse for redirect with cookies.
 *
 * 1. Generate OAuth URL with state and code verifier (PKCE)
 * 2. Store state and code verifier in secure cookies
 * 3. Optionally store CLI callback URL for CLI auth flow
 * 4. Redirect to Google consent screen
 */
const googleAuthHandler = ({
	urlParams,
}: {
	urlParams: { cli_callback: Option.Option<string> };
}) =>
	Effect.sync(() => {
		// Generate OAuth URL with PKCE
		const { url, state, codeVerifier } = createAuthorizationUrl();

		// Extract CLI callback if provided
		const cliCallback = Option.getOrUndefined(urlParams.cli_callback);

		// Build redirect response with cookies
		let response = HttpServerResponse.redirect(url.toString(), { status: 302 });

		// Set OAuth state cookies
		response = HttpServerResponse.unsafeSetCookie(
			response,
			"oauth_state",
			state,
			{ ...cookieOptions, maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS },
		);

		response = HttpServerResponse.unsafeSetCookie(
			response,
			"oauth_code_verifier",
			codeVerifier,
			{ ...cookieOptions, maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS },
		);

		// Add CLI callback cookie if provided
		if (cliCallback) {
			response = HttpServerResponse.unsafeSetCookie(
				response,
				"cli_callback",
				cliCallback,
				{ ...cookieOptions, maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS },
			);
		}

		return response;
	});

// =============================================================================
// HANDLER: googleCallback (raw)
// =============================================================================

/**
 * GET /auth/google/callback - Handle Google OAuth callback.
 *
 * Returns raw HttpServerResponse for redirect with cookies.
 *
 * 1. Validate state parameter matches cookie
 * 2. Exchange authorization code for tokens
 * 3. Decode ID token to get user info
 * 4. Create or update user in database
 * 5. Create session and set cookie
 * 6. Redirect to frontend (or CLI callback URL)
 */
const googleCallbackHandler = ({
	urlParams,
}: {
	urlParams: {
		code: Option.Option<string>;
		state: Option.Option<string>;
		error: Option.Option<string>;
	};
}) =>
	Effect.gen(function* () {
		const { db } = yield* Database;
		const auth = yield* Auth;

		// Get the current request to access cookies
		const request = yield* HttpServerRequest.HttpServerRequest;
		const requestCookies = request.cookies;

		// Extract URL params
		const code = Option.getOrUndefined(urlParams.code);
		const state = Option.getOrUndefined(urlParams.state);
		const errorParam = Option.getOrUndefined(urlParams.error);

		// Extract stored values from cookies
		const storedState = requestCookies.oauth_state;
		const storedCodeVerifier = requestCookies.oauth_code_verifier;
		const cliCallbackUrl = requestCookies.cli_callback;

		// Helper to build response with cleared OAuth cookies
		const buildResponse = (
			baseResponse: HttpServerResponse.HttpServerResponse,
		) => {
			let response = baseResponse;
			// Clear OAuth cookies by setting maxAge to 0
			response = HttpServerResponse.unsafeSetCookie(
				response,
				"oauth_state",
				"",
				{ ...cookieOptions, maxAge: 0 },
			);
			response = HttpServerResponse.unsafeSetCookie(
				response,
				"oauth_code_verifier",
				"",
				{ ...cookieOptions, maxAge: 0 },
			);
			response = HttpServerResponse.unsafeSetCookie(
				response,
				"cli_callback",
				"",
				{ ...cookieOptions, maxAge: 0 },
			);
			return response;
		};

		// Helper to build error response as redirect to frontend error page
		const buildErrorResponse = (message: string) => {
			const errorUrl = new URL(`${FRONTEND_URL}/auth/callback`);
			errorUrl.searchParams.set("error", message);
			return buildResponse(
				HttpServerResponse.redirect(errorUrl.toString(), { status: 302 }),
			);
		};

		// Handle OAuth error from Google
		if (errorParam) {
			return buildErrorResponse(`OAuth error: ${errorParam}`);
		}

		// Validate state parameter
		if (!code || !state || !storedState || state !== storedState) {
			return buildErrorResponse("Invalid OAuth state");
		}

		if (!storedCodeVerifier) {
			return buildErrorResponse("Missing code verifier");
		}

		// Exchange code for tokens
		const tokenResult = yield* Effect.tryPromise({
			try: () => validateCallback(code, storedCodeVerifier),
			catch: (error) =>
				new Error(
					`OAuth token exchange failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				),
		}).pipe(
			Effect.catchAll((error) =>
				Effect.succeed({ error: error.message } as
					| { idToken: string; error?: undefined }
					| { error: string; idToken?: undefined }),
			),
		);

		if ("error" in tokenResult && tokenResult.error) {
			return buildErrorResponse(tokenResult.error);
		}

		const { idToken } = tokenResult as { idToken: string };

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
			user = db
				.insert(users)
				.values({
					email: googleUser.email,
					name: googleUser.name,
					avatarUrl: googleUser.picture,
				})
				.returning()
				.get();
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
		const { token: sessionToken, expiresAt } = yield* auth.createSession(
			user.id,
		);

		// If CLI callback URL is provided, redirect there with the token
		if (cliCallbackUrl) {
			const callbackUrl = new URL(cliCallbackUrl);
			callbackUrl.searchParams.set("token", sessionToken);
			callbackUrl.searchParams.set("expires_at", expiresAt.toISOString());
			return buildResponse(
				HttpServerResponse.redirect(callbackUrl.toString(), { status: 302 }),
			);
		}

		// Build redirect response with session cookie
		const sessionMaxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
		let response = HttpServerResponse.redirect(`${FRONTEND_URL}/library`, {
			status: 302,
		});

		// Clear OAuth cookies and set session cookie
		response = buildResponse(response);
		response = HttpServerResponse.unsafeSetCookie(
			response,
			"session",
			sessionToken,
			{ ...cookieOptions, maxAge: sessionMaxAge },
		);

		return response;
	});

// =============================================================================
// HANDLER: logout (raw)
// =============================================================================

/**
 * POST /auth/logout - Log out and clear session.
 *
 * Returns raw HttpServerResponse to set cookies on the response.
 *
 * 1. Get session token from cookie
 * 2. Delete session from database
 * 3. Clear session cookie
 * 4. Return success response
 *
 * Note: Requires Authorization middleware which validates the session.
 */
const logoutHandler = () =>
	Effect.gen(function* () {
		const auth = yield* Auth;

		// Get the current request to access cookies
		const request = yield* HttpServerRequest.HttpServerRequest;
		const sessionToken = request.cookies.session;

		// Delete session from database if it exists
		if (sessionToken) {
			yield* auth.deleteSession(sessionToken);
		}

		// Build response with cleared session cookie
		// Note: orDie is safe here since we're serializing a simple { success: boolean } object
		let response = yield* HttpServerResponse.json({ success: true }).pipe(
			Effect.orDie,
		);

		// Clear session cookie
		response = HttpServerResponse.unsafeSetCookie(response, "session", "", {
			...cookieOptions,
			maxAge: 0,
		});

		return response;
	});

// =============================================================================
// HANDLER: currentUser
// =============================================================================

/**
 * GET /auth/me - Get current authenticated user.
 *
 * Returns the authenticated user from the CurrentUser context.
 * The Authorization middleware has already validated the session.
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
 * Note: OAuth and logout endpoints use handleRaw since they return
 * raw HTTP responses (redirects or responses with cookies).
 *
 * Dependencies:
 * - Database: For user persistence
 * - Auth: For session management
 * - CurrentUser: Provided by Authorization middleware for protected endpoints
 */
export const AuthGroupLive = HttpApiBuilder.group(
	YTScribeApi,
	"auth",
	(handlers) =>
		handlers
			.handleRaw("googleAuth", googleAuthHandler)
			.handleRaw("googleCallback", googleCallbackHandler)
			.handleRaw("logout", logoutHandler)
			.handle("currentUser", currentUserHandler),
);
