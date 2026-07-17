#!/usr/bin/env node

const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY || '2UtIdqXGNZHMtwGde3da116aa737f642517fd79b383be1e54';

console.log('🧪 Testing Minimal Browserless Request...');

const url = `https://chrome.browserless.io/function?token=${BROWSERLESS_API_KEY}`;

// Minimal valid request format
const payload = {
  code: `return { success: true, timestamp: Date.now() };`
};

console.log('Payload:', JSON.stringify(payload, null, 2));

fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
  .then(res => {
    console.log('Status:', res.status);
    return res.json();
  })
  .then(data => {
    console.log('✅ SUCCESS!');
    console.log('Response:', JSON.stringify(data, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ ERROR:', err.message);
    process.exit(1);
  });
