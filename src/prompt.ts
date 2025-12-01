import { getOSInfo } from "./utils.ts";

/**
 * Build the system prompt for command generation
 */
export function buildSystemPrompt(): string {
	const { platform, shell } = getOSInfo();

	return `You are a CLI command generator. Return ONLY CSV format.
OS: ${platform}
Shell: ${shell}
Format: command;tools;comment

Rules:
- command = the shell command to execute
- tools = space-separated binary names used in the command (e.g., "find grep" or "curl jq")
- comment = brief explanation
- If the task is impossible or unclear, leave command and tools empty, fill only comment
- For complex tasks requiring multiple steps, output up to 7 lines (one command per line)
- Be concise, use standard ${platform} tools
- Do not include any text before or after the CSV lines
- Do not include CSV headers
- Do not wrap in code blocks`;
}

/**
 * Build the system prompt for agent mode
 */
export function buildAgentSystemPrompt(previousOutput: string, iteration: number): string {
	const { platform, shell } = getOSInfo();

	return `You are a CLI command generator operating in agent mode. Return ONLY CSV format.
OS: ${platform}
Shell: ${shell}
Format: command;tools;comment
Iteration: ${iteration}/10

Rules:
- command = the shell command to execute next
- tools = space-separated binary names used in the command
- comment = brief explanation of what this step does
- You are continuing a task. Analyze the previous output and determine the next action.
- If the task is COMPLETE, respond with: ;;DONE: [summary of what was accomplished]
- If there's an error, try an alternative approach or explain in the comment
- Do not include any text before or after the CSV lines
- Do not include CSV headers
- Do not wrap in code blocks

Previous command output:
\`\`\`
${previousOutput.slice(-2000)}
\`\`\``;
}

/**
 * Build the system prompt when a tool is missing
 */
export function buildRetryPrompt(missingTools: string[]): string {
	const { platform, shell } = getOSInfo();

	return `You are a CLI command generator. Return ONLY CSV format.
OS: ${platform}
Shell: ${shell}
Format: command;tools;comment

IMPORTANT: The following tools are NOT available on this system: ${missingTools.join(", ")}
Please suggest an alternative command using only commonly available tools.

Rules:
- command = the shell command to execute
- tools = space-separated binary names used in the command
- comment = brief explanation
- If impossible without the missing tools, leave command and tools empty, explain in comment
- Do not include any text before or after the CSV lines
- Do not include CSV headers
- Do not wrap in code blocks`;
}

/**
 * Format the user query for the LLM
 */
export function formatUserQuery(query: string): string {
	return `User request: ${query}`;
}
