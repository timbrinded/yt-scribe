/**
 * CLI API client for communicating with the YTScribe server
 */

import { getConfig } from "./config";

export interface AddVideoResponse {
	id: number;
	youtubeUrl: string;
	youtubeId: string;
	status: string;
	createdAt: string;
}

export interface ApiError {
	error: string;
	existingVideoId?: number;
}

export class ApiClient {
	private baseUrl: string;
	private sessionToken: string | null = null;

	constructor() {
		const config = getConfig();
		this.baseUrl = config.apiBaseUrl;
	}

	setSessionToken(token: string | null) {
		this.sessionToken = token;
	}

	private async request<T>(
		method: string,
		path: string,
		body?: unknown,
	): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		if (this.sessionToken) {
			headers.Cookie = `session=${this.sessionToken}`;
		}

		const response = await fetch(url, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
		});

		const data = await response.json();

		if (!response.ok) {
			const error = data as ApiError;
			throw new ApiRequestError(
				error.error || "Request failed",
				response.status,
				error,
			);
		}

		return data as T;
	}

	async addVideo(url: string): Promise<AddVideoResponse> {
		return this.request<AddVideoResponse>("POST", "/api/videos", { url });
	}
}

export class ApiRequestError extends Error {
	constructor(
		message: string,
		public statusCode: number,
		public response: ApiError,
	) {
		super(message);
		this.name = "ApiRequestError";
	}
}
