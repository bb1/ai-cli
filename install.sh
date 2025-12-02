#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
REPO="bb1/ai-cli"
BINARY_NAME="ai"
INSTALL_DIR="/usr/local/bin"
USER_INSTALL_DIR="$HOME/.local/bin"

# Detect OS and architecture
detect_system() {
	local os
	local arch
	
	case "$(uname -s)" in
		Linux*)     os="linux" ;;
		Darwin*)    os="darwin" ;;
		MINGW*|MSYS*|CYGWIN*)
			echo -e "${RED}Error: Windows installation is not supported via this script.${NC}"
			echo "Please download the binary manually from https://github.com/${REPO}/releases"
			exit 1
			;;
		*)          
			echo -e "${RED}Error: Unsupported operating system: $(uname -s)${NC}"
			echo "Please download the binary manually from https://github.com/${REPO}/releases"
			exit 1
			;;
	esac
	
	case "$(uname -m)" in
		x86_64|amd64) arch="x64" ;;
		aarch64|arm64) arch="arm64" ;;
		*) 
			echo -e "${RED}Error: Unsupported architecture: $(uname -m)${NC}"
			exit 1
			;;
	esac
	
	echo "${os}-${arch}"
}

# Find existing installation
find_existing_installation() {
	# Check common installation locations
	local locations=(
		"${INSTALL_DIR}/${BINARY_NAME}"
		"${USER_INSTALL_DIR}/${BINARY_NAME}"
		"$(command -v "${BINARY_NAME}" 2>/dev/null || echo "")"
	)
	
	for location in "${locations[@]}"; do
		if [ -n "$location" ] && [ -f "$location" ] && [ -x "$location" ]; then
			echo "$location"
			return 0
		fi
	done
	
	return 1
}

# Get installed version from binary
get_installed_version() {
	local binary_path=$1
	
	if [ ! -f "$binary_path" ] || [ ! -x "$binary_path" ]; then
		return 1
	fi
	
	# Try to get version from --version flag
	local version_output
	version_output=$("$binary_path" --version 2>/dev/null || echo "")
	
	if [ -z "$version_output" ]; then
		return 1
	fi
	
	# Extract version number (handles formats like "ai v0.4.0" or "v0.4.0" or "0.4.0")
	local version
	version=$(echo "$version_output" | sed -E 's/.*[vV]?([0-9]+\.[0-9]+\.[0-9]+).*/\1/' | head -1)
	
	if [ -z "$version" ]; then
		return 1
	fi
	
	echo "$version"
	return 0
}

# Configure PATH in shell profile
configure_path() {
	local install_dir=$1
	
	# Get user's default shell
	local shell
	shell="${SHELL:-$(getent passwd "$(whoami)" 2>/dev/null | cut -d: -f7)}"
	
	if [ -z "$shell" ]; then
		# Fallback: try to detect from common shells
		if [ -f "$HOME/.zshrc" ]; then
			shell="/bin/zsh"
		elif [ -f "$HOME/.bashrc" ]; then
			shell="/bin/bash"
		else
			shell="/bin/bash"
		fi
	fi
	
	# Determine shell name and profile file
	local shell_name
	local profile_file
	local path_line
	
	shell_name=$(basename "$shell")
	
	case "$shell_name" in
		bash)
			# Try .bashrc first, then .bash_profile, then .profile
			if [ -f "$HOME/.bashrc" ]; then
				profile_file="$HOME/.bashrc"
			elif [ -f "$HOME/.bash_profile" ]; then
				profile_file="$HOME/.bash_profile"
			else
				profile_file="$HOME/.profile"
			fi
			path_line="export PATH=\"\$HOME/.local/bin:\$PATH\""
			;;
		zsh)
			profile_file="$HOME/.zshrc"
			path_line="export PATH=\"\$HOME/.local/bin:\$PATH\""
			;;
		fish)
			profile_file="$HOME/.config/fish/config.fish"
			path_line="set -gx PATH \$HOME/.local/bin \$PATH"
			;;
		*)
			# Default to .profile for other shells
			profile_file="$HOME/.profile"
			path_line="export PATH=\"\$HOME/.local/bin:\$PATH\""
			;;
	esac
	
	# Check if PATH is already configured
	if [ -f "$profile_file" ]; then
		if grep -q "\.local/bin" "$profile_file" 2>/dev/null; then
			# PATH already configured
			return 0
		fi
	fi
	
	# Add PATH configuration to profile file
	echo -e "${CYAN}Adding ${install_dir} to PATH in ${profile_file}...${NC}"
	
	# Create profile file if it doesn't exist
	if [ ! -f "$profile_file" ]; then
		mkdir -p "$(dirname "$profile_file")"
		touch "$profile_file"
	fi
	
	# Add a comment and the PATH line
	{
		echo ""
		echo "# Added by ${BINARY_NAME} installer"
		echo "$path_line"
	} >> "$profile_file"
	
	echo -e "${GREEN}✓ PATH configured in ${profile_file}${NC}"
	echo -e "${YELLOW}Run 'source ${profile_file}' or restart your terminal to use ${BINARY_NAME}${NC}"
}

