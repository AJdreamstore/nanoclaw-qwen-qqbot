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
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(STORE_DIR)) {
        fs.mkdirSync(STORE_DIR, { recursive: true });
      }
      
      // Import and initialize database with create option
      const { Database } = await import('./db-helper.js');
      const db = new Database(dbPath, { create: true });
      await db.initialize();
      
      console.log('   ✓ 数据库已初始化\n');
  }
  
  const db = new Database(dbPath);
  await db.initialize();
  
  console.log('   ✓ 数据库已连接\n');
  
  // Ensure groups/global directory and files exist
  const globalDir = path.join(process.cwd(), 'groups', 'global');
  if (!fs.existsSync(globalDir)) {
    fs.mkdirSync(globalDir, { recursive: true });
    console.log('   ✓ 已创建全局目录：groups/global/\n');
  }
  
  // Ensure QWEN.md exists
  const globalQwenMd = path.join(globalDir, 'QWEN.md');
  if (!fs.existsSync(globalQwenMd)) {
    const defaultQwenMd = `# QwQnanoclaw - Project Context

## Overview
QQ chat bot powered by Qwen Code.

## Rules
- Messages via QQ protocol
- Keep responses concise
- Use \`<internal>\` for internal thoughts

## Capabilities
- Chat and answer questions
- Web search and URL fetch
- **Browse the web** with \`agent-browser\`
- File read/write in workspace
- Run sandbox commands
- Schedule recurring tasks
- Send messages via MCP tools

## Workspace
- \`/workspace/group/\` → \`groups/<group-folder>/\` (writable)
- \`/workspace/global/\` → \`groups/global/\` (read-only for non-main groups)
- \`/workspace/project/\` → Project root (read-only for main group)

## Memory
- Group-specific memory: \`groups/<group-folder>/QWEN.md\`
- Global memory: \`groups/global/QWEN.md\` (this file)
- Conversation history: stored in database, searchable via Qwen Code

---
*Note: You can add project-specific instructions below this line.*
`;
    fs.writeFileSync(globalQwenMd, defaultQwenMd);
    console.log('   ✓ 已创建默认 QWEN.md\n');
  }
  
  // Ensure SYSTEM.md exists
  const globalSystemMd = path.join(globalDir, 'SYSTEM.md');
  if (!fs.existsSync(globalSystemMd)) {
    const defaultSystemMd = `You are Qwen Code, a helpful AI assistant integrated with QQ chat.

## Core Rules
- Follow project conventions; verify before assuming
- Keep code idiomatic and well-structured
- Be proactive but confirm ambiguous requests
- Use absolute paths for file operations
- Stay in workspace unless granted permission

## Communication
- Be concise (mobile-friendly)
- Use \`<internal>\` tags for internal thoughts (not shown to user)
- No summaries unless asked

### Send Message Tool
You have \`mcp__nanoclaw__send_message\` to send messages immediately while working.

### Internal Thoughts
Use \`<internal>\` tags for reasoning:
\`\`\`
<internal>Analyzing the code structure...</internal>

Here's what I found...
\`\`\`

## Capabilities
- Answer questions and have conversations
- Search web and fetch content from URLs
- **Browse the web** with \`agent-browser\` tool
- Read/write files in workspace
- Run commands in sandbox environment
- Schedule tasks to run later/recursively
- Send messages via MCP tools

## Workspace
Your workspace is \`groups/<group-folder>/\` - this is your sandbox.

### Directory Mounts
- \`/workspace/group/\` → Your group folder (writable)
- \`/workspace/global/\` → Global memory (read-only for non-main)
- \`/workspace/project/\` → Project root (read-only, main group only)

## Memory System
- Use \`conversations/\` folder for conversation history
- Create structured files for important data (e.g., \`customers.md\`, \`preferences.md\`)
- Split files larger than 500 lines into folders
- Maintain index files for organized memory
`;
    fs.writeFileSync(globalSystemMd, defaultSystemMd);
    console.log('   ✓ 已创建默认 SYSTEM.md\n');
  }
    
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
    const mode = await question('请选择配置模式：\n  1. 创建主群组（可选）\n  2. 配置全局称呼\n  0. 取消\n\n请输入选项 (0-2): ');
    
    if (mode.trim() === '0') {
      console.log('\n已取消配置。\n');
      emitStatus('GROUPS_INIT', {
        STATUS: 'cancelled',
        LOG: 'logs/setup.log',
      });
      process.exit(0);
    }
    
    if (mode.trim() === '1') {
      // Create main group
      await setupMainGroup(db, rl, question, yesNo);
    } else if (mode.trim() === '2') {
      // Configure global assistant name
      await configureGlobalAssistantName(question);
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
  assistantName?: string,
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
    let systemMdContent = fs.readFileSync(globalSystemMd, 'utf-8');
    
    // If assistant name is provided, replace it in the group's SYSTEM.md
    if (assistantName) {
      systemMdContent = systemMdContent.replace(/You are \w+/i, `You are ${assistantName}`);
      systemMdContent = systemMdContent.replace(/your name is \w+/i, `your name is ${assistantName}`);
    }
    
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
 * Setup main group (optional)
 */
async function setupMainGroup(
  db: Database,
  rl: readline.Interface,
  question: (query: string) => Promise<string>,
  yesNo: (query: string, defaultYes?: boolean) => Promise<boolean>,
): Promise<void> {
  console.log('\n📋 创建主群组\n');
  
  const createMain = await yesNo('   是否创建主群组？（推荐）', true);
  
  if (createMain) {
    // Create main directory
    const mainDir = path.join(process.cwd(), 'groups', 'main');
    fs.mkdirSync(mainDir, { recursive: true });
    
    // Copy global config files
    const globalQwenMd = path.join(process.cwd(), 'groups', 'global', 'QWEN.md');
    const globalSystemMd = path.join(process.cwd(), 'groups', 'global', 'SYSTEM.md');
    
    if (fs.existsSync(globalQwenMd)) {
      fs.writeFileSync(path.join(mainDir, 'QWEN.md'), fs.readFileSync(globalQwenMd, 'utf-8'));
      console.log('   ✓ 已复制 QWEN.md 到主群目录');
    }
    
    if (fs.existsSync(globalSystemMd)) {
      fs.writeFileSync(path.join(mainDir, 'SYSTEM.md'), fs.readFileSync(globalSystemMd, 'utf-8'));
      console.log('   ✓ 已复制 SYSTEM.md 到主群目录');
    }
    
    // Write to .env
    const envPath = path.join(process.cwd(), '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    
    // Update or add MAIN_GROUP_FOLDER
    if (envContent.includes('MAIN_GROUP_FOLDER=')) {
      envContent = envContent.replace(/MAIN_GROUP_FOLDER=.*/, 'MAIN_GROUP_FOLDER=main');
    } else {
      envContent += '\nMAIN_GROUP_FOLDER=main';
    }
    
    // Update or add MAIN_GROUP_QQ_ID (leave empty for user to fill)
    if (envContent.includes('MAIN_GROUP_QQ_ID=')) {
      envContent = envContent.replace(/MAIN_GROUP_QQ_ID=.*/, 'MAIN_GROUP_QQ_ID=');
    } else {
      envContent += '\nMAIN_GROUP_QQ_ID=';
    }
    
    fs.writeFileSync(envPath, envContent);
    
    console.log('   ✓ 主群目录已创建：groups/main/');
    console.log('   ℹ 请在 .env 中填写主群 QQ ID（纯 ID，不带前缀）：');
    console.log('      MAIN_GROUP_QQ_ID=39A9A36FBD012BB43018C1CC7B0B6CC3');
  } else {
    console.log('   ℹ 未创建主群组，后续可手动创建');
  }
}

/**
 * Configure global assistant name
 */
async function configureGlobalAssistantName(
  question: (query: string) => Promise<string>,
): Promise<void> {
  console.log('\n📋 配置全局称呼\n');
  
  const assistantName = await question('   请输入 AI 助手的称呼（例如：小梅、Andy）：');
  
  // Update groups/global/SYSTEM.md
  const globalSystemMd = path.join(process.cwd(), 'groups', 'global', 'SYSTEM.md');
  if (fs.existsSync(globalSystemMd)) {
    let content = fs.readFileSync(globalSystemMd, 'utf-8');
    content = content.replace(/You are \w+/gi, `You are ${assistantName}`);
    content = content.replace(/your name is \w+/gi, `your name is ${assistantName}`);
    fs.writeFileSync(globalSystemMd, content);
    console.log('   ✓ 已更新 SYSTEM.md 中的称呼');
  }
  
  // Update groups/global/QWEN.md if needed
  const globalQwenMd = path.join(process.cwd(), 'groups', 'global', 'QWEN.md');
  if (fs.existsSync(globalQwenMd)) {
    let content = fs.readFileSync(globalQwenMd, 'utf-8');
    // Update any references to assistant name in QWEN.md
    // This is optional, depending on the content
    console.log('   ✓ 已检查 QWEN.md');
  }
  
  console.log(`   ✓ 全局称呼已配置为：${assistantName}`);
  console.log('   ℹ 重启后生效');
}
  console.log('📋 AI 助手配置：');
  const assistantName = await question('   请输入 AI 助手的称呼（例如：小梅、Andy）：');
  
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

  await registerGroup(db, group, folderName, assistantName);
  
  console.log(`\n   ✓ 普通群组注册成功（目录：${folderName}）\n`);
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
