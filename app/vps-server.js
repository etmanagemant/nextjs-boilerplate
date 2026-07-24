const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

// ============================================================================
// PROCESS HARDENING - Global Exception Shield
// ============================================================================
process.on('unhandledRejection', (reason, promise) => {
  console.error('🛡️ SHIELD: Unhandled Rejection intercepted');
  console.error('🛡️ Reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('🛡️ SHIELD: Uncaught Exception intercepted');
  console.error('🛡️ Error:', error.message);
  console.error('🛡️ Stack:', error.stack);
  // Continue running instead of crashing
});

const app = express();
app.use(express.json({ limit: '5mb' }));

// CORS middleware - allow requests from the Vercel app
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-VPS-Secret');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// This server has no auth of its own beyond this shared secret - anyone who
// knows it can control every connected model's live browser. /health stays
// open so uptime monitors can hit it without the secret. /stream is hit
// directly by the browser (via <img src>, not fetch, so it can't attach the
// secret header) and instead checks its own short-lived per-request token -
// see streamTokens below.
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/stream') return next();
  const expected = process.env.VPS_SHARED_SECRET;
  if (!expected) return next(); // not configured - fail open rather than lock everyone out
  if (req.headers['x-vps-secret'] !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// ============================================================================
// PERSISTENT PER-MODEL SESSIONS
// One long-lived headful browser per connected model, reused for both the
// initial login handshake AND the ongoing live view — no more relaunching
// Chromium on every single poll.
// ============================================================================

const modelSessions = {}; // modelId -> { browser, page, lastActivity, createdAt }
// Was 20 minutes - but only one session can run at a time anyway
// (MAX_CONCURRENT_SESSIONS below), so there's no extra RAM cost to keeping
// the one connected model alive longer. Every time this closed a session,
// the next view had to fall back to cloning cookies into a fresh browser,
// which OnlyFans reliably rejects (redirects to a real login page) even
// with valid cookies - so a short idle timeout was directly causing
// "reconnected, but still see a login page" reports.
const IDLE_TIMEOUT_MS = 6 * 60 * 60 * 1000; // close a session after 6h of no requests

// Short-lived, single-use tokens for /stream (see the auth middleware above
// for why that route can't use the shared secret). Next.js mints one via
// POST /stream-token (which IS shared-secret protected) right before the
// browser opens the stream, so the permanent secret never reaches the
// client - only this one-shot, 60-second-lived token does.
const streamTokens = {}; // token -> { modelId, expiresAt }
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of Object.entries(streamTokens)) {
    if (entry.expiresAt < now) delete streamTokens[token];
  }
}, 60 * 1000);
// Your Vultr box (ETMANAGEMENT, 80.240.30.188) has 1GB RAM - a single headful
// Chromium session already uses 300-500MB, so default to ONE at a time.
// Bump via MAX_CONCURRENT_SESSIONS env var if you upgrade the VPS.
const MAX_CONCURRENT_SESSIONS = Number(process.env.MAX_CONCURRENT_SESSIONS || 1);

function profileDir(modelId) {
  return `/tmp/chromium-${modelId}`;
}

// Concurrent /connect or /restore calls for the same model (e.g. the chatter
// screenshot poll firing again before the previous restore finished) used to
// each launch their own Chrome against the same --user-data-dir, which
// Chrome refuses ("browser is already running for <dir>") and which alone
// was enough to overload this VPS. Callers for the same modelId now share
// one in-flight launch instead of racing.
const pendingLaunches = {};
function withModelLock(modelId, fn) {
  if (pendingLaunches[modelId]) return pendingLaunches[modelId];
  const p = Promise.resolve()
    .then(fn)
    .finally(() => {
      delete pendingLaunches[modelId];
    });
  pendingLaunches[modelId] = p;
  return p;
}

// Auto dark-mode with a gold tint: invert the whole page (white -> black),
// then push the result warm/gold with sepia+saturate. Media gets the base
// invert+hue-rotate counter-filter so photos/video stay close to their real
// colors (they still pick up a slight warm cast from the outer page filter,
// which is an acceptable trade-off for a fully CSS-only, selector-free
// approach that doesn't depend on OnlyFans' own unstable class names).
// Registered once per page via evaluateOnNewDocument so it re-applies on
// every navigation, including OnlyFans' internal SPA routing.
const DARK_MODE_SCRIPT = `
(function() {
  function inject() {
    if (document.getElementById('__crm_dark_mode__')) return;
    var style = document.createElement('style');
    style.id = '__crm_dark_mode__';
    style.textContent = 'html { filter: invert(1) hue-rotate(180deg) saturate(1.4) sepia(0.35) !important; background: #0A0A0A !important; } ' +
      'img, video, picture, svg, canvas, iframe { filter: invert(1) hue-rotate(180deg) !important; }';
    (document.head || document.documentElement).appendChild(style);
  }
  if (document.head) inject();
  else document.addEventListener('DOMContentLoaded', inject);
})();
`;

