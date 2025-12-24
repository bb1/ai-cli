export interface AIProvider {
	generate(prompt: string, systemPrompt?: string): Promise<string>;
	generateWithContext(prompt: string, previousOutput: string, iteration: number): Promise<string>;
	retryWithMissingTool(originalPrompt: string, missingTools: string[]): Promise<string>;
}
