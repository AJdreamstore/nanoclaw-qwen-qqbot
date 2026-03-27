import 'dotenv/config';

console.log('Environment variables loaded from .env:');
console.log('QQ_APP_ID:', process.env.QQ_APP_ID);
console.log('QQ_CLIENT_SECRET:', process.env.QQ_CLIENT_SECRET?.substring(0, 10) + '...');
console.log('DASHSCOPE_API_KEY:', process.env.DASHSCOPE_API_KEY?.substring(0, 10) + '...');
console.log('NATIVE_MODE:', process.env.NATIVE_MODE);
