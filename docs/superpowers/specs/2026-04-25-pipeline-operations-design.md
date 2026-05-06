# Pipeline Operations 完善设计文档

**日期**: 2026-04-25  
**范围**: 流水线触发、终止、运行状态查询功能修复与补全

## 背景

当前代码存在类型不一致、路由错误、显示逻辑错误等问题，且缺少项目流水线的状态查询命令。

## 问题清单

### Bugs

1. **`PipelineRunStatus` 类型不一致**  
   `sdk/pipeline/types.ts` 定义为 `{ stages, tasks, logs }`，但实际 API 返回 `{ running, completed, failed, total }`，skills 和 service 层也期望后者。结果：`pipeline status` 命令运行时错误（访问不存在的 `stages`），skills 中的 `status.running` 等字段在类型检查时不可见。

2. **Skills 用 `pipelineId`（number）直接传给期望 `pipelineName`（string）的 SDK 函数**  
   正确做法：先调 `getPipeline(pipelineId)` 拿到 `pipeline.name`，再用 name 做后续 API 调用。

3. **Skills 未区分普通/项目流水线触发和终止端点**  
   - `pipeline-runner`：有 `demandSchemeId` 时应调 `schemesClient.runSchemePipeline(demandSchemeId, name)`，不是 `pipelineClient.runPipeline(name)`
   - `pipeline-stopper`：有 `demandSchemeId` 时应调 `schemesClient.abortSchemePipeline(demandSchemeId, name)`

4. **`pipeline status` 命令显示逻辑错误**  
   用 `s.auto_trigger`（阶段自动触发标志，0/1）作为 `formatState()` 参数，语义错误。

5. **`pipeline-status.ts` 访问 `pipeline.ci_type`**  
   该字段不在 `Pipeline` 类型定义中。

### 缺失功能

6. `schemes pipeline status` 命令缺失
7. `schemes pipeline records` 命令缺失

## 方案

采用**方案 A（精准修复）**：在现有架构上修 Bug + 补缺失命令，不引入新抽象层。

## 设计细节

### 1. 修 `sdk/pipeline/types.ts`

将 `PipelineRunStatus` 改为与实际 API 一致：

```typescript
export interface PipelineRunStatus {
  running: number;
  completed: number;
  failed: number;
  total: number;
}
```

原有的 `{ stages, tasks, logs }` 结构（如果是另一个端点的响应）不在本次修复范围。

### 2. 修 `commands/pipeline.ts` — `status` 命令

替换错误的 `data.stages` 遍历，改为展示 running/completed/failed/total 统计：

```
阶段状态:
  运行中: 2
  已完成: 3
  失败:   0
  总计:   5
```

### 3. 修 `pipeline-runner.ts`

- 调 `getPipeline(pipelineId)` 后，用 `pipeline.name` 做后续调用
- 当 `demandSchemeId` 存在时，调 `schemesClient.runSchemePipeline()`；否则调 `pipelineClient.runPipeline()`
- wait 模式中的 `getPipelineRunStatus()` 也改为用 `pipeline.name`

### 4. 修 `pipeline-stopper.ts`

- 用 `pipeline.name` 做后续调用
- 当 `demandSchemeId` 存在时，调 `schemesClient.abortSchemePipeline()`；否则调 `pipelineClient.abortPipeline()`
- 查询运行状态时用 `pipeline.name`

### 5. 修 `pipeline-status.ts`

- 用 `pipeline.name` 做后续调用
- 移除 `pipeline.ci_type`（字段不存在）
- `getPipelineRunStatus` 和 `getPipelineRecords` 均改为 `pipeline.name`

### 6. 补 `commands/schemes.ts` — 项目流水线状态和记录

新增两个子命令：

```
schemes pipeline status --demand-id <id> --pipeline-name <name>
  → GET /pipeline/{pipelineName}/{demandSchemeId}/details/run/
  → 展示 running/completed/failed/total

schemes pipeline records --demand-id <id> --pipeline-name <name> [--limit 10] [--page 1]
  → GET /pipeline/{pipelineName}/{demandSchemeId}/details/record/
  → 展示执行记录表格（BuildID/状态/耗时/用户/Commit）
```

注意：这两个查询端点属于 `pipeline` SDK（路径以 `/pipeline/` 开头），不是 `schemes` SDK，所以 `commands/schemes.ts` 需要额外 import `pipelineClient`。

## 改动文件

| 文件 | 改动类型 |
|------|---------|
| `src/sdk/pipeline/types.ts` | 修 `PipelineRunStatus` 类型 |
| `src/commands/pipeline.ts` | 修 `status` 命令展示逻辑 |
| `src/commands/schemes.ts` | 新增 `pipeline status` 和 `pipeline records` 命令 |
| `src/skills/pipeline-runner.ts` | 修路由逻辑，修 pipelineName 传参 |
| `src/skills/pipeline-stopper.ts` | 修路由逻辑，修 pipelineName 传参 |
| `src/skills/pipeline-status.ts` | 修 pipelineName 传参，移除 ci_type |

## 不在范围内

- 后端 API 本身的修改
- 新增流水线相关的其他功能（回滚、重跑等）
- Skills 接口（参数名称）的变更
