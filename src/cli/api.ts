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

export interface VideoListItem {
	id: number;
	youtubeUrl: string;
	youtubeId: string;
	title: string | null;
	duration: number | null;
	thumbnailUrl: string | null;
	status: string;
	createdAt: string;
	updatedAt: string;
}

export interface ListVideosResponse {
	videos: VideoListItem[];
	pagination: {
		limit: number;
		offset: number;
		count: number;
	};
}

export interface ListVideosOptions {
	limit?: number;
	offset?: number;
	status?: string;
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

	async listVideos(options: ListVideosOptions = {}): Promise<ListVideosResponse> {
		const params = new URLSearchParams();
		if (options.limit !== undefined) {
			params.set("limit", String(options.limit));
		}
		if (options.offset !== undefined) {
			params.set("offset", String(options.offset));
		}
		const queryString = params.toString();
		const path = queryString ? `/api/videos?${queryString}` : "/api/videos";
		return this.request<ListVideosResponse>("GET", path);
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
