# QwQnanoclaw Installer for Windows PowerShell
# This script installs Node.js (if needed) and runs the QwQnanoclaw setup

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗"
Write-Host "║         QwQnanoclaw 安装程序                                   ║"
Write-Host "║         您的个人 AI 助手                                        ║"
Write-Host "╚══════════════════════════════════════════════════════════════╝"
Write-Host ""

# Check if Node.js is installed
$nodeInstalled = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeInstalled) {
    Write-Host "📦 Node.js 未安装"
    Write-Host ""
    
    # Try winget first
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        Write-Host "通过 winget 安装 Node.js..."
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    } else {
        Write-Host "未找到 winget。请手动安装 Node.js："
        Write-Host "  1. 访问：https://nodejs.org/"
        Write-Host "  2. 下载并安装 Node.js LTS (v22+)"
        Write-Host "  3. 重新运行此安装程序"
        exit 1
    }
    
    Write-Host "✓ Node.js 已安装"
    Write-Host ""
}

# Check Node.js version
$nodeVersion = node --version
$nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')

if ($nodeMajor -lt 20) {
    Write-Host "✗ Node.js 版本过旧：$nodeVersion"
    Write-Host "  需要：Node.js 20+"
    Write-Host "  请升级 Node.js"
    exit 1
}

Write-Host "✓ Node.js $nodeVersion 已安装"
Write-Host ""

# Check if running from project directory
if (-not (Test-Path "package.json")) {
    Write-Host "✗ 请在 QwQnanoclaw 项目目录中运行此脚本"
    exit 1
}

# Install dependencies
Write-Host "📦 安装项目依赖..."
npm install
Write-Host "✓ 依赖已安装"
Write-Host ""

# Create .env if needed
if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
    Write-Host "📝 创建 .env 文件..."
    Copy-Item .env.example .env
    Write-Host "✓ .env 文件已创建"
    Write-Host "⚠ 请编辑 .env 文件进行配置"
    Write-Host ""
}

# Build project (compile TypeScript)
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗"
Write-Host "║           构建项目                                            ║"
Write-Host "╚══════════════════════════════════════════════════════════════╝"
Write-Host ""
Write-Host "🔨 构建项目..."
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ 构建成功！"
} else {
    Write-Host "✗ 构建失败！"
    Write-Host "  您可以稍后手动构建：npm run build"
    Write-Host ""
    $continueSetup = Read-Host "仍然继续配置？[y/N]"
    if ($continueSetup -ne "Y" -and $continueSetup -ne "y") {
        Write-Host "安装已中止。"
        exit 1
    }
}
Write-Host ""

# Check Qwen Code installation
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗"
Write-Host "║           检查 Qwen Code                                      ║"
Write-Host "╚══════════════════════════════════════════════════════════════╝"
Write-Host ""

# Check if Qwen Code is installed
$qwenInstalled = Get-Command qwen -ErrorAction SilentlyContinue
if ($qwenInstalled) {
    $qwenVersion = qwen --version 2>&1 | Select-Object -First 1
    Write-Host "✓ Qwen Code 已安装：$qwenVersion"
} else {
    Write-Host "⚠ Qwen Code 未安装"
    Write-Host ""
    Write-Host "正在安装 Qwen Code..."
    npm install -g @qwen-code/qwen-code
    
    $qwenInstalled = Get-Command qwen -ErrorAction SilentlyContinue
    if ($qwenInstalled) {
        Write-Host "✓ Qwen Code 安装成功"
    } else {
        Write-Host "✗ 安装 Qwen Code 失败"
        Write-Host "  请运行：npm install -g @qwen-code/qwen-code"
        Write-Host ""
        $continueSetup = Read-Host "仍然继续配置？[y/N]"
        if ($continueSetup -ne "Y" -and $continueSetup -ne "y") {
            Write-Host "安装已中止。"
            exit 1
        }
    }
}
Write-Host ""

# Check and configure Qwen Code skills (agent-browser)
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗"
Write-Host "║           配置 Qwen Code 技能                                   ║"
Write-Host "╚══════════════════════════════════════════════════════════════╝"
Write-Host ""

