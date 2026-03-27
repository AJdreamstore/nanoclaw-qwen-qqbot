/**
 * Step: reset — Reset user data and configuration.
 * 
 * This step provides options to:
 * 1. Reset IPC data only (keep database)
 * 2. Reset database only (keep IPC data)
 * 3. Reset everything (IPC + database + logs)
 * 4. Reset to factory defaults (delete all user-specific groups)
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';

import { STORE_DIR } from '../src/config.js';
import { logger } from '../src/logger.js';
import { emitStatus } from './status.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, (answer) => resolve(answer));
  });
};

export async function run(args: string[]): Promise<void> {
  const projectRoot = process.cwd();
  
  // Check for command line flags
  const forceReset = args.includes('--force') || args.includes('-f');
  const ipcOnly = args.includes('--ipc');
  const dbOnly = args.includes('--db');
  const all = args.includes('--all');
  const factory = args.includes('--factory');
  
  if (forceReset) {
    // Non-interactive mode
    if (ipcOnly) {
      await resetIpcData(projectRoot);
    } else if (dbOnly) {
      await resetDatabase(projectRoot);
    } else if (all) {
      await resetAll(projectRoot);
    } else if (factory) {
      await resetToFactory(projectRoot);
    } else {
      // Default: reset all
      await resetAll(projectRoot);
    }
    return;
  }
  
  // Interactive mode
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║              QwQnanoclaw Data Reset                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  console.log('请选择重置选项：\n');
  console.log('  1. 重置 IPC 数据（保留数据库）');
  console.log('     - 清理 data/ipc/ 目录');
  console.log('     - 适合解决 IPC 通信问题\n');
  console.log('  2. 重置数据库（保留 IPC 数据）');
  console.log('     - 删除 store/messages.db');
  console.log('     - 适合清空所有对话历史\n');
  console.log('  3. 重置所有数据（IPC + 数据库 + 日志）');
  console.log('     - 清理所有运行时数据');
  console.log('     - 适合解决严重问题\n');
  console.log('  4. 恢复出厂设置（删除所有用户群组）');
  console.log('     - 删除 groups/qq-c2c-*/ 目录');
  console.log('     - 保留 groups/main 和 groups/global');
  console.log('     - 适合开源发布或完全重置\n');
  console.log('  0. 取消\n');
  
  const choice = await question('请输入选项 (0-4): ');
  
  switch (choice.trim()) {
    case '1':
      await resetIpcData(projectRoot);
      break;
    case '2':
      await resetDatabase(projectRoot);
      break;
    case '3':
      await resetAll(projectRoot);
      break;
    case '4':
      await resetToFactory(projectRoot);
      break;
    default:
      console.log('\n已取消重置操作。\n');
      emitStatus('RESET', {
        STATUS: 'cancelled',
        LOG: 'logs/setup.log',
      });
      process.exit(0);
  }
}

