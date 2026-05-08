import type { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { input, confirm, select } from '@inquirer/prompts';
import { skillRegistry, registerBuiltinSkills, type SkillContext, type SkillResult } from '../skills/index.js';
import { loadConfig } from '../config.js';
import { isJsonMode, printJson, printSuccess, printError } from '../output.js';
import { getCredentials } from '../auth/store.js';
import { loginCommand } from '../auth/login.js';
import { deleteCredentials } from '../auth/store.js';
import { authService } from '../services/api/auth.js';
import ora from 'ora';

export async function registerSkillCommands(program: Command) {
  // 先注册内置 skills
  await registerBuiltinSkills();

  const skillCmd = program.command('skill').description('扩展技能管理 - 使用内置技能自动化 DevOps 任务').allowUnknownOption();

  // 添加详细的 help 信息
  skillCmd.addHelpText('after', `
${chalk.bold('📚 可用技能列表:')}

${chalk.cyan('Pipeline 技能:')}
  ${chalk.yellow('pipeline-runner')}    触发流水线执行
                     示例: dops skill run pipeline-runner --pipeline-name acc-account
                     示例: dops skill run pipeline-runner --pipeline-name acc-account --demand-scheme-id 456 --environment test --wait

  ${chalk.yellow('pipeline-stopper')}   终止正在运行的流水线
                     示例: dops skill run pipeline-stopper --pipeline-name acc-account
                     示例: dops skill run pipeline-stopper --pipeline-name acc-account --force

  ${chalk.yellow('pipeline-status')}    查询流水线状态和历史
                     示例: dops skill run pipeline-status --pipeline-name acc-account
                     示例: dops skill run pipeline-status --pipeline-name acc-account --demand-scheme-id 456 --watch

  ${chalk.yellow('pipeline-analyzer')}  分析流水线执行历史，识别失败模式
                     示例: dops skill run pipeline-analyzer --pipeline-name acc-account --demand-scheme-id 456

${chalk.cyan('部署技能:')}
  ${chalk.yellow('deploy-workflow')}    完整部署工作流（检查→触发→等待）
                     示例: dops skill run deploy-workflow --demand-scheme-id 123
                     示例: dops skill run deploy-workflow --demand-scheme-id 123 --environment prod

  ${chalk.yellow('deploy-checker')}     部署前检查（需求状态、代码合并等）
                     示例: dops skill run deploy-checker --demand-scheme-id 123 --target-env staging

${chalk.cyan('Git 技能:')}
  ${chalk.yellow('git-cleanup')}        智能清理已合并或过期的 Git 分支
                     示例: dops skill run git-cleanup --repo-id 123
                     示例: dops skill run git-cleanup --repo-id 123 --dry-run

${chalk.bold('💡 使用提示:')}
  • 使用 ${chalk.cyan('dops skill list')} 查看所有技能
  • 使用 ${chalk.cyan('dops skill show <skill-name>')} 查看技能详情和参数
  • 使用 ${chalk.cyan('dops skill search <keyword>')} 搜索技能
  • 使用 ${chalk.cyan('dops --json skill run <name>')} 以 JSON 格式输出结果
`);

  skillCmd
    .command('list')
    .description('列出所有可用技能')
    .option('--tag <tag>', '按标签过滤，如: --tag pipeline')
    .action((opts: { tag?: string }) => {
      try {
        const skills = opts.tag ? skillRegistry.listByTag(opts.tag) : skillRegistry.list();

        if (skills.length === 0) {
          if (isJsonMode()) {
            printJson({ success: true, data: [], count: 0 });
          } else {
            console.log(chalk.yellow('暂无可用技能'));
          }
          return;
        }

        // JSON 模式
        if (isJsonMode()) {
          printJson({
            success: true,
            data: skills.map(s => ({
              name: s.definition.name,
              description: s.definition.description,
              version: s.definition.version,
              tags: s.definition.tags,
              parameters: s.definition.parameters.map(p => ({
                name: p.name,
                type: p.type,
                required: p.required,
                description: p.description,
              })),
            })),
            count: skills.length,
          });
          return;
        }

        // 表格模式
        console.log(chalk.bold('\n📚 可用技能列表\n'));
        
        // 按类别分组显示
        const categories: Record<string, typeof skills> = {
          'Pipeline': [],
          '部署': [],
          'Git': [],
          '其他': [],
        };
        
        skills.forEach((s) => {
          const tags = s.definition.tags || [];
          if (tags.some(t => t.includes('pipeline'))) {
            categories['Pipeline'].push(s);
          } else if (tags.some(t => t.includes('deploy'))) {
            categories['部署'].push(s);
          } else if (tags.some(t => t.includes('git'))) {
            categories['Git'].push(s);
          } else {
            categories['其他'].push(s);
          }
        });

        Object.entries(categories).forEach(([category, categorySkills]) => {
          if (categorySkills.length > 0) {
            console.log(chalk.cyan(`${category}:`));
            const table = new Table({
              head: [chalk.bold('名称'), chalk.bold('描述'), chalk.bold('版本')],
              style: { head: [], border: [] },
            });
            categorySkills.forEach((s) => {
              table.push([
                chalk.yellow(s.definition.name),
                s.definition.description.slice(0, 45) + (s.definition.description.length > 45 ? '...' : ''),
                chalk.gray(s.definition.version),
              ]);
            });
            console.log(table.toString());
            console.log();
          }
        });

        console.log(chalk.gray(`共 ${skills.length} 个技能`));
        console.log(chalk.gray('使用 "dops skill show <name>" 查看技能详情\n'));
      } catch (e: any) {
        if (isJsonMode()) {
          printJson({ success: false, error: e.message });
        } else {
          console.error(chalk.red(e.message));
        }
        process.exit(1);
      }
    });

  skillCmd
    .command('show <name>')
    .description('查看技能详情')
    .action((name: string) => {
      try {
        const skill = skillRegistry.get(name);
        if (!skill) {
          if (isJsonMode()) {
            printJson({ success: false, error: `技能 "${name}" 不存在` });
          } else {
            console.error(chalk.red(`技能 "${name}" 不存在`));
            console.log(chalk.gray('使用 "dops skill list" 查看可用技能'));
          }
          process.exit(1);
        }

        const def = skill.definition;
        
        // JSON 模式
        if (isJsonMode()) {
          printJson({
            success: true,
            data: {
              name: def.name,
              description: def.description,
              version: def.version,
              author: def.author,
              tags: def.tags,
              parameters: def.parameters,
              examples: def.examples,
            },
          });
          return;
        }

        // 表格模式
        console.log(chalk.bold(`\n🔧 ${def.name}`));
        console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        console.log(`描述: ${def.description}`);
        console.log(`版本: ${def.version}`);
        if (def.author) console.log(`作者: ${def.author}`);
        if (def.tags) console.log(`标签: ${def.tags.join(', ')}`);

        console.log(chalk.bold('\n📋 参数:'));
        if (def.parameters.length === 0) {
          console.log('  无参数');
        } else {
          def.parameters.forEach((p) => {
            const req = p.required ? chalk.red('(必填)') : chalk.gray('(可选)');
            const def = p.default !== undefined ? ` [默认: ${chalk.cyan(p.default)}]` : '';
            console.log(`  • ${chalk.cyan(p.name)} ${req}`);
            console.log(`    ${p.description}${def}`);
            if (p.enum) console.log(`    可选值: ${p.enum.map(e => chalk.yellow(e)).join(', ')}`);
          });
        }

        if (def.examples && def.examples.length > 0) {
          console.log(chalk.bold('\n💡 示例:'));
          def.examples.forEach((ex) => console.log(`  $ ${chalk.green(ex)}`));
        }

        console.log('');
      } catch (e: any) {
        if (isJsonMode()) {
          printJson({ success: false, error: e.message });
        } else {
          console.error(chalk.red(e.message));
        }
        process.exit(1);
      }
    });

  const runCmd = skillCmd
    .command('run <name> [args...]')
    .description('运行指定技能')
    .option('--param <key=value>', '传递参数（可多次使用）', collectParams, {})
    .addHelpText('after', `
${chalk.bold('参数传递方式:')}
  1. 长格式: --param key=value
  2. 短格式: --key value 或 --key=value

${chalk.bold('示例:')}
  dops skill run pipeline-runner --pipeline-name acc-account
  dops skill run pipeline-runner --pipeline-name acc-account --demand-scheme-id 456 --environment test
  dops skill run deploy-workflow --demand-scheme-id 456 --environment prod

${chalk.bold('JSON 输出 (供 LLM/Agent 使用):')}
  dops --json skill run pipeline-status --pipeline-name acc-account
`);

  runCmd.allowUnknownOption();
  runCmd.action(async (name: string, extraArgs: string[], opts: { param: Record<string, string> }) => {
      try {
        const skill = skillRegistry.get(name);
        if (!skill) {
          if (isJsonMode()) {
            printJson({ success: false, error: `技能 "${name}" 不存在` });
          } else {
            console.error(chalk.red(`技能 "${name}" 不存在`));
            console.log(chalk.gray('使用 "dops skill list" 查看可用技能'));
          }
          process.exit(1);
        }

        // 检查认证状态，未登录时尝试自动登录
        let creds = await getCredentials();
        if (!creds?.sessionid) {
          const config = loadConfig();
          if (config.defaultUsername && config.defaultPassword) {
            try {
              await loginCommand(config.defaultHost, config.defaultUsername, config.defaultPassword);
              creds = await getCredentials();
            } catch {
              // 自动登录失败，继续返回未登录错误
            }
          }
          if (!creds?.sessionid) {
            if (isJsonMode()) {
              printJson({
                success: false,
                error: '未登录或登录已过期',
                suggestions: ['运行 dops auth login --host https://ci.jlpay.com 登录', '或在 config.yaml 中配置 defaultUsername 和 defaultPassword'],
              });
            } else {
              console.error(chalk.red('\n❌ 未登录或登录已过期'));
              console.log(chalk.gray('运行 "dops auth login --host https://ci.jlpay.com" 登录'));
              console.log(chalk.gray('或在 ~/.dops/config.yaml 中配置 defaultUsername 和 defaultPassword'));
            }
            process.exit(1);
          }
        }

        // 解析参数
        const parsedArgs: Record<string, unknown> = { ...parseExtraArgs(process.argv), ...opts.param };

        // 检查必填参数
        const missingParams: string[] = [];
        for (const param of skill.definition.parameters) {
          if (param.required && !(param.name in parsedArgs)) {
            missingParams.push(param.name);
          }
          // 设置默认值
          if (!(param.name in parsedArgs) && param.default !== undefined) {
            parsedArgs[param.name] = param.default;
          }
          // 类型转换
          if (param.name in parsedArgs) {
            parsedArgs[param.name] = convertType(parsedArgs[param.name], param.type);
          }
        }

        if (missingParams.length > 0) {
          if (isJsonMode()) {
            printJson({ 
              success: false, 
              error: '缺少必填参数',
              missingParams: missingParams.map(p => {
                const paramDef = skill.definition.parameters.find(dp => dp.name === p);
                return { name: p, description: paramDef?.description };
              }),
            });
          } else {
            console.error(chalk.red(`\n❌ 缺少必填参数:`));
            missingParams.forEach(p => {
              const paramDef = skill.definition.parameters.find(dp => dp.name === p);
              console.error(`   --${p}: ${paramDef?.description || ''}`);
            });
            console.log(chalk.gray(`\n使用 "dops skill show ${name}" 查看所有参数`));
          }
          process.exit(1);
        }

        // 构建 SkillContext
        const config = loadConfig();
        const context: SkillContext = {
          config: {
            host: config.defaultHost,
            tenant: config.defaultTenant,
          },
          rawArgs: parsedArgs,
          prompt: {
            input: async (msg) => input({ message: msg }),
            confirm: async (msg) => confirm({ message: msg }),
            select: async (msg, choices) =>
              select({ message: msg, choices: choices.map((c) => ({ name: c.label, value: c.value })) }),
          },
          output: {
            info: (msg) => {
              if (!isJsonMode()) console.log(chalk.white(msg));
            },
            success: (msg) => {
              if (!isJsonMode()) console.log(chalk.green(msg));
            },
            warning: (msg) => {
              if (!isJsonMode()) console.log(chalk.yellow(msg));
            },
            error: (msg) => {
              if (!isJsonMode()) console.log(chalk.red(msg));
            },
            table: (headers, rows) => {
              if (!isJsonMode()) {
                const t = new Table({ head: headers.map((h) => chalk.bold(h)) });
                rows.forEach((r) => t.push(r));
                console.log(t.toString());
              }
            },
            json: (data) => console.log(JSON.stringify(data, null, 2)),
          },
          progress: async <T>(message: string, task: Promise<T>): Promise<T> => {
            if (isJsonMode()) {
              return task; // JSON 模式下不显示 spinner
            }
            const spinner = ora(message).start();
            try {
              const result = await task;
              spinner.succeed();
              return result;
            } catch (e) {
              spinner.fail();
              throw e;
            }
          },
        };

        // 执行 skill
        if (!isJsonMode()) {
          console.log(chalk.gray(`\n正在运行技能: ${name}\n`));
        }
        let result = await skill.execute(context);

        // 如果返回认证错误，尝试自动登录并重试一次
        if (!result.success && result.error?.includes('登录')) {
          if (config.defaultUsername && config.defaultPassword && config.defaultHost) {
            try {
              await deleteCredentials();
              await authService.login(config.defaultHost, config.defaultUsername, config.defaultPassword);
              result = await skill.execute(context);
            } catch {
              // 自动登录失败，保持原结果
            }
          }
        }

        // JSON 模式输出
        if (isJsonMode()) {
          printJson({
            success: result.success,
            data: result.data,
            message: result.message,
            error: result.error,
            suggestions: result.suggestions,
          });
          if (!result.success) {
            process.exit(1);
          }
          return;
        }

        // 表格模式输出结果
        if (result.success) {
          if (result.message) {
            console.log(chalk.green(`\n✅ ${result.message}`));
          }
          if (result.suggestions && result.suggestions.length > 0) {
            console.log(chalk.gray('\n建议:'));
            result.suggestions.forEach((s) => console.log(`  • ${s}`));
          }
        } else {
          console.error(chalk.red(`\n❌ ${result.error || '执行失败'}`));
          if (result.suggestions && result.suggestions.length > 0) {
            console.log(chalk.gray('\n建议:'));
            result.suggestions.forEach((s) => console.log(`  • ${s}`));
          }
          process.exit(1);
        }
      } catch (e: any) {
        if (isJsonMode()) {
          printJson({ success: false, error: e.message });
        } else {
          console.error(chalk.red(e.message));
        }
        process.exit(1);
      }
    });

  skillCmd
    .command('search <keyword>')
    .description('搜索技能')
    .action((keyword: string) => {
      try {
        const skills = skillRegistry.search(keyword);
        
        if (isJsonMode()) {
          printJson({
            success: true,
            data: skills.map(s => ({
              name: s.definition.name,
              description: s.definition.description,
              version: s.definition.version,
              tags: s.definition.tags,
            })),
            count: skills.length,
            keyword,
          });
          return;
        }
        
        if (skills.length === 0) {
          console.log(chalk.yellow(`未找到匹配 "${keyword}" 的技能`));
          return;
        }

        console.log(chalk.gray(`\n找到 ${skills.length} 个匹配的技能:\n`));
        const table = new Table({
          head: [chalk.bold('名称'), chalk.bold('描述'), chalk.bold('标签')],
        });
        skills.forEach((s) => {
          table.push([chalk.yellow(s.definition.name), s.definition.description.slice(0, 50), s.definition.tags?.join(', ') || '-']);
        });
        console.log(table.toString());
        console.log();
      } catch (e: any) {
        if (isJsonMode()) {
          printJson({ success: false, error: e.message });
        } else {
          console.error(chalk.red(e.message));
        }
        process.exit(1);
      }
    });
}

// 辅助函数：收集参数
function collectParams(value: string, previous: Record<string, string>): Record<string, string> {
  const [key, val] = value.split('=');
  if (key && val !== undefined) {
    previous[key] = val;
  }
  return previous;
}

// 辅助函数：解析额外的 --key value 参数（支持 --key value 和 --key=value 格式）
function parseExtraArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--') && !arg.includes('=')) {
      const key = kebabToCamel(arg.slice(2));
      const value = argv[i + 1];
      if (value && !value.startsWith('--')) {
        args[key] = value;
        i++; // 跳过已消费的值
      }
    } else if (arg.startsWith('--') && arg.includes('=')) {
      const eqIndex = arg.indexOf('=');
      const key = kebabToCamel(arg.slice(2, eqIndex));
      const value = arg.slice(eqIndex + 1);
      args[key] = value;
    }
  }
  return args;
}

// kebab-case 转 camelCase
function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

// 辅助函数：类型转换
function convertType(value: unknown, type: string): unknown {
  if (typeof value !== 'string') return value;

  switch (type) {
    case 'number':
      return Number(value);
    case 'boolean':
      return value === 'true' || value === '1' || value === true;
    case 'array':
      return value.split(',').map((s) => s.trim());
    case 'object':
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    default:
      return value;
  }
}
