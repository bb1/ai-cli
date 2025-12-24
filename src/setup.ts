import { type Config, type GeminiConfig, type LMStudioConfig, type OllamaConfig, saveConfig } from "./config.ts";
// biome-ignore lint/correctness/noUnusedImports: cyan is used in multiple places (lines 83, 169, 279, 293, 294)
import { bold, cyan, green, logError, logInfo, logSuccess, readLine, yellow } from "./utils.ts";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_LMSTUDIO_URL = "http://localhost:1234";

// Model priority order for automatic selection suggestions
const MODEL_PRIORITY = [
	"minimax-m2-gguf",
	"kimi-k2-thinking",
	"qwen3-coder",
	"gpt-oss",
	"gemma3",
	"qwen2.5-coder",
	"deepseek-coder",
	"mistral",
	"llama3.2",
	"llama3.1",
	"llama3",
	"codellama",
	"qwen2.5",
	"gemma2",
	"qwen-coder",
	"phi3",
	"llama2",
];

interface OllamaModel {
	name: string;
	modified_at: string;
	size: number;
}

interface OllamaTagsResponse {
	models: OllamaModel[];
}

interface LMStudioModelObject {
	id: string;
	object: string;
}

interface LMStudioModelsResponse {
	data: LMStudioModelObject[];
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

async function checkLMStudioConnection(url: string): Promise<boolean> {
	try {
		const response = await fetch(`${url}/v1/models`, {
			signal: AbortSignal.timeout(5000),
		});
		return response.ok;
	} catch {
		return false;
	}
}

async function fetchLMStudioModels(url: string): Promise<string[]> {
	try {
		const response = await fetch(`${url}/v1/models`);
		if (!response.ok) {
			throw new Error(`Failed to fetch models: ${response.statusText}`);
		}
		const data = (await response.json()) as LMStudioModelsResponse;
		return data.data.map((m) => m.id);
	} catch (error) {
		throw new Error(`Failed to fetch models: ${error}`);
	}
}

function findPreselectedModelIndex(models: string[]): number {
	let bestIndex = 0;
	let bestPriority = MODEL_PRIORITY.length + 1;

	for (let i = 0; i < models.length; i++) {
		const modelLower = models[i].toLowerCase();
		for (let j = 0; j < MODEL_PRIORITY.length; j++) {
			if (modelLower.includes(MODEL_PRIORITY[j])) {
				if (j < bestPriority) {
					bestPriority = j;
					bestIndex = i;
				}
				break;
			}
		}
	}

	return bestIndex;
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
	const preselectedIndex = findPreselectedModelIndex(models);
	let selectedIndex = preselectedIndex;

	// ANSI escape codes for cursor control
	const cursorUp = (n: number) => `\x1b[${n}A`;
	const clearLine = "\x1b[2K";
	const hideCursor = "\x1b[?25l";
	const showCursor = "\x1b[?25h";
	const bgBlue = "\x1b[44m";
	const reset = "\x1b[0m";
	const boldCode = "\x1b[1m";
	const greenCode = "\x1b[32m";
	const cyanCode = "\x1b[36m";

	const renderList = (isRedraw = false): void => {
		process.stdout.write(hideCursor);

		if (isRedraw) {
			// Move cursor back to start of first model line
			// We're on the instruction line (line models.length + 1), move up models.length to get to first model
			process.stdout.write(cursorUp(models.length));
		}

		// Redraw all model lines
		for (let i = 0; i < models.length; i++) {
			process.stdout.write("\r");
			process.stdout.write(clearLine);
			process.stdout.write(reset); // Reset all formatting at start of line

			const isSelected = i === selectedIndex;
			const isPreselected = i === preselectedIndex && preselectedIndex !== selectedIndex;

			// Apply background color for selected row (before any text)
			if (isSelected) {
				process.stdout.write(bgBlue);
			}

			// Write prefix with colors (but don't reset if background is active)
			if (isSelected) {
				process.stdout.write(boldCode); // Bold for selected arrow
				process.stdout.write(greenCode);
				process.stdout.write("▶ "); // Bolder arrow character
			} else if (isPreselected) {
				process.stdout.write(cyanCode);
				process.stdout.write("  ");
			} else {
				process.stdout.write("  ");
			}

			// Write model number and name (keep background if selected)
			process.stdout.write(`${i + 1}. ${models[i]}`);

			// Write suffix if preselected (keep background if selected)
			if (isPreselected) {
				process.stdout.write(cyanCode);
				process.stdout.write(" (recommended)");
			}

			// Reset all formatting at end of line
			process.stdout.write(reset);

			// Always write newline to move to next line
			process.stdout.write("\n");
		}

		// Redraw instruction line (we're now on the instruction line after the loop)
		process.stdout.write("\r");
		process.stdout.write(clearLine);
		process.stdout.write(cyan("Use ↑/↓ to navigate, Enter to confirm"));
		// CRITICAL: Don't write newline - stay on this line
		process.stdout.write(showCursor);
	};

	// Initial render
	console.log(bold("\n📦 Available models:\n"));
	renderList();

	// Set stdin to raw mode for keypress handling
	const wasRaw = (process.stdin as { isRaw?: boolean }).isRaw ?? false;
	if (!wasRaw && typeof (process.stdin as { setRawMode?: (mode: boolean) => void }).setRawMode === "function") {
		(process.stdin as { setRawMode: (mode: boolean) => void }).setRawMode(true);
	}

	try {
		const reader = Bun.stdin.stream().getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			// Process complete key sequences
			while (buffer.length > 0) {
				// Check for arrow keys (ESC [ A = up, ESC [ B = down)
				if (buffer.startsWith("\x1b[")) {
					if (buffer.length < 3) break; // Need more data

					const key = buffer[2];
					if (key === "A") {
						// Up arrow
						if (selectedIndex > 0) {
							selectedIndex--;
							renderList(true);
						}
						buffer = buffer.slice(3);
					} else if (key === "B") {
						// Down arrow
						if (selectedIndex < models.length - 1) {
							selectedIndex++;
							renderList(true);
						}
						buffer = buffer.slice(3);
					} else {
						// Other escape sequence, consume it
						buffer = buffer.slice(3);
					}
				} else if (buffer[0] === "\r" || buffer[0] === "\n") {
					// Enter key
					reader.releaseLock();
					process.stdout.write("\n");
					return models[selectedIndex];
				} else if (buffer[0] === "\x03") {
					// Ctrl+C
					reader.releaseLock();
					process.stdout.write("\n");
					process.exit(130);
				} else {
					// Unknown key, consume one character
					buffer = buffer.slice(1);
				}
			}
		}

		reader.releaseLock();
		return models[selectedIndex];
	} finally {
		if (!wasRaw && typeof (process.stdin as { setRawMode?: (mode: boolean) => void }).setRawMode === "function") {
			(process.stdin as { setRawMode: (mode: boolean) => void }).setRawMode(false);
		}
		process.stdout.write(showCursor);
	}
}

