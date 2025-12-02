#!/usr/bin/env bun

/**
 * Bumps the minor version in package.json
 * Outputs the new version and tag to stdout in format:
 * version=<version>
 * tag=v<version>
 */

const packageJsonPath = "package.json";
const packageJson = await Bun.file(packageJsonPath).json() as { version: string };

const currentVersion = packageJson.version;
console.error(`Current version: ${currentVersion}`);

// Parse version (e.g., "0.1.0" -> [0, 1, 0])
const [major, minor, patch] = currentVersion.split(".").map(Number);

// Bump minor version and reset patch
const newVersion = `${major}.${minor + 1}.0`;
console.error(`New version: ${newVersion}`);

// Update package.json
packageJson.version = newVersion;
await Bun.write(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");

// Output for GitHub Actions
console.log(`version=${newVersion}`);
console.log(`tag=v${newVersion}`);

// Make this file a module
export {};