async function resetIpcData(projectRoot: string): Promise<void> {
  console.log('\n📋 重置 IPC 数据...\n');
  
  const ipcDir = path.join(projectRoot, 'data', 'ipc');
  
  if (!fs.existsSync(ipcDir)) {
    console.log('   ℹ IPC 目录不存在，无需重置。\n');
    emitStatus('RESET_IPC', {
      STATUS: 'skipped',
      REASON: 'directory_not_found',
      LOG: 'logs/setup.log',
    });
    return;
  }
  
  try {
    const items = fs.readdirSync(ipcDir);
    for (const item of items) {
      const itemPath = path.join(ipcDir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        fs.rmSync(itemPath, { recursive: true, force: true });
        console.log(`   ✓ 删除目录：${item}`);
      } else {
        fs.unlinkSync(itemPath);
        console.log(`   ✓ 删除文件：${item}`);
      }
    }
    
    console.log('\n   ✓ IPC 数据已重置。\n');
    
    emitStatus('RESET_IPC', {
      STATUS: 'success',
      ITEMS_DELETED: items.length,
      LOG: 'logs/setup.log',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n   ✗ 重置失败：${message}\n`);
    
    emitStatus('RESET_IPC', {
      STATUS: 'failed',
      ERROR: message,
      LOG: 'logs/setup.log',
    });
    process.exit(1);
  }
}

async function resetDatabase(projectRoot: string): Promise<void> {
  console.log('\n📋 重置数据库...\n');
  
  const dbPath = path.join(STORE_DIR, 'messages.db');
  
  if (!fs.existsSync(dbPath)) {
    console.log('   ℹ 数据库文件不存在，无需重置。\n');
    emitStatus('RESET_DATABASE', {
      STATUS: 'skipped',
      REASON: 'file_not_found',
      LOG: 'logs/setup.log',
    });
    return;
  }
  
  try {
    const stats = fs.statSync(dbPath);
    const sizeKb = Math.round(stats.size / 1024);
    
    fs.unlinkSync(dbPath);
    
    console.log(`   ✓ 删除数据库文件：messages.db (${sizeKb} KB)\n`);
    console.log('   ℹ 数据库将在下次运行时自动重建。\n');
    
    emitStatus('RESET_DATABASE', {
      STATUS: 'success',
      DELETED_SIZE_KB: sizeKb,
      LOG: 'logs/setup.log',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n   ✗ 重置失败：${message}\n`);
    
    emitStatus('RESET_DATABASE', {
      STATUS: 'failed',
      ERROR: message,
      LOG: 'logs/setup.log',
    });
    process.exit(1);
  }
}

async function resetAll(projectRoot: string): Promise<void> {
  console.log('\n📋 重置所有数据（IPC + 数据库 + 日志）...\n');
  
  let success = true;
  let itemCount = 0;
  
  // Reset IPC data
  const ipcDir = path.join(projectRoot, 'data', 'ipc');
  if (fs.existsSync(ipcDir)) {
    try {
      const items = fs.readdirSync(ipcDir);
      for (const item of items) {
        const itemPath = path.join(ipcDir, item);
        fs.rmSync(itemPath, { recursive: true, force: true });
        itemCount++;
      }
      console.log('   ✓ IPC 数据已清理');
    } catch (err) {
      console.log('   ⚠ IPC 数据清理失败');
      success = false;
    }
  }
  
  // Reset database
  const dbPath = path.join(STORE_DIR, 'messages.db');
  if (fs.existsSync(dbPath)) {
    try {
      const stats = fs.statSync(dbPath);
      const sizeKb = Math.round(stats.size / 1024);
      fs.unlinkSync(dbPath);
      console.log(`   ✓ 数据库已删除 (${sizeKb} KB)`);
    } catch (err) {
      console.log('   ⚠ 数据库删除失败');
      success = false;
    }
  }
  
  // Reset logs
  const logsDir = path.join(projectRoot, 'logs');
  if (fs.existsSync(logsDir)) {
    try {
      const items = fs.readdirSync(logsDir);
      for (const item of items) {
        const itemPath = path.join(logsDir, item);
        const stat = fs.statSync(itemPath);
        if (stat.isFile()) {
          fs.unlinkSync(itemPath);
          itemCount++;
        }
      }
      console.log('   ✓ 日志文件已清理');
    } catch (err) {
      console.log('   ⚠ 日志清理失败');
      success = false;
    }
  }
  
  if (success) {
    console.log('\n   ✓ 所有数据已重置。\n');
    console.log('   ℹ 数据库和日志将在下次运行时自动重建。\n');
  } else {
    console.log('\n   ⚠ 部分数据重置失败。\n');
  }
  
  emitStatus('RESET_ALL', {
    STATUS: success ? 'success' : 'partial',
    ITEMS_DELETED: itemCount,
    LOG: 'logs/setup.log',
  });
  
  if (!success) {
    process.exit(1);
  }
}

async function resetToFactory(projectRoot: string): Promise<void> {
  console.log('\n📋 恢复出厂设置（删除所有用户群组）...\n');
  console.log('   ⚠️  警告：此操作将删除所有用户特定的群组配置！');
  console.log('   ℹ 保留：groups/main 和 groups/global\n');
  
  const confirm = await question('   确认执行？(输入 yes 确认): ');
  
  if (confirm.trim().toLowerCase() !== 'yes') {
    console.log('\n   已取消操作。\n');
    emitStatus('RESET_FACTORY', {
      STATUS: 'cancelled',
      LOG: 'logs/setup.log',
    });
    return;
  }
  
  const groupsDir = path.join(projectRoot, 'groups');
  
  if (!fs.existsSync(groupsDir)) {
    console.log('\n   ℹ groups 目录不存在。\n');
    emitStatus('RESET_FACTORY', {
      STATUS: 'skipped',
      REASON: 'directory_not_found',
      LOG: 'logs/setup.log',
    });
    return;
  }
  
  let deletedCount = 0;
  const preservedDirs = ['main', 'global'];
  
  try {
    const items = fs.readdirSync(groupsDir);
    
    for (const item of items) {
      const itemPath = path.join(groupsDir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory() && !preservedDirs.includes(item)) {
        fs.rmSync(itemPath, { recursive: true, force: true });
        console.log(`   ✓ 删除群组：${item}`);
        deletedCount++;
      }
    }
    
    console.log(`\n   ✓ 已删除 ${deletedCount} 个用户群组。\n`);
    console.log('   ℹ 保留的群组：');
    console.log('      - groups/main (主群组)');
    console.log('      - groups/global (全局配置)\n');
    
    emitStatus('RESET_FACTORY', {
      STATUS: 'success',
      GROUPS_DELETED: deletedCount,
      PRESERVED: preservedDirs.join(','),
      LOG: 'logs/setup.log',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n   ✗ 重置失败：${message}\n`);
    
    emitStatus('RESET_FACTORY', {
      STATUS: 'failed',
      ERROR: message,
      LOG: 'logs/setup.log',
    });
    process.exit(1);
  }
}
