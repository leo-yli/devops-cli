# Dops CLI - DevOps Platform CLI

Dops CLI 是一个面向 DevOps 平台的命令行工具，专为 LLM/Agent 集成设计，提供流水线管理、项目与需求管理、源码管理等功能。

## 设计目标

此 CLI 作为**工具层**供大模型或 Agent 调用：
- 提供结构化的 JSON 输出（`--json` 模式）
- 清晰的命令接口和参数定义
- 可扩展的技能系统（Skills）

## 功能特性

- **认证管理**: JWT 登录/登出，安全令牌存储
- **流水线管理**: 列表、查看、触发、终止、重跑、记录查询、状态查询
- **项目与需求**: 管理项目方案和需求方案
- **源码管理**: 基于 GitLab 的仓库、分支、MR 管理
- **扩展技能**: 7+ 内置技能（触发流水线、终止流水线、查询状态等）

## 安装

### 从源码构建（当前推荐方式）

```bash
# 克隆项目
git clone <repo-url>
cd devops-cli

# 安装依赖
pnpm install

# 构建
pnpm run build

# 初始化配置（创建 ~/.dops/config.yaml）
pnpm run install:local
```

初始化完成后即可使用：

```bash
./dops.sh --help        # Linux/macOS
.\dops.cmd --help       # Windows
```

**可选：添加到 PATH 实现全局访问**

```powershell
# Windows (PowerShell) — 替换为实际路径
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";D:\project_main\devops-cli", "User")
# 重启终端后生效，或执行：$env:Path += ";D:\project_main\devops-cli"
```

```bash
# Linux/macOS — 替换为实际路径
echo 'export PATH="$PATH:/path/to/devops-cli"' >> ~/.bashrc && source ~/.bashrc
```

### 配置文件

初始化后配置文件位于 `~/.dops/config.yaml`，可按需修改：

```yaml
defaultHost: https://ci.jlpay.com   # 默认 DevOps 平台地址
defaultTenant: ''                   # 默认租户
llm:
  provider: openai
  model: gpt-4o
  apiKey: ''
  baseUrl: ''
agent:
  confirmWriteOps: true
  maxAutoSteps: 10
  stream: true
```

## 使用方法

### 交互式 REPL 模式

直接运行 `dops` 进入交互式终端，使用 `/` 开头的命令：

```bash
$ dops
╔══════════════════════════════════════╗
║     DevOps Platform CLI (dops)       ║
╚══════════════════════════════════════╝
Type /help for available commands, /exit to quit

dops> /help                    # 显示所有可用命令
dops> /skill list              # 列出所有技能
dops> /skill show pipeline-runner

dops> /pipeline list                              # 列出流水线
dops> /pipeline show <pipeline-name>              # 查看流水线详情
dops> /pipeline trigger <pipeline-name> [demand-scheme-id]  # 触发流水线
dops> /pipeline abort <pipeline-name> [demand-scheme-id]    # 终止流水线
dops> /pipeline records <pipeline-name> [demand-scheme-id]  # 查看运行记录
dops> /pipeline status <pipeline-name> [demand-scheme-id]   # 查看运行状态

dops> /project list            # 列出项目
dops> /project show <id>       # 查看项目详情
dops> /demand list <scheme-id> # 列出需求项目
dops> /repo list               # 列出代码仓库

dops> /bash ls -la             # 执行本地 shell 命令
dops> /cat README.md           # 查看文件内容
dops> /ls ./src                # 列出目录
dops> /grep "TODO" ./src       # 搜索文件

dops> /exit                    # 退出 REPL
```

**REPL 常用命令：**

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助信息 |
| `/skill list` | 列出所有可用技能 |
| `/skill show <name>` | 查看技能详情 |
| `/pipeline list` | 列出流水线 |
| `/pipeline show <pipeline-name>` | 查看流水线详情 |
| `/pipeline trigger <pipeline-name> [demand-scheme-id]` | 触发流水线（可选关联需求项目） |
| `/pipeline abort <pipeline-name> [demand-scheme-id]` | 终止流水线（可选关联需求项目） |
| `/pipeline records <pipeline-name> [demand-scheme-id]` | 查看运行记录 |
| `/pipeline status <pipeline-name> [demand-scheme-id]` | 查看运行状态（无需求ID时显示流水线基本信息） |
| `/project list` | 列出项目 |
| `/project show <id>` | 查看项目详情 |
| `/demand list <scheme-id>` | 列出需求项目 |
| `/demand show <scheme-id> <demand-id>` | 查看需求项目详情 |
| `/repo list` | 列出代码仓库 |
| `/bash <cmd>` | 执行 shell 命令 |
| `/cat <file>` | 读取文件 |
| `/ls [path]` | 列出目录 |
| `/grep <pattern> <path>` | 搜索文件 |
| `/exit` | 退出 REPL |

