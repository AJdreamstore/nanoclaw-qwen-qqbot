#!/bin/bash

# QwQnanoclaw Installer for Unix/Linux/macOS
# This script installs Node.js (if needed) and runs the QwQnanoclaw setup

set -e

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         QwQnanoclaw Installer / QwQnanoclaw 安装程序            ║"
echo "║         Your Personal AI Assistant / 您的个人 AI 助手           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if Node.js is installed / 检查 Node.js 是否已安装
NODE_PATH=$(which node 2>/dev/null || echo "")

if [ -z "$NODE_PATH" ]; then
    echo "📦 Node.js is not installed / Node.js 未安装"
    echo ""
    
    # Detect OS using uname / 检测操作系统
    OS_NAME=$(uname -s)
    
    case "$OS_NAME" in
        Darwin)
            # macOS
            BREW_PATH=$(which brew 2>/dev/null || echo "")
            if [ -n "$BREW_PATH" ]; then
                echo "Installing Node.js via Homebrew... / 通过 Homebrew 安装 Node.js..."
                brew install node@22
            else
                echo "Homebrew not found. Please install Node.js manually: / 未找到 Homebrew，请手动安装 Node.js："
                echo "  1. Visit: https://nodejs.org/"
                echo "  2. Download and install Node.js LTS (v22+) / 下载并安装 Node.js LTS (v22+)"
                echo "  3. Re-run this installer / 重新运行此安装程序"
                exit 1
            fi
            ;;
        Linux)
            # Linux
            echo "Installing Node.js 22 LTS... / 安装 Node.js 22 LTS..."
            # Check if running as root / 检查是否以 root 身份运行
            if [ "$(id -u)" = "0" ]; then
                curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
                apt-get install -y nodejs
            else
                curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
                sudo apt-get install -y nodejs
            fi
            ;;
        *)
            echo "Unsupported OS: $OS_NAME / 不支持的操作系统：$OS_NAME"
            echo "Please install Node.js manually from https://nodejs.org/ / 请从 https://nodejs.org/ 手动安装 Node.js"
            exit 1
            ;;
    esac
    
    echo "✓ Node.js installed / Node.js 已安装"
    echo ""
fi

# Check Node.js version / 检查 Node.js 版本
NODE_VERSION=$(node --version)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | tr -d 'v')

if [ "$NODE_MAJOR" -lt 20 ]; then
    echo "✗ Node.js version $NODE_VERSION is too old / Node.js 版本过旧"
    echo "  Required: Node.js 20+ / 需要：Node.js 20+"
    echo "  Please upgrade Node.js / 请升级 Node.js"
    exit 1
fi

echo "✓ Node.js $NODE_VERSION is installed / Node.js $NODE_VERSION 已安装"
echo ""

# Check if running from project directory / 检查是否在项目目录运行
if [ ! -f "package.json" ]; then
    echo "✗ Please run this script from the QwQnanoclaw project directory / 请在 QwQnanoclaw 项目目录中运行此脚本"
    exit 1
fi

# Install dependencies / 安装依赖
echo "📦 Installing project dependencies... / 安装项目依赖..."
npm install
echo "✓ Dependencies installed / 依赖已安装"
echo ""

# Create .env if needed / 创建 .env 文件（如果需要）
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    echo "📝 Creating .env file... / 创建 .env 文件..."
    cp .env.example .env
    echo "✓ .env file created / .env 文件已创建"
    echo "⚠ Please edit .env with your configuration / 请编辑 .env 文件进行配置"
    echo ""
fi

# Build project (compile TypeScript) / 构建项目（编译 TypeScript）
echo "🔨 Building project... / 正在构建项目..."
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           Building Project / 构建项目                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
npm run build

if [ $? -eq 0 ]; then
    echo "✓ Build successful! / 构建成功！"
