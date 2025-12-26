#!/usr/bin/env bun

import { parseArgs } from "node:util";

const args = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		target: { type: "string" },
		outfile: { type: "string", default: "ai" },
	},
	allowPositionals: true,
});

// Read version from package.json
const packageJson = (await Bun.file("package.json").json()) as { version: string };
const version = packageJson.version;

// Build command arguments
const buildArgs = ["build", "src/index.ts", "--compile", `--define=process.env.AI_CLI_VERSION="${version}"`];

if (args.values.target) {
	buildArgs.push(`--target=${args.values.target}`);
}

buildArgs.push(`--outfile=${args.values.outfile}`);

console.log(`Building with version: ${version}`);
console.log(`Running: bun ${buildArgs.join(" ")}`);

const proc = Bun.spawn(["bun", ...buildArgs], {
	stdout: "inherit",
	stderr: "inherit",
});

const exitCode = await proc.exited;
process.exit(exitCode);
