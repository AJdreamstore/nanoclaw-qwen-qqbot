#!/usr/bin/env node

/**
 * QwQnanoclaw Installer - Bootstrap Script
 * 
 * This is the FIRST script users should run on a new machine.
 * It checks and installs prerequisites (Node.js, npm), then runs the main setup.
 * 
 * Usage:
 *   curl -fsSL https://raw.githubusercontent.com/qwibitai/nanoclaw/main/install.sh | bash
 *   # or on Windows PowerShell:
 *   iwr https://raw.githubusercontent.com/qwibitai/nanoclaw/main/install.ps1 -useb | iex
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

const MIN_NODE_VERSION = 20;
const NANLCLAW_VERSION = '^1.0.0';

interface Prerequisites {
  node: 'installed' | 'missing';
  nodeVersion?: string;
  nodeMajor?: number;
  npm: 'installed' | 'missing';
  os: 'windows' | 'macos' | 'linux';
  arch: string;
  homeDir: string;
}

/**
 * Check system prerequisites
 */
function checkPrerequisites(): Prerequisites {
  const platform = process.platform;
  const osName = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux';
  
  let nodeVersion: string | undefined;
  let nodeMajor: number | undefined;
  let nodeStatus: 'installed' | 'missing' = 'missing';
  
  try {
    nodeVersion = execSync('node --version', { encoding: 'utf-8' }).trim();
    nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    nodeStatus = 'installed';
  } catch {
    // Node.js not installed
  }
  
  let npmStatus: 'installed' | 'missing' = 'missing';
  try {
    execSync('npm --version', { stdio: 'ignore' });
    npmStatus = 'installed';
  } catch {
    // npm not installed
  }
  
  return {
    node: nodeStatus,
    nodeVersion,
    nodeMajor,
    npm: npmStatus,
    os: osName,
    arch: process.arch,
    homeDir: os.homedir(),
  };
}

/**
 * Install Node.js based on platform
 */
function installNodeJS(): void {
  const prereqs = checkPrerequisites();
  
  if (prereqs.node === 'installed' && prereqs.npm === 'installed') {
    console.log('✓ Node.js and npm are already installed');
    return;
  }
  
  console.log('\n📦 Installing Node.js...\n');
  
  try {
    if (prereqs.os === 'macos') {
      // macOS: Use Homebrew if available, otherwise use official installer
      try {
        execSync('brew --version', { stdio: 'ignore' });
        console.log('Installing via Homebrew...');
        execSync('brew install node@22', { stdio: 'inherit' });
      } catch {
        console.log('Homebrew not found. Please install Node.js manually:');
        console.log('  1. Visit: https://nodejs.org/');
        console.log('  2. Download and install Node.js LTS (v22+)');
        console.log('  3. Re-run this installer\n');
        process.exit(1);
      }
    } else if (prereqs.os === 'linux') {
      // Linux: Use package manager or NodeSource
      console.log('Installing Node.js 22 LTS...');
      execSync('curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -', { stdio: 'inherit' });
      execSync('sudo apt-get install -y nodejs', { stdio: 'inherit' });
    } else if (prereqs.os === 'windows') {
      // Windows: Use winget or manual installation
      try {
        execSync('winget --version', { stdio: 'ignore' });
        console.log('Installing via winget...');
        execSync('winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements', { stdio: 'inherit' });
      } catch {
        console.log('winget not available. Please install Node.js manually:');
        console.log('  1. Visit: https://nodejs.org/');
        console.log('  2. Download and install Node.js LTS (v22+)');
        console.log('  3. Re-run this installer\n');
        process.exit(1);
      }
    }
    
    console.log('✓ Node.js installed successfully\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('✗ Failed to install Node.js:', message);
    console.error('\nPlease install Node.js manually from https://nodejs.org/');
    process.exit(1);
  }
}

/**
 * Check if Node.js version is sufficient
 */
function checkNodeVersion(): void {
  const prereqs = checkPrerequisites();
  
  if (prereqs.node !== 'installed') {
    console.error('✗ Node.js is not installed');
    process.exit(1);
  }
  
  if (!prereqs.nodeMajor || prereqs.nodeMajor < MIN_NODE_VERSION) {
    console.error(`✗ Node.js version ${prereqs.nodeVersion} is too old`);
    console.error(`  Required: Node.js ${MIN_NODE_VERSION}+`);
    console.error('  Please upgrade Node.js');
    process.exit(1);
  }
  
  console.log(`✓ Node.js ${prereqs.nodeVersion} is installed`);
}

/**
 * Install project dependencies
 */
function installDependencies(): void {
  console.log('\n📦 Installing project dependencies...\n');
  
  try {
    execSync('npm install', { stdio: 'inherit', cwd: process.cwd() });
    console.log('✓ Dependencies installed\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('✗ Failed to install dependencies:', message);
    process.exit(1);
  }
}

/**
 * Create .env file if it doesn't exist
 */
function setupEnvironment(): void {
  const envPath = path.join(process.cwd(), '.env');
  const envExamplePath = path.join(process.cwd(), '.env.example');
  
  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(envExamplePath)) {
      console.log('📝 Creating .env file from template...');
      fs.copyFileSync(envExamplePath, envPath);
      console.log('✓ .env file created');
      console.log('⚠ Please edit .env with your configuration\n');
    } else {
      console.log('⚠ No .env.example found, skipping .env creation\n');
    }
  } else {
    console.log('✓ .env file already exists\n');
  }
}