async function promptForLMStudioUrl(): Promise<string> {
	console.log(yellow("\nLM Studio not detected on default port (1234)."));
	const customUrl = await readLine(cyan("Enter LM Studio URL (or press Enter to retry default): "));

	if (!customUrl.trim()) {
		return DEFAULT_LMSTUDIO_URL;
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

async function promptForProvider(): Promise<"ollama" | "gemini" | "lm_studio"> {
	console.log(bold("\n🤖 Select AI Provider:\n"));
	const options = ["Ollama (Local)", "LM Studio (Local)", "Gemini (Web)"];

	const selection = await promptForModel(options);
	if (selection.startsWith("Ollama")) return "ollama";
	if (selection.startsWith("LM Studio")) return "lm_studio";
	return "gemini";
}

async function configureGemini(): Promise<GeminiConfig> {
	console.log(bold("\n♊ Gemini Setup\n"));
	console.log("Please provide your Gemini cookies from gemini.google.com");
	console.log("1. Open gemini.google.com (make sure you are logged in)");
	console.log("2. Open Developer Tools (F12) -> Application -> Cookies");
	console.log("3. Copy the values for __Secure-1PSID and __Secure-1PSIDTS\n");

	const psid = await readLine(cyan("Enter __Secure-1PSID: "));
	const psidts = await readLine(cyan("Enter __Secure-1PSIDTS: "));

	return {
		cookies: {
			"__Secure-1PSID": psid.trim(),
			"__Secure-1PSIDTS": psidts.trim(),
		},
	};
}

async function configureOllama(): Promise<OllamaConfig> {
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
	return { url: ollamaUrl, model: selectedModel };
}

async function configureLMStudio(): Promise<LMStudioConfig> {
	console.log("This wizard will configure the connection to your LM Studio instance.\n");
	console.log("Ensure LM Studio is running and the Local Server is started.");

	let url = DEFAULT_LMSTUDIO_URL;
	let connected = false;

	// Try to connect
	logInfo(`Checking LM Studio at ${url}...`);

	while (!connected) {
		connected = await checkLMStudioConnection(url);

		if (!connected) {
			url = await promptForLMStudioUrl();
			logInfo(`Checking LM Studio at ${url}...`);
		}
	}

	logSuccess(`Connected to LM Studio at ${url}`);

	// Fetch and select model
	let models: string[];
	try {
		models = await fetchLMStudioModels(url);
	} catch (error) {
		logError(`${error}`);
		process.exit(1);
	}

	if (models.length === 0) {
		logError("No loaded models found in LM Studio. Please load a model in LM Studio first.");
		process.exit(1);
	}

	const selectedModel = await promptForModel(models);
	return { url, model: selectedModel };
}

export async function runSetup(): Promise<Config> {
	console.log(bold("\n🔧 AI CLI Setup\n"));

	const provider = await promptForProvider();

	let ollamaConfig: OllamaConfig | undefined;
	let geminiConfig: GeminiConfig | undefined;
	let lmStudioConfig: LMStudioConfig | undefined;

	if (provider === "ollama") {
		ollamaConfig = await configureOllama();
	} else if (provider === "lm_studio") {
		lmStudioConfig = await configureLMStudio();
	} else {
		geminiConfig = await configureGemini();
	}

	const config: Config = {
		active_provider: provider,
		ollama: ollamaConfig,
		gemini: geminiConfig,
		lm_studio: lmStudioConfig,
		default: { max_commands: 7, max_planning_iterations: 5 },
		agent: { max_commands: 10, max_planning_iterations: 5 },
	};

	await saveConfig(config, true);
	logSuccess("\nConfiguration saved to ~/.ai-config.toml");
	if (provider === "ollama") {
		console.log(cyan(`  Ollama URL: ${config.ollama.url}`));
		console.log(cyan(`  Model: ${config.ollama.model}\n`));
	} else if (provider === "lm_studio" && config.lm_studio) {
		console.log(cyan(`  LM Studio URL: ${config.lm_studio.url}`));
		console.log(cyan(`  Model: ${config.lm_studio.model}\n`));
	} else {
		console.log(cyan(`  Provider: Gemini (Web)\n`));
	}

	return config;
}
