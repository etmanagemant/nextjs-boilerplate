#!/usr/bin/env node

// Test Browserless API Key validity
const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY || '2UtIdqXGNZHMtwGde3da116aa737f642517fd79b383be1e54';

console.log('🧪 Testing Browserless API Key...');
console.log('Key:', BROWSERLESS_API_KEY.substring(0, 10) + '...');

const testUrl = `https://chrome.browserless.io/function?token=${BROWSERLESS_API_KEY}`;

const testCode = `
  async () => {
    return { success: true, timestamp: new Date().toISOString() };
  }
`;

fetch(testUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code: testCode,
    timeout: 5000
  })
})
  .then(res => {
    console.log('✅ HTTP Status:', res.status);
    if (res.status === 401) {
      console.error('❌ API KEY IS INVALID!');
      process.exit(1);
    }
    return res.json();
  })
  .then(data => {
    console.log('✅ SUCCESS! Browserless API is working');
    console.log('Response:', data);
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ ERROR:', err.message);
    process.exit(1);
  });