async function enableDarkMode(page) {
  try {
    await page.evaluateOnNewDocument(DARK_MODE_SCRIPT);
  } catch (e) {
    console.warn('[DARK-MODE] Could not register:', e.message);
  }
}

// Wipe the on-disk Chrome profile (cookies, cache, local storage) so a fresh
// login never inherits a previous session for the same model.
async function wipeProfileDir(modelId) {
  try {
    await fs.rm(profileDir(modelId), { recursive: true, force: true });
  } catch (e) {
    console.warn(`[SESSION] Could not wipe profile dir for ${modelId}:`, e.message);
  }
}

async function closeSession(modelId, reason = 'manual', wipeProfile = false) {
  const session = modelSessions[modelId];
  if (session) {
    delete modelSessions[modelId];
    try {
      await session.browser.close();
      console.log(`[SESSION] Closed session for ${modelId} (${reason})`);
    } catch (e) {
      console.warn(`[SESSION] Error closing session for ${modelId}:`, e.message);
    }
  }
  if (wipeProfile) {
    await wipeProfileDir(modelId);
  }
}

async function enforceSessionCap(excludeModelId) {
  const entries = Object.entries(modelSessions).filter(([id]) => id !== excludeModelId);
  if (entries.length < MAX_CONCURRENT_SESSIONS) return;
  entries.sort((a, b) => a[1].lastActivity - b[1].lastActivity);
  const [oldestModelId] = entries[0];
  await closeSession(oldestModelId, 'session cap reached, evicted least recently used');
}

async function launchBrowser(modelId) {
  const launchOnce = () =>
    puppeteer.launch({
      headless: false,
      // Uses Puppeteer's own managed Chrome (downloaded into ~/.cache/puppeteer
      // by `npm install`) unless CHROMIUM_PATH points somewhere else.
      executablePath: process.env.CHROMIUM_PATH || puppeteer.executablePath(),
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
        `--user-data-dir=/tmp/chromium-${modelId}`,
      ],
    });

  try {
    return await launchOnce();
  } catch (e) {
    // Right after a service restart, Xvfb can take a moment to bind its
    // display - retry once instead of failing the whole connect attempt.
    if (String(e.message).includes('Missing X server')) {
      console.warn('[LAUNCH] Missing X server, retrying in 2s...');
      await new Promise((r) => setTimeout(r, 2000));
      return await launchOnce();
    }
    throw e;
  }
}

