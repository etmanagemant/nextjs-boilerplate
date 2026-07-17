#!/usr/bin/env node

const BROWSERLESS_API_KEY = '2UtIdqXGNZHMtwGde3da116aa737f642517fd79b383be1e54';
const url = `https://chrome.browserless.io/function?token=${BROWSERLESS_API_KEY}`;

const payload = {
  code: `await page.goto('https://example.com');
return { title: await page.title() };`
};

console.log('🧪 Testing Raw Code (no function wrapper)...');
console.log('Code:', payload.code);

fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      console.log(`❌ Error: ${data.error}`);
      process.exit(1);
    } else {
      console.log(`✅ SUCCESS!`);
      console.log('Response:', JSON.stringify(data, null, 2));
      process.exit(0);
    }
  })
  .catch(err => {
    console.error(`❌ Failed: ${err.message}`);
    process.exit(1);
  });
