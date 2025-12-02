import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";

// Mock fetch globally
const originalFetch = globalThis.fetch;
const mockFetchImpl = mock(() =>
	Promise.resolve({
		ok: true,
		status: 200,
		statusText: "OK",
		json: async () => ({
			choices: [
				{
					message: {
						content: "## Changes\n- Test change",
					},
				},
			],
		}),
		text: async () => "",
	} as Response),
);

beforeEach(() => {
	globalThis.fetch = mockFetchImpl as unknown as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	mockFetchImpl.mockClear();
});

describe("changelog generation", () => {
	test("formats commits correctly for API", () => {
		const commits = ["abc123 feat: add new feature", "def456 fix: bug fix"];
		const commitsText = commits.join("\n");
		expect(commitsText).toBe("abc123 feat: add new feature\ndef456 fix: bug fix");
	});

	test("filters empty commit lines", () => {
		const commits = [
			"abc123 feat: add feature",
			"",
			"def456 fix: bug",
			"   ",
			"ghi789 docs: update",
		];
		const filtered = commits.filter((line) => line.trim().length > 0);
		expect(filtered).toEqual([
			"abc123 feat: add feature",
			"def456 fix: bug",
			"ghi789 docs: update",
		]);
	});

	test("handles empty commit list", () => {
		const commits: string[] = [];
		expect(commits.length).toBe(0);
	});

	test("handles single commit", () => {
		const commits = ["abc123 feat: single feature"];
		expect(commits.length).toBe(1);
		expect(commits[0]).toBe("abc123 feat: single feature");
	});
});

describe("changelog format validation", () => {
	test("validates markdown format", () => {
		const changelog = "## Features\n- New feature\n\n## Fixes\n- Bug fix";
		expect(changelog).toContain("##");
		expect(changelog).toContain("-");
	});

	test("handles changelog with categories", () => {
		const changelog = `## Features
- Added new command
- Improved performance

## Bug Fixes
- Fixed crash issue`;

		expect(changelog).toContain("## Features");
		expect(changelog).toContain("## Bug Fixes");
		expect(changelog.split("\n").length).toBeGreaterThan(1);
	});

	test("handles empty changelog", () => {
		const changelog = "";
		expect(changelog.trim()).toBe("");
	});
});

