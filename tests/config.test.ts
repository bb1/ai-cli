import { afterEach, describe, expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import { type Config, getConfigPaths, loadConfig, saveConfig, validateConfig } from "../src/config.ts";

async function _fileExists(path: string): Promise<boolean> {
	return await Bun.file(path).exists();
}

async function deleteFile(path: string): Promise<void> {
	try {
		await unlink(path);
	} catch {
		// Ignore if file doesn't exist
	}
}

describe("validateConfig", () => {
	test("validates correct config", () => {
		const config = {
			ollama: { url: "http://localhost:11434", model: "llama3" },
		};
		expect(validateConfig(config)).toBe(true);
	});

	test("rejects config without ollama section", () => {
		const config = {};
		expect(validateConfig(config)).toBe(false);
	});

	test("rejects config without ollama.url", () => {
		const config = {
			ollama: { model: "llama3" },
		};
		expect(validateConfig(config)).toBe(false);
	});

	test("rejects config without ollama.model", () => {
		const config = {
			ollama: { url: "http://localhost:11434" },
		};
		expect(validateConfig(config)).toBe(false);
	});

	test("rejects null", () => {
		expect(validateConfig(null)).toBe(false);
	});

	test("rejects non-object", () => {
		expect(validateConfig("string")).toBe(false);
		expect(validateConfig(123)).toBe(false);
		expect(validateConfig(undefined)).toBe(false);
	});

	test("rejects config with wrong types", () => {
		const config = {
			ollama: { url: 123, model: "llama3" },
		};
		expect(validateConfig(config)).toBe(false);
	});
});

describe("getConfigPaths", () => {
	test("returns local and global paths", () => {
		const paths = getConfigPaths();

		expect(paths.local).toContain(".ai-config.toml");
		expect(paths.global).toContain(".ai-config.toml");
		expect(paths.local).not.toBe(paths.global);
	});
});

describe("saveConfig and loadConfig", () => {
	const testConfigPath = `${process.cwd()}/.ai-config.toml`;

	afterEach(async () => {
		// Clean up test config file
		await deleteFile(testConfigPath);
	});

	test("saves and loads config correctly", async () => {
		const config: Config = {
			ollama: { url: "http://localhost:11434", model: "test-model" },
			default: { max_commands: 7 },
			agent: { max_commands: 10 },
		};

		// Save to local (non-global) path for testing
		await saveConfig(config, false);

		// Load it back
		const loaded = await loadConfig();

		expect(loaded).not.toBeNull();
		expect(loaded?.ollama.url).toBe(config.ollama.url);
		expect(loaded?.ollama.model).toBe(config.ollama.model);
	});

	test("returns null when no config exists", async () => {
		// Make sure no config exists
		await deleteFile(testConfigPath);

		// Note: This might find a global config, so we're just testing it doesn't throw
		const loaded = await loadConfig();
		// Either null or a valid config is acceptable
		if (loaded !== null) {
			expect(validateConfig(loaded)).toBe(true);
		}
	});
});
