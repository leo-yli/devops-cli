#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { createRequire } from 'module';
import { loginCommand, logoutCommand } from './auth/login.js';
import { registerPipelineCommands } from './commands/pipeline.js';
import { registerSchemesCommands } from './commands/schemes.js';
import { registerScmCommands } from './commands/scm.js';
import { registerSkillCommands } from './commands/skills.js';
import { setGlobalJsonMode } from './output.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

async function main() {
  const program = new Command();

  program
    .name('dops')
    .description('DevOpsPlatform CLI - Tool for LLM/Agent integration')
    .version(pkg.version)
    .option('-j, --json', 'Output in JSON format (for programmatic use)')
    .option('-q, --quiet', 'Suppress non-error output')
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts();
      if (opts.json) {
        setGlobalJsonMode(true);
      }
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
