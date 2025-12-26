import { type Config, saveConfig } from "../config.ts";
import { BaseProvider } from "./base.ts";
import { buildGeminiSearchParams, formatGeminiRequestBody } from "./gemini_formatter.ts";
import { parseGeminiResponse } from "./gemini_parser.ts";

export class GeminiProvider extends BaseProvider {
	private snlm0e?: string;
	private bl?: string;

	constructor(private config: Config) {
		super();
	}

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
		const setCookies = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];

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
				Cookie: cookieHeader,
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
		this.bl = blMatch
			? blMatch[1]
			: blVersionMatch
				? blVersionMatch[1]
				: "boq_assistant-bard-web-server_20240519.16_p0";
		return this.snlm0e;
	}

	protected async callAPI(prompt: string, systemPrompt: string): Promise<string> {
		if (!this.config.gemini?.cookies) {
			throw new Error("Gemini cookies are missing. Please run 'ai setup' to configure Gemini.");
		}

		const snlm0e = await this.getSNlM0e();
		const cookieHeader = this.getCookieHeader();

		const params = buildGeminiSearchParams(this.bl || "boq_assistant-bard-web-server_20240519.16_p0");

		try {
			const requestBody = formatGeminiRequestBody({ message: prompt, systemPrompt }, snlm0e);

			const response = await fetch(
				"https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?" +
					params.toString(),
				{
					method: "POST",
					headers: {
						Cookie: cookieHeader,
						"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
						"User-Agent":
							"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
						"X-Same-Domain": "1",
					},
					body: requestBody,
				},
			);

			await this.updateCookies(response.headers);

			if (!response.ok) {
				throw new Error(`Gemini API error: ${response.status} ${response.statusText} `);
			}

			const text = await response.text();
			return parseGeminiResponse(text);
		} catch (error) {
			throw new Error(`Failed to call Gemini API: ${error} `);
		}
	}
}
