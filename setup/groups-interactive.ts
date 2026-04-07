/**
 * Step: groups-interactive — Interactive wizard to initialize groups
 */
import * as readline from 'readline';
import path from 'path';
import fs from 'fs';

import { DATA_DIR, STORE_DIR } from '../src/config.js';
import { logger } from '../src/logger.js';
import { emitStatus } from './status.js';
import { Database } from './db-helper.js';

interface GroupInfo {
  jid: string;
  name: string;
  trigger?: string;
  requiresTrigger: boolean;
}

export async function run(_args: string[]): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, (answer) => {
        resolve(answer);
      });
    });
  };

  const yesNo = (query: string, defaultYes: boolean = true): Promise<boolean> => {
    return new Promise((resolve) => {
      rl.question(query + (defaultYes ? ' [Y/n] ' : ' [y/N] '), (answer) => {
        const ans = answer.trim().toLowerCase();
        if (ans === 'y' || ans === 'yes') {
          resolve(true);
        } else if (ans === 'n' || ans === 'no') {
          resolve(false);
        } else {
          resolve(defaultYes);
        }
      });
    });
  };

  try {
    // Temporarily suppress info logs during setup
    const originalLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'error';
    logger.level = 'error'; // Directly set logger level
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║              Groups Initialization Wizard                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    // Initialize database
    const dbPath = path.join(STORE_DIR, 'messages.db');
    if (!fs.existsSync(dbPath)) {
      console.log('   ℹ 数据库不存在，正在初始化...\n');
      
      // Create store directory if it doesn't exist
      if (!fs.existsSync(STORE_DIR)) {
        fs.mkdirSync(STORE_DIR, { recursive: true });
      }
      
      // Import and initialize database
      const { Database } = await import('./db-helper.js');
      const db = new Database(dbPath);
      await db.initialize();
      
      console.log('   ✓ 数据库已初始化\n');
    }
    
    const db = new Database(dbPath);
    await db.initialize();
    
    console.log('   ✓ 数据库已连接\n');
    
    // Check if there are existing groups
    const existingGroups = db.exec('SELECT folder, jid, name FROM registered_groups');
    const hasExistingGroups = existingGroups.length > 0 && existingGroups[0].values.length > 0;
    
    if (hasExistingGroups) {
      console.log('⚠  检测到已配置的群组：\n');
      existingGroups[0].values.forEach((row: any[]) => {
        const [folder, jid, name] = row;
        console.log(`   - ${name} (${folder})`);
      });
      console.log('');
      
      const action = await question('请选择操作：\n  1. 添加新群组\n  2. 删除所有群组并重新配置\n  0. 取消\n\n请输入选项 (0-2): ');
      
      if (action.trim() === '0') {
        console.log('\n已取消配置。\n');
        emitStatus('GROUPS_INIT', {
          STATUS: 'cancelled',
          LOG: 'logs/setup.log',
        });
        process.exit(0);
      } else if (action.trim() === '2') {
        // Delete all groups with warning
        console.log('\n⚠️  ⚠️  ⚠️  警告 ⚠️  ⚠️  ⚠️');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('   此操作将删除：');
        console.log('   1. 数据库中所有群组记录');
        console.log('   2. groups/ 目录下所有群组文件夹');
        console.log('');
        console.log('   ⚠️  删除后无法恢复！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        const confirm = await question('   确定要删除所有群组吗？（输入 "yes" 确认）: ');
        
        if (confirm.toLowerCase() === 'yes') {
          // Delete all groups
          console.log('\n   正在删除所有群组...');
          
          // Delete from database
          db.exec('DELETE FROM registered_groups');
          
          // Delete group folders (except global)
          const groupsDir = path.join(process.cwd(), 'groups');
          if (fs.existsSync(groupsDir)) {
            const folders = fs.readdirSync(groupsDir);
            for (const folder of folders) {
              if (folder !== 'global') {
                const folderPath = path.join(groupsDir, folder);
                const stat = fs.statSync(folderPath);
                if (stat.isDirectory()) {
                  fs.rmSync(folderPath, { recursive: true, force: true });
                  console.log(`   ✓ 已删除：${folder}`);
                }
              }
            }
          }
          
          console.log('   ✓ 已删除所有群组\n');
        } else {
          console.log('\n   已取消删除操作。\n');
        }
      }
    }
    
    // Small delay to ensure stdin is ready
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Ask for operation mode
    const mode = await question('请选择配置模式：\n  1. 快速配置主群组（推荐新手）\n  2. 快速配置单个普通群组\n  3. 完整配置向导（主群组 + 多个普通群组）\n  0. 取消\n\n请输入选项 (0-3): ');
    
    if (mode.trim() === '0') {
      console.log('\n已取消配置。\n');
      emitStatus('GROUPS_INIT', {
        STATUS: 'cancelled',
        LOG: 'logs/setup.log',
      });
      process.exit(0);
    }
    
    if (mode.trim() === '1') {
      // Quick main group setup
      await setupMainGroupQuick(db, rl, question, yesNo);
    } else if (mode.trim() === '2') {
      // Quick single group setup (no main group)
      await setupSingleGroup(db, rl, question, yesNo);
    } else if (mode.trim() === '3') {
      // Full wizard
      await setupFullWizard(db, rl, question, yesNo);
    } else {
      console.log('\n无效的选项，已取消配置。\n');
      process.exit(0);
    }

    // Summary
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    群组配置总结                              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const groups = db.exec('SELECT folder, jid, name, trigger_pattern, requires_trigger FROM registered_groups');
    if (groups.length > 0 && groups[0].values.length > 0) {
      console.log('   已注册的群组：');
      groups[0].values.forEach((row: any[]) => {
        const [folder, jid, name, trigger, requiresTrigger] = row;
        console.log(`   - ${name} (${folder})`);
        console.log(`     JID: ${jid}`);
        console.log(`     触发词：${trigger}`);
        console.log(`     需要触发词：${requiresTrigger ? '是' : '否'}`);
        console.log('');
      });
    } else {
      console.log('   尚未注册群组。\n');
    }

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    下一步                                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log('   1. 群组目录已在 groups/ 文件夹中创建');
    console.log('   2. 每个群组都有自己的 QWEN.md 和 SYSTEM.md 文件');
    console.log('   3. 您可以通过编辑 groups/<folder>/ 中的文件来自定义群组设置');
    console.log('   4. 启动机器人：npm start\n');

    db.close();
    rl.close();

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, '群组初始化失败');
    console.error(`\n   ✗ 配置失败：${message}`);
    rl.close();
    process.exit(1);
  }
}

