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
if ! command -v node &> /dev/null; then
    echo "📦 Node.js is not installed"
    echo ""
    
    # Detect OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            echo "Installing Node.js via Homebrew..."
            brew install node@22
        else
            echo "Homebrew not found. Please install Node.js manually:"
            echo "  1. Visit: https://nodejs.org/"
            echo "  2. Download and install Node.js LTS (v22+)"
            echo "  3. Re-run this installer"
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        echo "Installing Node.js 22 LTS..."
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        echo "Unsupported OS: $OSTYPE"
        echo "Please install Node.js manually from https://nodejs.org/"
        exit 1
    fi
    
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

# Run setup wizard
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              Prerequisites Complete                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

read -p "Run the interactive setup wizard now? [Y/n] " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    echo ""
    echo "🚀 Running QwQnanoclaw setup wizard..."
    npx tsx setup/index.ts
else
    echo ""
    echo "✓ Installation complete!"
    echo ""
    echo "You can run the setup wizard later with:"
    echo "   npx tsx setup/index.ts"
    echo ""
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              Installation Complete! 🎉                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
