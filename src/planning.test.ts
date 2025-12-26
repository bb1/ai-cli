import { describe, expect, test } from "bun:test";
import { parsePlanningResponse } from "../src/planning.ts";

describe("parsePlanningResponse", () => {
	test("parses CHECK_TOOLS", () => {
		const result = parsePlanningResponse("CHECK_TOOLS: jq yq ripgrep");
		expect(result).toEqual({
			type: "check_tools",
			tools: ["jq", "yq", "ripgrep"],
			draft: undefined,
		});
	});

	test("parses CHECK_TOOLS case insensitive", () => {
		const result = parsePlanningResponse("check_tools: Docker Kubectl");
		expect(result).toEqual({
			type: "check_tools",
			tools: ["docker", "kubectl"],
			draft: undefined,
		});
	});

	test("parses CHECK_HISTORY", () => {
		const result = parsePlanningResponse("CHECK_HISTORY: docker compose");
		expect(result).toEqual({
			type: "check_history",
			historySearch: "docker compose",
			draft: undefined,
		});
	});

	test("parses READY without plan", () => {
		const result = parsePlanningResponse("READY");
		expect(result).toEqual({
			type: "ready",
			draft: undefined,
		});
	});

	test("parses READY with plan", () => {
		const result = parsePlanningResponse("READY: Use find to locate files");
		expect(result).toEqual({
			type: "ready",
			draft: "Use find to locate files",
		});
	});

	test("parses READY with colon but no plan", () => {
		const result = parsePlanningResponse("READY:");
		expect(result).toEqual({
			type: "ready",
			draft: undefined,
		});
	});

	test("prioritizes READY over other actions", () => {
		const response = `CHECK_TOOLS: jq
DRAFT: Parse JSON
READY: Use jq to parse JSON`;
		const result = parsePlanningResponse(response);
		expect(result?.type).toBe("ready");
		expect(result?.draft).toBe("Use jq to parse JSON");
	});

	test("extracts DRAFT with CHECK_TOOLS", () => {
		const response = `CHECK_TOOLS: jq yq
DRAFT: Parse config file with jq`;
		const result = parsePlanningResponse(response);
		expect(result).toEqual({
			type: "check_tools",
			tools: ["jq", "yq"],
			draft: "Parse config file with jq",
		});
	});

	test("extracts DRAFT with CHECK_HISTORY", () => {
		const response = `CHECK_HISTORY: ssh
DRAFT: Find most used SSH target`;
		const result = parsePlanningResponse(response);
		expect(result).toEqual({
			type: "check_history",
			historySearch: "ssh",
			draft: "Find most used SSH target",
		});
	});

	test("parses check_both when both CHECK_TOOLS and CHECK_HISTORY present", () => {
		const response = `CHECK_TOOLS: jq
CHECK_HISTORY: config`;
		const result = parsePlanningResponse(response);
		expect(result?.type).toBe("check_both");
		expect(result?.tools).toEqual(["jq"]);
		expect(result?.historySearch).toBe("config");
	});

	test("handles DRAFT only as ready", () => {
		const result = parsePlanningResponse("DRAFT: Use grep to search");
		expect(result).toEqual({
			type: "ready",
			draft: "Use grep to search",
		});
	});

	test("handles response with extra text after action", () => {
		const response = `CHECK_HISTORY: ssh

I need to check the user's SSH history to find the most common IP.`;
		const result = parsePlanningResponse(response);
		expect(result?.type).toBe("check_history");
		expect(result?.historySearch).toBe("ssh");
	});

	test("returns null for empty response", () => {
		expect(parsePlanningResponse("")).toBeNull();
		expect(parsePlanningResponse("   ")).toBeNull();
	});

	test("treats unrecognized response as ready", () => {
		const result = parsePlanningResponse("Use find command to search");
		expect(result?.type).toBe("ready");
	});
});
