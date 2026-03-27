/**
 * Step: agent-browser — Install and configure agent-browser globally.
 * 
 * This step:
 * 1. Installs agent-browser globally: npm install -g agent-browser
 * 2. Runs agent-browser install to set up browser automation
 * 3. Verifies the installation
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { logger } from '../src/logger.js';
import { emitStatus } from './status.js';

export async function run(_args: string[]): Promise<void> {
  const projectRoot = process.cwd();
  
  logger.info('Starting agent-browser installation');

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Agent-Browser Installation                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Check if agent-browser is already installed
    console.log('📋 Step 1/3: Checking agent-browser installation...');
    let isInstalled = false;
    let needsUpdate = false;
    
    try {
      const version = execSync('agent-browser --version', { 
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
      console.log(`   ✓ agent-browser is installed: ${version}`);
      isInstalled = true;
      
      // Check if it's the latest version
      try {
        const latestVersion = execSync('npm view agent-browser version', { 
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        if (version !== latestVersion) {
          console.log(`   ℹ A newer version is available: ${latestVersion}`);
          needsUpdate = true;
        } else {
          console.log(`   ✓ agent-browser is up to date`);
        }
      } catch {
        // Ignore version check errors
      }
    } catch {
      console.log('   ℹ agent-browser is not installed');
    }

    // Step 2: Install or update agent-browser
    console.log('\n📋 Step 2/3: Installing agent-browser...');
    
    if (isInstalled && !needsUpdate) {
      console.log('   ✓ agent-browser is already installed, skipping installation');
    } else {
      try {
        const installCmd = isInstalled ? 'npm install -g agent-browser@latest' : 'npm install -g agent-browser';
        console.log(`   Installing... (${installCmd})`);
        execSync(installCmd, { 
          stdio: 'inherit',
          cwd: projectRoot
        });
        console.log('   ✓ agent-browser installed successfully');
      } catch (err) {
        console.error('   ✗ Failed to install agent-browser');
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Installation failed: ${message}`);
      }
    }

    // Step 3: Run agent-browser install
    console.log('\n📋 Step 3/3: Setting up agent-browser...');
    try {
      console.log('   Running: agent-browser install');
      execSync('agent-browser install', { 
        stdio: 'inherit',
        cwd: projectRoot
      });
      console.log('   ✓ agent-browser setup completed');
    } catch (err) {
      console.error('   ✗ Failed to run agent-browser install');
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Setup failed: ${message}`);
    }

    // Verification
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    Verification                              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    try {
      const version = execSync('agent-browser --version', { 
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
      console.log(`   ✓ agent-browser version: ${version}`);
      
      // Check if browser binaries are installed
      const homeDir = os.homedir();
      const browserDir = path.join(homeDir, '.agent-browser');
      if (fs.existsSync(browserDir)) {
        const files = fs.readdirSync(browserDir);
        console.log(`   ✓ Browser binaries installed: ${files.join(', ')}`);
      } else {
        console.log('   ℹ Browser binaries directory not found (may be installed elsewhere)');
      }
      
      console.log('\n   ✓ agent-browser is ready to use!\n');
    } catch {
      console.log('   ⚠ Verification failed, but installation may still be successful');
    }

    // Success
    emitStatus('INSTALL_AGENT_BROWSER', {
      STATUS: 'success',
      LOG: 'logs/setup.log',
    });

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                   Next Steps                                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log('   agent-browser has been installed and configured.\n');
    console.log('   Now configuring Qwen Code skills...\n');
    console.log('   Run: npx tsx setup/index.ts --step qwen-skills\n');

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'agent-browser installation failed');
    console.error(`\n   ✗ Installation failed: ${message}`);
    
    emitStatus('INSTALL_AGENT_BROWSER', {
      STATUS: 'failed',
      ERROR: message,
      LOG: 'logs/setup.log',
    });
    
    process.exit(1);
  }
}
