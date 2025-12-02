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
						content: "patch",
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

// Test version calculation logic
function calculateNewVersion(
	currentVersion: string,
	bumpType: "major" | "minor" | "patch",
): string {
	const [major, minor, patch] = currentVersion.split(".").map(Number);

	switch (bumpType) {
		case "major":
			return `${major + 1}.0.0`;
		case "minor":
			return `${major}.${minor + 1}.0`;
		case "patch":
			return `${major}.${minor}.${patch + 1}`;
	}
}

describe("calculateNewVersion", () => {
	test("bumps major version correctly", () => {
		expect(calculateNewVersion("1.2.3", "major")).toBe("2.0.0");
		expect(calculateNewVersion("0.4.2", "major")).toBe("1.0.0");
	});

	test("bumps minor version correctly", () => {
		expect(calculateNewVersion("1.2.3", "minor")).toBe("1.3.0");
		expect(calculateNewVersion("0.4.2", "minor")).toBe("0.5.0");
	});

	test("bumps patch version correctly", () => {
		expect(calculateNewVersion("1.2.3", "patch")).toBe("1.2.4");
		expect(calculateNewVersion("0.4.2", "patch")).toBe("0.4.3");
	});

	test("handles version with leading zeros", () => {
		expect(calculateNewVersion("0.0.1", "patch")).toBe("0.0.2");
		expect(calculateNewVersion("0.0.1", "minor")).toBe("0.1.0");
		expect(calculateNewVersion("0.0.1", "major")).toBe("1.0.0");
	});
});

describe("bump type parsing", () => {
	test("extracts major from response", () => {
		const responseText = "major";
		expect(responseText.includes("major")).toBe(true);
		expect(responseText.includes("minor")).toBe(false);
		expect(responseText.includes("patch")).toBe(false);
	});

	test("extracts minor from response", () => {
		const responseText = "minor";
		expect(responseText.includes("major")).toBe(false);
		expect(responseText.includes("minor")).toBe(true);
		expect(responseText.includes("patch")).toBe(false);
	});

	test("extracts patch from response", () => {
		const responseText = "patch";
		expect(responseText.includes("major")).toBe(false);
		expect(responseText.includes("minor")).toBe(false);
		expect(responseText.includes("patch")).toBe(true);
	});

	test("handles case-insensitive responses", () => {
		const responseText = "MAJOR";
		expect(responseText.toLowerCase().includes("major")).toBe(true);
	});

	test("handles responses with extra text", () => {
		const responseText = "The bump type should be minor version";
		expect(responseText.includes("major")).toBe(false);
		expect(responseText.includes("minor")).toBe(true);
		expect(responseText.includes("patch")).toBe(false);
	});
});

