import type { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import * as client from '../sdk/scm/client.js';

export function registerScmCommands(program: Command) {
  const scm = program.command('scm').description('源码管理 (GitLab)');

  const groupCmd = scm.command('group').description('GitLab 代码组管理');

  groupCmd
    .command('list')
    .description('列出 GitLab 代码组')
    .option('--search <name>', '搜索组名')
    .option('--page <n>', '页码', '1')
    .option('--limit <n>', '每页数量', '20')
    .action(async (opts: { search?: string; page: string; limit: string }) => {
      try {
        const res = await client.listGitGroups(opts.search, Number(opts.page), Number(opts.limit));
        const table = new Table({
          head: [chalk.bold('ID'), chalk.bold('名称'), chalk.bold('路径'), chalk.bold('描述')],
        });
        res.data.forEach((g) => {
          table.push([g.id, g.name, g.path, g.description || '-']);
        });
        console.log(table.toString());
        console.log('总计:', res.count);
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  groupCmd
    .command('create')
    .description('创建 GitLab 代码组')
    .requiredOption('--name <name>', '组名')
    .requiredOption('--group-id <id>', '组ID')
    .option('--description <desc>', '描述', '')
    .action(async (opts: { name: string; groupId: string; description: string }) => {
      try {
        const res = await client.createGitGroup(opts.name, opts.groupId, opts.description);
        console.log(chalk.green(res.msg));
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  const projectCmd = scm.command('project').description('GitLab 代码库管理');

  projectCmd
    .command('list')
    .description('列出 GitLab 代码库')
    .option('--search <name>', '搜索项目名')
    .option('--topic <topic>', '按 topic 过滤')
    .option('--page <n>', '页码', '1')
    .option('--limit <n>', '每页数量', '20')
    .action(async (opts: { search?: string; topic?: string; page: string; limit: string }) => {
      try {
        const res = await client.listGitProjects(opts.search, opts.topic, Number(opts.page), Number(opts.limit));
        const table = new Table({
          head: [chalk.bold('ID'), chalk.bold('名称'), chalk.bold('路径'), chalk.bold('级别'), chalk.bold('框架')],
        });
        res.context.forEach((p: any) => {
          table.push([p.id, p.name, p.path_with_namespace ?? p.full_path ?? '-', p.level || '-', p.frame || '-']);
        });
        console.log(table.toString());
        console.log('总计:', res.count);
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  projectCmd
    .command('create')
    .description('创建 GitLab 代码库')
    .requiredOption('--name <name>', '项目名')
    .requiredOption('--group-path <path>', '组路径')
    .requiredOption('--group-id <id>', '组ID')
    .option('--description <desc>', '描述', '')
    .option('--level <level>', '服务级别', 'P2')
    .option('--frame <frame>', '技术栈', '')
    .option('--framework <fw>', '框架', '')
    .action(async (opts: { name: string; groupPath: string; groupId: string; description: string; level: string; frame: string; framework: string }) => {
      try {
        const res = await client.createGitProject({
          project_name: opts.name,
          group_path: opts.groupPath,
          group_id: opts.groupId,
          description: opts.description,
          level: opts.level,
          frame: opts.frame,
          framework: opts.framework,
        });
        console.log(chalk.green(res.msg));
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  projectCmd
    .command('offline')
    .description('下线 GitLab 项目')
    .requiredOption('--name <name>', '项目名')
    .action(async (opts: { name: string }) => {
      try {
        const res = await client.offlineGitProject(opts.name);
        console.log(chalk.green(res.msg));
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  const appCmd = scm.command('app').description('应用元数据管理');

  appCmd
    .command('level')
    .description('查看应用级别')
    .requiredOption('--name <appName>', '应用名')
    .action(async (opts: { name: string }) => {
      try {
        const data = await client.getAppLevel(opts.name);
        console.log(chalk.bold('应用:'), data.app_name);
        console.log(chalk.bold('级别:'), data.level);
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  appCmd
    .command('level-set')
    .description('设置应用级别')
    .requiredOption('--name <appName>', '应用名')
    .requiredOption('--level <level>', '级别 (如 P0/P1/P2)')
    .action(async (opts: { name: string; level: string }) => {
      try {
        const res = await client.setAppLevel(opts.name, opts.level);
        console.log(chalk.green(res.msg));
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  appCmd
    .command('owner')
    .description('查看应用负责人')
    .requiredOption('--name <appName>', '应用名')
    .action(async (opts: { name: string }) => {
      try {
        const data = await client.getAppOwner(opts.name);
        console.log(chalk.bold('应用:'), data.app_name);
        console.log(chalk.bold('负责人:'), data.owner || '-');
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  scm
    .command('revert')
    .description('回滚 Git 代码')
    .requiredOption('--app-name <name>', '应用名')
    .requiredOption('--helm-version <ver>', 'Helm 版本')
    .option('--target-branch <branch>', '目标分支', 'master')
    .action(async (opts: { appName: string; helmVersion: string; targetBranch: string }) => {
      try {
        const res = await client.revertGit(opts.appName, opts.helmVersion, opts.targetBranch);
        console.log(chalk.green(res.context));
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });
}