# Check if agent-browser is installed
$agentBrowserInstalled = Get-Command agent-browser -ErrorAction SilentlyContinue
if ($agentBrowserInstalled) {
    Write-Host "✓ agent-browser 已安装"
} else {
    Write-Host "⚠ agent-browser 未安装"
    Write-Host ""
    Write-Host "正在安装 agent-browser..."
    npm install -g agent-browser
    
    $agentBrowserInstalled = Get-Command agent-browser -ErrorAction SilentlyContinue
    if ($agentBrowserInstalled) {
        Write-Host "✓ agent-browser 安装成功"
        
        Write-Host ""
        Write-Host "正在运行 agent-browser install..."
        agent-browser install
        
        Write-Host "✓ agent-browser 已配置"
    } else {
        Write-Host "✗ 安装 agent-browser 失败"
        Write-Host "  您可以稍后手动安装：npm install -g agent-browser"
    }
}

# Configure Qwen Code skills
$qwenConfigDir = Join-Path $env:USERPROFILE ".qwen"
$agentBrowserSkillDir = Join-Path $qwenConfigDir "skills\agent-browser"
$qwenSettingsPath = Join-Path $qwenConfigDir "settings.json"

if ((Test-Path $agentBrowserSkillDir) -and (Test-Path (Join-Path $agentBrowserSkillDir "SKILL.md"))) {
    Write-Host "✓ agent-browser 技能已配置"
} else {
    Write-Host "⚠ agent-browser 技能未配置"
    Write-Host ""
    Write-Host "正在为 Qwen Code 配置 agent-browser 技能..."
    
    # Create skills directory
    if (-not (Test-Path $agentBrowserSkillDir)) {
        New-Item -ItemType Directory -Path $agentBrowserSkillDir -Force | Out-Null
    }
    
    # Get agent-browser global path
    $npmRoot = npm root -g
    $agentBrowserPath = Join-Path $npmRoot "agent-browser"
    
    if (Test-Path (Join-Path $agentBrowserPath "SKILL.md")) {
        # Copy SKILL.md to Qwen config directory
        Copy-Item (Join-Path $agentBrowserPath "SKILL.md") $agentBrowserSkillDir
        Write-Host "✓ SKILL.md 已复制"
    }
    
    # Update Qwen Code settings.json
    if (Test-Path $qwenSettingsPath) {
        # Read and update settings
        $settings = Get-Content $qwenSettingsPath -Raw | ConvertFrom-Json
        
        if (-not $settings.tools) { $settings.tools = [PSCustomObject]@{} }
        if (-not $settings.tools.experimental) { $settings.tools.experimental = [PSCustomObject]@{} }
        $settings.tools.experimental.skills = $true
        
        if (-not $settings.tools.allowed) { $settings.tools.allowed = @() }
        if ("web_fetch" -notin $settings.tools.allowed) {
            $settings.tools.allowed += "web_fetch"
        }
        if ("agent-browser" -notin $settings.tools.allowed) {
            $settings.tools.allowed += "agent-browser"
        }
        
        $settings | ConvertTo-Json -Depth 10 | Set-Content $qwenSettingsPath -Force
        Write-Host "✓ Qwen Code 设置已更新"
    } else {
        # Create settings.json
        $settings = @{
            tools = @{
                experimental = @{
                    skills = $true
                }
                allowed = @("web_fetch", "agent-browser")
            }
        }
        $settings | ConvertTo-Json -Depth 10 | Set-Content $qwenSettingsPath -Force
        Write-Host "✓ Qwen Code settings.json 已创建"
    }
    
    Write-Host "✓ agent-browser 技能已为 Qwen Code 配置"
}
Write-Host ""

# Ask about Docker Sandbox mode
Write-Host "╔══════════════════════════════════════════════════════════════╗"
Write-Host "║           Docker Sandbox 配置                                   ║"
Write-Host "╚══════════════════════════════════════════════════════════════╝"
Write-Host ""

# Check if .env file exists
if (Test-Path ".env") {
    Write-Host "⚠  检测到已存在的配置文件 .env"
    Write-Host ""
    Write-Host "这可能是："
    Write-Host "  1. 之前安装过，现在重新运行安装脚本"
    Write-Host "  2. 手动创建或修改了配置文件"
    Write-Host ""
    Write-Host "请选择操作："
    Write-Host "  1. 保留现有配置（跳过 Docker Sandbox 配置） [1]"
    $envReply = Read-Host "> "
    
    if ($envReply -eq "1") {
        Write-Host ""
        Write-Host "✓ 保留现有配置"
        Write-Host ""
        Write-Host "╔══════════════════════════════════════════════════════════════╗"
        Write-Host "║        安装完成！🎉                                         ║"
        Write-Host "╚══════════════════════════════════════════════════════════════╝"
        Write-Host ""
        $runWizard = Read-Host "现在运行交互式配置向导？[Y/n]"
        
        if ($runWizard -ne "N" -and $runWizard -ne "n") {
            Write-Host ""
            Write-Host "正在运行 QwQnanoclaw 配置向导..."
            Write-Host ""
            npx tsx setup/index.ts
        } else {
            Write-Host ""
            Write-Host "✓ 已跳过配置向导"
            Write-Host ""
            Write-Host "稍后可以运行：npx tsx setup/index.ts"
            Write-Host ""
        }
        exit 0
    } else {
        Write-Host ""
        Write-Host "⚠  将继续配置 Docker Sandbox"
        Write-Host ""
    }
}

