@echo off
:: Dops CLI wrapper script for Windows
:: Usage: dops.cmd [command] [options]
::        dops.cmd              - Enter interactive REPL mode
::        dops.cmd --help       - Show help
::        dops.cmd pipeline list - Run subcommand

setlocal EnableDelayedExpansion

:: Check if Node.js is available
node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js 20+ from https://nodejs.org/
    exit /b 1
)

:: Get the directory of this script
set "SCRIPT_DIR=%~dp0"

:: Run dops CLI
node "!SCRIPT_DIR!dist\main.js" %*
