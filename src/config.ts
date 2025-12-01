import * as TOML from "smol-toml";
import { getHomeDir } from "./utils.ts";

export interface DefaultConfig {
	max_commands: number;
}

/** Inherits from default if not specified */
export interface AgentConfig extends DefaultConfig {
	max_commands: number;
}

export interface Config {
	ollama_url: string;
	model: string;
	default: DefaultConfig;
	agent: AgentConfig;
}

// Default values
const DEFAULTS: DefaultConfig = {
	max_commands: 7,
};

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

function mergeWithDefaults(parsed: Record<string, unknown>): Config {
	const defaultSection = parsed.default as Partial<DefaultConfig> | undefined;
	const agentSection = parsed.agent as Partial<AgentConfig> | undefined;

	// Build default config by merging DEFAULTS with any default section overrides
	const defaultConfig: DefaultConfig = {
		...DEFAULTS,
		...defaultSection,
	};

	// Agent inherits from default, then applies its own overrides
	const agentConfig: AgentConfig = {
		...defaultConfig,
		...agentSection,
	};

	return {
		ollama_url: parsed.ollama_url as string,
		model: parsed.model as string,
		default: defaultConfig,
		agent: agentConfig,
	};
}

export async function loadConfig(): Promise<Config | null> {
	const paths = getConfigPaths();

	// Check local config first
	if (await fileExists(paths.local)) {
		try {
			const content = await Bun.file(paths.local).text();
			const parsed = TOML.parse(content) as Record<string, unknown>;
			if (validateConfigRequired(parsed)) {
				return mergeWithDefaults(parsed);
			}
		} catch {
			// Fall through to global config
		}
	}

	// Check global config
	if (await fileExists(paths.global)) {
		try {
			const content = await Bun.file(paths.global).text();
			const parsed = TOML.parse(content) as Record<string, unknown>;
			if (validateConfigRequired(parsed)) {
				return mergeWithDefaults(parsed);
			}
		} catch {
			return null;
		}
	}

	return null;
}

export async function saveConfig(config: Config, global = true): Promise<void> {
	const paths = getConfigPaths();
	const targetPath = global ? paths.global : paths.local;

	const tomlContent = TOML.stringify({
		ollama_url: config.ollama_url,
		model: config.model,
		default: config.default,
		agent: config.agent,
	});
	await Bun.write(targetPath, tomlContent);
}

function validateConfigRequired(config: unknown): boolean {
	if (typeof config !== "object" || config === null) {
		return false;
	}

	const c = config as Record<string, unknown>;
	return typeof c.ollama_url === "string" && typeof c.model === "string";
}

export function validateConfig(config: unknown): config is Config {
	if (!validateConfigRequired(config)) {
		return false;
	}

	const c = config as Record<string, unknown>;

	// Validate optional sections if present
	if (c.default !== undefined) {
		if (typeof c.default !== "object" || c.default === null) {
			return false;
		}
		const defaultSection = c.default as Record<string, unknown>;
		if (defaultSection.max_commands !== undefined && typeof defaultSection.max_commands !== "number") {
			return false;
		}
	}

	if (c.agent !== undefined) {
		if (typeof c.agent !== "object" || c.agent === null) {
			return false;
		}
		const agent = c.agent as Record<string, unknown>;
		if (agent.max_commands !== undefined && typeof agent.max_commands !== "number") {
			return false;
		}
	}

	return true;
}
