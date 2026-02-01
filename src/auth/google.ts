import * as arctic from "arctic";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri =
	process.env.GOOGLE_REDIRECT_URI ??
	"http://localhost:3000/auth/google/callback";

if (!clientId || !clientSecret) {
	console.warn(
		"Warning: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set for OAuth to work",
	);
}

export const google = new arctic.Google(
	clientId ?? "",
	clientSecret ?? "",
	redirectUri,
);

export interface GoogleUserInfo {
	sub: string;
	email: string;
	email_verified: boolean;
	name: string;
	picture: string;
	given_name?: string;
	family_name?: string;
}

export function createAuthorizationUrl(): {
	url: URL;
	state: string;
	codeVerifier: string;
} {
	const state = arctic.generateState();
	const codeVerifier = arctic.generateCodeVerifier();
	const scopes = ["openid", "profile", "email"];
	const url = google.createAuthorizationURL(state, codeVerifier, scopes);

	return { url, state, codeVerifier };
}

export async function validateCallback(
	code: string,
	codeVerifier: string,
): Promise<{ accessToken: string; idToken: string }> {
	const tokens = await google.validateAuthorizationCode(code, codeVerifier);
	const accessToken = tokens.accessToken();
	const idToken = tokens.idToken();

	return { accessToken, idToken };
}

export function decodeIdToken(idToken: string): GoogleUserInfo {
	const claims = arctic.decodeIdToken(idToken) as GoogleUserInfo;
	return claims;
}

export async function fetchUserInfo(
	accessToken: string,
): Promise<GoogleUserInfo> {
	const response = await fetch(
		"https://openidconnect.googleapis.com/v1/userinfo",
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch user info: ${response.statusText}`);
	}

	return response.json() as Promise<GoogleUserInfo>;
}
