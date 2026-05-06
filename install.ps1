# Dops CLI 一键安装脚本 (Windows)
# 支持从 Git 源码安装或从 GitHub Release 下载预构建包
#
# 用法：
#   iwr -useb https://raw.githubusercontent.com/your-org/devops-cli/main/install.ps1 | iex
#   iwr ... | iex; install-dops -FromGit
#   iwr ... | iex; install-dops -Version "0.1.0"

param(
    [switch]$FromGit,
    [string]$Version = "latest",
    [switch]$Help
)

# 配置
$RepoUrl = "https://github.com/your-org/devops-cli.git"
$GithubOwner = "your-org"
$GithubRepo = "devops-cli"
$InstallDir = "$env:LOCALAPPDATA\Programs\dops"

function Write-Header($text) {
    Write-Host ""
    Write-Host "▶ $text" -ForegroundColor Cyan
}

function Write-Success($text) {
    Write-Host "  ✓ $text" -ForegroundColor Green
}

function Write-Warn($text) {
    Write-Host "  ⚠ $text" -ForegroundColor Yellow
}

function Write-Error($text) {
    Write-Host "  ✗ $text" -ForegroundColor Red
}

function Write-Info($text) {
    Write-Host "  $text" -ForegroundColor Gray
}

if ($Help) {
    Write-Host "Dops CLI 安装脚本"
    Write-Host ""
    Write-Host "用法:"
    Write-Host "  iwr ... | iex                          从 GitHub Release 下载（默认）"
    Write-Host "  iwr ... | iex; install-dops -FromGit   从 Git 仓库克隆源码"
    Write-Host "  iwr ... | iex; install-dops -Version 0.1.0  指定版本"
    Write-Host ""
    exit 0
}

Write-Host "📦 Dops CLI 安装程序" -ForegroundColor Cyan
Write-Host ""

# ---------------------- 检查 Node.js ----------------------

Write-Header "检查 Node.js 环境"

try {
    $NodeVersion = node --version 2>$null
    if (-not $NodeVersion) { throw "Node.js not found" }
} catch {
    Write-Error "Node.js 未安装"
    Write-Host ""
    Write-Host "请安装 Node.js 20+："
    Write-Host "  1. 访问 https://nodejs.org/"
    Write-Host "  2. 下载 LTS 版本（v20+）"
    Write-Host "  3. 运行安装程序并重启终端"
    exit 1
}

$NodeMajor = [int]($NodeVersion -replace '^v','').Split('.')[0]

if ($NodeMajor -lt 20) {
    Write-Error "Node.js 版本过低: $NodeVersion，需要 >= 20.0.0"
    Write-Host ""
    Write-Host "请升级 Node.js："
    Write-Host "  访问 https://nodejs.org/ 下载最新版本"
    exit 1
}

Write-Success "Node.js $NodeVersion"

# 检查 git
$HasGit = $false
try {
    git --version >$null 2>&1
    $HasGit = $true
    Write-Success "git 已安装"
} catch {
    if ($FromGit) {
        Write-Error "从源码安装需要 git"
        Write-Host "请安装 Git for Windows：https://git-scm.com/download/win"
        exit 1
    }
}

# 检查包管理器
$PM = $null
foreach ($cmd in @('pnpm','npm')) {
    try {
        & $cmd --version >$null 2>&1
        $PM = $cmd
        Write-Success "包管理器: $PM"
        break
    } catch {}
}

if (-not $PM) {
    Write-Error "未找到包管理器（pnpm/npm）"
    exit 1
}

# ---------------------- 安装方式选择 ----------------------

Write-Host ""

if ($FromGit -or -not $HasGit) {
    # 从源码安装
    Write-Header "从 Git 仓库克隆源码"

    $TempDir = [System.IO.Path]::GetTempPath() + [System.Guid]::NewGuid().ToString()
    $CloneDir = Join-Path $TempDir "devops-cli"

    Write-Info "克隆仓库..."
    try {
        git clone --depth 1 $RepoUrl $CloneDir
    } catch {
        Write-Error "克隆失败: $_"
        exit 1
    }
    Write-Success "克隆完成"

    # 运行 setup.js
    Write-Header "运行初始化脚本"
    Set-Location $CloneDir

    try {
        node scripts/setup.js --global
    } catch {
        Write-Error "初始化失败: $_"
        exit 1
    }

    # 验证
    Write-Header "验证安装"
    try {
        $DopsPath = Join-Path $CloneDir "bin\dops.cmd"
        & $DopsPath --version
        Write-Success "验证通过"
    } catch {
        Write-Warn "验证命令失败"
        Write-Info "尝试直接运行: $DopsPath --help"
    }

    Write-Info "源码保留在: $CloneDir"
    Write-Info "如需更新，cd $CloneDir && git pull && node scripts/setup.js"

} else {
    # 从 Release 下载
    Write-Header "从 GitHub Release 下载"

    $Arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }

    if ($Version -eq "latest") {
        $DownloadUrl = "https://github.com/$GithubOwner/$GithubRepo/releases/latest/download/dops-latest-win32-$Arch.zip"
    } else {
        $DownloadUrl = "https://github.com/$GithubOwner/$GithubRepo/releases/download/v$Version/dops-$Version-win32-$Arch.zip"
    }

    $TempFile = "$env:TEMP\dops-$Version.zip"

    Write-Info "架构: $Arch"
    Write-Info "下载: $DownloadUrl"

    try {
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempFile -UseBasicParsing
        Write-Success "下载完成"
    } catch {
        Write-Error "下载失败: $_"
        exit 1
    }

    # 创建安装目录
    if (!(Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    # 解压
    Write-Header "解压安装包"
    try {
        Expand-Archive -Path $TempFile -DestinationPath $InstallDir -Force
        Write-Success "解压完成"
    } catch {
        Write-Error "解压失败: $_"
        exit 1
    }

    # 添加到 PATH
    Write-Header "配置环境变量"
    $CurrentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($CurrentPath -notlike "*$InstallDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$CurrentPath;$InstallDir", "User")
        $env:Path += ";$InstallDir"
        Write-Success "已添加到用户 PATH"
    } else {
        Write-Success "已在 PATH 中"
    }

    # 创建配置目录
    $ConfigDir = Join-Path $env:USERPROFILE ".dops"
    if (!(Test-Path $ConfigDir)) {
        New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null
    }

    # 清理
    Remove-Item $TempFile -Force -ErrorAction SilentlyContinue

    # 验证
    Write-Header "验证安装"
    try {
        $DopsExe = Join-Path $InstallDir "dops.cmd"
        if (Test-Path $DopsExe) {
            & $DopsExe --version
            Write-Success "安装成功"
        }
    } catch {
        Write-Warn "验证命令失败"
    }
}

# ---------------------- 完成 ----------------------

Write-Host ""
Write-Host "✨ Dops CLI 安装完成！" -ForegroundColor Green
Write-Host ""
Write-Host "快速开始："
Write-Host "  dops --help         查看帮助" -ForegroundColor Cyan
Write-Host "  dops                进入交互式 REPL" -ForegroundColor Cyan
Write-Host "  dops auth login     登录 DevOps 平台" -ForegroundColor Cyan
Write-Host ""
