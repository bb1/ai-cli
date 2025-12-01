import * as TOML from "smol-toml";
import { getHomeDir } from "./utils.ts";

export interface Config {
	ollama_url: string;
	model: string;
}

const CONFIG_FILENAME = ".ai-config.toml";

function joinPath(...parts: string[]): string {
	return parts.join("/").replace(/\/+/g, "/");
}

export function getConfigPaths(): { local: string; global: string } {
	const cwd = process.cwd();
	const home = getHomeDir();

	return {
		local: joinPath(cwd, CONFIG_FILENAME),
		global: joinPath(home, CONFIG_FILENAME),
	};
}

async function fileExists(path: string): Promise<boolean> {
	try {
		const file = Bun.file(path);
		return await file.exists();
	} catch {
		return false;
	}
}

export async function loadConfig(): Promise<Config | null> {
	const paths = getConfigPaths();

	// Check local config first
	if (await fileExists(paths.local)) {
		try {
			const content = await Bun.file(paths.local).text();
			return TOML.parse(content) as unknown as Config;
		} catch {
			// Fall through to global config
		}
	}

	// Check global config
	if (await fileExists(paths.global)) {
		try {
			const content = await Bun.file(paths.global).text();
			return TOML.parse(content) as unknown as Config;
		} catch {
			return null;
		}
	}

	return null;
}

export async function saveConfig(config: Config, global = true): Promise<void> {
	const paths = getConfigPaths();
	const targetPath = global ? paths.global : paths.local;

	const tomlContent = TOML.stringify(config);
	await Bun.write(targetPath, tomlContent);
}

export function validateConfig(config: unknown): config is Config {
	if (typeof config !== "object" || config === null) {
		return false;
	}

	const c = config as Record<string, unknown>;
	return typeof c.ollama_url === "string" && typeof c.model === "string";
}
