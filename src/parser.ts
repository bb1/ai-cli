export interface ParsedCommand {
	command: string;
	tools: string[];
	comment: string;
}

export interface ParseResult {
	commands: ParsedCommand[];
	isError: boolean;
	errorMessage?: string;
}

/**
 * Parse a single CSV line into a ParsedCommand
 */
function parseLine(line: string): ParsedCommand | null {
	const trimmed = line.trim();

	// Skip empty lines
	if (!trimmed) {
		return null;
	}

	// Skip lines that look like headers
	if (trimmed.toLowerCase().startsWith("command;") && trimmed.toLowerCase().includes("tools")) {
		return null;
	}

	// Split by semicolon, but handle potential edge cases
	const parts = trimmed.split(";");

	if (parts.length < 3) {
		// If there's only one or two parts, try to make sense of it
		if (parts.length === 1) {
			// Could be just a comment
			return {
				command: "",
				tools: [],
				comment: parts[0].trim(),
			};
		}
		if (parts.length === 2) {
			return {
				command: parts[0].trim(),
				tools: parts[1].trim().split(/\s+/).filter(Boolean),
				comment: "",
			};
		}
	}

	// Join everything after the second semicolon as the comment (in case comment contains semicolons)
	const command = parts[0].trim();
	const tools = parts[1].trim().split(/\s+/).filter(Boolean);
	const comment = parts.slice(2).join(";").trim();

	return {
		command,
		tools,
		comment,
	};
}

const DEFAULT_MAX_COMMANDS = 7;

/**
 * Parse the LLM response into structured commands
 */
export function parseResponse(response: string, maxCommands: number = DEFAULT_MAX_COMMANDS): ParseResult {
	const lines = response.split("\n").filter((line) => line.trim());

	// Check if the response indicates an error or inability to help
	const lowerResponse = response.toLowerCase();
	if (lowerResponse.includes("i cannot") || lowerResponse.includes("i'm unable") || lowerResponse.includes("sorry")) {
		return {
			commands: [],
			isError: true,
			errorMessage: response,
		};
	}

	const commands: ParsedCommand[] = [];

	for (const line of lines) {
		// Skip markdown code fences if the LLM wrapped the response
		if (line.startsWith("```")) {
			continue;
		}

		const parsed = parseLine(line);
		if (parsed) {
			commands.push(parsed);
		}

		// Limit commands based on config
		if (commands.length >= maxCommands) {
			break;
		}
	}

	// Check if we only got comments (no actual commands)
	const hasCommands = commands.some((c) => c.command.length > 0);

	if (!hasCommands && commands.length > 0) {
		// Extract the comments as an error message
		const comments = commands.map((c) => c.comment).filter(Boolean);
		return {
			commands: [],
			isError: true,
			errorMessage: comments.join("\n") || "Unable to generate a command for this request.",
		};
	}

	if (commands.length === 0) {
		return {
			commands: [],
			isError: true,
			errorMessage: "Could not parse the response. Please try rephrasing your request.",
		};
	}

	return {
		commands,
		isError: false,
	};
}

/**
 * Check if the response indicates the agent task is done
 */
export function isAgentDone(response: string): { done: boolean; summary?: string } {
	const trimmed = response.trim();

	// Check for DONE marker in comment
	if (trimmed.includes(";;DONE:")) {
		const match = trimmed.match(/;;DONE:\s*(.+)/);
		return {
			done: true,
			summary: match ? match[1].trim() : "Task completed.",
		};
	}

	// Check for done indicators in the response text itself (for empty commands)
	const lowerResponse = trimmed.toLowerCase();
	if (
		(trimmed.startsWith(";;") || trimmed.startsWith(";")) &&
		(lowerResponse.includes("task complete") ||
			lowerResponse.includes("completed") ||
			lowerResponse.includes("finished") ||
			lowerResponse.includes("done"))
	) {
		// Extract the summary from the comment portion
		const commentPart = trimmed.replace(/^;+/, "").trim();
		return {
			done: true,
			summary: commentPart,
		};
	}

	// Check for done indicators in comment field
	const parsed = parseResponse(response);
	if (parsed.commands.length === 1 && !parsed.commands[0].command) {
		const comment = parsed.commands[0].comment.toLowerCase();
		if (
			comment.includes("task complete") ||
			comment.includes("done") ||
			comment.includes("finished") ||
			comment.includes("successfully completed")
		) {
			return {
				done: true,
				summary: parsed.commands[0].comment,
			};
		}
	}

	return { done: false };
}

/**
 * Extract all unique tools from parsed commands
 */
export function extractAllTools(commands: ParsedCommand[]): string[] {
	const toolSet = new Set<string>();

	for (const cmd of commands) {
		for (const tool of cmd.tools) {
			toolSet.add(tool);
		}
	}

	return Array.from(toolSet);
}
