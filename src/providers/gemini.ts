import { type Config, saveConfig } from "../config.ts";
import { getOSInfo } from "../utils.ts";
import { parseGeminiResponse } from "./gemini_parser.ts";
import type { AIProvider } from "./interface.ts";

export class GeminiProvider implements AIProvider {
    private snlm0e?: string;
    private bl?: string;

    constructor(private config: Config) { }

    private getCookieHeader(): string {
        if (!this.config.gemini?.cookies) {
            return "";
        }
        return Object.entries(this.config.gemini.cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join("; ");
    }

    private async updateCookies(headers: Headers): Promise<void> {
        if (!this.config.gemini) return;

        // Bun's Headers object supports getSetCookie()
        const setCookies = typeof headers.getSetCookie === "function"
            ? headers.getSetCookie()
            : [];

        if (setCookies.length === 0) return;

        let changed = false;
        for (const cookieStr of setCookies) {
            const [nameValue] = cookieStr.split(";");
            if (nameValue) {
                const [name, ...valueParts] = nameValue.split("=");
                const value = valueParts.join("=");
                if (name && value) {
                    // Update or add any cookie provided by the server
                    if (this.config.gemini.cookies[name] !== value) {
                        this.config.gemini.cookies[name] = value;
                        changed = true;
                    }
                }
            }
        }

        if (changed) {
            await saveConfig(this.config);
        }
    }

    private async getSNlM0e(): Promise<string> {
        if (this.snlm0e) return this.snlm0e;

        if (!this.config.gemini?.cookies) {
            throw new Error("Gemini cookies are missing");
        }

        const cookieHeader = this.getCookieHeader();

        const response = await fetch("https://gemini.google.com/app", {
            headers: {
                "Cookie": cookieHeader,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
        });

        await this.updateCookies(response.headers);

        if (!response.ok) {
            throw new Error(`Failed to fetch Gemini page: ${response.status} `);
        }

        const text = await response.text();
        // Extract SNlM0e value using regex
        const match = text.match(/"SNlM0e":"([^"]+)"/);
        if (!match) {
            throw new Error("Could not find SNlM0e nonce. Cookies might be invalid.");
        }

        // Extract bl (version) value
        // usually in CF_BIC: "boq_assistant-bard-web-server_20240519.16_p0"
        const blMatch = text.match(/"cfb2h":"([^"]+)"/);
        // Fallback or specific regex might be needed. use a simpler loose match for the version string if cfb2h isn't found
        // The version usually starts with boq_assistant-bard-web-server_
        const blVersionMatch = text.match(/(boq_assistant-bard-web-server_[^"]+)/);

        this.snlm0e = match[1];
        this.bl = blMatch ? blMatch[1] : (blVersionMatch ? blVersionMatch[1] : "boq_assistant-bard-web-server_20240519.16_p0");
        return this.snlm0e;
    }

    private async callGeminiAPI(prompt: string, systemPrompt: string): Promise<string> {
        if (!this.config.gemini?.cookies) {
            throw new Error("Gemini cookies are missing. Please run 'ai setup' to configure Gemini.");
        }

        const snlm0e = await this.getSNlM0e();
        const cookieHeader = this.getCookieHeader();

        const params = new URLSearchParams();
        params.append("bl", this.bl || "boq_assistant-bard-web-server_20240519.16_p0");
        params.append("_reqid", Math.floor(Math.random() * 100000).toString());
        params.append("rt", "c");

        try {
            const response = await fetch("https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?" + params.toString(), {
                method: "POST",
                headers: {
                    "Cookie": cookieHeader,
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "X-Same-Domain": "1",
                },
                // This body is highly specific and likely needs a proper encoder.
                // For the first pass, we will try to just signal intent or fail gracefully if we can't implement the full protocol.
                // fix conversation-id to be strictly valid json struct for new chat
                body: `f.req=${encodeURIComponent(JSON.stringify([null, `[[${JSON.stringify(prompt + "\n\nSystem: " + systemPrompt)}],null,["",null,null,null,null,[]]]`]))}&at=${snlm0e}`,
            });

            await this.updateCookies(response.headers);

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status} ${response.statusText} `);
            }

            const text = await response.text();
            // Parse the complex response format (usually separated by newlines and JSON arrays)
            // This is a placeholder parser.
            return this.parseGeminiResponse(text);

        } catch (error) {
            throw new Error(`Failed to call Gemini API: ${error} `);
        }
    }

    private parseGeminiResponse(text: string): string {
        return parseGeminiResponse(text);
    }

    async generate(prompt: string, systemPrompt?: string): Promise<string> {
        const { platform, shell } = getOSInfo();
        const defaultSystemPrompt = `You are a CLI command generator.Return ONLY CSV format.
    OS: ${platform}
Shell: ${shell}
Format: command; tools; comment

Rules:
- command = the shell command to execute
- tools = space - separated binary names used in the command
- comment = brief explanation or error message
- If the task is impossible or you don't know, leave command and tools empty, fill only comment
- For complex tasks requiring multiple commands, output up to 7 lines(one command per line)
- Be concise, use standard ${platform} tools
- Do not include any text before or after the CSV lines
- Do not include CSV headers`;

        return this.callGeminiAPI(prompt, systemPrompt || defaultSystemPrompt);
    }

    async generateWithContext(
        prompt: string,
        previousOutput: string,
        iteration: number,
    ): Promise<string> {
        const { platform, shell } = getOSInfo();
        // same system prompt logic as Ollama
        const systemPrompt = `You are a CLI command generator operating in agent mode.Return ONLY CSV format.
    OS: ${platform}
Shell: ${shell}
Format: command; tools; comment
Iteration: ${iteration}/10
Previous command output:
${previousOutput} `;
        return this.callGeminiAPI(prompt, systemPrompt);
    }

    async retryWithMissingTool(
        originalPrompt: string,
        missingTools: string[],
    ): Promise<string> {
        // same system prompt logic as Ollama
        const { platform, shell } = getOSInfo();
        const systemPrompt = `Missing tools: ${missingTools.join(", ")} `;
        return this.callGeminiAPI(originalPrompt, systemPrompt);
    }
}
