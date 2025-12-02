#!/usr/bin/env bun

import { runAgentMode } from "./agent.ts";
import { type Config, loadConfig } from "./config.ts";
import { confirmCommand, executeCommands, getAdjustedQuery, validateTools } from "./executor.ts";
import { generate, retryWithMissingTool } from "./ollama.ts";
import { extractAllTools, parseResponse } from "./parser.ts";
import { runPlanningPhase } from "./planning.ts";
import { buildSystemPrompt, formatUserQuery } from "./prompt.ts";
import { runSetup } from "./setup.ts";
import { bold, cyan, dim, isDevMode, logError, logInfo, logSuccess, yellow } from "./utils.ts";

function printHelp(): void {
	console.log(`
${bold("ai")} - Natural language to shell commands using Ollama

${bold("USAGE:")}
  ai <query>                  Generate and execute a shell command
  ai agent <query>            Agent mode: execute commands iteratively
  ai setup                    Run the configuration wizard
  ai --help                   Show this help message
  ai --version                Show version

${bold("EXAMPLES:")}
  ai find all package.json in the home dir
  ai list all docker containers
  ai agent find and delete all files bigger than 1GB
  ai compress all png files in current dir

${bold("OPTIONS:")}
  Y        Execute the command
  n        Cancel
  adjust   Modify the query and retry
`);
}

async function printVersion(): Promise<void> {
	// In compiled binaries, this will be replaced at build time via --define
	// In development, fallback to reading package.json
	let version = process.env.AI_CLI_VERSION;

	if (!version) {
		try {
			// Development mode: read from package.json
			const packagePath = new URL("../package.json", import.meta.url).pathname;
			const packageFile = Bun.file(packagePath);
			if (await packageFile.exists()) {
				const packageJson = (await packageFile.json()) as { version?: string };
				version = packageJson.version || "unknown";
			}
			version += " (development)";
		} catch {
			// Fallback if package.json can't be read
			version = "unknown";
		}
	}

	console.log(`ai v${version}`);
}

async function runSingleQuery(config: Config, query: string): Promise<void> {
	const devMode = isDevMode();

	// Run planning phase
	const planningContext = await runPlanningPhase(config, query, config.default.max_planning_iterations, devMode);

	let currentQuery = query;
	let retryCount = 0;
	const maxRetries = 2;

	while (retryCount <= maxRetries) {
		logInfo("Thinking...");

		let response: string;
		try {
			const systemPrompt = buildSystemPrompt(config.default.max_commands, {
				availableTools: planningContext.availableTools,
				unavailableTools: planningContext.unavailableTools,
				shellHistory: planningContext.shellHistory,
				draft: planningContext.draft,
			});
			response = await generate(config, formatUserQuery(currentQuery), systemPrompt);
		} catch (error) {
			logError(`Failed to get response: ${error}`);
			return;
		}

		const parsed = parseResponse(response, config.default.max_commands);

		if (parsed.isError) {
			console.log(yellow(`\n${parsed.errorMessage}`));
			return;
		}

		if (parsed.commands.length === 0) {
			logError("No commands were generated. Try rephrasing your request.");
			return;
		}

		// Validate tools exist
		const allTools = extractAllTools(parsed.commands);
		const validation = validateTools(allTools);

		if (!validation.valid) {
			console.log(yellow(`\nMissing tools: ${validation.missing.join(", ")}`));

			if (retryCount < maxRetries) {
				logInfo("Retrying with alternative tools...");
				try {
					response = await retryWithMissingTool(config, currentQuery, validation.missing);
					const retryParsed = parseResponse(response, config.default.max_commands);

					if (!retryParsed.isError && retryParsed.commands.length > 0) {
						const retryTools = extractAllTools(retryParsed.commands);
						const retryValidation = validateTools(retryTools);

						if (retryValidation.valid) {
							parsed.commands = retryParsed.commands;
						}
					}
				} catch {
					// Continue with original response
				}
			}

			// Re-check validation after retry
			const finalTools = extractAllTools(parsed.commands);
			const finalValidation = validateTools(finalTools);

			if (!finalValidation.valid) {
				logError(`Required tools not found: ${finalValidation.missing.join(", ")}\nPlease install them and try again.`);
				return;
			}
		}

		// Get user confirmation
		const confirmation = await confirmCommand(parsed.commands);

		if (confirmation === "yes") {
			const results = await executeCommands(parsed.commands);
			const allSuccessful = results.every((r) => r.success);

			if (allSuccessful) {
				logSuccess("\nCommand completed successfully.");
			}
			return;
		}

		if (confirmation === "no") {
			console.log(dim("\nCommand cancelled."));
			return;
		}

		if (confirmation === "adjust") {
			currentQuery = await getAdjustedQuery(currentQuery);
			retryCount++;
		}
	}

	logError("Maximum retries reached.");
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	// Handle flags
	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		printHelp();
		return;
	}

	if (args.includes("--version") || args.includes("-v")) {
		await printVersion();
		return;
	}

	// Handle setup command
	if (args[0] === "setup") {
		await runSetup();
		return;
	}

	// Load or create config
	let config = await loadConfig();

	if (!config) {
		console.log(cyan("No configuration found. Running setup...\n"));
		config = await runSetup();
	}

	// Detect agent mode
	const isAgentMode = args[0] === "agent";
	const query = isAgentMode ? args.slice(1).join(" ") : args.join(" ");

	if (!query.trim()) {
		logError("Please provide a query.");
		printHelp();
		return;
	}

	// Run in appropriate mode
	if (isAgentMode) {
		await runAgentMode(config, query);
	} else {
		await runSingleQuery(config, query);
	}
}

// Run the CLI
main().catch((error) => {
	logError(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
