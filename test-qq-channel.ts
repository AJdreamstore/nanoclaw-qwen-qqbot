// QQ Channel Test Script
import { QQChannel } from './src/channels/qq.js';
import { logger } from './src/logger.js';

const testChannel = new QQChannel({
  onMessage: (jid, msg) => {
    console.log('Received message:', { jid, msg });
  },
  onChatMetadata: (jid, ts, name, channel, isGroup) => {
    console.log('Chat metadata:', { jid, ts, channel, isGroup });
  },
  registeredGroups: () => ({}),
});

async function test() {
  try {
    console.log('Connecting to QQ Bot...');
    await testChannel.connect();
    console.log('✓ Connected successfully!');
    console.log('Is connected:', testChannel.isConnected());
    
    // Wait a bit to see if WebSocket stays connected
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('Disconnecting...');
    await testChannel.disconnect();
    console.log('✓ Disconnected');
  } catch (err) {
    console.error('✗ Connection failed:', err);
    process.exit(1);
  }
}

test();
