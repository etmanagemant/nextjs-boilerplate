const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// GLOBAL REJECTION SHIELD - prevent auto-reboot on unhandled promise rejections
process.on('unhandledRejection', (reason, p) => {
  console.error('[REJECTION SHIELD] Unhandled Rejection at:', p);
  console.error('[REJECTION SHIELD] Reason:', reason);
});

const app = express();
app.use(express.json());

// CORS middleware - allow requests from Vercel app
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const sessions = {};
const COOKIES_DIR = '/tmp/puppeteer-cookies';

// Ensure cookies directory exists
if (!fs.existsSync(COOKIES_DIR)) {
  fs.mkdirSync(COOKIES_DIR, { recursive: true });
}

// Headful browser initialization (ANTI-CAPTCHA MODE)
async function initBrowser(sessionId) {
  return puppeteer.launch({
    headless: false,
    executablePath: '/snap/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-sync',
      '--no-first-run',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-blink-features=AutomationControlled',
      `--user-data-dir=/tmp/chromium-${sessionId}`,
    ],
  });
}

// Init session - create isolated browser per model
app.post('/init-session', async (req, res) => {
  try {
    const { modelId } = req.body;
    if (!modelId) {
      return res.status(400).json({ error: 'Missing modelId' });
    }

    // Close any existing session for this model
    for (const [sid, session] of Object.entries(sessions)) {
      if (session.modelId === modelId) {
        try {
          await session.browser.close();
          delete sessions[sid];
          console.log(`[INIT] Closed old session for model ${modelId}`);
        } catch (e) {
          console.error(`[INIT] Error closing old session: ${e.message}`);
        }
      }
    }

    const sessionId = uuidv4();
    const browser = await initBrowser(sessionId);
    const page = await browser.newPage();

    sessions[sessionId] = {
      browser,
      page,
      modelId,
      createdAt: new Date(),
      isLoggedIn: false,
      cookieCount: 0,
    };

    // Navigate to OnlyFans login page
    try {
      await page.goto('https://www.onlyfans.com/login', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
    } catch (navErr) {
      console.log(`[INIT] Navigation attempt: ${navErr.message}`);
    }

    res.json({
      status: 'success',
      sessionId,
      modelId,
      message: 'Browser session initialized, admin can now login at OnlyFans',
    });
  } catch (error) {
    // Try to close browser on error
    try {
      if (sessions[sessionId]?.browser) {
        await sessions[sessionId].browser.close();
      }
    } catch (e) {
      console.error(`[INIT] Error closing browser on fail: ${e.message}`);
    }
    delete sessions[sessionId];
    console.error('[ERROR] /init-session:', error.message);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Verify session - check for login cookies
app.get('/verify-session', async (req, res) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    const session = sessions[sessionId];
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const pageUrl = session.page.url();
    const pageTitle = await session.page.title();
    const cookies = await session.page.cookies();

    // Strict validation: Login is only successful if:
    // 1. Page URL is exactly 'https://www.onlyfans.com' (not /login)
    // 2. Cookie named 'sess' exists and is populated
    const sessCookie = cookies.find((c) => c.name === 'sess');
    const isLoggedIn = pageUrl === 'https://www.onlyfans.com' && !!sessCookie?.value;

    session.isLoggedIn = isLoggedIn;
    session.cookieCount = isLoggedIn ? cookies.length : 0;

    res.json({
      isLoggedIn,
      cookieCount: isLoggedIn ? cookies.length : 0,
      pageUrl,
      pageTitle,
      message: isLoggedIn ? '✅ Login verified (sess cookie found)!' : '⏳ Waiting for login...',
    });
  } catch (error) {
    console.error('[ERROR] /verify-session:', error.message);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Save session - persist cookies to disk
app.post('/save-session', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    const session = sessions[sessionId];
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const cookies = await session.page.cookies();
    const cookiePath = path.join(COOKIES_DIR, `${session.modelId}.json`);

    fs.writeFileSync(
      cookiePath,
      JSON.stringify(
        {
          modelId: session.modelId,
          sessionId,
          cookies,
          createdAt: session.createdAt,
          savedAt: new Date(),
        },
        null,
        2
      )
    );

    // Close browser
    await session.browser.close();
    delete sessions[sessionId];

    res.json({
      status: 'success',
      modelId: session.modelId,
      cookieCount: cookies.length,
      message: 'Session saved and browser closed',
    });
  } catch (error) {
    console.error('[ERROR] /save-session:', error.message);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Screenshot - load saved cookies and capture page
app.get('/screenshot', async (req, res) => {
  try {
    const { modelId } = req.query;
    if (!modelId) {
      return res.status(400).json({ error: 'Missing modelId' });
    }

    const cookiePath = path.join(COOKIES_DIR, `${modelId}.json`);
    if (!fs.existsSync(cookiePath)) {
      return res.status(404).json({ error: 'No saved session for model' });
    }

    const savedData = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
    const screenshotSessionId = uuidv4();
    const browser = await initBrowser(screenshotSessionId);
    const page = await browser.newPage();

    // Load cookies
    await page.setCookie(...savedData.cookies);

    // Navigate to OnlyFans
    try {
      await page.goto('https://www.onlyfans.com', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
    } catch (navErr) {
      console.log(`[SCREENSHOT] Navigation warning: ${navErr.message}`);
    }

    // Take screenshot with error handling
    let screenshot;
    try {
      screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 80 });
    } catch (screenshotErr) {
      console.warn(`[SCREENSHOT] Fallback to quality 60: ${screenshotErr.message}`);
      screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 });
    }

    await browser.close();

    res.json({
      status: 'success',
      modelId,
      screenshot,
      pageUrl: page.url(),
      pageTitle: await page.title(),
    });
  } catch (error) {
    console.error('[ERROR] /screenshot:', error.message);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Interact - execute browser actions on saved session
app.post('/interact', async (req, res) => {
  try {
    const { modelId, action, selector, value } = req.body;
    if (!modelId || !action) {
      return res.status(400).json({ error: 'Missing modelId or action' });
    }

    const cookiePath = path.join(COOKIES_DIR, `${modelId}.json`);
    if (!fs.existsSync(cookiePath)) {
      return res.status(404).json({ error: 'No saved session for model' });
    }

    const savedData = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
    const interactSessionId = uuidv4();
    const browser = await initBrowser(interactSessionId);
    const page = await browser.newPage();

    // Load cookies
    await page.setCookie(...savedData.cookies);
    await page.goto('https://www.onlyfans.com', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    }).catch(err => console.log(`[INTERACT] Nav warning: ${err.message}`));

    let result;
    switch (action) {
      case 'click':
        await page.click(selector);
        result = 'Clicked';
        break;
      case 'type':
        await page.type(selector, value, { delay: 50 });
        result = 'Typed';
        break;
      case 'navigate':
        await page.goto(value, { waitUntil: 'domcontentloaded', timeout: 15000 });
        result = 'Navigated';
        break;
      case 'scroll':
        await page.evaluate((v) => window.scrollBy(0, v), value || 500);
        result = 'Scrolled';
        break;
      case 'reload':
        await page.reload({ waitUntil: 'domcontentloaded' });
        result = 'Reloaded';
        break;
      default:
        result = 'Unknown action';
    }

    // Take screenshot with error handling
    let screenshot;
    try {
      screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 80 });
    } catch (screenshotErr) {
      console.warn(`[INTERACT] Fallback to quality 60: ${screenshotErr.message}`);
      screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 });
    }

    await browser.close();

    res.json({
      status: 'success',
      action,
      result,
      screenshot,
      pageUrl: page.url(),
      pageTitle: await page.title(),
    });
  } catch (error) {
    console.error('[ERROR] /interact:', error.message);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Stream endpoint - serves HTML with live screenshot streaming
app.get('/stream', async (req, res) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    // Verify session exists
    const session = sessions[sessionId];
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Return HTML page with JavaScript that polls for screenshots
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>OnlyFans Browser Stream</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1a1a1a; color: #D4AF37; font-family: 'Courier New', monospace; }
    #container { width: 100%; height: 100vh; display: flex; flex-direction: column; }
    #stream { flex: 1; background: #000; display: flex; align-items: center; justify-content: center; }
    #screenshot { max-width: 100%; max-height: 100%; object-fit: contain; }
    #status { padding: 12px 16px; background: #0a0a0a; border-top: 2px solid #D4AF37; font-size: 12px; }
    .loading { opacity: 0.5; }
  </style>
</head>
<body>
  <div id="container">
    <div id="stream">
      <div id="screenshot" class="loading">Connecting...</div>
    </div>
    <div id="status">🔴 Waiting for first screenshot...</div>
  </div>
  
  <script>
    const sessionId = '${sessionId}';
    let frameCount = 0;
    let lastUpdateTime = Date.now();
    
    async function captureFrame() {
      try {
        const response = await fetch(\`http://192.248.184.79:3000/stream-frame?sessionId=\${sessionId}\`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) {
          document.getElementById('status').textContent = '❌ Stream error: ' + response.status;
          return;
        }
        
        const data = await response.json();
        
        if (data.screenshot) {
          const img = document.getElementById('screenshot');
          img.src = 'data:image/png;base64,' + data.screenshot;
          img.classList.remove('loading');
          
          frameCount++;
          const now = Date.now();
          const fps = (frameCount / ((now - lastUpdateTime) / 1000)).toFixed(1);
          
          document.getElementById('status').textContent = 
            \`🟢 Live (fps: \${fps}) | Page: \${data.pageTitle || 'Loading'}\`;
        }
      } catch (err) {
        document.getElementById('status').textContent = '❌ Error: ' + err.message;
      }
      
      // Capture next frame
      setTimeout(captureFrame, 500); // 2 FPS = 500ms between frames
    }
    
    captureFrame();
  </script>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('[ERROR] /stream:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Stream frame endpoint - returns screenshot of current session
app.get('/stream-frame', async (req, res) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    const session = sessions[sessionId];
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Attempt screenshot with error handling
    let screenshot;
    try {
      screenshot = await session.page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 80 });
    } catch (screenshotErr) {
      console.warn(`[STREAM-FRAME] Screenshot error (fallback to quality 60): ${screenshotErr.message}`);
      // Fallback: retry with lower quality and timeout
      try {
        screenshot = await Promise.race([
          session.page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Screenshot timeout')), 5000))
        ]);
      } catch (fallbackErr) {
        console.error(`[STREAM-FRAME] Fallback screenshot failed: ${fallbackErr.message}`);
        // Return placeholder response instead of error
        return res.json({
          screenshot: null,
          pageTitle: 'Screenshot unavailable',
          pageUrl: session.page.url(),
          isLoggedIn: session.isLoggedIn,
          cookieCount: session.cookieCount,
          error: 'Page busy - retrying...',
        });
      }
    }

    const pageTitle = await session.page.title().catch(() => 'Unknown');
    const pageUrl = session.page.url();

    res.json({
      screenshot,
      pageTitle,
      pageUrl,
      isLoggedIn: session.isLoggedIn,
      cookieCount: session.cookieCount,
    });
  } catch (error) {
    console.error('[ERROR] /stream-frame:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'running',
    activeSessions: Object.keys(sessions).length,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Listening on port ${PORT}`);
});
