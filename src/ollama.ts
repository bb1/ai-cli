import type { Config } from "./config.ts";
import { getOSInfo } from "./utils.ts";

export interface GenerateResponse {
	response: string;
	done: boolean;
	context?: number[];
}

export async function generate(config: Config, prompt: string, systemPrompt?: string): Promise<string> {
	const { platform, shell } = getOSInfo();

	const defaultSystemPrompt = `You are a CLI command generator. Return ONLY CSV format.
OS: ${platform}
Shell: ${shell}
Format: command;tools;comment

Rules:
- command = the shell command to execute
- tools = space-separated binary names used in the command
- comment = brief explanation or error message
- If the task is impossible or you don't know, leave command and tools empty, fill only comment
- For complex tasks requiring multiple commands, output up to 7 lines (one command per line)
- Be concise, use standard ${platform} tools
- Do not include any text before or after the CSV lines
- Do not include CSV headers`;

	try {
		const response = await fetch(`${config.ollama.url}/api/generate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: config.ollama.model,
				prompt: prompt,
				system: systemPrompt || defaultSystemPrompt,
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
				`Cannot connect to Ollama at ${config.ollama.url}.\n` +
					`Is Ollama running? Try: ollama serve\n` +
					`Or check your config: ai setup`,
			);
		}
		// Re-throw other errors as-is
		throw error;
	}
}

export async function generateWithContext(
	config: Config,
	prompt: string,
	previousOutput: string,
	iteration: number,
): Promise<string> {
	const { platform, shell } = getOSInfo();

	const systemPrompt = `You are a CLI command generator operating in agent mode. Return ONLY CSV format.
OS: ${platform}
Shell: ${shell}
Format: command;tools;comment
Iteration: ${iteration}/10

Rules:
- command = the shell command to execute
- tools = space-separated binary names used in the command
- comment = brief explanation or error message
- You are continuing a task. The previous command output is provided below.
- Analyze the output and determine the next action
- If the task is complete, respond with: ;;DONE: [summary of what was accomplished]
- If there's an error, try to fix it or explain in the comment
- Do not include any text before or after the CSV lines
- Do not include CSV headers

Previous command output:
${previousOutput}`;

	try {
		const response = await fetch(`${config.ollama.url}/api/generate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: config.ollama.model,
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
				`Cannot connect to Ollama at ${config.ollama.url}.\n` +
					`Is Ollama running? Try: ollama serve\n` +
					`Or check your config: ai setup`,
			);
		}
		// Re-throw other errors as-is
		throw error;
	}
}

export async function retryWithMissingTool(
	config: Config,
	originalPrompt: string,
	missingTools: string[],
): Promise<string> {
	const { platform, shell } = getOSInfo();

	const systemPrompt = `You are a CLI command generator. Return ONLY CSV format.
OS: ${platform}
Shell: ${shell}
Format: command;tools;comment

IMPORTANT: The following tools are NOT available on this system: ${missingTools.join(", ")}
Please suggest an alternative command using only tools that are commonly installed.

Rules:
- command = the shell command to execute
- tools = space-separated binary names used in the command
- comment = brief explanation or error message
- If impossible without the missing tools, leave command empty and explain in comment
- Do not include any text before or after the CSV lines
- Do not include CSV headers`;

	try {
		const response = await fetch(`${config.ollama.url}/api/generate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: config.ollama.model,
				prompt: originalPrompt,
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
				`Cannot connect to Ollama at ${config.ollama.url}.\n` +
					`Is Ollama running? Try: ollama serve\n` +
					`Or check your config: ai setup`,
			);
		}
		// Re-throw other errors as-is
		throw error;
	}
}
