/**
 * CLI configuration
 * Reads settings from environment variables or uses defaults
 */

export interface CliConfig {
	apiBaseUrl: string;
}

export function getConfig(): CliConfig {
	return {
		apiBaseUrl: process.env.YTSCRIBE_API_URL || "http://localhost:3000",
	};
}
