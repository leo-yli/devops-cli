# Pipeline Operations 完善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复流水线触发、终止、运行状态查询中的类型不一致和路由错误，并补全项目流水线的状态查询命令。

**Architecture:** 精准修复现有文件中的 Bug，不引入新的抽象层。核心修复点：统一 `PipelineRunStatus` 类型为 `{ running, completed, failed, total }`；Skills 层在有 `demandSchemeId` 时路由到 `schemes` 端点；补全 `schemes pipeline status/records` 命令。

**Tech Stack:** TypeScript 5.8, Commander.js, cli-table3, chalk；验证命令 `npm run typecheck`

---

## 文件一览

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/sdk/pipeline/types.ts` | 修改 | 修正 `PipelineRunStatus` 类型定义 |
| `src/commands/pipeline.ts` | 修改 | 修正 `status` 命令展示逻辑 |
| `src/commands/schemes.ts` | 修改 | 新增 `pipeline status` 和 `pipeline records` 子命令 |
| `src/skills/pipeline-runner.ts` | 修改 | 修正路由逻辑和 pipelineName 传参 |
| `src/skills/pipeline-stopper.ts` | 修改 | 修正路由逻辑和 pipelineName 传参 |
| `src/skills/pipeline-status.ts` | 修改 | 修正 pipelineName 传参，移除 `ci_type` |

---

## Task 1: 修正 `PipelineRunStatus` 类型

**Files:**
- Modify: `src/sdk/pipeline/types.ts`

**背景：** `sdk/pipeline/types.ts` 中 `PipelineRunStatus` 当前错误定义为 `{ stages, tasks, logs }`，但实际 API 端点 `/pipeline/{name}/{demandSchemeId}/details/run/` 返回 `{ running, completed, failed, total }`，所有 skills 和 service 层也期望后者。

- [ ] **Step 1: 修改 `PipelineRunStatus` 类型**

打开 `src/sdk/pipeline/types.ts`，将第 103-107 行：

```typescript
export interface PipelineRunStatus {
  stages: Stage[];
  tasks: Task[];
  logs?: ExecuteStageLog[];
}
```

替换为：

```typescript
export interface PipelineRunStatus {
  running: number;
  completed: number;
  failed: number;
  total: number;
}
```

- [ ] **Step 2: 运行类型检查，确认改动无报错（预期有报错，来自下一步要修的 `commands/pipeline.ts`）**

```bash
npm run typecheck 2>&1 | head -40
```

预期：看到 `commands/pipeline.ts` 中 `data.stages` 报类型错误（这是预期的，Task 2 修复）。

- [ ] **Step 3: Commit**

```bash
git add src/sdk/pipeline/types.ts
git commit -m "fix(types): correct PipelineRunStatus to {running,completed,failed,total}"
```

---

## Task 2: 修正 `pipeline status` 命令

**Files:**
- Modify: `src/commands/pipeline.ts`

**背景：** `status` 命令当前访问 `data.stages`（不存在）并把 `s.auto_trigger` 当成状态码展示，语义错误。修正为展示 running/completed/failed/total 统计数据。

- [ ] **Step 1: 替换 `status` 命令的 action 逻辑**

找到 `src/commands/pipeline.ts` 第 134-147 行（`status` 命令），将整个 `.action(...)` 替换：

```typescript
  pipeline
    .command('status <pipelineName> <demandSchemeId>')
    .description('查看流水线当前运行状态')
    .action(async (pipelineName: string, demandSchemeId: string) => {
      try {
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
```

- [ ] **Step 2: 运行类型检查，确认 `commands/pipeline.ts` 无报错**

```bash
npm run typecheck 2>&1 | grep "pipeline.ts"
```

预期：无输出（无报错）。

- [ ] **Step 3: Commit**

```bash
git add src/commands/pipeline.ts
git commit -m "fix(commands): fix pipeline status to show running/completed/failed/total"
```

---

## Task 3: 补全 `schemes pipeline status` 和 `schemes pipeline records` 命令

**Files:**
- Modify: `src/commands/schemes.ts`

**背景：** `schemes pipeline` 目前只有 `run` 和 `abort`，缺少 `status` 和 `records`。这两个查询使用 pipeline SDK 的端点（`/pipeline/{name}/{demandSchemeId}/details/run/` 和 `.../record/`），需在 `schemes.ts` 中额外 import pipeline client。

- [ ] **Step 1: 在 `schemes.ts` 顶部添加 pipeline client import**

在 `src/commands/schemes.ts` 第 1-4 行现有 import 之后，添加一行：

```typescript
import * as pipelineClient from '../sdk/pipeline/client.js';
```

完整顶部 import 区域应为：

```typescript
import type { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import * as client from '../sdk/schemes/client.js';
import * as pipelineClient from '../sdk/pipeline/client.js';
```

- [ ] **Step 2: 复用 `formatState` 函数**

`commands/schemes.ts` 中没有 `formatState`，需要添加一个与 `pipeline.ts` 相同的实现。在 `formatDemandStatus` 函数之后（第 13 行后）插入：

```typescript
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
```

- [ ] **Step 3: 添加 `schemes pipeline status` 命令**

在 `src/commands/schemes.ts` 中，找到 `pipeCmd.command('abort')` 块结束处（约第 147 行），在其后插入：

```typescript
  pipeCmd
    .command('status')
    .description('查看需求项目流水线运行状态')
    .requiredOption('--demand-id <id>', '需求项目ID')
    .requiredOption('--pipeline-name <name>', '流水线名称')
    .action(async (opts: { demandId: string; pipelineName: string }) => {
      try {
        const data = await pipelineClient.getPipelineRunStatus(opts.pipelineName, Number(opts.demandId));
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
```

- [ ] **Step 4: 添加 `schemes pipeline records` 命令**

紧接上一步，继续插入：

```typescript
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
```

- [ ] **Step 5: 运行类型检查，确认 `schemes.ts` 无报错**

```bash
npm run typecheck 2>&1 | grep "schemes.ts"
```

预期：无输出（无报错）。

- [ ] **Step 6: Commit**

```bash
git add src/commands/schemes.ts
git commit -m "feat(commands): add schemes pipeline status and records commands"
```

---

## Task 4: 修正 `pipeline-runner.ts` skill

**Files:**
- Modify: `src/skills/pipeline-runner.ts`

**背景：** 当前 skill 存在两个问题：
1. 用 `pipelineId`（number）直接传给期望 `pipelineName`（string）的 SDK 函数（`runPipeline`、`getPipelineRunStatus`）
2. 有 `demandSchemeId` 时仍调普通流水线端点，应路由到 `schemesClient.runSchemePipeline()`

修正方案：`getPipeline(pipelineId)` 拿到 `pipeline.name` 后，所有后续调用改用 `pipeline.name`；路由逻辑基于 `demandSchemeId` 是否存在。

- [ ] **Step 1: 在文件顶部添加 schemes client import**

将 `src/skills/pipeline-runner.ts` 第 1-3 行：

```typescript
import { defineSkill } from './registry.js';
import * as pipelineClient from '../sdk/pipeline/client.js';
import type { Pipeline } from '../sdk/pipeline/types.js';
```

替换为：

```typescript
import { defineSkill } from './registry.js';
import * as pipelineClient from '../sdk/pipeline/client.js';
import * as schemesClient from '../sdk/schemes/client.js';
import type { Pipeline } from '../sdk/pipeline/types.js';
```

- [ ] **Step 2: 修正触发流水线的调用逻辑**

找到第 154-158 行（触发流水线部分）：

```typescript
      // 触发流水线
      const result = await ctx.progress(
        '正在触发流水线...',
        pipelineClient.runPipeline(pipelineId, buildParams)
      );
```

替换为：

```typescript
      // 触发流水线：有 demandSchemeId 时使用项目流水线端点
      const result = await ctx.progress(
        '正在触发流水线...',
        demandSchemeId
          ? schemesClient.runSchemePipeline(demandSchemeId, pipeline.name, buildParams)
          : pipelineClient.runPipeline(pipeline.name, buildParams)
      );
```

- [ ] **Step 3: 修正 wait 模式中的状态查询调用**

找到第 179 行：

```typescript
              const status = await pipelineClient.getPipelineRunStatus(pipelineId, demandSchemeId);
```

替换为：

```typescript
              const status = await pipelineClient.getPipelineRunStatus(pipeline.name, demandSchemeId);
```

- [ ] **Step 4: 运行类型检查，确认 `pipeline-runner.ts` 无报错**

```bash
npm run typecheck 2>&1 | grep "pipeline-runner"
```

预期：无输出（无报错）。

- [ ] **Step 5: Commit**

```bash
git add src/skills/pipeline-runner.ts
git commit -m "fix(skills): pipeline-runner use pipelineName and route to scheme endpoint"
```

---

## Task 5: 修正 `pipeline-stopper.ts` skill

**Files:**
- Modify: `src/skills/pipeline-stopper.ts`

**背景：** 同 Task 4，存在两个问题：
1. `getPipelineRunStatus(pipelineId, ...)` 应改为 `getPipelineRunStatus(pipeline.name, ...)`
2. `abortPipeline(pipelineId)` 当有 `demandSchemeId` 时应路由到 `schemesClient.abortSchemePipeline()`

- [ ] **Step 1: 在文件顶部添加 schemes client import**

将 `src/skills/pipeline-stopper.ts` 第 1-3 行：

```typescript
import { defineSkill } from './registry.js';
import * as pipelineClient from '../sdk/pipeline/client.js';
import type { Pipeline, PipelineRunStatus } from '../sdk/pipeline/types.js';
```

替换为：

```typescript
import { defineSkill } from './registry.js';
import * as pipelineClient from '../sdk/pipeline/client.js';
import * as schemesClient from '../sdk/schemes/client.js';
import type { Pipeline, PipelineRunStatus } from '../sdk/pipeline/types.js';
```

- [ ] **Step 2: 修正运行状态查询的调用**

找到第 90 行：

```typescript
          runningStatus = await pipelineClient.getPipelineRunStatus(pipelineId, demandSchemeId);
```

替换为：

```typescript
          runningStatus = await pipelineClient.getPipelineRunStatus(pipeline.name, demandSchemeId);
```

- [ ] **Step 3: 修正终止流水线的调用逻辑**

找到第 125-128 行（执行终止部分）：

```typescript
      // 执行终止
      const result = await ctx.progress(
        '正在终止流水线...',
        pipelineClient.abortPipeline(pipelineId)
      );
```

替换为：

```typescript
      // 执行终止：有 demandSchemeId 时使用项目流水线端点
      const result = await ctx.progress(
        '正在终止流水线...',
        demandSchemeId
          ? schemesClient.abortSchemePipeline(demandSchemeId, pipeline.name)
          : pipelineClient.abortPipeline(pipeline.name)
      );
```

- [ ] **Step 4: 运行类型检查，确认 `pipeline-stopper.ts` 无报错**

```bash
npm run typecheck 2>&1 | grep "pipeline-stopper"
```

预期：无输出（无报错）。

- [ ] **Step 5: Commit**

```bash
git add src/skills/pipeline-stopper.ts
git commit -m "fix(skills): pipeline-stopper use pipelineName and route to scheme endpoint"
```

---

## Task 6: 修正 `pipeline-status.ts` skill

**Files:**
- Modify: `src/skills/pipeline-status.ts`

**背景：** 存在两个问题：
1. `getPipelineRunStatus(pipelineId, ...)` 和 `getPipelineRecords(pipelineId, ...)` 应改为用 `pipeline.name`
2. 第 93 行访问了不存在的 `pipeline.ci_type`，需移除

- [ ] **Step 1: 修正 `getPipelineRunStatus` 调用**

找到第 99 行：

```typescript
          pipelineClient.getPipelineRunStatus(pipelineId, demandSchemeId)
```

替换为：

```typescript
          pipelineClient.getPipelineRunStatus(pipeline.name, demandSchemeId)
```

- [ ] **Step 2: 修正 `getPipelineRecords` 调用**

找到第 124 行：

```typescript
          pipelineClient.getPipelineRecords(pipelineId, demandSchemeId, limit, 1)
```

替换为：

```typescript
          pipelineClient.getPipelineRecords(pipeline.name, demandSchemeId, limit, 1)
```

- [ ] **Step 3: 修正 `getPipelineStageDetails` 调用**

找到第 148-151 行：

```typescript
              const stageDetails = await pipelineClient.getPipelineStageDetails(
                pipelineId, 
                demandSchemeId, 
                targetBuildId
              );
```

替换为：

```typescript
              const stageDetails = await pipelineClient.getPipelineStageDetails(
                pipeline.name,
                demandSchemeId,
                targetBuildId
              );
```

- [ ] **Step 4: 修正持续监控中的状态查询调用**

找到第 190 行：

```typescript
              const newStatus = await pipelineClient.getPipelineRunStatus(pipelineId, demandSchemeId);
```

替换为：

```typescript
              const newStatus = await pipelineClient.getPipelineRunStatus(pipeline.name, demandSchemeId);
```

- [ ] **Step 5: 移除不存在的 `pipeline.ci_type` 访问**

找到第 93 行：

```typescript
      ctx.output.info(`   类型: ${pipeline.ci_type || 'Unknown'}`);
```

替换为：

```typescript
      ctx.output.info(`   应用: ${pipeline.app_name}`);
```

- [ ] **Step 6: 运行完整类型检查，确认全部无报错**

```bash
npm run typecheck
```

预期：`Found 0 errors.` 或无任何错误输出。

- [ ] **Step 7: Commit**

```bash
git add src/skills/pipeline-status.ts
git commit -m "fix(skills): pipeline-status use pipelineName and remove nonexistent ci_type"
```