else
    echo "✗ Build failed! / 构建失败！"
    echo "  You can manually rebuild later: npm run build / 您可以稍后手动构建：npm run build"
    echo ""
    # Ask if user wants to continue despite build failure / 询问用户是否继续（尽管构建失败）
    echo "Continue with setup anyway? [y/N] / 仍然继续配置？[y/N]"
    printf "> "
    read CONTINUE_REPLY
    case "$CONTINUE_REPLY" in
        [Yy]*)
            echo "Continuing... / 继续中..."
            ;;
        *)
            echo "Installation aborted. / 安装已中止。"
            exit 1
            ;;
    esac
fi
echo ""

# Ask about Docker Sandbox mode / 询问 Docker Sandbox 配置
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           Docker Sandbox Configuration                       ║"
echo "║              Docker Sandbox 配置                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Enable Docker Sandbox for enhanced security? (y/N) / 是否启用 Docker Sandbox 以增强安全性？(y/N)"
echo ""
echo "What is Docker Sandbox? / 什么是 Docker Sandbox？"
echo "  - AI runs inside Docker containers with isolated filesystem / AI 在 Docker 容器内运行，文件系统隔离"
echo "  - AI cannot modify source code or sensitive files / AI 无法修改源代码或敏感文件"
echo "  - Dangerous commands only affect the container, not your host / 危险命令只影响容器，不影响宿主机"
echo "  - Files created in container auto-sync to host / 容器内创建的文件自动同步到宿主机"
echo ""
echo "Requirements: / 要求："
echo "  - Docker Desktop must be installed and running / Docker Desktop 必须已安装并运行"
echo "  - Slightly slower startup (container creation) / 启动稍慢（需要创建容器）"
echo ""
echo "Recommended for: Production environments / 推荐用于：生产环境"
echo "Not needed for: Development/testing / 不需要用于：开发/测试"
echo ""
printf "Enable Docker Sandbox? [y/N]: / 是否启用 Docker Sandbox？[y/N]: "
read DOCKER_REPLY

