import { describe, expect, test } from "bun:test";
import {
	checkCommandSafety,
	checkCommandsSafety,
	formatSafetyWarnings,
} from "../src/safety.ts";

describe("checkCommandSafety", () => {
	test("detects rm -rf /", () => {
		const result = checkCommandSafety("rm -rf /");
		expect(result.isDangerous).toBe(true);
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.warnings[0].severity).toBe("high");
	});

	test("detects rm -rf with home dir", () => {
		const result = checkCommandSafety("rm -rf ~/");
		expect(result.isDangerous).toBe(true);
	});

	test("detects rm -rf with wildcard", () => {
		const result = checkCommandSafety("rm -rf *");
		expect(result.isDangerous).toBe(true);
	});

	test("detects mkfs commands", () => {
		const result = checkCommandSafety("mkfs.ext4 /dev/sda1");
		expect(result.isDangerous).toBe(true);
		expect(result.warnings[0].severity).toBe("high");
	});

	test("detects dd to disk", () => {
		const result = checkCommandSafety("dd if=/dev/zero of=/dev/sda");
		expect(result.isDangerous).toBe(true);
	});

	test("detects chmod 777 on root", () => {
		const result = checkCommandSafety("chmod -R 777 /");
		expect(result.isDangerous).toBe(true);
	});

	test("detects curl pipe to sh", () => {
		const result = checkCommandSafety("curl http://example.com/script.sh | sh");
		expect(result.isDangerous).toBe(true);
		expect(result.warnings[0].severity).toBe("medium");
	});

	test("detects wget pipe to bash", () => {
		const result = checkCommandSafety("wget -O- http://example.com | bash");
		expect(result.isDangerous).toBe(true);
	});

	test("detects writing to /etc/", () => {
		const result = checkCommandSafety("echo 'test' > /etc/passwd");
		expect(result.isDangerous).toBe(true);
	});

	test("detects shutdown command", () => {
		const result = checkCommandSafety("shutdown -h now");
		expect(result.isDangerous).toBe(true);
	});

	test("safe commands pass", () => {
		const safeCommands = [
			"ls -la",
			"find . -name '*.txt'",
			"grep pattern file.txt",
			"cat README.md",
			"echo 'hello world'",
			"mkdir new_folder",
			"cp file1 file2",
			"mv old.txt new.txt",
		];

		for (const cmd of safeCommands) {
			const result = checkCommandSafety(cmd);
			expect(result.isDangerous).toBe(false);
		}
	});

	test("rm on specific file is safe", () => {
		const result = checkCommandSafety("rm file.txt");
		expect(result.isDangerous).toBe(false);
	});

	test("rm -r on specific folder is safe", () => {
		const result = checkCommandSafety("rm -r my_folder");
		expect(result.isDangerous).toBe(false);
	});
});

describe("checkCommandsSafety", () => {
	test("checks multiple commands", () => {
		const commands = ["ls -la", "rm -rf /", "echo hello"];
		const result = checkCommandsSafety(commands);

		expect(result.isDangerous).toBe(true);
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	test("deduplicates warnings", () => {
		const commands = ["rm -rf /home", "rm -rf /var"];
		const result = checkCommandsSafety(commands);

		expect(result.isDangerous).toBe(true);
		// Should have only one warning for recursive deletion pattern
		const recursiveWarnings = result.warnings.filter((w) =>
			w.reason.toLowerCase().includes("recursive"),
		);
		expect(recursiveWarnings.length).toBe(1);
	});

	test("returns safe for all safe commands", () => {
		const commands = ["ls", "pwd", "echo test"];
		const result = checkCommandsSafety(commands);

		expect(result.isDangerous).toBe(false);
		expect(result.warnings).toHaveLength(0);
	});
});

describe("formatSafetyWarnings", () => {
	test("returns empty string for safe commands", () => {
		const result = { isDangerous: false, warnings: [] };
		const formatted = formatSafetyWarnings(result);

		expect(formatted).toBe("");
	});

	test("formats warnings with appropriate indicators", () => {
		const result = {
			isDangerous: true,
			warnings: [
				{ reason: "Recursive deletion from root", severity: "high" as const },
				{ reason: "Piping to shell", severity: "medium" as const },
			],
		};
		const formatted = formatSafetyWarnings(result);

		expect(formatted).toContain("DANGEROUS");
		expect(formatted).toContain("Recursive deletion");
		expect(formatted).toContain("Piping to shell");
	});
});

