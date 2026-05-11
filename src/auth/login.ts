import { input, password } from '@inquirer/prompts';
import chalk from 'chalk';
import { authService } from '../services/api/auth.js';
import { loadConfig } from '../config.js';
import { ApiError } from '../core/exceptions.js';

export async function loginCommand(host?: string, username?: string, pwd?: string) {
  const config = loadConfig();
  const targetHost = host || config.defaultHost || process.env.DOPS_HOST || '';

  if (!targetHost) {
    throw new ApiError('请指定 host: dops auth login --host <url>');
  }

  const resolvedUsername = username ?? (config.defaultUsername || await input({ message: '用户名:' }));
  const resolvedPwd = pwd ?? (config.defaultPassword || await password({ message: '密码:', mask: '*' }));

  await authService.login(targetHost, resolvedUsername, resolvedPwd);
}

export async function logoutCommand() {
  await authService.logout();
  console.log(chalk.green('已登出'));
}
