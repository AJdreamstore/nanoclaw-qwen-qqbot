/**
 * Step: qwen-skills — Configure Qwen Code with agent-browser skill.
 * 
 * This step:
 * 1. Checks if Qwen Code is installed
 * 2. Creates the skills directory: ~/.qwen/skills/agent-browser/
 * 3. Copies SKILL.md from agent-browser package
 * 4. Updates Qwen Code settings.json to enable skills
 * 5. Verifies the configuration
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { logger } from '../src/logger.js';
import { emitStatus } from './status.js';

export async function run(_args: string[]): Promise<void> {
  const projectRoot = process.cwd();
  const homeDir = os.homedir();
  const qwenConfigDir = path.join(homeDir, '.qwen');
  const qwenSkillsDir = path.join(qwenConfigDir, 'skills');
  const agentBrowserSkillDir = path.join(qwenSkillsDir, 'agent-browser');
  const qwenSettingsPath = path.join(qwenConfigDir, 'settings.json');
  
  logger.info('Starting Qwen Code skills configuration');

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Qwen Code Skills Configuration                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Check if Qwen Code is installed
    console.log('📋 Step 1/4: Checking Qwen Code installation...');
    let qwenInstalled = false;
    
    try {
      const version = execSync('qwen --version', { 
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
      console.log(`   ✓ Qwen Code is installed: ${version}`);
      qwenInstalled = true;
    } catch {
      console.log('   ✗ Qwen Code is not installed');
      console.log('   ℹ Install with: npm install -g @qwen-code/qwen-code');
      throw new Error('Qwen Code is not installed. Please install it first.');
    }

    // Step 2: Check if agent-browser is installed
    console.log('\n📋 Step 2/4: Checking agent-browser installation...');
    let agentBrowserInstalled = false;
    let agentBrowserGlobalPath = '';
    
    try {
      // Get agent-browser global installation path
      const npmRoot = execSync('npm root -g', { 
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
      agentBrowserGlobalPath = path.join(npmRoot, 'agent-browser');
      
      if (fs.existsSync(agentBrowserGlobalPath)) {
        console.log('   ✓ agent-browser is installed globally');
        agentBrowserInstalled = true;
      } else {
        console.log('   ✗ agent-browser is not installed globally');
        console.log('   ℹ Run: npx tsx setup/index.ts --step agent-browser');
        throw new Error('agent-browser is not installed. Please install it first.');
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('agent-browser is not installed')) {
        throw err;
      }
      console.log('   ⚠ Could not verify agent-browser installation');
    }

    // Step 3: Create skills directory and copy SKILL.md
    console.log('\n📋 Step 3/4: Configuring agent-browser skill...');
    
    // Create skills directory
    if (!fs.existsSync(qwenSkillsDir)) {
      console.log('   Creating skills directory...');
      fs.mkdirSync(qwenSkillsDir, { recursive: true });
    }
    
    // Create agent-browser skill directory
    if (!fs.existsSync(agentBrowserSkillDir)) {
      console.log('   Creating agent-browser skill directory...');
      fs.mkdirSync(agentBrowserSkillDir, { recursive: true });
    }
    
    // Copy SKILL.md from agent-browser package
    const skillMdSource = path.join(agentBrowserGlobalPath, 'SKILL.md');
    const skillMdDest = path.join(agentBrowserSkillDir, 'SKILL.md');
    
    if (fs.existsSync(skillMdSource)) {
      console.log('   Copying SKILL.md...');
      fs.copyFileSync(skillMdSource, skillMdDest);
      console.log('   ✓ SKILL.md copied successfully');
    } else {
      // If SKILL.md doesn't exist in the package, create a basic one
      console.log('   ℹ SKILL.md not found in package, creating basic skill definition...');
      const basicSkillMd = `# agent-browser Skill

This skill allows the AI to use agent-browser for web automation tasks.

## Usage

When the user asks you to perform web automation tasks, you can use the agent-browser tool.

## Commands

- \`agent-browser run <script>\` - Run a browser automation script
- \`agent-browser record\` - Record browser interactions
- \`agent-browser play\` - Play back recorded interactions

## Examples

- "Open a browser and search for weather in Beijing"
- "Go to example.com and click the login button"
`;
      fs.writeFileSync(skillMdDest, basicSkillMd);
      console.log('   ✓ Basic SKILL.md created');
    }

    // Step 4: Update Qwen Code settings
    console.log('\n📋 Step 4/4: Updating Qwen Code settings...');
    
    let settings = { tools: {} };
    if (fs.existsSync(qwenSettingsPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(qwenSettingsPath, 'utf-8'));
        console.log('   ✓ Loaded existing settings.json');
      } catch {
        console.log('   ⚠ Could not parse settings.json, creating new one');
        settings = { tools: {} };
      }
    } else {
      console.log('   ℹ settings.json not found, creating new one');
    }
    
    // Enable skills
    if (!settings.tools) settings.tools = {};
    if (!settings.tools.experimental) settings.tools.experimental = {};
    
    const needsSkills = settings.tools.experimental.skills !== true;
    const needsWebFetch = !settings.tools.allowed?.includes('web_fetch');
    const needsAgentBrowser = !settings.tools.allowed?.includes('agent-browser');
    
    if (needsSkills || needsWebFetch || needsAgentBrowser) {
      settings.tools.experimental.skills = true;
      if (!settings.tools.allowed) settings.tools.allowed = [];
      if (!settings.tools.allowed.includes('web_fetch')) {
        settings.tools.allowed.push('web_fetch');
      }
      if (!settings.tools.allowed.includes('agent-browser')) {
        settings.tools.allowed.push('agent-browser');
      }
      
      // Backup existing settings
      if (fs.existsSync(qwenSettingsPath)) {
        const backupPath = qwenSettingsPath + '.bak';
        fs.copyFileSync(qwenSettingsPath, backupPath);
        console.log('   ✓ Created backup: settings.json.bak');
      }
      
      // Write updated settings
      fs.writeFileSync(qwenSettingsPath, JSON.stringify(settings, null, 2));
      console.log('   ✓ Updated settings.json');
      
      if (needsSkills) {
        console.log('      - Enabled: tools.experimental.skills = true');
      }
      if (needsWebFetch) {
        console.log('      - Added: tools.allowed includes "web_fetch"');
      }
      if (needsAgentBrowser) {
        console.log('      - Added: tools.allowed includes "agent-browser"');
      }
    } else {
      console.log('   ✓ Settings are already configured correctly');
    }

    // Verification
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    Verification                              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    let allGood = true;
    
    // Check if skill directory exists
    if (fs.existsSync(agentBrowserSkillDir)) {
      const files = fs.readdirSync(agentBrowserSkillDir);
      if (files.includes('SKILL.md')) {
        console.log('   ✓ agent-browser skill is installed');
        console.log(`      Location: ${agentBrowserSkillDir}`);
      } else {
        console.log('   ⚠ SKILL.md not found in skill directory');
        allGood = false;
      }
    } else {
      console.log('   ⚠ agent-browser skill directory not found');
      allGood = false;
    }
    
    // Check settings
    if (fs.existsSync(qwenSettingsPath)) {
      const currentSettings = JSON.parse(fs.readFileSync(qwenSettingsPath, 'utf-8'));
      if (currentSettings.tools?.experimental?.skills === true) {
        console.log('   ✓ Skills are enabled in settings.json');
      } else {
        console.log('   ⚠ Skills are not enabled in settings.json');
        allGood = false;
      }
      
      if (currentSettings.tools?.allowed?.includes('web_fetch')) {
        console.log('   ✓ web_fetch tool is allowed');
      } else {
        console.log('   ⚠ web_fetch tool is not allowed');
        allGood = false;
      }
    }
    
    if (allGood) {
      console.log('\n   ✓ Qwen Code is fully configured!\n');
    } else {
      console.log('\n   ⚠ Some configuration items need attention\n');
    }

    // Success
    emitStatus('CONFIGURE_QWEN_SKILLS', {
      STATUS: 'success',
      SKILLS_DIR: agentBrowserSkillDir,
      SETTINGS_PATH: qwenSettingsPath,
      LOG: 'logs/setup.log',
    });

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                   Next Steps                                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log('   Qwen Code skills have been configured.\n');
    console.log('   To verify, run:');
    console.log('     1. Open Qwen Code: qwen');
    console.log('     2. Run command: /skills');
    console.log('     3. You should see "agent-browser" in the list\n');
    console.log('   Test it by asking:');
    console.log('     "Open a browser and search for weather in Beijing"\n');

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Qwen Code skills configuration failed');
    console.error(`\n   ✗ Configuration failed: ${message}`);
    
    emitStatus('CONFIGURE_QWEN_SKILLS', {
      STATUS: 'failed',
      ERROR: message,
      LOG: 'logs/setup.log',
    });
    
    process.exit(1);
  }
}
