# Dops CLI 一键安装脚本 (Windows)
# 支持从 Git 源码安装或从 GitHub Release 下载预构建包
#
# 用法：
#   iwr -useb https://raw.githubusercontent.com/leo-yli/devops-cli/master/install.ps1 | iex

function Install-Dops {
    param(
        [switch]$FromGit,
        [string]$Version = "latest",
        [switch]$Help
    )

    # 设置 UTF-8 编码防止中文乱码
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8

    # 配置
    $RepoUrl = "https://github.com/leo-yli/devops-cli.git"
    $GithubOwner = "leo-yli"
    $GithubRepo = "devops-cli"
    $InstallDir = "$env:LOCALAPPDATA\Programs\dops"
    $SrcDir = "$env:LOCALAPPDATA\dops-src"

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

    function Write-ErrorMsg($text) {
        Write-Host "  ✗ $text" -ForegroundColor Red
    }

    function Write-Info($text) {
        Write-Host "  $text" -ForegroundColor Gray
    }

    function Add-ToPath($targetDir) {
        $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
        if ($currentPath -notlike "*$targetDir*") {
            [Environment]::SetEnvironmentVariable("Path", "$currentPath;$targetDir", "User")
            $env:Path += ";$targetDir"
            Write-Success "已添加到用户 PATH: $targetDir"
            return $true
        } else {
            Write-Success "已在 PATH 中"
            return $true
        }
    }

    if ($Help) {
        Write-Host "Dops CLI 安装脚本"
        Write-Host ""
        Write-Host "用法:"
        Write-Host "  iwr ... | iex                          从 Git 仓库克隆并安装（默认）"
        Write-Host "  iwr ... | iex; Install-Dops            同上"
        Write-Host "  iwr ... | iex; Install-Dops -FromGit:$false  从 GitHub Release 下载"
        Write-Host "  iwr ... | iex; Install-Dops -Version 0.1.0   指定版本"
        Write-Host ""
        return
    }

    Write-Host "📦 Dops CLI 安装程序" -ForegroundColor Cyan
    Write-Host ""

    # ---------------------- 检查 Node.js ----------------------

    Write-Header "检查 Node.js 环境"

    try {
        $NodeVersion = node --version 2>$null
        if (-not $NodeVersion) { throw "Node.js not found" }
    } catch {
        Write-ErrorMsg "Node.js 未安装"
        Write-Host ""
        Write-Host "请安装 Node.js 20+："
        Write-Host "  1. 访问 https://nodejs.org/"
        Write-Host "  2. 下载 LTS 版本（v20+）"
        Write-Host "  3. 运行安装程序并重启终端"
        return
    }

    $NodeMajor = [int]($NodeVersion -replace '^v','').Split('.')[0]

    if ($NodeMajor -lt 20) {
        Write-ErrorMsg "Node.js 版本过低: $NodeVersion，需要 >= 20.0.0"
        Write-Host ""
        Write-Host "请升级 Node.js："
        Write-Host "  访问 https://nodejs.org/ 下载最新版本"
        return
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
            Write-ErrorMsg "从源码安装需要 git"
            Write-Host "请安装 Git for Windows：https://git-scm.com/download/win"
            return
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
        Write-ErrorMsg "未找到包管理器（pnpm/npm）"
        return
    }

    # ---------------------- 安装方式选择 ----------------------

    Write-Host ""

    if ($FromGit -or -not $HasGit) {
        # 从源码安装
        Write-Header "从 Git 仓库克隆源码"

        # 使用持久目录而不是临时目录
        $CloneDir = $SrcDir
        if (Test-Path $CloneDir) {
            Write-Info "检测到已有源码，执行 git pull 更新..."
            Set-Location $CloneDir
            try {
                git pull
            } catch {
                Write-Warn "更新失败，尝试重新克隆..."
                Remove-Item $CloneDir -Recurse -Force -ErrorAction SilentlyContinue
            }
        }

        if (-not (Test-Path $CloneDir)) {
            Write-Info "克隆仓库到 $CloneDir ..."
            try {
                git clone --depth 1 $RepoUrl $CloneDir
            } catch {
                Write-ErrorMsg "克隆失败: $_"
                return
            }
        }
        Write-Success "源码就绪"

        # 运行 setup.js
        Write-Header "运行初始化脚本"
        Set-Location $CloneDir

        try {
            node scripts/setup.js --global
        } catch {
            Write-Warn "setup.js 返回非零退出码，尝试添加 PATH..."
        }

        # 无论 setup.js 是否成功，都确保 PATH 中有 bin 目录
        $BinDir = Join-Path $CloneDir "bin"
        if (Test-Path (Join-Path $BinDir "dops.cmd")) {
            Write-Header "配置全局访问"
            Add-ToPath $BinDir | Out-Null
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

        Write-Info "源码位置: $CloneDir"
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
            Write-ErrorMsg "下载失败: $_"
            return
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
            Write-ErrorMsg "解压失败: $_"
            return
        }

        # 添加到 PATH
        Write-Header "配置环境变量"
        Add-ToPath $InstallDir | Out-Null

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
}

# 通过 iex 执行时默认从 Git 安装；直接执行文件时使用传入的参数
if ($PSCommandPath) {
    Install-Dops @args
} else {
    Install-Dops -FromGit
}
