import { getOSInfo } from "./utils.ts";

/**
 * Build the system prompt for command generation
 */
export function buildSystemPrompt(
	maxCommands = 7,
	planningContext?: {
		availableTools?: string[];
		unavailableTools?: string[];
		shellHistory?: string;
		draft?: string;
	},
): string {
	const { platform, shell } = getOSInfo();

	let contextSection = "";
	if (planningContext) {
		if (planningContext.draft) {
			contextSection += `\nPlan: ${planningContext.draft}`;
		}
		if (planningContext.availableTools && planningContext.availableTools.length > 0) {
			contextSection += `\nAvailable: ${planningContext.availableTools.join(", ")}`;
		}
		if (planningContext.unavailableTools && planningContext.unavailableTools.length > 0) {
			contextSection += `\nUnavailable: ${planningContext.unavailableTools.join(", ")}`;
		}
		if (planningContext.shellHistory) {
			contextSection += `\nHistory:\n${planningContext.shellHistory}`;
		}
	}

	return `CLI command generator. OS: ${platform}, Shell: ${shell}${contextSection}
Format: command;tools;comment

CRITICAL: Output exactly ONE command that solves the task.
Only output multiple commands (up to ${maxCommands}) when the task REQUIRES sequential steps.
Do NOT output alternative solutions or variations.

Rules:
- command = shell command to execute
- tools = space-separated binaries (e.g., "find wc")
- comment = brief explanation
- If impossible, leave command/tools empty, explain in comment
- No text before/after CSV, no headers, no code blocks`;
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
 * Build the planning system prompt for the LLM
 */
export function buildPlanningSystemPrompt(
	iteration: number,
	maxIterations: number,
	context?: {
		availableTools?: string[];
		unavailableTools?: string[];
		shellHistory?: string;
		draft?: string;
	},
): string {
	const { platform, shell } = getOSInfo();

	let contextSection = "";
	if (context) {
		if (context.availableTools && context.availableTools.length > 0) {
			contextSection += `\nAvailable: ${context.availableTools.join(", ")}`;
		}
		if (context.unavailableTools && context.unavailableTools.length > 0) {
			contextSection += `\nUnavailable: ${context.unavailableTools.join(", ")}`;
		}
		if (context.shellHistory) {
			contextSection += `\nHistory:\n${context.shellHistory}`;
		}
		if (context.draft) {
			contextSection += `\nDraft plan: ${context.draft}`;
		}
	}

	// If we have context, encourage READY response
	const hasContext = context?.availableTools?.length || context?.shellHistory;

	if (hasContext) {
		return `Planning ${iteration}/${maxIterations}. OS: ${platform}, Shell: ${shell}${contextSection}

You now have the information you requested. Output ONLY:
READY: your final plan based on the info above`;
	}

	return `Planning ${iteration}/${maxIterations}. OS: ${platform}, Shell: ${shell}

You are planning a CLI command. Output ONE of these response types:

OPTION A - Need to check uncommon tools (jq, yq, ripgrep, etc):
CHECK_TOOLS: tool1 tool2

OPTION B - Need user's command history for context:
CHECK_HISTORY: search_term

OPTION C - Ready to generate command (use for common tools like find, grep, awk, sed, sort, wc):
READY: your plan

IMPORTANT: Choose ONLY ONE option. If you choose A or B, do NOT include READY - you will get another turn after receiving the results.

Example for "count files": READY: Use find with -type f piped to wc -l
Example for "parse yaml": CHECK_TOOLS: yq
Example for "repeat last docker command": CHECK_HISTORY: docker`;
}

/**
 * Format the user query for the LLM
 */
export function formatUserQuery(query: string): string {
	return `User request: ${query}`;
}
