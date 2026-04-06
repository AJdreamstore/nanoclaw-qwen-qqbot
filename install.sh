#!/bin/bash

# QwQnanoclaw Installer for Unix/Linux/macOS
# This script installs Node.js (if needed) and runs the QwQnanoclaw setup

set -e

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         QwQnanoclaw 安装程序                                   ║"
echo "║         您的个人 AI 助手                                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if Node.js is installed
NODE_PATH=$(which node 2>/dev/null || echo "")

if [ -z "$NODE_PATH" ]; then
    echo "📦 Node.js 未安装"
    echo ""
    
    # Detect OS using uname
    OS_NAME=$(uname -s)
    
    case "$OS_NAME" in
        Darwin)
            # macOS
            BREW_PATH=$(which brew 2>/dev/null || echo "")
            if [ -n "$BREW_PATH" ]; then
                echo "通过 Homebrew 安装 Node.js..."
                brew install node@22
            else
                echo "未找到 Homebrew，请手动安装 Node.js："
                echo "  1. 访问：https://nodejs.org/"
                echo "  2. 下载并安装 Node.js LTS (v22+)"
                echo "  3. 重新运行此安装程序"
                exit 1
            fi
            ;;
        Linux)
            # Linux
            echo "安装 Node.js 22 LTS..."
            # Check if running as root
            if [ "$(id -u)" = "0" ]; then
                curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
                apt-get install -y nodejs
            else
                curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
                sudo apt-get install -y nodejs
            fi
            ;;
        *)
            echo "不支持的操作系统：$OS_NAME"
            echo "请从 https://nodejs.org/ 手动安装 Node.js"
            exit 1
            ;;
    esac
    
    echo "✓ Node.js 已安装"
    echo ""
fi

# Check Node.js version
NODE_VERSION=$(node --version)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | tr -d 'v')

if [ "$NODE_MAJOR" -lt 20 ]; then
    echo "✗ Node.js 版本过旧：$NODE_VERSION"
    echo "  需要：Node.js 20+"
    echo "  请升级 Node.js"
    exit 1
fi

echo "✓ Node.js $NODE_VERSION 已安装"
echo ""

# Check if running from project directory
if [ ! -f "package.json" ]; then
    echo "✗ 请在 QwQnanoclaw 项目目录中运行此脚本"
    exit 1
fi

# Install dependencies
echo "📦 安装项目依赖..."
npm install
echo "✓ 依赖已安装"
echo ""

# Create .env if needed
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    echo "📝 创建 .env 文件..."
    cp .env.example .env
    echo "✓ .env 文件已创建"
    echo "⚠ 请编辑 .env 文件进行配置"
    echo ""
fi

# Build project (compile TypeScript)
echo "🔨 构建项目..."
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           构建项目                                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
npm run build

if [ $? -eq 0 ]; then
    echo "✓ 构建成功！"
else
    echo "✗ 构建失败！"
    echo "  您可以稍后手动构建：npm run build"
    echo ""
    # Ask if user wants to continue despite build failure
    echo "仍然继续配置？[y/N]"
    printf "> "
    read CONTINUE_REPLY
    case "$CONTINUE_REPLY" in
        [Yy]*)
            echo "继续中..."
            ;;
        *)
            echo "安装已中止。"
            exit 1
            ;;
    esac
fi
echo ""

# Check Qwen Code installation
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           检查 Qwen Code                                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if Qwen Code is installed
if command -v qwen &> /dev/null; then
    QWEN_VERSION=$(qwen --version 2>&1 | head -n 1)
    echo "✓ Qwen Code 已安装：$QWEN_VERSION"
else
    echo "⚠ Qwen Code 未安装"
    echo ""
    echo "正在安装 Qwen Code..."
    npm install -g @qwen-code/qwen-code
    
    if command -v qwen &> /dev/null; then
        echo "✓ Qwen Code 安装成功"
    else
        echo "✗ 安装 Qwen Code 失败"
        echo "  请运行：npm install -g @qwen-code/qwen-code"
        echo ""
        echo "仍然继续配置？[y/N]"
        printf "> "
        read CONTINUE_REPLY
        case "$CONTINUE_REPLY" in
            [Yy]*)
                echo "继续中..."
                ;;
            *)
                echo "安装已中止。"
                exit 1
                ;;
        esac
    fi
fi
echo ""

# Check and configure Qwen Code skills (agent-browser)
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           配置 Qwen Code 技能                                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if agent-browser is installed
if command -v agent-browser &> /dev/null; then
    echo "✓ agent-browser 已安装"
else
    echo "⚠ agent-browser 未安装"
    echo ""
    echo "正在安装 agent-browser..."
    npm install -g agent-browser
    
    if command -v agent-browser &> /dev/null; then
        echo "✓ agent-browser 安装成功"
        
        echo ""
        echo "正在运行 agent-browser install..."
        agent-browser install
        
        echo "✓ agent-browser 已配置"
    else
        echo "✗ 安装 agent-browser 失败"
        echo "  您可以稍后手动安装：npm install -g agent-browser"
    fi
