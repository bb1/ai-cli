import { cyan, green, logError, logInfo, logSuccess, yellow } from "./utils.ts";

const REPO = "bb1/ai-cli";
const BINARY_NAME = "ai";
const INSTALL_DIR = "/usr/local/bin";
const USER_INSTALL_DIR = `${process.env.HOME}/.local/bin`;

interface SystemInfo {
	os: string;
	arch: string;
	system: string;
}

/**
 * Check if a path is writable
 */
async function isWritable(path: string): Promise<boolean> {
	try {
		const result = await Bun.spawn(["test", "-w", path]).exited;
		return result === 0;
	} catch {
		return false;
	}
}

/**
 * Detect OS and architecture
 */
function detectSystem(): SystemInfo {
	const platform = process.platform;
	let os: string;
	let arch: string;

	switch (platform) {
		case "linux":
			os = "linux";
			break;
		case "darwin":
			os = "darwin";
			break;
		default:
			logError(`Unsupported operating system: ${platform}`);
			logError(`Please download the binary manually from https://github.com/${REPO}/releases`);
			process.exit(1);
	}

	const machine = process.arch;
	switch (machine) {
		case "x64":
			arch = "x64";
			break;
		case "arm64":
			arch = "arm64";
			break;
		default:
			logError(`Unsupported architecture: ${machine}`);
			process.exit(1);
	}

	return { os, arch, system: `${os}-${arch}` };
}

/**
 * Find existing installation
 */
async function findExistingInstallation(): Promise<string | null> {
	const locations = [`${INSTALL_DIR}/${BINARY_NAME}`, `${USER_INSTALL_DIR}/${BINARY_NAME}`];

	// Also check PATH using Bun.which
	const whichPath = Bun.which(BINARY_NAME);
	if (whichPath) {
		locations.push(whichPath);
	}

	for (const location of locations) {
		const file = Bun.file(location);
		if (await file.exists()) {
			// Check if executable
			const stat = await file.stat();
			if (stat && (stat.mode & 0o111) !== 0) {
				return location;
			}
		}
	}

	return null;
}

/**
 * Get installed version from binary
 */