/**
 * Run the main setup wizard
 */
function runMainSetup(): void {
  console.log('\n🚀 Running QwQnanoclaw setup wizard...\n');
  
  try {
    // Use npx to run the setup script
    execSync('npx tsx setup/index.ts', { stdio: 'inherit', cwd: process.cwd() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('✗ Setup wizard failed:', message);
    console.error('\nYou can run it manually with: npx tsx setup/index.ts');
    process.exit(1);
  }
}

/**
 * Main installation flow
 */
async function main(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, (answer) => resolve(answer));
    });
  };

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         QwQnanoclaw Installer                                   ║');
  console.log('║         Your Personal AI Assistant                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Check prerequisites
    console.log('📋 Step 1/4: Checking system prerequisites...\n');
    let prereqs = checkPrerequisites();
    
    console.log(`   OS:      ${prereqs.os} (${prereqs.arch})`);
    console.log(`   Node.js: ${prereqs.node === 'installed' ? prereqs.nodeVersion : 'Not installed'}`);
    console.log(`   npm:     ${prereqs.npm === 'installed' ? 'Installed' : 'Not installed'}\n`);

    // Step 2: Install Node.js if needed
    if (prereqs.node !== 'installed' || prereqs.npm !== 'installed') {
      const answer = await question('   Node.js is required. Install it now? [Y/n] ');
      if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
        console.log('\n✗ Installation cancelled. Node.js is required.');
        console.log('   Please install Node.js from https://nodejs.org/');
        process.exit(0);
      }
      
      installNodeJS();
      prereqs = checkPrerequisites();
    }

    // Step 3: Check Node.js version
    console.log('\n📋 Step 2/4: Checking Node.js version...');
    checkNodeVersion();

    // Step 4: Install dependencies
    console.log('\n📋 Step 3/4: Installing dependencies...');
    installDependencies();

    // Step 5: Setup environment
    console.log('\n📋 Step 4/4: Setting up environment...');
    setupEnvironment();

    // Step 6: Run main setup
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║              Prerequisites Complete                          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    const runSetup = await question('   Run the interactive setup wizard now? [Y/n] ');
    if (runSetup.toLowerCase() !== 'n' && runSetup.toLowerCase() !== 'no') {
      runMainSetup();
    } else {
      console.log('\n✓ Installation complete!');
      console.log('\nYou can run the setup wizard later with:');
      console.log('   npx tsx setup/index.ts\n');
    }

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║              Installation Complete! 🎉                       ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ Installation failed: ${message}`);
    console.error('\nPlease check the error message above and try again.');
    console.error('If the problem persists, visit: https://github.com/AJdreamstore/nanoclaw-qwen-qqbot/issues\n');
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
