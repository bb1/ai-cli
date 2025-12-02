import type { Config } from "./config.ts";
import { checkBinaryExists } from "./executor.ts";
import { generate } from "./ollama.ts";
import { buildPlanningSystemPrompt } from "./prompt.ts";
import { getHomeDir, logInfo, yellow } from "./utils.ts";

export interface PlanningResponse {
	type: "check_tools" | "check_history" | "check_both" | "ready";
	tools?: string[];
	historySearch?: string;
	draft?: string;
}

export interface PlanningContext {
	availableTools: string[];
	unavailableTools: string[];
	shellHistory?: string;
	draft?: string;
}

/**
 * Parse planning response from LLM
 * - READY alone means planning is complete
 * - CHECK_TOOLS, CHECK_HISTORY, DRAFT can be combined
 * - DRAFT is always extracted to provide context for command generation
 */
export function parsePlanningResponse(response: string): PlanningResponse | null {
	const lines = response
		.trim()
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	if (lines.length === 0) {
		return null;
	}

	// Scan all lines for all action types
	let hasReady = false;
	let readyPlan: string | undefined;
	let tools: string[] | undefined;
	let historySearch: string | undefined;
	let draft: string | undefined;

	for (const line of lines) {
		const upper = line.toUpperCase();
		if (upper.startsWith("READY")) {
			hasReady = true;
			// Extract plan from READY: plan text (if any)
			const plan = line.replace(/^READY:?\s*/i, "").trim();
			if (plan) {
				readyPlan = plan;
			}
		}
		if (upper.startsWith("CHECK_TOOLS:") && !tools) {
			const toolsLine = line.replace(/^CHECK_TOOLS:\s*/i, "").trim();
			tools = toolsLine
				.split(/\s+/)
				.filter((t) => t.length > 0)
				.map((t) => t.toLowerCase());
		}
		if (upper.startsWith("CHECK_HISTORY:") && !historySearch) {
			historySearch = line.replace(/^CHECK_HISTORY:\s*/i, "").trim();
		}
		if (upper.startsWith("DRAFT:") && !draft) {
			draft = line.replace(/^DRAFT:\s*/i, "").trim();
		}
	}

	// If READY is present, planning is complete
	// Use readyPlan if provided, otherwise fall back to draft
	if (hasReady) {
		return { type: "ready", draft: readyPlan || draft };
	}

	// Return combined result
	if (tools && tools.length > 0 && historySearch) {
		return { type: "check_both", tools, historySearch, draft };
	}
	if (tools && tools.length > 0) {
		return { type: "check_tools", tools, draft };
	}
	if (historySearch) {
		return { type: "check_history", historySearch, draft };
	}

	// If only DRAFT, treat as ready with draft
	if (draft) {
		return { type: "ready", draft };
	}

	// Try to detect implicit ready state (if response doesn't match any pattern)
	const firstLine = lines[0].toUpperCase();
	if (firstLine.length > 0 && !firstLine.startsWith("CHECK_") && !firstLine.startsWith("DRAFT")) {
		return { type: "ready" };
	}

	return null;
}

/**
 * Check if tools are available using 'which' (Unix) or 'where' (Windows) command
 * This is more reliable than Bun.which for some edge cases
 */
async function checkToolExists(tool: string): Promise<boolean> {
	try {
		// Use 'where' on Windows, 'which' on Unix
		const command = process.platform === "win32" ? "where" : "which";
		const proc = Bun.spawn([command, tool], {
			stdout: "pipe",
			stderr: "pipe",
		});

		const exitCode = await proc.exited;
		return exitCode === 0;
	} catch {
		// Fallback to Bun.which if command fails
		return checkBinaryExists(tool);
	}
}

/**
 * Check if tools are available
 */
export async function checkToolsAvailability(tools: string[]): Promise<{ available: string[]; unavailable: string[] }> {
	const available: string[] = [];
	const unavailable: string[] = [];

	// Check all tools in parallel
	const checks = await Promise.all(
		tools.map(async (tool) => {
			const exists = await checkToolExists(tool);
			return { tool, exists };
		}),
	);

	for (const { tool, exists } of checks) {
		if (exists) {
			available.push(tool);
		} else {
			unavailable.push(tool);
		}
	}

	return { available, unavailable };
}

/**
 * Query shell history for relevant commands
 */