### 全局选项

```bash
dops --json skill list        # JSON 输出模式（供 LLM/Agent 使用）
dops --quiet pipeline list    # 静默模式
```

### 基础命令

```bash
# 认证
dops auth login --host https://api.example.com
dops auth logout

# 流水线管理
dops pipeline list
dops pipeline show <pipelineName>
dops pipeline run <pipelineName> [--demand-id <id>] [--params <json>]
dops pipeline abort <pipelineName> [--demand-id <id>]
dops pipeline rerun <pipelineName> --stage-seq <seq>
dops pipeline records <pipelineName> [demandSchemeId] [--limit <n>] [--page <n>]
dops pipeline status <pipelineName> [demandSchemeId]

# 项目与需求
dops schemes list
dops schemes show <schemeId>
dops schemes demand list --scheme-id <id>
dops schemes demand show <demandSchemeId>
dops schemes pipeline list --scheme-id <id>
dops schemes pipeline run --demand-id <id> --pipeline-name <name> [--params <json>]
dops schemes pipeline abort --demand-id <id> --pipeline-name <name>
dops schemes pipeline status --demand-id <id> --pipeline-name <name>
dops schemes pipeline records --demand-id <id> --pipeline-name <name> [--limit <n>] [--page <n>]
dops schemes rollback --demand-id <id> --pipeline-name <name>

# 源码管理
dops scm repo list
dops scm branch list <repo-id>
dops scm mr list <repo-id>
```

### 技能系统 (Skills)

技能是可扩展的自动化工具，可通过 `dops skill` 命令调用。

#### 查看所有技能

```bash
# 人类可读格式
dops skill list

# JSON 格式（供 LLM/Agent）
dops --json skill list
```

#### 查看技能详情

```bash
dops skill show pipeline-runner
dops --json skill show pipeline-runner
```

#### 运行技能

```bash
# 触发流水线
dops skill run pipeline-runner --pipeline-id 123
dops skill run pipeline-runner --pipeline-id 123 --environment test --wait

# 查询流水线状态
dops skill run pipeline-status --pipeline-id 123
dops --json skill run pipeline-status --pipeline-id 123 --demand-scheme-id 456

# 终止流水线
dops skill run pipeline-stopper --pipeline-id 123 --force

# 部署工作流
dops skill run deploy-workflow --demand-scheme-id 123 --environment staging
```

#### 内置技能列表

| 技能 | 描述 | 关键参数 |
|------|------|----------|
| `pipeline-runner` | 触发流水线执行 | `pipelineId`, `environment`, `wait` |
| `pipeline-stopper` | 终止运行中的流水线 | `pipelineId`, `force` |
| `pipeline-status` | 查询流水线状态和历史 | `pipelineId`, `demandSchemeId`, `watch` |
| `pipeline-analyzer` | 分析流水线执行历史 | `pipelineId`, `demandSchemeId` |
| `deploy-workflow` | 完整部署工作流 | `demandSchemeId`, `environment` |
| `deploy-checker` | 部署前检查 | `demandSchemeId` |
| `git-cleanup` | 清理 Git 分支 | `path`, `dryRun` |

## JSON 输出格式

当使用 `--json` 标志时，所有命令输出统一的 JSON 结构：

```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功",
  "error": null,
  "suggestions": ["建议1", "建议2"],
  "meta": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "command": "skill list"
  }
}
```

### 技能列表 JSON 示例

```bash
$ dops --json skill list
{
  "success": true,
  "data": [
    {
      "name": "pipeline-runner",
      "description": "触发流水线执行...",
      "version": "1.0.0",
      "tags": ["pipeline", "run"],
      "parameters": [
        {
          "name": "pipelineId",
          "type": "number",
          "required": true,
          "description": "流水线 ID"
        }
      ]
    }
  ],
  "count": 7
}
```

### 技能运行结果 JSON 示例

```bash
$ dops --json skill run pipeline-status --pipeline-id 123 --demand-scheme-id 456
{
  "success": true,
  "data": {
    "pipeline": { ... },
    "status": {
      "running": 0,
      "completed": 5,
      "failed": 0
    }
  },
  "message": "查询成功"
}
```

## 开发

```bash
# 开发模式（热重载）
pnpm run dev

# 构建
pnpm run build

# 打包分发
pnpm run package
```

## 技术栈

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5.9+
- **CLI Framework**: Commander.js
- **TUI Framework**: Ink + React (REPL 模式)
- **HTTP Client**: Axios
- **Security**: AES-256-GCM 加密文件存储 (~/.dops/)

## 许可证

MIT
