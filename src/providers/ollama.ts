import type { Config } from "../config.ts";
import { BaseProvider } from "./base.ts";

interface GenerateResponse {
	response: string;
	done: boolean;
	context?: number[];
}

export class OllamaProvider extends BaseProvider {
	constructor(private config: Config) {
		super();
	}

	protected async callAPI(prompt: string, systemPrompt: string): Promise<string> {
		if (!this.config.ollama) {
			throw new Error("Ollama configuration missing");
		}

		try {
			const response = await fetch(`${this.config.ollama.url}/api/generate`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: this.config.ollama.model,
					prompt: prompt,
					system: systemPrompt,
					stream: false,
				}),
			});

			if (!response.ok) {
				throw new Error(`Ollama API error: ${response.statusText}`);
			}

			const data = (await response.json()) as GenerateResponse;
			return data.response.trim();
		} catch (error) {
			// Handle network/connection errors
			const errorMessage = error instanceof Error ? error.message : String(error);
			if (
				error instanceof TypeError ||
				errorMessage.includes("connect") ||
				errorMessage.includes("Unable to connect") ||
				errorMessage.includes("fetch failed") ||
				errorMessage.includes("ECONNREFUSED")
			) {
				throw new Error(
					`Cannot connect to Ollama at ${this.config.ollama?.url}.\n` +
					`Is Ollama running? Try: ollama serve\n` +
					`Or check your config: ai setup`,
				);
			}
			// Re-throw other errors as-is
			throw error;
		}
	}
}
