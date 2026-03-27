import 'dotenv/config';

async function testGateway() {
  const appId = process.env.QQ_APP_ID;
  const clientSecret = process.env.QQ_CLIENT_SECRET;
  
  console.log('Testing QQ Bot gateway access...');
  
  // First get token
  const tokenResponse = await fetch('https://bots.qq.com/app/getAppAccessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, clientSecret }),
  });
  
  const tokenData = await tokenResponse.json() as { access_token?: string };
  
  if (!tokenData.access_token) {
    console.error('✗ Failed to get token');
    return;
  }
  
  const token = tokenData.access_token;
  console.log('✓ Token acquired:', token.substring(0, 20) + '...');
  
  // Now try to get gateway URL
  const gatewayResponse = await fetch('https://api.sgroup.qq.com/gateway', {
    method: 'GET',
    headers: {
      Authorization: `QQBot ${token}`,
    },
  });
  
  console.log('\nGateway response status:', gatewayResponse.status);
  
  if (gatewayResponse.ok) {
    const gatewayData = await gatewayResponse.json() as { url?: string };
    console.log('✓ Gateway URL:', gatewayData.url);
  } else {
    const errorText = await gatewayResponse.text();
    console.error('✗ Gateway error:', gatewayResponse.status, errorText);
  }
}

testGateway();
