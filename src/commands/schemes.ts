import type { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import * as client from '../sdk/schemes/client.js';
import * as pipelineClient from '../sdk/pipeline/client.js';
import { computeRunStats } from '../sdk/pipeline/types.js';

function formatDemandStatus(status?: string): string {
  if (!status) return '-';
  const map: Record<string, string> = {
    normal: chalk.green('正常'),
    archived: chalk.gray('已归档'),
  };
  return map[status] || status;
}

function formatState(state: number): string {
  const map: Record<number, string> = {
    '-1': chalk.red('失败'),
    '1': chalk.green('成功'),
    '2': chalk.yellow('中断'),
    '3': chalk.blue('挂起'),
    '4': chalk.cyan('构建中'),
    '5': chalk.magenta('回滚'),
  };
  return map[state] || String(state);
}

export function registerSchemesCommands(program: Command) {
  const schemes = program.command('schemes').description('项目与需求项目管理');

  schemes
    .command('list')
    .description('列出所有项目')
    .action(async () => {
      try {
        const data = await client.listSchemes();
        const table = new Table({
          head: [chalk.bold('ID'), chalk.bold('名称'), chalk.bold('负责人'), chalk.bold('状态'), chalk.bold('公开')],
        });
        data.forEach((s) => {
          table.push([s.id, s.name, s.director || '-', s.status, s.is_public ? '是' : '否']);
        });
        console.log(table.toString());
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  schemes
    .command('show <schemeId>')
    .description('查看项目详情')
    .action(async (schemeId: string) => {
      try {
        const data = await client.getScheme(Number(schemeId));
        console.log(chalk.bold('项目:'), data.name);
        console.log(chalk.bold('简介:'), data.introduction || '-');
        console.log(chalk.bold('负责人:'), data.director || '-');
        console.log(chalk.bold('状态:'), data.status);
        console.log(chalk.bold('公开:'), data.is_public ? '是' : '否');
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  const demandCmd = schemes.command('demand').description('需求项目管理');

  demandCmd
    .command('list')
    .description('列出项目下的需求项目')
    .requiredOption('--scheme-id <id>', '项目ID')
    .action(async (opts: { schemeId: string }) => {
      try {
        const data = await client.listDemandSchemes(Number(opts.schemeId));
        const table = new Table({
          head: [chalk.bold('ID'), chalk.bold('名称'), chalk.bold('分支'), chalk.bold('状态'), chalk.bold('负责人')],
        });
        data.forEach((d) => {
          table.push([d.id, d.name, d.git_branch, formatDemandStatus(d.status), d.username]);
        });
        console.log(table.toString());
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  demandCmd
    .command('show <demandSchemeId>')
    .description('查看需求项目详情')
    .action(async (demandSchemeId: string) => {
      try {
        const data = await client.getDemandScheme(Number(demandSchemeId));
        console.log(chalk.bold('需求项目:'), data.name);
        console.log(chalk.bold('分支:'), data.git_branch);
        console.log(chalk.bold('创建人:'), data.creator);
        console.log(chalk.bold('开发:'), data.developer);
        console.log(chalk.bold('测试:'), data.tester);
        console.log(chalk.bold('已归档:'), data.archived ? '是' : '否');
        console.log(chalk.bold('已合并:'), data.is_mr ? '是' : '否');
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  const pipeCmd = schemes.command('pipeline').description('项目流水线管理');

  pipeCmd
    .command('list')
    .description('列出项目关联的流水线')
    .requiredOption('--scheme-id <id>', '项目ID')
    .action(async (opts: { schemeId: string }) => {
      try {
        const data = await client.listSchemePipelines(Number(opts.schemeId));
        const table = new Table({
          head: [chalk.bold('ID'), chalk.bold('流水线名称'), chalk.bold('应用名'), chalk.bold('仓库')],
        });
        data.forEach((p) => {
          table.push([p.id, p.pipeline_name || '-', p.appname || '-', p.git_repo || '-']);
        });
        console.log(table.toString());
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  pipeCmd
    .command('run')
    .description('触发需求项目流水线运行')
    .requiredOption('--demand-id <id>', '需求项目ID')
    .requiredOption('--pipeline-name <name>', '流水线名称')
    .option('--params <json>', '构建参数', '{}')
    .action(async (opts: { demandId: string; pipelineName: string; params: string }) => {
      try {
        const params = JSON.parse(opts.params);
        const res = await client.runSchemePipeline(Number(opts.demandId), opts.pipelineName, params);
        console.log(chalk.green('已触发运行'), 'task_id:', res.task_id);
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  pipeCmd
    .command('abort')
    .description('终止需求项目流水线运行')
    .requiredOption('--demand-id <id>', '需求项目ID')
    .requiredOption('--pipeline-name <name>', '流水线名称')
    .action(async (opts: { demandId: string; pipelineName: string }) => {
      try {
        const res = await client.abortSchemePipeline(Number(opts.demandId), opts.pipelineName);
        console.log(chalk.green(res.context));
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  pipeCmd
    .command('status')
    .description('查看需求项目流水线运行状态')
    .requiredOption('--demand-id <id>', '需求项目ID')
    .requiredOption('--pipeline-name <name>', '流水线名称')
    .action(async (opts: { demandId: string; pipelineName: string }) => {
      try {
        const data = await pipelineClient.getPipelineRunStatus(opts.pipelineName, Number(opts.demandId));
        const stats = computeRunStats(data);
        const table = new Table({
          head: [chalk.bold('指标'), chalk.bold('数值')],
        });
        table.push(
          ['运行中', String(stats.running)],
          ['已完成', String(stats.completed)],
          ['失败', String(stats.failed)],
          ['总计', String(stats.total)],
        );
        console.log(table.toString());
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  pipeCmd
    .command('records')
    .description('查看需求项目流水线运行记录')
    .requiredOption('--demand-id <id>', '需求项目ID')
    .requiredOption('--pipeline-name <name>', '流水线名称')
    .option('--limit <n>', '每页数量', '10')
    .option('--page <n>', '页码', '1')
    .action(async (opts: { demandId: string; pipelineName: string; limit: string; page: string }) => {
      try {
        const res = await pipelineClient.getPipelineRecords(
          opts.pipelineName,
          Number(opts.demandId),
          Number(opts.limit),
          Number(opts.page),
        );
        const table = new Table({
          head: [chalk.bold('BuildID'), chalk.bold('状态'), chalk.bold('耗时(ms)'), chalk.bold('用户'), chalk.bold('Commit')],
        });
        res.data.forEach((r) => {
          table.push([r.build_id, formatState(r.state), r.cost_time, r.username, r.git_commit_id || '-']);
        });
        console.log(table.toString());
        console.log('总计:', res.count);
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  schemes
    .command('rollback')
    .description('查看回滚信息')
    .requiredOption('--demand-id <id>', '需求项目ID')
    .requiredOption('--pipeline-name <name>', '流水线名称')
    .action(async (opts: { demandId: string; pipelineName: string }) => {
      try {
        const data = await client.getRollbackInfo(Number(opts.demandId), opts.pipelineName);
        console.log(chalk.bold('可回滚阶段:'), data.stage);
        console.log(chalk.bold('历史版本:'), data.versions.join(', '));
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });
}