async function getInstalledVersion(binaryPath: string): Promise<string | null> {
	const file = Bun.file(binaryPath);
	if (!(await file.exists())) {
		return null;
	}

	try {
		const proc = Bun.spawn([binaryPath, "--version"], {
			stdout: "pipe",
			stderr: "pipe",
		});

		const [stdout, _stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

		const exitCode = await proc.exited;

		if (exitCode !== 0) {
			if (_stderr.trim()) {
				logError(`Failed to get version: ${_stderr.trim()}`);
			}
			return null;
		}

		// Extract version number (handles formats like "ai v0.4.0" or "v0.4.0" or "0.4.0")
		const match = stdout.match(/[vV]?([0-9]+\.[0-9]+\.[0-9]+)/);
		if (match?.[1]) {
			return match[1];
		}
	} catch {
		// Ignore errors
	}

	return null;
}

/**
 * Get latest release tag from GitHub API
 */
async function getLatestRelease(): Promise<string> {
	const url = `https://api.github.com/repos/${REPO}/releases/latest`;

	try {
		const response = await fetch(url);
		if (!response.ok) {
			logError("Failed to fetch latest release from GitHub");
			process.exit(1);
		}

		const data = (await response.json()) as { tag_name?: string };
		if (!data.tag_name) {
			logError("Could not parse release tag");
			process.exit(1);
		}

		// Remove 'v' prefix if present
		return data.tag_name.replace(/^v/, "");
	} catch (error) {
		logError(`Failed to fetch latest release: ${error}`);
		process.exit(1);
	}
}

/**
 * Download and install binary
 */
async function installBinary(system: string, version: string, existingPath: string | null): Promise<void> {
	const filename = `ai-${system}`;
	const archive = `${filename}.zip`;
	const downloadUrl = `https://github.com/${REPO}/releases/download/v${version}/${archive}`;

	logInfo(`Downloading ${BINARY_NAME} ${version} for ${system}...`);

	// Create temporary directory
	const tmpdirProc = Bun.spawn(["mktemp", "-d"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const tmpdirPath = (await new Response(tmpdirProc.stdout).text()).trim();
	await tmpdirProc.exited;

	try {
		// Download archive
		const response = await fetch(downloadUrl);
		if (!response.ok) {
			logError(`Failed to download ${archive}`);
			logError(`URL: ${downloadUrl}`);
			throw new Error(`Failed to download ${archive}`);
		}

		const archivePath = `${tmpdirPath}/${archive}`;
		await Bun.write(archivePath, response);

		// Extract archive
		const unzipResult = await Bun.spawn(["unzip", "-q", archivePath, "-d", tmpdirPath], { stderr: "pipe" }).exited;

		if (unzipResult !== 0) {
			logError(`Failed to extract ${archive}`);
			throw new Error(`Failed to extract ${archive}`);
		}

		// Make binary executable
		const binaryPath = `${tmpdirPath}/${filename}`;
		await Bun.spawn(["chmod", "+x", binaryPath]).exited;

		// Determine install location
		let installPath: string;
		let needsSudo = false;
		let backupPath: string | null = null;

		// If upgrading, use the existing installation path
		if (existingPath) {
			installPath = existingPath;
			backupPath = `${existingPath}.bak.${process.pid}`;

			// Check if we need sudo for the existing location
			const dir = existingPath.substring(0, existingPath.lastIndexOf("/"));
			if (!(await isWritable(dir))) {
				needsSudo = true;
			}
		} else {
			// New installation: try system-wide first if we can write directly or have sudo
			if (await isWritable(INSTALL_DIR)) {
				installPath = `${INSTALL_DIR}/${BINARY_NAME}`;
			} else {
				// Try to see if we can use sudo for system-wide, otherwise use user-local
				// For simplicity, we'll try system-wide with sudo if it's the standard /usr/local/bin
				if (INSTALL_DIR === "/usr/local/bin") {
					needsSudo = true;
					installPath = `${INSTALL_DIR}/${BINARY_NAME}`;
				} else {
					installPath = `${USER_INSTALL_DIR}/${BINARY_NAME}`;
					await Bun.spawn(["mkdir", "-p", USER_INSTALL_DIR], {
						stdout: "pipe",
						stderr: "pipe",
					}).exited;
				}
			}
		}

		// Backup existing binary if it exists
		if (existingPath && backupPath) {
			logInfo("Backing up existing installation...");
			if (needsSudo) {
				const result = await Bun.spawn(["sudo", "mv", existingPath, backupPath], { stdout: "pipe", stderr: "pipe" })
					.exited;
				if (result !== 0) {
					logError("Failed to backup existing installation");
					throw new Error("Failed to backup existing installation");
				}
			} else {
				const result = await Bun.spawn(["mv", existingPath, backupPath], {
					stdout: "pipe",
					stderr: "pipe",
				}).exited;
				if (result !== 0) {
					logError("Failed to backup existing installation");
					throw new Error("Failed to backup existing installation");
				}
			}
		}

		// Install new binary
		if (existingPath) {
			logInfo(`Installing ${BINARY_NAME} ${version}...`);
		} else {
			logInfo(`Installing ${BINARY_NAME} ${version} to ${installPath}...`);
		}

		let installFailed = false;

		try {
			if (needsSudo) {
				const mvResult = await Bun.spawn(["sudo", "mv", binaryPath, installPath], { stdout: "pipe", stderr: "pipe" })
					.exited;
				if (mvResult !== 0) {
					installFailed = true;
				} else {
					const chmodResult = await Bun.spawn(["sudo", "chmod", "+x", installPath], { stdout: "pipe", stderr: "pipe" })
						.exited;
					if (chmodResult !== 0) {
						installFailed = true;
					}
				}
			} else {
				const mvResult = await Bun.spawn(["mv", binaryPath, installPath], {
					stdout: "pipe",
					stderr: "pipe",
				}).exited;
				if (mvResult !== 0) {
					installFailed = true;
				} else {
					const chmodResult = await Bun.spawn(["chmod", "+x", installPath], {
						stdout: "pipe",
						stderr: "pipe",
					}).exited;
					if (chmodResult !== 0) {
						installFailed = true;
					}
				}
			}
		} catch {
			installFailed = true;
		}

		// Verify installation
		const installedFile = Bun.file(installPath);
		if (installFailed || !(await installedFile.exists())) {
			// Restore backup if it exists
			if (backupPath) {
				const backupFile = Bun.file(backupPath);
				if (await backupFile.exists()) {
					logError("Restoring previous installation...");
					if (needsSudo) {
						await Bun.spawn(["sudo", "mv", backupPath, installPath], { stdout: "pipe", stderr: "pipe" }).exited;
					} else {
						await Bun.spawn(["mv", backupPath, installPath], {
							stdout: "pipe",
							stderr: "pipe",
						}).exited;
					}
				}
			}

			logError("Installation failed");
			throw new Error("Installation failed");
		}

		// Success! Remove backup
		if (backupPath) {
			const backupFile = Bun.file(backupPath);
			if (await backupFile.exists()) {
				if (needsSudo) {
					await Bun.spawn(["sudo", "rm", "-f", backupPath], {
						stdout: "pipe",
						stderr: "pipe",
					}).exited;
				} else {
					await Bun.spawn(["rm", "-f", backupPath], {
						stdout: "pipe",
						stderr: "pipe",
					}).exited;
				}
			}
		}

		// Success message
		if (existingPath) {
			logSuccess(`Successfully updated ${BINARY_NAME} to ${version}`);
		} else {
			logSuccess(`Successfully installed ${BINARY_NAME} ${version}`);
		}
		console.log(cyan(`Location: ${installPath}`));

		// Check if binary is in PATH
		if (installPath === `${USER_INSTALL_DIR}/${BINARY_NAME}`) {
			const pathEnv = process.env.PATH || "";
			if (!pathEnv.includes(USER_INSTALL_DIR)) {
				console.log(yellow(`Note: ${USER_INSTALL_DIR} is not in your PATH. Add it to your shell profile.`));
			}
		}

		console.log(green(`Run '${BINARY_NAME} --version' to verify installation`));
	} finally {
		// Clean up temporary directory
		await Bun.spawn(["rm", "-r", "-f", tmpdirPath], {
			stdout: "pipe",
			stderr: "pipe",
		}).exited;
	}
}

/**
 * Main update function
 */
export async function runUpdate(): Promise<void> {
	// Detect system
	const systemInfo = detectSystem();
	logInfo(`Detected system: ${systemInfo.system}`);

	// Check for existing installation
	const existingPath = await findExistingInstallation();
	let installedVersion: string | null = null;

	if (existingPath) {
		logInfo(`Found existing installation at: ${existingPath}`);
		installedVersion = await getInstalledVersion(existingPath);
		if (installedVersion) {
			logInfo(`Installed version: ${installedVersion}`);
		}
	} else {
		logError("No existing installation found. Use the install script instead.");
		process.exit(1);
	}

	// Get latest version
	logInfo("Fetching latest release...");
	const latestVersion = await getLatestRelease();
	logInfo(`Latest version: ${latestVersion}`);

	// Check if update is needed
	if (installedVersion === latestVersion) {
		logSuccess(`${BINARY_NAME} is already up to date (${installedVersion})`);
		console.log(cyan("No download needed."));
		return;
	}

	// Install/upgrade binary
	if (installedVersion) {
		logInfo(`Updating from ${installedVersion} to ${latestVersion}...`);
	} else {
		logInfo(`Installing ${latestVersion}...`);
	}

	await installBinary(systemInfo.system, latestVersion, existingPath);
}