Write-Host "是否启用 Docker Sandbox 以增强安全性？(y/N)"
Write-Host ""
Write-Host "什么是 Docker Sandbox？"
Write-Host "  - AI 在 Docker 容器内运行，文件系统隔离"
Write-Host "  - AI 无法修改源代码或敏感文件"
Write-Host "  - 危险命令只影响容器，不影响宿主机"
Write-Host "  - 容器内创建的文件自动同步到宿主机"
Write-Host ""
Write-Host "要求："
Write-Host "  - Docker Desktop 必须已安装并运行"
Write-Host "  - 启动稍慢（需要创建容器）"
Write-Host ""
Write-Host "推荐用于：生产环境"
Write-Host "不需要用于：开发/测试"
Write-Host ""
$useDocker = Read-Host "是否启用 Docker Sandbox？[y/N]"
Write-Host ""

if ($useDocker -eq "Y" -or $useDocker -eq "y") {
    Write-Host "正在配置 Docker Sandbox 模式..."
    
    # Check if Docker is installed
    $dockerInstalled = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $dockerInstalled) {
        Write-Host "✗ Docker 未安装"
        Write-Host ""
        Write-Host "请安装 Docker Desktop："
        Write-Host "  1. 访问：https://www.docker.com/products/docker-desktop/"
        Write-Host "  2. 下载并安装 Docker Desktop"
        Write-Host "  3. 启动 Docker Desktop"
        Write-Host "  4. 重新运行此安装程序"
        Write-Host ""
        Write-Host "或者切换到原生模式（不需要 Docker）"
        exit 1
    }
    
    # Check if Docker is running
    try {
        docker ps | Out-Null
        Write-Host "✓ Docker 已安装并运行"
    } catch {
        Write-Host "✗ Docker 未运行"
        Write-Host "  请启动 Docker Desktop 并重新运行此安装程序"
        exit 1
    }
    
    # Update .env file - clean up duplicates and set Docker mode
    if (Test-Path ".env") {
        # Read and clean .env file
        $lines = Get-Content ".env"
        $filteredLines = $lines | Where-Object { 
            $_ -notmatch '^NATIVE_MODE=' -and 
            $_ -notmatch '^QWEN_SANDBOX_TYPE=' -and 
            $_ -notmatch '^QWEN_SANDBOX_WORKSPACE=' -and
            $_ -notmatch '^#.*NATIVE_MODE=' -and 
            $_ -notmatch '^#.*QWEN_SANDBOX_TYPE=' -and 
            $_ -notmatch '^#.*QWEN_SANDBOX_WORKSPACE='
        }
        
        # Add Docker configuration
        $filteredLines += "NATIVE_MODE=false"
        $filteredLines += "QWEN_SANDBOX_TYPE=docker"
        $filteredLines += "QWEN_SANDBOX_WORKSPACE=/workspace/group"
        
        # Write back to .env
        $filteredLines | Set-Content ".env"
        Write-Host "✓ .env 已配置为 Docker Sandbox 模式"
        Write-Host ""
        
        # Pull Docker image immediately
        Write-Host "╔══════════════════════════════════════════════════════════════╗"
        Write-Host "║        拉取 Docker Sandbox 镜像                                   ║"
        Write-Host "╚══════════════════════════════════════════════════════════════╝"
        Write-Host ""
        
        # Get Qwen Code version
        try {
            $QWEN_VERSION = & qwen --version 2>&1 | Select-Object -First 1
        } catch {
            $QWEN_VERSION = "latest"
        }
        
        if ([string]::IsNullOrWhiteSpace($QWEN_VERSION)) {
            $QWEN_VERSION = "latest"
        }
        
        Write-Host "✓ Qwen Code 版本：$QWEN_VERSION"
        Write-Host ""
        
        # Check if image already exists
        $existingImage = docker images --format "{{.Repository}}:{{.Tag}}" | Where-Object { $_ -like "ghcr.io/qwenlm/qwen-code*$QWEN_VERSION*" }
        
        if ($existingImage) {
            Write-Host "✓ Docker Sandbox 镜像已存在"
            Write-Host ""
            docker images | Select-String "qwenlm"
            
            # Record the image in .env
            Add-Content ".env" "QWEN_SANDBOX_IMAGE=ghcr.io/qwenlm/qwen-code:$QWEN_VERSION"
        } else {
            # Try to pull the specific version first
            Write-Host "正在拉取 Docker Sandbox 镜像 ghcr.io/qwenlm/qwen-code:$QWEN_VERSION ..."
            Write-Host ""
            
            # Try version-specific pull (suppress error output)
            $versionPull = docker pull "ghcr.io/qwenlm/qwen-code:$QWEN_VERSION" 2>&1
            
            if (-not $?) {
                # Version-specific pull failed, try latest
                Write-Host ""
                Write-Host "⚠ 版本 $QWEN_VERSION 的镜像不存在，尝试拉取 latest 版本..."
                Write-Host ""
                
                if (docker pull "ghcr.io/qwenlm/qwen-code:latest") {
                    Write-Host ""
                    Write-Host "✓ Docker Sandbox 镜像拉取成功（latest 版本）！"
                    Write-Host ""
                    docker images | Select-String "qwenlm"
                    
                    # Record latest in .env
                    Add-Content ".env" "QWEN_SANDBOX_IMAGE=ghcr.io/qwenlm/qwen-code:latest"
                } else {
                    Write-Host ""
                    Write-Host "⚠ Docker Sandbox 镜像拉取失败"
                    Write-Host ""
                    Write-Host "可能的原因："
                    Write-Host "  1. 网络连接问题（无法访问 ghcr.io）"
                    Write-Host "  2. 镜像版本不存在"
                    Write-Host ""
                    Write-Host "建议："
                    Write-Host "  1. 检查网络连接"
                    Write-Host "  2. 配置 Docker 镜像加速器"
                    Write-Host "  3. 或者选择原生模式（不使用 Docker Sandbox）"
                    Write-Host ""
                    $continue = Read-Host "是否继续？（镜像拉取失败，但仍可运行，只是无法使用 Docker Sandbox）[Y/n]"
                    
                    if ($continue -eq "N" -or $continue -eq "n") {
                        Write-Host ""
                        Write-Host "✗ 安装已取消"
                        exit 1
                    } else {
                        Write-Host ""
                        Write-Host "✓ 继续安装（Docker Sandbox 可能无法使用）"
                    }
                }
            } else {
                # Version-specific pull succeeded
                Write-Host ""
                Write-Host "✓ Docker Sandbox 镜像拉取成功！"
                Write-Host ""
                docker images | Select-String "qwenlm"
                
                # Record the image in .env
                Add-Content ".env" "QWEN_SANDBOX_IMAGE=ghcr.io/qwenlm/qwen-code:$QWEN_VERSION"
            }
        }
        
        Write-Host ""
    }
    
    Write-Host ""
    Write-Host "注意：容器镜像已准备就绪"
    Write-Host ""
} else {
    Write-Host "使用原生模式（Qwen Code 本地运行）"
    Write-Host ""
    
    # Update .env file
    if (Test-Path ".env") {
        $envContent = Get-Content ".env" -Raw
        $envContent = $envContent -replace 'NATIVE_MODE=.*', 'NATIVE_MODE=true'
        Set-Content ".env" $envContent
        Write-Host "✓ .env 已配置为原生模式"
    }
}
Write-Host ""

# Run setup wizard
Write-Host "╔══════════════════════════════════════════════════════════════╗"
Write-Host "║              前置条件已完成                                   ║"
Write-Host "╚══════════════════════════════════════════════════════════════╝"
Write-Host ""

$runSetup = Read-Host "现在运行交互式配置向导？[Y/n]"
Write-Host ""

if ($runSetup -eq "" -or $runSetup -eq "Y" -or $runSetup -eq "y") {
    Write-Host ""
    Write-Host "正在运行 QwQnanoclaw 配置向导..."
    npx tsx setup/index.ts
} else {
    Write-Host ""
    Write-Host "✓ 安装完成！"
    Write-Host ""
    Write-Host "您可以稍后运行配置向导："
    Write-Host "   npx tsx setup/index.ts"
    Write-Host ""
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗"
Write-Host "║          感谢您安装使用 QwQnanoclaw！🎉                    ║"
Write-Host "╚══════════════════════════════════════════════════════════════╝"
Write-Host ""