# Get latest release tag from GitHub API
get_latest_release() {
	local repo=$1
	local url="https://api.github.com/repos/${repo}/releases/latest"
	
	# Try to get the latest release
	local response
	response=$(curl -sL "${url}" || echo "")
	
	if [ -z "$response" ] || echo "$response" | grep -q '"message"'; then
		echo -e "${RED}Error: Failed to fetch latest release from GitHub${NC}" >&2
		exit 1
	fi
	
	# Extract tag name (remove 'v' prefix if present)
	local tag
	tag=$(echo "$response" | grep '"tag_name"' | sed -E 's/.*"tag_name":\s*"([^"]+)".*/\1/' | sed 's/^v//')
	
	if [ -z "$tag" ]; then
		echo -e "${RED}Error: Could not parse release tag${NC}" >&2
		exit 1
	fi
	
	echo "$tag"
}

# Download and install binary
install_binary() {
	local system=$1
	local version=$2
	local repo=$3
	local existing_path=${4:-""}
	
	local filename="ai-${system}"
	local archive="${filename}.zip"
	local download_url="https://github.com/${repo}/releases/download/v${version}/${archive}"
	
	# Check if curl or wget is available
	local has_curl=false
	local has_wget=false
	
	if command -v curl >/dev/null 2>&1; then
		has_curl=true
	elif command -v wget >/dev/null 2>&1; then
		has_wget=true
	else
		echo -e "${RED}Error: Neither curl nor wget is available${NC}" >&2
		exit 1
	fi
	
	echo -e "${CYAN}Downloading ${BINARY_NAME} ${version} for ${system}...${NC}"
	
	# Create temporary directory
	local tmpdir
	tmpdir=$(mktemp -d)
	trap 'if [ -n "${tmpdir:-}" ] && [ -d "${tmpdir}" ]; then rm -rf "${tmpdir}"; fi' EXIT
	
	# Download archive
	if [ "$has_curl" = true ]; then
		if ! curl -fsSL "${download_url}" -o "${tmpdir}/${archive}"; then
			echo -e "${RED}Error: Failed to download ${archive}${NC}" >&2
			echo -e "${YELLOW}URL: ${download_url}${NC}" >&2
			exit 1
		fi
	elif [ "$has_wget" = true ]; then
		if ! wget -q "${download_url}" -O "${tmpdir}/${archive}"; then
			echo -e "${RED}Error: Failed to download ${archive}${NC}" >&2
			echo -e "${YELLOW}URL: ${download_url}${NC}" >&2
			exit 1
		fi
	fi
	
	# Extract archive
	if ! unzip -q "${tmpdir}/${archive}" -d "${tmpdir}"; then
		echo -e "${RED}Error: Failed to extract ${archive}${NC}" >&2
		exit 1
	fi
	
	# Make binary executable
	chmod +x "${tmpdir}/${filename}"
	
	# Determine install location
	local install_path
	local needs_sudo=false
	local backup_path=""
	
	# If upgrading, use the existing installation path
	if [ -n "$existing_path" ]; then
		install_path="$existing_path"
		# Create backup path
		backup_path="${existing_path}.bak.$$"
		# Check if we need sudo for the existing location
		if [ ! -w "$(dirname "$existing_path")" ] 2>/dev/null; then
			needs_sudo=true
		fi
	else
		# New installation: try system-wide first if we can write directly or have sudo
		if [ -w "${INSTALL_DIR}" ] 2>/dev/null; then
			# Can write directly to /usr/local/bin (unlikely but possible)
			install_path="${INSTALL_DIR}/${BINARY_NAME}"
		elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
			# Use sudo for system-wide installation (passwordless sudo available)
			install_path="${INSTALL_DIR}/${BINARY_NAME}"
			needs_sudo=true
		elif command -v sudo >/dev/null 2>&1 && [ -t 0 ]; then
			# Sudo exists and we're in an interactive terminal - try system-wide
			install_path="${INSTALL_DIR}/${BINARY_NAME}"
			needs_sudo=true
		else
			# Fall back to user-local installation
			install_path="${USER_INSTALL_DIR}/${BINARY_NAME}"
			mkdir -p "${USER_INSTALL_DIR}"
		fi
	fi
	
	# Backup existing binary if it exists
	if [ -n "$existing_path" ] && [ -f "$existing_path" ]; then
		echo -e "${CYAN}Backing up existing installation...${NC}"
		if [ "$needs_sudo" = true ]; then
			sudo mv "$existing_path" "$backup_path"
		else
			mv "$existing_path" "$backup_path"
		fi
	fi
	
	# Install new binary
	if [ -n "$existing_path" ]; then
		echo -e "${CYAN}Installing ${BINARY_NAME} ${version}...${NC}"
	else
		echo -e "${CYAN}Installing ${BINARY_NAME} ${version} to ${install_path}...${NC}"
	fi
	
	# Install new binary (temporarily disable exit on error)
	set +e
	local install_failed=false
	
	if [ "$needs_sudo" = true ]; then
		if ! sudo mv "${tmpdir}/${filename}" "${install_path}"; then
			install_failed=true
		elif ! sudo chmod +x "${install_path}"; then
			install_failed=true
		fi
	else
		if ! mv "${tmpdir}/${filename}" "${install_path}"; then
			install_failed=true
		elif ! chmod +x "${install_path}"; then
			install_failed=true
		fi
	fi
	set -e
	
	# Verify installation
	if [ "$install_failed" = true ] || [ ! -f "${install_path}" ] || [ ! -x "${install_path}" ]; then
		# If sudo failed and we were trying system-wide, fall back to user-local
		if [ "$needs_sudo" = true ] && [ "${install_path}" = "${INSTALL_DIR}/${BINARY_NAME}" ] && [ -z "$existing_path" ]; then
			echo -e "${YELLOW}System-wide installation failed (sudo required). Falling back to user-local installation...${NC}"
			install_path="${USER_INSTALL_DIR}/${BINARY_NAME}"
			mkdir -p "${USER_INSTALL_DIR}"
			needs_sudo=false
			backup_path=""
			
			# Try user-local installation
			set +e
			install_failed=false
			if ! mv "${tmpdir}/${filename}" "${install_path}"; then
				install_failed=true
			elif ! chmod +x "${install_path}"; then
				install_failed=true
			fi
			set -e
			
			# If user-local also failed, exit with error
			if [ "$install_failed" = true ] || [ ! -f "${install_path}" ] || [ ! -x "${install_path}" ]; then
				echo -e "${RED}Error: Installation failed${NC}" >&2
				exit 1
			fi
		else
			# Restore backup if it exists
			if [ -n "$backup_path" ] && [ -f "$backup_path" ]; then
				echo -e "${YELLOW}Restoring previous installation...${NC}" >&2
				if [ "$needs_sudo" = true ]; then
					sudo mv "$backup_path" "$install_path" 2>/dev/null || true
				else
					mv "$backup_path" "$install_path" 2>/dev/null || true
				fi
			fi
			
			echo -e "${RED}Error: Installation failed${NC}" >&2
			exit 1
		fi
	fi
	
	# Success! Remove backup
	if [ -n "$backup_path" ] && [ -f "$backup_path" ]; then
		if [ "$needs_sudo" = true ]; then
			sudo rm -f "$backup_path"
		else
			rm -f "$backup_path"
		fi
	fi
	
	# Success message
	if [ -n "$existing_path" ]; then
		echo -e "${GREEN}✓ Successfully updated ${BINARY_NAME} to ${version}${NC}"
	else
		echo -e "${GREEN}✓ Successfully installed ${BINARY_NAME} ${version}${NC}"
	fi
	echo -e "${CYAN}Location: ${install_path}${NC}"
	
	# Check if binary is in PATH and configure if needed
	if [ "${install_path}" = "${USER_INSTALL_DIR}/${BINARY_NAME}" ]; then
		# Check if the install directory is in PATH (using : as delimiter to avoid partial matches)
		if echo ":${PATH}:" | grep -q ":${USER_INSTALL_DIR}:"; then
			echo -e "${GREEN}Run '${BINARY_NAME} --version' to verify installation${NC}"
		else
			# Automatically configure PATH
			configure_path "${USER_INSTALL_DIR}"
		fi
	elif command -v "${BINARY_NAME}" >/dev/null 2>&1; then
		echo -e "${GREEN}Run '${BINARY_NAME} --version' to verify installation${NC}"
	fi
	
	# Clean up temporary directory and remove trap
	trap - EXIT
	if [ -n "${tmpdir:-}" ] && [ -d "${tmpdir}" ]; then
		rm -rf "${tmpdir}"
	fi
}