/**
 * Register a group in the database and create its folder
 */
async function registerGroup(
  db: Database,
  group: GroupInfo,
  folder: string,
): Promise<void> {
  // Create group folder
  const groupsDir = path.join(process.cwd(), 'groups', folder);
  fs.mkdirSync(groupsDir, { recursive: true });

  // Copy global QWEN.md and SYSTEM.md if they exist
  const globalQwenMd = path.join(process.cwd(), 'groups', 'global', 'QWEN.md');
  const globalSystemMd = path.join(process.cwd(), 'groups', 'global', 'SYSTEM.md');
  
  if (fs.existsSync(globalQwenMd)) {
    const qwenMdContent = fs.readFileSync(globalQwenMd, 'utf-8');
    fs.writeFileSync(path.join(groupsDir, 'QWEN.md'), qwenMdContent);
  }
  
  if (fs.existsSync(globalSystemMd)) {
    const systemMdContent = fs.readFileSync(globalSystemMd, 'utf-8');
    fs.writeFileSync(path.join(groupsDir, 'SYSTEM.md'), systemMdContent);
  }

  // Insert into database
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO registered_groups (folder, jid, name, trigger_pattern, requires_trigger, added_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(folder, group.jid, group.name, group.trigger, group.requiresTrigger ? 1 : 0, now);
}

/**
 * Quick main group setup
 */
async function setupMainGroupQuick(
  db: Database,
  rl: readline.Interface,
  question: (query: string) => Promise<string>,
  yesNo: (query: string, defaultYes?: boolean) => Promise<boolean>,
): Promise<void> {
  console.log('\n📋 快速配置主群组\n');
  
  // Check database
  const dbPath = path.join(STORE_DIR, 'messages.db');
  if (!fs.existsSync(dbPath)) {
    console.log('   ℹ 数据库不存在，正在初始化...\n');
    if (!fs.existsSync(STORE_DIR)) {
      fs.mkdirSync(STORE_DIR, { recursive: true });
    }
    const db = new Database(dbPath);
    await db.initialize();
    console.log('   ✓ 数据库已初始化\n');
  }
  
  console.log('   ✓ 数据库已连接\n');
  
  // Ask for assistant name first
  console.log('📋 AI 助手配置：');
  const assistantName = await question('   请输入 AI 助手的称呼（例如：小梅、Andy）：');
  
  // Update global SYSTEM.md with assistant name
  const globalSystemMd = path.join(process.cwd(), 'groups', 'global', 'SYSTEM.md');
  if (fs.existsSync(globalSystemMd)) {
    let systemContent = fs.readFileSync(globalSystemMd, 'utf-8');
    // Replace assistant name in SYSTEM.md
    systemContent = systemContent.replace(/You are \w+/i, `You are ${assistantName}`);
    systemContent = systemContent.replace(/your name is \w+/i, `your name is ${assistantName}`);
    fs.writeFileSync(globalSystemMd, systemContent);
    console.log(`   ✓ 已更新 AI 称呼为：${assistantName}\n`);
  }
  
  // Generate random JID and group name
  const randomNum = Math.floor(100000 + Math.random() * 900000); // 6 位随机数
  const suggestedJid = `qq:group:${randomNum}`;
  const suggestedName = `${assistantName}主群-${randomNum}`;
  
  console.log(`   推荐配置：`);
  console.log(`   - JID: ${suggestedJid}`);
  console.log(`   - 群组名称：${suggestedName}`);
  console.log('');
  
  const useSuggested = await yesNo('   是否使用推荐配置？（推荐）', true);
  
  let mainJid: string;
  let mainName: string;
  
  if (useSuggested) {
    mainJid = suggestedJid;
    mainName = suggestedName;
    console.log('   ✓ 使用推荐配置');
  } else {
    mainJid = await question('   请输入群组 JID（例如：qq:group:123456 或 qq:c2c:789012）：');
    mainName = await question(`   请输入群组名称（例如："${assistantName}主群"）：`);
  }
  
  const mainTrigger = await question(`   请输入触发词（默认：@${assistantName}）：`);
  const mainRequiresTrigger = await yesNo('   消息是否需要以触发词开头？', false);

  const mainGroup: GroupInfo = {
    jid: mainJid,
    name: mainName,
    trigger: mainTrigger || `@${assistantName}`,
    requiresTrigger: mainRequiresTrigger,
  };

  await registerGroup(db, mainGroup, 'main');
  
  console.log('\n   ✓ 主群组注册成功\n');
  printSummary(db);
}

/**
 * Quick single group setup (no main group)
 */
async function setupSingleGroup(
  db: Database,
  rl: readline.Interface,
  question: (query: string) => Promise<string>,
  yesNo: (query: string, defaultYes?: boolean) => Promise<boolean>,
): Promise<void> {
  console.log('\n📋 快速配置单个普通群组\n');
  
  // Check database
  const dbPath = path.join(STORE_DIR, 'messages.db');
  if (!fs.existsSync(dbPath)) {
    console.log('   ℹ 数据库不存在，正在初始化...\n');
    if (!fs.existsSync(STORE_DIR)) {
      fs.mkdirSync(STORE_DIR, { recursive: true });
    }
    const db = new Database(dbPath);
    await db.initialize();
    console.log('   ✓ 数据库已初始化\n');
  }
  
  console.log('   ✓ 数据库已连接\n');
  
  // Ask for assistant name first
  console.log('📋 AI 助手配置：');
  const assistantName = await question('   请输入 AI 助手的称呼（例如：小梅、Andy）：');
  
  // Update global SYSTEM.md with assistant name
  const globalSystemMd = path.join(process.cwd(), 'groups', 'global', 'SYSTEM.md');
  if (fs.existsSync(globalSystemMd)) {
    let systemContent = fs.readFileSync(globalSystemMd, 'utf-8');
    systemContent = systemContent.replace(/You are \w+/i, `You are ${assistantName}`);
    systemContent = systemContent.replace(/your name is \w+/i, `your name is ${assistantName}`);
    fs.writeFileSync(globalSystemMd, systemContent);
    console.log(`   ✓ 已更新 AI 称呼为：${assistantName}\n`);
  }
  
  // Generate random JID and group name
  const randomNum = Math.floor(100000 + Math.random() * 900000); // 6 位随机数
  const suggestedJid = `qq:group:${randomNum}`;
  const suggestedName = `${assistantName}群组-${randomNum}`;
  
  console.log(`   推荐配置：`);
  console.log(`   - JID: ${suggestedJid}`);
  console.log(`   - 群组名称：${suggestedName}`);
  console.log('');
  
  const useSuggested = await yesNo('   是否使用推荐配置？（推荐）', true);
  
  let groupJid: string;
  let groupName: string;
  
  if (useSuggested) {
    groupJid = suggestedJid;
    groupName = suggestedName;
    console.log('   ✓ 使用推荐配置');
  } else {
    groupJid = await question('   请输入群组 JID（例如：qq:group:123456 或 qq:c2c:789012）：');
    groupName = await question(`   请输入群组名称（例如："${assistantName}测试群"）：`);
  }
  
  const groupTrigger = await question(`   请输入触发词（默认：@${assistantName}）：`);
  const groupRequiresTrigger = await yesNo('   消息是否需要以触发词开头？', false);

  // Generate folder name
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 6);
  const folderName = `qq-group-${timestamp}-${randomId}`;

  const group: GroupInfo = {
    jid: groupJid,
    name: groupName,
    trigger: groupTrigger || `@${assistantName}`,
    requiresTrigger: groupRequiresTrigger,
  };

  await registerGroup(db, group, folderName);
  
  console.log(`\n   ✓ 普通群组注册成功（目录：${folderName}）\n`);
  printSummary(db);
}