// Get an existing live session, or open a fresh one navigated to the login page
async function getOrCreateSession(modelId) {
  const existing = modelSessions[modelId];
  if (existing) {
    existing.lastActivity = Date.now();
    return existing;
  }

  await enforceSessionCap(modelId);
  // Fresh login handshake - never inherit a previous session's cookies for this model
  await wipeProfileDir(modelId);

  const browser = await launchBrowser(modelId);
  const page = await browser.newPage();
  // 1920x1080 briefly overloaded this 1-vCPU/1GB VPS (load average 15+,
  // heavy swapping) since Chrome renders it entirely in software with
  // --disable-gpu. Was 1280x800 - the earlier 1920x1080 meltdown was mostly
  // the concurrent-launch race (fixed by withModelLock now), not the
  // resolution alone. Trying Full HD again with that lock in place.
  await page.setViewport({ width: 1920, height: 1080 });
  await enableDarkMode(page);

  try {
    // The direct /login route has been unreliable ("page not available") -
    // the root page shows the same login form to logged-out visitors anyway.
    await page.goto('https://www.onlyfans.com', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
  } catch (navErr) {
    console.warn(`[SESSION] Initial navigation warning for ${modelId}: ${navErr.message}`);
  }

  const session = { browser, page, lastActivity: Date.now(), createdAt: new Date() };
  modelSessions[modelId] = session;
  return session;
}

// Re-launch a session from previously saved cookies (used when the chatter
// live-view is opened but no live browser is currently running for the model)
async function restoreSession(modelId, cookies, localStorageData) {
  // A previous call (queued behind the same lock) may have already restored
  // this model - reuse it instead of tearing down a working session.
  const existing = modelSessions[modelId];
  if (existing) {
    existing.lastActivity = Date.now();
    return existing;
  }

  await closeSession(modelId, 'restoring from saved cookies', true);
  await enforceSessionCap(modelId);

  const browser = await launchBrowser(modelId);
  const page = await browser.newPage();
  // 1920x1080 briefly overloaded this 1-vCPU/1GB VPS (load average 15+,
  // heavy swapping) since Chrome renders it entirely in software with
  // --disable-gpu. Was 1280x800 - the earlier 1920x1080 meltdown was mostly
  // the concurrent-launch race (fixed by withModelLock now), not the
  // resolution alone. Trying Full HD again with that lock in place.
  await page.setViewport({ width: 1920, height: 1080 });
  await enableDarkMode(page);

  try {
    await page.setCookie(...cookies);
  } catch (e) {
    console.warn(`[RESTORE] Cookie set error for ${modelId}:`, e.message);
  }

  try {
    await page.goto('https://www.onlyfans.com', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
  } catch (navErr) {
    console.warn(`[RESTORE] Navigation warning for ${modelId}: ${navErr.message}`);
  }

  // Some sites keep auth-relevant tokens in localStorage, not just cookies -
  // restore it too. Needs the page already navigated to the right origin
  // first (localStorage is origin-scoped), then reloaded so the site's own
  // init logic actually picks up the restored values, same as a normal
  // page load would.
  if (localStorageData) {
    try {
      await page.evaluate((dataStr) => {
        const data = JSON.parse(dataStr);
        for (const [key, value] of Object.entries(data)) {
          try {
            localStorage.setItem(key, value);
          } catch (e) {
            /* ignore individual key failures */
          }
        }
      }, localStorageData);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
      console.warn(`[RESTORE] localStorage restore error for ${modelId}:`, e.message);
    }
  }

  const session = { browser, page, lastActivity: Date.now(), createdAt: new Date() };
  modelSessions[modelId] = session;
  return session;
}

async function getLoginState(page) {
  let pageUrl = 'unknown';
  let cookies = [];
  // page.title() used to be fetched here too, but nothing on the frontend
  // ever reads pageTitle - it was a wasted CDP round-trip on every single
  // poll/interact call. Dropped.
  //
  // checkFailed distinguishes "we actually asked the page and it said
  // logged out" from "the read itself blew up" (crashed page, closed
  // target, mid-navigation). Both used to collapse into isLoggedIn:false,
  // which meant a transient Puppeteer hiccup could get treated as proof
  // OnlyFans invalidated the session and trigger a real cookie wipe.
  let checkFailed = false;

  try {
    pageUrl = page.url();
  } catch (e) {
    checkFailed = true;
  }

  try {
    cookies = await page.cookies();
  } catch (e) {
    checkFailed = true;
  }

  // OnlyFans sets a 'sess' cookie for anonymous visitors too, so that alone
  // is not proof of login. 'auth_id' is only set once actually authenticated.
  const sessCookie = cookies.find((c) => c.name === 'sess');
  const authIdCookie = cookies.find((c) => c.name === 'auth_id');
  const isLoggedIn = !!sessCookie?.value && !!authIdCookie?.value && !pageUrl.includes('/login');

  return { isLoggedIn, cookieCount: cookies.length, pageUrl, checkFailed };
}

async function takeScreenshot(page) {
  try {
    return await Promise.race([
      page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 80 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Screenshot timeout')), 8000)),
    ]);
  } catch (e) {
    console.warn('[SCREENSHOT] Quality 80 failed:', e.message);
    try {
      return await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 });
    } catch (e2) {
      console.warn('[SCREENSHOT] Quality 60 failed:', e2.message);
      return null;
    }
  }
}

// Idle sweep - free RAM on the $5 VPS from abandoned sessions
setInterval(() => {
  const now = Date.now();
  for (const [modelId, session] of Object.entries(modelSessions)) {
    if (now - session.lastActivity > IDLE_TIMEOUT_MS) {
      closeSession(modelId, 'idle timeout');
    }
  }
}, 5 * 60 * 1000);

