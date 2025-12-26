#!/usr/bin/env bun

/**
 * Generates a changelog based on commits since the latest release tag
 * Uses OpenRouter API to create a meaningful summary
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free";

if (!OPENROUTER_KEY) {
	console.error("Error: OPENROUTER_KEY environment variable is not set");
	process.exit(1);
}

// Get the latest release tag
async function getLatestTag(): Promise<string | null> {
	const proc = Bun.spawn(["git", "describe", "--tags", "--abbrev=0"], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		// No tags found, return null
		return null;
	}

	const output = await new Response(proc.stdout).text();
	return output.trim();
}

// Get commits since the latest tag
async function getCommitsSinceTag(tag: string | null): Promise<string[]> {
	const range = tag ? `${tag}..HEAD` : "HEAD";
	const proc = Bun.spawn(["git", "log", range, "--pretty=format:%h %s"], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		console.error("Error: Failed to get commits");
		process.exit(1);
	}

	const output = await new Response(proc.stdout).text();
	return output.split("\n").filter((line) => line.trim().length > 0);
}

// Generate changelog using OpenRouter API
async function generateChangelog(commits: string[]): Promise<string> {
	if (commits.length === 0) {
		return "No new commits since last release.";
	}

	const commitsText = commits.join("\n");

	const prompt = `Generate a concise, meaningful changelog based on the following commit messages. 
Format it as markdown with clear categories (e.g., ## Features, ## Bug Fixes, ## Improvements, etc.).
Use markdown formatting: headers, bullet points, and emphasis where appropriate.
Keep it brief and user-friendly. Avoid repetition. 
If a new feature is added, only include it once and ignore all bug fixes and improvements related to it.
Only output the changelog in markdown format, no additional commentary or version numbers.

Commit messages:
${commitsText}`;

	const response = await fetch(OPENROUTER_API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${OPENROUTER_KEY}`,
		},
		body: JSON.stringify({
			model: OPENROUTER_MODEL,
			messages: [
				{
					role: "system",
					content:
						"You are a helpful assistant that generates clear, concise markdown changelogs from commit messages. Only output the changelog in markdown format.",
				},
				{
					role: "user",
					content: prompt,
				},
			],
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error(`OpenRouter API error: ${response.status} ${response.statusText}`);
		console.error(errorText);
		process.exit(1);
	}

	const data = (await response.json()) as {
		choices: Array<{ message: { content: string } }>;
	};

	return data.choices[0]?.message?.content?.trim() || "Failed to generate changelog.";
}

// Main execution
async function main() {
	console.error("Fetching latest release tag...");
	const latestTag = await getLatestTag();

	if (latestTag) {
		console.error(`Found latest tag: ${latestTag}`);
	} else {
		console.error("No release tags found, using all commits");
	}

	console.error("Getting commits since last release...");
	const commits = await getCommitsSinceTag(latestTag);

	if (commits.length === 0) {
		console.error("No new commits found");
		console.log("No new commits since last release.");
		return;
	}

	console.error(`Found ${commits.length} commit(s)`);
	console.error("Generating changelog with OpenRouter API...");

	const changelog = await generateChangelog(commits);
	console.log(changelog);
}

main().catch((error) => {
	console.error("Error:", error);
	process.exit(1);
});

// Make this file a module
export { };
