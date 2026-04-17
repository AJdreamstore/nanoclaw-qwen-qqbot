/**
 * Config Manager - Daily configuration management tool
 * 
 * Usage: npx tsx setup/config-manager.ts [command]
 * Commands:
 *   - name: Change assistant name
 *   - language: Change AI interaction language
 *   - show: Show current configuration
 */

import * as readline from 'readline';
import fs from 'fs';
import path from 'path';

function question(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function readEnvFile(): string {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env 文件不存在，请先运行安装程序');
    process.exit(1);
  }
  return fs.readFileSync(envPath, 'utf-8');
}

function writeEnvFile(content: string): void {
  const envPath = path.join(process.cwd(), '.env');
  fs.writeFileSync(envPath, content);
}

function showCurrentConfig(): void {
  const envContent = readEnvFile();
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    当前配置                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  // Extract ASSISTANT_NAME from global SYSTEM.md
  const globalSystemMd = path.join(process.cwd(), 'groups', 'global', 'SYSTEM.md');
  if (fs.existsSync(globalSystemMd)) {
    const content = fs.readFileSync(globalSystemMd, 'utf-8');
    const nameMatch = content.match(/^You are (\w+),/);
    if (nameMatch) {
      console.log(`   助手名称：${nameMatch[1]}`);
    }
  }
  
  // Extract AI_LANGUAGE from .env
  const langMatch = envContent.match(/AI_LANGUAGE=(.*)/);
  if (langMatch) {
    console.log(`   AI 语言：${langMatch[1].trim()}`);
  }
  
  console.log('');
}

