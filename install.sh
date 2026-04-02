#!/bin/bash

# QwQnanoclaw Installer for Unix/Linux/macOS
# This script installs Node.js (if needed) and runs the QwQnanoclaw setup

set -e

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         QwQnanoclaw Installer                                   ║"
echo "║         Your Personal AI Assistant                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if Node.js is installed
NODE_PATH=$(which node 2>/dev/null || echo "")

if [ -z "$NODE_PATH" ]; then
    echo "📦 Node.js is not installed"
    echo ""
    
    # Detect OS using uname
    OS_NAME=$(uname -s)
    
    case "$OS_NAME" in
        Darwin)
            # macOS
            BREW_PATH=$(which brew 2>/dev/null || echo "")
            if [ -n "$BREW_PATH" ]; then
                echo "Installing Node.js via Homebrew..."
                brew install node@22
            else
                echo "Homebrew not found. Please install Node.js manually:"
                echo "  1. Visit: https://nodejs.org/"
                echo "  2. Download and install Node.js LTS (v22+)"
                echo "  3. Re-run this installer"
                exit 1
            fi
            ;;
        Linux)
            # Linux
            echo "Installing Node.js 22 LTS..."
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
            echo "Unsupported OS: $OS_NAME"
            echo "Please install Node.js manually from https://nodejs.org/"
            exit 1
            ;;
    esac
    
    echo "✓ Node.js installed"
    echo ""
fi

# Check Node.js version
NODE_VERSION=$(node --version)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | tr -d 'v')

if [ "$NODE_MAJOR" -lt 20 ]; then
    echo "✗ Node.js version $NODE_VERSION is too old"
    echo "  Required: Node.js 20+"
    echo "  Please upgrade Node.js"
    exit 1
fi

echo "✓ Node.js $NODE_VERSION is installed"
echo ""

# Check if running from project directory
if [ ! -f "package.json" ]; then
    echo "✗ Please run this script from the QwQnanoclaw project directory"
    exit 1
fi

# Install dependencies
echo "📦 Installing project dependencies..."
npm install
echo "✓ Dependencies installed"
echo ""

# Create .env if needed
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "✓ .env file created"
    echo "⚠ Please edit .env with your configuration"
    echo ""
fi

# Ask about Docker Sandbox mode
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           Docker Sandbox Configuration                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Enable Docker Sandbox for enhanced security? (y/N)"
echo ""
echo "What is Docker Sandbox?"
echo "  - AI runs inside Docker containers with isolated filesystem"
echo "  - AI cannot modify source code or sensitive files"
echo "  - Dangerous commands only affect the container, not your host"
echo "  - Files created in container auto-sync to host"
echo ""
echo "Requirements:"
echo "  - Docker Desktop must be installed and running"
echo "  - Slightly slower startup (container creation)"
echo ""
echo "Recommended for: Production environments"
echo "Not needed for: Development/testing"
echo ""
printf "Enable Docker Sandbox? [y/N]: "
read DOCKER_REPLY

case "$DOCKER_REPLY" in
    [Yy]*)
        # Check if Docker is installed
        DOCKER_PATH=$(which docker 2>/dev/null || echo "")
        
        if [ -z "$DOCKER_PATH" ]; then
            echo ""
            echo "⚠ Docker is not installed"
            echo ""
            echo "Installing Docker Desktop..."
            echo ""
            
            OS_NAME=$(uname -s)
            
            case "$OS_NAME" in
                Darwin)
                    # macOS
                    BREW_PATH=$(which brew 2>/dev/null || echo "")
                    if [ -n "$BREW_PATH" ]; then
                        echo "Installing Docker Desktop via Homebrew..."
                        brew install --cask docker
                    else
                        echo "Homebrew not found."
                        echo "Please install Docker Desktop manually:"
                        echo "  Visit: https://www.docker.com/products/docker-desktop/"
                        echo "  Download and install Docker Desktop for Mac"
                        echo ""
                        echo "For now, Docker Sandbox will be disabled."
                    fi
                    ;;
                Linux)
                    # Linux
                    echo "Installing Docker Engine..."
                    if [ "$(id -u)" = "0" ]; then
                        curl -fsSL https://get.docker.com | bash
                    else
                        curl -fsSL https://get.docker.com | sudo -E bash -
                    fi
                    
                    echo "Adding user '$USER' to docker group..."
                    sudo usermod -aG docker "$USER"
                    echo "✓ Docker installed. Please log out and back in for group changes to take effect."
                    ;;
                *)
                    echo "Unsupported OS: $OS_NAME"
                    echo "Please install Docker Desktop manually from:"
                    echo "  https://www.docker.com/products/docker-desktop/"
                    echo ""
                    echo "For now, Docker Sandbox will be disabled."
                    ;;
            esac
            
            DOCKER_INSTALLED=false
        else
            # Docker is installed, check if it's running
            if docker info >/dev/null 2>&1; then
                DOCKER_INSTALLED=true
                echo "✓ Docker is installed and running"
            else
                echo "⚠ Docker is installed but not running"
                echo "  Please start Docker Desktop and re-run this installer"
                echo ""
                echo "For now, Docker Sandbox will be disabled."
                DOCKER_INSTALLED=false
            fi
        fi
        
        if [ "$DOCKER_INSTALLED" = true ]; then
            echo ""
            echo "✓ Docker is ready"
            echo ""
            echo "Configuring .env for Docker Sandbox mode..."
            
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
                
                echo "✓ .env configured for Docker Sandbox"
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
        echo "✓ Native mode selected (no Docker isolation)"
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

echo "Run the interactive setup wizard now? [Y/n]"
printf "> "
read REPLY

case "$REPLY" in
    [Nn]*)
        echo ""
        echo "✓ Installation complete!"
        echo ""
        echo "You can run the setup wizard later with:"
        echo "   npx tsx setup/index.ts"
        echo ""
        ;;
    *)
        echo ""
        echo "🚀 Running QwQnanoclaw setup wizard..."
        npx tsx setup/index.ts
        ;;
esac

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              Installation Complete! 🎉                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
