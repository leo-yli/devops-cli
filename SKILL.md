# DevOpsPlatform CLI - Skill 开发指南

## 什么是 Skill？

Skill 是 devops-cli 的可扩展功能模块，可以被 CLI 命令直接调用，也可以被 AI Agent 动态使用。

## 快速开始

### 创建一个简单的 Skill

```typescript
import { defineSkill } from './skills/registry.js';

defineSkill(
  {
    name: 'hello-world',
    description: '一个简单的示例技能',
    version: '1.0.0',
    parameters: [
      {
        name: 'name',
        description: '你的名字',
        type: 'string',
        required: false,
        default: 'World',
      },
    ],
    tags: ['example'],
  },
  async (ctx) => {
    const { name } = ctx.rawArgs as { name: string };
    
    ctx.output.success(`Hello, ${name}!`);
    
    return {
      success: true,
      message: `向 ${name} 问好成功`,
    };
  }
);
```

### SkillContext API

#### 配置访问
```typescript
ctx.config.host      // 当前后端地址
ctx.config.tenant    // 当前租户 ID
```

#### 参数获取
```typescript
ctx.rawArgs          // 用户传入的所有参数（已类型转换）
```

#### 交互式输入
```typescript
const name = await ctx.prompt.input('请输入名称：');
const confirmed = await ctx.prompt.confirm('确定删除吗？');
const choice = await ctx.prompt.select('选择环境：', [
  { label: '开发环境', value: 'dev' },
  { label: '生产环境', value: 'prod' },
]);
```

#### 输出显示
```typescript
ctx.output.info('普通信息');
ctx.output.success('成功信息');
ctx.output.warning('警告信息');
ctx.output.error('错误信息');
ctx.output.table(['列1', '列2'], [['值1', '值2']]);
ctx.output.json({ key: 'value' });
```

#### 进度指示
```typescript
const result = await ctx.progress(
  '正在加载...',
  fetchData()  // Promise
);
```

## 内置 Skills 参考

### 1. pipeline-analyzer

分析流水线执行历史，提供优化建议。

```bash
dops skill run pipeline-analyzer \
  --pipeline-id 123 \
  --demand-scheme-id 456 \
  --limit 20 \
  --focus failures
```

### 2. git-cleanup

清理 Git 仓库中已合并或过期的分支。

```bash
# 试运行（不会实际删除）
dops skill run git-cleanup --path ./project --dry-run true

# 实际执行
dops skill run git-cleanup --path ./project --dry-run false --older-than 7
```

### 3. deploy-checker

部署前检查，验证需求项目、流水线、代码合并状态。

```bash
dops skill run deploy-checker \
  --demand-scheme-id 123 \
  --environment prod
```

## Skill 最佳实践

1. **参数设计**
   - 使用合理的默认值
   - 必填参数尽可能少
   - 提供清晰的描述

2. **错误处理**
   - 返回 `success: false` 而不是抛出异常
   - 在 `error` 中提供有用的错误信息
   - 在 `suggestions` 中给出修复建议

3. **用户体验**
   - 危险操作需要二次确认
   - 使用 `ctx.progress` 显示长时间任务进度
   - 输出格式化的表格而不是原始 JSON

4. **安全性**
   - 默认使用试运行模式（dry-run）
   - 敏感操作需要明确确认
   - 不要记录密码或 Token

## 高级用法

### 调用其他 SDK

```typescript
import * as pipelineClient from '../sdk/pipeline/client.js';

const records = await pipelineClient.getPipelineRecords(pipelineId, demandSchemeId, 10, 1);
```

### 使用缓存

```typescript
import { cache } from '../core/cache.js';

// 读取缓存
const cached = await cache.get('my-key');

// 设置缓存（TTL 毫秒）
await cache.set('my-key', data, 60000);
```

### 调用其他 Skill

```typescript
import { skillRegistry } from './registry.js';

const otherSkill = skillRegistry.get('other-skill');
const result = await otherSkill.execute(ctx);
```

## 测试 Skill

```bash
# 列出所有 skills
dops skill list

# 查看 skill 详情
dops skill show my-skill

# 运行测试
dops skill run my-skill --param1 value1 --param2 value2
```

## 发布 Skill

1. 在 `src/skills/` 目录下创建新的 skill 文件
2. 在 `src/skills/index.ts` 中导出（如果需要）
3. 在 `registerBuiltinSkills()` 中导入新 skill
4. 更新 README.md 和 SKILL.md 文档
5. 重新构建 CLI

```bash
pnpm run build
```
