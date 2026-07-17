#!/usr/bin/env node

const BROWSERLESS_API_KEY = '2UtIdqXGNZHMtwGde3da116aa737f642517fd79b383be1e54';
const url = `https://chrome.browserless.io/function?token=${BROWSERLESS_API_KEY}`;

const payload = {
  code: `function() {
  await page.goto('https://example.com');
  return { title: await page.title() };
}`
};

console.log('🧪 Testing Format 1 (named function)...');

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
    console.log('Full Response:', JSON.stringify(data, null, 2));
    if (data.error) {
      console.log(`❌ Error`);
      process.exit(1);
    } else {
      console.log(`✅ SUCCESS!`);
      process.exit(0);
    }
  })
  .catch(err => {
    console.error(`❌ Failed: ${err.message}`);
    process.exit(1);
  });
