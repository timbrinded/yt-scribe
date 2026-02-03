/// <reference path="../.astro/types.d.ts" />

/**
 * User data stored in context.locals by auth middleware
 */
interface AuthUser {
	id: number;
	email: string;
	name: string | null;
	avatarUrl: string | null;
}

declare namespace App {
	interface Locals {
		user?: AuthUser;
	}
}