// Periodic background sync - Vercel Hobby plan only allows daily cron, so
// this VPS (already running 24/7) drives it instead. Just pings the Next.js
// endpoint, which enumerates active models and calls back into this VPS's
// own /fetch-inbox for each - no extra cost, no Browserless session budget
// spent on routine polling.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const CRON_SECRET = process.env.CRON_SECRET;
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS || 90 * 1000);

if (APP_URL && CRON_SECRET) {
  setInterval(async () => {
    try {
      const res = await fetch(`${APP_URL}/api/cron/sync-chats?secret=${CRON_SECRET}`);
      const data = await res.json().catch(() => ({}));
      console.log('[SYNC-LOOP]', res.status, JSON.stringify(data).slice(0, 200));
    } catch (e) {
      console.warn('[SYNC-LOOP] Error:', e.message);
    }
  }, SYNC_INTERVAL_MS);
  console.log(`[SYNC-LOOP] Enabled, every ${SYNC_INTERVAL_MS / 1000}s`);
} else {
  console.warn('[SYNC-LOOP] Disabled - NEXT_PUBLIC_APP_URL or CRON_SECRET not set');
}

// ============================================================================
// ROUTES
// ============================================================================

// Open (or reuse) a live browser for a model and go to the OnlyFans login page.
// Called when the admin clicks "Model verbinden".
app.post('/connect', async (req, res) => {
  try {
    const { modelId } = req.body;
    if (!modelId) return res.status(400).json({ error: 'Missing modelId' });

    const session = await withModelLock(modelId, () => getOrCreateSession(modelId));
    const state = await getLoginState(session.page);

    res.json({ status: 'success', modelId, ...state });
  } catch (error) {
    console.error('[CONNECT] Error:', error.message);
    res.status(200).json({ status: 'error', error: error.message });
  }
});

// Poll login status of a model's live session
app.get('/status', async (req, res) => {
  try {
    const { modelId } = req.query;
    if (!modelId) return res.status(400).json({ error: 'Missing modelId' });

    const session = modelSessions[modelId];
    if (!session) return res.json({ hasSession: false, isLoggedIn: false });

    session.lastActivity = Date.now();
    const state = await getLoginState(session.page);
    res.json({ hasSession: true, ...state });
  } catch (error) {
    console.error('[STATUS] Error:', error.message);
    res.status(200).json({ hasSession: false, isLoggedIn: false, error: error.message });
  }
});

// Live screenshot of a model's session (login flow OR ongoing chatter view)
app.get('/frame', async (req, res) => {
  try {
    const { modelId } = req.query;
    if (!modelId) return res.status(400).json({ error: 'Missing modelId' });

    const session = modelSessions[modelId];
    if (!session) return res.json({ hasSession: false, screenshot: null });

    session.lastActivity = Date.now();
    // These don't depend on each other - running them one after another was
    // adding the full screenshot-encode time on top of the login-state
    // check time on every single poll.
    const [screenshot, state] = await Promise.all([
      takeScreenshot(session.page),
      getLoginState(session.page),
    ]);

    res.json({ hasSession: true, screenshot, hasScreenshot: !!screenshot, ...state });
  } catch (error) {
    console.error('[FRAME] Error:', error.message);
    res.status(200).json({ hasSession: false, screenshot: null, error: error.message });
  }
});

