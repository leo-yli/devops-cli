#!/usr/bin/env bash
# Dops CLI wrapper script for Unix/Linux/macOS
# Usage: ./dops.sh [command] [options]
#        ./dops.sh              - Enter interactive REPL mode
#        ./dops.sh --help       - Show help
#        ./dops.sh pipeline list - Run subcommand

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    echo "Please install Node.js 20+ from https://nodejs.org/"
    exit 1
fi

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run dops CLI
node "${SCRIPT_DIR}/dist/main.js" "$@"
