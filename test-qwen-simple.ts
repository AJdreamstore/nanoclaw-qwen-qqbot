// 简单测试 Qwen Code SDK
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function test() {
  console.log('Testing Qwen Code SDK...\n');
  
  try {
    // 使用 qwen code 命令测试
    const testPrompt = '你好，请用一句话介绍你自己。';
    
    console.log('Running: qwen code -p "' + testPrompt + '"');
    console.log('---');
    
    const { stdout, stderr } = await execAsync(`qwen code -p "${testPrompt}"`, {
      encoding: 'utf-8',
      timeout: 60000,
    });
    
    console.log('Output:');
    console.log(stdout);
    
    if (stderr) {
      console.log('Stderr:', stderr);
    }
    
    console.log('---');
    console.log('✅ Qwen Code is working!');
  } catch (err: any) {
    console.error('❌ Error:', err.message);
    if (err.stdout) console.log('Stdout:', err.stdout);
    if (err.stderr) console.log('Stderr:', err.stderr);
  }
}

test();
