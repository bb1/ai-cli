import { bold, red } from "./utils.ts";

interface DangerousPattern {
	pattern: RegExp;
	reason: string;
	severity: "high" | "medium";
}

const DANGEROUS_PATTERNS: DangerousPattern[] = [
	// High severity - data destruction
	{
		pattern: /rm\s+(-[rf]+\s+)*[/~]/,
		reason: "Recursive deletion from root or home directory",
		severity: "high",
	},
	{
		pattern: /rm\s+-rf?\s+\*/,
		reason: "Recursive deletion with wildcard",
		severity: "high",
	},
	{
		pattern: /rm\s+-rf\s*$/,
		reason: "Recursive force deletion (incomplete command)",
		severity: "high",
	},
	{
		pattern: /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
		reason: "Fork bomb detected",
		severity: "high",
	},
	{
		pattern: /mkfs\./,
		reason: "Filesystem formatting command",
		severity: "high",
	},
	{
		pattern: /dd\s+if=.*of=\/dev\/[sh]d[a-z]/,
		reason: "Direct disk write operation",
		severity: "high",
	},
	{
		pattern: />\s*\/dev\/[sh]d[a-z]/,
		reason: "Direct write to disk device",
		severity: "high",
	},
	{
		pattern: /chmod\s+(-R\s+)?777\s+\//,
		reason: "Setting world-writable permissions on system directories",
		severity: "high",
	},
	{
		pattern: /chown\s+-R\s+.*\s+\//,
		reason: "Recursive ownership change from root",
		severity: "high",
	},

	// Medium severity - potential security risks
	{
		pattern: /curl\s+.*\|\s*(ba)?sh/,
		reason: "Piping remote content directly to shell",
		severity: "medium",
	},
	{
		pattern: /wget\s+.*\|\s*(ba)?sh/,
		reason: "Piping remote content directly to shell",
		severity: "medium",
	},
	{
		pattern: /curl\s+.*>\s*.*\.sh\s*&&\s*(ba)?sh/,
		reason: "Downloading and executing script",
		severity: "medium",
	},
	{
		pattern: />\s*\/etc\//,
		reason: "Writing to system configuration directory",
		severity: "medium",
	},
	{
		pattern: /mv\s+.*\s+\/dev\/null/,
		reason: "Moving files to /dev/null (data loss)",
		severity: "medium",
	},
	{
		pattern: /:\s*>\s*[^\s]+/,
		reason: "Truncating file content",
		severity: "medium",
	},
	{
		pattern: /history\s+-c/,
		reason: "Clearing shell history",
		severity: "medium",
	},
	{
		pattern: /shutdown|reboot|init\s+[06]/,
		reason: "System shutdown/reboot command",
		severity: "medium",
	},
	{
		pattern: /pkill\s+-9\s+-1|kill\s+-9\s+-1/,
		reason: "Killing all user processes",
		severity: "medium",
	},
];

export interface SafetyCheckResult {
	isDangerous: boolean;
	warnings: Array<{
		reason: string;
		severity: "high" | "medium";
	}>;
}

/**
 * Check a command for potentially dangerous patterns
 */
export function checkCommandSafety(command: string): SafetyCheckResult {
	const warnings: Array<{ reason: string; severity: "high" | "medium" }> = [];

	for (const { pattern, reason, severity } of DANGEROUS_PATTERNS) {
		if (pattern.test(command)) {
			warnings.push({ reason, severity });
		}
	}

	return {
		isDangerous: warnings.length > 0,
		warnings,
	};
}

/**
 * Check multiple commands for safety
 */
export function checkCommandsSafety(commands: string[]): SafetyCheckResult {
	const allWarnings: Array<{ reason: string; severity: "high" | "medium" }> = [];

	for (const command of commands) {
		const result = checkCommandSafety(command);
		allWarnings.push(...result.warnings);
	}

	// Deduplicate warnings by reason
	const uniqueWarnings = allWarnings.filter(
		(warning, index, self) => index === self.findIndex((w) => w.reason === warning.reason),
	);

	return {
		isDangerous: uniqueWarnings.length > 0,
		warnings: uniqueWarnings,
	};
}

/**
 * Format safety warnings for display
 */
export function formatSafetyWarnings(result: SafetyCheckResult): string {
	if (!result.isDangerous) {
		return "";
	}

	const lines: string[] = [];
	lines.push(red(bold("\n⚠️  DANGEROUS COMMAND DETECTED ⚠️\n")));

	for (const warning of result.warnings) {
		const prefix = warning.severity === "high" ? "🔴" : "🟡";
		lines.push(red(`  ${prefix} ${warning.reason}`));
	}

	lines.push(red("\n  Please review carefully before proceeding.\n"));

	return lines.join("\n");
}
