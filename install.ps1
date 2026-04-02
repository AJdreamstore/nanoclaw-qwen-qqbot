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

# Build project (compile TypeScript)
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗"
Write-Host "║           Building Project                                   ║"
Write-Host "╚══════════════════════════════════════════════════════════════╝"
Write-Host ""
Write-Host "🔨 Building project..."
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Build successful!"
} else {
    Write-Host "✗ Build failed!"
    Write-Host "  You can manually rebuild later: npm run build"
    Write-Host ""
    $continueSetup = Read-Host "Continue with setup anyway? [y/N]"
    if ($continueSetup -ne "Y" -and $continueSetup -ne "y") {
        Write-Host "Installation aborted."
        exit 1
    }
}
Write-Host ""

# Ask about Docker Sandbox mode
Write-Host "╔══════════════════════════════════════════════════════════════╗"
Write-Host "║           Docker Sandbox Configuration                       ║"
Write-Host "╚══════════════════════════════════════════════════════════════╝"
Write-Host ""
Write-Host "Docker Sandbox mode provides better isolation and security."
Write-Host "Each QQ group runs in a separate Docker container."
Write-Host ""
Write-Host "Benefits:"
Write-Host "  ✓ Isolated execution environment"
Write-Host "  ✓ Enhanced security"
Write-Host "  ✓ Clean file system access"
Write-Host ""
Write-Host "Requirements:"
Write-Host "  - Docker Desktop (Windows/macOS) or Docker CE (Linux)"
Write-Host "  - At least 2GB available memory"
Write-Host ""
$useDocker = Read-Host "Do you want to use Docker Sandbox mode? [y/N]"
Write-Host ""

if ($useDocker -eq "Y" -or $useDocker -eq "y") {
    Write-Host "Configuring Docker Sandbox mode..."
    
    # Check if Docker is installed
    $dockerInstalled = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $dockerInstalled) {
        Write-Host "✗ Docker is not installed"
        Write-Host ""
        Write-Host "Please install Docker Desktop:"
        Write-Host "  1. Visit: https://www.docker.com/products/docker-desktop/"
        Write-Host "  2. Download and install Docker Desktop"
        Write-Host "  3. Start Docker Desktop"
        Write-Host "  4. Re-run this installer"
        Write-Host ""
        Write-Host "Or switch to Native mode (no Docker required)"
        exit 1
    }
    
    # Check if Docker is running
    try {
        docker ps | Out-Null
        Write-Host "✓ Docker is installed and running"
    } catch {
        Write-Host "✗ Docker is not running"
        Write-Host "  Please start Docker Desktop and re-run this installer"
        exit 1
    }
    
    # Update .env file
    if (Test-Path ".env") {
        $envContent = Get-Content ".env" -Raw
        $envContent = $envContent -replace 'NATIVE_MODE=.*', 'NATIVE_MODE=false'
        Set-Content ".env" $envContent
        Write-Host "✓ Docker Sandbox mode enabled in .env"
    }
    
    Write-Host ""
    Write-Host "Note: Container image will be built during first run or setup wizard"
    Write-Host ""
} else {
    Write-Host "Using Native mode (Qwen Code runs locally)"
    Write-Host ""
    
    # Update .env file
    if (Test-Path ".env") {
        $envContent = Get-Content ".env" -Raw
        $envContent = $envContent -replace 'NATIVE_MODE=.*', 'NATIVE_MODE=true'
        Set-Content ".env" $envContent
        Write-Host "✓ Native mode enabled in .env"
    }
}
Write-Host ""

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
