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

  try {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║              Groups Initialization Wizard                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    // Ask for operation mode
    const mode = await question('请选择配置模式：\n  1. 快速配置主群组（推荐）\n  2. 完整配置向导\n  0. 取消\n\n请输入选项 (0-2): ');
    
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
    } else {
      // Full wizard
      await setupFullWizard(db, rl, question, yesNo);
    }

    // Summary
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    Groups Summary                            ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const groups = db.exec('SELECT folder, jid, name, trigger, requires_trigger FROM registered_groups');
    if (groups.length > 0 && groups[0].values.length > 0) {
      console.log('   Registered groups:');
      groups[0].values.forEach((row: any[]) => {
        const [folder, jid, name, trigger, requiresTrigger] = row;
        console.log(`   - ${name} (${folder})`);
        console.log(`     JID: ${jid}`);
        console.log(`     Trigger: ${trigger}`);
        console.log(`     Requires Trigger: ${requiresTrigger ? 'Yes' : 'No'}`);
        console.log('');
      });
    } else {
      console.log('   No groups registered yet.\n');
    }

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                   Next Steps                                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log('   1. Group directories have been created in groups/ folder');
    console.log('   2. Each group has its own QWEN.md and SYSTEM.md files');
    console.log('   3. You can customize group settings by editing files in groups/<folder>/');
    console.log('   4. Run the application: npm start\n');

    db.close();
    rl.close();

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Groups initialization failed');
    console.error(`\n   ✗ Setup failed: ${message}`);
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
  const stmt = db.prepare(`
    INSERT INTO registered_groups (folder, jid, name, trigger, requires_trigger)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  stmt.run(folder, group.jid, group.name, group.trigger, group.requiresTrigger ? 1 : 0);
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
    console.error('   ✗ 数据库不存在。请先运行应用程序初始化数据库。\n');
    process.exit(1);
  }
  
  console.log('   ✓ 数据库已连接\n');
  
  const mainJid = await question('   请输入群组 JID（例如：qq:group:123456 或 qq:c2c:789012）：');
  const mainName = await question('   请输入群组名称（例如："AI 助手主群"）：');
  const mainTrigger = await question('   请输入触发词（默认：@Andy）：');
  const mainRequiresTrigger = await yesNo('   消息是否需要以触发词开头？', false);

  const mainGroup: GroupInfo = {
    jid: mainJid,
    name: mainName,
    trigger: mainTrigger || '@Andy',
    requiresTrigger: mainRequiresTrigger,
  };

  await registerGroup(db, mainGroup, 'main');
  
  console.log('\n   ✓ 主群组注册成功\n');
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
    console.error('   ✗ 数据库不存在。请先运行应用程序初始化数据库。\n');
    process.exit(1);
  }
  
  console.log('   ✓ 数据库已连接\n');
  
  // Ask for main group
  console.log('📋 步骤 1/3：设置主群组...');
  const hasMainGroup = await yesNo('   是否设置主群组（默认群组）？', true);
  
  if (hasMainGroup) {
    const mainJid = await question('   请输入群组 JID（例如：qq:group:123456 或 qq:c2c:789012）：');
    const mainName = await question('   请输入群组名称（例如："AI 助手主群"）：');
    const mainTrigger = await question('   请输入触发词（默认：@Andy）：');
    const mainRequiresTrigger = await yesNo('   消息是否需要以触发词开头？', false);

    const mainGroup: GroupInfo = {
      jid: mainJid,
      name: mainName,
      trigger: mainTrigger || '@Andy',
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
      const trigger = await question('   请输入触发词（默认：@Andy）：');
      const requiresTrigger = await yesNo('   消息是否需要以触发词开头？', false);

      const folderName = `group-${groupCount}-${Date.now()}`;
      const group: GroupInfo = {
        jid,
        name,
        trigger: trigger || '@Andy',
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

  const groups = db.exec('SELECT folder, jid, name, trigger, requires_trigger FROM registered_groups');
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
