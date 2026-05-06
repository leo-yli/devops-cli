@echo off
setlocal EnableDelayedExpansion

:: Get the directory of this script
set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=!SCRIPT_DIR!.."

:: Run dops CLI
node "!PROJECT_DIR!\dist\main.js" %*
