# AI CLI

A Bun-native CLI tool that uses Ollama to generate shell commands from natural language.

## Features

- **Natural Language to Shell**: Describe what you want to do, get a shell command
- **Smart Tool Detection**: Validates that required binaries exist before execution
- **Safety Checks**: Warns about potentially dangerous commands (rm -rf, etc.)
- **Agent Mode**: Execute iterative commands with output fed back to the LLM
- **Auto Setup**: Automatically detects Ollama and available models

## Installation

### Build from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/ai-cli.git
cd ai-cli

# Install dependencies
bun install

# Build the binary (for current platform)
bun run build

# Build specifically for Linux x64 (requires Bun 1.0.7+)
bun run build:linux-x64

# Move to PATH (optional)
sudo mv ai /usr/local/bin/
```

### Requirements

- [Bun](https://bun.sh) v1.0.7+ (for building)
- [Ollama](https://ollama.ai) running locally or remotely
- A pulled model (e.g., `ollama pull qwen2.5-coder`)

## Usage

### Basic Usage

```bash
# Generate a command from natural language
ai find all package.json files in the home directory

# List all docker containers
ai show running docker containers

# Compress files
ai compress all png files in current directory to a zip
```

### Agent Mode

Agent mode executes commands iteratively, feeding output back to the LLM:

```bash
# Find and process files
ai agent find all files larger than 1GB and delete them

# Clean up a project
ai agent remove all node_modules folders in this directory tree
```

### Commands

```bash
ai <query>           # Generate and execute a command
ai agent <query>     # Run in agent mode (iterative)
ai setup             # Run configuration wizard
ai --help            # Show help
ai --version         # Show version
```

### Confirmation Options

When a command is generated, you'll be prompted:

- `Y` or Enter - Execute the command
- `n` - Cancel
- `adjust` - Modify your query and retry

## Configuration

Configuration is stored in `~/.ai-config.toml`:

```toml
[ollama]
url = "http://localhost:11434"
model = "qwen2.5-coder"

[default]
max_commands = 7    # Max commands per LLM response (standard mode)

[agent]
max_commands = 10   # Max commands per LLM response (agent mode, inherits from default if not set)
```

The `[agent]` section inherits from `[default]` - any setting not specified in `[agent]` will use the value from `[default]`.

You can also create a local `.ai-config.toml` in your project directory to override the global config.

### First Run

On first run, the CLI will:

1. Check if Ollama is running on `localhost:11434`
2. If not found, prompt for a custom URL
3. List available models and let you choose one
4. Save the configuration

## Safety Features

The CLI includes safety checks for dangerous commands:

- **High Risk** (🔴): `rm -rf /`, `mkfs`, `dd` to disk, etc.
- **Medium Risk** (🟡): `curl | sh`, writing to `/etc/`, etc.

Dangerous commands are highlighted in RED with a warning message.

## Development

```bash
# Install dependencies
bun install

# Run in development mode (with watch)
bun run dev

# Run tests
bun run test

# Lint code
bun run lint

# Build binary
bun run build
```

## Project Structure

```
ai-cli/
├── src/
│   ├── index.ts      # CLI entry point
│   ├── config.ts     # Configuration management
│   ├── setup.ts      # Setup wizard
│   ├── ollama.ts     # Ollama API client
│   ├── executor.ts   # Command execution
│   ├── safety.ts     # Safety checks
│   ├── parser.ts     # Response parsing
│   ├── prompt.ts     # Prompt templates
│   ├── agent.ts      # Agent mode
│   └── utils.ts      # Utilities
├── scripts/          # Build and release scripts
│   ├── build.ts      # Binary build script
│   ├── bump-version.ts      # Version bumping with LLM
│   └── generate-changelog.ts # Changelog generation with LLM
├── tests/            # Test files
├── package.json
├── tsconfig.json
└── .cursorrules
```

## License

MIT

