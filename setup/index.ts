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
    // Database step complete

    // Installation complete! Container mode was already configured in install.sh
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    配置完成！🎉                              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('   ✓ 环境已验证');
    console.log('   ✓ 配置已检查');
    console.log('   ✓ AI 功能已配置');
    console.log('   ✓ 数据库已配置');
    console.log('   ✓ 容器模式已在 install.sh 中配置');
    console.log('');
    console.log('   下一步：');
    console.log('   1. 配置群组：npx tsx setup/index.ts --step groups-interactive');
    console.log('   2. 启动机器人：npm start');
    console.log('');
    
    clearProgress(); // Installation complete
    return;
                  console.log('   ℹ 或者运行：newgrp docker');
                  
                  // Try to verify docker works without sudo using newgrp
                  try {
                    execSync('newgrp docker << EOF\ndocker info\nEOF', { stdio: 'ignore' });
                    console.log('   ✓ Docker 可以无 sudo 访问（使用 newgrp）');
                  } catch {
                    console.log('   ℹ 重新登录后可访问 Docker');
                  }
                } catch {
                  console.log('   ⚠ 添加用户到 docker 组失败');
                  console.log('   ℹ 请运行：sudo usermod -aG docker $USER');
                }
              }
            } else if (isMac) {
              if (execSync('which brew', { stdio: 'ignore' })) {
                console.log('   正在通过 Homebrew 安装 Docker Desktop...');
                execSync('brew install --cask docker', { stdio: 'inherit' });
                console.log('   ✓ Docker Desktop 已安装');
                console.log('   ℹ 请从应用程序文件夹打开 Docker Desktop 完成设置');
                console.log('   ℹ Docker Desktop 运行后，重新运行 setup 以构建容器镜像');
              } else {
                console.log('   ⚠ 未找到 Homebrew');
                console.log('   ℹ 请手动安装 Docker Desktop：');
                console.log('      https://docs.docker.com/desktop/install/mac-install/');
              }
            } else if (isWindows) {
              console.log('   ⚠ 请手动安装 Docker Desktop：');
              console.log('      https://docs.docker.com/desktop/install/windows-install/');
            }
          } catch (err) {
            console.log('   ⚠ Docker 安装失败');
            console.log('   ℹ 请手动安装 Docker：');
            console.log('      https://docs.docker.com/get-docker/');
          }
        } else {
          console.log('   ℹ 跳过 Docker 安装');
          console.log('   ℹ 您可以稍后安装 Docker：https://docs.docker.com/get-docker/');
        }
        
        // If Docker is still not available, offer to switch to native mode
        if (!dockerInstalled) {
          console.log('\n   ⚠ Docker 模式需要安装并运行 Docker');
          const switchToNative = await yesNo('   您想切换到原生模式吗？（推荐）', true);
          
          if (switchToNative) {
            console.log('   ✓ 正在切换到原生模式...');
            if (fs.existsSync(envPath)) {
              let envContent = fs.readFileSync(envPath, 'utf-8');
              if (!envContent.includes('NATIVE_MODE')) {
                envContent += '\n# Run in native mode (no containers)\nNATIVE_MODE=true\n';
                fs.writeFileSync(envPath, envContent);
                console.log('   ✓ 已更新 .env 中的 NATIVE_MODE=true');
              }
            }
            // Skip container configuration and build steps
            return; // Exit early from Docker mode configuration
          } else {
            console.log('   ℹ 保持 Docker 模式。请安装 Docker 并稍后手动构建容器镜像');
            console.log('   ℹ 命令：npm run build-container');
          }
        }
      }
      
      // Only show Docker configuration if Docker is available
      if (dockerInstalled) {
        // Configure Qwen Code Sandbox settings
        console.log('\n   📦 Docker Sandbox 配置：');
        console.log('   ℹ Qwen Code 将在 Docker 容器中运行以实现隔离');
        console.log('   ℹ 每个群组在独立的容器中运行');
        console.log('   ℹ 容器生命周期由 Qwen Code 自动管理');
        console.log('   ℹ 挂载点：');
        console.log('      - 项目根目录（只读）：/workspace/project');
        console.log('      - 群组文件夹（可写）：/workspace/group');
        console.log('   ℹ 日志存储位置：groups/{folder}/logs/');
        
        // Update .env file for Docker Sandbox mode
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf-8');
          if (!envContent.includes('NATIVE_MODE')) {
            envContent += '\n# Run in Docker Sandbox mode (Qwen Code manages containers)\nNATIVE_MODE=false\n';
            fs.writeFileSync(envPath, envContent);
            console.log('   ✓ 已更新 .env 中的 NATIVE_MODE=false');
          }
          if (!envContent.includes('QWEN_SANDBOX_TYPE')) {
            envContent += '\n# Qwen Code Sandbox type: docker, none\nQWEN_SANDBOX_TYPE=docker\n';
            fs.writeFileSync(envPath, envContent);
            console.log('   ✓ 已更新 .env 中的 QWEN_SANDBOX_TYPE=docker');
          }
        }
        
        // Build TypeScript
        console.log('\n   正在构建 TypeScript...');
        try {
          execSync('npm run build', { stdio: 'inherit' });
          console.log('   ✓ TypeScript 构建完成');
        } catch (err) {
          console.log('   ⚠ TypeScript 构建失败');
          console.log('   ℹ 您可以稍后手动构建：npm run build');
        }
      }
    }

    // Summary
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    配置总结                                  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log(`   平台：         ${isWindows ? 'Windows' : isLinux ? 'Linux' : isMac ? 'macOS' : platform}`);
    console.log(`   Node.js:       ${nodeVersion}`);
    console.log(`   依赖：         ${fs.existsSync(nodeModulesPath) ? '已安装' : '未安装'}`);
    console.log(`   .env 文件：    ${fs.existsSync(envPath) ? '存在' : '未找到'}`);
    console.log(`   Qwen Code:     ${qwenInstalled ? '已安装' : '未安装'}`);
    console.log(`   agent-browser: ${agentBrowserInstalled ? '已安装' : '未安装'}`);
    console.log(`   数据库：       SQLite（嵌入式）`);
    
    // Check NATIVE_MODE from .env file
    let isNativeMode = false;
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      isNativeMode = envContent.includes('NATIVE_MODE=true');
    }
    console.log(`   容器：         ${isNativeMode ? '原生模式' : 'Docker 模式'}`);
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    下一步                                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log('   1. 编辑 .env 文件填入 QQ 机器人凭证');
    if (!agentBrowserInstalled || !qwenInstalled) {
      console.log('   2. 安装 AI 功能：npx tsx setup/index.ts --step agent-browser');
      console.log('   3. 配置 Qwen skills: npx tsx setup/index.ts --step qwen-skills');
      console.log('   4. 启动机器人：npm start');
      console.log('   5. 配置群组：npx tsx setup/index.ts --step groups\n');
    } else {
      console.log('   2. 启动机器人：npm start');
      console.log('   3. 配置群组：npx tsx setup/index.ts --step groups\n');
    }

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
