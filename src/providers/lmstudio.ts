import type { Config } from "../config.ts";
import { BaseProvider } from "./base.ts";

interface ChatCompletionResponse {
    choices: {
        message: {
            content: string;
        };
    }[];
}

export class LMStudioProvider extends BaseProvider {
    constructor(private config: Config) {
        super();
    }

    protected async callAPI(prompt: string, systemPrompt: string): Promise<string> {
        if (!this.config.lm_studio) {
            throw new Error("LM Studio configuration missing");
        }

        try {
            const response = await fetch(`${this.config.lm_studio.url}/v1/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: this.config.lm_studio.model,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: prompt },
                    ],
                    temperature: 0.7,
                }),
            });

            if (!response.ok) {
                throw new Error(`LM Studio API error: ${response.statusText}`);
            }

            const data = (await response.json()) as ChatCompletionResponse;
            return data.choices[0].message.content.trim();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (
                error instanceof TypeError ||
                errorMessage.includes("connect") ||
                errorMessage.includes("Unable to connect") ||
                errorMessage.includes("fetch failed") ||
                errorMessage.includes("ECONNREFUSED")
            ) {
                throw new Error(
                    `Cannot connect to LM Studio at ${this.config.lm_studio.url}.\n` +
                    `Is LM Studio running? Make sure the server is started.\n` +
                    `Or check your config: ai setup`,
                );
            }
            throw error;
        }
    }
}