case "$DOCKER_REPLY" in
    [Yy]*)
        # Check if Docker is installed / 检查 Docker 是否已安装
        DOCKER_PATH=$(which docker 2>/dev/null || echo "")
        
        if [ -z "$DOCKER_PATH" ]; then
            echo ""
            echo "⚠ Docker is not installed / Docker 未安装"
            echo ""
            echo "Installing Docker Desktop... / 正在安装 Docker Desktop..."
            echo ""
            
            OS_NAME=$(uname -s)
            
            case "$OS_NAME" in
                Darwin)
                    # macOS
                    BREW_PATH=$(which brew 2>/dev/null || echo "")
                    if [ -n "$BREW_PATH" ]; then
                        echo "Installing Docker Desktop via Homebrew... / 通过 Homebrew 安装 Docker Desktop..."
                        brew install --cask docker
                    else
                        echo "Homebrew not found. / 未找到 Homebrew"
                        echo "Please install Docker Desktop manually: / 请手动安装 Docker Desktop："
                        echo "  Visit: https://www.docker.com/products/docker-desktop/"
                        echo "  Download and install Docker Desktop for Mac / 下载并安装 Docker Desktop for Mac"
                        echo ""
                        echo "For now, Docker Sandbox will be disabled. / 暂时禁用 Docker Sandbox"
                    fi
                    ;;
                Linux)
                    # Linux
                    echo "Installing Docker Engine... / 正在安装 Docker Engine..."
                    if [ "$(id -u)" = "0" ]; then
                        curl -fsSL https://get.docker.com | bash
                    else
                        curl -fsSL https://get.docker.com | sudo -E bash -
                    fi
                    
                    echo "Adding user '$USER' to docker group... / 添加用户 '$USER' 到 docker 组..."
                    sudo usermod -aG docker "$USER"
                    echo "✓ Docker installed. Please log out and back in for group changes to take effect. / Docker 已安装，请注销并重新登录以使组更改生效"
                    ;;
                *)
                    echo "Unsupported OS: $OS_NAME / 不支持的操作系统：$OS_NAME"
                    echo "Please install Docker Desktop manually from: / 请手动安装 Docker Desktop："
                    echo "  https://www.docker.com/products/docker-desktop/"
                    echo ""
                    echo "For now, Docker Sandbox will be disabled. / 暂时禁用 Docker Sandbox"
                    ;;
            esac
            
            DOCKER_INSTALLED=false
        else
            # Docker is installed, check if it's running / Docker 已安装，检查是否运行
            if docker info >/dev/null 2>&1; then
                DOCKER_INSTALLED=true
                echo "✓ Docker is installed and running / Docker 已安装并运行"
            else
                echo "⚠ Docker is installed but not running / Docker 已安装但未运行"
                echo "  Please start Docker Desktop and re-run this installer / 请启动 Docker Desktop 并重新运行此安装程序"
                echo ""
                echo "For now, Docker Sandbox will be disabled. / 暂时禁用 Docker Sandbox"
                DOCKER_INSTALLED=false
            fi
        fi
        
        if [ "$DOCKER_INSTALLED" = true ]; then
            echo ""
            echo "✓ Docker is ready / Docker 已就绪"
            echo ""
            echo "Configuring .env for Docker Sandbox mode... / 正在配置 .env 以启用 Docker Sandbox 模式..."
            
            # Update .env to enable Docker Sandbox / 更新 .env 启用 Docker Sandbox
            if [ -f ".env" ]; then
                # Remove any existing NATIVE_MODE and QWEN_SANDBOX_TYPE lines / 删除现有的 NATIVE_MODE 和 QWEN_SANDBOX_TYPE 行
                sed -i.bak '/^NATIVE_MODE=/d' .env
                sed -i.bak '/^QWEN_SANDBOX_TYPE=/d' .env
                sed -i.bak '/^# NATIVE_MODE=/d' .env
                sed -i.bak '/^# QWEN_SANDBOX_TYPE=/d' .env
                rm -f .env.bak
                
                # Add Docker Sandbox configuration / 添加 Docker Sandbox 配置
                echo "NATIVE_MODE=false" >> .env
                echo "QWEN_SANDBOX_TYPE=docker" >> .env
                echo "QWEN_SANDBOX_WORKSPACE=/workspace/group" >> .env
                
                echo "✓ .env configured for Docker Sandbox / .env 已配置为 Docker Sandbox 模式"
            fi
        else
            # Docker not available, keep native mode / Docker 不可用，保持原生模式
            if [ -f ".env" ]; then
                sed -i.bak '/^NATIVE_MODE=/d' .env
                sed -i.bak '/^QWEN_SANDBOX_TYPE=/d' .env
                sed -i.bak '/^# NATIVE_MODE=/d' .env
                sed -i.bak '/^# QWEN_SANDBOX_TYPE=/d' .env
                rm -f .env.bak
                echo "NATIVE_MODE=true" >> .env
            fi
        fi
        ;;
    *)
        # User declined Docker Sandbox / 用户拒绝 Docker Sandbox
        echo ""
        echo "✓ Native mode selected (no Docker isolation) / 已选择原生模式（无 Docker 隔离）"
        echo ""
        if [ -f ".env" ]; then
            sed -i.bak '/^NATIVE_MODE=/d' .env
            sed -i.bak '/^QWEN_SANDBOX_TYPE=/d' .env
            sed -i.bak '/^# NATIVE_MODE=/d' .env
            sed -i.bak '/^# QWEN_SANDBOX_TYPE=/d' .env
            rm -f .env.bak
            echo "NATIVE_MODE=true" >> .env
        fi
        ;;
esac

echo ""
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        Installation Complete! / 安装完成！🎉                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Run the interactive setup wizard now? / 现在运行交互式配置向导？[Y/n]"
printf "> "
read REPLY

case "$REPLY" in
    [Nn]*)
        echo ""
        echo "✓ Installation complete! / 安装完成！"
        echo ""
        echo "You can run the setup wizard later with: / 您可以稍后运行配置向导："
        echo "   npx tsx setup/index.ts"
        echo ""
        ;;
    *)
        echo ""
        echo "🚀 Running QwQnanoclaw setup wizard... / 正在运行 QwQnanoclaw 配置向导..."
        npx tsx setup/index.ts
        ;;
esac

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              Thank you for installing!                       ║"
echo "║          感谢您安装使用 QwQnanoclaw！🎉                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