async function configureAssistantName(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    配置助手名称                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  const currentNameMatch = fs.readFileSync(path.join(process.cwd(), 'groups', 'global', 'SYSTEM.md'), 'utf-8').match(/^You are (\w+),/);
  const currentName = currentNameMatch ? currentNameMatch[1] : '未知';
  
  console.log(`   当前名称：${currentName}`);
  console.log('');
  
  const newName = await question('   请输入新的助手名称（例如：Andy, Nova, Luna 等）: ');
  
  if (!newName.trim()) {
    console.log('\n   ❌ 名称不能为空\n');
    process.exit(1);
  }
  
  // Update global SYSTEM.md
  const globalSystemMd = path.join(process.cwd(), 'groups', 'global', 'SYSTEM.md');
  if (fs.existsSync(globalSystemMd)) {
    let content = fs.readFileSync(globalSystemMd, 'utf-8');
    content = content.replace(/^You are \w+,/m, `You are ${newName.trim()},`);
    fs.writeFileSync(globalSystemMd, content);
    console.log(`   ✓ 已更新 SYSTEM.md 中的助手名称：${newName.trim()}`);
  }
  
  // Update global QWEN.md
  const globalQwenMd = path.join(process.cwd(), 'groups', 'global', 'QWEN.md');
  if (fs.existsSync(globalQwenMd)) {
    let content = fs.readFileSync(globalQwenMd, 'utf-8');
    // Update title if it contains assistant name
    content = content.replace(/# \w+ - Project Context/m, `# ${newName.trim()} - Project Context`);
    fs.writeFileSync(globalQwenMd, content);
    console.log(`   ✓ 已更新 QWEN.md 中的助手名称`);
  }
  
  console.log('\n   ℹ 重启后生效\n');
}

async function configureLanguage(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    配置 AI 交互语言                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  const envContent = readEnvFile();
  const currentLangMatch = envContent.match(/AI_LANGUAGE=(.*)/);
  const currentLang = currentLangMatch ? currentLangMatch[1].trim() : '未设置';
  
  console.log(`   当前语言：${currentLang}`);
  console.log('');
  console.log('   常用语言选项：');
  console.log('   1. 中文 (Chinese)');
  console.log('   2. 英文 (English)');
  console.log('   3. 日文 (日本語)');
  console.log('   4. 韩文 (한국어)');
  console.log('   5. 法文 (Français)');
  console.log('   6. 德文 (Deutsch)');
  console.log('   7. 西班牙文 (Español)');
  console.log('   8. 其他语言');
  console.log('');
  
  const langChoice = await question('   请选择语言 (1-8): ');
  
  let selectedLanguage: string;
  
  switch (langChoice.trim()) {
    case '1':
      selectedLanguage = '中文 (Chinese)';
      break;
    case '2':
      selectedLanguage = 'English';
      break;
    case '3':
      selectedLanguage = '日文 (日本語)';
      break;
    case '4':
      selectedLanguage = '韩文 (한국어)';
      break;
    case '5':
      selectedLanguage = '法文 (Français)';
      break;
    case '6':
      selectedLanguage = '德文 (Deutsch)';
      break;
    case '7':
      selectedLanguage = '西班牙文 (Español)';
      break;
    case '8':
    default:
      selectedLanguage = await question('   请输入语言名称（例如：Russian, Arabic, Thai 等）：');
      break;
  }
  
  // Update .env
  let updatedEnv = envContent;
  if (updatedEnv.includes('AI_LANGUAGE=')) {
    updatedEnv = updatedEnv.replace(/AI_LANGUAGE=.*/, `AI_LANGUAGE=${selectedLanguage}`);
  } else {
    updatedEnv += `\nAI_LANGUAGE=${selectedLanguage}`;
  }
  writeEnvFile(updatedEnv);
  console.log(`   ✓ 已更新 .env 中的语言设置：${selectedLanguage}`);
  
  // Update global SYSTEM.md with language instruction
  const globalSystemMd = path.join(process.cwd(), 'groups', 'global', 'SYSTEM.md');
  if (fs.existsSync(globalSystemMd)) {
    let content = fs.readFileSync(globalSystemMd, 'utf-8');
    
    // Remove existing language section if it exists
    content = content.replace(/\n## Language\s+[\s\S]*?(?=\n##|\n$|$)/gi, '');
    
    // Add new language section after Core Rules
    const languageSection = `\n## Language\nYou MUST communicate with users in **${selectedLanguage}** at all times.\n`;
    
    const coreRulesMatch = content.match(/## Core Rules\s+[\s\S]*?(?=\n##)/);
    if (coreRulesMatch) {
      const insertPos = coreRulesMatch.index! + coreRulesMatch[0].length;
      content = content.slice(0, insertPos) + languageSection + content.slice(insertPos);
    } else {
      content = content.replace(/^(\S.*\n)/, `$1${languageSection}`);
    }
    
    fs.writeFileSync(globalSystemMd, content);
    console.log('   ✓ 已更新 SYSTEM.md 中的语言设置');
  }
  
  // Update global QWEN.md with language instruction
  const globalQwenMd = path.join(process.cwd(), 'groups', 'global', 'QWEN.md');
  if (fs.existsSync(globalQwenMd)) {
    let content = fs.readFileSync(globalQwenMd, 'utf-8');
    
    // Remove existing language section if it exists
    content = content.replace(/\n## Output Language\s+[\s\S]*?(?=\n##|\n$|$)/gi, '');
    
    // Add language section after Overview with clear, detailed instructions
    const languageSection = `\n## Output Language
**You MUST always communicate with users in: ${selectedLanguage}**

This is the primary language for all interactions, responses, and output.
Do not switch to other languages unless explicitly requested by the user.
`;
    
    const overviewMatch = content.match(/## Overview\s+[\s\S]*?(?=\n##)/);
    if (overviewMatch) {
      const insertPos = overviewMatch.index! + overviewMatch[0].length;
      content = content.slice(0, insertPos) + languageSection + content.slice(insertPos);
    } else {
      content = content.replace(/^(\S.*\n)/, `$1${languageSection}`);
    }
    
    fs.writeFileSync(globalQwenMd, content);
    console.log('   ✓ 已更新 QWEN.md 中的语言设置');
  }
  
  console.log('\n   ℹ 重启后生效\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command) {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    配置管理器                                ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log('   用法：npx tsx setup/config-manager.ts [命令]\n');
    console.log('   可用命令：');
    console.log('     name      - 配置助手名称');
    console.log('     language  - 配置 AI 交互语言');
    console.log('     show      - 显示当前配置');
    console.log('     help      - 显示帮助信息\n');
    console.log('   示例：');
    console.log('     npx tsx setup/config-manager.ts name');
    console.log('     npx tsx setup/config-manager.ts language');
    console.log('     npx tsx setup/config-manager.ts show\n');
    process.exit(0);
  }
  
  switch (command) {
    case 'name':
      await configureAssistantName();
      break;
    case 'language':
      await configureLanguage();
      break;
    case 'show':
      showCurrentConfig();
      break;
    case 'help':
    case '-h':
    case '--help':
      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║                    配置管理器帮助                            ║');
      console.log('╚══════════════════════════════════════════════════════════════╝\n');
      console.log('   用法：npx tsx setup/config-manager.ts [命令]\n');
      console.log('   可用命令：');
      console.log('     name      - 配置助手名称');
      console.log('     language  - 配置 AI 交互语言');
      console.log('     show      - 显示当前配置');
      console.log('     help      - 显示帮助信息\n');
      console.log('   示例：');
      console.log('     npx tsx setup/config-manager.ts name');
      console.log('     npx tsx setup/config-manager.ts language');
      console.log('     npx tsx setup/config-manager.ts show\n');
      break;
    default:
      console.error(`\n   ❌ 未知命令：${command}\n`);
      console.log('   运行 "npx tsx setup/config-manager.ts help" 查看帮助\n');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ 发生错误:', err.message);
  process.exit(1);
});
