# QwQnanoclaw Installer for Windows PowerShell
# This script installs Node.js (if needed) and runs the QwQnanoclaw setup

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗"
Write-Host "║         QwQnanoclaw Installer                                   ║"
Write-Host "║         Your Personal AI Assistant                           ║"
Write-Host "╚══════════════════════════════════════════════════════════════╝"
Write-Host ""

# Check if Node.js is installed
$nodeInstalled = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeInstalled) {
    Write-Host "📦 Node.js is not installed"
    Write-Host ""
    
    # Try winget first
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        Write-Host "Installing Node.js via winget..."
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    } else {
        Write-Host "winget not available. Please install Node.js manually:"
        Write-Host "  1. Visit: https://nodejs.org/"
        Write-Host "  2. Download and install Node.js LTS (v22+)"
        Write-Host "  3. Re-run this installer"
        exit 1
    }
    
    Write-Host "✓ Node.js installed"
    Write-Host ""
}

# Check Node.js version
$nodeVersion = node --version
$nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')

if ($nodeMajor -lt 20) {
    Write-Host "✗ Node.js version $nodeVersion is too old"
    Write-Host "  Required: Node.js 20+"
    Write-Host "  Please upgrade Node.js"
    exit 1
}

Write-Host "✓ Node.js $nodeVersion is installed"
Write-Host ""

# Check if running from project directory
if (-not (Test-Path "package.json")) {
    Write-Host "✗ Please run this script from the QwQnanoclaw project directory"
    exit 1
}

# Install dependencies
Write-Host "📦 Installing project dependencies..."
npm install
Write-Host "✓ Dependencies installed"
Write-Host ""

# Create .env if needed
if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
    Write-Host "📝 Creating .env file..."
    Copy-Item .env.example .env
    Write-Host "✓ .env file created"
    Write-Host "⚠ Please edit .env with your configuration"
    Write-Host ""
}

# Run setup wizard
Write-Host "╔══════════════════════════════════════════════════════════════╗"
Write-Host "║              Prerequisites Complete                          ║"
Write-Host "╚══════════════════════════════════════════════════════════════╝"
Write-Host ""

$runSetup = Read-Host "Run the interactive setup wizard now? [Y/n]"
Write-Host ""

if ($runSetup -eq "" -or $runSetup -eq "Y" -or $runSetup -eq "y") {
    Write-Host ""
    Write-Host "🚀 Running QwQnanoclaw setup wizard..."
    npx tsx setup/index.ts
} else {
    Write-Host ""
    Write-Host "✓ Installation complete!"
    Write-Host ""
    Write-Host "You can run the setup wizard later with:"
    Write-Host "   npx tsx setup/index.ts"
    Write-Host ""
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗"
Write-Host "║              Installation Complete! 🎉                       ║"
Write-Host "╚══════════════════════════════════════════════════════════════╝"
Write-Host ""
