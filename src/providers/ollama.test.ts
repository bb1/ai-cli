import { describe, expect, mock, test } from "bun:test";
import type { Config } from "../config.ts";
import { OllamaProvider } from "./ollama.ts";

const mockConfig: Config = {
	active_provider: "ollama",
	ollama: { url: "http://localhost:11434", model: "qwen" },
	default: { max_commands: 7, max_planning_iterations: 5 },
	agent: { max_commands: 10, max_planning_iterations: 5 },
};

describe("OllamaProvider", () => {
	test("instantiation", () => {
		const provider = new OllamaProvider(mockConfig);
		expect(provider).toBeInstanceOf(OllamaProvider);
	});

	test("generate sends correct request", async () => {
		const provider = new OllamaProvider(mockConfig);

		global.fetch = mock(async (url, init) => {
			expect(url).toBe("http://localhost:11434/api/generate");
			expect(init.method).toBe("POST");
			const body = JSON.parse(init.body as string);
			expect(body.model).toBe("qwen");
			expect(body.prompt).toBe("test prompt");
			expect(body.system).toContain("Return ONLY CSV format");

			return new Response(
				JSON.stringify({
					response: "ls -la;ls;list files",
					done: true,
				}),
			);
		}) as unknown as typeof fetch;

		const result = await provider.generate("test prompt");
		expect(result).toBe("ls -la;ls;list files");
	});

	test("handles API errors gracefully", async () => {
		const provider = new OllamaProvider(mockConfig);

		global.fetch = mock(async () => {
			return new Response("Server Error", { status: 500, statusText: "Internal Server Error" });
		}) as unknown as typeof fetch;

		expect(provider.generate("test")).rejects.toThrow("Ollama API error: Internal Server Error");
	});
});
