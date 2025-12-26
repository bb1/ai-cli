import { describe, expect, test } from "bun:test";
import type { Config } from "../config";
import { GeminiProvider } from "./gemini";

// This test requires environment variables to be set in .env
// TEST_GEMINI_COOKIE_PSID
// TEST_GEMINI_COOKIE_PSIDTS

const psid = process.env.TEST_GEMINI_COOKIE_PSID;
const psidts = process.env.TEST_GEMINI_COOKIE_PSIDTS;

const shouldRun = psid && psidts;

describe("Gemini Provider Integration", () => {
	if (!shouldRun) {
		test.skip("Skipping Gemini integration test (missing cookies)", () => {});
		return;
	}

	const config: Config = {
		active_provider: "gemini",
		ollama: { url: "", model: "" },
		gemini: {
			cookies: {
				"__Secure-1PSID": psid,
				"__Secure-1PSIDTS": psidts,
			},
		},
		default: { max_commands: 7, max_planning_iterations: 5 },
		agent: { max_commands: 10, max_planning_iterations: 5 },
	};

	const provider = new GeminiProvider(config);

	test("generate returns a response", async () => {
		const response = await provider.generate("Hello, say 'test passed' if you can hear me.");
		console.log("Gemini Response:", response);
		expect(response).toBeString();
		expect(response.length).toBeGreaterThan(0);
	}, 30000);
});
