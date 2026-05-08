#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { render } from 'ink';
import React from 'react';
import { loginCommand, logoutCommand } from './auth/login.js';
import { registerPipelineCommands } from './commands/pipeline.js';
import { registerSchemesCommands } from './commands/schemes.js';
import { registerScmCommands } from './commands/scm.js';
import { registerSkillCommands } from './commands/skills.js';
import { ReplApp } from './repl/app.js';
import { setGlobalJsonMode } from './output.js';
import { registerBuiltinSkills } from './skills/index.js';

async function main() {
  const args = process.argv.slice(2);

  // 检查是否为 JSON 模式（供 LLM/Agent 使用）
  const isJsonMode = args.includes('--json') || args.includes('-j');

  // 无论 CLI 还是 REPL 模式，都先注册内置技能
  await registerBuiltinSkills();

  // Check if no arguments provided (or only --json) - enter REPL mode
  if (args.length === 0 || (args.length === 1 && isJsonMode)) {
    if (isJsonMode) {
      setGlobalJsonMode(true);
    }
    console.clear();
    render(<ReplApp />);
    return;
  }

  const program = new Command();

  program
    .name('dops')
    .description('DevOpsPlatform CLI - Tool for LLM/Agent integration')
    .version('0.1.0')
    .option('-j, --json', 'Output in JSON format (for programmatic use)')
    .option('-q, --quiet', 'Suppress non-error output')
    .allowUnknownOption()
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts();
      if (opts.json) {
        setGlobalJsonMode(true);
      }
    });

  // Add REPL command for explicit entry
  program
    .command('repl')
    .alias('shell')
    .description('Enter interactive REPL mode')
    .action(() => {
      console.clear();
      render(<ReplApp />);
    });

  // Auth commands
  const authCmd = program.command('auth').description('Authentication management');
  authCmd
    .command('login')
    .description('Login to DevOpsPlatform')
    .option('--host <host>', 'Platform host URL')
    .action(async (opts) => {
      try {
        await loginCommand(opts.host);
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  authCmd
    .command('logout')
    .description('Logout')
    .action(async () => {
      try {
        await logoutCommand();
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  // Register module commands
  registerPipelineCommands(program);
  registerSchemesCommands(program);
  registerScmCommands(program);
  await registerSkillCommands(program);

  program.parse();
}

main().catch((e) => {
  console.error(chalk.red(e.message));
  process.exit(1);
});
