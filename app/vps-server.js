const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// PROCESS HARDENING - Global Exception Shield
// ============================================================================

// Intercept unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('🛡️ SHIELD: Unhandled Rejection intercepted');
  console.error('🛡️ Promise:', promise);
  console.error('🛡️ Reason:', reason);
  console.error('🛡️ Stack:', reason instanceof Error ? reason.stack : 'No stack trace');
});

// Intercept uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('🛡️ SHIELD: Uncaught Exception intercepted');
  console.error('🛡️ Error:', error.message);
  console.error('🛡️ Stack:', error.stack);
  // Continue running instead of crashing
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
    
    let browser, page;
    try {
      browser = await initBrowser(sessionId);
      page = await browser.newPage();
    } catch (browserErr) {
      console.error('[INIT-SESSION] Browser init error:', browserErr.message);
      return res.status(200).json({
        success: false,
        error: `Browser initialization failed: ${browserErr.message}`,
        sessionId: null,
      });
    }

    sessions[sessionId] = {
      browser,
      page,
      modelId,
      createdAt: new Date(),
      isLoggedIn: false,
      cookieCount: 0,
    };

    // Navigate to OnlyFans login page with error handling
    try {
      await page.goto('https://www.onlyfans.com/login', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
    } catch (navErr) {
      console.warn(`[INIT] Navigation warning: ${navErr.message}`);
      // Continue anyway - page might still be usable
    }

    res.json({
      status: 'success',
      sessionId,
      modelId,
      message: 'Browser session initialized, admin can now login at OnlyFans',
    });
  } catch (error) {
    console.error('[ERROR] /init-session caught exception:', error.message);
    console.error('[ERROR] Stack:', error.stack);
    // Return graceful error response instead of crashing
    res.status(200).json({
      success: false,
      error: error.message,
      sessionId: null,
      stack: error.stack,
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

    let pageUrl, pageTitle, cookies, sessCookie, isLoggedIn;

    try {
      pageUrl = session.page.url();
    } catch (e) {
      console.warn('[VERIFY] Could not get page URL:', e.message);
      pageUrl = 'unknown';
    }

    try {
      pageTitle = await session.page.title();
    } catch (e) {
      console.warn('[VERIFY] Could not get page title:', e.message);
      pageTitle = 'unknown';
    }

    try {
      cookies = await session.page.cookies();
    } catch (e) {
      console.warn('[VERIFY] Could not get cookies:', e.message);
      cookies = [];
    }

    // Strict validation: Login is only successful if:
    // 1. Page URL is exactly 'https://www.onlyfans.com' (not /login)
    // 2. Cookie named 'sess' exists and is populated
    try {
      sessCookie = cookies.find((c) => c.name === 'sess');
      isLoggedIn = pageUrl === 'https://www.onlyfans.com' && !!sessCookie?.value;
    } catch (e) {
      console.warn('[VERIFY] Cookie validation error:', e.message);
      isLoggedIn = false;
    }

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
    console.error('[ERROR] /verify-session caught exception:', error.message);
    console.error('[ERROR] Stack:', error.stack);
    // Return graceful error response
    res.status(200).json({
      isLoggedIn: false,
      error: error.message,
      message: 'Verification error - retrying...',
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

    let cookies;
    try {
      cookies = await session.page.cookies();
    } catch (cookieErr) {
      console.warn('[SAVE] Error getting cookies:', cookieErr.message);
      cookies = [];
    }

    const cookiePath = path.join(COOKIES_DIR, `${session.modelId}.json`);

    try {
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
    } catch (writeErr) {
      console.error('[SAVE] Error writing cookies file:', writeErr.message);
      return res.status(200).json({
        success: false,
        error: `Failed to save cookies: ${writeErr.message}`,
      });
    }

    // Close browser
    try {
      await session.browser.close();
    } catch (closeErr) {
      console.warn('[SAVE] Error closing browser:', closeErr.message);
      // Continue anyway
    }

    delete sessions[sessionId];

    res.json({
      status: 'success',
      modelId: session.modelId,
      cookieCount: cookies.length,
      message: 'Session saved and browser closed',
    });
  } catch (error) {
    console.error('[ERROR] /save-session caught exception:', error.message);
    console.error('[ERROR] Stack:', error.stack);
    // Return graceful error response
    res.status(200).json({
      success: false,
      error: error.message,
      stack: error.stack,
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

    let savedData;
    try {
      savedData = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
    } catch (parseErr) {
      console.error('[SCREENSHOT] Cookie file parse error:', parseErr.message);
      return res.status(200).json({
        success: false,
        error: `Failed to parse cookie file: ${parseErr.message}`,
      });
    }

    const screenshotSessionId = uuidv4();
    let browser, page;

    try {
      browser = await initBrowser(screenshotSessionId);
      page = await browser.newPage();
    } catch (browserErr) {
      console.error('[SCREENSHOT] Browser init error:', browserErr.message);
      return res.status(200).json({
        success: false,
        error: `Browser init failed: ${browserErr.message}`,
      });
    }

    try {
      // Load cookies
      await page.setCookie(...savedData.cookies);
    } catch (setCookieErr) {
      console.warn('[SCREENSHOT] Cookie set error:', setCookieErr.message);
      // Continue anyway
    }

    // Navigate to OnlyFans
    try {
      await page.goto('https://www.onlyfans.com', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
    } catch (navErr) {
      console.warn(`[SCREENSHOT] Navigation warning: ${navErr.message}`);
    }

    // Take screenshot with error handling
    let screenshot = null;
    try {
      screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 80 });
    } catch (screenshotErr) {
      console.warn(`[SCREENSHOT] Quality 80 failed: ${screenshotErr.message}`);
      try {
        screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 });
      } catch (fallbackErr) {
        console.warn(`[SCREENSHOT] Quality 60 failed: ${fallbackErr.message}`);
        screenshot = null;
      }
    }

    let pageUrl = 'unknown', pageTitle = 'Unknown';
    try {
      pageUrl = page.url();
      pageTitle = await page.title();
    } catch (e) {
      console.warn('[SCREENSHOT] Could not get page info:', e.message);
    }

    try {
      await browser.close();
    } catch (closeErr) {
      console.warn('[SCREENSHOT] Browser close error:', closeErr.message);
    }

    res.json({
      status: 'success',
      modelId,
      screenshot,
      pageUrl,
      pageTitle,
      hasScreenshot: !!screenshot,
    });
  } catch (error) {
    console.error('[ERROR] /screenshot caught exception:', error.message);
    console.error('[ERROR] Stack:', error.stack);
    res.status(200).json({
      status: 'error',
      error: error.message,
      screenshot: null,
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

    let savedData;
    try {
      savedData = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
    } catch (parseErr) {
      console.error('[INTERACT] Cookie file parse error:', parseErr.message);
      return res.status(200).json({
        success: false,
        error: `Failed to parse cookie file: ${parseErr.message}`,
      });
    }

    const interactSessionId = uuidv4();
    let browser, page;

    try {
      browser = await initBrowser(interactSessionId);
      page = await browser.newPage();
    } catch (browserErr) {
      console.error('[INTERACT] Browser init error:', browserErr.message);
      return res.status(200).json({
        success: false,
        error: `Browser init failed: ${browserErr.message}`,
      });
    }

    try {
      // Load cookies
      await page.setCookie(...savedData.cookies);
    } catch (setCookieErr) {
      console.warn('[INTERACT] Cookie set error:', setCookieErr.message);
    }

    try {
      await page.goto('https://www.onlyfans.com', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
    } catch (navErr) {
      console.warn(`[INTERACT] Navigation warning: ${navErr.message}`);
    }

    let result = 'Unknown';
    try {
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
    } catch (actionErr) {
      console.warn(`[INTERACT] Action error (${action}): ${actionErr.message}`);
      result = `Action error: ${actionErr.message}`;
    }

    // Take screenshot with error handling
    let screenshot = null;
    try {
      screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 80 });
    } catch (screenshotErr) {
      console.warn(`[INTERACT] Quality 80 failed: ${screenshotErr.message}`);
      try {
        screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 });
      } catch (fallbackErr) {
        console.warn(`[INTERACT] Quality 60 failed: ${fallbackErr.message}`);
        screenshot = null;
      }
    }

    let pageUrl = 'unknown', pageTitle = 'Unknown';
    try {
      pageUrl = page.url();
      pageTitle = await page.title();
    } catch (e) {
      console.warn('[INTERACT] Could not get page info:', e.message);
    }

    try {
      await browser.close();
    } catch (closeErr) {
      console.warn('[INTERACT] Browser close error:', closeErr.message);
    }

    res.json({
      status: 'success',
      action,
      result,
      screenshot,
      pageUrl,
      pageTitle,
      hasScreenshot: !!screenshot,
    });
  } catch (error) {
    console.error('[ERROR] /interact caught exception:', error.message);
    console.error('[ERROR] Stack:', error.stack);
    res.status(200).json({
      status: 'error',
      action: req.body.action,
      error: error.message,
      screenshot: null,
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
        const response = await fetch(`http://80.240.30.188:3000/stream-frame?sessionId=${sessionId}`, {
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

    // Attempt screenshot with comprehensive error handling
    let screenshot = null;
    try {
      screenshot = await Promise.race([
        session.page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 80 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Screenshot timeout')), 8000))
      ]);
    } catch (screenshotErr) {
      console.warn(`[STREAM-FRAME] Quality 80 failed: ${screenshotErr.message}`);
      try {
        screenshot = await Promise.race([
          session.page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Screenshot timeout')), 5000))
        ]);
      } catch (fallbackErr) {
        console.warn(`[STREAM-FRAME] Quality 60 failed: ${fallbackErr.message}`);
        screenshot = null;
      }
    }

    let pageTitle = 'Unknown', pageUrl = 'unknown';
    
    try {
      pageTitle = await session.page.title();
    } catch (e) {
      console.warn('[STREAM-FRAME] Title error:', e.message);
    }

    try {
      pageUrl = session.page.url();
    } catch (e) {
      console.warn('[STREAM-FRAME] URL error:', e.message);
    }

    res.json({
      screenshot,
      pageTitle,
      pageUrl,
      isLoggedIn: session.isLoggedIn,
      cookieCount: session.cookieCount,
      hasScreenshot: !!screenshot,
    });
  } catch (error) {
    console.error('[ERROR] /stream-frame caught exception:', error.message);
    console.error('[ERROR] Stack:', error.stack);
    // Return graceful response instead of 500
    res.status(200).json({
      screenshot: null,
      error: error.message,
      hasScreenshot: false,
    });
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
