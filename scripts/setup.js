#!/usr/bin/env node
/**
 * Dops CLI 统一初始化脚本
 * 功能：环境检查 → 依赖安装 → 自动构建 → 初始化配置 → 全局访问设置
 *
 * 用法：
 *   node scripts/setup.js          # 交互式初始化
 *   node scripts/setup.js --yes    # 非交互式（使用默认值）
 *   node scripts/setup.js --global # 同时设置全局访问（npm link）
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const isWindows = process.platform === 'win32';
const homeDir = os.homedir();
const configDir = path.join(homeDir, '.dops');

// Windows 下设置 UTF-8 编码，防止中文乱码
if (isWindows) {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch {}
}

// 颜色输出（兼容 Windows）
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function print(color, msg) {
  console.log(`${color}${msg}${c.reset}`);
}

function section(title) {
  console.log('');
  print(c.bold + c.cyan, `▶ ${title}`);
}

function success(msg) {
  print(c.green, `  ✓ ${msg}`);
}

function warn(msg) {
  print(c.yellow, `  ⚠ ${msg}`);
}

function error(msg) {
  print(c.red, `  ✗ ${msg}`);
}

function info(msg) {
  print(c.dim, `  ${msg}`);
}

// 解析命令行参数
const args = process.argv.slice(2);
const yesMode = args.includes('--yes') || args.includes('-y');
const globalMode = args.includes('--global') || args.includes('-g');

// ---------------------- 步骤 1：Node.js 版本检查 ----------------------

section('检查 Node.js 环境');

const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

if (majorVersion < 20) {
  error(`Node.js 版本过低：${nodeVersion}，需要 >= 20.0.0`);
  info('请从 https://nodejs.org/ 下载并安装 Node.js 20+');
  process.exit(1);
}

success(`Node.js ${nodeVersion}`);

// 检查是否安装了 pnpm/npm
function detectPackageManager() {
  const managers = ['pnpm', 'npm', 'yarn'];
  for (const pm of managers) {
    try {
      execSync(`${pm} --version`, { stdio: 'ignore' });
      return pm;
    } catch {}
  }
  return null;
}

const packageManager = detectPackageManager();
if (!packageManager) {
  error('未找到包管理器（pnpm/npm/yarn）');
  info('请先安装 Node.js（内置 npm）或 pnpm');
  process.exit(1);
}

success(`包管理器: ${packageManager}`);

// ---------------------- 步骤 2：安装依赖 ----------------------

section('安装依赖');

try {
  const lockFile = path.join(rootDir, 'pnpm-lock.yaml');

  let installArgs = ['install'];
  if (packageManager === 'npm' && (await fileExists(lockFile))) {
    info('检测到 pnpm-lock.yaml，建议安装 pnpm 以获得最佳体验');
  }

  await runCommand(packageManager, installArgs, { cwd: rootDir });
  success('依赖安装完成');
} catch (e) {
  error('依赖安装失败');
  console.error(e.message);
  process.exit(1);
}

// ---------------------- 步骤 3：构建项目 ----------------------

section('构建项目');

try {
  await runCommand(packageManager, ['run', 'build'], { cwd: rootDir });
  success('构建完成');
} catch (e) {
  error('构建失败');
  console.error(e.message);
  process.exit(1);
}

// ---------------------- 步骤 4：初始化配置 ----------------------

section('初始化配置');

try {
  await fs.mkdir(configDir, { recursive: true });
  success(`配置目录: ${configDir}`);
} catch (e) {
  warn(`创建配置目录失败: ${e.message}`);
}

// 默认配置
const defaultConfig = {
  defaultHost: 'https://ci.jlpay.com',
  defaultTenant: '',
  defaultUsername: '',
  defaultPassword: '',
  llm: {
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: '',
    baseUrl: '',
  },
  agent: {
    confirmWriteOps: true,
    maxAutoSteps: 10,
    stream: true,
  },
};

const configPath = path.join(configDir, 'config.yaml');
const configExists = await fileExists(configPath);

let userConfig = { ...defaultConfig };

if (!yesMode && !configExists) {
  // 交互式向导
  print(c.bold, '\n首次使用，请配置基本信息（直接回车使用默认值）：\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question, defaultValue = '') =>
    new Promise((resolve) => {
      const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
      rl.question(prompt, (answer) => {
        resolve(answer.trim() || defaultValue);
      });
    });

  const host = await ask('DevOps 平台地址', defaultConfig.defaultHost);
  const tenant = await ask('默认租户（可选）', defaultConfig.defaultTenant);
  const username = await ask('默认用户名（可选）', defaultConfig.defaultUsername);

  userConfig.defaultHost = host;
  userConfig.defaultTenant = tenant;
  userConfig.defaultUsername = username;

  const useLLM = await ask('是否配置 LLM（用于 AI 功能）? (y/N)', 'N');
  if (useLLM.toLowerCase() === 'y') {
    const provider = await ask('LLM 提供商 (openai/anthropic/azure)', 'openai');
    const model = await ask('模型名称', provider === 'anthropic' ? 'claude-3-5-sonnet-latest' : 'gpt-4o');
    const apiKey = await ask('API Key（可选）', '');
    userConfig.llm.provider = provider;
    userConfig.llm.model = model;
    userConfig.llm.apiKey = apiKey;
  }

  rl.close();
}

// 写入配置文件
try {
  const yaml = await import('yaml');
  if (!configExists) {
    await fs.writeFile(configPath, yaml.stringify(userConfig), 'utf-8');
    success(`配置文件: ${configPath}`);
  } else {
    info('配置文件已存在，跳过创建');
  }
} catch (e) {
  warn(`写入配置文件失败: ${e.message}`);
}

// MCP 配置
const mcpPath = path.join(configDir, 'mcp.json');
try {
  if (!(await fileExists(mcpPath))) {
    await fs.writeFile(mcpPath, JSON.stringify({ mcpServers: {} }, null, 2), 'utf-8');
    success(`MCP 配置: ${mcpPath}`);
  } else {
    info('MCP 配置文件已存在，跳过创建');
  }
} catch (e) {
  warn(`写入 MCP 配置失败: ${e.message}`);
}

// ---------------------- 步骤 5：设置全局访问 ----------------------

section('设置全局访问');

let globalAvailable = false;

// 方法 1：尝试 npm/pnpm link
if (globalMode) {
  try {
    const linkArgs = packageManager === 'yarn' ? ['link'] : ['link'];
    await runCommand(packageManager, linkArgs, { cwd: rootDir });
    success(`已通过 ${packageManager} link 设置全局访问`);
    globalAvailable = true;
  } catch (e) {
    warn(`${packageManager} link 失败`);
  }
}

// 方法 2：如果 npm link 失败，提示用户手动执行
if (!globalAvailable && globalMode) {
  warn(`${packageManager} link 失败`);
  info('请尝试以下方式设置全局访问：');
  info(`  1. ${packageManager} install -g .  （安装到全局）`);
  info(`  2. ${packageManager === 'yarn' ? 'yarn' : packageManager} link    （链接到全局）`);
  info(`  3. 手动运行: node "${path.join(rootDir, 'bin', 'dops.js')}" --help`);
}

if (!globalAvailable && !globalMode) {
  info('如需全局访问，运行：');
  info(`  ${packageManager === 'yarn' ? 'yarn link' : packageManager + ' link'}`);
  info(`  或: ${packageManager === 'yarn' ? 'yarn' : packageManager} install -g .`);
}

// 验证 dops 命令是否可用
try {
  const dopsPath = path.join(rootDir, 'bin', 'dops.js');
  const versionOutput = execSync(`node "${dopsPath}" --version`, { encoding: 'utf-8', cwd: rootDir });
  success(`dops ${versionOutput.trim()}`);
} catch (e) {
  warn('验证 dops 命令失败，请检查构建输出');
}

// ---------------------- 完成 ----------------------

console.log('');
print(c.bold + c.green, '✨ Dops CLI 初始化完成！');
console.log('');
print(c.bold, '快速开始：');
console.log(`  ${c.cyan}dops --help${c.reset}         查看帮助`);
console.log(`  ${c.cyan}dops${c.reset}                 进入交互式 REPL 模式`);
console.log(`  ${c.cyan}dops auth login${c.reset}     登录到 DevOps 平台`);
console.log('');

if (!globalAvailable && !globalMode) {
  print(c.dim, '提示：如需全局访问，运行 npm link 或 npm install -g .');
  console.log('');
}

// ---------------------- 工具函数 ----------------------

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 使用 spawn 运行命令（替代 execSync），避免 Windows 上缓冲区溢出导致闪退
 */
function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd || rootDir,
      stdio: 'inherit',
      shell: isWindows,
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}: ${cmd} ${args.join(' ')}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}