# Main installation flow
main() {
	# Detect system
	local system
	system=$(detect_system)
	echo -e "${CYAN}Detected system: ${system}${NC}"
	
	# Check for existing installation
	local existing_path=""
	local installed_version=""
	if existing_path=$(find_existing_installation); then
		echo -e "${CYAN}Found existing installation at: ${existing_path}${NC}"
		# Get installed version
		if installed_version=$(get_installed_version "$existing_path"); then
			echo -e "${CYAN}Installed version: ${installed_version}${NC}"
		fi
	fi
	
	# Get latest version
	echo -e "${CYAN}Fetching latest release...${NC}"
	local latest_version
	latest_version=$(get_latest_release "${REPO}")
	echo -e "${CYAN}Latest version: ${latest_version}${NC}"
	
	# Check if update is needed
	if [ -n "$installed_version" ] && [ "$installed_version" = "$latest_version" ]; then
		echo -e "${GREEN}✓ ${BINARY_NAME} is already up to date (${installed_version})${NC}"
		echo -e "${CYAN}No download needed.${NC}"
		exit 0
	fi
	
	# Install/upgrade binary
	if [ -n "$installed_version" ]; then
		echo -e "${CYAN}Updating from ${installed_version} to ${latest_version}...${NC}"
	else
		echo -e "${CYAN}Installing ${latest_version}...${NC}"
	fi
	
	install_binary "${system}" "${latest_version}" "${REPO}" "${existing_path:-}"
}

# Run main function
main "$@"
