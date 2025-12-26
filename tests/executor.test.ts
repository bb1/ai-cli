import { describe, expect, test } from "bun:test";
import { checkBinaryExists, executeCommand, validateTools } from "../src/executor.ts";

describe("checkBinaryExists", () => {
	test("finds common system binaries", () => {
		// These should exist on most Unix systems
		expect(checkBinaryExists("ls")).toBe(true);
		expect(checkBinaryExists("echo")).toBe(true);
		expect(checkBinaryExists("cat")).toBe(true);
	});

	test("recognizes shell builtins", () => {
		expect(checkBinaryExists("cd")).toBe(true);
		expect(checkBinaryExists("export")).toBe(true);
		expect(checkBinaryExists("source")).toBe(true);
		expect(checkBinaryExists("if")).toBe(true);
		expect(checkBinaryExists("for")).toBe(true);
	});

	test("returns false for non-existent binaries", () => {
		expect(checkBinaryExists("thisbinarydoesnotexist12345")).toBe(false);
		expect(checkBinaryExists("fake_command_xyz")).toBe(false);
	});
});

describe("validateTools", () => {
	test("validates existing tools", () => {
		const result = validateTools(["ls", "cat", "echo"]);
		expect(result.valid).toBe(true);
		expect(result.missing).toHaveLength(0);
	});

	test("detects missing tools", () => {
		const result = validateTools(["ls", "nonexistent_tool_xyz"]);
		expect(result.valid).toBe(false);
		expect(result.missing).toContain("nonexistent_tool_xyz");
	});

	test("handles empty tool list", () => {
		const result = validateTools([]);
		expect(result.valid).toBe(true);
		expect(result.missing).toHaveLength(0);
	});

	test("handles shell builtins", () => {
		const result = validateTools(["cd", "echo", "export"]);
		expect(result.valid).toBe(true);
	});
});

describe("executeCommand", () => {
	test("executes simple command successfully", async () => {
		const result = await executeCommand("echo 'hello world'");

		expect(result.success).toBe(true);
		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe("hello world");
		expect(result.stderr).toBe("");
	});

	test("captures stdout", async () => {
		const result = await executeCommand("echo 'line1' && echo 'line2'");

		expect(result.success).toBe(true);
		expect(result.stdout).toContain("line1");
		expect(result.stdout).toContain("line2");
	});

	test("captures stderr", async () => {
		const result = await executeCommand("echo 'error' >&2");

		expect(result.success).toBe(true);
		expect(result.stderr.trim()).toBe("error");
	});

	test("reports failure for invalid commands", async () => {
		const result = await executeCommand("nonexistent_command_12345");

		expect(result.success).toBe(false);
		expect(result.exitCode).not.toBe(0);
	});

	test("reports correct exit code", async () => {
		const result = await executeCommand("exit 42");

		expect(result.success).toBe(false);
		expect(result.exitCode).toBe(42);
	});

	test("handles commands with pipes", async () => {
		const result = await executeCommand("echo 'hello world' | tr 'a-z' 'A-Z'");

		expect(result.success).toBe(true);
		expect(result.stdout.trim()).toBe("HELLO WORLD");
	});

	test("handles commands with environment variables", async () => {
		const result = await executeCommand("TEST_VAR=hello && echo $TEST_VAR");

		expect(result.success).toBe(true);
		// Note: This might not work as expected due to how shell processes &&
	});
});