// Forward a click / keypress / scroll / navigate / reload to the live session,
// then return a fresh frame. Click focuses a field, keypress types into
// whatever is currently focused - no selector guessing needed.
app.post('/interact', async (req, res) => {
  const { modelId, action, data } = req.body || {};

  try {
    if (!modelId || !action) {
      return res.status(400).json({ error: 'Missing modelId or action' });
    }

    const session = modelSessions[modelId];
    if (!session) return res.status(404).json({ error: 'No active session for this model' });

    session.lastActivity = Date.now();
    // Tells the continuous /stream capture loop (if one is running for this
    // model) to back off while a real click/keypress is being executed -
    // both were hitting the same Puppeteer page/CDP connection at once on a
    // single CPU core, which queued the actual keystroke behind however
    // many pending stream-frame captures, turning "type a character" into
    // a many-second wait. See the check in the /stream loop below.
    session.interactionPending = true;
    const { page } = session;

    let result = 'ok';
    try {
      switch (action) {
        case 'click':
          await page.mouse.click(data?.x || 0, data?.y || 0);
          result = 'clicked';
          break;
        case 'keypress':
          await page.keyboard.type(String(data?.text ?? ''), { delay: 30 });
          result = 'typed';
          break;
        case 'key':
          await page.keyboard.press(data?.key || 'Enter');
          result = 'key-pressed';
          break;
        case 'navigate':
          await page.goto(data?.url || 'https://www.onlyfans.com', {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
          });
          result = 'navigated';
          break;
        case 'scroll':
          await page.evaluate((v) => window.scrollBy(0, v), data?.amount || 500);
          result = 'scrolled';
          break;
        case 'reload':
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
          result = 'reloaded';
          break;
        default:
          result = 'unknown action';
      }
    } catch (actionErr) {
      console.warn(`[INTERACT] Action error (${action}):`, actionErr.message);
      result = `action error: ${actionErr.message}`;
    } finally {
      session.interactionPending = false;
    }

    const [screenshot, state] = await Promise.all([
      takeScreenshot(page),
      getLoginState(page),
    ]);

    res.json({ status: 'success', action, result, screenshot, hasScreenshot: !!screenshot, ...state });
  } catch (error) {
    console.error('[INTERACT] Fatal error:', error.message);
    res.status(200).json({ status: 'error', action, error: error.message, screenshot: null });
  }
});

