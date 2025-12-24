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

	if (parts.length < 2) {
		// If there are no semicolons, it's not a valid command format
		// This filters out conversational text like "Here is the command:" or follow-up questions
		return null;
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
 * Extract the binary name from a command string
 * Returns the first word that looks like a binary (not a shell operator or keyword)
 */
function extractBinaryFromCommand(command: string): string | null {
	if (!command.trim()) {
		return null;
	}

	// Remove leading shell operators and redirections
	const cleaned = command
		.replace(/^[;&|]+\s*/, "") // Remove leading ; & |
		.replace(/^\s*\(+\s*/, "") // Remove leading (
		.trim();

	if (!cleaned) {
		return null;
	}

	// Split by spaces, but handle quoted arguments
	const parts = cleaned.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
	if (!parts || parts.length === 0) {
		return null;
	}

	// Get the first part and remove quotes
	let firstPart = parts[0].replace(/^["']|["']$/g, "");

	// Remove variable assignments (e.g., "VAR=value command")
	if (firstPart.includes("=") && !firstPart.startsWith("$")) {
		// If it's an assignment, get the command after =
		const afterEquals = firstPart.split("=").slice(-1)[0];
		if (afterEquals) {
			firstPart = afterEquals;
		}
	}

	// Skip if it's a shell operator
	const operators = ["|", "&", ";", "&&", "||", ">", ">>", "<", "<<", "(", ")", "{", "}"];
	if (operators.includes(firstPart)) {
		return null;
	}

	// Skip if it starts with special characters (except for paths)
	if (firstPart.startsWith("$") || firstPart.startsWith("@")) {
		return null;
	}

	return firstPart;
}

/**
 * Extract all unique tools from parsed commands
 * Uses the actual command string to extract binaries, not the tools field
 */
export function extractAllTools(commands: ParsedCommand[]): string[] {
	const toolSet = new Set<string>();

	for (const cmd of commands) {
		if (cmd.command) {
			const binary = extractBinaryFromCommand(cmd.command);
			if (binary) {
				toolSet.add(binary);
			}
		}
		// Also check the tools field, but filter out common non-binary words
		for (const tool of cmd.tools) {
			// Filter out common words that are clearly not binaries
			const commonWords = [
				"in",
				"the",
				"a",
				"an",
				"and",
				"or",
				"for",
				"to",
				"from",
				"with",
				"by",
				"at",
				"on",
				"is",
				"are",
				"was",
				"were",
				"be",
				"been",
				"have",
				"has",
				"had",
				"do",
				"does",
				"did",
				"will",
				"would",
				"should",
				"could",
				"may",
				"might",
				"must",
				"can",
				"files",
				"file",
				"directory",
				"dir",
				"folder",
				"path",
				"paths",
			];
			const lowerTool = tool.toLowerCase();
			if (!commonWords.includes(lowerTool) && tool.length > 0 && /^[a-zA-Z0-9_-]+$/.test(tool)) {
				// Only add if it looks like a valid binary name (alphanumeric, underscore, hyphen)
				toolSet.add(tool);
			}
		}
	}

	return Array.from(toolSet);
}
