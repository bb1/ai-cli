import type { Config } from "./config.ts";
import { executeCommand, validateTools } from "./executor.ts";
import { extractAllTools, isAgentDone, parseResponse } from "./parser.ts";
import { getProvider } from "./providers/index.ts";
import { buildAgentSystemPrompt } from "./prompt.ts";
import { checkCommandsSafety, formatSafetyWarnings } from "./safety.ts";
import { bold, cyan, dim, green, logError, readLine, red, yellow } from "./utils.ts";

interface AgentState {
	iteration: number;
	lastOutput: string;
	originalQuery: string;
}

const MAX_AGENT_ITERATIONS = 10;

/**
 * Run the agent mode - executes commands and feeds output back to LLM
 */
export async function runAgentMode(config: Config, query: string): Promise<void> {
	const maxCommands = config.agent.max_commands;

	console.log(bold(cyan("\n🤖 Agent Mode Activated\n")));
	console.log(dim(`Task: ${query}`));
	console.log(dim(`Max commands: ${maxCommands}, Max iterations: ${MAX_AGENT_ITERATIONS}\n`));

	const state: AgentState = {
		iteration: 0,
		lastOutput: "",
		originalQuery: query,
	};

	while (state.iteration < MAX_AGENT_ITERATIONS) {
		state.iteration++;

		console.log(yellow(`\n━━━ Iteration ${state.iteration}/${MAX_AGENT_ITERATIONS} ━━━\n`));

		// Build prompt based on state
		let response: string;
		try {
			if (state.iteration === 1) {
				// First iteration - just send the query
				const provider = getProvider(config);
				response = await provider.generate(`User request: ${query}`);
			} else {
				// Subsequent iterations - include previous output
				const systemPrompt = buildAgentSystemPrompt(state.lastOutput, state.iteration);
				const provider = getProvider(config);
				response = await provider.generate(`Continue the task: ${query}`, systemPrompt);
			}
		} catch (error) {
			logError(`Failed to get response from LLM: ${error}`);
			break;
		}

		// Check if agent says it's done
		const doneCheck = isAgentDone(response);
		if (doneCheck.done) {
			console.log(green(bold("\n✅ Task Completed\n")));
			console.log(dim(doneCheck.summary || ""));
			return;
		}

		// Parse the response
		const parsed = parseResponse(response, maxCommands);

		if (parsed.isError) {
			logError(parsed.errorMessage || "Failed to parse response");
			console.log(dim("Raw response:"));
			console.log(dim(response));
			break;
		}

		if (parsed.commands.length === 0) {
			logError("No commands generated");
			break;
		}

		// Display commands
		console.log(cyan("Generated command(s):"));
		for (const cmd of parsed.commands) {
			console.log(cyan(`  ${cmd.command}`));
			if (cmd.comment) {
				console.log(dim(`  # ${cmd.comment}`));
			}
		}

		// Validate tools
		const allTools = extractAllTools(parsed.commands);
		const validation = validateTools(allTools);

		if (!validation.valid) {
			console.log(yellow(`\nMissing tools: ${validation.missing.join(", ")}`));
			state.lastOutput = `Error: The following tools are not available: ${validation.missing.join(", ")}. Please use alternative commands.`;
			continue;
		}

		// Check for dangerous commands
		const commandStrings = parsed.commands.map((c) => c.command);
		const safetyResult = checkCommandsSafety(commandStrings);

		if (safetyResult.isDangerous) {
			console.log(formatSafetyWarnings(safetyResult));
		}

		// Confirm execution
		const confirm = await readLine(`${green("Execute?")} ${dim("(Y/n/stop)")} `);
		const normalized = confirm.toLowerCase().trim();

		if (normalized === "stop" || normalized === "s") {
			console.log(yellow("\nAgent stopped by user."));
			return;
		}

		if (normalized === "n" || normalized === "no") {
			console.log(yellow("\nSkipping command..."));
			state.lastOutput = "User skipped this command. Try a different approach.";
			continue;
		}

		// Execute commands and capture output
		let combinedOutput = "";

		for (const cmd of parsed.commands) {
			console.log(dim(`\n$ ${cmd.command}`));

			const result = await executeCommand(cmd.command);

			if (result.stdout) {
				process.stdout.write(result.stdout);
				combinedOutput += result.stdout;
			}

			if (result.stderr) {
				process.stderr.write(red(result.stderr));
				combinedOutput += result.stderr;
			}

			if (!result.success) {
				combinedOutput += `\nCommand failed with exit code ${result.exitCode}`;
				break;
			}
		}

		// Update state with output
		state.lastOutput = combinedOutput || "Command completed with no output.";
	}

	if (state.iteration >= MAX_AGENT_ITERATIONS) {
		console.log(yellow(bold("\n⚠️ Maximum iterations reached\n")));
		console.log(dim("The agent has reached the iteration limit."));
		console.log(dim("You can run the agent again to continue the task."));
	}
}
