#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 直接执行 dist/main.js（使用 pathToFileURL 兼容 Windows）
import(pathToFileURL(join(__dirname, '../dist/main.js')).href);
