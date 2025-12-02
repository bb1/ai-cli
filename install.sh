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
		*)          os="unknown" ;;
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
	trap "rm -rf ${tmpdir}" EXIT
	
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
	
	# Try system-wide installation first if we can write directly or have sudo
	if [ -w "${INSTALL_DIR}" ] 2>/dev/null; then
		# Can write directly to /usr/local/bin (unlikely but possible)
		install_path="${INSTALL_DIR}/${BINARY_NAME}"
		echo -e "${CYAN}Installing to ${install_path}...${NC}"
		mv "${tmpdir}/${filename}" "${install_path}"
		chmod +x "${install_path}"
	elif command -v sudo >/dev/null 2>&1; then
		# Use sudo for system-wide installation
		install_path="${INSTALL_DIR}/${BINARY_NAME}"
		echo -e "${CYAN}Installing to ${install_path} (requires sudo)...${NC}"
		sudo mv "${tmpdir}/${filename}" "${install_path}"
		sudo chmod +x "${install_path}"
	else
		# Fall back to user-local installation
		install_path="${USER_INSTALL_DIR}/${BINARY_NAME}"
		echo -e "${CYAN}Installing to ${install_path}...${NC}"
		mkdir -p "${USER_INSTALL_DIR}"
		mv "${tmpdir}/${filename}" "${install_path}"
		chmod +x "${install_path}"
	fi
	
	# Verify installation
	if [ -f "${install_path}" ] && [ -x "${install_path}" ]; then
		echo -e "${GREEN}✓ Successfully installed ${BINARY_NAME} ${version}${NC}"
		echo -e "${CYAN}Location: ${install_path}${NC}"
		
		# Check if binary is in PATH
		if ! command -v "${BINARY_NAME}" >/dev/null 2>&1; then
			if [ "${install_path}" = "${USER_INSTALL_DIR}/${BINARY_NAME}" ]; then
				echo -e "${YELLOW}Warning: ${USER_INSTALL_DIR} is not in your PATH${NC}"
				echo -e "${YELLOW}Add this to your shell profile (.bashrc, .zshrc, etc.):${NC}"
				echo -e "${CYAN}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
			fi
		else
			echo -e "${GREEN}Run '${BINARY_NAME} --version' to verify installation${NC}"
		fi
	else
		echo -e "${RED}Error: Installation verification failed${NC}" >&2
		exit 1
	fi
}

# Main installation flow
main() {
	echo -e "${CYAN}Installing ${BINARY_NAME}...${NC}"
	
	# Detect system
	local system
	system=$(detect_system)
	echo -e "${CYAN}Detected system: ${system}${NC}"
	
	# Get latest version
	echo -e "${CYAN}Fetching latest release...${NC}"
	local version
	version=$(get_latest_release "${REPO}")
	echo -e "${CYAN}Latest version: ${version}${NC}"
	
	# Install binary
	install_binary "${system}" "${version}" "${REPO}"
}

# Run main function
main "$@"

