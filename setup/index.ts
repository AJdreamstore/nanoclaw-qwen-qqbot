/**
 * Setup CLI entry point.
 * Usage: 
 *   npx tsx setup/index.ts                    # Interactive wizard 
 *   npx tsx setup/index.ts --step <name>     # Run specific step
 */
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../src/logger.js';
import { emitStatus } from './status.js';

const PROGRESS_FILE = path.join(process.cwd(), '.setup-progress');

/**
 * Save installation progress
 */
function saveProgress(step: string): void {
  try {
    fs.writeFileSync(PROGRESS_FILE, step, 'utf-8');
  } catch (err) {
    // Ignore errors - progress tracking is optional
  }
}

/**
 * Get current installation progress
 */
function getProgress(): string | null {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return fs.readFileSync(PROGRESS_FILE, 'utf-8').trim();
    }
  } catch (err) {
    // Ignore errors
  }
  return null;
}

/**
 * Clear installation progress
 */
function clearProgress(): void {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
    }
  } catch (err) {
    // Ignore errors
  }
}

const STEPS: Record<string, () => Promise<{ run: (args: string[]) => Promise<void> }>> = {
  environment: () => import('./environment.js'),
  container: () => import('./container.js'),
  'whatsapp-auth': () => import('./whatsapp-auth.js'),
  groups: () => import('./groups.js'),
  'groups-interactive': () => import('./groups-interactive.js'),
  register: () => import('./register.js'),
  mounts: () => import('./mounts.js'),
  service: () => import('./service.js'),
  'agent-browser': () => import('./agent-browser.js'),
  'qwen-skills': () => import('./qwen-skills.js'),
  reset: () => import('./reset.js'),
  verify: () => import('./verify.js'),
};

/**
 * Interactive setup wizard
 */
