// Terminal colors using ANSI escape codes
export const colors = {
	reset: "\x1b[0m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	white: "\x1b[37m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
} as const;

export function red(text: string): string {
	return `${colors.red}${text}${colors.reset}`;
}

export function green(text: string): string {
	return `${colors.green}${text}${colors.reset}`;
}

export function yellow(text: string): string {
	return `${colors.yellow}${text}${colors.reset}`;
}

export function blue(text: string): string {
	return `${colors.blue}${text}${colors.reset}`;
}

export function cyan(text: string): string {
	return `${colors.cyan}${text}${colors.reset}`;
}

export function bold(text: string): string {
	return `${colors.bold}${text}${colors.reset}`;
}

export function dim(text: string): string {
	return `${colors.dim}${text}${colors.reset}`;
}

// OS detection
export function getOSInfo(): { platform: string; shell: string } {
	const platform = process.platform;
	let shell = "bash";

	if (platform === "win32") {
		shell = process.env.COMSPEC || "cmd.exe";
	} else {
		shell = process.env.SHELL || "/bin/bash";
	}

	return { platform, shell };
}

export function getHomeDir(): string {
	// Use environment variables instead of node:os for Bun compile compatibility
	const home = process.env.HOME || process.env.USERPROFILE;
	if (!home) {
		throw new Error("Could not determine home directory");
	}
	return home;
}

// Read line from stdin
// Read line from stdin using native Bun prompt
export async function readLine(text: string): Promise<string> {
	const result = prompt(text);
	return result || "";
}

// Print to stderr for errors
export function logError(message: string): void {
	console.error(red(`Error: ${message}`));
}

// Print info message
export function logInfo(message: string): void {
	console.log(cyan(message));
}

// Print success message
export function logSuccess(message: string): void {
	console.log(green(message));
}

// Print warning message
export function logWarning(message: string): void {
	console.log(yellow(`Warning: ${message}`));
}

/**
 * Check if running in development mode
 * Detects if the script is being run via "bun run dev" or directly as source
 */
export function isDevMode(): boolean {
	// Check if running via bun run dev
	const execPath = process.argv[1] || "";
	const isSourceFile = execPath.endsWith("index.ts") || execPath.includes("src/index.ts");

	// Also check for explicit dev flag or NODE_ENV
	const hasDevFlag = process.argv.includes("--dev");
	const isNodeDev = process.env.NODE_ENV === "development";

	return isSourceFile || hasDevFlag || isNodeDev;
}
