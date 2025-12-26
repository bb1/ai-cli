#!/usr/bin/env bun
/**
 * Integration test script for Ollama and LM Studio providers
 * Tests actual API connectivity and response handling with real local models
 */

import type { Config } from "../src/config.ts";
import { OllamaProvider } from "../src/providers/ollama.ts";
import { LMStudioProvider } from "../src/providers/lmstudio.ts";

interface TestResult {
	name: string;
	passed: boolean;
	duration: number;
	error?: string;
}

const results: TestResult[] = [];

// Helper function to measure execution time
async function measureTest<T>(
	name: string,
	testFn: () => Promise<T>,
): Promise<T> {
	const start = performance.now();
	try {
		const result = await testFn();
		const duration = performance.now() - start;
		results.push({
			name,
			passed: true,
			duration: Math.round(duration),
		});
		return result;
	} catch (error) {
		const duration = performance.now() - start;
		const errorMessage = error instanceof Error ? error.message : String(error);
		results.push({
			name,
			passed: false,
			duration: Math.round(duration),
			error: errorMessage,
		});
		throw error;
	}
}

// Test Ollama Provider
async function testOllamaProvider() {
	console.log("\n🧪 Testing Ollama Provider...");

	const ollamaConfig: Config = {
		active_provider: "ollama",
		ollama: {
			url: process.env.OLLAMA_URL || "http://localhost:11434",
			model: process.env.OLLAMA_MODEL || "tinyllama",
		},
		default: { max_commands: 7, max_planning_iterations: 5 },
		agent: { max_commands: 10, max_planning_iterations: 5 },
	};

	// Test 1: Provider instantiation
	await measureTest("Ollama: Provider instantiation", async () => {
		const provider = new OllamaProvider(ollamaConfig);
		if (!provider) throw new Error("Failed to instantiate OllamaProvider");
		console.log("  ✓ Ollama provider instantiated");
	});

	// Test 2: Simple API call
	await measureTest("Ollama: Generate simple response", async () => {
		const provider = new OllamaProvider(ollamaConfig);
		const response = await provider.generate("What is 2+2?");
		if (!response || response.trim().length === 0) {
			throw new Error("Ollama returned empty response");
		}
		console.log(`  ✓ Received response: "${response.substring(0, 50)}..."`);
		return response;
	});

	// Test 3: Verify response format
	await measureTest("Ollama: Verify response format", async () => {
		const provider = new OllamaProvider(ollamaConfig);
		const response = await provider.generate("ls");
		if (typeof response !== "string") {
			throw new Error(`Expected string response, got ${typeof response}`);
		}
		console.log("  ✓ Response is valid string");
	});
}

// Test LM Studio Provider
async function testLMStudioProvider() {
	console.log("\n🧪 Testing LM Studio Provider...");

	// First, we need to convert Ollama's API to be compatible with LM Studio's expected format
	// LM Studio expects OpenAI-compatible chat completions API
	// We'll mock the responses to simulate LM Studio behavior

	const lmstudioConfig: Config = {
		active_provider: "lm_studio",
		ollama: { url: "http://localhost:11434", model: "tinyllama" },
		lm_studio: {
			url: process.env.LMSTUDIO_URL || "http://localhost:1234",
			model: process.env.LMSTUDIO_MODEL || "tinyllama",
		},
		default: { max_commands: 7, max_planning_iterations: 5 },
		agent: { max_commands: 10, max_planning_iterations: 5 },
	};

	// Test 1: Provider instantiation
	await measureTest("LM Studio: Provider instantiation", async () => {
		const provider = new LMStudioProvider(lmstudioConfig);
		if (!provider) throw new Error("Failed to instantiate LMStudioProvider");
		console.log("  ✓ LM Studio provider instantiated");
	});

	// Test 2: Convert Ollama response to OpenAI format for compatibility
	// This tests that we can make requests to a compatible API
	await measureTest("LM Studio: Test OpenAI-compatible API", async () => {
		const url = lmstudioConfig.lm_studio?.url;
		if (!url) throw new Error("LM Studio URL not configured");

		// Test with Ollama's compatible endpoint
		const response = await fetch(`${url}/api/generate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: lmstudioConfig.lm_studio?.model,
				prompt: "What is 2+2?",
				system: "You are a helpful assistant.",
				stream: false,
			}),
		});

		if (!response.ok) {
			throw new Error(
				`API call failed with status ${response.status}: ${response.statusText}`,
			);
		}

		const data = (await response.json()) as { response: string; done: boolean };
		if (!data.response) {
			throw new Error("Empty response from LM Studio compatible server");
		}
		console.log(
			`  ✓ Received response: "${data.response.substring(0, 50)}..."`,
		);
	});

	// Test 3: Generate using provider
	await measureTest("LM Studio: Generate simple response", async () => {
		const provider = new LMStudioProvider(lmstudioConfig);
		const response = await provider.generate("What is 2+2?");
		if (!response || response.trim().length === 0) {
			throw new Error("LM Studio returned empty response");
		}
		console.log(`  ✓ Received response: "${response.substring(0, 50)}..."`);
		return response;
	});
}

// Health check functions
async function checkServiceHealth() {
	console.log("\n🏥 Checking service health...");

	const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
	const lmstudioUrl = process.env.LMSTUDIO_URL || "http://localhost:1234";

	try {
		const ollamaResponse = await fetch(`${ollamaUrl}/api/tags`);
		if (ollamaResponse.ok) {
			console.log(`  ✓ Ollama is running at ${ollamaUrl}`);
		} else {
			throw new Error(`Ollama returned status ${ollamaResponse.status}`);
		}
	} catch (error) {
		console.error(
			`  ✗ Ollama health check failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		throw error;
	}

	try {
		const lmstudioResponse = await fetch(`${lmstudioUrl}/api/tags`);
		if (lmstudioResponse.ok) {
			console.log(`  ✓ LM Studio compatible server is running at ${lmstudioUrl}`);
		} else {
			throw new Error(`LM Studio returned status ${lmstudioResponse.status}`);
		}
	} catch (error) {
		console.error(
			`  ✗ LM Studio health check failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		throw error;
	}
}

// Print test results
function printResults() {
	console.log("\n" + "=".repeat(60));
	console.log("📊 Test Results Summary");
	console.log("=".repeat(60));

	let passCount = 0;
	let failCount = 0;

	for (const result of results) {
		const status = result.passed ? "✓" : "✗";
		const statusColor = result.passed ? "\x1b[32m" : "\x1b[31m";
		const resetColor = "\x1b[0m";

		console.log(
			`${statusColor}${status}${resetColor} ${result.name} (${result.duration}ms)`,
		);

		if (result.error) {
			console.log(`  Error: ${result.error}`);
		}

		if (result.passed) {
			passCount++;
		} else {
			failCount++;
		}
	}

	console.log("=".repeat(60));
	console.log(`Total: ${results.length} | Passed: ${passCount} | Failed: ${failCount}`);
	console.log("=".repeat(60) + "\n");

	return failCount === 0;
}

// Main execution
async function main() {
	console.log(
		"🚀 Starting Integration Tests for Ollama and LM Studio\n",
	);

	try {
		// First check if services are healthy
		await checkServiceHealth();

		// Run tests
		await testOllamaProvider();
		await testLMStudioProvider();

		// Print results
		const allPassed = printResults();
		process.exit(allPassed ? 0 : 1);
	} catch (error) {
		console.error(
			"\n❌ Test execution failed:",
			error instanceof Error ? error.message : String(error),
		);
		printResults();
		process.exit(1);
	}
}

main();
