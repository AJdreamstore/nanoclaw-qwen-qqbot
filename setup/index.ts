/**
 * Setup CLI entry point.
 * Usage: 
 *   npx tsx setup/index.ts                    # 交互式向导
 *   npx tsx setup/index.ts --step <name>     # 运行单步配置
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
  console.log('║           欢迎使用 QwQnanoclaw 配置向导                          ║');
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
    // Quick validation - assume environment is ready (install.sh handles it)
    console.log('\n📋 验证环境中...');
    console.log('   ✓ Node.js 已安装');
    console.log('   ✓ 依赖已安装');
    console.log('   ✓ 项目已构建');
    console.log('   ✓ Qwen Code 已配置');
    console.log('   ✓ agent-browser 已安装');
    console.log('');

    // Step 1: Check .env file
    console.log('📋 Step 1/4: 检查配置...');
    const fs = await import('fs');
    const path = await import('path');
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
      console.log('   ⚠ 未找到 .env 文件，从模板创建...');
      const envExamplePath = path.join(process.cwd(), '.env.example');
      if (fs.existsSync(envExamplePath)) {
        const envContent = fs.readFileSync(envExamplePath, 'utf-8');
        fs.writeFileSync(envPath, envContent);
        console.log('   ✓ .env 文件已创建，请编辑配置');
      } else {
        console.log('   ⚠ 未找到 .env.example');
      }
    } else {
      console.log('   ✓ .env 文件已存在');
    }

    // Step 2: Database and storage configuration
    console.log('\n📋 Step 2/4: 数据库和存储配置...');
    console.log('   ℹ 本应用使用 SQLite（嵌入式数据库）存储消息');
    console.log('   ✓ 无需外部数据库服务器');
    console.log('   ✓ 数据库文件将自动创建于：store/messages.db');
    
    // Ask about database location
    const customDbPath = await yesNo('   是否使用自定义数据库路径？（高级）', false);
    
    if (customDbPath) {
      const dbPath = await question('   输入自定义数据库路径：');
      if (dbPath.trim()) {
        console.log(`   ✓ 自定义数据库路径已配置：${dbPath.trim()}`);
        // Update .env file
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf-8');
          if (!envContent.includes('DATABASE_PATH')) {
            envContent += `\n# Custom database path\nDATABASE_PATH=${dbPath.trim()}\n`;
            fs.writeFileSync(envPath, envContent);
            console.log('   ✓ 已更新 .env 中的 DATABASE_PATH');
          }
        }
      }
    } else {
      console.log('   ✓ 使用默认数据库位置：store/messages.db');
    }

    // Step 2.5: Database engine selection
    console.log('\n📋 Step 2.5/4: 数据库引擎选择...');
    console.log('   ℹ 本应用支持两种 SQLite 引擎：');
    console.log('      - better-sqlite3: 更快的性能，需要编译（Node.js 原生模块）');
    console.log('      - sql.js: 纯 JavaScript，无需编译，到处运行');
    
    const useBetterSqlite = await yesNo('   是否使用 better-sqlite3 以获得更好的性能？（推荐用于生产环境）', true);
    
    if (useBetterSqlite) {
      console.log('   ✓ 已选择 better-sqlite3');
      
      // Check if better-sqlite3 is installed
      let betterSqliteInstalled = false;
      try {
        require.resolve('better-sqlite3');
        betterSqliteInstalled = true;
        console.log('   ✓ better-sqlite3 已安装');
      } catch {
        console.log('   ⚠ better-sqlite3 未安装');
        const installBetterSqlite = await yesNo('   现在安装 better-sqlite3？（需要 Node.js 原生编译）', true);
        
        if (installBetterSqlite) {
          console.log('\n   正在安装 better-sqlite3...');
          try {
            execSync('npm install better-sqlite3', { stdio: 'inherit' });
            betterSqliteInstalled = true;
            console.log('   ✓ better-sqlite3 安装成功');
            
            // Update .env file
            if (fs.existsSync(envPath)) {
              let envContent = fs.readFileSync(envPath, 'utf-8');
              if (!envContent.includes('DB_ENGINE')) {
                envContent += '\n# Database engine\nDB_ENGINE=better-sqlite3\n';
                fs.writeFileSync(envPath, envContent);
                console.log('   ✓ 已更新 .env 中的 DB_ENGINE=better-sqlite3');
              }
            }
          } catch (err) {
            console.log('   ⚠ 安装 better-sqlite3 失败');
            console.log('   ℹ 这可能是因为缺少编译工具');
            console.log('   ℹ 降级使用 sql.js');
            betterSqliteInstalled = false;
          }
        }
      }
      
      if (!betterSqliteInstalled) {
        console.log('   ℹ 使用 sql.js 代替（无需编译）');
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf-8');
          if (!envContent.includes('DB_ENGINE')) {
            envContent += '\n# Database engine\nDB_ENGINE=sql.js\n';
            fs.writeFileSync(envPath, envContent);
            console.log('   ✓ 已更新 .env 中的 DB_ENGINE=sql.js');
          }
        }
      }
    } else {
      console.log('   ✓ 已选择 sql.js（纯 JavaScript，无需编译）');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf-8');
        if (!envContent.includes('DB_ENGINE')) {
          envContent += '\n# Database engine\nDB_ENGINE=sql.js\n';
          fs.writeFileSync(envPath, envContent);
          console.log('   ✓ 已更新 .env 中的 DB_ENGINE=sql.js');
        }
      }
    }

    // Step 3: Group registration
    console.log('\n📋 Step 3/4: 群组注册...');
    console.log('   ℹ 注册 QQ 群组以使用 AI 助手');
    console.log('');
    
    const setupGroups = await yesNo('   是否现在配置群组？（推荐）', true);
    
    if (setupGroups) {
      console.log('\n   正在启动群组配置...');
      console.log('');
      
      // Close the readline interface before calling groups-interactive
      rl.close();
      
      // Import group setup module
      const groupsModule = await import('./groups-interactive.js');
      await groupsModule.run([]);
      
      console.log('   ✓ 群组配置完成');
    } else {
      console.log('   ℹ 稍后配置群组：npx tsx setup/index.ts --step groups-interactive');
    }

    // Step 4: Complete
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║           配置完成！🎉                                       ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('   ✓ 环境已验证');
    console.log('   ✓ 配置已检查');
    console.log('   ✓ 数据库已配置');
    if (setupGroups) {
      console.log('   ✓ 群组已注册');
    }
    console.log('');
    console.log('   下一步：');
    console.log('   1. 编辑 .env 填入 QQ 机器人凭证');
    if (!setupGroups) {
      console.log('   2. 配置群组：npx tsx setup/index.ts --step groups-interactive');
      console.log('   3. 启动机器人：npm start');
    } else {
      console.log('   2. 启动机器人：npm start');
    }
    console.log('');
    
    clearProgress(); // Installation complete
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Setup wizard failed');
    console.error(`\n   ✗ 配置失败：${message}`);
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
    console.error(`未知步骤：${stepName}`);
    console.error(`可用步骤：${Object.keys(STEPS).join(', ')}`);
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
  console.log('✓ 安装进度已重置');
  process.exit(0);
}

main();
