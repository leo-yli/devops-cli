# Dops CLI 安装指南

## 快速安装（推荐）

### 方式一：一键脚本（最简单）

#### macOS / Linux

```bash
# 从 Git 仓库克隆并自动构建（推荐）
curl -fsSL https://raw.githubusercontent.com/your-org/devops-cli/main/install.sh | bash

# 或从 GitHub Release 下载预构建包
curl -fsSL https://raw.githubusercontent.com/your-org/devops-cli/main/install.sh | bash -s -- --release
```

#### Windows（PowerShell）

```powershell
# 从 Git 仓库克隆并自动构建（推荐）
iwr -useb https://raw.githubusercontent.com/your-org/devops-cli/main/install.ps1 | iex; install-dops -FromGit

# 或从 GitHub Release 下载预构建包
iwr -useb https://raw.githubusercontent.com/your-org/devops-cli/main/install.ps1 | iex
```

> **注意**：请将 `your-org` 替换为实际的 GitHub 组织/用户名。

### 方式二：npm 全局安装（适合 Node.js 开发者）

```bash
# 需要 Node.js 20+
npm install -g devops-cli

# 或使用 pnpm
pnpm add -g devops-cli
```

### 方式三：手动克隆源码

```bash
# 1. 克隆仓库
git clone https://github.com/your-org/devops-cli.git
cd devops-cli

# 2. 一键初始化（安装依赖 + 构建 + 配置 + 全局访问）
node scripts/setup.js --global

# 或使用 pnpm
pnpm install
pnpm run build
pnpm run setup -- --global
```

---

## 安装要求

| 环境 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | >= 20.0.0 | 必须 |
| pnpm / npm | 任意 | 用于安装依赖 |
| Git | 任意 | 仅源码安装需要 |

---

## 初始化配置

首次运行时会自动创建配置目录 `~/.dops/`：

```
~/.dops/
├── config.yaml    # 主配置
└── mcp.json       # MCP 服务配置
```

运行交互式配置向导：

```bash
dops setup          # 交互式配置
# 或
node scripts/setup.js
```

使用默认值跳过交互：

```bash
node scripts/setup.js --yes
```

### 配置文件示例

```yaml
# ~/.dops/config.yaml
defaultHost: https://ci.jlpay.com
defaultTenant: ''
defaultUsername: ''
defaultPassword: ''

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

---

## 设置全局访问

### 方式 A：npm link（推荐）

```bash
cd devops-cli
npm link        # 或 pnpm link --global
```

### 方式 B：添加到 PATH

**Windows（PowerShell）：**

```powershell
$bin = "D:\project_main\devops-cli\bin"
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";$bin", "User")
```

**Linux/macOS：**

```bash
# 将以下行添加到 ~/.bashrc 或 ~/.zshrc
export PATH="/path/to/devops-cli/bin:$PATH"
```

### 方式 C：使用 setup.js 自动配置

```bash
node scripts/setup.js --global
```

---

## 验证安装

```bash
dops --version      # 应输出版本号
dops --help         # 显示帮助信息
dops                # 进入交互式 REPL
```

---

## 打包分发

### 构建分发包

```bash
# 构建并打包（包含 wrapper 脚本 + dist/ + 安装脚本）
pnpm run build:pkg

# 输出位置
dist-package/
├── dops-0.1.0-win32-x64.zip
└── dops-0.1.0-linux-x64.tar.gz
```

### 构建独立可执行文件

```bash
# 需要先安装 postject
npm install -g postject

# 构建独立可执行文件（使用 Node.js SEA 特性）
pnpm run build:standalone

# 输出位置
bin/dops.exe        # Windows
bin/dops            # macOS / Linux
```

---

## 更新

### 从 Git 源码更新

```bash
cd devops-cli
git pull
node scripts/setup.js --global
```

### 从 npm 更新

```bash
npm update -g devops-cli
```

---

## 卸载

### npm 全局安装

```bash
npm uninstall -g devops-cli
```

### 源码安装

```bash
# 删除源码目录
rm -rf /path/to/devops-cli

# 删除配置（可选）
rm -rf ~/.dops

# 从 PATH 中移除（手动编辑 ~/.bashrc 或 ~/.zshrc）
```

---

## 故障排除

### 命令找不到

确保全局 npm 包目录在 PATH 中：

```bash
# 查看全局安装路径
npm config get prefix

# 添加到 PATH（添加到 ~/.bashrc 或 ~/.zshrc）
export PATH="$(npm config get prefix)/bin:$PATH"
```

### Node.js 版本过低

```bash
# 查看当前版本
node --version

# 升级到 Node.js 20+
# macOS: brew install node@20
# Ubuntu: 使用 NodeSource 仓库
# Windows: 从官网下载安装包
```

### 构建失败

```bash
# 清理并重新安装依赖
rm -rf node_modules pnpm-lock.yaml
pnpm install
pnpm run build
```

### 权限问题（Linux/macOS）

```bash
# 如果无法写入 /usr/local/bin，使用 sudo
sudo bash install.sh

# 或安装到用户目录
bash install.sh --prefix ~/.local
```
