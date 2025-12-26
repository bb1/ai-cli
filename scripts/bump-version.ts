#!/usr/bin/env bun

/**
 * Determines version bump type (major, minor, patch) based on commit messages
 * Uses OpenRouter API to analyze commits and determine semantic versioning
 * Outputs the new version and tag to stdout in format:
 * version=<version>
 * tag=v<version>
 * bump_type=<major|minor|patch>
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

// Determine version bump type using OpenRouter API
async function determineBumpType(commits: string[], _currentVersion: string): Promise<"major" | "minor" | "patch"> {
	if (commits.length === 0) {
		// No commits, default to patch
		return "patch";
	}

	const commitsText = commits.join("\n");

	const prompt = `Analyze the following commit messages and determine the appropriate semantic version bump type (major, minor, or patch) according to Semantic Versioning (SemVer):

Rules:
- MAJOR: Breaking changes that are incompatible with previous versions (API changes, removing features, major refactors that break compatibility)
- MINOR: New features, enhancements, or additions that are backward compatible
- PATCH: Bug fixes, small improvements, documentation updates, or refactoring that doesn't change behavior

Commit messages:
${commitsText}

Respond with ONLY the bump type: "major", "minor", or "patch". Do not include the version number or any other text.`;

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
						"You are a semantic versioning expert. Analyze commit messages and determine the appropriate version bump type.",
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
		// Fallback to minor on API error
		console.error("Falling back to minor version bump");
		return "minor";
	}

	const data = (await response.json()) as {
		choices: Array<{ message: { content: string } }>;
	};

	const responseText = data.choices[0]?.message?.content?.trim().toLowerCase() || "";

	// Extract the bump type from the response
	if (responseText.includes("major")) {
		return "major";
	} else if (responseText.includes("minor")) {
		return "minor";
	} else if (responseText.includes("patch")) {
		return "patch";
	}

	// Default to minor if we can't parse the response
	console.error(`Could not parse bump type from response: ${responseText}. Defaulting to minor.`);
	return "minor";
}

// Calculate new version based on bump type
function calculateNewVersion(currentVersion: string, bumpType: "major" | "minor" | "patch"): string {
	const [major, minor, patch] = currentVersion.split(".").map(Number);

	switch (bumpType) {
		case "major":
			return `${major + 1}.0.0`;
		case "minor":
			return `${major}.${minor + 1}.0`;
		case "patch":
			return `${major}.${minor}.${patch + 1}`;
	}
}

// Main execution
async function main() {
	const packageJsonPath = "package.json";
	const packageJson = (await Bun.file(packageJsonPath).json()) as { version: string };

	const currentVersion = packageJson.version;
	console.error(`Current version: ${currentVersion}`);

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
		console.error("No new commits found, defaulting to patch bump");
		const bumpType = "patch";
		const newVersion = calculateNewVersion(currentVersion, bumpType);
		console.error(`New version: ${newVersion} (${bumpType})`);

		packageJson.version = newVersion;
		await Bun.write(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

		console.log(`version=${newVersion}`);
		console.log(`tag=v${newVersion}`);
		console.log(`bump_type=${bumpType}`);
		return;
	}

	console.error(`Found ${commits.length} commit(s)`);
	console.error("Determining version bump type with OpenRouter API...");

	const bumpType = await determineBumpType(commits, currentVersion);
	const newVersion = calculateNewVersion(currentVersion, bumpType);

	console.error(`Determined bump type: ${bumpType}`);
	console.error(`New version: ${newVersion}`);

	// Update package.json
	packageJson.version = newVersion;
	await Bun.write(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

	// Output for GitHub Actions
	console.log(`version=${newVersion}`);
	console.log(`tag=v${newVersion}`);
	console.log(`bump_type=${bumpType}`);
}

main().catch((error) => {
	console.error("Error:", error);
	process.exit(1);
});

// Make this file a module
export { };
