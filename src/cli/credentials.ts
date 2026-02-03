/**
 * CLI credentials manager
 * Stores and retrieves session tokens from ~/.ytscribe/credentials.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface Credentials {
	sessionToken: string;
}

const YTSCRIBE_DIR = join(homedir(), ".ytscribe");
const CREDENTIALS_FILE = join(YTSCRIBE_DIR, "credentials.json");

function ensureDir() {
	if (!existsSync(YTSCRIBE_DIR)) {
		mkdirSync(YTSCRIBE_DIR, { recursive: true });
	}
}

export function loadCredentials(): Credentials | null {
	try {
		if (!existsSync(CREDENTIALS_FILE)) {
			return null;
		}
		const content = readFileSync(CREDENTIALS_FILE, "utf-8");
		return JSON.parse(content) as Credentials;
	} catch {
		return null;
	}
}

export function saveCredentials(credentials: Credentials): void {
	ensureDir();
	writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
}

export function clearCredentials(): void {
	try {
		if (existsSync(CREDENTIALS_FILE)) {
			writeFileSync(CREDENTIALS_FILE, "{}");
		}
	} catch {
		// Ignore errors when clearing
	}
}

export function getSessionToken(): string | null {
	const credentials = loadCredentials();
	return credentials?.sessionToken ?? null;
}
