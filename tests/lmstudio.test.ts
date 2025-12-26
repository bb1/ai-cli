import { describe, expect, mock, test } from "bun:test";
import type { Config } from "../src/config.ts";
import { LMStudioProvider } from "../src/providers/lmstudio.ts";

const mockConfig: Config = {
	active_provider: "lm_studio",
	ollama: { url: "http://localhost:11434", model: "qwen" },
	lm_studio: { url: "http://localhost:1234", model: "local-model" },
	default: { max_commands: 7, max_planning_iterations: 5 },
	agent: { max_commands: 10, max_planning_iterations: 5 },
};

describe("LMStudioProvider", () => {
	test("instantiation", () => {
		const provider = new LMStudioProvider(mockConfig);
		expect(provider).toBeInstanceOf(LMStudioProvider);
	});

	test("generate sends correct request", async () => {
		const provider = new LMStudioProvider(mockConfig);

		global.fetch = mock(async (url, init) => {
			expect(url).toBe("http://localhost:1234/v1/chat/completions");
			expect(init.method).toBe("POST");
			const body = JSON.parse(init.body as string);
			expect(body.model).toBe("local-model");
			expect(body.messages[0].role).toBe("system");
			expect(body.messages[1].role).toBe("user");
			expect(body.messages[1].content).toBe("test prompt");

			return new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								content: "ls -la;ls;list files",
							},
						},
					],
				}),
			);
		}) as unknown as typeof fetch;

		const result = await provider.generate("test prompt");
		expect(result).toBe("ls -la;ls;list files");
	});

	test("handles API errors gracefully", async () => {
		const provider = new LMStudioProvider(mockConfig);

		global.fetch = mock(async () => {
			return new Response("Server Error", { status: 500, statusText: "Internal Server Error" });
		}) as unknown as typeof fetch;

		expect(provider.generate("test")).rejects.toThrow("LM Studio API error: Internal Server Error");
	});

	test("handles connection refused", async () => {
		const provider = new LMStudioProvider(mockConfig);

		global.fetch = mock(async () => {
			throw new TypeError("fetch failed");
		}) as unknown as typeof fetch;

		try {
			await provider.generate("test");
		} catch (error) {
			const e = error as Error;
			expect(e.message).toContain("Cannot connect to LM Studio");
			expect(e.message).toContain("check your config: ai setup");
		}
	});

	test("retryWithMissingTool sends correct system prompt", async () => {
		const provider = new LMStudioProvider(mockConfig);

		global.fetch = mock(async (_url, init) => {
			const body = JSON.parse(init.body as string);
			expect(body.messages[0].content).toContain("NOT available on this system: missing_tool");

			return new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								content: "new_command;tools;comment",
							},
						},
					],
				}),
			);
		}) as unknown as typeof fetch;

		await provider.retryWithMissingTool("original prompt", ["missing_tool"]);
	});
});
