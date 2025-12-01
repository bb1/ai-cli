import { type Config, saveConfig } from "./config.ts";
import { bold, cyan, green, logError, logInfo, logSuccess, readLine, yellow } from "./utils.ts";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";

// Model priority order for automatic selection suggestions
const MODEL_PRIORITY = [
	"qwen2.5-coder",
	"qwen-coder",
	"codellama",
	"deepseek-coder",
	"llama3.2",
	"llama3.1",
	"llama3",
	"llama2",
	"qwen2.5",
	"mistral",
	"gemma2",
	"phi3",
];

interface OllamaModel {
	name: string;
	modified_at: string;
	size: number;
}

interface OllamaTagsResponse {
	models: OllamaModel[];
}

async function checkOllamaConnection(url: string): Promise<boolean> {
	try {
		const response = await fetch(`${url}/api/tags`, {
			signal: AbortSignal.timeout(5000),
		});
		return response.ok;
	} catch {
		return false;
	}
}

async function fetchModels(url: string): Promise<string[]> {
	try {
		const response = await fetch(`${url}/api/tags`);
		if (!response.ok) {
			throw new Error(`Failed to fetch models: ${response.statusText}`);
		}
		const data = (await response.json()) as OllamaTagsResponse;
		return data.models.map((m) => m.name);
	} catch (error) {
		throw new Error(`Failed to fetch models: ${error}`);
	}
}

function sortModelsByPriority(models: string[]): string[] {
	const scored = models.map((model) => {
		const modelLower = model.toLowerCase();
		let priority = MODEL_PRIORITY.length + 1;

		for (let i = 0; i < MODEL_PRIORITY.length; i++) {
			if (modelLower.includes(MODEL_PRIORITY[i])) {
				priority = i;
				break;
			}
		}

		return { model, priority };
	});

	scored.sort((a, b) => a.priority - b.priority);
	return scored.map((s) => s.model);
}

async function promptForOllamaUrl(): Promise<string> {
	console.log(yellow("\nOllama not detected on default port (11434)."));
	const customUrl = await readLine(cyan("Enter Ollama URL (or press Enter to retry default): "));

	if (!customUrl.trim()) {
		return DEFAULT_OLLAMA_URL;
	}

	// Normalize URL
	let url = customUrl.trim();
	if (!url.startsWith("http://") && !url.startsWith("https://")) {
		url = `http://${url}`;
	}
	// Remove trailing slash
	url = url.replace(/\/$/, "");

	return url;
}

async function promptForModel(models: string[]): Promise<string> {
	const sortedModels = sortModelsByPriority(models);

	console.log(bold("\n📦 Available models:\n"));

	for (let i = 0; i < sortedModels.length; i++) {
		const isRecommended = i === 0;
		const prefix = isRecommended ? green("→ ") : "  ";
		const suffix = isRecommended ? green(" (recommended)") : "";
		console.log(`${prefix}${i + 1}. ${sortedModels[i]}${suffix}`);
	}

	console.log("");

	while (true) {
		const input = await readLine(cyan("Select a model (number or name): "));
		const trimmed = input.trim();

		// Check if input is a number
		const num = Number.parseInt(trimmed, 10);
		if (!Number.isNaN(num) && num >= 1 && num <= sortedModels.length) {
			return sortedModels[num - 1];
		}

		// Check if input matches a model name
		const matchedModel = sortedModels.find(
			(m) => m.toLowerCase() === trimmed.toLowerCase() || m.toLowerCase().includes(trimmed.toLowerCase()),
		);

		if (matchedModel) {
			return matchedModel;
		}

		console.log(yellow(`Invalid selection. Please enter 1-${sortedModels.length} or a model name.`));
	}
}

export async function runSetup(): Promise<Config> {
	console.log(bold("\n🔧 AI CLI Setup\n"));
	console.log("This wizard will configure the connection to your Ollama instance.\n");

	let ollamaUrl = DEFAULT_OLLAMA_URL;
	let connected = false;

	// Try to connect to Ollama
	logInfo(`Checking Ollama at ${ollamaUrl}...`);

	while (!connected) {
		connected = await checkOllamaConnection(ollamaUrl);

		if (!connected) {
			ollamaUrl = await promptForOllamaUrl();
			logInfo(`Checking Ollama at ${ollamaUrl}...`);
		}
	}

	logSuccess(`Connected to Ollama at ${ollamaUrl}`);

	// Fetch and select model
	let models: string[];
	try {
		models = await fetchModels(ollamaUrl);
	} catch (error) {
		logError(`${error}`);
		process.exit(1);
	}

	if (models.length === 0) {
		logError("No models found in Ollama. Please pull a model first:");
		console.log(cyan("  ollama pull qwen2.5-coder"));
		process.exit(1);
	}

	const selectedModel = await promptForModel(models);

	const config: Config = {
		ollama_url: ollamaUrl,
		model: selectedModel,
	};

	// Save config
	await saveConfig(config, true);
	logSuccess("\nConfiguration saved to ~/.ai-config.toml");
	console.log(cyan(`  Ollama URL: ${config.ollama_url}`));
	console.log(cyan(`  Model: ${config.model}\n`));

	return config;
}