fi

# Configure Qwen Code skills
QWEN_CONFIG_DIR="$HOME/.qwen"
AGENT_BROWSER_SKILL_DIR="$QWEN_CONFIG_DIR/skills/agent-browser"

if [ -d "$AGENT_BROWSER_SKILL_DIR" ] && [ -f "$AGENT_BROWSER_SKILL_DIR/SKILL.md" ]; then
    echo "✓ agent-browser 技能已配置"
else
    echo "⚠ agent-browser 技能未配置"
    echo ""
    echo "正在为 Qwen Code 配置 agent-browser 技能..."
    
    # Create skills directory
    mkdir -p "$AGENT_BROWSER_SKILL_DIR"
    
    # Get agent-browser global path
    NPM_ROOT=$(npm root -g)
    AGENT_BROWSER_PATH="$NPM_ROOT/agent-browser"
    
    if [ -f "$AGENT_BROWSER_PATH/SKILL.md" ]; then
        # Copy SKILL.md to Qwen config directory
        cp "$AGENT_BROWSER_PATH/SKILL.md" "$AGENT_BROWSER_SKILL_DIR/"
        echo "✓ SKILL.md 已复制"
    fi
    
    # Update Qwen Code settings.json
    QWEN_SETTINGS="$QWEN_CONFIG_DIR/settings.json"
    if [ -f "$QWEN_SETTINGS" ]; then
        # Enable skills and web_fetch
        if command -v jq &> /dev/null; then
            # Use jq if available
            jq '.tools.experimental.skills = true | .tools.allowed = (.tools.allowed // []) + ["web_fetch", "agent-browser"]' "$QWEN_SETTINGS" > "$QWEN_SETTINGS.tmp" && mv "$QWEN_SETTINGS.tmp" "$QWEN_SETTINGS"
            echo "✓ Qwen Code 设置已更新 (使用 jq)"
        else
            # Fallback: use sed for simple replacement
            echo "ℹ 未找到 jq，使用备用方法更新设置"
            # Create a backup
            cp "$QWEN_SETTINGS" "$QWEN_SETTINGS.bak"
            # Use Node.js to update JSON (more reliable)
            node -e "
const fs = require('fs');
const settings = JSON.parse(fs.readFileSync('$QWEN_SETTINGS', 'utf-8'));
if (!settings.tools) settings.tools = {};
if (!settings.tools.experimental) settings.tools.experimental = {};
settings.tools.experimental.skills = true;
if (!settings.tools.allowed) settings.tools.allowed = [];
if (!settings.tools.allowed.includes('web_fetch')) settings.tools.allowed.push('web_fetch');
if (!settings.tools.allowed.includes('agent-browser')) settings.tools.allowed.push('agent-browser');
fs.writeFileSync('$QWEN_SETTINGS', JSON.stringify(settings, null, 2));
" && echo "✓ Qwen Code 设置已更新 (使用 Node.js)" || echo "⚠ 自动更新失败，请手动更新"
        fi
    else
        # Create settings.json
        cat > "$QWEN_SETTINGS" << EOF
{
  "tools": {
    "experimental": {
      "skills": true
    },
    "allowed": ["web_fetch", "agent-browser"]
  }
}
EOF
        echo "✓ Qwen Code settings.json 已创建"
    fi
    
    echo "✓ agent-browser 技能已为 Qwen Code 配置"
fi
echo ""

# Ask about Docker Sandbox mode
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           Docker Sandbox 配置                                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if .env file exists
if [ -f ".env" ]; then
    echo "⚠  检测到已存在的配置文件 .env"
    echo ""
    echo "这可能是："
    echo "  1. 之前安装过，现在重新运行安装脚本"
    echo "  2. 手动创建或修改了配置文件"
    echo ""
    echo "请选择操作："
    printf "  1. 保留现有配置（跳过 Docker Sandbox 配置） [1]"
    printf "\n> "
    read ENV_REPLY
    
    case "$ENV_REPLY" in
        [1]*)
            echo ""
            echo "✓ 保留现有配置"
            echo ""
            echo "╔══════════════════════════════════════════════════════════════╗"
            echo "║        安装完成！🎉                                         ║"
            echo "╚══════════════════════════════════════════════════════════════╝"
            echo ""
            echo "现在运行交互式配置向导？[Y/n]"
            printf "> "
            read REPLY
            case "$REPLY" in
                [Nn]*)
                    echo ""
                    echo "✓ 已跳过配置向导"
                    echo ""
                    echo "稍后可以运行：npx tsx setup/index.ts"
                    echo ""
                    ;;
                *)
                    echo ""
                    echo "正在运行 QwQnanoclaw 配置向导..."
                    echo ""
                    npx tsx setup/index.ts
                    ;;
            esac
            exit 0
            ;;
        *)
            echo ""
            echo "⚠  将继续配置 Docker Sandbox"
            echo ""
            ;;
    esac
