#!/usr/bin/env node

const BROWSERLESS_API_KEY = '2UtIdqXGNZHMtwGde3da116aa737f642517fd79b383be1e54';
const url = `https://chrome.browserless.io/function?token=${BROWSERLESS_API_KEY}`;

const formats = [
  {
    name: "Format 1: function() { ... }",
    code: `function() {
  return { success: true, timestamp: Date.now() };
}`
  },
  {
    name: "Format 2: async function() { ... }",
    code: `async function() {
  return { success: true, timestamp: Date.now() };
}`
  },
  {
    name: "Format 3: () => { ... }",
    code: `() => {
  return { success: true, timestamp: Date.now() };
}`
  },
  {
    name: "Format 4: async () => { ... }",
    code: `async () => {
  return { success: true, timestamp: Date.now() };
}`
  }
];

let tested = 0;

formats.forEach((format, i) => {
  setTimeout(() => {
    console.log(`\n🧪 Testing ${format.name}...`);
    
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: format.code })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          console.log(`❌ Error: ${data.error}`);
        } else {
          console.log(`✅ SUCCESS!`);
          console.log('Response:', data);
        }
        tested++;
        if (tested === formats.length) process.exit(0);
      })
      .catch(err => {
        console.error(`❌ Failed: ${err.message}`);
        tested++;
        if (tested === formats.length) process.exit(1);
      });
  }, i * 1000);
});
