import type { Config } from "../config.ts";
import { GeminiProvider } from "./gemini.ts";
import type { AIProvider } from "./interface.ts";
import { OllamaProvider } from "./ollama.ts";

export function getProvider(config: Config): AIProvider {
    if (config.active_provider === "gemini") {
        return new GeminiProvider(config);
    }
    // Default to Ollama
    return new OllamaProvider(config);
}

export type { AIProvider };
