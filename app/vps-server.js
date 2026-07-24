const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs/promises');
const path = require('path');

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
// open so uptime monitors can hit it without the secret. The live view
// itself goes over VNC (x11vnc + websockify, reverse-proxied by Caddy
// directly to port 6080) rather than through this Express app at all, so
// its own password auth is what actually gates that traffic.
app.use((req, res, next) => {
  if (req.path === '/health') return next();
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

async function launchBrowser(modelId, display) {
  const launchOnce = () =>
    puppeteer.launch({
      headless: false,
      // Uses Puppeteer's own managed Chrome (downloaded into ~/.cache/puppeteer
      // by `npm install`) unless CHROMIUM_PATH points somewhere else.
      executablePath: process.env.CHROMIUM_PATH || puppeteer.executablePath(),
      // getOrCreateSession always points this at :1, the single display
      // both the admin's login flow and the ongoing CRM Inbox live view are
      // VNC-viewed on - the same persistent browser serves both. NOTE: with
      // only one shared display, two models connected at once would render
      // overlapping Chrome windows on top of each other over VNC; fine for
      // now (single test model), but running multiple models concurrently
      // will need one Xvfb+x11vnc+websockify set per display slot instead
      // of everything sharing :1.
      env: display ? { ...process.env, DISPLAY: display } : process.env,
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
        '--lang=de-DE',
        // Without this, Chrome's outer window opens at its own default
        // size, not the full Xvfb display - invisible to page.screenshot()
        // (which only captures the page content, not the whole virtual
        // screen) but very visible over VNC as a chunk of dead black
        // desktop next to a smaller window. Must match xvfb-login.service's
        // screen size exactly. Was 1920x1080 - OnlyFans' desktop layout
        // stays exactly the same at 1366x768 (well above any responsive
        // breakpoint), but with fewer physical pixels for the same layout,
        // noVNC's scaleViewport has less to shrink to fit a given on-screen
        // video size, so text and buttons end up visibly larger/readable.
        '--window-size=1366,768',
        '--window-position=0,0',
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
  if (existing && existing.browser.isConnected()) {
    existing.lastActivity = Date.now();
    return existing;
  }
  if (existing) {
    // Browser process died (crash, killed display, OOM, etc.) but the map
    // entry survived - reusing it silently would mean /connect keeps
    // returning success while showing a blank/dead window forever.
    console.warn(`[SESSION] Stale/disconnected browser for ${modelId}, relaunching`);
    delete modelSessions[modelId];
  }

  await enforceSessionCap(modelId);
  // Fresh login handshake - never inherit a previous session's cookies for this model
  await wipeProfileDir(modelId);

  const browser = await launchBrowser(modelId, ':1');
  const page = await browser.newPage();
  // Must match the --window-size Chrome launch arg and xvfb-login.service's
  // screen size. 1920x1080 briefly overloaded this 1-vCPU/1GB VPS (load
  // average 15+, heavy swapping) since Chrome renders it entirely in
  // software with --disable-gpu - that turned out to mostly be a
  // concurrent-launch race (fixed by withModelLock), not the resolution
  // alone. Now at 1366x768, chosen for VNC readability (see the
  // --window-size comment in launchBrowser), which also happens to be
  // lighter than Full HD.
  await page.setViewport({ width: 1366, height: 768 });
  // Chrome's --lang flag covers its own UI chrome; sites pick their content
  // language from the Accept-Language header, so both are needed for
  // OnlyFans itself to render in German.
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'de-DE,de;q=0.9' });
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

// A Chrome renderer can crash/get killed on its own (e.g. OOM) while the
// main browser process stays connected - browser.isConnected() stays true,
// but every read against session.page then fails with Puppeteer's "Session
// closed. Most likely the page has been closed." forever. Without this,
// every route just silently re-fails against the same dead page on every
// single poll (confirmed: this VPS's log was almost entirely this one
// repeated error, meaning a session had likely been stuck dead for a very
// long time), and the client never learns the session actually died -
// it just keeps seeing isLoggedIn:false, which looks exactly like "back to
// the login page" from the CRM Inbox. A single failed read can also just be
// a mid-navigation blip, so this only declares a session dead after a few
// consecutive failures, not the first one.
const DEAD_SESSION_THRESHOLD = 3;
function recordPageHealth(session, ok) {
  if (ok) {
    session.consecutiveFailures = 0;
    return false;
  }
  session.consecutiveFailures = (session.consecutiveFailures || 0) + 1;
  return session.consecutiveFailures >= DEAD_SESSION_THRESHOLD;
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
    if (recordPageHealth(session, !state.checkFailed)) {
      console.warn(`[STATUS] Page dead for ${modelId} after ${DEAD_SESSION_THRESHOLD} consecutive failures, closing session`);
      await closeSession(modelId, 'page crashed independently of browser');
      return res.json({ hasSession: false, isLoggedIn: false });
    }
    res.json({ hasSession: true, ...state });
  } catch (error) {
    console.error('[STATUS] Error:', error.message);
    res.status(200).json({ hasSession: false, isLoggedIn: false, error: error.message });
  }
});

// Force-reload a model's live session (e.g. the sidebar's "refresh session"
// context menu action). Mouse/keyboard/scroll all go over VNC directly now
// (native protocol-level forwarding, no relay needed) - this is the one
// thing VNC can't do from outside the video itself, since it's triggered
// from elsewhere in the CRM UI, not from inside the live view.
app.post('/interact', async (req, res) => {
  const { modelId, action } = req.body || {};

  try {
    if (!modelId || !action) {
      return res.status(400).json({ error: 'Missing modelId or action' });
    }
    if (action !== 'reload') {
      return res.status(400).json({ error: `Unsupported action: ${action}` });
    }

    const session = modelSessions[modelId];
    if (!session) return res.status(404).json({ error: 'No active session for this model' });

    session.lastActivity = Date.now();

    try {
      await session.page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (actionErr) {
      console.warn('[INTERACT] Reload error:', actionErr.message);
      return res.json({ status: 'error', action, error: actionErr.message });
    }

    const state = await getLoginState(session.page);
    res.json({ status: 'success', action, result: 'reloaded', ...state });
  } catch (error) {
    console.error('[INTERACT] Fatal error:', error.message);
    res.status(200).json({ status: 'error', action, error: error.message });
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

// Hands a CRM user's browser what it needs to open a real VNC connection -
// the password itself, since VNC auth happens client-side via noVNC. Used
// for both the admin login flow and the CRM Inbox live view (both connect
// to the same display :1 VNC service). Shared-secret protected like every
// other route here; the browser never talks to this directly, only
// Next.js does, which gates who's allowed to ask for it.
app.get('/vnc-info', (req, res) => {
  const password = process.env.VNC_LOGIN_PASSWORD;
  if (!password) {
    return res.status(500).json({ error: 'VNC_LOGIN_PASSWORD not configured on the VPS' });
  }
  res.json({ status: 'success', password });
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