async function interactiveWizard(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, (answer) => resolve(answer));
    });
  };

  const yesNo = (query: string, defaultYes: boolean = true): Promise<boolean> => {
    return new Promise((resolve) => {
      rl.question(query + (defaultYes ? ' [Y/n] ' : ' [y/N] '), (answer) => {
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          resolve(true);
        } else if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
          resolve(false);
        } else {
          resolve(defaultYes);
        }
      });
    });
  };

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║           Welcome to QwQnanoclaw Setup Wizard                  ║');
  console.log('║        Your Personal AI Assistant Setup                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  // Check if running in interactive mode or specific step mode
  const runMode = await question('请选择运行模式：\n  1. 完整安装向导\n  2. 单步配置\n  3. 重置数据\n  4. 验证安装\n  0. 退出\n\n请输入选项 (0-4): ');
  
  if (runMode.trim() === '3') {
    // Run reset step
    console.log('\n启动重置向导...\n');
    const resetModule = await STEPS.reset();
    await resetModule.run([]);
    return;
  }
  
  if (runMode.trim() === '4') {
    // Run verify step
    console.log('\n启动验证程序...\n');
    const verifyModule = await STEPS.verify();
    await verifyModule.run([]);
    return;
  }
  
  if (runMode.trim() === '0' || runMode.trim() === '2') {
    console.log('\n使用 --step 参数运行单步配置：');
    console.log('  npx tsx setup/index.ts --step environment');
    console.log('  npx tsx setup/index.ts --step container');
    console.log('  npx tsx setup/index.ts --step groups');
    console.log('  npx tsx setup/index.ts --step qwen-skills');
    console.log('  npx tsx setup/index.ts --step reset\n');
    process.exit(0);
  }
  
  // Otherwise run full wizard (option 1)

  try {
    // Step 1: Platform detection
    console.log('📋 Step 1/6: Detecting platform...');
    const platform = process.platform;
    const isWindows = platform === 'win32';
    const isLinux = platform === 'linux';
    const isMac = platform === 'darwin';
    console.log(`   ✓ Platform: ${isWindows ? 'Windows' : isLinux ? 'Linux' : isMac ? 'macOS' : platform}`);

    // Step 2: Check Node.js
    console.log('\n📋 Step 2/6: Checking Node.js...');
    const nodeVersion = process.version;
    const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    if (nodeMajor < 20) {
      console.error(`   ✗ Node.js version ${nodeVersion} is too old. Please upgrade to Node.js 20+`);
      process.exit(1);
    }
    console.log(`   ✓ Node.js ${nodeVersion}`);

    // Step 3: Check dependencies
    console.log('\n📋 Step 3/6: Checking dependencies...');
    const fs = await import('fs');
    const path = await import('path');
    const nodeModulesPath = path.join(process.cwd(), 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      console.log('   ⚠ Dependencies not installed. Running npm install...');
      const { execSync } = await import('child_process');
      try {
        execSync('npm install', { stdio: 'inherit' });
        console.log('   ✓ Dependencies installed');
      } catch (err) {
        console.error('   ✗ Failed to install dependencies');
        throw err;
      }
    } else {
      console.log('   ✓ Dependencies already installed');
    }

    // Step 4: Check .env file
    console.log('\n📋 Step 4/6: Checking configuration...');
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
      console.log('   ⚠ .env file not found. Creating from template...');
      const envExamplePath = path.join(process.cwd(), '.env.example');
      if (fs.existsSync(envExamplePath)) {
        const envContent = fs.readFileSync(envExamplePath, 'utf-8');
        fs.writeFileSync(envPath, envContent);
        console.log('   ✓ .env file created. Please edit it with your configuration.');
      } else {
        console.log('   ⚠ No .env.example found. Skipping .env creation.');
      }
    } else {
      console.log('   ✓ .env file exists');
    }

    // Step 5: Check Qwen Code
    console.log('\n📋 Step 5/8: Checking Qwen Code installation...');
    const { execSync } = await import('child_process');
    const os = await import('os');
    const qwenConfigDir = path.join(os.homedir(), '.qwen');
    let qwenInstalled = false;
    
    try {
      execSync('qwen --version', { stdio: 'ignore' });
      console.log('   ✓ Qwen Code is installed');
      qwenInstalled = true;
      
      // Check Qwen Code configuration
      const qwenSettingsPath = path.join(qwenConfigDir, 'settings.json');
      if (fs.existsSync(qwenSettingsPath)) {
        const settings = JSON.parse(fs.readFileSync(qwenSettingsPath, 'utf-8'));
        const hasTools = settings.tools?.experimental?.skills === true;
        const hasWebFetch = settings.tools?.allowed?.includes('web_fetch');
        
        if (hasTools && hasWebFetch) {
          console.log('   ✓ Qwen Code is properly configured (skills + web_fetch enabled)');
        } else {
          console.log('   ⚠ Qwen Code configuration needs update:');
          if (!hasTools) console.log('      - Missing: tools.experimental.skills = true');
          if (!hasWebFetch) console.log('      - Missing: tools.allowed includes "web_fetch"');
          console.log('   ℹ Run: npx tsx setup/index.ts --step qwen-skills');
        }
      } else {
        console.log('   ⚠ Qwen Code settings not found. Run "npx qwen-code setup" to configure.');
      }
    } catch {
      console.log('   ✗ Qwen Code is not installed');
      console.log('   ℹ Install with: npm install -g @qwen-code/qwen-code');
    }

    // Step 6: Check agent-browser
    console.log('\n📋 Step 6/8: Checking agent-browser...');
    let agentBrowserInstalled = false;
    
    try {
      execSync('agent-browser --version', { stdio: 'ignore' });
      console.log('   ✓ agent-browser is installed');
      agentBrowserInstalled = true;
      
      // Check if skill is configured
      const agentBrowserSkillDir = path.join(qwenConfigDir, 'skills', 'agent-browser');
      if (fs.existsSync(agentBrowserSkillDir) && fs.existsSync(path.join(agentBrowserSkillDir, 'SKILL.md'))) {
        console.log('   ✓ agent-browser skill is configured for Qwen Code');
      } else {
        console.log('   ⚠ agent-browser skill is not configured for Qwen Code');
        console.log('   ℹ Run: npx tsx setup/index.ts --step qwen-skills');
      }
    } catch {
      console.log('   ✗ agent-browser is not installed');
      console.log('   ℹ Run: npx tsx setup/index.ts --step agent-browser');
    }

    // Step 7: Ask about AI features setup
    console.log('\n📋 Step 7/8: AI Features Configuration...');
    const setupAI = await yesNo('   Do you want to install and configure AI web automation features? (recommended)', true);
    
    if (setupAI) {
      if (!agentBrowserInstalled) {
        console.log('\n   Installing agent-browser...');
        try {
          execSync('npm install -g agent-browser', { stdio: 'inherit' });
          console.log('   ✓ agent-browser installed');
          
          console.log('\n   Running agent-browser install...');
          execSync('agent-browser install', { stdio: 'inherit' });
          console.log('   ✓ agent-browser configured');
        } catch (err) {
          console.log('   ⚠ agent-browser installation failed, you can install it manually later');
        }
      }
      
      // Configure Qwen Code skills
      console.log('\n   Configuring Qwen Code skills...');
      try {
        const npmRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim();
        const agentBrowserPath = path.join(npmRoot, 'agent-browser');
        const skillMdSource = path.join(agentBrowserPath, 'SKILL.md');
        const agentBrowserSkillDir = path.join(qwenConfigDir, 'skills', 'agent-browser');
        
        if (!fs.existsSync(agentBrowserSkillDir)) {
          fs.mkdirSync(agentBrowserSkillDir, { recursive: true });
        }
        
        if (fs.existsSync(skillMdSource)) {
          fs.copyFileSync(skillMdSource, path.join(agentBrowserSkillDir, 'SKILL.md'));
          console.log('   ✓ SKILL.md copied');
        }
        
        // Update settings.json
        const qwenSettingsPath = path.join(qwenConfigDir, 'settings.json');
        let settings = {};
        if (fs.existsSync(qwenSettingsPath)) {
          settings = JSON.parse(fs.readFileSync(qwenSettingsPath, 'utf-8'));
        }
        
        if (!(settings as any).tools) (settings as any).tools = {};
        if (!(settings as any).tools.experimental) (settings as any).tools.experimental = {};
        (settings as any).tools.experimental.skills = true;
        
        if (!(settings as any).tools.allowed) (settings as any).tools.allowed = [];
        if (!(settings as any).tools.allowed.includes('web_fetch')) {
          (settings as any).tools.allowed.push('web_fetch');
        }
        if (!(settings as any).tools.allowed.includes('agent-browser')) {
          (settings as any).tools.allowed.push('agent-browser');
        }
        
        fs.writeFileSync(qwenSettingsPath, JSON.stringify(settings, null, 2));
        console.log('   ✓ Qwen Code settings updated');
        console.log('   ✓ AI features configured successfully');
      } catch (err) {
        console.log('   ⚠ Qwen Code configuration failed, you can configure it manually later');
      }
    } else {
      console.log('   ℹ Skipping AI features setup (you can configure them later)');
    }

    // Step 8: Database and storage configuration
    console.log('\n📋 Step 8/8: Database and Storage Configuration...');
    console.log('   ℹ This application uses SQLite (embedded database) for message storage');
    console.log('   ✓ No external database server required');
    console.log('   ✓ Database file will be created automatically at: store/messages.db');
    
    // Ask about database location
    const customDbPath = await yesNo('   Do you want to use a custom database path? (advanced)', false);
    
    if (customDbPath) {
      const dbPath = await question('   Enter custom database path: ');
      if (dbPath.trim()) {
        console.log(`   ✓ Custom database path configured: ${dbPath.trim()}`);
        // Update .env file
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf-8');
          if (!envContent.includes('DATABASE_PATH')) {
            envContent += `\n# Custom database path\nDATABASE_PATH=${dbPath.trim()}\n`;
            fs.writeFileSync(envPath, envContent);
            console.log('   ✓ Updated .env with DATABASE_PATH');
          }
        }
      }
    } else {
      console.log('   ✓ Using default database location: store/messages.db');
    }

    // Step 8.5: Database engine selection
    console.log('\n📋 Step 8.5/9: Database Engine Selection...');
    console.log('   ℹ This application supports two SQLite engines:');
    console.log('      - better-sqlite3: Faster performance, requires compilation (Node.js native module)');
    console.log('      - sql.js: Pure JavaScript, no compilation needed, works everywhere');
    
    const useBetterSqlite = await yesNo('   Use better-sqlite3 for better performance? (recommended for production)', true);
    
    if (useBetterSqlite) {
      console.log('   ✓ better-sqlite3 selected');
      
      // Check if better-sqlite3 is installed
      let betterSqliteInstalled = false;
      try {
        require.resolve('better-sqlite3');
        betterSqliteInstalled = true;
        console.log('   ✓ better-sqlite3 is already installed');
      } catch {
        console.log('   ⚠ better-sqlite3 is not installed');
        const installBetterSqlite = await yesNo('   Install better-sqlite3 now? (requires Node.js native compilation)', true);
        
        if (installBetterSqlite) {
          console.log('\n   Installing better-sqlite3...');
          try {
            execSync('npm install better-sqlite3', { stdio: 'inherit' });
            betterSqliteInstalled = true;
            console.log('   ✓ better-sqlite3 installed successfully');
            
            // Update .env file
            if (fs.existsSync(envPath)) {
              let envContent = fs.readFileSync(envPath, 'utf-8');
              if (!envContent.includes('DB_ENGINE')) {
                envContent += '\n# Database engine\nDB_ENGINE=better-sqlite3\n';
                fs.writeFileSync(envPath, envContent);
                console.log('   ✓ Updated .env with DB_ENGINE=better-sqlite3');
              }
            }
          } catch (err) {
            console.log('   ⚠ Failed to install better-sqlite3');
            console.log('   ℹ This may be due to missing compilation tools');
            console.log('   ℹ Falling back to sql.js');
            betterSqliteInstalled = false;
          }
        }
      }
      
      if (!betterSqliteInstalled) {
        console.log('   ℹ Using sql.js instead (no compilation required)');
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf-8');
          if (!envContent.includes('DB_ENGINE')) {
            envContent += '\n# Database engine\nDB_ENGINE=sql.js\n';
            fs.writeFileSync(envPath, envContent);
            console.log('   ✓ Updated .env with DB_ENGINE=sql.js');
          }
        }
      }
    } else {
      console.log('   ✓ sql.js selected (pure JavaScript, no compilation needed)');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf-8');
        if (!envContent.includes('DB_ENGINE')) {
          envContent += '\n# Database engine\nDB_ENGINE=sql.js\n';
          fs.writeFileSync(envPath, envContent);
          console.log('   ✓ Updated .env with DB_ENGINE=sql.js');
        }
      }
    }
    // Database step complete - progress will be saved in container step if needed

    // Step 9: Container mode selection (Docker vs Native)
    console.log('\n📋 Step 9/9: Container Mode Configuration...');
    
    // Check if we should resume from container step
    const progress = getProgress();
    if (progress === 'container') {
      console.log('   ℹ Resuming from container configuration step...');
      console.log('   ℹ Docker mode selected. Container isolation for agent execution.');
      // Progress already saved, continue to Docker operations
    } else {
      // First time installation - default to Docker mode
      console.log('   ℹ Recommended: Docker mode (container isolation for agent execution)');
      const useNative = await yesNo('   Use native mode instead? (no containers, agents run directly on host)', false);
      
      if (useNative) {
        console.log('   ✓ Native mode selected');
        
        // Update .env file
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf-8');
          if (!envContent.includes('NATIVE_MODE')) {
            envContent += '\n# Run in native mode (no containers)\nNATIVE_MODE=true\n';
            fs.writeFileSync(envPath, envContent);
            console.log('   ✓ Updated .env with NATIVE_MODE=true');
          }
        }
        clearProgress(); // Installation complete
        return; // Exit early, no need for Docker configuration
      } else {
        console.log('   ✓ Docker mode selected. Container isolation for agent execution.');
        saveProgress('container'); // Save progress before Docker operations
      }
    }
    
    // Docker configuration (only reached if Docker mode selected)
    {
      // Check Docker
      let dockerInstalled = false;
      try {
        // First check if docker command exists
        if (isWindows) {
          execSync('where docker', { stdio: 'ignore' });
        } else {
          execSync('which docker', { stdio: 'ignore' });
        }
        // Then check if docker daemon is running
        execSync('docker info', { stdio: 'ignore' });
        console.log('   ✓ Docker is installed and running');
        dockerInstalled = true;
      } catch {
        console.log('   ⚠ Docker is not installed or not running');
      }
      
      if (!dockerInstalled) {
        const installDocker = await yesNo('   Do you want to install Docker now? (recommended for Docker mode)', true);
        
        if (installDocker) {
          console.log('\n   Installing Docker...');
          try {
            if (isLinux) {
              // Check if docker command already exists (may just need to start service)
              let dockerCmdExists = false;
              try {
                execSync('which docker', { stdio: 'ignore' });
                dockerCmdExists = true;
              } catch {
                dockerCmdExists = false;
              }
              
              if (dockerCmdExists) {
                console.log('   ✓ Docker is installed but not running');
                console.log('   ℹ Starting Docker service...');
                try {
                  execSync('sudo systemctl start docker', { stdio: 'inherit' });
                  execSync('sudo systemctl enable docker', { stdio: 'ignore' });
                  console.log('   ✓ Docker service started and enabled');
                  
                  // Verify it's working now (use sudo to avoid permission issues)
                  try {
                    execSync('sudo docker info', { stdio: 'ignore' });
                    dockerInstalled = true;
                    console.log('   ✓ Docker is now running');
                  } catch {
                    console.log('   ⚠ Docker service failed to start. Please check system logs.');
                  }
                } catch (err) {
                  console.log('   ⚠ Failed to start Docker service');
                  console.log('   ℹ Please run: sudo systemctl start docker');
                }
              } else {
                // Docker not installed, install it
                console.log('   Downloading Docker installation script...');
                execSync('curl -fsSL https://get.docker.com -o /tmp/get-docker.sh', { stdio: 'ignore' });
                console.log('   Running Docker installation (requires sudo)...');
                execSync('sudo sh /tmp/get-docker.sh', { stdio: 'inherit' });
                console.log('   ✓ Docker installed');
                console.log('   ℹ Starting Docker service...');
                
                try {
                  execSync('sudo systemctl start docker', { stdio: 'ignore' });
                  execSync('sudo systemctl enable docker', { stdio: 'ignore' });
                  
                  // Verify Docker installation (use sudo to avoid permission issues)
                  try {
                    execSync('sudo docker info', { stdio: 'ignore' });
                    dockerInstalled = true;
                    console.log('   ✓ Docker is now running');
                  } catch {
                    console.log('   ⚠ Docker installed but not running. Please run: sudo systemctl start docker');
                  }
                } catch {
                  console.log('   ⚠ Failed to start Docker service automatically');
                  console.log('   ℹ Please run: sudo systemctl start docker');
                }
              }
              
              // Add user to docker group to avoid permission issues
              if (dockerInstalled && isLinux) {
                console.log('\n   ℹ Adding current user to docker group...');
                try {
                  const os = await import('os');
                  const username = os.userInfo().username;
                  execSync(`sudo usermod -aG docker ${username}`, { stdio: 'ignore' });
                  console.log('   ✓ User added to docker group');
                  console.log('   ℹ Please log out and log back in for changes to take effect');
                  console.log('   ℹ Or run: newgrp docker');
                  
                  // Try to verify docker works without sudo using newgrp
                  try {
                    execSync('newgrp docker << EOF\ndocker info\nEOF', { stdio: 'ignore' });
                    console.log('   ✓ Docker is accessible without sudo (using newgrp)');
                  } catch {
                    console.log('   ℹ Docker will be accessible after re-login');
                  }
                } catch {
                  console.log('   ⚠ Failed to add user to docker group');
                  console.log('   ℹ Please run: sudo usermod -aG docker $USER');
                }
              }
            } else if (isMac) {
              if (execSync('which brew', { stdio: 'ignore' })) {
                console.log('   Installing Docker Desktop via Homebrew...');
                execSync('brew install --cask docker', { stdio: 'inherit' });
                console.log('   ✓ Docker Desktop installed');
                console.log('   ℹ Please open Docker Desktop from Applications folder to complete setup');
                console.log('   ℹ After Docker Desktop is running, re-run setup to build container image.');
              } else {
                console.log('   ⚠ Homebrew not found');
                console.log('   ℹ Please install Docker Desktop manually:');
                console.log('      https://docs.docker.com/desktop/install/mac-install/');
              }
            } else if (isWindows) {
              console.log('   ⚠ Please install Docker Desktop manually:');
              console.log('      https://docs.docker.com/desktop/install/windows-install/');
            }
          } catch (err) {
            console.log('   ⚠ Docker installation failed');
            console.log('   ℹ Please install Docker manually:');
            console.log('      https://docs.docker.com/get-docker/');
          }
        } else {
          console.log('   ℹ Skipping Docker installation');
          console.log('   ℹ You can install Docker later: https://docs.docker.com/get-docker/');
        }
        
        // If Docker is still not available, offer to switch to native mode
        if (!dockerInstalled) {
          console.log('\n   ⚠ Docker mode requires Docker to be installed and running.');
          const switchToNative = await yesNo('   Would you like to switch to native mode instead? (recommended)', true);
          
          if (switchToNative) {
            console.log('   ✓ Switching to native mode...');
            if (fs.existsSync(envPath)) {
              let envContent = fs.readFileSync(envPath, 'utf-8');
              if (!envContent.includes('NATIVE_MODE')) {
                envContent += '\n# Run in native mode (no containers)\nNATIVE_MODE=true\n';
                fs.writeFileSync(envPath, envContent);
                console.log('   ✓ Updated .env with NATIVE_MODE=true');
              }
            }
            // Skip container configuration and build steps
            return; // Exit early from Docker mode configuration
          } else {
            console.log('   ℹ Keeping Docker mode. Please install Docker and manually build the container image later.');
            console.log('   ℹ Command: npm run build-container');
          }
        }
      }
      
      // Only show container configuration if Docker is available
      if (dockerInstalled) {
        // Configure Docker container settings
        console.log('\n   📦 Docker Container Configuration:');
        console.log('   ℹ The following directories will be mounted in the container:');
        console.log('      - Project root (read-only): /workspace/project');
        console.log('      - Group folder (read-write): /workspace/group');
        console.log('      - Qwen Code sessions (read-write): /home/node/.qwen-code');
        console.log('      - IPC communication (read-write): /workspace/ipc');
        console.log('      - Agent Runner source (read-write): /app/src');
        console.log('   ℹ Container runs as host user for file permission compatibility');
        console.log('   ℹ Logs are stored outside container: groups/{folder}/logs/');
        
        // Ask about building the container image
        let buildContainer = false;
        
        // Check if image already exists
        let imageExists = false;
        try {
          const dockerCmd = isLinux ? 'sudo docker' : 'docker';
          execSync(`${dockerCmd} images qwqnanoclaw-agent -q`, {
            cwd: path.join(process.cwd(), 'container'),
            stdio: 'ignore',
          });
          imageExists = true;
          console.log('   ✓ Container image already exists');
        } catch {
          imageExists = false;
        }
        
        if (imageExists) {
          const rebuild = await yesNo('   Do you want to rebuild the container image?', false);
          buildContainer = rebuild;
        } else {
          buildContainer = await yesNo('   Do you want to build the Docker container image now?', true);
        }
        
        if (buildContainer) {
          console.log('\n   Building container image...');
          
          // Use sudo on Linux to avoid permission issues
          const dockerCmd = isLinux ? 'sudo docker' : 'docker';
          execSync(`${dockerCmd} build -t qwqnanoclaw-agent:latest .`, {
            cwd: path.join(process.cwd(), 'container'),
            stdio: 'inherit',
          });
          console.log('   ✓ Container image built successfully');
          console.log('   ℹ Image name: qwqnanoclaw-agent:latest');
          console.log('   ℹ You can now run: npm start');
          clearProgress(); // Installation complete
        } else {
          console.log('   ℹ Skipping container build');
          console.log('   ℹ You can build later with: npm run build-container:sudo');
          clearProgress(); // Installation complete
        }
        
        // Update .env file
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf-8');
          if (!envContent.includes('NATIVE_MODE')) {
            envContent += '\n# Run in Docker mode (container isolation)\nNATIVE_MODE=false\n';
            fs.writeFileSync(envPath, envContent);
            console.log('   ✓ Updated .env with NATIVE_MODE=false');
          }
        }
      }
    }

    // Summary
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    Setup Summary                             ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log(`   Platform:      ${isWindows ? 'Windows' : isLinux ? 'Linux' : isMac ? 'macOS' : platform}`);
    console.log(`   Node.js:       ${nodeVersion}`);
    console.log(`   Dependencies:  ${fs.existsSync(nodeModulesPath) ? 'Installed' : 'Not installed'}`);
    console.log(`   .env file:     ${fs.existsSync(envPath) ? 'Exists' : 'Not found'}`);
    console.log(`   Qwen Code:     ${qwenInstalled ? 'Installed' : 'Not installed'}`);
    console.log(`   agent-browser: ${agentBrowserInstalled ? 'Installed' : 'Not installed'}`);
    console.log(`   Database:      SQLite (embedded)`);
    console.log(`   Container:     ${containerMode === 'native' ? 'Native mode' : 'Docker mode'}`);
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                   Next Steps                                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log('   1. Edit .env file with your QQ/WhatsApp credentials');
    if (!agentBrowserInstalled || !qwenInstalled) {
      console.log('   2. Install AI features: npx tsx setup/index.ts --step agent-browser');
      console.log('   3. Configure Qwen skills: npx tsx setup/index.ts --step qwen-skills');
      console.log('   4. Run the application: npm start');
      console.log('   5. Set up groups: npx tsx setup/index.ts --step groups\n');
    } else {
      console.log('   2. Run the application: npm start');
      console.log('   3. Set up groups: npx tsx setup/index.ts --step groups\n');
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Setup wizard failed');
    console.error(`\n   ✗ Setup failed: ${message}`);
    process.exit(1);
  } finally {
    rl.close();
  }
}

/**
 * Run a specific setup step
 */
async function runStep(stepName: string, stepArgs: string[]): Promise<void> {
  const loader = STEPS[stepName];
  if (!loader) {
    console.error(`Unknown step: ${stepName}`);
    console.error(`Available steps: ${Object.keys(STEPS).join(', ')}`);
    process.exit(1);
  }

  try {
    const mod = await loader();
    await mod.run(stepArgs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, step: stepName }, 'Setup step failed');
    emitStatus(stepName.toUpperCase(), {
      STATUS: 'failed',
      ERROR: message,
    });
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const stepIdx = args.indexOf('--step');

  if (stepIdx === -1) {
    // No --step argument: run interactive wizard
    await interactiveWizard();
  } else {
    // Run specific step
    const stepName = args[stepIdx + 1];
    const stepArgs = args.filter((a, i) => i !== stepIdx && i !== stepIdx + 1 && a !== '--');
    await runStep(stepName, stepArgs);
  }
}

// Add command to reset progress
if (process.argv.includes('--reset-progress')) {
  clearProgress();
  console.log('✓ Installation progress reset');
  process.exit(0);
}

main();