// Return raw cookies (+ localStorage) from a live session, so Next.js can
// persist them to Supabase on "Creator verbinden".
app.get('/cookies', async (req, res) => {
  try {
    const { modelId } = req.query;
    if (!modelId) return res.status(400).json({ error: 'Missing modelId' });

    const session = modelSessions[modelId];
    if (!session) return res.status(404).json({ error: 'No active session for this model' });

    session.lastActivity = Date.now();
    const cookies = await session.page.cookies();

    // Some sites keep auth-relevant tokens in localStorage alongside
    // cookies, not just in cookies - grab it too so a future restore has
    // everything that might matter, not just the cookie jar.
    let localStorageData = null;
    try {
      localStorageData = await session.page.evaluate(() => {
        try {
          return JSON.stringify(localStorage);
        } catch (e) {
          return null;
        }
      });
    } catch (e) {
      console.warn(`[COOKIES] Could not read localStorage for ${modelId}:`, e.message);
    }

    res.json({ status: 'success', modelId, cookies, cookieCount: cookies.length, localStorageData });
  } catch (error) {
    console.error('[COOKIES] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Fetch the connected model's own OnlyFans profile info (for the avatar,
// called right after "Creator verbinden") by reusing the live authenticated
// session - same page.evaluate(fetch) trick as /sync-live, for the same
// reason a fresh cookie-cloned session would get rejected. The endpoint is
// a best guess (a common "current user" REST convention) - unconfirmed
// against a real session, same caveat as the chats/send-message endpoints;
// the Next.js side tries several likely field names for the avatar URL and
// just skips it if none match, so a wrong guess here fails safe.
app.get('/profile-info', async (req, res) => {
  const { modelId } = req.query;
  if (!modelId) return res.status(400).json({ error: 'Missing modelId' });

  const session = modelSessions[modelId];
  if (!session) return res.status(404).json({ error: 'No active session for this model' });
  session.lastActivity = Date.now();

  try {
    const endpoint = process.env.ONLYFANS_ME_ENDPOINT || '/api2/v2/users/me';
    const data = await session.page.evaluate(async (url) => {
      const res = await fetch(url, { credentials: 'include' });
      const text = await res.text();
      try {
        return { ok: res.ok, status: res.status, json: JSON.parse(text) };
      } catch (e) {
        return { ok: res.ok, status: res.status, text: text.slice(0, 500) };
      }
    }, endpoint);

    res.json({ status: 'success', modelId, data });
  } catch (error) {
    console.error(`[PROFILE-INFO] Error for ${modelId}:`, error.message);
    res.status(200).json({ status: 'error', error: error.message });
  }
});

// Re-launch a session from cookies saved earlier (used when the live browser
// already got closed by the idle timeout but the chatter wants to view it)
app.post('/restore', async (req, res) => {
  try {
    const { modelId, cookies, localStorageData } = req.body || {};
    if (!modelId || !Array.isArray(cookies)) {
      return res.status(400).json({ error: 'Missing modelId or cookies array' });
    }

    const session = await withModelLock(modelId, () => restoreSession(modelId, cookies, localStorageData));
    const state = await getLoginState(session.page);

    res.json({ status: 'success', modelId, ...state });
  } catch (error) {
    console.error('[RESTORE] Error:', error.message);
    res.status(200).json({ status: 'error', error: error.message });
  }
});

// Close a model's live browser, free the RAM, and wipe its on-disk profile
// so cookies from this login never survive into the next connect.
app.post('/disconnect', async (req, res) => {
  try {
    const { modelId } = req.body || {};
    if (!modelId) return res.status(400).json({ error: 'Missing modelId' });

    await closeSession(modelId, 'disconnect requested', true);
    res.json({ status: 'success', modelId });
  } catch (error) {
    console.error('[DISCONNECT] Error:', error.message);
    res.status(200).json({ status: 'error', error: error.message });
  }
});

// Sync inbox data by reusing the model's already-authenticated live session
// (if one is currently open) instead of cloning cookies into a fresh
// browser - a separate cookie-only clone got redirected to login even with
// valid cookies, while this exact session is proven authenticated (it's
// rendering the real inbox visually right now). Fetches run inside that
// page's own JS context via page.evaluate, so they carry whatever
// same-origin auth OnlyFans expects automatically. Only works opportunistically:
// if nobody currently has this model connected/open, there's nothing to
// reuse and this returns no_live_session rather than spinning up a new one.
app.post('/sync-live', async (req, res) => {
  const { modelId, discover } = req.body || {};
  if (!modelId) return res.status(400).json({ error: 'Missing modelId' });

  const session = modelSessions[modelId];
  if (!session) {
    return res.json({ status: 'no_live_session', modelId });
  }
  session.lastActivity = Date.now();

  try {
    if (discover) {
      // One-off discovery pass: navigate to the real chats page and record
      // every /api2/ call the app itself makes, to find the real endpoint
      // instead of guessing.
      const calls = [];
      const onRequest = (r) => {
        if (r.url().includes('/api2/')) calls.push(`${r.method()} ${r.url()}`);
      };
      session.page.on('request', onRequest);
      try {
        await session.page.goto('https://onlyfans.com/my/chats', { waitUntil: 'networkidle2', timeout: 20000 });
      } catch (e) {
        console.warn(`[SYNC-LIVE] Discovery nav warning for ${modelId}:`, e.message);
      }
      await new Promise((r) => setTimeout(r, 2000));
      session.page.off('request', onRequest);
      return res.json({ status: 'success', modelId, discovered: calls, pageUrl: session.page.url() });
    }

    // This used to fall back to a guessed endpoint (/api2/v2/chats?...) that
    // has now been directly confirmed to always return HTTP 400 - meaning
    // the periodic background sync loop was hitting a guaranteed-broken
    // endpoint against live sessions every 90 seconds for no benefit at all,
    // and possibly contributing to sessions dropping back to logged-out
    // (repeated malformed requests are exactly the kind of thing anti-fraud
    // systems flag). No longer guessing - only runs once the real endpoint
    // is confirmed via a discover pass and set explicitly.
    const endpoint = process.env.ONLYFANS_CHATS_ENDPOINT;
    if (!endpoint) {
      return res.json({ status: 'not_configured', modelId, message: 'ONLYFANS_CHATS_ENDPOINT not set - run discover:true against a live session first' });
    }
    const data = await session.page.evaluate(async (url) => {
      const res = await fetch(url, { credentials: 'include' });
      const text = await res.text();
      try {
        return { ok: res.ok, status: res.status, json: JSON.parse(text) };
      } catch (e) {
        return { ok: res.ok, status: res.status, text: text.slice(0, 500) };
      }
    }, endpoint);

    res.json({ status: 'success', modelId, data });
  } catch (error) {
    console.error(`[SYNC-LIVE] Error for ${modelId}:`, error.message);
    res.status(200).json({ status: 'error', error: error.message });
  }
});

// Send a chat message through the model's live, authenticated session -
// same page.evaluate(fetch) trick as /sync-live and for the same reason: a
// fresh cookie-cloned browser gets rejected by OnlyFans even with valid
// cookies, while this session is proven authenticated. The exact endpoint
// shape below is a best guess (same as the old, never-live-tested
// Browserless version) - run POST /sync-live with discover:true against a
// real logged-in session to confirm/correct it, same as the chats endpoint.
app.post('/send-message', async (req, res) => {
  const { modelId, fanId, text } = req.body || {};
  if (!modelId || !fanId || !text) {
    return res.status(400).json({ error: 'Missing modelId, fanId, or text' });
  }

  const session = modelSessions[modelId];
  if (!session) {
    return res.json({ status: 'no_live_session', modelId });
  }
  session.lastActivity = Date.now();

  try {
    // No longer guessing a default here either (see the same fix on
    // /sync-live) - a wrong guess means every send attempt POSTs a
    // malformed request to OnlyFans for no benefit. Confirm the real
    // endpoint via discover:true first.
    const endpoint = process.env.ONLYFANS_SEND_MESSAGE_ENDPOINT;
    if (!endpoint) {
      return res.json({ status: 'not_configured', modelId, message: 'ONLYFANS_SEND_MESSAGE_ENDPOINT not set - run discover:true against a live session first' });
    }
    const data = await session.page.evaluate(async (url, messageText) => {
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: messageText }),
      });
      const bodyText = await res.text();
      try {
        return { ok: res.ok, status: res.status, json: JSON.parse(bodyText) };
      } catch (e) {
        return { ok: res.ok, status: res.status, text: bodyText.slice(0, 500) };
      }
    }, endpoint, text);

    res.json({ status: 'success', modelId, data });
  } catch (error) {
    console.error(`[SEND-MESSAGE] Error for ${modelId}:`, error.message);
    res.status(200).json({ status: 'error', error: error.message });
  }
});

// Mint a one-shot token for /stream. Called by Next.js (shared-secret
// protected), never directly by the browser.
app.post('/stream-token', (req, res) => {
  const { modelId } = req.body || {};
  if (!modelId) return res.status(400).json({ error: 'Missing modelId' });

  const token = crypto.randomBytes(24).toString('hex');
  streamTokens[token] = { modelId, expiresAt: Date.now() + 60 * 1000 };
  res.json({ status: 'success', token });
});

// Continuous MJPEG stream of a model's live session - the polling
// screenshot-per-request approach meant every frame paid for a full
// HTTP round-trip, which made typing/clicking (and especially CAPTCHAs)
// feel like a slideshow. This pushes frames from a tight server-side loop
// over one long-lived connection instead, and is hit directly by the
// browser (bypassing Vercel, whose serverless functions would kill a
// connection this long-lived after a few seconds) - see the /stream-token
// route and the auth middleware above for how that's kept safe without
// exposing the permanent shared secret to the client.
app.get('/stream', (req, res) => {
  const { modelId, token } = req.query;
  const entry = token && streamTokens[token];
  if (!entry || entry.modelId !== modelId || entry.expiresAt < Date.now()) {
    return res.status(401).end('Unauthorized or expired token');
  }
  delete streamTokens[token]; // single-use

  const session = modelSessions[modelId];
  if (!session) return res.status(404).end('No active session for this model');

  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Connection: 'keep-alive',
  });

  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  const pushFrame = async () => {
    if (closed) return;
    const current = modelSessions[modelId];
    if (!current) {
      return res.end();
    }
    // A click/keypress is being executed against this same page right now -
    // don't contend with it for the CDP connection on a single CPU core.
    // Back off and check again shortly instead of queuing up behind it.
    if (current.interactionPending) {
      if (!closed) setTimeout(pushFrame, 50);
      return;
    }
    current.lastActivity = Date.now();
    try {
      const jpeg = await Promise.race([
        current.page.screenshot({ encoding: 'binary', type: 'jpeg', quality: 70 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
      ]);
      if (!closed) {
        res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);
        res.write(jpeg);
        res.write('\r\n');
      }
    } catch (e) {
      // Page mid-navigation or a slow frame - just skip it, the next one
      // will usually succeed.
    }
    if (!closed) setTimeout(pushFrame, 150);
  };

  pushFrame();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'running',
    activeSessions: Object.keys(modelSessions).length,
    maxConcurrentSessions: MAX_CONCURRENT_SESSIONS,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Listening on port ${PORT}`);
});

// Close every browser promptly on shutdown so systemd doesn't have to wait
// out the full stop timeout and SIGKILL us (which used to take ~90s and
// left the next start racing Xvfb).
async function shutdown(signal) {
  console.log(`[SERVER] ${signal} received, closing ${Object.keys(modelSessions).length} session(s)...`);
  await Promise.all(Object.keys(modelSessions).map((modelId) => closeSession(modelId, `shutdown (${signal})`)));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
