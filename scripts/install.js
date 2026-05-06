#!/usr/bin/env node
/**
 * Post-install script for dops CLI
 * Handles native dependency checks and platform-specific setup
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const isWindows = process.platform === 'win32';

async function main() {
  console.log('🔧 Setting up dops CLI...\n');

  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  
  if (majorVersion < 20) {
    console.warn(`⚠️  Warning: Node.js 20+ recommended, found ${nodeVersion}`);
    console.warn('   Some features may not work correctly.\n');
  } else {
    console.log(`✅ Node.js ${nodeVersion} detected\n`);
  }

  // Create config directory
  const homeDir = os.homedir();
  const configDir = path.join(homeDir, '.dops');
  
  try {
    await fs.mkdir(configDir, { recursive: true });
    console.log(`✅ Config directory: ${configDir}`);
  } catch (error) {
    console.warn(`⚠️  Could not create config directory: ${error.message}`);
  }

  // Check if dist exists (for development installs)
  const distPath = path.join(process.cwd(), 'dist', 'main.js');
  try {
    await fs.access(distPath);
    console.log('✅ Build artifacts found');
  } catch {
    console.log('\n📦 Building from source...');
    try {
      execSync('npm run build', { stdio: 'inherit' });
      console.log('✅ Build completed\n');
    } catch (error) {
      console.warn('⚠️  Build failed, you may need to run it manually: npm run build\n');
    }
  }

  // Create sample config if not exists
  const configPath = path.join(configDir, 'config.yaml');
  try {
    await fs.access(configPath);
  } catch {
    const sampleConfig = `# Dops CLI Configuration
defaultHost: https://ci.jlpay.com
defaultTenant: ''
defaultUsername: ''   # 可选：预设登录用户名
defaultPassword: ''   # 可选：预设登录密码

llm:
  provider: openai
  model: gpt-4o
  apiKey: ''
  baseUrl: ''

agent:
  confirmWriteOps: true
  maxAutoSteps: 10
  stream: true
`;
    await fs.writeFile(configPath, sampleConfig);
    console.log(`✅ Created sample config: ${configPath}`);
  }

  // Create sample MCP config if not exists
  const mcpPath = path.join(configDir, 'mcp.json');
  try {
    await fs.access(mcpPath);
  } catch {
    const sampleMCP = {
      mcpServers: {}
    };
    await fs.writeFile(mcpPath, JSON.stringify(sampleMCP, null, 2));
    console.log(`✅ Created MCP config: ${mcpPath}`);
  }

  console.log('\n✨ Setup complete!');
  console.log('\nQuick start:');
  console.log('  dops --help         # Show help');
  console.log('  dops auth login     # Login to your DevOps platform');
  console.log('  dops pipeline list  # List pipelines');
  console.log('  dops chat           # Start AI chat\n');
}

main().catch(error => {
  console.error('Setup error:', error.message);
  // Don't exit with error, allow installation to continue
  process.exit(0);
});
