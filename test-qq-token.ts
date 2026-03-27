import 'dotenv/config';

async function testToken() {
  const appId = process.env.QQ_APP_ID;
  const clientSecret = process.env.QQ_CLIENT_SECRET;
  
  console.log('Testing QQ Bot token acquisition...');
  console.log('App ID:', appId);
  console.log('Client Secret:', clientSecret?.substring(0, 10) + '...');
  
  try {
    const response = await fetch('https://bots.qq.com/app/getAppAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId, clientSecret }),
    });
    
    console.log('\nResponse status:', response.status);
    const data = await response.json();
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (data.access_token) {
      console.log('\n✓ Token acquired successfully!');
      console.log('Token:', data.access_token.substring(0, 20) + '...');
      console.log('Expires in:', data.expires_in, 'seconds');
    } else {
      console.log('\n✗ Failed to get token');
      console.log('Error:', data);
    }
  } catch (err) {
    console.error('\n✗ Error:', err);
  }
}

testToken();