/**
 * Full wizard setup
 */
async function setupFullWizard(
  db: Database,
  rl: readline.Interface,
  question: (query: string) => Promise<string>,
  yesNo: (query: string, defaultYes?: boolean) => Promise<boolean>,
): Promise<void> {
  console.log('\n📋 完整配置向导\n');
  
  // Check database
  const dbPath = path.join(STORE_DIR, 'messages.db');
  if (!fs.existsSync(dbPath)) {
    console.log('   ℹ 数据库不存在，正在初始化...\n');
    if (!fs.existsSync(STORE_DIR)) {
      fs.mkdirSync(STORE_DIR, { recursive: true });
    }
    const db = new Database(dbPath);
    await db.initialize();
    console.log('   ✓ 数据库已初始化\n');
  }
  
  console.log('   ✓ 数据库已连接\n');
  
  // Ask for assistant name first
  console.log('📋 AI 助手配置：');
  const assistantName = await question('   请输入 AI 助手的称呼（例如：小梅、Andy）：');
  
  // Update global SYSTEM.md with assistant name
  const globalSystemMd = path.join(process.cwd(), 'groups', 'global', 'SYSTEM.md');
  if (fs.existsSync(globalSystemMd)) {
    let systemContent = fs.readFileSync(globalSystemMd, 'utf-8');
    systemContent = systemContent.replace(/You are \w+/i, `You are ${assistantName}`);
    systemContent = systemContent.replace(/your name is \w+/i, `your name is ${assistantName}`);
    fs.writeFileSync(globalSystemMd, systemContent);
    console.log(`   ✓ 已更新 AI 称呼为：${assistantName}\n`);
  }
  
  // Ask for main group
  console.log('📋 步骤 1/3：设置主群组...');
  const hasMainGroup = await yesNo('   是否设置主群组（默认群组）？', true);
  
  if (hasMainGroup) {
    const mainJid = await question('   请输入群组 JID（例如：qq:group:123456 或 qq:c2c:789012）：');
    const mainName = await question(`   请输入群组名称（例如："${assistantName}主群"）：`);
    const mainTrigger = await question(`   请输入触发词（默认：@${assistantName}）：`);
    const mainRequiresTrigger = await yesNo('   消息是否需要以触发词开头？', false);

    const mainGroup: GroupInfo = {
      jid: mainJid,
      name: mainName,
      trigger: mainTrigger || `@${assistantName}`,
      requiresTrigger: mainRequiresTrigger,
    };

    await registerGroup(db, mainGroup, 'main');
    console.log('   ✓ 主群组已注册\n');
  } else {
    console.log('   ℹ 跳过主群组设置\n');
  }

  // Ask for additional groups
  console.log('📋 步骤 2/3：添加额外群组...');
  const hasMoreGroups = await yesNo('   是否添加更多群组？', false);
  
  if (hasMoreGroups) {
    let groupCount = 1;
    let continueAdding = true;

    while (continueAdding) {
      console.log(`\n   --- 群组 #${groupCount} ---`);
      const jid = await question('   请输入群组 JID：');
      const name = await question('   请输入群组名称：');
      const trigger = await question(`   请输入触发词（默认：@${assistantName}）：`);
      const requiresTrigger = await yesNo('   消息是否需要以触发词开头？', false);

      const folderName = `group-${groupCount}-${Date.now()}`;
      const group: GroupInfo = {
        jid,
        name,
        trigger: trigger || `@${assistantName}`,
        requiresTrigger,
      };

      await registerGroup(db, group, folderName);
      console.log(`   ✓ 群组 "${name}" 已注册`);

      continueAdding = await yesNo('\n   是否添加另一个群组？', false);
      groupCount++;
    }
  } else {
    console.log('   ℹ 不添加额外群组\n');
  }
  
  console.log('\n📋 步骤 3/3：完成\n');
  printSummary(db);
}

/**
 * Print summary
 */
function printSummary(db: Database): void {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    群组配置摘要                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const groups = db.exec('SELECT folder, jid, name, trigger_pattern, requires_trigger FROM registered_groups');
  if (groups.length > 0 && groups[0].values.length > 0) {
    console.log('   已注册的群组：');
    groups[0].values.forEach((row: any[]) => {
      const [folder, jid, name, trigger, requiresTrigger] = row;
      console.log(`   - ${name} (${folder})`);
      console.log(`     JID: ${jid}`);
      console.log(`     触发词：${trigger}`);
      console.log(`     需要触发词：${requiresTrigger ? '是' : '否'}`);
      console.log('');
    });
  } else {
    console.log('   还没有注册群组。\n');
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                   下一步                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log('   1. 群组目录已在 groups/ 文件夹中创建');
  console.log('   2. 每个群组都有自己的 QWEN.md 和 SYSTEM.md 文件');
  console.log('   3. 可以通过编辑 groups/<folder>/ 中的文件来自定义群组设置');
  console.log('   4. 运行应用程序：npm start\n');
}
