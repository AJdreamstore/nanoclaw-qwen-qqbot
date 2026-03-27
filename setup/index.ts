/**
 * Setup CLI entry point.
 * Usage: 
 *   npx tsx setup/index.ts                    # Interactive wizard
 *   npx tsx setup/index.ts --step <name>     # Run specific step
 */
import * as readline from 'readline';
import { logger } from '../src/logger.js';
import { emitStatus } from './status.js';

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

    // Step 8: Container mode selection
    console.log('\n📋 Step 8/8: Container configuration...');
    const containerModeAnswer = await question('   Run in native mode (no containers)? [Y/n] ');
    const containerMode = containerModeAnswer.toLowerCase() !== 'n' ? 'native' : 'docker';
    
    if (containerMode === 'native') {
      console.log('   ✓ Native mode selected (agents run directly on host)');
      
      // Update .env file
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf-8');
        if (!envContent.includes('NATIVE_MODE')) {
          envContent += '\n# Run in native mode (no containers)\nNATIVE_MODE=true\n';
          fs.writeFileSync(envPath, envContent);
          console.log('   ✓ Updated .env with NATIVE_MODE=true');
        }
      }
    } else {
      console.log('   ℹ Docker mode selected. Make sure Docker is installed and running.');
      
      // Check Docker
      try {
        execSync('docker info', { stdio: 'ignore' });
        console.log('   ✓ Docker is running');
      } catch {
        console.log('   ⚠ Docker is not running. Please start Docker Desktop.');
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

main();
