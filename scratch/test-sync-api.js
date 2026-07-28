const fetch = require('node-fetch');

async function testSync() {
  const url = 'https://backend-zeta-two-93.vercel.app/api/user/sync';
  
  const payload = {
    section_code: 'TEST-SECTION',
    uid: 'TEST-UID-123'
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-clerk-user-id': 'user_test_dummy_123'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  console.log("Response:", JSON.stringify(data, null, 2));
}

testSync().catch(console.error);
