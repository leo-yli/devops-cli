import type { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import * as client from '../sdk/pipeline/client.js';
import * as schemesClient from '../sdk/schemes/client.js';
import { DopsError } from '../core/exceptions.js';

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

export function registerPipelineCommands(program: Command) {
  const pipeline = program.command('pipeline').description('流水线管理');

  pipeline
    .command('list')
    .description('列出所有流水线')
    .action(async () => {
      try {
        const data = await client.listPipelines();
        const table = new Table({
          head: [chalk.bold('流水线名称')],
        });
        data.forEach((name) => {
          table.push([name]);
        });
        console.log(table.toString());
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  pipeline
    .command('show <pipelineName>')
    .description('查看流水线详情')
    .action(async (pipelineName: string) => {
      try {
        const data = await client.getPipelineData(pipelineName);
        console.log(chalk.bold('流水线:'), data.pipeline.name);
        console.log(chalk.bold('应用:'), data.pipeline.app_name);
        console.log(chalk.bold('仓库:'), data.pipeline.git_repo_url);
        console.log(chalk.bold('分支:'), data.pipeline.git_branch);
        if (data.stages?.length) {
          console.log(chalk.bold('\n阶段:'));
          data.stages.forEach((s) => {
            console.log(`  ${s.seq}. ${s.display_name} (${s.name})`);
          });
        }
        if (data.tasks?.length) {
          console.log(chalk.bold('\n任务:'));
          data.tasks.forEach((t) => {
            console.log(`  [Stage ${t.stage_id}] ${t.display_name}`);
          });
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  pipeline
    .command('run <pipelineName>')
    .description('触发流水线运行')
    .option('--demand-id <id>', '需求项目ID')
    .option('--params <json>', '构建参数 JSON', '{}')
    .action(async (pipelineName: string, opts: { demandId?: string; params: string }) => {
      try {
        const params = JSON.parse(opts.params);
        if (opts.demandId) {
          const res = await schemesClient.runSchemePipeline(Number(opts.demandId), pipelineName, params);
          console.log(chalk.green('已触发运行'), 'task_id:', res.task_id);
        } else {
          const res = await client.runPipeline(pipelineName, params);
          console.log(chalk.green('已触发运行'), 'task_id:', res.task_id);
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  pipeline
    .command('abort <pipelineName>')
    .description('终止流水线运行')
    .option('--demand-id <id>', '需求项目ID')
    .action(async (pipelineName: string, opts: { demandId?: string }) => {
      try {
        if (opts.demandId) {
          const res = await schemesClient.abortSchemePipeline(Number(opts.demandId), pipelineName);
          console.log(chalk.green(res.context));
        } else {
          const res = await client.abortPipeline(pipelineName);
          console.log(chalk.green(res.context));
        }
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  pipeline
    .command('rerun <pipelineName>')
    .description('从指定阶段重运行流水线')
    .requiredOption('--stage-seq <seq>', '阶段序号')
    .action(async (pipelineName: string, opts: { stageSeq: string }) => {
      try {
        const res = await client.rerunStage(pipelineName, Number(opts.stageSeq));
        console.log(chalk.green('已触发重运行'), 'task_id:', res.task_id);
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });

  pipeline
    .command('records <pipelineName> [demandSchemeId]')
    .description('查看流水线运行记录')
    .option('--limit <n>', '每页数量', '10')
    .option('--page <n>', '页码', '1')
    .action(async (pipelineName: string, demandSchemeId: string | undefined, opts: { limit: string; page: string }) => {
      try {
        if (!demandSchemeId) {
          console.log(chalk.yellow('请提供 demandSchemeId 以查看运行记录'));
          console.log(chalk.gray('示例: dops pipeline records <pipelineName> <demandSchemeId>'));
          process.exit(1);
        }
        const res = await client.getPipelineRecords(pipelineName, Number(demandSchemeId), Number(opts.limit), Number(opts.page));
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

  pipeline
    .command('status <pipelineName> [demandSchemeId]')
    .description('查看流水线当前运行状态')
    .action(async (pipelineName: string, demandSchemeId: string | undefined) => {
      try {
        if (!demandSchemeId) {
          const data = await client.getPipelineData(pipelineName);
          console.log(chalk.bold('流水线:'), data.pipeline.name);
          console.log(chalk.bold('应用:'), data.pipeline.app_name);
          console.log(chalk.bold('仓库:'), data.pipeline.git_repo_url || '-');
          console.log(chalk.bold('分支:'), data.pipeline.git_branch || '-');
          return;
        }
        const data = await client.getPipelineRunStatus(pipelineName, Number(demandSchemeId));
        const table = new Table({
          head: [chalk.bold('指标'), chalk.bold('数值')],
        });
        table.push(
          ['运行中', String(data.running)],
          ['已完成', String(data.completed)],
          ['失败', String(data.failed)],
          ['总计', String(data.total)],
        );
        console.log(table.toString());
      } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
    });
}
