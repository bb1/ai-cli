import type { ParsedCommand } from "./parser.ts";
import { checkCommandSafety, formatSafetyWarnings } from "./safety.ts";
import { bold, cyan, dim, green, logError, readLine, yellow } from "./utils.ts";

export interface ExecutionResult {
	success: boolean;
	stdout: string;
	stderr: string;
	exitCode: number;
}

/**
 * Check if a binary exists in PATH using Bun.which
 */
export function checkBinaryExists(binary: string): boolean {
	// Skip shell builtins and operators
	const builtins = [
		"cd",
		"echo",
		"export",
		"source",
		"alias",
		"unalias",
		"set",
		"unset",
		"read",
		"eval",
		"exec",
		"exit",
		"return",
		"shift",
		"test",
		"[",
		"[[",
		"true",
		"false",
		":",
		".",
		"if",
		"then",
		"else",
		"fi",
		"for",
		"while",
		"do",
		"done",
		"case",
		"esac",
		"function",
		"time",
		"until",
		"select",
		"coproc",
		"{",
		"}",
		"!",
		"in",
	];

	if (builtins.includes(binary)) {
		return true;
	}

	// Use Bun.which to check if binary exists
	const path = Bun.which(binary);
	return path !== null;
}

/**
 * Validate all tools in a command exist
 */
export function validateTools(tools: string[]): { valid: boolean; missing: string[] } {
	const missing: string[] = [];

	for (const tool of tools) {
		if (!checkBinaryExists(tool)) {
			missing.push(tool);
		}
	}

	return {
		valid: missing.length === 0,
		missing,
	};
}

/**
 * Display command and get user confirmation
 */
export async function confirmCommand(commands: ParsedCommand[]): Promise<"yes" | "no" | "adjust"> {
	console.log(bold("\n📋 Generated command(s):\n"));

	for (let i = 0; i < commands.length; i++) {
		const cmd = commands[i];
		const prefix = commands.length > 1 ? `${i + 1}. ` : "";
		console.log(cyan(`  ${prefix}${cmd.command}`));
		if (cmd.comment) {
			console.log(dim(`     # ${cmd.comment}`));
		}

		// Check for dangerous patterns
		const safetyResult = checkCommandSafety(cmd.command);
		if (safetyResult.isDangerous) {
			console.log(formatSafetyWarnings(safetyResult));
		}
	}

	console.log("");

	const response = await readLine(`${green("Execute?")} ${dim("(Y/n/adjust)")} `);
	const normalized = response.toLowerCase().trim();

	if (normalized === "" || normalized === "y" || normalized === "yes") {
		return "yes";
	}
	if (normalized === "n" || normalized === "no") {
		return "no";
	}
	if (normalized === "adjust" || normalized === "a") {
		return "adjust";
	}

	// Default to no for safety
	return "no";
}

/**
 * Execute a single command and return the result
 */
export async function executeCommand(command: string): Promise<ExecutionResult> {
	try {
		const proc = Bun.spawn(["sh", "-c", command], {
			stdout: "pipe",
			stderr: "pipe",
		});

		const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

		const exitCode = await proc.exited;

		return {
			success: exitCode === 0,
			stdout,
			stderr,
			exitCode,
		};
	} catch (error) {
		return {
			success: false,
			stdout: "",
			stderr: error instanceof Error ? error.message : String(error),
			exitCode: 1,
		};
	}
}

/**
 * Execute a command with inherited stdio (for interactive display)
 */
export async function executeCommandInteractive(command: string): Promise<number> {
	try {
		const proc = Bun.spawn(["sh", "-c", command], {
			stdout: "inherit",
			stderr: "inherit",
			stdin: "inherit",
		});

		return await proc.exited;
	} catch (error) {
		logError(error instanceof Error ? error.message : String(error));
		return 1;
	}
}

/**
 * Execute multiple commands in sequence
 */
export async function executeCommands(commands: ParsedCommand[], interactive = true): Promise<ExecutionResult[]> {
	const results: ExecutionResult[] = [];

	for (let i = 0; i < commands.length; i++) {
		const cmd = commands[i];

		if (commands.length > 1) {
			console.log(yellow(`\n[${i + 1}/${commands.length}] ${cmd.command}`));
		}

		if (interactive) {
			const exitCode = await executeCommandInteractive(cmd.command);
			results.push({
				success: exitCode === 0,
				stdout: "",
				stderr: "",
				exitCode,
			});

			// Stop on first failure
			if (exitCode !== 0) {
				logError(`Command failed with exit code ${exitCode}`);
				break;
			}
		} else {
			const result = await executeCommand(cmd.command);
			results.push(result);

			if (!result.success) {
				break;
			}
		}
	}

	return results;
}

/**
 * Get adjusted query from user
 */
export async function getAdjustedQuery(originalQuery: string): Promise<string> {
	console.log(dim(`\nOriginal: ${originalQuery}`));
	const adjusted = await readLine(cyan("Adjusted query: "));
	return adjusted.trim() || originalQuery;
}