export async function queryShellHistory(searchTerm: string, limit = 10): Promise<string> {
	const home = getHomeDir();
	let historyFile: string;
	let historyCommand: string;

	// Determine history file and command based on shell
	const shell = process.env.SHELL || "/bin/bash";
	if (shell.includes("zsh")) {
		historyFile = `${home}/.zsh_history`;
		historyCommand = `grep -i "${searchTerm}" "${historyFile}" | tail -${limit}`;
	} else if (shell.includes("fish")) {
		historyFile = `${home}/.local/share/fish/fish_history`;
		historyCommand = `grep -i "${searchTerm}" "${historyFile}" | tail -${limit}`;
	} else {
		// Default to bash
		historyFile = `${home}/.bash_history`;
		historyCommand = `grep -i "${searchTerm}" "${historyFile}" | tail -${limit}`;
	}

	try {
		const proc = Bun.spawn(["sh", "-c", historyCommand], {
			stdout: "pipe",
			stderr: "pipe",
		});

		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();
		await proc.exited;

		if (stderr && !stdout) {
			// History file might not exist or be readable
			return "";
		}

		return stdout.trim();
	} catch {
		return "";
	}
}

/**
 * Run the planning phase
 */
export async function runPlanningPhase(
	config: Config,
	query: string,
	maxIterations: number,
	isDevMode: boolean,
): Promise<PlanningContext> {
	const context: PlanningContext = {
		availableTools: [],
		unavailableTools: [],
	};

	// Quick check if Ollama is reachable before starting planning
	try {
		const testResponse = await fetch(`${config.ollama.url}/api/tags`, {
			signal: AbortSignal.timeout(2000),
		});
		if (!testResponse.ok) {
			// Ollama is not responding, skip planning
			if (isDevMode) {
				logInfo("⚠️  Ollama not reachable, skipping planning phase");
			}
			return context;
		}
	} catch {
		// Connection error, skip planning
		if (isDevMode) {
			logInfo("⚠️  Cannot connect to Ollama, skipping planning phase");
		}
		return context;
	}

	let iteration = 0;
	const checkedTools = new Set<string>();
	const checkedHistoryTerms = new Set<string>();

	while (iteration < maxIterations) {
		iteration++;

		if (isDevMode) {
			logInfo(`\n🔍 Planning phase - Iteration ${iteration}/${maxIterations}`);
		}

		try {
			const systemPrompt = buildPlanningSystemPrompt(iteration, maxIterations, context);
			const userPrompt = `User request: ${query}`;
			const response = await generate(config, userPrompt, systemPrompt);

			if (isDevMode) {
				console.log(yellow(`\nPlanning response:\n${response}\n`));
			}

			const parsed = parsePlanningResponse(response);

			if (!parsed) {
				if (isDevMode) {
					logInfo("Could not parse planning response, assuming ready");
				}
				break;
			}

			// Store draft if present
			if (parsed.draft) {
				context.draft = parsed.draft;
				if (isDevMode) {
					logInfo(`📝 Draft: ${parsed.draft}`);
				}
			}

			if ((parsed.type === "check_tools" || parsed.type === "check_both") && parsed.tools) {
				// Check tools that haven't been checked yet
				const toolsToCheck = parsed.tools.filter((t) => !checkedTools.has(t.toLowerCase()));
				if (toolsToCheck.length > 0) {
					const result = await checkToolsAvailability(toolsToCheck);
					context.availableTools.push(...result.available);
					context.unavailableTools.push(...result.unavailable);
					for (const t of toolsToCheck) {
						checkedTools.add(t.toLowerCase());
					}

					if (isDevMode) {
						if (result.available.length > 0) {
							logInfo(`✓ Available: ${result.available.join(", ")}`);
						}
						if (result.unavailable.length > 0) {
							logInfo(`✗ Unavailable: ${result.unavailable.join(", ")}`);
						}
					}
				}
				// If check_both, also process history below; otherwise continue
				if (parsed.type === "check_tools") {
					continue;
				}
			}

			if ((parsed.type === "check_history" || parsed.type === "check_both") && parsed.historySearch) {
				// Query history if not already checked
				if (!checkedHistoryTerms.has(parsed.historySearch)) {
					const history = await queryShellHistory(parsed.historySearch);
					if (history) {
						context.shellHistory = `${context.shellHistory || ""}\n${history}`;
						checkedHistoryTerms.add(parsed.historySearch);

						if (isDevMode) {
							logInfo(`📜 Found history for: ${parsed.historySearch}`);
						}
					} else if (isDevMode) {
						logInfo(`📜 No history found for: ${parsed.historySearch}`);
					}
				}
				continue;
			}

			if (parsed.type === "ready") {
				if (isDevMode) {
					logInfo("✓ Planning complete");
				}
				break;
			}
		} catch (error) {
			// On connection error, skip planning and return empty context
			if (isDevMode) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				if (errorMsg.includes("connect") || errorMsg.includes("Unable to connect")) {
					logInfo("⚠️  Connection error during planning, skipping planning phase");
				} else {
					logInfo(`⚠️  Planning error: ${errorMsg}`);
				}
			}
			// Return whatever context we have so far
			return context;
		}
	}

	if (isDevMode && iteration >= maxIterations) {
		logInfo("Planning phase reached max iterations, proceeding with current context");
	}

	return context;
}
