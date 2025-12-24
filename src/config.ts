import * as TOML from "smol-toml";
import { getHomeDir } from "./utils.ts";

export interface OllamaConfig {
	url: string;
	model: string;
}

export interface GeminiConfig {
	cookies: Record<string, string>;
}

export interface LMStudioConfig {
	url: string;
	model: string;
}

export interface DefaultConfig {
	max_commands: number;
	max_planning_iterations: number;
}

/** Inherits from default if not specified */
export interface AgentConfig extends DefaultConfig { }

export interface Config {
	active_provider: "ollama" | "gemini" | "lm_studio";
	ollama?: OllamaConfig;
	gemini?: GeminiConfig;
	lm_studio?: LMStudioConfig;
	default: DefaultConfig;
	agent: AgentConfig;
}

// Default values
const DEFAULTS: DefaultConfig = {
	max_commands: 7,
	max_planning_iterations: 5,
};

const DEFAULT_PROVIDER = "ollama";

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
	const ollamaSection = parsed.ollama as OllamaConfig | undefined;
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
		active_provider: (parsed.active_provider as "ollama" | "gemini") || DEFAULT_PROVIDER,
		ollama: ollamaSection,
		gemini: parsed.gemini as GeminiConfig | undefined,
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
		active_provider: config.active_provider,
		ollama: config.ollama,
		gemini: config.gemini,
		lm_studio: config.lm_studio,
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

	// Active provider must be valid string if present
	if (
		c.active_provider !== undefined &&
		c.active_provider !== "ollama" &&
		c.active_provider !== "gemini" &&
		c.active_provider !== "lm_studio"
	) {
		return false;
	}

	const activeProvider = (c.active_provider as string) || DEFAULT_PROVIDER;

	// Validate [ollama] section if it is the active provider
	if (activeProvider === "ollama") {
		if (typeof c.ollama !== "object" || c.ollama === null) {
			return false;
		}
		const ollama = c.ollama as Record<string, unknown>;
		if (typeof ollama.url !== "string" || typeof ollama.model !== "string") {
			return false;
		}
	}

	// Validate [gemini] section if it is active
	if (activeProvider === "gemini") {
		if (typeof c.gemini !== "object" || c.gemini === null) {
			return false;
		}
		const gemini = c.gemini as Record<string, unknown>;
		if (typeof gemini.cookies !== "object" || gemini.cookies === null) {
			return false;
		}
	}

	// Validate [lm_studio] section if it is active
	if (activeProvider === "lm_studio") {
		if (typeof c.lm_studio !== "object" || c.lm_studio === null) {
			return false;
		}
		const lmStudio = c.lm_studio as Record<string, unknown>;
		if (typeof lmStudio.url !== "string" || typeof lmStudio.model !== "string") {
			return false;
		}
	}

	return true;
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
		if (
			defaultSection.max_planning_iterations !== undefined &&
			typeof defaultSection.max_planning_iterations !== "number"
		) {
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
		if (agent.max_planning_iterations !== undefined && typeof agent.max_planning_iterations !== "number") {
			return false;
		}
	}

	return true;
}
