import { QQ_CONFIG } from './src/config.js';

console.log('QQ_CONFIG:', {
  appId: QQ_CONFIG.appId,
  hasSecret: !!QQ_CONFIG.clientSecret,
  secretLength: QQ_CONFIG.clientSecret?.length || 0,
});

console.log('QQ_CONFIG is valid:', !!(QQ_CONFIG.appId && QQ_CONFIG.clientSecret));
