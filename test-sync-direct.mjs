#!/usr/bin/env node
import https from 'https';

// Test direct sync endpoint
const URL = 'https://etmanagement.vercel.app/api/crm/sync-onlyfans-chats';

// Active model from your DB
const payload = {
  modelId: 'd7976e92-434e-488a-8ec4-bba92eb31dcf',
  sessionId: '8334f01d-2a81-4d48-afbd-1785fd5dcfec'
};

console.log('🧪 Testing Sync Endpoint...');
console.log('URL:', URL);
console.log('Payload:', payload);
console.log('---');

const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(JSON.stringify(payload))
  }
};

const req = https.request(URL, options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Status:', res.status);
    console.log('Headers:', res.headers);
    console.log('Response:', data);
    process.exit(res.status === 200 ? 0 : 1);
  });
});

req.on('error', (error) => {
  console.error('Request Error:', error.message);
  process.exit(1);
});

req.write(JSON.stringify(payload));
req.end();
