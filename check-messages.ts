import 'dotenv/config';
import { initDatabase, getAllMessages, getRecentHistory } from './src/db.js';

async function checkMessages() {
  console.log('═'.repeat(60));
  console.log('  数据库消息检查');
  console.log('═'.repeat(60));
  console.log();
  
  // 初始化数据库
  await initDatabase();
  
  // 1. 获取所有消息
  console.log('📊 所有消息统计：');
  console.log('-'.repeat(60));
  
  const allMessages = await getAllMessages();
  console.log(`总消息数：${allMessages.length}`);
  console.log();
  
  // 按群组分组统计
  const groupStats = new Map<string, number>();
  for (const msg of allMessages) {
    const chatJid = (msg as any).chat_jid || 'unknown';
    groupStats.set(chatJid, (groupStats.get(chatJid) || 0) + 1);
  }
  
  console.log('按群组统计：');
  for (const [jid, count] of groupStats) {
    console.log(`  - ${jid}: ${count} 条消息`);
  }
  console.log();
  
  // 2. 显示最近的消息
  console.log('📝 最近 20 条消息：');
  console.log('-'.repeat(60));
  
  // 获取所有群组的消息
  const allJids = Array.from(groupStats.keys());
  
  for (const jid of allJids) {
    console.log(`\n群组：${jid}`);
    console.log('-'.repeat(60));
    
    const recentMessages = await getRecentHistory(jid, 20);
    
    if (recentMessages && recentMessages.length > 0) {
      recentMessages.forEach((msg: any, idx: number) => {
        const timestamp = msg.timestamp || 'unknown';
        const role = msg.role === 'assistant' ? '🤖 AI' : '👤 用户';
        const content = msg.content?.substring(0, 50) || '';
        console.log(`${idx + 1}. [${timestamp}] ${role}`);
        console.log(`   ${content}${msg.content?.length > 50 ? '...' : ''}`);
        console.log();
      });
    } else {
      console.log('  没有找到消息记录');
    }
  }
  
  console.log();
  console.log('═'.repeat(60));
  console.log('  检查完成');
  console.log('═'.repeat(60));
  
  process.exit(0);
}

checkMessages().catch(err => {
  console.error('检查失败:', err);
  process.exit(1);
});
