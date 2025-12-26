import { describe, expect, test } from "bun:test";
import { extractAllTools, isAgentDone, parseResponse } from "../src/parser.ts";

describe("parseResponse", () => {
	test("parses a single command correctly", () => {
		const response = "find . -name '*.json';find;Find all JSON files";
		const result = parseResponse(response);

		expect(result.isError).toBe(false);
		expect(result.commands).toHaveLength(1);
		expect(result.commands[0].command).toBe("find . -name '*.json'");
		expect(result.commands[0].tools).toEqual(["find"]);
		expect(result.commands[0].comment).toBe("Find all JSON files");
	});

	test("parses multiple commands", () => {
		const response = `mkdir -p test;mkdir;Create directory
cd test;cd;Change directory
touch file.txt;touch;Create file`;
		const result = parseResponse(response);

		expect(result.isError).toBe(false);
		expect(result.commands).toHaveLength(3);
		expect(result.commands[0].command).toBe("mkdir -p test");
		expect(result.commands[1].command).toBe("cd test");
		expect(result.commands[2].command).toBe("touch file.txt");
	});

	test("handles multiple tools in a command", () => {
		const response = "find . | grep test;find grep;Search with pipe";
		const result = parseResponse(response);

		expect(result.isError).toBe(false);
		expect(result.commands[0].tools).toEqual(["find", "grep"]);
	});

	test("handles empty command (comment only)", () => {
		const response = ";;Cannot perform this task without root access";
		const result = parseResponse(response);

		expect(result.isError).toBe(true);
		expect(result.errorMessage).toContain("Cannot perform this task");
	});

	test("limits to 7 commands", () => {
		const lines = Array.from({ length: 10 }, (_, i) => `echo ${i};echo;Line ${i}`);
		const response = lines.join("\n");
		const result = parseResponse(response);

		expect(result.isError).toBe(false);
		expect(result.commands).toHaveLength(7);
	});

	test("skips CSV headers", () => {
		const response = `command;tools;comment
ls -la;ls;List files`;
		const result = parseResponse(response);

		expect(result.isError).toBe(false);
		expect(result.commands).toHaveLength(1);
		expect(result.commands[0].command).toBe("ls -la");
	});

	test("skips markdown code fences", () => {
		const response = "```\nls -la;ls;List files\n```";
		const result = parseResponse(response);

		expect(result.isError).toBe(false);
		expect(result.commands).toHaveLength(1);
	});

	test("handles semicolons in comment", () => {
		// Note: semicolons in the command part are ambiguous with CSV format
		// This tests that semicolons AFTER the tools field are preserved in comment
		const response = "echo hello;echo;Print text; contains semicolon";
		const result = parseResponse(response);

		expect(result.isError).toBe(false);
		expect(result.commands[0].command).toBe("echo hello");
		expect(result.commands[0].comment).toBe("Print text; contains semicolon");
	});

	test("returns error for unparseable response", () => {
		const response = "";
		const result = parseResponse(response);

		expect(result.isError).toBe(true);
		expect(result.errorMessage).toBeTruthy();
	});

	test("detects apologetic responses as errors", () => {
		const response = "I'm sorry, I cannot help with that request.";
		const result = parseResponse(response);

		expect(result.isError).toBe(true);
	});

	// Regression test for conversational text after CSV
	test("ignores conversational text after valid CSV", () => {
		const response = `
ls -la;ls;list files
echo hello;echo;say hello

Is there anything else I can help you with?
`;
		const result = parseResponse(response);

		expect(result.isError).toBe(false);
		expect(result.commands.length).toBe(2);
		expect(result.commands[0].command).toBe("ls -la");
		expect(result.commands[1].command).toBe("echo hello");
	});

	test("ignores conversational text before valid CSV", () => {
		const response = `
Here are the commands you requested:

ls -la;ls;list files
`;
		const result = parseResponse(response);

		expect(result.isError).toBe(false);
		expect(result.commands.length).toBe(1);
		expect(result.commands[0].command).toBe("ls -la");
	});
});

describe("isAgentDone", () => {
	test("detects DONE marker", () => {
		const response = ";;DONE: Successfully deleted all temp files";
		const result = isAgentDone(response);

		expect(result.done).toBe(true);
		expect(result.summary).toBe("Successfully deleted all temp files");
	});

	test("detects task complete in comment", () => {
		const response = ";;Task complete - all files processed";
		const result = isAgentDone(response);

		expect(result.done).toBe(true);
	});

	test("returns false for regular commands", () => {
		const response = "ls -la;ls;List files";
		const result = isAgentDone(response);

		expect(result.done).toBe(false);
	});
});

describe("extractAllTools", () => {
	test("extracts unique tools from multiple commands", () => {
		const commands = [
			{ command: "find . | grep test", tools: ["find", "grep"], comment: "" },
			{ command: "grep -r pattern", tools: ["grep"], comment: "" },
			{ command: "sort | uniq", tools: ["sort", "uniq"], comment: "" },
		];
		const tools = extractAllTools(commands);

		expect(tools).toHaveLength(4);
		expect(tools).toContain("find");
		expect(tools).toContain("grep");
		expect(tools).toContain("sort");
		expect(tools).toContain("uniq");
	});

	test("returns empty array for commands without tools", () => {
		const commands = [{ command: "", tools: [], comment: "No command" }];
		const tools = extractAllTools(commands);

		expect(tools).toHaveLength(0);
	});
});
