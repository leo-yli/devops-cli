#!/bin/bash
# Dops CLI 一键安装脚本 (Linux/macOS)
# 支持从 Git 源码安装或从 GitHub Release 下载预构建包
#
# 用法：
#   curl -fsSL https://raw.githubusercontent.com/your-org/devops-cli/main/install.sh | bash
#   curl -fsSL ... | bash -s -- --release        # 从 Release 下载
#   curl -fsSL ... | bash -s -- --version 0.1.0  # 指定版本

set -e

# 配置
REPO_URL="https://github.com/your-org/devops-cli.git"
GITHUB_OWNER="your-org"
GITHUB_REPO="devops-cli"
VERSION="${VERSION:-latest}"
INSTALL_DIR="/usr/local/bin"
FROM_RELEASE=false

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

function print() { echo -e "${CYAN}$1${NC}"; }
function success() { echo -e "${GREEN}  ✓ $1${NC}"; }
function warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }
function error() { echo -e "${RED}  ✗ $1${NC}"; }
function info() { echo -e "${DIM}  $1${NC}"; }

# 解析参数
while [[ $# -gt 0 ]]; do
  case $1 in
    --release|-r)
      FROM_RELEASE=true
      shift
      ;;
    --version|-v)
      VERSION="$2"
      shift 2
      ;;
    --help|-h)
      echo "Dops CLI 安装脚本"
      echo ""
      echo "用法:"
      echo "  $0                    从 Git 仓库克隆源码并构建"
      echo "  $0 --release          从 GitHub Release 下载预构建包"
      echo "  $0 --version 0.1.0    指定版本安装"
      echo ""
      exit 0
      ;;
    *)
      warn "未知参数: $1"
      shift
      ;;
  esac
done

print "📦 Dops CLI 安装程序"
echo ""

# ---------------------- 检查 Node.js ----------------------

print "▶ 检查 Node.js 环境"

if ! command -v node &> /dev/null; then
  error "Node.js 未安装"
  echo ""
  echo "请安装 Node.js 20+："
  echo "  macOS:    brew install node@20"
  echo "  Ubuntu:   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
  echo "  其他:     https://nodejs.org/"
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 20 ]; then
  error "Node.js 版本过低: v${NODE_VERSION}，需要 >= 20.0.0"
  echo ""
  echo "请升级 Node.js："
  echo "  macOS:    brew upgrade node"
  echo "  其他:     https://nodejs.org/"
  exit 1
fi

success "Node.js v${NODE_VERSION}"

# 检查 git
if ! command -v git &> /dev/null; then
  warn "未找到 git，从源码安装需要 git"
  if [ "$FROM_RELEASE" = false ]; then
    echo "切换到 --release 模式或安装 git"
    FROM_RELEASE=true
  fi
fi

# 检查包管理器
PM=""
if command -v pnpm &> /dev/null; then
  PM="pnpm"
  success "包管理器: pnpm"
elif command -v npm &> /dev/null; then
  PM="npm"
  success "包管理器: npm"
else
  error "未找到包管理器（pnpm/npm）"
  exit 1
fi

# ---------------------- 安装方式选择 ----------------------

echo ""

if [ "$FROM_RELEASE" = true ]; then
  # 从 Release 下载
  print "▶ 从 GitHub Release 下载"

  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)

  case "$ARCH" in
    x86_64) ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *) error "不支持的架构: $ARCH"; exit 1 ;;
  esac

  case "$OS" in
    linux|darwin) ;;  # 支持
    *) error "不支持的操作系统: $OS"; exit 1 ;;
  esac

  if [ "$VERSION" = "latest" ]; then
    DOWNLOAD_URL="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/dops-latest-${OS}-${ARCH}.tar.gz"
  else
    DOWNLOAD_URL="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${VERSION}/dops-${VERSION}-${OS}-${ARCH}.tar.gz"
  fi

  TEMP_DIR=$(mktemp -d)
  TEMP_FILE="${TEMP_DIR}/dops.tar.gz"

  info "系统: ${OS}, 架构: ${ARCH}"
  info "下载: ${DOWNLOAD_URL}"

  if command -v curl &> /dev/null; then
    curl -fsSL "$DOWNLOAD_URL" -o "$TEMP_FILE" || { error "下载失败"; exit 1; }
  elif command -v wget &> /dev/null; then
    wget -q "$DOWNLOAD_URL" -O "$TEMP_FILE" || { error "下载失败"; exit 1; }
  else
    error "需要 curl 或 wget"
    exit 1
  fi

  success "下载完成"

  # 解压
  print "▶ 解压安装包"
  tar -xzf "$TEMP_FILE" -C "$TEMP_DIR"
  EXTRACTED_DIR=$(find "$TEMP_DIR" -maxdepth 1 -type d | tail -n 1)

  # 复制到安装目录
  print "▶ 安装到 ${INSTALL_DIR}"
  if [ -w "$INSTALL_DIR" ]; then
    cp "${EXTRACTED_DIR}/dops" "$INSTALL_DIR/"
    chmod +x "${INSTALL_DIR}/dops"
  else
    info "需要管理员权限..."
    sudo cp "${EXTRACTED_DIR}/dops" "$INSTALL_DIR/"
    sudo chmod +x "${INSTALL_DIR}/dops"
  fi

  # 创建配置目录
  mkdir -p ~/.dops

  # 清理
  rm -rf "$TEMP_DIR"

  success "安装完成"

  # 验证
  if command -v dops &> /dev/null; then
    echo ""
    dops --version
  fi

else
  # 从源码安装（推荐）
  print "▶ 从 Git 仓库克隆源码"

  TEMP_DIR=$(mktemp -d)
  CLONE_DIR="${TEMP_DIR}/devops-cli"

  info "克隆仓库..."
  git clone --depth 1 "$REPO_URL" "$CLONE_DIR" || { error "克隆失败"; exit 1; }
  success "克隆完成"

  # 运行 setup.js
  print "▶ 运行初始化脚本"
  cd "$CLONE_DIR"
  node scripts/setup.js --global || { error "初始化失败"; exit 1; }

  # 验证
  print "▶ 验证安装"
  if command -v dops &> /dev/null; then
    dops --version
  else
    warn "dops 命令未在 PATH 中"
    info "尝试从安装目录运行: ${CLONE_DIR}/bin/dops --help"
  fi

  # 清理（保留源码以便更新）
  info "源码保留在: ${CLONE_DIR}"
  info "如需更新，cd ${CLONE_DIR} && git pull && node scripts/setup.js"
fi

# ---------------------- 完成 ----------------------

echo ""
echo -e "${GREEN}✨ Dops CLI 安装完成！${NC}"
echo ""
echo "快速开始："
echo -e "  ${CYAN}dops --help${NC}         查看帮助"
echo -e "  ${CYAN}dops${NC}                 进入交互式 REPL"
echo -e "  ${CYAN}dops auth login${NC}     登录 DevOps 平台"
echo ""