fi

echo "是否启用 Docker Sandbox 以增强安全性？(y/N)"
echo ""
echo "什么是 Docker Sandbox？"
echo "  - AI 在 Docker 容器内运行，文件系统隔离"
echo "  - AI 无法修改源代码或敏感文件"
echo "  - 危险命令只影响容器，不影响宿主机"
echo "  - 容器内创建的文件自动同步到宿主机"
echo ""
echo "要求："
echo "  - Docker Desktop 必须已安装并运行"
echo "  - 启动稍慢（需要创建容器）"
echo ""
echo "推荐用于：生产环境"
echo "不需要用于：开发/测试"
echo ""
printf "是否启用 Docker Sandbox？[y/N]: "
read DOCKER_REPLY

case "$DOCKER_REPLY" in
    [Yy]*)
        # Check if Docker is installed
        DOCKER_PATH=$(which docker 2>/dev/null || echo "")
        
        if [ -z "$DOCKER_PATH" ]; then
            echo ""
            echo "⚠ Docker 未安装"
            echo ""
            echo "正在安装 Docker Desktop..."
            echo ""
            
            OS_NAME=$(uname -s)
            
            case "$OS_NAME" in
                Darwin)
                    # macOS
                    BREW_PATH=$(which brew 2>/dev/null || echo "")
                    if [ -n "$BREW_PATH" ]; then
                        echo "通过 Homebrew 安装 Docker Desktop..."
                        brew install --cask docker
                    else
                        echo "未找到 Homebrew。"
                        echo "请手动安装 Docker Desktop："
                        echo "  访问：https://www.docker.com/products/docker-desktop/"
                        echo "  下载并安装 Docker Desktop for Mac"
                        echo ""
                        echo "暂时禁用 Docker Sandbox"
                    fi
                    ;;
                Linux)
                    # Linux
                    echo "正在安装 Docker Engine..."
                    if [ "$(id -u)" = "0" ]; then
                        curl -fsSL https://get.docker.com | bash
                    else
                        curl -fsSL https://get.docker.com | sudo -E bash -
                    fi
                    
                    echo "添加用户 '$USER' 到 docker 组..."
                    sudo usermod -aG docker "$USER"
                    echo "✓ Docker 已安装，请注销并重新登录以使组更改生效"
                    ;;
                *)
                    echo "不支持的操作系统：$OS_NAME"
                    echo "请手动安装 Docker Desktop："
                    echo "  https://www.docker.com/products/docker-desktop/"
                    echo ""
                    echo "暂时禁用 Docker Sandbox"
                    ;;
            esac
            
            DOCKER_INSTALLED=false
        else
            # Docker is installed, check if it's running
            if docker info >/dev/null 2>&1; then
                DOCKER_INSTALLED=true
                echo "✓ Docker 已安装并运行"
            else
                echo "⚠ Docker 已安装但未运行"
                echo "  请启动 Docker Desktop 并重新运行此安装程序"
                echo ""
                echo "暂时禁用 Docker Sandbox"
                DOCKER_INSTALLED=false
            fi
        fi
        
        if [ "$DOCKER_INSTALLED" = true ]; then
            echo ""
            echo "✓ Docker 已就绪"
            echo ""
            echo "正在配置 .env 以启用 Docker Sandbox 模式..."
            
            # Update .env to enable Docker Sandbox
            if [ -f ".env" ]; then
                # Remove any existing NATIVE_MODE and QWEN_SANDBOX_TYPE lines
                sed -i.bak '/^NATIVE_MODE=/d' .env
                sed -i.bak '/^QWEN_SANDBOX_TYPE=/d' .env
                sed -i.bak '/^# NATIVE_MODE=/d' .env
                sed -i.bak '/^# QWEN_SANDBOX_TYPE=/d' .env
                rm -f .env.bak
                
                # Add Docker Sandbox configuration
                echo "NATIVE_MODE=false" >> .env
                echo "QWEN_SANDBOX_TYPE=docker" >> .env
                echo "QWEN_SANDBOX_WORKSPACE=/workspace/group" >> .env
                
                echo "✓ .env 已配置为 Docker Sandbox 模式"
            fi
        else
            # Docker not available, keep native mode
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
        # User declined Docker Sandbox
        echo ""
        echo "✓ 已选择原生模式（无 Docker 隔离）"
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
echo "║        安装完成！🎉                                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "现在运行交互式配置向导？[Y/n]"
printf "> "
read REPLY

case "$REPLY" in
    [Nn]*)
        echo ""
        echo "✓ 安装完成！"
        echo ""
        echo "您可以稍后运行配置向导："
        echo "   npx tsx setup/index.ts"
        echo ""
        ;;
    *)
        echo ""
        echo "正在运行 QwQnanoclaw 配置向导..."
        npx tsx setup/index.ts
        ;;
esac

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          感谢您安装使用 QwQnanoclaw！🎉                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
