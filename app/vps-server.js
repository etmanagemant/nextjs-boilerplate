const express = require('express');
// puppeteer-extra + the stealth plugin patch the automation fingerprints a
// plain Puppeteer-launched Chrome carries for its entire lifetime
// (navigator.webdriver, missing plugins, CDP-specific quirks, etc.) - not
// about how "human" input during the manual VNC login looks (that's
// already indistinguishable from real input, since it arrives as genuine
// X11/OS-level events), but about the browser process itself being
// continuously fingerprintable as automated for as long as it stays open,
// which anti-fraud systems can act on at any point, not just at login.
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs/promises');
const fsSync = require('fs');
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
// open so uptime monitors can hit it without the secret. The live view
// itself goes over VNC (x11vnc + websockify, reverse-proxied by Caddy
// directly to port 6080) rather than through this Express app at all, so
// its own password auth is what actually gates that traffic.
app.use((req, res, next) => {
  // /public-upload-to-vault-fan is called directly by a chatter/model's own
  // browser (see lib/uploadVaultBatch.ts) - it can never carry the shared
  // secret (that would mean shipping the one credential that controls
  // every connected model's live browser to every client, defeating the
  // whole point of it). That route verifies its own short-lived, model-
  // scoped signed token instead - see verifyUploadToken below.
  // /audio-stream is loaded directly by a plain <audio src> tag in the
  // browser (see OnlyFansViewer.tsx/BrowserLoginStreamComponent.tsx),
  // which can't attach a custom header - same reasoning and same signed,
  // model-scoped token mechanism as /public-upload-to-vault-fan below.
  if (req.path === '/health' || req.path === '/public-upload-to-vault-fan' || req.path === '/audio-stream') return next();
  const expected = process.env.VPS_SHARED_SECRET;
  if (!expected) return next(); // not configured - fail open rather than lock everyone out
  if (req.headers['x-vps-secret'] !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// The /debug-* routes (debug-eval, debug-goto, debug-click, debug-type,
// debug-fetch, debug-screenshot, debug-network-*, debug-send-test,
// debug-dom) were built for live diagnosis during development - together
// they allow arbitrary JS execution, arbitrary navigation, and arbitrary
// credentialed fetches inside a real, logged-in OnlyFans session. That's a
// much bigger blast radius than "control the browser" if the shared
// secret above ever leaks or (per its own fail-open comment) isn't set at
// all. Off by default in any environment that hasn't explicitly turned
// them on for an active debugging session.
app.use((req, res, next) => {
  if (!req.path.startsWith('/debug-')) return next();
  if (process.env.DEBUG_ROUTES_ENABLED === 'true') return next();
  return res.status(404).json({ error: 'Not found' });
});

// ============================================================================
// PERSISTENT PER-MODEL SESSIONS
// One long-lived headful browser per connected model, reused for both the
// initial login handshake AND the ongoing live view — no more relaunching
// Chromium on every single poll.
// ============================================================================

const modelSessions = {}; // modelId -> { browser, page, lastActivity, createdAt }
// batchId -> { modelId, vaultFanId, vaultFanLabel, price, filePaths: [] } -
// accumulates staged files for one Upload Vault batch (see /upload-to-vault-fan)
// before the actual OnlyFans automation runs once for the whole batch.
const pendingUploadBatches = {};
// Was 20 minutes, then 6 hours - both still far short of the explicit
// requirement that a connected model stays connected for days to months,
// only ever disconnecting on purpose via Connection Hub. CONFIRMED LIVE
// (2026-07-27) that 6h was still too short even setting aside the
// separate lastActivity-never-refreshed bug fixed above in assignSlot:
// both test models went idle and dropped during a single working day.
// 90 days as a generous outer safety net (genuinely-abandoned sessions
// still eventually free their RAM) rather than disabling this sweep
// outright - actual usage refreshes lastActivity long before this would
// ever fire for a model anyone is still working.
const IDLE_TIMEOUT_MS = 90 * 24 * 60 * 60 * 1000; // close a session after 90 days of no requests
// Per the user's explicit ask (2026-07-29): with real RAM pressure on this
// 2GB box, a model nobody has actually looked at/chatted through in a
// while shouldn't keep costing ~950MB just to sit there. Distinct from
// IDLE_TIMEOUT_MS above - this is a PAUSE (browser closed, cookies/profile
// kept, Connection Hub still shows it connected), not a disconnect. See
// assignSlot below for the resume side.
const CHATTER_IDLE_PAUSE_MS = 30 * 60 * 1000;

// Your Vultr box (ETMANAGEMENT, 80.240.30.188) has 1GB RAM - a single headful
// Chromium session already uses 300-500MB, so default to ONE at a time.
// Bump via MAX_CONCURRENT_SESSIONS env var if you upgrade the VPS.
const MAX_CONCURRENT_SESSIONS = Number(process.env.MAX_CONCURRENT_SESSIONS || 1);

// CONFIRMED LIVE (2026-07-29): /tmp gets wiped on a real VPS reboot (a
// Vultr plan resize triggers exactly this, not just a `systemctl restart`
// of this service) - every connected model's saved login vanished at once
// and had to be redone by hand, since the auto-reconnect fallback (a lossy
// cookie map from Supabase) isn't reliable enough on its own. Profiles now
// live next to the app itself, which survives a real reboot.
function profileDir(modelId) {
  return path.join('/root/puppeteer-server/chrome-profiles', `chromium-${modelId}`);
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
// CONFIRMED LIVE (2026-07-29): withModelLock alone doesn't protect
// ensureSlotBrowser's own profileDir(modelId) copy (see assignSlot) -
// calling withModelLock there would just silently skip that copy and hand
// back whatever the OTHER in-flight call was doing (a /connect wipe+
// relaunch, an auto-reconnect, our own resume), not run it at all. This
// instead just waits for any in-flight main-session operation on this
// modelId to fully settle - wipe-then-relaunch included - before letting
// a chatter-slot request read that model's profile dir at all, so it
// never reads it mid-write. Errors from whatever we waited on are that
// caller's problem, not ours - swallowed here on purpose.
async function waitForModelLock(modelId) {
  if (pendingLaunches[modelId]) {
    await pendingLaunches[modelId].catch(() => {});
  }
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
      'img, video, picture, svg, canvas, iframe { filter: invert(1) hue-rotate(180deg) !important; } ' +
      '.__etm_emoji_fix__ { filter: invert(1) hue-rotate(180deg) !important; }';
    (document.head || document.documentElement).appendChild(style);
  }
  if (document.head) inject();
  else document.addEventListener('DOMContentLoaded', inject);

  // CONFIRMED LIVE (2026-07-29): reported as an emoji rendering "like a
  // pumpkin" instead of its real colors - emoji are TEXT (a font glyph),
  // not one of the img/video/etc elements the counter-filter above
  // targets, so the page-wide invert+hue-rotate+sepia was hitting them
  // directly with no correction at all. Text nodes can't be selectively
  // filtered by CSS, so this wraps each emoji character in its own span
  // (once) so THAT can be targeted the same way media already is.
  //
  // CONFIRMED LIVE (2026-07-29, after real debugging via /debug-eval, not
  // guessing): a MutationObserver AND a setInterval both work fine on this
  // page in general (tested each standalone), but neither one, set up
  // from INSIDE this evaluateOnNewDocument script, ever fired again after
  // the first synchronous call - root cause not pinned down under time
  // pressure. window.__etmScanEmoji is exposed here so the SERVER SIDE can
  // drive it instead (see the periodic page.evaluate() call next to
  // FAN-SPEND-SYNC) - a mechanism already proven reliable throughout this
  // whole debugging session, unlike anything timer-based inside the page.
  var EMOJI_TEST = /(\\p{Emoji_Presentation}|\\p{Extended_Pictographic})/u;
  var EMOJI_SPLIT = /(\\p{Emoji_Presentation}|\\p{Extended_Pictographic})/gu;
  window.__etmScanEmoji = function() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var targets = [];
    var node;
    while ((node = walker.nextNode())) {
      var p = node.parentNode;
      if (p && p.nodeType === 1 && p.classList && p.classList.contains('__etm_emoji_fix__')) continue;
      if (EMOJI_TEST.test(node.nodeValue)) targets.push(node);
    }
    targets.forEach(function(textNode) {
      var parts = textNode.nodeValue.split(EMOJI_SPLIT);
      if (parts.length < 2) return;
      var frag = document.createDocumentFragment();
      parts.forEach(function(part, i) {
        if (!part) return;
        if (i % 2 === 1) {
          var span = document.createElement('span');
          span.className = '__etm_emoji_fix__';
          span.textContent = part;
          frag.appendChild(span);
        } else {
          frag.appendChild(document.createTextNode(part));
        }
      });
      textNode.parentNode.replaceChild(frag, textNode);
    });
  };
  if (document.body) window.__etmScanEmoji();
  else document.addEventListener('DOMContentLoaded', window.__etmScanEmoji);
})();
`;

// Drives window.__etmScanEmoji (see DARK_MODE_SCRIPT) from the server side
// instead of an in-page timer - CONFIRMED LIVE that neither a
// MutationObserver nor a setInterval set up from inside an
// evaluateOnNewDocument script kept firing past the first call, for
// reasons not fully pinned down; a server-driven page.evaluate() call is
// the one mechanism proven reliable throughout that debugging. Covers
// every active model session AND chatter slot - the emoji issue isn't
// specific to either.
setInterval(() => {
  for (const session of Object.values(modelSessions)) {
    if (session.page) session.page.evaluate('window.__etmScanEmoji && window.__etmScanEmoji()').catch(() => {});
  }
  for (const slot of CHATTER_SLOTS) {
    if (slot.page) slot.page.evaluate('window.__etmScanEmoji && window.__etmScanEmoji()').catch(() => {});
  }
}, 1500);

async function enableDarkMode(page) {
  try {
    await page.evaluateOnNewDocument(DARK_MODE_SCRIPT);
  } catch (e) {
    console.warn('[DARK-MODE] Could not register:', e.message);
  }
}

// The --lang Chrome flag and Accept-Language header only affect OnlyFans'
// browser-detected default; once a session exists, OnlyFans actually reads
// its own 'lang' cookie to decide UI language and keeps whatever that cookie
// already says (confirmed live via /cookies - a session still showed
// lang=en despite both of the above being set). Setting the cookie directly
// is the only thing that reliably forces German, so every fresh session
// (main model login and each chatter slot copy) sets it explicitly rather
// than relying on the account's own saved preference.
async function setGermanLangCookie(page) {
  try {
    await page.setCookie({ name: 'lang', value: 'de', domain: '.onlyfans.com', path: '/' });
  } catch (e) {
    console.warn('[LANG] Could not set lang cookie:', e.message);
  }
}

// Reserves empty space at the bottom of the real chat message list so the
// CRM's own floating emoji bar (drawn on top of the VNC feed, positioned
// over the compose-box area) never covers actual OnlyFans content - the
// message list scrolls within its own shorter box instead of running all
// the way to the bottom of the frame. ".b-chat__messages" confirmed live
// via /debug-dom as the actual scrollable message container.
// Also hides OnlyFans' own native scrollbars (visually only, scrolling
// still works via wheel/drag) - a visible native scrollbar right at the
// video's edge, next to the CRM's own Fan panel, reads as a seam between
// "the real site" and "our overlay" rather than one integrated view.
const RESERVE_OVERLAY_SPACE_SCRIPT = `
(function() {
  function inject() {
    if (document.getElementById('__crm_reserve_space__')) return;
    var style = document.createElement('style');
    style.id = '__crm_reserve_space__';
    style.textContent = '.b-chat__messages { padding-bottom: 90px !important; } ' +
      '* { scrollbar-width: none !important; } ' +
      '*::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; } ' +
      // The persistent vertical line reported live survived two targeted
      // guesses (list/content seam, then several individually-colored
      // candidates) - rather than keep guessing which specific element it
      // is, this removes border/box-shadow/outline from every element
      // inside the chat view at once.
      '.b-chats, .b-chats * { border: none !important; box-shadow: none !important; outline: none !important; } ' +
      // Precisely pinpointed live (annotated screenshot): the line actually
      // sits at the icon-rail/content seam, not inside .b-chats at all -
      // every previous guess targeted the wrong side of that boundary.
      // .l-header is the icon rail itself (confirmed live: width 64px,
      // spans full height) - covering it and its pseudo-elements the same
      // way as .b-chats above.
      '.l-header, .l-header *, .l-header::before, .l-header::after, .l-header *::before, .l-header *::after { border: none !important; box-shadow: none !important; outline: none !important; } ' +
      // Second hypothesis for the same line, in case it isn't a border at
      // all - class names like "m-native-custom-scrollbar" seen live
      // (on .l-header__menu itself) suggest OnlyFans renders its own
      // scrollbar as a plain styled div rather than a real native one,
      // which the *::-webkit-scrollbar rule above can't touch since
      // there's nothing native there to hide.
      '[class*="scrollbar"] { background: transparent !important; }' +
      // Confirmed live via /debug-dom: the chat conversation area
      // (.b-chats, inside <main>) only rendered 984px wide inside the
      // 1280px frame even after the sidebar/main gap fix - some max-width
      // OnlyFans applies for readability on their own full-size layout,
      // wasting ~232px on the right that the CRM's fixed 1280x800 video
      // can't spare. Forcing it to fill <main> instead.
      '.b-chats, .b-chats__conversations, .b-chats__conversations-list { width: 100% !important; max-width: 100% !important; } ' +
      // Stripping the sidebar labels' text (see the nav script) only clears
      // the text node - the item still occupies its original ~226px box,
      // confirmed live via /debug-dom, which read as "empty space where
      // more text should be" rather than an actually-compact icon rail.
      // Collapsing both the item and the sidebar's own fixed-width
      // container down to icon width fixes that.
      '.l-sidebar, .l-sidebar__inner { width: 64px !important; overflow: hidden !important; } ' +
      '.l-sidebar__menu__item { width: 48px !important; min-width: 48px !important; padding-left: 0 !important; padding-right: 0 !important; justify-content: center !important; } ' +
      // Same compacting as the sidebar items above, for the "New Post"
      // button - it lives in a different class family (.l-header__menu, not
      // .l-sidebar__menu) so needs its own matching rule rather than
      // inheriting the one above.
      '.m-create-post { width: 48px !important; min-width: 48px !important; padding-left: 0 !important; padding-right: 0 !important; justify-content: center !important; } ' +
      // The actual flex item reserving horizontal track space turned out to
      // be the OUTER <header class="l-header"> wrapping .l-sidebar, not
      // .l-sidebar itself - confirmed live via /debug-dom: .l-sidebar
      // measured 64px as intended, but l-header (its parent, a flex sibling
      // of <main> inside .m-main-container) was still the original 280px,
      // so <main> kept starting 280px in regardless of how narrow the
      // sidebar visually looked. This alone fixes the chat page - <main>
      // there is position:relative, so it repositions itself correctly
      // through normal flex flow once its sibling actually shrinks, no
      // "left" override needed at all.
      // flex-basis (not width) governs how much track space a flex child
      // reserves when it's explicitly set, which a plain width override
      // cannot beat - forcing the shorthand directly is what actually
      // shrinks the reserved space instead of just clipping the box.
      '.l-header { width: 64px !important; flex: 0 0 64px !important; overflow: hidden !important; } ' +
      // Root cause of the leftover gap on the individual-conversation view,
      // confirmed live via /debug-dom: <main class="no-padding"> (only this
      // exact class/state, not the plain chat-list view) carries its own
      // margin-left:216px - presumably reserved for a fan-info side panel
      // OnlyFans has in its own UI that this compact view never renders.
      // That margin both shifted main's position AND, since it counts
      // against a flex-grow item's available track, capped its actual
      // width at 984px regardless of the .l-header fix above. The
      // self-correcting "left" JS logic already masks the position part,
      // but never touched the width main lost to it - removing the margin
      // outright fixes both at once.
      // margin-left:0 (above) fixed <main>'s position but NOT its width -
      // confirmed live it stayed capped at 984px even with margin
      // confirmed 0, so a separate max-width/flex-basis constraint is also
      // in play. Forcing every plausible sizing property at once instead
      // of diagnosing each individually - .b-chats already fills <main>'s
      // own box (see above), so widening <main> itself is the last piece.
      'main { margin-left: 0 !important; width: 100% !important; max-width: 100% !important; flex: 1 1 auto !important; outline: none !important; box-shadow: none !important; border: none !important; } ' +
      // New hypothesis for the persistent line, precisely located at
      // <main>'s own left edge (confirmed live: <main id="content"
      // tabindex="-1">, which every previous fix scoped to .b-chats or
      // .l-header never touched, since <main> is neither). tabindex="-1"
      // means it's programmatically focusable, and SPAs commonly focus
      // their main content on route change for accessibility - Chrome
      // draws its own default focus ring on a focused element regardless
      // of any CSS on that element's children or a differently-scoped
      // sibling, which would explain surviving every fix so far.
      'main:focus, main:focus-visible { outline: none !important; box-shadow: none !important; }' +
      // Explicitly requested: gold section dividers matching the CRM's own
      // theme, in place of OnlyFans' native ones - between the chat list
      // and the open conversation, and under each header row. Placed after
      // the blanket border-removal rules above so these actually win
      // (equal specificity, later in source order). NOTE: the specific
      // persistent vertical line reported live sits mid-row inside the chat
      // list itself, not at a panel edge - every targeted CSS guess so far
      // (borders, scrollbars, outlines, margins, focus rings, all above)
      // has failed to remove it, which points at a VNC/canvas-encoding tile
      // seam rather than an actual page element; these new borders don't
      // specifically chase that theory, just add the requested gold
      // dividers at the real panel boundaries.
      '.b-chats__conversations-list { border-right: 2px solid rgba(201,168,106,0.35) !important; } ' +
      '.b-chats__header, .b-chat__header, .b-header-conversation { border-bottom: 2px solid rgba(201,168,106,0.35) !important; }';
    (document.head || document.documentElement).appendChild(style);
  }
  if (document.head) inject();
  else document.addEventListener('DOMContentLoaded', inject);
})();
`;

async function reserveOverlaySpace(page) {
  try {
    await page.evaluateOnNewDocument(RESERVE_OVERLAY_SPACE_SCRIPT);
  } catch (e) {
    console.warn('[RESERVE-SPACE] Could not register:', e.message);
  }
}

// Compacts the left sidebar to icon-only for EVERY role (admin included) -
// originally this was chatter-only, but the icon-only look is a general
// space-saving preference, not a permission restriction. Actual permission
// restrictions (fully hiding Home/Queue/Statements/My profile/More/
// Statistics/New Post) still only apply to chatters - admins see and can
// click everything, just without the text labels taking up width. Also
// hides OnlyFans' own floating "Help & support" widget (the "contact_button"
// bubble near the bottom-right of the page) for everyone - confirmed live
// via /debug-dom, it's a separate element from the sidebar's own "Help and
// support" link (which just gets icon-only'd like the rest of the sidebar).
// Text-matched (case-insensitive) rather than CSS classes for the sidebar
// items, same "fragile but functional, no reliance on OnlyFans' own
// unstable class names" trade-off as the dark-mode injection above. A
// MutationObserver re-applies this as OnlyFans' own SPA re-renders the nav.
// %%ROLE%% is substituted per slot before injection.
const NAV_SCRIPT_TEMPLATE = `
(function() {
  var ROLE = "%%ROLE%%";
  // English AND German - the account's OnlyFans UI language was switched to
  // German (confirmed live: text-only matching against English labels went
  // completely silent the moment the account language changed, since
  // "Start"/"Nachrichten"/etc. never matched the English-only list at all).
  // Both lists covered so this keeps working regardless of which language
  // the account happens to be set to.
  var HIDDEN_LABELS = ROLE === 'admin'
    ? []
    : ['home', 'queue', 'statements', 'my profile', 'more', 'statistics', 'new post', 'referrals', 'settings',
       'start', 'warteschlange', 'aussagen', 'mein profil', 'mehr', 'statistiken', 'neuer beitrag', 'meine empfehlungen', 'einstellungen'];
  var ICON_ONLY_LABELS = ROLE === 'admin'
    ? ['home', 'notifications', 'messages', 'collections', 'vault', 'queue', 'statements', 'statistics', 'my profile', 'more', 'help and support', 'referrals', 'settings',
       'start', 'benachrichtigungen', 'nachrichten', 'sammlungen', 'tresor', 'warteschlange', 'aussagen', 'statistiken', 'mein profil', 'mehr', 'hilfe und support', 'hilfe & support', 'meine empfehlungen', 'einstellungen']
    : ['notifications', 'messages', 'collections', 'vault', 'help and support',
       'benachrichtigungen', 'nachrichten', 'sammlungen', 'tresor', 'hilfe und support', 'hilfe & support'];

  function norm(s) { return (s || '').trim().toLowerCase(); }

  // Walks the FULL subtree, not just direct children - OnlyFans wraps most
  // nav labels in a nested <span class="...__text">, so a direct-children-
  // only check (the first version of this) never actually found the text
  // node to clear and silently did nothing. Confirmed live via a screenshot
  // showing full text still present on every sidebar item.
  function stripTrailingText(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (node.textContent) node.textContent = '';
    }
  }

  function scan() {
    var candidates = document.querySelectorAll('a, button');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var text = norm(el.textContent);
      if (HIDDEN_LABELS.indexOf(text) !== -1) {
        if (el.style.display !== 'none') el.style.display = 'none';
      } else if (ICON_ONLY_LABELS.indexOf(text) !== -1) {
        stripTrailingText(el);
      }
    }
    var contactBtn = document.querySelector('.contact_button, a[aria-label*="Help" i][aria-label*="support" i]');
    if (contactBtn && contactBtn.style.display !== 'none') contactBtn.style.display = 'none';
    // The "New Post"/"Neuer Beitrag" button isn't part of the sidebar at
    // all - confirmed live it's ".m-create-post" under a completely
    // different "l-header__menu__item" class family. Post creation is an
    // admin/model-management task, not something chatters need - shown
    // icon-only for admins (same treatment as the rest of the rail), fully
    // hidden for chatters, same permission split as the HIDDEN_LABELS items.
    var newPostBtn = document.querySelector('.m-create-post');
    if (newPostBtn) {
      if (ROLE === 'admin') {
        if (newPostBtn.style.display === 'none') newPostBtn.style.removeProperty('display');
        stripTrailingText(newPostBtn);
      } else if (newPostBtn.style.display !== 'none') {
        newPostBtn.style.display = 'none';
      }
    }
    // <main>'s own positioning scheme differs by page - confirmed live via
    // /debug-dom. On some pages (e.g. the Home feed) it's
    // position:absolute/fixed with OnlyFans' own hardcoded left:280px,
    // needing an explicit override. On others (e.g. the chat page) it's
    // position:relative, but even after the real .l-header width fix above,
    // <main> still measured a ~216px gap past the header's actual right
    // edge that no single computed-style property (margin/padding/left/
    // transform - all individually checked live) explained, so something
    // in OnlyFans' own flex math still reserves it. Rather than chase the
    // exact mechanism further, this measures the gap directly every scan
    // (reset left to 0, compare main's real edge to the header's real right
    // edge, apply whatever delta cancels it) - self-correcting regardless
    // of which internal cause produces the gap on a given page.
    var mainEl = document.querySelector('main');
    var headerEl = document.querySelector('.l-header');
    if (mainEl) {
      var mainPos = window.getComputedStyle(mainEl).position;
      if (mainPos === 'absolute' || mainPos === 'fixed') {
        if (mainEl.style.left !== '64px') mainEl.style.setProperty('left', '64px', 'important');
      } else if (mainPos === 'relative' && headerEl) {
        mainEl.style.setProperty('left', '0px', 'important');
        var headerRight = headerEl.getBoundingClientRect().right;
        var mainLeftNow = mainEl.getBoundingClientRect().left;
        var neededLeft = Math.round(headerRight - mainLeftNow);
        if (Math.abs(neededLeft) > 1) {
          mainEl.style.setProperty('left', neededLeft + 'px', 'important');
        }
      } else if (mainEl.style.left) {
        mainEl.style.removeProperty('left');
      }
    }
  }
  function start() {
    scan();
    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
`;

async function applyNavRestrictions(page, role) {
  try {
    const script = NAV_SCRIPT_TEMPLATE.replace('%%ROLE%%', role === 'admin' ? 'admin' : 'chatter');
    await page.evaluateOnNewDocument(script);
  } catch (e) {
    console.warn('[NAV-RESTRICTIONS] Could not register:', e.message);
  }
}

// Labels an outgoing message bubble with which chatter sent it - but ONLY
// the ones actually sent from THIS slot, not every "m-from-me" bubble.
// Multiple chatters can have their own slot open on the exact same real
// OnlyFans conversation at once (same underlying account, synced by
// OnlyFans itself across all of them). First version only labeled
// messages while the SAME session that sent them was still open, keyed off
// a local "did I just press send" timer - meaning a different chatter (or
// the same chatter reopening later) never saw the label at all, since nothing
// persisted anywhere. Confirmed by the user's exact requirement: admin
// Tobias sends at 13:40, chatter Y opens the same chat at 14:00 and must
// still see "gesendet von Tobias" under that older message, then supervisor
// Saskia joining at 15:00 must see BOTH Tobias's and chatter Y's messages
// correctly attributed - i.e. attribution has to be a fact recorded
// somewhere shared, not a per-browser-session guess.
//
// So this now does two independent things:
//  1) Detects a local send (Enter in the compose box, or a "send"-labeled
//     button click) and POSTs the sent text + this slot's chatter name to
//     our own app's /api/crm/log-sent-message, which persists it in
//     Supabase (crm_onlyfans_sent_log).
//  2) Independently, on a timer, GETs that same log for the current fan and
//     labels EVERY matching "m-from-me" bubble - not just ones this
//     specific slot sent - by walking both lists (DOM bubbles in order,
//     log entries in order) and matching by message text, consuming log
//     entries left-to-right so repeated identical texts ("test", "test")
//     still line up correctly against repeated log entries in the same
//     order. A bubble with no matching log entry (sent before this feature
//     existed, or never logged for some other reason) is left unlabeled
//     rather than guessed.
//
// %%CHATTER_NAME%%, %%MODEL_ID%%, %%API_BASE%% are substituted per slot
// before injection (evaluateOnNewDocument only accepts a plain string, not
// a closure over a variable).
const SENT_BY_OVERLAY_SCRIPT_TEMPLATE = `
(function() {
  // Main-session viewers can change (see assignSlot's mainViewer claim),
  // which re-runs this script on an ALREADY-loaded page to update who
  // gets credited - without this guard, the event listeners below would
  // stack up (one extra "gesendet von" log per past viewer) instead of
  // just picking up the new name. window.__etmChatterName is what
  // actually gets read at send-time, not the closured constant below.
  window.__etmChatterName = "%%CHATTER_NAME%%";
  if (window.__etmSentByInstalled) return;
  window.__etmSentByInstalled = true;
  var MODEL_ID = "%%MODEL_ID%%";
  var API_BASE = "%%API_BASE%%";
  var LABEL_CLASS = 'etm-sent-by-label';
  var SEND_WINDOW_MS = 8000;
  var recentSendUntil = 0;

  function getFanId() {
    var m = location.pathname.match(/\\/chats\\/chat\\/(\\d+)/);
    return m ? m[1] : null;
  }

  function getBubbleText(el) {
    var holder = el.querySelector('.b-chat__message__text-holder');
    return holder ? holder.textContent.trim() : '';
  }

  // CONFIRMED LIVE (via debug-eval): an attachment-only bubble carries
  // 'm-has-media' on the outer .b-chat__message and has no text-holder at
  // all - text-matching can never attribute these (an empty string isn't
  // a usable identifier once more than one exists in a conversation). The
  // attached image itself is: OnlyFans re-signs its CDN thumbnail URLs
  // (fresh query string) on every page load, but the stable path before
  // the '?' (domain + /files/<hash>/<size>_<name>.<ext>) doesn't change -
  // same trick already proven for vault-picker thumbnail matching.
  function getBubbleMediaKey(el) {
    if (!el.classList.contains('m-has-media')) return '';
    var img = el.querySelector('.post_media img, .b-chat__message__media img');
    if (!img || !img.src) return '';
    return img.src.split('?')[0];
  }

  function armSendWindow() {
    recentSendUntil = Date.now() + SEND_WINDOW_MS;
  }

  function attachSendListeners() {
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        var el = e.target;
        if (el && (el.tagName === 'TEXTAREA' || el.isContentEditable)) armSendWindow();
      }
    }, true);
    document.addEventListener('click', function(e) {
      var btn = e.target && e.target.closest && e.target.closest('button, [role="button"]');
      if (!btn) return;
      var label = ((btn.textContent || '') + ' ' + (btn.getAttribute('aria-label') || '')).toLowerCase();
      if (label.indexOf('send') !== -1) armSendWindow();
    }, true);
  }

  function logIfLocallySent(el) {
    // Fixes a race that showed up specifically when typing several
    // messages quickly: OnlyFans inserts the bubble's DOM node before its
    // text content is fully rendered, so the very first MutationObserver
    // callback for a brand-new bubble could see empty text. The old code
    // marked the bubble "logged" regardless, permanently giving up on it -
    // once marked, it's never re-checked, so it silently never got sent to
    // the log and never got a label. Now only bubbles outside the send
    // window (definitely not ours) get marked immediately; ones with no
    // text yet are left unmarked so a later mutation (once the text
    // actually renders) retries them.
    if (el.dataset.etmLogged) return;
    if (Date.now() > recentSendUntil) {
      el.dataset.etmLogged = '1';
      return;
    }
    var text = getBubbleText(el);
    var mediaKey = text ? '' : getBubbleMediaKey(el);
    if (!text && !mediaKey) return;
    el.dataset.etmLogged = '1';
    var fanId = getFanId();
    if (!fanId || !API_BASE) return;
    fetch(API_BASE + '/api/crm/log-sent-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        text
          ? { modelId: MODEL_ID, fanId: fanId, chatterName: window.__etmChatterName, messageText: text }
          : { modelId: MODEL_ID, fanId: fanId, chatterName: window.__etmChatterName, mediaKey: mediaKey }
      ),
    }).catch(function() {});
  }

  function scanForLocalSends() {
    var mine = document.querySelectorAll('.b-chat__message.m-from-me');
    for (var i = 0; i < mine.length; i++) logIfLocallySent(mine[i]);
  }

  var sentLog = [];
  function fetchLog() {
    var fanId = getFanId();
    if (!fanId || !API_BASE) return;
    fetch(API_BASE + '/api/crm/log-sent-message?modelId=' + encodeURIComponent(MODEL_ID) + '&fanId=' + encodeURIComponent(fanId))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        sentLog = (data && data.entries) || [];
        applyLabelsFromLog();
      })
      .catch(function() {});
  }

  function applyLabelsFromLog() {
    // sentLog is a *fresh* array from the server on every call (fetchLog
    // runs every 4s), so logIdx starts at 0 every call too - stateless by
    // design, re-derived from scratch each time rather than trusted to
    // persist. EVERY message needs its own visible "gesendet von X",
    // always - confirmed live, no suppression for repeats.
    //
    // Previously searched AHEAD through the remaining log for any text
    // match, not just the entry at logIdx - this broke badly on real data:
    // this test conversation has old bubbles ("test", "hallo") sent before
    // the logging system even existed, mixed in with later genuinely-
    // logged messages using the SAME short text. An old unlogged "test"
    // bubble would match a much LATER real log entry for a different
    // "test" message and consume it, leaving the actual later bubble with
    // nothing to match - confirmed live: only the first several log
    // entries ever got labeled, everything after silently got nothing.
    // Matching strictly at logIdx only (never searching ahead) fixes this:
    // a bubble that isn't the log's next expected entry just gets skipped
    // without consuming anything, so unlogged junk bubbles interleaved
    // anywhere no longer steal a later duplicate-text entry.
    // Attachment-only entries (media_key set, message_text null) match by
    // the bubble's own image src instead of text - same left-to-right,
    // never-search-ahead matching as text, for the same reason: two
    // unrelated attachment messages would otherwise be indistinguishable
    // enough to misattribute (arguably worse than the text case, since
    // there's no content at all to tell them apart by, only order).
    var mine = document.querySelectorAll('.b-chat__message.m-from-me');
    var logIdx = 0;
    for (var i = 0; i < mine.length && logIdx < sentLog.length; i++) {
      var el = mine[i];
      var entry = sentLog[logIdx];
      var matched = false;
      if (entry.message_text) {
        matched = getBubbleText(el) === entry.message_text;
      } else if (entry.media_key) {
        matched = getBubbleMediaKey(el) === entry.media_key;
      }
      if (!matched) continue;
      var chatterName = entry.chatter_name;
      var sentAt = entry.sent_at;
      logIdx++;
      if (el.querySelector('.' + LABEL_CLASS)) continue;

      // CONFIRMED LIVE (via debug-eval, full untruncated bubble HTML): the
      // earlier attempt at this looked for "a bare, class-less <span>" and
      // could never find a reliable match - but the real element is
      // '.b-chat__message__time' (holds both the time text AND the
      // read-receipt checkmark svg together), a normal classed element,
      // not classless at all. Appending our label INSIDE it puts it on
      // the exact same line as OnlyFans' own "18:50 ✓" instead of a
      // separate stacked line below. Falls back to the old self-contained
      // "HH:MM gesendet von X" block if OnlyFans ever changes this markup
      // again, so a missing selector degrades to a still-readable label
      // instead of silently showing nothing.
      var timeContainer = el.querySelector('.b-chat__message__time');
      var tag = document.createElement(timeContainer ? 'span' : 'div');
      tag.className = LABEL_CLASS;
      if (timeContainer) {
        tag.textContent = ' gesendet von ' + chatterName;
        tag.style.cssText = 'font-size:10px;opacity:0.55;color:inherit;white-space:nowrap;';
        timeContainer.appendChild(tag);
      } else {
        var timeStr = '';
        try {
          timeStr = new Date(sentAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        } catch (e) {}
        tag.textContent = (timeStr ? timeStr + ' ' : '') + 'gesendet von ' + chatterName;
        tag.style.cssText = 'font-size:10px;opacity:0.55;color:inherit;white-space:nowrap;display:block;text-align:right;margin-top:2px;';
        el.appendChild(tag);
      }
    }
  }

  function start() {
    attachSendListeners();
    scanForLocalSends();
    fetchLog();
    setInterval(fetchLog, 4000);
    new MutationObserver(scanForLocalSends).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
`;

// %%USER_ID%%/%%USER_ROLE%%/%%API_BASE%% substituted per slot before
// injection, same convention as SENT_BY_OVERLAY_SCRIPT_TEMPLATE above.
const SCRIPT_VAULT_BUTTON_SCRIPT_TEMPLATE = `
(function() {
  var USER_ID = "%%USER_ID%%";
  var USER_ROLE = "%%USER_ROLE%%";
  var MODEL_ID = "%%MODEL_ID%%";
  var API_BASE = "%%API_BASE%%";
  var BTN_ID = '__etm_script_vault_btn__';
  var PANEL_ID = '__etm_script_vault_panel__';

  function closePanel() {
    var panel = document.getElementById(PANEL_ID);
    if (panel) panel.remove();
  }

  function showPanelError(panel, msg) {
    var old = panel.querySelector('.__etm_step_error__');
    if (old) old.remove();
    var err = document.createElement('div');
    err.className = '__etm_step_error__';
    err.textContent = '⚠ ' + msg;
    err.style.cssText = 'color:#E2A0A0;background:rgba(195,93,93,0.12);border:1px solid rgba(195,93,93,0.3);' +
      'border-radius:6px;font-size:11px;padding:6px 8px;margin:0 0 6px 0;';
    panel.insertBefore(err, panel.children[1] || null);
  }

  // Used to blindly close the panel on .finally() regardless of what the
  // VPS actually did - confirmed live that a failed media-match (attach
  // modal opened but nothing got picked) left the chatter with no
  // indication anything went wrong. Now parses the real status and only
  // closes on a genuine success, otherwise leaves the panel open with a
  // visible error so the chatter knows to attach the file manually.
  function insertStep(step, item, panel) {
    fetch(API_BASE + '/api/crm/insert-script-step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: USER_ID,
        modelId: MODEL_ID,
        messageText: step.message_text,
        mediaRefs: step.media_refs || [],
        price: step.price,
      }),
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data && data.status === 'success') {
          closePanel();
        } else {
          item.style.opacity = '1';
          showPanelError(panel, (data && (data.message || data.error)) || 'Einfügen fehlgeschlagen.');
        }
      })
      .catch(function() {
        item.style.opacity = '1';
        showPanelError(panel, 'Netzwerkfehler beim Einfügen.');
      });
  }

  function renderSteps(panel, script) {
    panel.innerHTML = '';
    var back = document.createElement('div');
    back.textContent = '‹ ' + script.title;
    back.style.cssText = 'color:#C9A86A;font-weight:700;font-size:12px;padding:6px 8px;cursor:pointer;margin-bottom:4px;';
    back.addEventListener('click', function() { renderScriptList(panel); });
    panel.appendChild(back);

    (script.steps || []).forEach(function(step, idx) {
      var item = document.createElement('div');
      item.style.cssText = 'padding:8px 10px;border-radius:8px;cursor:pointer;margin-bottom:2px;';
      item.onmouseenter = function() { item.style.background = 'rgba(201,168,106,0.15)'; };
      item.onmouseleave = function() { item.style.background = 'transparent'; };
      var mediaCount = (step.media_refs && step.media_refs.length) || 0;
      var head = document.createElement('div');
      head.style.cssText = 'display:flex;justify-content:space-between;color:#E2C48A;font-weight:700;font-size:11px;';
      head.innerHTML = '<span>Schritt ' + (idx + 1) + (mediaCount ? ' – 📁 ' + mediaCount : '') + '</span>' +
        (step.price != null ? '<span style="color:#4FAE78;">$' + step.price + '</span>' : '');
      var preview = document.createElement('div');
      preview.textContent = step.message_text;
      preview.style.cssText = 'color:#8A847B;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;';
      item.appendChild(head);
      item.appendChild(preview);
      item.addEventListener('click', function() {
        item.style.opacity = '0.5';
        insertStep(step, item, panel);
      });
      panel.appendChild(item);
    });
  }

  function renderScriptList(panel) {
    panel.innerHTML = '';
    var loading = document.createElement('div');
    loading.textContent = 'Lade Scripts...';
    loading.style.cssText = 'color:#8A847B;font-size:12px;padding:12px;text-align:center;';
    panel.appendChild(loading);

    fetch(API_BASE + '/api/crm/list-scripts?modelId=' + encodeURIComponent(MODEL_ID))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        panel.innerHTML = '';
        var scripts = (data && data.scripts) || [];
        if (!scripts.length) {
          var empty = document.createElement('div');
          empty.textContent = 'Noch keine Scripts für dieses Model.';
          empty.style.cssText = 'color:#8A847B;font-size:12px;padding:12px;text-align:center;';
          panel.appendChild(empty);
          return;
        }
        scripts.forEach(function(s) {
          var item = document.createElement('div');
          item.style.cssText = 'padding:8px 10px;border-radius:8px;cursor:pointer;margin-bottom:2px;display:flex;justify-content:space-between;align-items:center;';
          item.onmouseenter = function() { item.style.background = 'rgba(201,168,106,0.15)'; };
          item.onmouseleave = function() { item.style.background = 'transparent'; };
          var title = document.createElement('span');
          title.textContent = s.title;
          title.style.cssText = 'color:#E2C48A;font-weight:700;font-size:12px;';
          var count = document.createElement('span');
          count.textContent = ((s.steps && s.steps.length) || 0) + ' Schritte ›';
          count.style.cssText = 'color:#8A847B;font-size:10px;';
          item.appendChild(title);
          item.appendChild(count);
          item.addEventListener('click', function() { renderSteps(panel, s); });
          panel.appendChild(item);
        });
      })
      .catch(function() {
        panel.innerHTML = '';
        var err = document.createElement('div');
        err.textContent = 'Fehler beim Laden.';
        err.style.cssText = 'color:#C35D5D;font-size:12px;padding:12px;text-align:center;';
        panel.appendChild(err);
      });
  }

  function openPanel(anchorBtn) {
    closePanel();
    var panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = 'position:fixed;z-index:99999;background:#0A0A0A;border:1px solid rgba(201,168,106,0.4);border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,0.6);max-height:320px;width:320px;overflow-y:auto;padding:6px;';
    var rect = anchorBtn.getBoundingClientRect();
    panel.style.left = Math.max(8, rect.left - 260) + 'px';
    panel.style.top = rect.top + 'px';
    panel.style.transform = 'translateY(-100%)';
    document.body.appendChild(panel);
    renderScriptList(panel);
  }

  document.addEventListener('click', function(e) {
    var panel = document.getElementById(PANEL_ID);
    if (panel && !panel.contains(e.target) && e.target.id !== BTN_ID) closePanel();
  }, true);

  function scan() {
    var btns = document.querySelector('.b-make-post__actions__btns');
    if (!btns || document.getElementById(BTN_ID)) return;
    var btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.className = 'g-btn m-with-round-hover m-icon m-icon-only m-sm-size has-tooltip';
    btn.setAttribute('aria-label', 'Script Vault');
    // Branded gold badge instead of blending in with OnlyFans' own plain
    // gray icon row - stands out as "our" tool at a glance.
    btn.style.cssText =
      'font-size:15px;line-height:1;background:linear-gradient(180deg,#E5C158,#9C7A3D);border-radius:50%;' +
      'box-shadow:0 0 6px rgba(201,168,106,0.7);transition:transform .15s ease,box-shadow .15s ease;';
    btn.onmouseenter = function() { btn.style.transform = 'scale(1.08)'; btn.style.boxShadow = '0 0 10px rgba(229,193,88,0.9)'; };
    btn.onmouseleave = function() { btn.style.transform = 'scale(1)'; btn.style.boxShadow = '0 0 6px rgba(201,168,106,0.7)'; };
    btn.textContent = String.fromCodePoint(128220);
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (document.getElementById(PANEL_ID)) { closePanel(); return; }
      openPanel(btn);
    });
    btns.appendChild(btn);
  }

  function start() {
    scan();
    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
`;

// %%MODEL_ID%%, %%API_BASE%% substituted per slot before injection, same
// convention as SENT_BY_OVERLAY_SCRIPT_TEMPLATE above. Confirmed live via
// debug-eval: each .b-chats__item's own "id" attribute IS the numeric fan
// id (matches the /chats/chat/<id> URL pattern used elsewhere), the avatar
// lives in a child ".b-available-users__round-img" (50x50, position:
// absolute already, so it doubles as a containing block for our badge
// without needing to touch its own positioning), and OnlyFans' own "new
// fan" flag is ".b-chats__user__badge.m-new" (text "NEUE").
const FAN_SPEND_OVERLAY_SCRIPT_TEMPLATE = `
(function() {
  var MODEL_ID = "%%MODEL_ID%%";
  var API_BASE = "%%API_BASE%%";
  var RING_CLASS = 'etm-spend-ring';
  var BADGE_CLASS = 'etm-spend-badge';
  var displayCache = {};

  function ensureStyles() {
    if (document.getElementById('__etm_spend_ring_style__')) return;
    var style = document.createElement('style');
    style.id = '__etm_spend_ring_style__';
    style.textContent =
      '.' + RING_CLASS + '{box-shadow:0 0 0 2px rgba(10,10,10,0.9),0 0 6px 1px rgba(229,193,88,0.75);border-radius:50%;}' +
      '.' + BADGE_CLASS + '{position:absolute;bottom:-3px;left:50%;transform:translateX(-50%);' +
      'background:linear-gradient(180deg,#E5C158,#9C7A3D);color:#0A0A0A;font-weight:800;font-size:9px;' +
      'line-height:1;padding:1px 4px;border-radius:8px;white-space:nowrap;box-shadow:0 0 4px rgba(0,0,0,0.6);z-index:2;}';
    document.head.appendChild(style);
  }

  function collectItems() {
    return Array.prototype.slice.call(document.querySelectorAll('.b-chats__item'));
  }

  function labelFor(value) {
    if (value === 'NEW') return 'NEW';
    if (value === '0' || !value) return '$0';
    return '$' + value;
  }

  function applyBadge(item, value) {
    var wrap = item.querySelector('.b-available-users__round-img');
    if (!wrap) return;
    if (!wrap.classList.contains(RING_CLASS)) wrap.classList.add(RING_CLASS);
    var badge = wrap.querySelector('.' + BADGE_CLASS);
    if (!badge) {
      badge = document.createElement('span');
      badge.className = BADGE_CLASS;
      wrap.appendChild(badge);
    }
    var text = labelFor(value);
    if (badge.textContent !== text) badge.textContent = text;
  }

  function renderFromCache() {
    collectItems().forEach(function(item) {
      if (item.id && Object.prototype.hasOwnProperty.call(displayCache, item.id)) {
        applyBadge(item, displayCache[item.id]);
      }
    });
  }

  function refresh() {
    var items = collectItems();
    var fanIds = [];
    var newFanIds = [];
    items.forEach(function(item) {
      if (!item.id) return;
      fanIds.push(item.id);
      if (item.querySelector('.b-chats__user__badge.m-new')) newFanIds.push(item.id);
    });
    if (!fanIds.length || !API_BASE) return;
    fetch(API_BASE + '/api/crm/fan-spend-overlay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: MODEL_ID, fanIds: fanIds, newFanIds: newFanIds }),
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data || data.status !== 'success') return;
        displayCache = data.display || {};
        renderFromCache();
      })
      .catch(function() {});
  }

  function start() {
    ensureStyles();
    refresh();
    setInterval(refresh, 20000);
    // Vue re-renders chat-list rows on its own (new scroll position, a
    // fresh message, muting/unmuting) - a fresh DOM node loses our injected
    // badge, so re-apply from the cache on every mutation instead of only
    // waiting for the next 20s refresh cycle.
    new MutationObserver(renderFromCache).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
`;

async function applyFanSpendOverlay(page, modelId) {
  try {
    const apiBase = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
    const script = FAN_SPEND_OVERLAY_SCRIPT_TEMPLATE
      .replace('%%MODEL_ID%%', String(modelId || '').replace(/"/g, '\\"'))
      .replace('%%API_BASE%%', apiBase.replace(/"/g, '\\"'));
    await page.evaluateOnNewDocument(script);
  } catch (e) {
    console.warn('[FAN-SPEND-OVERLAY] Could not register:', e.message);
  }
}

// %%MODEL_ID%%, %%API_BASE%% substituted per slot before injection, same
// convention as the other overlay templates.
//
// UNVERIFIED - shipped as a best-effort guess per explicit user go-ahead,
// NOT confirmed live: this test account had no real purchase yet to check
// the actual "just unlocked" DOM signal against. isLocked() below checks a
// few plausible selectors defensively rather than betting on exactly one,
// but if this never actually fires after a real purchase, THIS is the
// function to re-derive live (via debug-eval on a chat with a genuinely
// just-purchased PPV) rather than assuming /api/crm/ppv-purchased itself
// is broken.
//
// Also a structural limitation, not a bug: this only sees whatever
// conversation is CURRENTLY open in this slot (same constraint as
// /api/crm/current-fan) - a purchase in a conversation nobody currently
// has open won't be caught until/unless that chat is opened again while
// still showing the transition.
const PPV_PURCHASE_DETECTOR_SCRIPT_TEMPLATE = `
(function() {
  var MODEL_ID = "%%MODEL_ID%%";
  var API_BASE = "%%API_BASE%%";

  function getFanId() {
    var m = location.pathname.match(/\\/chats\\/chat\\/(\\d+)/);
    return m ? m[1] : null;
  }

  function getBubbleMediaKey(el) {
    var img = el.querySelector('.post_media img, .b-chat__message__media img');
    if (!img || !img.src) return '';
    return img.src.split('?')[0];
  }

  function getBubbleText(el) {
    var holder = el.querySelector('.b-chat__message__text-holder');
    return holder ? holder.textContent.trim() : '';
  }

  function isLocked(el) {
    return !!(
      el.querySelector('[class*="locked" i]') ||
      el.querySelector('[class*="paid-post" i]') ||
      el.querySelector('[at-attr="price_btn"]') ||
      el.querySelector('[at-attr="unlock_btn"]')
    );
  }

  // Also unconfirmed (same caveat as isLocked) - grabs a "$12" / "12,00 €"
  // style price if the locked overlay shows one, so a detected purchase
  // can add to the fan's tracked spend instead of just notifying with no
  // amount. Missing/unparsed price just means the notification fires
  // without updating spend - never blocks the notification itself.
  function getBubblePrice(el) {
    var m = (el.textContent || '').match(/\\$\\s?(\\d+(?:[.,]\\d{1,2})?)|(\\d+(?:[.,]\\d{1,2})?)\\s?€/);
    if (!m) return null;
    var raw = m[1] || m[2];
    return raw ? parseFloat(raw.replace(',', '.')) : null;
  }

  function scan() {
    var mine = document.querySelectorAll('.b-chat__message.m-from-me.m-has-media');
    for (var i = 0; i < mine.length; i++) {
      var el = mine[i];
      var locked = isLocked(el);
      if (el.dataset.etmWasLocked === undefined) {
        // First time seeing this bubble this session - just record its
        // current state, don't fire for something that may have already
        // been unlocked long before this overlay started watching.
        el.dataset.etmWasLocked = locked ? '1' : '0';
        if (locked) {
          var initialPrice = getBubblePrice(el);
          if (initialPrice) el.dataset.etmPrice = String(initialPrice);
        }
        continue;
      }
      if (locked) {
        var p = getBubblePrice(el);
        if (p) el.dataset.etmPrice = String(p);
      }
      if (el.dataset.etmWasLocked === '1' && !locked && !el.dataset.etmPpvNotified) {
        el.dataset.etmPpvNotified = '1';
        el.dataset.etmWasLocked = '0';
        var fanId = getFanId();
        if (!fanId || !API_BASE) continue;
        var mediaKey = getBubbleMediaKey(el);
        var text = mediaKey ? '' : getBubbleText(el);
        if (!mediaKey && !text) continue;
        var price = el.dataset.etmPrice ? parseFloat(el.dataset.etmPrice) : null;
        fetch(API_BASE + '/api/crm/ppv-purchased', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            mediaKey
              ? { modelId: MODEL_ID, fanId: fanId, mediaKey: mediaKey, price: price }
              : { modelId: MODEL_ID, fanId: fanId, messageText: text, price: price }
          ),
        }).catch(function() {});
      } else if (locked) {
        el.dataset.etmWasLocked = '1';
      }
    }
  }

  function start() {
    scan();
    setInterval(scan, 5000);
    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
`;

async function applyPpvPurchaseDetector(page, modelId) {
  try {
    const apiBase = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
    const script = PPV_PURCHASE_DETECTOR_SCRIPT_TEMPLATE
      .replace('%%MODEL_ID%%', String(modelId || '').replace(/"/g, '\\"'))
      .replace('%%API_BASE%%', apiBase.replace(/"/g, '\\"'));
    await page.evaluateOnNewDocument(script);
  } catch (e) {
    console.warn('[PPV-PURCHASE-DETECTOR] Could not register:', e.message);
  }
}

// applyOnCurrentPage: evaluateOnNewDocument only takes effect on the NEXT
// navigation - fine for a chatter slot (ensureSlotBrowser always does a
// fresh page.goto right after this), but the main session's page usually
// stays on the same already-loaded document indefinitely once logged in
// (see assignSlot's mainViewer claim), so without also running it on the
// CURRENT page, this silently never appears there at all.
async function applySentByOverlay(page, chatterName, modelId, applyOnCurrentPage = false) {
  try {
    const apiBase = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
    const script = SENT_BY_OVERLAY_SCRIPT_TEMPLATE
      .replace('%%CHATTER_NAME%%', String(chatterName || 'Chatter').replace(/"/g, '\\"'))
      .replace('%%MODEL_ID%%', String(modelId || '').replace(/"/g, '\\"'))
      .replace('%%API_BASE%%', apiBase.replace(/"/g, '\\"'));
    await page.evaluateOnNewDocument(script);
    if (applyOnCurrentPage) await page.evaluate(script).catch(() => {});
  } catch (e) {
    console.warn('[SENT-BY-OVERLAY] Could not register:', e.message);
  }
}

// Injects a real button into OnlyFans' own compose toolbar (confirmed live
// via /debug-dom: ".b-make-post__actions__btns" is the icon row ending
// with the text-format "Aa" button, immediately followed by a flex spacer
// and then the native "Senden" button) - explicitly requested to sit there
// rather than in the CRM's own floating overlay, since that overlay lives
// in a completely different browser (this app's own page), not inside the
// VNC-streamed remote page at all, so it can never trigger anything in
// THIS DOM. Clicking it fetches this chatter's visible scripts from
// list-scripts (CORS-enabled, same cross-origin pattern as
// log-sent-message) and shows a small native-styled panel; picking one
// types it into the real compose box via execCommand('insertText'), the
// standard way to insert text into a contenteditable rich-text editor
// (OnlyFans' compose box is TipTap/ProseMirror) from outside its own
// internal state management - setting textContent/innerHTML directly
// would desync the editor's model.
async function applyScriptVaultButton(page, userId, role, modelId, applyOnCurrentPage = false) {
  try {
    const apiBase = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
    const script = SCRIPT_VAULT_BUTTON_SCRIPT_TEMPLATE
      .replace('%%USER_ID%%', String(userId || '').replace(/"/g, '\\"'))
      .replace('%%USER_ROLE%%', String(role || 'chatter').replace(/"/g, '\\"'))
      .replace('%%MODEL_ID%%', String(modelId || '').replace(/"/g, '\\"'))
      .replace('%%API_BASE%%', apiBase.replace(/"/g, '\\"'));
    await page.evaluateOnNewDocument(script);
    if (applyOnCurrentPage) {
      // The injected script itself skips creating a second button if one
      // already exists (by a fixed element id) - removing any previous
      // one first (baked in for a DIFFERENT earlier viewer, if any) so
      // this always ends up wired to whoever is asking right now.
      await page
        .evaluate(() => document.getElementById('__etm_script_vault_btn__')?.remove())
        .catch(() => {});
      await page.evaluate(script).catch(() => {});
    }
  } catch (e) {
    console.warn('[SCRIPT-VAULT-BUTTON] Could not register:', e.message);
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
    releaseModelDisplay(modelId);
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

async function launchBrowser(modelId, display, audioSink) {
  const launchOnce = () =>
    puppeteer.launch({
      headless: false,
      // Uses Puppeteer's own managed Chrome (downloaded into ~/.cache/puppeteer
      // by `npm install`) unless CHROMIUM_PATH points somewhere else.
      executablePath: process.env.CHROMIUM_PATH || puppeteer.executablePath(),
      // display comes from assignModelDisplay - each connected model gets
      // its own dedicated Xvfb/x11vnc/websockify trio now, not a shared
      // one. PULSE_SINK routes this Chrome's audio to its own dedicated
      // virtual speaker (see MODEL_DISPLAY_SLOTS/crm-system.pa) so
      // /audio-stream can capture just this model's sound - otherwise
      // every model's Chrome would share the system default sink and mix
      // together.
      env: {
        ...process.env,
        ...(display ? { DISPLAY: display } : {}),
        ...(audioSink ? { PULSE_SERVER: '/run/pulse/native', PULSE_SINK: audioSink } : {}),
      },
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
        // screen size exactly. Was 1920x1080 then 1366x768 - OnlyFans'
        // desktop layout stays exactly the same at 1280x800 (well above any
        // responsive breakpoint), but with fewer physical pixels for the
        // same layout, noVNC's scaleViewport has less to shrink to fit a
        // given on-screen video size, so text and buttons end up visibly
        // larger/readable.
        '--window-size=1280,800',
        '--window-position=0,0',
        `--user-data-dir=${profileDir(modelId)}`,
        // App mode: no address bar, no back/forward toolbar, no tab strip -
        // just the page content filling the window. page.screenshot() never
        // showed this stuff anyway (it only ever captures page content, not
        // the browser's own native UI), but VNC shows the real window,
        // browser-chrome-and-all, which is what this actually fixes.
        '--app=https://www.onlyfans.com',
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

// ============================================================================
// CHATTER SLOT POOL
// Independent, per-(user, model) browser windows so multiple chatters can
// work different fan conversations on the same (or different) models at
// the same time, instead of everyone sharing one cursor/scroll position on
// display :1. Each slot is its own virtual display with its own
// Xvfb + x11vnc + websockify trio (spawned on demand, not always running),
// showing a Chrome window that starts from a COPY of the model's existing
// profile directory - a real on-disk duplicate (cookies, localStorage,
// IndexedDB, service workers, everything), not just the cookies. Chrome
// refuses to run two processes against the same --user-data-dir at once
// (a "browser already running" lock), so the main session on :1 and every
// slot each need their own copy; a full filesystem copy of an already-
// authenticated profile preserves far more of what a consistency check
// might look at than the old cookie-only clone (which OnlyFans reliably
// rejected) ever did.
// ============================================================================

const { spawn } = require('child_process');
const net = require('net');

const CHATTER_SLOTS = [
  { id: 1, display: ':2', vncPort: 5902, wsPort: 6082 },
  { id: 2, display: ':3', vncPort: 5903, wsPort: 6083 },
  { id: 3, display: ':4', vncPort: 5904, wsPort: 6084 },
  { id: 4, display: ':5', vncPort: 5905, wsPort: 6085 },
].map((slot) => ({
  ...slot,
  assignedTo: null, // `${userId}:${modelId}` while occupied
  modelId: null,
  role: null,
  lastActivity: 0,
  xvfbProc: null,
  x11vncProc: null,
  websockifyProc: null,
  browser: null,
  page: null,
  infraReady: null,
}));

const CHATTER_SLOT_IDLE_MS = 20 * 60 * 1000; // free a slot after 20 min unused

function slotProfileDir(slot, modelId) {
  return `/tmp/chromium-slot${slot.id}-${modelId}`;
}

function waitForPort(port, timeoutMs = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) return reject(new Error(`Timed out waiting for port ${port}`));
        setTimeout(tryConnect, 200);
      });
    };
    tryConnect();
  });
}

// Starts (or confirms already running) this slot's own Xvfb + x11vnc +
// websockify trio. Idempotent and safe to call on every assignment - only
// actually spawns a process if the previous one isn't alive anymore.
async function ensureSlotInfra(slot) {
  if (slot.infraReady) {
    try {
      await slot.infraReady;
      return;
    } catch (e) {
      slot.infraReady = null; // let this call retry from scratch below
    }
  }

  slot.infraReady = (async () => {
    if (!slot.xvfbProc || slot.xvfbProc.exitCode !== null) {
      slot.xvfbProc = spawn('/usr/bin/Xvfb', [slot.display, '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
      slot.xvfbProc.on('exit', (code) => console.warn(`[SLOT ${slot.id}] Xvfb exited (${code})`));
      await new Promise((r) => setTimeout(r, 500));
    }
    // x11vnc resets the X11 keymap on its own restart regardless of what
    // ran before - reapplying here every time is the same fix already
    // needed for the login display's "@" keyboard issue.
    spawn('/usr/bin/setxkbmap', ['de'], { env: { ...process.env, DISPLAY: slot.display }, stdio: 'ignore' });

    if (!slot.x11vncProc || slot.x11vncProc.exitCode !== null) {
      // -noxdamage previously here forces x11vnc into full-screen polling
      // instead of using the X server's own damage-tracking to know
      // exactly which pixels changed - polling-based diffing is a known
      // source of "stale column" artifacts (a screen region that visually
      // changed but whose diff the polling pass doesn't register, so VNC
      // clients keep seeing old pixel data there indefinitely). Matches a
      // persistent vertical line reported live that survived every
      // page-content and canvas-scaling fix - removing it lets x11vnc use
      // accurate damage events instead.
      slot.x11vncProc = spawn('/usr/bin/x11vnc', [
        '-display', slot.display,
        '-rfbport', String(slot.vncPort),
        '-rfbauth', '/root/.vnc/login_passwd',
        '-forever', '-shared', '-localhost', '-quiet', '-xkb', '-add_keysyms', '-nap',
      ], { stdio: 'ignore' });
      slot.x11vncProc.on('exit', (code) => console.warn(`[SLOT ${slot.id}] x11vnc exited (${code})`));
      await new Promise((r) => setTimeout(r, 300));
      spawn('/usr/bin/setxkbmap', ['de'], { env: { ...process.env, DISPLAY: slot.display }, stdio: 'ignore' });
    }

    if (!slot.websockifyProc || slot.websockifyProc.exitCode !== null) {
      slot.websockifyProc = spawn('/usr/bin/websockify', [String(slot.wsPort), `localhost:${slot.vncPort}`], { stdio: 'ignore' });
      slot.websockifyProc.on('exit', (code) => console.warn(`[SLOT ${slot.id}] websockify exited (${code})`));
    }

    await waitForPort(slot.wsPort);
  })();

  await slot.infraReady;
}

// ============================================================================
// PER-MODEL MAIN-SESSION DISPLAYS
// Per the user's explicit ask (2026-07-29): every connected model's main
// session used to share one display (:1), so its VNC feed just showed
// whichever model's window happened to be on top - not an OnlyFans issue,
// purely display-sharing. Slot 0 reuses :1's existing systemd-managed
// Xvfb/x11vnc/websockify trio (already running, already wired into Caddy)
// so nothing about the very first connected model changes; the other two
// slots (matching MAX_CONCURRENT_SESSIONS) are spawned on demand exactly
// like CHATTER_SLOTS above.
// ============================================================================

// audioSink names a PulseAudio null sink (see crm-system.pa on the VPS,
// loaded by the separate pulseaudio-crm.service) that this display's
// Chrome routes its output to via PULSE_SINK - one dedicated virtual
// speaker per model so their audio never mixes, mirroring the one-
// display-per-model approach above.
const MODEL_DISPLAY_SLOTS = [
  { id: 0, display: ':1', vncPort: 5901, wsPort: 6080, wsPath: '/vnc-login/websockify', static: true, audioSink: 'model0' },
  { id: 1, display: ':6', vncPort: 5906, wsPort: 6086, wsPath: '/vnc-model-2/websockify', static: false, audioSink: 'model1' },
  { id: 2, display: ':7', vncPort: 5907, wsPort: 6087, wsPath: '/vnc-model-3/websockify', static: false, audioSink: 'model2' },
].map((slot) => ({
  ...slot,
  modelId: null,
  xvfbProc: null,
  x11vncProc: null,
  websockifyProc: null,
  infraReady: null,
}));

async function ensureModelDisplayInfra(slot) {
  if (slot.static) return; // :1's trio is systemd-managed, already running
  if (slot.infraReady) {
    try {
      await slot.infraReady;
      return;
    } catch (e) {
      slot.infraReady = null;
    }
  }
  slot.infraReady = (async () => {
    if (!slot.xvfbProc || slot.xvfbProc.exitCode !== null) {
      slot.xvfbProc = spawn('/usr/bin/Xvfb', [slot.display, '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
      slot.xvfbProc.on('exit', (code) => console.warn(`[MODEL-DISPLAY ${slot.id}] Xvfb exited (${code})`));
      await new Promise((r) => setTimeout(r, 500));
    }
    spawn('/usr/bin/setxkbmap', ['de'], { env: { ...process.env, DISPLAY: slot.display }, stdio: 'ignore' });

    if (!slot.x11vncProc || slot.x11vncProc.exitCode !== null) {
      slot.x11vncProc = spawn('/usr/bin/x11vnc', [
        '-display', slot.display,
        '-rfbport', String(slot.vncPort),
        '-rfbauth', '/root/.vnc/login_passwd',
        '-forever', '-shared', '-localhost', '-quiet', '-xkb', '-add_keysyms', '-nap',
      ], { stdio: 'ignore' });
      slot.x11vncProc.on('exit', (code) => console.warn(`[MODEL-DISPLAY ${slot.id}] x11vnc exited (${code})`));
      await new Promise((r) => setTimeout(r, 300));
      spawn('/usr/bin/setxkbmap', ['de'], { env: { ...process.env, DISPLAY: slot.display }, stdio: 'ignore' });
    }

    if (!slot.websockifyProc || slot.websockifyProc.exitCode !== null) {
      slot.websockifyProc = spawn('/usr/bin/websockify', [String(slot.wsPort), `localhost:${slot.vncPort}`], { stdio: 'ignore' });
      slot.websockifyProc.on('exit', (code) => console.warn(`[MODEL-DISPLAY ${slot.id}] websockify exited (${code})`));
    }

    await waitForPort(slot.wsPort);
  })();

  await slot.infraReady;
}

// Assigns (or reuses) a dedicated display for this model's main session.
// Always succeeds without eviction under normal use - there are exactly as
// many slots as MAX_CONCURRENT_SESSIONS, and enforceSessionCap already
// keeps concurrent main sessions at or below that everywhere else. The LRU
// eviction fallback exists only as a safety net, not the expected path.
async function assignModelDisplay(modelId) {
  let slot = MODEL_DISPLAY_SLOTS.find((s) => s.modelId === modelId);
  if (!slot) {
    slot = MODEL_DISPLAY_SLOTS.find((s) => !s.modelId);
    if (!slot) {
      const busy = MODEL_DISPLAY_SLOTS.filter((s) => s.modelId && modelSessions[s.modelId]);
      slot = busy.sort((a, b) => modelSessions[a.modelId].lastActivity - modelSessions[b.modelId].lastActivity)[0];
      if (slot) await closeSession(slot.modelId, 'display slot reclaimed (unexpected: more concurrent sessions than display slots)');
      else slot = MODEL_DISPLAY_SLOTS[0];
    }
    slot.modelId = modelId;
  }
  await ensureModelDisplayInfra(slot);
  return slot;
}

function releaseModelDisplay(modelId) {
  const slot = MODEL_DISPLAY_SLOTS.find((s) => s.modelId === modelId);
  if (slot) slot.modelId = null; // Xvfb/x11vnc/websockify stay up for fast reuse, same as chatter slots
}

// Launches (or reuses) this slot's Chrome window for the given model,
// starting from a fresh filesystem copy of that model's live profile.
async function ensureSlotBrowser(slot, modelId, role, chatterName, userId) {
  if (slot.browser && slot.browser.isConnected() && slot.modelId === modelId) {
    // A slot copied before the admin finished logging in (a chatter can
    // easily open CRM Inbox while Connection Hub is still mid-login)
    // freezes that pre-login snapshot forever otherwise - nothing ever
    // re-copies it just because the main session later becomes
    // authenticated. Confirmed directly: main session isLoggedIn:true
    // while an existing slot still showed the raw login page. Only pay for
    // the two extra getLoginState() calls on the reuse path, not on every
    // interaction with the slot.
    const [slotState, mainState] = await Promise.all([
      getLoginState(slot.page),
      modelSessions[modelId] ? getLoginState(modelSessions[modelId].page) : Promise.resolve({ isLoggedIn: false }),
    ]);
    if (slotState.isLoggedIn || !mainState.isLoggedIn) {
      return slot.page;
    }
    console.log(`[SLOT ${slot.id}] Stale pre-login copy detected, refreshing from main session`);
  }
  if (slot.browser) {
    try {
      await slot.browser.close();
    } catch (e) {
      /* ignore */
    }
    slot.browser = null;
    slot.page = null;
  }

  const dest = slotProfileDir(slot, modelId);
  await fs.rm(dest, { recursive: true, force: true }).catch(() => {});
  await fs.cp(profileDir(modelId), dest, { recursive: true });
  // Chrome's singleton-instance lock files (symlinks encoding the ORIGINAL
  // process's hostname:PID, or a socket path) get copied right along with
  // everything else, and Chrome checks whether that specific PID is still
  // alive before deciding whether "another process" already owns this
  // profile - since the main session's browser is (by design) still
  // running, the copy's own Chrome would see these stale locks and refuse
  // to start entirely ("profile appears to be in use"). Stripping them
  // lets the new process create its own fresh locks in the copied dir.
  await Promise.all(
    ['SingletonLock', 'SingletonSocket', 'SingletonCookie'].map((f) =>
      fs.rm(path.join(dest, f), { force: true }).catch(() => {})
    )
  );

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: process.env.CHROMIUM_PATH || puppeteer.executablePath(),
    env: { ...process.env, DISPLAY: slot.display },
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
      '--window-size=1280,800',
      '--window-position=0,0',
      `--user-data-dir=${dest}`,
      // App mode - no address bar/back-forward toolbar/tab strip, just the
      // raw page content filling the window.
      '--app=https://onlyfans.com/my/chats',
    ],
  });

  // App mode opens its own window directly at the given URL - there's no
  // separate blank tab to grab via newPage() (that would open a second,
  // regular window instead).
  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.setViewport({ width: 1280, height: 800 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'de-DE,de;q=0.9' });
  await enableDarkMode(page);
  await reserveOverlaySpace(page);
  await applyNavRestrictions(page, role);
  await applySentByOverlay(page, chatterName, modelId);
  await applyScriptVaultButton(page, userId, role, modelId);
  await applyFanSpendOverlay(page, modelId);
  await applyPpvPurchaseDetector(page, modelId);

  // The filesystem copy above can still be stale even when the main
  // session is genuinely logged in: Chrome writes its cookie database to
  // disk on its own schedule, not instantly on every change, so a copy
  // taken between a real login and Chrome's next flush captures pre-login
  // files despite the live browser already being authenticated. Confirmed
  // directly - a freshly-created slot still showed the login page while
  // modelSessions[modelId] reported isLoggedIn:true. Overlaying the LIVE
  // cookies (read via CDP, always accurate, never stale) on top of
  // whatever the file copy captured makes the auth state correct
  // regardless of Chrome's own disk-flush timing.
  const mainSession = modelSessions[modelId];
  if (mainSession) {
    try {
      const liveCookies = await mainSession.page.cookies();
      // CONFIRMED LIVE (two attempts): page.cookies() returns CDP's
      // Network.Cookie shape, which carries extra attributes (expires,
      // sameSite, httpOnly, secure, plus read-only ones like size/session)
      // that Network.setCookies' batch validation can reject wholesale if
      // even ONE cookie in the array has an incompatible combination (e.g.
      // a Cloudflare/analytics cookie with a prefixed name or an sameSite/
      // secure mismatch) - "Invalid cookie fields" failed the ENTIRE batch
      // both with the raw objects and with a still-too-generous 8-field
      // subset. getOrCreateSession's own cookie restore (used by
      // autoReconnectAllModels) only ever sends name/value/domain/path and
      // has never failed - matching that exact minimal shape here instead
      // of trying to preserve every original attribute.
      const cleaned = liveCookies.map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path }));
      if (cleaned.length) {
        try {
          await page.setCookie(...cleaned);
        } catch (batchErr) {
          // Belt-and-braces: if even the minimal shape fails as a batch
          // (some single cookie's value/name itself is the problem, not
          // the extra fields), set them one at a time so the auth cookies
          // that DO work still land instead of an all-or-nothing failure.
          for (const cookie of cleaned) {
            await page.setCookie(cookie).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.warn(`[SLOT ${slot.id}] Live cookie overlay failed:`, e.message);
    }
  }
  // Runs after the live cookie overlay so a stale lang=en copied from the
  // main session's profile can't win.
  await setGermanLangCookie(page);

  try {
    await page.goto('https://onlyfans.com/my/chats', { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (e) {
    console.warn(`[SLOT ${slot.id}] Navigation warning:`, e.message);
  }

  // CONFIRMED LIVE: right after a VPS restart, this whole function can run
  // BEFORE autoReconnectAllModels() finishes restoring the main session -
  // modelSessions[modelId] is still undefined at the exact moment above,
  // so the live-cookie overlay block never runs at all (silently, nothing
  // to overlay), and the slot is left on the raw login page. Nothing else
  // was re-triggering ensureSlotBrowser for this slot afterwards (the
  // reuse-check above only runs on a LATER call, which a chatter's tab
  // doesn't necessarily make again soon), so this self-heals inline
  // instead of waiting on that: give the main session a few seconds to
  // finish restoring, then redo the overlay + reload once it has.
  let slotLoginState = await getLoginState(page);
  for (let attempt = 0; attempt < 5 && !slotLoginState.isLoggedIn; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));
    const freshMain = modelSessions[modelId];
    if (!freshMain) continue;
    const mainState = await getLoginState(freshMain.page);
    if (!mainState.isLoggedIn) continue;
    try {
      const liveCookies = await freshMain.page.cookies();
      const cleaned = liveCookies.map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path }));
      for (const cookie of cleaned) {
        await page.setCookie(cookie).catch(() => {});
      }
      // CONFIRMED LIVE: page.reload() just reloads whatever URL the page
      // is CURRENTLY sitting at - by this point that's the login page
      // itself (OnlyFans already redirected there on the earlier failed
      // attempt), and reloading a static login form doesn't re-run
      // whatever client-side check would notice the cookie jar is now
      // valid and bounce forward. Navigating to /my/chats again re-runs
      // that auth gate fresh, exactly like the very first attempt did.
      await page.goto('https://onlyfans.com/my/chats', { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
      console.warn(`[SLOT ${slot.id}] Self-heal retry ${attempt + 1} failed:`, e.message);
    }
    slotLoginState = await getLoginState(page);
  }
  if (!slotLoginState.isLoggedIn) {
    console.warn(`[SLOT ${slot.id}] Still not logged in after self-heal retries`);
  }

  slot.browser = browser;
  slot.page = page;
  slot.modelId = modelId;
  slot.role = role;
  return page;
}

async function releaseSlot(slot, reason) {
  console.log(`[SLOT ${slot.id}] Releasing (${reason}), was ${slot.assignedTo}`);
  if (slot.browser) {
    try {
      await slot.browser.close();
    } catch (e) {
      /* ignore */
    }
  }
  if (slot.modelId) {
    await fs.rm(slotProfileDir(slot, slot.modelId), { recursive: true, force: true }).catch(() => {});
  }
  slot.browser = null;
  slot.page = null;
  slot.assignedTo = null;
  slot.modelId = null;
  slot.role = null;
}

// Idle sweep - a chatter who closed the tab without it ever telling the
// server shouldn't keep an extra Chrome window (and its own Xvfb/x11vnc/
// websockify trio) running indefinitely.
setInterval(() => {
  const now = Date.now();
  for (const slot of CHATTER_SLOTS) {
    if (slot.assignedTo && now - slot.lastActivity > CHATTER_SLOT_IDLE_MS) {
      releaseSlot(slot, 'idle timeout').catch((e) => console.warn(`[SLOT ${slot.id}] Release error:`, e.message));
    }
  }
}, 2 * 60 * 1000);

const MAIN_VIEWER_IDLE_MS = 20 * 60 * 1000; // matches CHATTER_SLOT_IDLE_MS

// Every route that interacts with a chatter's already-assigned session
// (sending messages, reading the vault picker, etc.) used to only ever
// look in CHATTER_SLOTS - now that the first viewer of a model can be
// using the REAL main session instead of a copy (see assignSlot), this is
// the one place that knows to check both. modelSessions[modelId] and a
// CHATTER_SLOTS entry both expose a plain .page, so this is a safe
// drop-in for every `CHATTER_SLOTS.find(s => s.assignedTo === key)` call.
function resolveViewerSlot(userId, modelId) {
  const key = `${userId}:${modelId}`;
  const session = modelSessions[modelId];
  if (session?.mainViewer?.key === key) {
    // Keeps the claim alive from ordinary use of the session (sending a
    // message, polling current-fan, etc.), not just from re-opening the
    // view - otherwise a quiet-but-still-open tab could lose its claim to
    // someone else after MAIN_VIEWER_IDLE_MS despite genuinely still
    // being in use.
    session.mainViewer.lastActivity = Date.now();
    return session;
  }
  return CHATTER_SLOTS.find((s) => s.assignedTo === key);
}

async function assignSlot(userId, modelId, role, chatterName) {
  // Must happen before anything below touches modelSessions[modelId] or
  // profileDir(modelId) - a manual Connection Hub /connect wipes and
  // rebuilds that exact profile dir, and this can otherwise land while
  // that's mid-flight (see ensureSlotBrowser's profile copy further down).
  await waitForModelLock(modelId);
  if (!modelSessions[modelId]) {
    // A model paused by the idle sweep above (CHATTER_IDLE_PAUSE_MS) still
    // has its real Chrome profile sitting untouched on disk - resume from
    // that instead of failing outright. A model that was never connected
    // in the first place has no profile dir, so this still correctly falls
    // through to NO_MODEL_SESSION for that case (nothing to resume).
    const hasProfile = await fs.access(profileDir(modelId)).then(() => true).catch(() => false);
    if (!hasProfile) {
      const err = new Error('NO_MODEL_SESSION');
      err.code = 'NO_MODEL_SESSION';
      throw err;
    }
    // CONFIRMED LIVE (2026-07-29): calling getOrCreateSession here directly
    // (not through withModelLock keyed by plain modelId, same key /connect
    // and auto-reconnect use) let this race a REAL, in-progress Connection
    // Hub login for the same model - two Chrome launches against the same
    // --user-data-dir at once, which is exactly the corruption
    // withModelLock exists to prevent elsewhere in this file. Caused
    // ENOENT errors in ensureSlotBrowser's profile copy and a freshly
    // reconnected model getting disconnected again within seconds.
    await withModelLock(modelId, () => getOrCreateSession(modelId, true));
  }
  // CONFIRMED LIVE (2026-07-27) as the actual cause of both connected
  // models silently going idle and getting disconnected: every chatter
  // interaction goes through THIS function (assignSlot requires the main
  // session to already exist, so reaching here already proves it's in
  // active use), yet nothing here ever refreshed the main session's own
  // lastActivity - only admin-facing routes tied directly to
  // modelSessions[modelId] did (e.g. /profile-info, /status). A model
  // being actively worked all day via chatter slots, with nobody
  // separately opening Connection Hub, still silently idle-timed-out and
  // closed after IDLE_TIMEOUT_MS - exactly backwards from "in active use".
  const session = modelSessions[modelId];
  session.lastActivity = Date.now();

  const key = `${userId}:${modelId}`;

  // Per the user's explicit ask (2026-07-29): the persistent main browser
  // sitting untouched while everyone gets a copy was wasted RAM for no
  // reason - whoever gets to a model FIRST (admin or chatter, role
  // doesn't matter) should just use that real session directly, no copy
  // needed. Only once someone else is ALREADY on it concurrently does a
  // second person get their own chatter-slot copy. A claim goes stale
  // after MAIN_VIEWER_IDLE_MS of no activity from its holder, same idea
  // as CHATTER_SLOT_IDLE_MS below - whoever asks next just reclaims it.
  const now = Date.now();
  const isNewClaimant = !session.mainViewer || session.mainViewer.key !== key;
  const mainFree =
    !session.mainViewer || session.mainViewer.key === key || now - session.mainViewer.lastActivity > MAIN_VIEWER_IDLE_MS;
  if (mainFree) {
    session.mainViewer = { key, lastActivity: now };
    // CONFIRMED LIVE (2026-07-29): ensureSlotBrowser always applies these
    // to a chatter slot's fresh copy, but getOrCreateSession never did for
    // the main session itself (no per-viewer identity to bake in at
    // launch time) - the emoji-send attribution and script-library button
    // were silently missing entirely whenever someone was using the real
    // main session instead of a copy. Only re-applying on an actual new
    // claimant, not every poll from the same still-active viewer.
    if (isNewClaimant) {
      await applySentByOverlay(session.page, chatterName, modelId, true);
      await applyScriptVaultButton(session.page, userId, role, modelId, true);
    }
    return { wsPath: session.displaySlot.wsPath, isMain: true };
  }

  let slot = CHATTER_SLOTS.find((s) => s.assignedTo === key);
  if (!slot) {
    slot = CHATTER_SLOTS.find((s) => !s.assignedTo);
    if (!slot) {
      // All slots busy - reclaim the least-recently-used one rather than
      // refusing outright. A short training session bumping an idle one is
      // a better outcome than a hard error, given the pool is intentionally
      // small (bounded by the VPS's RAM, not by how many chatters exist).
      slot = CHATTER_SLOTS.slice().sort((a, b) => a.lastActivity - b.lastActivity)[0];
      if (slot.assignedTo) await releaseSlot(slot, 'reassigned to a different chatter/model');
    }
    slot.assignedTo = key;
  }

  await ensureSlotInfra(slot);
  await ensureSlotBrowser(slot, modelId, role, chatterName, userId);
  slot.lastActivity = Date.now();
  return { wsPath: `/vnc-chatter-${slot.id}/websockify`, isMain: false, slotId: slot.id };
}

// Get an existing live session, or open a fresh one. Normally navigates
// straight to the blank login page (today's manual "Model verbinden" flow),
// but if restoreCookies is passed (a flat {name: value} map previously
// saved via /cookies, see autoReconnectAllModels below) it injects them
// before the first navigation instead, so a model can come back silently
// logged in after a VPS restart/crash instead of always starting logged out.
async function getOrCreateSession(modelId, restoreCookies) {
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
  // Fresh login handshake (restoreCookies unset, the manual /connect flow) -
  // never inherit whatever's left on disk from a previous run.
  //
  // For an auto-reconnect attempt (restoreCookies set), PRESERVE the
  // on-disk profile instead - a `systemctl restart` never touches /tmp, so
  // Chrome's own cookie jar there already holds exactly what this model
  // was last authenticated with, with full fidelity (real domain/path/
  // sameSite/secure/expiry). CONFIRMED LIVE: reconstructing cookies from
  // Supabase's lossy flat {name: value} map instead (domain/path guessed
  // as '.onlyfans.com'/'/', every other attribute dropped entirely) landed
  // on an OnlyFans verification redirect even with cookies captured mere
  // seconds earlier from a genuinely working login - an untouched native
  // profile never triggered that. Only fall back to the Supabase map if
  // the profile dir doesn't even exist (a real VM reboot, not just a
  // service restart, actually does clear /tmp).
  const hasDiskProfile = restoreCookies
    ? await fs
        .access(profileDir(modelId))
        .then(() => true)
        .catch(() => false)
    : false;
  if (!hasDiskProfile) {
    await wipeProfileDir(modelId);
  }

  const displaySlot = await assignModelDisplay(modelId);
  const browser = await launchBrowser(modelId, displaySlot.display, displaySlot.audioSink);
  // App mode (see the --app comment in launchBrowser) opens its own window
  // directly at the given URL - there's no separate blank tab to grab via
  // newPage() (that would open a second, regular window instead).
  const page = (await browser.pages())[0] || (await browser.newPage());
  // Must match the --window-size Chrome launch arg and xvfb-login.service's
  // screen size. 1920x1080 briefly overloaded this 2-vCPU/2GB VPS (load
  // average 15+, heavy swapping) since Chrome renders it entirely in
  // software with --disable-gpu - that turned out to mostly be a
  // concurrent-launch race (fixed by withModelLock), not the resolution
  // alone. Now at 1280x800, chosen for VNC readability (see the
  // --window-size comment in launchBrowser), which also happens to be
  // lighter than Full HD.
  await page.setViewport({ width: 1280, height: 800 });

  // Passively captures the model's own avatar/name the moment OnlyFans'
  // own app makes this exact call itself (it always does, as part of
  // loading /my/chats) - confirmed live via a /sync-live discover pass
  // that this response body already has avatar/avatarThumbs/name. This
  // sidesteps /profile-info's old active-fetch approach entirely: OnlyFans
  // requires proprietary signed headers on this endpoint that a plain
  // page.evaluate(fetch(...)) can never produce (confirmed broken, HTTP
  // 400 "Something went wrong"), but the REAL app's own request already
  // carries them correctly - so instead of re-requesting it ourselves,
  // just listen for the app's own copy going by. capturedMeProfile is a
  // stable object declared before `session` exists (attached to it right
  // after construction below) so the listener has somewhere to write to
  // regardless of whether this response arrives before or after that.
  const capturedMeProfile = { current: null };
  page.on('response', async (res) => {
    if (!res.url().includes('/api2/v2/users/me')) return;
    try {
      const json = await res.json();
      if (json && (json.avatar || json.avatarThumbs)) capturedMeProfile.current = json;
    } catch (e) {
      /* non-JSON, already consumed, or navigated away mid-read - skip */
    }
  });

  // Chrome's --lang flag covers its own UI chrome; sites pick their content
  // language from the Accept-Language header, so both are needed for
  // OnlyFans itself to render in German.
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'de-DE,de;q=0.9' });
  await enableDarkMode(page);
  // This main session is what Connection Hub's own login/pre-connect stream
  // shows (BrowserLoginStreamComponent) - previously only chatter slots got
  // the icon-only/compact nav treatment (ensureSlotBrowser), so this exact
  // view kept showing OnlyFans' full-width sidebar with all text labels.
  // Treated as 'admin' (nothing hidden, just compacted) since this session
  // isn't tied to any one chatter's role - it's the shared login/cookie
  // source every slot copies from.
  await reserveOverlaySpace(page);
  await applyNavRestrictions(page, 'admin');

  // Fallback path only: no on-disk profile survived (real VM reboot), so
  // there's nothing native to fall back on - inject from Supabase's stored
  // map as a best-effort second choice, same as before.
  if (restoreCookies && !hasDiskProfile) {
    const cookiePairs = Object.entries(restoreCookies)
      .filter(([name]) => name !== 'local_storage')
      .map(([name, value]) => ({ name, value: String(value), domain: '.onlyfans.com', path: '/' }));
    if (cookiePairs.length) {
      try {
        await page.setCookie(...cookiePairs);
      } catch (e) {
        console.warn(`[SESSION] Cookie restore failed for ${modelId}:`, e.message);
      }
    }
  }
  // Runs after any cookie restore so a stale lang value baked into the
  // stored cookie map can't win - same reasoning as ensureSlotBrowser's
  // live cookie overlay, which applies setGermanLangCookie last too.
  await setGermanLangCookie(page);

  try {
    // The direct /login route has been unreliable ("page not available") -
    // the root page shows the same login form to logged-out visitors anyway.
    //
    // CONFIRMED LIVE: a cold browser + injected cookies navigating STRAIGHT
    // to a deep authenticated link (/my/chats) got bounced through a
    // "?return_to=" redirect even with genuinely valid, just-minted
    // cookies (verified by hand seconds earlier) - most likely an extra
    // verification hop OnlyFans/Cloudflare adds for a brand-new page
    // hitting a deep link directly, which a normal browser visiting the
    // root domain first and navigating via its own in-app router never
    // triggers. Landing on the root first (exactly like a real login
    // always has, and like the non-restore path already did) avoids that
    // hop; /my/chats is then a second, "warm" navigation instead of the
    // very first request this page ever makes.
    await page.goto('https://www.onlyfans.com', { waitUntil: 'domcontentloaded', timeout: restoreCookies ? 20000 : 15000 });
    if (restoreCookies) {
      await new Promise((r) => setTimeout(r, 1500));
      await page.goto('https://www.onlyfans.com/my/chats', { waitUntil: 'domcontentloaded', timeout: 15000 });
    }
  } catch (navErr) {
    console.warn(`[SESSION] Initial navigation warning for ${modelId}: ${navErr.message}`);
  }

  if (restoreCookies && !hasDiskProfile && restoreCookies.local_storage) {
    try {
      await page.evaluate((json) => {
        const data = JSON.parse(json);
        for (const key of Object.keys(data)) {
          try {
            localStorage.setItem(key, data[key]);
          } catch (e) {
            /* ignore single-key failure */
          }
        }
      }, restoreCookies.local_storage);
    } catch (e) {
      console.warn(`[SESSION] localStorage restore failed for ${modelId}:`, e.message);
    }
  }

  if (restoreCookies) {
    // CONFIRMED LIVE: OnlyFans doesn't always reject an invalid session
    // with an immediate server-side redirect - sometimes the initial
    // response still serves /my/chats and a CLIENT-SIDE script bounces to
    // the login page a moment later. waitUntil:'domcontentloaded' above
    // can resolve BEFORE that client-side redirect fires, so checking the
    // URL immediately after goto caught it mid-flight and reported success
    // for a session OnlyFans was already about to reject. Giving it a
    // moment to settle before this function's caller (autoReconnectAllModels)
    // checks getLoginState avoids that false positive.
    await new Promise((r) => setTimeout(r, 2000));
  }

  const session = { browser, page, lastActivity: Date.now(), createdAt: new Date(), loggedInSince: null, displaySlot, mainViewer: null };
  session.meProfileRef = capturedMeProfile;
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

  // CONFIRMED LIVE (costly mistake): this used to also require an
  // 'auth_id' cookie, on the assumption OnlyFans only sets it once
  // actually authenticated. Pulled the RAW cookie jar from a session that
  // had just been manually logged into seconds earlier (real dashboard
  // visibly loaded, real localStorage config only a logged-in creator
  // gets) - there was no 'auth_id' cookie in it at all anymore. OnlyFans
  // has evidently dropped that cookie from this flow. Every isLoggedIn
  // check this whole session was silently requiring a cookie that no
  // longer exists, meaning it could never once return true.
  const sessCookie = cookies.find((c) => c.name === 'sess');

  // CONFIRMED LIVE (immediately after the fix above): dropping to just
  // 'sess' + URL was too weak in the OTHER direction - a stone-cold fresh
  // page load on the bare root domain (the manual /connect flow's very
  // first navigation, before any credentials are even typed) already has
  // a 'sess' cookie and isn't on a /login or return_to= URL either, so
  // this read back isLoggedIn:true for a blank, untouched login form -
  // the "Creator verbinden" button lit up green before any login had
  // happened at all. Cookies/URL alone can't reliably tell "guest
  // browsing the homepage" apart from "authenticated" on this specific
  // page, since OnlyFans serves both at the same root URL. Checking the
  // actual rendered DOM for a live password input closes that gap - a
  // real authenticated dashboard never has one, regardless of what
  // cookies happen to be sitting in the jar at that moment.
  let hasPasswordField = false;
  try {
    hasPasswordField = await page.evaluate(() => !!document.querySelector('input[type="password"]'));
  } catch (e) {
    // Page mid-navigation or closed - treat as inconclusive, not as
    // proof either way; the cookie/URL checks below still apply.
  }

  const isLoggedIn =
    !!sessCookie?.value && !pageUrl.includes('/login') && !pageUrl.includes('return_to=') && !hasPasswordField;

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

// Idle sweep - free RAM on the 2 vCPU/2GB VPS from abandoned sessions
setInterval(() => {
  const now = Date.now();
  for (const [modelId, session] of Object.entries(modelSessions)) {
    if (now - session.lastActivity > IDLE_TIMEOUT_MS) {
      closeSession(modelId, 'idle timeout');
    } else if (now - session.lastActivity > CHATTER_IDLE_PAUSE_MS) {
      // wipeProfile stays false (the default) - this must stay resumable
      // from assignSlot below, not a real disconnect.
      closeSession(modelId, 'paused - no chatter activity for 30min');
    }
  }
}, 5 * 60 * 1000);

// Files are only ever meant to sit on this VPS briefly - staged right
// before being attached and sent, never kept around. A batch that's
// staged some files but never gets its "last file" request (chatter
// closed the tab mid-upload, lost connection, etc.) previously left those
// temp files on disk forever, with no upper bound on how much /tmp could
// fill up over time - especially now that uploads go straight here with
// no size cap (see /public-upload-to-vault-fan). This sweep removes
// anything still pending an hour after it was first staged.
const ABANDONED_BATCH_MS = 60 * 60 * 1000;
setInterval(async () => {
  const now = Date.now();
  for (const [key, batch] of Object.entries(pendingUploadBatches)) {
    if (now - batch.createdAt > ABANDONED_BATCH_MS) {
      console.warn(`[UPLOAD-CLEANUP] Removing abandoned batch ${key} (${batch.filePaths.length} file(s))`);
      await Promise.all(batch.filePaths.map((p) => fs.unlink(p).catch(() => {})));
      delete pendingUploadBatches[key];
    }
  }
}, 15 * 60 * 1000);

// Periodic live-session health check - catches a session going invalid
// WHILE this process keeps running, which autoReconnectAllModels can't
// catch (that only ever runs once, at boot). CONFIRMED LIVE: a session
// stayed in modelSessions for 8+ hours with this process never
// restarting, yet getLoginState later reported isLoggedIn:false -
// OnlyFans had invalidated it server-side sometime in between, with
// nothing here ever noticing. Without this, Supabase's is_active stays
// stuck true and Connection Hub keeps claiming "verbunden" for a model
// that's actually dead until a chatter happens to notice a broken chat.
// getLoginState only reads the page's own current cookies/URL (no
// request to OnlyFans itself), so checking every few minutes adds no
// extra load on OnlyFans - this is purely local state inspection.
setInterval(async () => {
  for (const [modelId, session] of Object.entries(modelSessions)) {
    try {
      const state = await getLoginState(session.page);
      if (state.checkFailed) continue;
      if (state.isLoggedIn) {
        session.healthCheckFailures = 0;
        continue;
      }
      // CONFIRMED LIVE (costly): this used to act on the very first bad
      // read, and a getLoginState bug (see the 'auth_id' comment above)
      // made every single check come back false-negative - this loop
      // was closing a genuinely valid, just-logged-into session on its
      // very first 3-minute tick, repeatedly, for hours. Requiring two
      // consecutive bad reads (6 minutes apart) before actually acting
      // is the same "don't trust a single blip" reasoning already used
      // for dead-session detection elsewhere (see recordPageHealth) -
      // cheap insurance against the next time this check itself has a
      // bug, not just this specific one.
      session.healthCheckFailures = (session.healthCheckFailures || 0) + 1;
      if (session.healthCheckFailures < 2) continue;
      console.warn(`[HEALTH-CHECK] ${modelId}: session went invalid mid-run (confirmed on 2nd check), closing and marking disconnected`);
      await closeSession(modelId, 'session invalidated mid-run', true);
      if (APP_URL && CRON_SECRET) {
        await fetch(`${APP_URL}/api/vps/mark-session-invalid?secret=${CRON_SECRET}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelId }),
        }).catch(() => {});
      }
    } catch (e) {
      console.warn(`[HEALTH-CHECK] Error checking ${modelId}:`, e.message);
    }
  }
}, 3 * 60 * 1000);

// CONFIRMED LIVE (2026-07-26): the periodic background sync that used to
// run here (real onlyfans.com/api2/ fetches via page.evaluate, feeding a
// custom CRM chat UI built from synced data) reproducibly killed the
// OnlyFans session shortly after it ran its real API requests, regardless
// of how long the session had been logged in first (ruled out timing via
// a grace period - it still died the moment the requests actually fired).
// Removed entirely along with the custom chat UI it fed - back to the
// live VNC view as the only mode, which needs no automated API traffic
// and stayed logged in for 8+ minutes straight in the same tests.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const CRON_SECRET = process.env.CRON_SECRET;

// Runs once, shortly after this process comes up (see the app.listen()
// callback near the bottom of this file). Asks Next.js which models were
// connected before the restart and tries to silently rejoin each one using
// its stored cookies (getOrCreateSession's restoreCookies param), so a VPS
// restart/crash (deploy, OOM, `systemctl restart`) no longer forces a human
// to notice a broken chat and manually reconnect every single time - a
// routine restart alone doesn't invalidate OnlyFans' session cookies, only
// this process's own in-memory modelSessions map was ever lost. Falls back
// to leaving that one model disconnected (today's existing manual "Model
// verbinden" flow, unchanged) whenever the stored cookies really did expire.
async function autoReconnectAllModels() {
  if (!APP_URL || !CRON_SECRET) {
    console.warn('[AUTO-RECONNECT] Skipped - NEXT_PUBLIC_APP_URL or CRON_SECRET not set');
    return;
  }
  let sessions = [];
  try {
    const res = await fetch(`${APP_URL}/api/vps/sessions-to-restore?secret=${CRON_SECRET}`);
    const data = await res.json().catch(() => ({}));
    sessions = Array.isArray(data.sessions) ? data.sessions : [];
  } catch (e) {
    console.error('[AUTO-RECONNECT] Failed to fetch sessions to restore:', e.message);
    return;
  }
  if (!sessions.length) {
    console.log('[AUTO-RECONNECT] No stored sessions to restore');
    return;
  }
  console.log(`[AUTO-RECONNECT] Attempting to restore ${sessions.length} model session(s)...`);
  // Sequential, not parallel - launching several Chrome instances at once on
  // this 2-vCPU/2GB VPS is exactly the load spike withModelLock and
  // enforceSessionCap already exist to avoid elsewhere.
  for (const { modelId, cookies } of sessions) {
    try {
      // Pass a truthy sentinel even when Supabase had no cookies stored
      // (null) - restoreCookies also flags "this is an auto-reconnect
      // attempt, prefer the on-disk profile" throughout getOrCreateSession,
      // independent of whether the Supabase fallback map is populated.
      const session = await withModelLock(modelId, () => getOrCreateSession(modelId, cookies || {}));
      const state = await getLoginState(session.page);
      if (state.isLoggedIn) {
        session.loggedInSince = session.loggedInSince || Date.now();
        console.log(`[AUTO-RECONNECT] ${modelId}: restored silently`);
      } else {
        console.warn(`[AUTO-RECONNECT] ${modelId}: stored cookies no longer valid, closing and marking disconnected`);
        await closeSession(modelId, 'stored cookies invalid on auto-reconnect', true);
        await fetch(`${APP_URL}/api/vps/mark-session-invalid?secret=${CRON_SECRET}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelId }),
        }).catch(() => {});
      }
    } catch (e) {
      console.error(`[AUTO-RECONNECT] ${modelId}: error`, e.message);
    }
  }
}

// Periodic authoritative sync of OnlyFans' own per-fan lifetime-spend total
// into crm_fan_metadata.lifetime_value - see /api/vps/sync-fan-spend for the
// full rationale. Briefly navigates the model's own live page away from
// whatever it's currently showing (visible to any chatter watching via VNC
// at that moment, same page the fan-spend-overlay/PPV-detector scripts run
// on) to OnlyFans' own subscriber-activity list and back, so this runs on a
// deliberately long interval and sequentially across models - both to avoid
// interrupting a chatter's live view often, and to avoid looking like
// automated bulk-navigation to OnlyFans itself (CONFIRMED LIVE this session:
// rapid manual page-jumping during a debug session preceded a genuine
// session invalidation - not proven causally, but reason enough for caution
// here). Selector is best-effort (see comments inline) - only verified via
// server-log output afterward, not live-tested further per explicit
// instruction to stop poking a real connected model's account.
const FAN_SPEND_SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000;

async function syncFanLifetimeSpend(modelId, page) {
  const originalUrl = page.url();
  const returnUrl = originalUrl.includes('/my/chats') ? originalUrl : 'https://onlyfans.com/my/chats';

  await page.goto('https://onlyfans.com/my/collections/user-lists/subscribers/activity', {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  // The fan list is rendered client-side (infinite scroll) - not present
  // in the raw HTML immediately after domcontentloaded.
  await new Promise((r) => setTimeout(r, 2000));

  const fans = await page.evaluate(() => {
    var results = [];
    var seen = {};
    // "Gesamt" (German) / "Total" (English, in case the account language
    // ever changes) marks each fan row's lifetime-spend figure - matched by
    // text rather than a class name, same "OnlyFans' own classes are
    // unstable" trade-off already used elsewhere in this file (see
    // NAV_SCRIPT_TEMPLATE, isLocked()).
    var candidates = document.querySelectorAll('body *');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.children && el.children.length > 2) continue;
      var txt = (el.textContent || '').trim();
      if (txt !== 'Gesamt' && txt !== 'Total') continue;

      var amount = null;
      var container = el.parentElement;
      for (var depth = 0; depth < 4 && container && amount === null; depth++) {
        var m = (container.textContent || '').match(/(?:Gesamt|Total)\s*\$?\s*([\d.,]+)/);
        if (m && m[1]) amount = parseFloat(m[1].replace(/,/g, ''));
        container = container.parentElement;
      }
      if (amount === null) continue;

      // Walk up to the row and find that fan's own profile/chat link -
      // OnlyFans' auto-generated handles are literally "u<numericId>" (the
      // same numeric id used in /my/chats/chat/<id>/ elsewhere in this
      // codebase); a custom vanity handle won't match this and that row is
      // skipped rather than guessed at - logged below so real coverage can
      // be checked from server logs, not live-guessed further.
      var row = el;
      var fanId = null;
      for (var up = 0; up < 12 && row && fanId === null; up++) {
        var link = row.querySelector && row.querySelector('a[href^="/u"]');
        if (link) {
          var href = link.getAttribute('href') || '';
          var idMatch = href.match(/^\/u(\d+)$/);
          if (idMatch) fanId = idMatch[1];
        }
        row = row.parentElement;
      }
      if (fanId && !seen[fanId]) {
        seen[fanId] = true;
        results.push({ fanId: fanId, lifetimeValue: amount });
      }
    }
    return results;
  });

  await page.goto(returnUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});

  if (!fans.length) {
    console.warn(`[FAN-SPEND-SYNC] ${modelId}: found 0 fan rows - selector likely needs re-deriving`);
    return;
  }

  if (!APP_URL || !CRON_SECRET) {
    console.warn('[FAN-SPEND-SYNC] Skipped posting - NEXT_PUBLIC_APP_URL or CRON_SECRET not set');
    return;
  }
  try {
    const res = await fetch(`${APP_URL}/api/vps/sync-fan-spend?secret=${CRON_SECRET}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId, fans }),
    });
    const data = await res.json().catch(() => ({}));
    console.log(`[FAN-SPEND-SYNC] ${modelId}: scraped ${fans.length} fan(s) with a resolvable id, synced ${data.updated ?? '?'}`);
  } catch (e) {
    console.warn(`[FAN-SPEND-SYNC] ${modelId}: failed to post`, e.message);
  }
}

setInterval(async () => {
  // Sequential, not parallel - same 2-vCPU/2GB reasoning as autoReconnectAllModels.
  for (const [modelId, session] of Object.entries(modelSessions)) {
    // CONFIRMED LIVE (2026-07-29): this used to run against every session
    // unconditionally, including one an admin was mid-fresh-login on -
    // this loop's own page.goto() could fire right while someone was
    // typing OnlyFans credentials, reloading the login form out from
    // under them (losing what they'd typed) for no reason connected to
    // anything they did. Only ever touch a session already confirmed
    // logged in at least once.
    if (!session.loggedInSince) continue;
    try {
      await syncFanLifetimeSpend(modelId, session.page);
    } catch (e) {
      console.warn(`[FAN-SPEND-SYNC] ${modelId}: error`, e.message);
    }
  }
}, FAN_SPEND_SYNC_INTERVAL_MS);

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

    // Each model's main session now has its own dedicated display (see
    // assignModelDisplay) - no more shared-display stacking order to fix
    // with bringToFront(), so that workaround is gone.
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
    // Tracks whether THIS session has ever been confirmed logged in, so
    // background routines that navigate session.page (FAN-SPEND-SYNC etc.)
    // can skip a session that's still mid fresh-login and never interrupt
    // someone actively typing credentials - see that loop below.
    if (state.isLoggedIn) session.loggedInSince = session.loggedInSince || Date.now();
    else session.loggedInSince = null;
    res.json({ hasSession: true, ...state });
  } catch (error) {
    console.error('[STATUS] Error:', error.message);
    res.status(200).json({ hasSession: false, isLoggedIn: false, error: error.message });
  }
});

// Lightweight "did anything change at the top of this model's inbox"
// signal, used for the chatter-facing model-tab unread badges (a chatter
// running 2 models in one shift can't watch both VNC feeds at once). Reads
// the chat list's current top conversation (id + last-message preview)
// from whatever page the model's session already has open - no navigation,
// no extra network call, just inspecting already-rendered DOM. This is the
// same "never make a real fetch, only read what's already there" rule the
// old sync-loop violated and which killed sessions - reading the DOM this
// way carries none of that risk.
app.get('/inbox-fingerprint', async (req, res) => {
  try {
    const { modelId } = req.query;
    if (!modelId) return res.status(400).json({ error: 'Missing modelId' });

    const session = modelSessions[modelId];
    if (!session) return res.json({ status: 'no_session' });

    const fingerprint = await session.page.evaluate(() => {
      var item = document.querySelector('.b-chats__item');
      if (!item) return null;
      var preview = item.querySelector('.b-chats__item__last-message__content');
      return { id: item.id || '', preview: preview ? (preview.textContent || '').trim().slice(0, 80) : '' };
    });
    if (!fingerprint) return res.json({ status: 'success', fingerprint: null });
    res.json({ status: 'success', fingerprint: `${fingerprint.id}|${fingerprint.preview}` });
  } catch (error) {
    res.status(200).json({ status: 'error', error: error.message });
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
// called right after "Creator verbinden"). NOT an active fetch() anymore -
// confirmed live that OnlyFans' real /api2/v2/users/me requires proprietary
// signed headers a plain page.evaluate(fetch(...)) can never produce (HTTP
// 400 "Something went wrong" every time), which meant every single "Creator
// verbinden" click fired one guaranteed-malformed request against OnlyFans'
// real API using real cookies at the single most sensitive moment right
// after login. Instead, getOrCreateSession attaches a passive response
// listener that captures this exact call's body the moment OnlyFans' OWN
// app makes it (confirmed via a /sync-live discover pass that it always
// does, as part of loading /my/chats, and that the body already has
// avatar/avatarThumbs/name) - this route just returns whatever's already
// been captured. If nothing's captured yet (confirm clicked before that
// natural first load finished), reload once to trigger it fresh and give
// the listener a moment to catch it.
app.get('/profile-info', async (req, res) => {
  const { modelId } = req.query;
  if (!modelId) return res.status(400).json({ error: 'Missing modelId' });

  const session = modelSessions[modelId];
  if (!session) return res.status(404).json({ error: 'No active session for this model' });
  session.lastActivity = Date.now();

  try {
    if (!session.meProfileRef.current) {
      await session.page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      for (let attempt = 0; attempt < 8 && !session.meProfileRef.current; attempt++) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (!session.meProfileRef.current) {
      return res.json({ status: 'error', modelId, error: 'Profil-Antwort noch nicht eingetroffen' });
    }
    res.json({ status: 'success', modelId, data: { json: session.meProfileRef.current } });
  } catch (error) {
    console.error(`[PROFILE-INFO] Error for ${modelId}:`, error.message);
    res.status(200).json({ status: 'error', error: error.message });
  }
});

// Close a model's live browser, free the RAM, and wipe its on-disk profile
// so cookies from this login never survive into the next connect.
app.post('/disconnect', async (req, res) => {
  try {
    const { modelId, wipeProfile } = req.body || {};
    if (!modelId) return res.status(400).json({ error: 'Missing modelId' });

    // CONFIRMED LIVE (2026-07-27) as a real bug, not just the separate idle-
    // timeout one: this used to hardcode wipeProfile true regardless of
    // caller intent, so lib/crmSession.ts's disconnectModelSession(...,
    // wipeCookies=false) - specifically meant to preserve everything for a
    // merely-unreachable-right-now session (see its own doc comment) - still
    // wiped the on-disk Chrome profile every time. That profile is the
    // PRIMARY restore path (survives a systemctl restart; the Supabase
    // cookie fallback often gets rejected by OnlyFans per the comments in
    // getOrCreateSession), so this silently downgraded every "temporarily
    // unreachable" case to "only the unreliable fallback is left" - directly
    // undermining the "stays connected for days/months" requirement.
    // Defaults true so the manual Connection-Hub disconnect button (which
    // never sends this param) keeps its existing wipe-everything behavior.
    await closeSession(modelId, 'disconnect requested', wipeProfile !== false);
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
      // One-off discovery pass: navigate to the real chats page (and,
      // if discoverFanId is given, into that specific conversation too)
      // and record every /api2/ call the app itself makes AND its response
      // body, to find the real endpoints/shapes instead of guessing.
      const { discoverFanId } = req.body || {};
      const calls = [];
      const onRequest = (r) => {
        if (r.url().includes('/api2/')) calls.push({ method: r.method(), url: r.url() });
      };
      const bodies = {};
      const onResponse = async (r) => {
        const url = r.url();
        if (!url.includes('/api2/')) return;
        try {
          const json = await r.json();
          bodies[url] = json;
        } catch (e) {
          /* non-JSON or already consumed - skip */
        }
      };
      session.page.on('request', onRequest);
      session.page.on('response', onResponse);
      try {
        await session.page.goto('https://onlyfans.com/my/chats', { waitUntil: 'networkidle2', timeout: 20000 });
        await new Promise((r) => setTimeout(r, 1500));
        if (discoverFanId) {
          await session.page.goto(`https://onlyfans.com/my/chats/chat/${discoverFanId}/`, { waitUntil: 'networkidle2', timeout: 20000 });
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch (e) {
        console.warn(`[SYNC-LIVE] Discovery nav warning for ${modelId}:`, e.message);
      }
      session.page.off('request', onRequest);
      session.page.off('response', onResponse);
      // Full, untruncated bodies written to disk instead of the HTTP
      // response - a couple of these (message lists with media) are large
      // enough that JSON-stringifying + slicing them inline made earlier
      // discovery passes lose the exact field names past the cut, needing
      // yet another live navigation (and each one is a real cost - this
      // model's session actually got invalidated after enough of these
      // rapid-fire discovery navigations in a row, most likely OnlyFans'
      // own anti-automation detection).
      await fs.writeFile('/tmp/discover-full.json', JSON.stringify(bodies)).catch(() => {});
      return res.json({ status: 'success', modelId, discovered: calls, bodyKeys: Object.keys(bodies), pageUrl: session.page.url() });
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
  // modelId optional for backward compat (falls back to the :1 slot's
  // path) - callers that know their modelId (Connection Hub) should
  // always pass it now that each model has its own display.
  const { modelId } = req.query;
  const session = modelId ? modelSessions[modelId] : null;
  const wsPath = session?.displaySlot?.wsPath || MODEL_DISPLAY_SLOTS[0].wsPath;
  res.json({ status: 'success', password, wsPath });
});

// Assign (or reuse) an independent chatter slot for this (userId, modelId)
// pair - its own Chrome window, own virtual display, own VNC connection,
// so multiple chatters can work different fan conversations on the same or
// different models at the same time instead of sharing one cursor/scroll
// position. Reuses the same VNC password every slot shares (see /vnc-info)
// - the path alone (from wsPath below) is what routes a given client to the
// right slot.
app.post('/chatter-slot', async (req, res) => {
  try {
    const { userId, modelId, role, chatterName } = req.body || {};
    if (!userId || !modelId) return res.status(400).json({ error: 'Missing userId or modelId' });

    const result = await withModelLock(`slot:${userId}:${modelId}`, () => assignSlot(userId, modelId, role, chatterName));
    res.json({ status: 'success', slotId: result.slotId ?? null, isMain: result.isMain, wsPath: result.wsPath });
  } catch (error) {
    if (error.code === 'NO_MODEL_SESSION') {
      return res.json({ status: 'no_session', modelId: req.body?.modelId });
    }
    console.error('[CHATTER-SLOT] Error:', error.message);
    res.status(200).json({ status: 'error', error: error.message });
  }
});

// Which fan conversation a specific chatter's slot is currently showing -
// the Fan CRM panel needs to know this to load/save the right fan's data,
// but our own app has no visibility into what's clicked *inside* the VNC
// view otherwise (that all happens directly on OnlyFans' own page).
// Polled periodically by the frontend; deliberately lightweight (just the
// URL, not a screenshot or full page read).
app.get('/chatter-slot-page', async (req, res) => {
  const { userId, modelId } = req.query;
  if (!userId || !modelId) return res.status(400).json({ error: 'Missing userId or modelId' });

  const slot = resolveViewerSlot(userId, modelId);
  if (!slot || !slot.page) return res.json({ status: 'no_slot' });

  let pageUrl = 'unknown';
  try {
    pageUrl = slot.page.url();
  } catch (e) {
    /* page mid-navigation or closed - just report unknown */
  }
  // OnlyFans adds "modal-open" to <body> whenever any of its own modals is
  // showing (confirmed live: the vault-attach picker) - generic across
  // every modal type, not just this one. Already polled every ~1s by the
  // frontend for fan detection, so piggybacking this here is free instead
  // of a second poll; used to hide the CRM's own floating emoji bar while
  // an OnlyFans modal covers the compose area, since that overlay has no
  // other way to know OnlyFans opened something on top of it.
  let modalOpen = false;
  try {
    modalOpen = await slot.page.evaluate(() => document.body.classList.contains('modal-open'));
  } catch (e) {
    /* ignore - default to false */
  }
  // The CRM's own floating emoji bar (OnlyFansViewer.tsx) used a fixed
  // "bottom: 14%" guess, calibrated for the compose box's normal height -
  // confirmed live that attaching a Vault file (via the Script Vault picker
  // or manually) grows the real compose box taller (price/preview labels +
  // thumbnail row rendered above the text field), and this fixed-position
  // overlay stayed put, ending up overlapping the attachment thumbnails.
  // CONFIRMED LIVE: the text field's OWN bounding rect never moves (its
  // .top reads the same whether or not anything is attached) - the growth
  // happens on the outer ".b-make-post" compose-panel wrapper instead,
  // which expands upward while the text field stays pinned to its bottom.
  // Measuring that outer wrapper's top (not the text field's own) is what
  // actually reflects how tall the compose area currently is.
  let textareaTop = null;
  try {
    textareaTop = await slot.page.evaluate(() => {
      var panel = document.querySelector('.b-make-post');
      if (panel) return panel.getBoundingClientRect().top;
      var el = document.querySelector('.js-text-editor[contenteditable="true"], textarea[placeholder*="message" i]');
      return el ? el.getBoundingClientRect().top : null;
    });
  } catch (e) {
    /* ignore - frontend falls back to its old fixed position */
  }
  res.json({ status: 'success', pageUrl, modalOpen, textareaTop });
});

// Scrapes the visible text of a chatter's currently-open OnlyFans chat, for
// "Fill with AI" to analyze - not polled, only called on demand (the user
// clicking that button), since reading a page's full text is heavier than
// the plain URL check above. No reliance on OnlyFans' own class names
// (those aren't stable) - just the page's rendered text, same "fragile but
// functional" trade-off as the dark-mode CSS injection elsewhere in this
// file. The AI side has to make sense of the raw, noisy text itself.
app.get('/chatter-slot-chat-text', async (req, res) => {
  try {
    const { userId, modelId } = req.query;
    if (!userId || !modelId) return res.status(400).json({ error: 'Missing userId or modelId' });

    const slot = resolveViewerSlot(userId, modelId);
    if (!slot || !slot.page) return res.json({ status: 'no_slot' });

    const text = await slot.page.evaluate(() => document.body.innerText);
    res.json({ status: 'success', text: text.slice(0, 12000) });
  } catch (error) {
    console.error('[CHATTER-SLOT-CHAT-TEXT] Error:', error.message);
    res.status(200).json({ status: 'error', error: error.message });
  }
});

// Inserts an emoji directly into the real OnlyFans message box, at the
// current cursor position - replaces the old clipboard-copy + manual
// Strg+V flow (VNC's clipboard sync was the only option before this route
// existed; now that we know the compose box's real selector, driving it
// straight through Puppeteer is strictly better UX). Uses the DOM focus()
// + keyboard.insertText() combo rather than page.keyboard.type(), since
// insertText fires a proper input event at the current selection/caret
// (preserving whatever the chatter already typed) and handles arbitrary
// unicode (emoji) reliably, unlike simulating individual keydowns per char.
app.post('/insert-emoji', async (req, res) => {
  try {
    const { userId, modelId, emoji } = req.body || {};
    if (!userId || !modelId || !emoji) {
      return res.status(400).json({ error: 'Missing userId, modelId, or emoji' });
    }

    const slot = resolveViewerSlot(userId, modelId);
    if (!slot || !slot.page) return res.json({ status: 'no_slot' });

    const focused = await slot.page.evaluate(() => {
      var el = document.querySelector('textarea[placeholder*="message" i], div[contenteditable="true"]');
      if (!el) return false;
      el.focus();
      return true;
    });
    if (!focused) {
      return res.json({ status: 'no_input', message: 'Kein offenes Nachrichtenfeld gefunden' });
    }

    // keyboard.insertText() isn't available on this Puppeteer version
    // ("is not a function", confirmed live) - keyboard.type() is the older,
    // universally-available API and internally uses the same CDP
    // Input.insertText command for characters (like emoji) it can't map to
    // a physical key, so it inserts at the current cursor position the
    // same way.
    await slot.page.keyboard.type(emoji);
    slot.lastActivity = Date.now();
    res.json({ status: 'success' });
  } catch (error) {
    console.error('[INSERT-EMOJI] Error:', error.message);
    res.status(200).json({ status: 'error', error: error.message });
  }
});

// Inserts a Script Vault step: always types the message text, and for
// image/ppv steps also drives OnlyFans' own vault-attach modal (confirmed
// live: the "Medien aus Tresor hinzufügen" button opens a picker with a
// real search input, name="media_vault_search") to find and attach the
// referenced file, setting a price for ppv steps.
//
// IMPORTANT / UNVERIFIED: the search box and modal-open detection are
// confirmed live, but the actual result-click and price-input selectors
// below are best-effort - this session's test vault had no real media to
// click-test against (every category showed empty/error), so the
// selectors are informed guesses based on common patterns, not confirmed
// DOM. Needs a live pass with a model that actually has vault content
// before trusting this for real sends.
app.post('/insert-script-step', async (req, res) => {
  const { userId, modelId, messageText, mediaRefs, price } = req.body || {};
  if (!userId || !modelId || !messageText) {
    return res.status(400).json({ error: 'Missing userId, modelId, or messageText' });
  }

  const slot = resolveViewerSlot(userId, modelId);
  if (!slot || !slot.page) return res.json({ status: 'no_slot' });
  const page = slot.page;

  // Explicitly requested: the chatter should never see the Tresor picker
  // opening or being clicked through - only the final result, ready to
  // review and send themselves.
  // CONFIRMED LIVE: a "body { visibility: hidden }" stylesheet rule did NOT
  // work - the Tresor modal and price popup stayed fully visible anyway.
  // visibility is inherited, but OnlyFans' own modal/dialog components
  // evidently set their own explicit visibility (part of their open/close
  // transition), which overrides the inherited hidden state right back to
  // visible for themselves. Covering the whole viewport with an opaque div
  // of our own - on top of everything via a maximum z-index, appended last
  // so it's after any modal in DOM order too - doesn't depend on any of
  // that: nothing can render through a solid element sitting above it,
  // regardless of what visibility/opacity any nested component sets on
  // itself. Always removed in the finally below, even on error, so a
  // failed run can never leave the chatter staring at a blank screen.
  // CONFIRMED LIVE: a solid-color cover is itself visible - the chatter
  // reported "why did a white screen flash" instead of seeing nothing
  // change at all. A screenshot of the page exactly as it looked the
  // instant before this started, stretched to cover the viewport, reads
  // as a completely frozen/unchanged screen instead of an overlay - the
  // chatter should perceive zero visual change until the real, finished
  // state is revealed at the end.
  const hideFlow = async () => {
    console.log('[HIDE-FLOW] Starting screenshot...');
    // CONFIRMED LIVE (timing log): this single screenshot was the single
    // biggest line item in the whole flow (~1.5s on this VPS's 2 vCPUs,
    // shared with Xvfb and Chrome's own rendering) - JPEG encode time
    // scales with quality, and this frame is only ever shown as a frozen
    // "nothing changed" background for a couple seconds, never zoomed
    // into, so a much lower quality costs nothing visible here.
    const snapshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 40 }).catch((e) => {
      console.log('[HIDE-FLOW] Screenshot FAILED:', e.message);
      return null;
    });
    console.log('[HIDE-FLOW] Screenshot done, len=', snapshot ? snapshot.length : 'null');
    // CONFIRMED LIVE (reported by the user with a screenshot): the overlay
    // showed up with a washed-out cream/beige color cast instead of looking
    // unchanged. Root cause: OnlyFans has no real dark mode, so this app
    // fakes it by inverting the ENTIRE page (html { filter: invert(1)
    // hue-rotate(180deg) saturate(1.4) sepia(0.35) }, see DARK_MODE_SCRIPT
    // above) and then applying a counter-filter to real img/video/etc tags
    // to cancel that inversion back to normal-looking photos. A plain <div>
    // with a CSS background-image doesn't match that counter-filter's tag
    // selector, so the already-correct screenshot gets the ambient
    // dark-mode inversion applied to it A SECOND TIME, distorting its
    // colors - while the real page (all actual <img> tags) looks fine.
    // Using an actual <img> element instead of a styled div makes it match
    // the exact same counter-filter selector, so it renders true to the
    // original screenshot's colors.
    const created = await page
      .evaluate((imgData) => {
        if (document.getElementById('__etm_hide_flow__')) return 'already-existed';
        var overlay = document.createElement('img');
        overlay.id = '__etm_hide_flow__';
        overlay.style.cssText =
          'position:fixed;inset:0;z-index:2147483647;width:100%;height:100%;object-fit:fill;background:#0b0b0d;';
        if (imgData) {
          overlay.src = 'data:image/jpeg;base64,' + imgData;
        }
        document.body.appendChild(overlay);
        return document.getElementById('__etm_hide_flow__') ? 'created' : 'append-failed';
      }, snapshot)
      .catch((e) => 'evaluate-threw: ' + e.message);
    console.log('[HIDE-FLOW] Overlay creation result:', created);
  };
  const revealFlow = () => {
    console.log('[REVEAL-FLOW] Removing overlay...');
    return page
      .evaluate(() => {
        var s = document.getElementById('__etm_hide_flow__');
        if (s) s.remove();
        return s ? 'removed' : 'was-not-there';
      })
      .then((r) => console.log('[REVEAL-FLOW] Result:', r))
      .catch((e) => console.log('[REVEAL-FLOW] Error:', e.message));
  };

  // Temporary timing breakdown - the user reported 5-7s total and asked
  // for 1-5s. The waits below already resolve as early as OnlyFans allows
  // rather than sleeping a fixed guess, so the remaining time is either
  // our own small fixed delays (now trimmed) or OnlyFans' own modal/Vue
  // render time we can't shortcut - these checkpoints show which on the
  // next live run instead of guessing further. Remove once diagnosed.
  const t0 = Date.now();
  const lap = (label) => console.log(`[INSERT-TIMING] ${label}: +${Date.now() - t0}ms`);

  try {
    await hideFlow();
    lap('hideFlow done');
    const focused = await page.evaluate(() => {
      var el = document.querySelector('.js-text-editor[contenteditable="true"], textarea[placeholder*="message" i]');
      if (!el) return false;
      el.focus();
      return true;
    });
    if (!focused) return res.json({ status: 'no_input', message: 'Kein offenes Nachrichtenfeld gefunden' });
    // CONFIRMED LIVE (timing log): real keyboard.type() dispatches a
    // separate keydown/keypress/keyup/input event cycle per character -
    // fine for short text, adds up for longer scripts. execCommand runs
    // the browser's own native text-insertion pipeline in one call, which
    // fires the same kind of input event a real paste would (what rich
    // contenteditable editors like OnlyFans' are actually built to
    // observe), so it's usually a legitimate shortcut, not a hack. Verified
    // against the field's own resulting text before trusting it, though -
    // falls back to the always-correct simulated typing if it didn't take,
    // so a paid message never goes out wrong or blank for the sake of speed.
    const fastTyped = await page.evaluate((text) => {
      var el = document.querySelector('.js-text-editor[contenteditable="true"]');
      if (!el || !el.isContentEditable) return false;
      document.execCommand('insertText', false, text);
      return (el.textContent || '').trim() === text.trim();
    }, messageText);
    if (!fastTyped) {
      await page.evaluate(() => {
        var el = document.querySelector('.js-text-editor[contenteditable="true"], textarea[placeholder*="message" i]');
        if (!el) return;
        el.focus();
        if (el.isContentEditable) el.textContent = '';
        else el.value = '';
      });
      await page.keyboard.type(messageText);
    }
    lap(`message typed (${fastTyped ? 'fast' : 'fallback'})`);

    // Same hard-gate pattern as /upload-to-vault-fan's price step: confirmed
    // live once already (there) that blindly typing a price without
    // checking whether a price field actually got focused sends the
    // content as a free message with zero error. This requires the field to
    // be found AND the typed value to be read back and match before ever
    // reporting success.
    // CONFIRMED LIVE (via debug-dom): the price popup's own input has
    // name="" (empty!) and placeholder="Frei" - neither contains "price" or
    // "preis" as a substring, so the old selector guess could never match
    // it. The real, stable handle is autocomplete="price-input". The
    // popup also needs its own explicit "SPEICHERN" (Save) click to commit -
    // same pattern as the vault picker's Add button - typing into the field
    // alone doesn't persist it.
    const setPriceOrFail = async (expectedPrice) => {
      await page.evaluate(() => {
        var toggle = document.querySelector('[at-attr="price_btn"]');
        if (toggle) toggle.click();
      });
      // Merged the old waitForSelector + separate focus/clear evaluate into
      // one waitForFunction: same wait for OnlyFans to render the popup,
      // but one round trip instead of two - the focus/clear happens the
      // instant the input exists rather than as a second, later step.
      const priceFocused = await page
        .waitForFunction(
          () => {
            var input = document.querySelector('input[autocomplete="price-input"]');
            if (!input) return false;
            input.focus();
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          },
          { timeout: 3000 }
        )
        .then(() => true)
        .catch(() => false);
      if (!priceFocused) {
        return { ok: false, error: 'Preisfeld nicht gefunden - nicht gesendet, damit nichts kostenlos verschickt wird' };
      }
      await page.keyboard.type(String(expectedPrice));
      await new Promise((r) => setTimeout(r, 50));
      const priceConfirmed = await page.evaluate((expected) => {
        var input = document.querySelector('input[autocomplete="price-input"]');
        return !!(input && input.value && input.value.replace(',', '.').indexOf(String(expected)) !== -1);
      }, expectedPrice);
      if (!priceConfirmed) {
        return { ok: false, error: 'Preis konnte nicht bestätigt werden - nicht gesendet, damit nichts kostenlos verschickt wird' };
      }
      const saved = await page.evaluate(() => {
        var candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
        var btn = candidates.find(function (el) { return (el.textContent || '').trim().toLowerCase() === 'speichern'; });
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (!saved) {
        return { ok: false, error: 'Preis konnte nicht gespeichert werden (Speichern-Button nicht gefunden) - nicht gesendet, damit nichts kostenlos verschickt wird' };
      }
      await new Promise((r) => setTimeout(r, 50));
      return { ok: true };
    };

    const items = Array.isArray(mediaRefs) ? mediaRefs.filter((m) => m && m.label) : [];
    if (items.length === 0) {
      if (price) {
        const priceResult = await setPriceOrFail(price);
        lap('price set (no media)');
        if (!priceResult.ok) return res.json({ status: 'error', error: priceResult.error });
      }
      slot.lastActivity = Date.now();
      return res.json({ status: 'success' });
    }

    // Open the vault-attach modal (confirmed live selector).
    const opened = await page.evaluate(() => {
      var btn = document.querySelector('[at-attr="add_vault_media"]');
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!opened) return res.json({ status: 'partial', message: 'Text eingefügt, Tresor-Button nicht gefunden' });
    // Wait for the actual grid to exist rather than guessing a fixed delay -
    // resolves the instant it's ready (often well under the old flat 800ms)
    // instead of always paying the full guess, so the visible "flash" of
    // OnlyFans' own attach window is as short as it can be.
    await page.waitForSelector('[class*="checkbox-control" i] [at-attr="checkbox"]', { timeout: 4000 }).catch(() => {});
    lap('vault modal + grid ready');

    // Click each picked media item. The gallery picker (VaultGalleryPicker)
    // now hands over the REAL thumbnail URL for each item (sniffed
    // straight from OnlyFans' own Vault API response) - matching the
    // attach modal's own thumbnails against that exact URL is far more
    // reliable than clicking "the first result" (which is exactly the
    // class of bug that sent an Upload Vault file to the wrong fan
    // before the fan-ID fix). Falls back to "first result after a label
    // search" only for older/manual media_refs with no thumbnailUrl.
    // UNVERIFIED: couldn't confirm the attach modal's own thumbnail
    // selector live against real content yet - needs a live pass.
    let pickedCount = 0;
    for (const item of items) {
      let picked = false;

      if (item.thumbnailUrl) {
        // CONFIRMED LIVE: matching the full signed URL (i.src === url) never
        // works past the first load - OnlyFans re-signs its CloudFront
        // thumbnail URLs (fresh Policy/Signature/expiry) on every page visit,
        // so the thumbnailUrl captured when the script step was created has
        // already gone stale by the time a chatter clicks it later. The
        // underlying CDN path (domain + /files/<hash>/<WxH>_<name>.<ext>,
        // before the "?") stays stable across re-signing - confirmed live
        // that the attach modal's own 300x300 grid thumbnails share that
        // exact path with what /vault-media captured.
        const stablePath = item.thumbnailUrl.split('?')[0];
        for (let attempt = 0; attempt < 3 && !picked; attempt++) {
          picked = await page.evaluate((path) => {
            // CONFIRMED LIVE: the exact same file's thumbnail (same stable
            // path) appears up to 3 times on the page at once - a couple of
            // small 36px preview-strip copies (class "b-media-set__item",
            // which open the full-screen lightbox when clicked) plus the one
            // real 113px selectable grid tile (class "m-checkbox-control",
            // the actual attach checkbox). A blanket `querySelectorAll('img')`
            // grabbed whichever came first in DOM order - one of the wrong
            // lightbox copies - so this now only searches inside elements
            // that carry the checkbox-control class confirmed live to be the
            // real pickable tile.
            var candidates = document.querySelectorAll('[class*="checkbox-control" i] img');
            var img = Array.from(candidates).find(function (i) { return i.src.split('?')[0] === path; });
            if (!img) return false;
            var tile = img.closest('[class*="checkbox-control" i]');
            if (!tile) return false;
            // CONFIRMED LIVE (via debug-dom): the actual checkbox toggle is a
            // separate SIBLING element (`div[at-attr="checkbox"]`) next to
            // the <img>, not the tile itself or the image. Clicking the tile
            // (or the image) instead opens OnlyFans' full-screen lightbox
            // preview - clicking specifically this inner checkbox element is
            // what toggles the selection.
            var checkbox = tile.querySelector('[at-attr="checkbox"]');
            if (!checkbox) return false;
            checkbox.click();
            return true;
          }, stablePath);
          if (!picked) {
            // Scroll the attach modal's own list to load more before
            // giving up - best-effort, container selector unconfirmed.
            await page.evaluate(() => {
              var container = document.querySelector('[class*="vault" i] [class*="list" i], [class*="vault" i] [class*="scroll" i]');
              if (container) container.scrollTop += container.clientHeight;
            });
            await new Promise((r) => setTimeout(r, 150));
          }
        }
      }

      if (!picked) {
        const searched = await page.evaluate(() => {
          var input = document.querySelector('input[name="media_vault_search"]');
          if (!input) return false;
          input.focus();
          input.value = '';
          return true;
        });
        if (searched) {
          await page.keyboard.type(item.label);
          await new Promise((r) => setTimeout(r, 1000));
        }

        picked = await page.evaluate(() => {
          var candidates = document.querySelectorAll(
            '[class*="media-item" i] img, [class*="thumb" i] img, [class*="MediaItem" i], [class*="vault"] [class*="item" i]'
          );
          for (var i = 0; i < candidates.length; i++) {
            var el = candidates[i].closest('[class*="item" i]') || candidates[i];
            if (el && el.offsetParent !== null) {
              el.click();
              return true;
            }
          }
          return false;
        });
      }

      if (picked) pickedCount++;
      await new Promise((r) => setTimeout(r, 40));
    }
    lap(`items picked (${pickedCount}/${items.length})`);

    if (pickedCount === 0) {
      return res.json({
        status: 'partial',
        message: 'Text eingefügt, aber keine Tresor-Datei gefunden. Bitte im offenen Tresor-Fenster manuell auswählen.',
      });
    }

    // CONFIRMED LIVE: "SCHLIESSEN" (Close) just dismisses the picker WITHOUT
    // saving anything - the actual confirm action is a separate "HINZUFÜGEN"
    // (Add) button that only mounts once at least one file is checked, next
    // to a "N ausgewählt" counter. Clicking Close instead of Add is exactly
    // why nothing was ever landing in the compose box before.
    //
    // CONFIRMED LIVE (this pass): the whole flow now runs behind the frozen-
    // screenshot cover above, so how long this actually takes no longer
    // matters to the chatter - correctness matters far more than speed now.
    // Confirmed live that the previous budget (4s wait + 5 retries, ~3.5s)
    // was too short: this environment's real-world latency for the Add
    // button/counter bar (a newly-mounted Vue component) to render and
    // become clickable ran past that window, so the retry loop gave up and
    // moved on while the modal was still open - which then got exposed to
    // the chatter once the cover was lifted at the end. Both budgets below
    // are now much more generous.
    // CONFIRMED LIVE (root cause #1, finally pinned down via /debug-eval):
    // the exact match ('hinzufügen' === ...) NEVER succeeded, not even
    // once - every earlier "it worked" observation this session was
    // actually a manual click through Claude-in-Chrome, not this code. A
    // live substring probe (indexOf('hinzuf')) found the real button
    // instantly, on the exact same page/state where the exact-match
    // version found zero matches - meaning the "ü" this file's ===
    // comparison expects and the "ü" actually in the DOM's textContent are
    // two different Unicode representations of the same-looking glyph
    // (precomposed vs. a combining-character sequence), never === equal.
    //
    // CONFIRMED LIVE (root cause #2, found right after fixing #1): once
    // substring matching against 'div, span' too, it also caught every
    // ANCESTOR of the real button whose combined textContent happens to
    // contain "hinzuf" somewhere inside it - including the entire modal
    // wrapper. The "smallest area wins" sort then picked a zero-area
    // phantom element first (0 < the real button's ~4233), and even
    // without that, ties between the button and its own tight wrapper div
    // aren't guaranteed to resolve to the button. Restricting the search to
    // actual `button, [role="button"]` elements only removes both
    // problems at once - there's no other button on this page whose text
    // contains "hinzuf".
    await page.waitForFunction(
      () => {
        var candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
        return candidates.some(function (el) {
          var txt = (el.textContent || '').trim().toLowerCase();
          return (txt.indexOf('hinzuf') !== -1 || txt === 'add') && el.offsetParent !== null;
        });
      },
      { timeout: 10000 }
    ).catch(() => {});

    let addClicked = false;
    for (let attempt = 0; attempt < 12 && !addClicked; attempt++) {
      const clicked = await page.evaluate(() => {
        var candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
        var matches = candidates.filter(function (el) {
          var txt = (el.textContent || '').trim().toLowerCase();
          return (txt.indexOf('hinzuf') !== -1 || txt === 'add') && el.offsetParent !== null;
        });
        if (!matches.length) return false;
        matches.sort(function (a, b) {
          var ra = a.getBoundingClientRect();
          var rb = b.getBoundingClientRect();
          return ra.width * ra.height - rb.width * rb.height;
        });
        matches[0].click();
        return true;
      });
      if (!clicked) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      // Poll for the modal to actually close instead of always burning the
      // full worst-case 600ms - same 600ms ceiling as before (still
      // generous enough for the slow "newly-mounted Vue component" case
      // this budget was enlarged for), but resolves the instant the modal
      // closes rather than always paying the full amount even when it
      // closes in ~150ms, which is the common case.
      let stillOpen = true;
      for (let waited = 0; waited < 600 && stillOpen; waited += 50) {
        await new Promise((r) => setTimeout(r, 50));
        stillOpen = await page.evaluate(() => document.body.classList.contains('modal-open'));
      }
      addClicked = !stillOpen;
      if (!addClicked) await new Promise((r) => setTimeout(r, 500));
    }
    lap('add clicked, modal closed');

    if (price) {
      const priceResult = await setPriceOrFail(price);
      lap('price set (with media)');
      if (!priceResult.ok) return res.json({ status: 'error', error: priceResult.error });
    }
    lap('TOTAL before response');

    slot.lastActivity = Date.now();
    const allPicked = pickedCount === items.length;
    res.json({
      status: allPicked ? 'success' : 'partial',
      message: allPicked ? undefined : `Nur ${pickedCount} von ${items.length} Dateien gefunden - Rest bitte manuell im offenen Tresor-Fenster auswählen.`,
      pickedCount,
      total: items.length,
    });
  } catch (error) {
    console.error('[INSERT-SCRIPT-STEP] Error:', error.message);
    res.status(200).json({ status: 'error', error: error.message });
  } finally {
    await revealFlow();
  }
});

// Scraping the vault's contents blind (no live view at all) turned out
// not to work - the vault has real folders/categories and a layout that
// can't be reliably guessed from outside, and the admin explicitly needs
// to SEE and browse it visually, not read a flat scraped list. Back to a
// live embedded view (like the chat/OnlyFans viewer elsewhere), but the
// actual bug from the very first attempt at this - reading OnlyFans' own
// "selected" CSS state, which matched every file instead of just the
// clicked ones - is fixed differently this time: instead of asking
// "what does OnlyFans show as selected" after the fact, a click listener
// is injected that records every image click AS IT HAPPENS (toggling an
// entry in window.__pickedMedia on each click), independent of whatever
// CSS class OnlyFans itself uses for its own selected-state styling.
app.post('/vault-picker-goto', async (req, res) => {
  try {
    const { userId, modelId } = req.body || {};
    if (!userId || !modelId) return res.status(400).json({ error: 'Missing userId or modelId' });
    const slot = resolveViewerSlot(userId, modelId);
    if (!slot || !slot.page) return res.json({ status: 'no_slot' });
    const page = slot.page;

    await page.goto('https://onlyfans.com/my/vault', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1000));

    // UNVERIFIED: the >40px size filter is a best-effort guess to avoid
    // catching clicks on small unrelated icons (nav avatars, like
    // buttons) - needs a live pass to confirm it doesn't also miss or
    // over-match real vault thumbnails.
    await page.evaluate(() => {
      window.__pickedMedia = [];
      if (window.__pickedMediaListenerAttached) return;
      window.__pickedMediaListenerAttached = true;
      document.addEventListener(
        'click',
        function (e) {
          var img = e.target.tagName === 'IMG' ? e.target : e.target.querySelector && e.target.querySelector('img');
          if (!img) {
            var el = e.target.closest && e.target.closest('[class*="item" i], [class*="media" i], [class*="thumb" i]');
            img = el && el.querySelector('img');
          }
          if (!img || !img.src || img.naturalWidth < 40 || img.naturalHeight < 40) return;
          var list = window.__pickedMedia || (window.__pickedMedia = []);
          var idx = list.findIndex(function (m) { return m.thumbnailUrl === img.src; });
          if (idx >= 0) list.splice(idx, 1);
          else list.push({ label: img.alt || 'Datei ' + (list.length + 1), thumbnailUrl: img.src });
        },
        true
      );
    });

    res.json({ status: 'success' });
  } catch (error) {
    console.error('[VAULT-PICKER-GOTO] Error:', error.message);
    res.status(200).json({ status: 'error', error: error.message });
  }
});

// Reads back whatever the click-listener above has recorded so far -
// called whenever the admin clicks "Übernehmen" in the picker overlay.
app.post('/vault-picker-read', async (req, res) => {
  try {
    const { userId, modelId } = req.body || {};
    if (!userId || !modelId) return res.status(400).json({ error: 'Missing userId or modelId' });
    const slot = resolveViewerSlot(userId, modelId);
    if (!slot || !slot.page) return res.json({ status: 'no_slot', items: [] });

    const items = await slot.page.evaluate(() => window.__pickedMedia || []);
    res.json({ status: 'success', items });
  } catch (error) {
    console.error('[VAULT-PICKER-READ] Error:', error.message);
    res.status(200).json({ status: 'error', error: error.message, items: [] });
  }
});

// Lightweight replacement for an earlier VNC-embedded chat picker - the
// admin explicitly asked for a plain searchable list built into our own
// UI (overlay under the button), not a separate window showing the
// entire live OnlyFans interface. Runs on the model's own main session
// (modelSessions), the same one /upload-to-vault-fan itself sends
// through - not a chatter slot, so this never competes with an active
// chatter for one of the 4 limited slots. Types the query into OnlyFans'
// own chat-list search box and scrapes back the visible result names;
// no VNC/canvas involved at all.
app.post('/chat-search', async (req, res) => {
  try {
    const { modelId, query } = req.body || {};
    if (!modelId) return res.status(400).json({ error: 'Missing modelId' });
    const session = modelSessions[modelId];
    if (!session || !session.page) return res.json({ status: 'no_session', items: [] });
    const page = session.page;

    if (!page.url().includes('/my/chats')) {
      await page.goto('https://onlyfans.com/my/chats', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise((r) => setTimeout(r, 800));
    }

    const focused = await page.evaluate(() => {
      var input = document.querySelector('input[autocomplete="chats-search-input"]');
      if (!input) return false;
      input.focus();
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    });
    if (!focused) return res.json({ status: 'error', error: 'Chat-Suche nicht gefunden', items: [] });

    if (query) {
      await page.keyboard.type(String(query));
      await new Promise((r) => setTimeout(r, 900));
    } else {
      await new Promise((r) => setTimeout(r, 300));
    }

    // UNVERIFIED: best-effort name-element selector inside each chat-list
    // item - falls back to the first line of the item's own text if no
    // dedicated name element matches. The fan ID comes straight out of
    // the item's own confirmed-live href (/my/chats/chat/<id>/), so later
    // sends can jump directly to this exact conversation instead of
    // re-searching by name - the same label can match more than one
    // contact, but the ID never can.
    const items = await page.evaluate(() => {
      var links = document.querySelectorAll('.b-chats__item__link');
      var out = [];
      for (var i = 0; i < links.length && out.length < 20; i++) {
        var el = links[i];
        var nameEl = el.querySelector('[class*="user-name" i], [class*="username" i], [class*="item__name" i]');
        var label = nameEl ? nameEl.textContent.trim() : ((el.innerText || '').split('\n')[0] || '').trim();
        var match = (el.getAttribute('href') || '').match(/\/chat\/([^\/]+)\//);
        var fanId = match ? match[1] : null;
        if (label) out.push({ label: label, fanId: fanId });
      }
      return out;
    });

    res.json({ status: 'success', items });
  } catch (error) {
    console.error('[CHAT-SEARCH] Error:', error.message);
    res.status(200).json({ status: 'error', error: error.message, items: [] });
  }
});

// Uploads a local file into a model's OnlyFans Vault indirectly - OnlyFans
// has no direct bulk-upload-to-vault feature the team uses; the workaround
// (explained by the user) is sending the file as a priced message to a
// dedicated "Vault-Fan" (another one of their own model accounts, renamed
// to "Vault" in the chat list), which OnlyFans then archives into the
// Vault automatically. Runs on the model's MAIN session (modelSessions),
// not a chatter slot, so it never competes with an active chatter for one
// of the 4 limited slots.
//
// IMPORTANT / UNVERIFIED: the chat-list search input and the "attach
// media" button are confirmed live (same debug-dom session as
// insert-script-step). The price-toggle and price-input selectors are
// still best-effort guesses - confirmed live once already that typing
// blindly without checking the field was actually found sends the file
// as a free message with zero error, so this now hard-gates on the
// price being verifiably set before Send is ever clicked (see below).
// CONFIRMED LIVE (2026-07-26): sending 40 files one-by-one meant 40
// separate OnlyFans messages, each its own chat-open + attach + price +
// send cycle - both slow and not how a human would batch it. This is now
// a two-phase protocol driven by the caller: every request writes its one
// file to disk and stages its path under a shared batchId (fast, no
// OnlyFans interaction) - only the LAST file of a batch (isLastInBatch)
// triggers the real automation, attaching every staged file from that
// batch into ONE compose box and sending ONE priced message for all of
// them, exactly like a chatter attaching multiple files by hand. A batch
// of size 1 collapses to the exact same single-file-per-message behavior
// as before - there's no separate code path needed for "just one file".
// Verifies the short-lived, model-scoped signed token issued by Next.js's
// /api/crm/upload-token (see that route for the matching creation side -
// same HMAC-SHA256-over-{modelId,exp} scheme, both sides derive the key
// from VPS_SHARED_SECRET so no new secret/shared state is needed anywhere).
// Deliberately stateless (no server-side token store) - a leaked token is
// only ever useful for the one modelId it names, and only until it expires
// (5 minutes), which is enough for a whole upload batch (chunked uploads of
// the same file reuse one token; a fresh batch just requests a new one).
function verifyUploadToken(req, res, next) {
  const secret = process.env.VPS_SHARED_SECRET;
  if (!secret) return res.status(500).json({ error: 'VPS_SHARED_SECRET not configured' });

  const token = req.query.token;
  const modelId = req.query.modelId;
  if (!token || typeof token !== 'string' || !modelId) {
    return res.status(401).json({ error: 'Missing or invalid upload token' });
  }

  const dot = token.lastIndexOf('.');
  if (dot < 0) return res.status(401).json({ error: 'Malformed upload token' });
  const payloadB64 = token.slice(0, dot);
  const signatureHex = token.slice(dot + 1);

  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
  const sigBuf = Buffer.from(signatureHex, 'hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return res.status(401).json({ error: 'Invalid upload token' });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (e) {
    return res.status(401).json({ error: 'Malformed upload token' });
  }
  if (!payload || payload.modelId !== modelId) {
    return res.status(401).json({ error: 'Token does not match modelId' });
  }
  if (!payload.exp || Date.now() > payload.exp) {
    return res.status(401).json({ error: 'Upload token expired' });
  }
  next();
}

// Per the user's explicit ask (2026-07-29): VNC only ever carries video,
// never audio - this is a genuinely separate pipeline running alongside
// it. Captures the model's dedicated PulseAudio null sink (see
// MODEL_DISPLAY_SLOTS/crm-system.pa - Chrome's own audio output is
// routed there via PULSE_SINK at launch) and streams it live as MP3, one
// ffmpeg process per listener (pulse monitor sources support multiple
// simultaneous readers natively, so this doesn't need to be shared/
// deduped the way a Chrome launch does). Scoped to the main session only
// for now, not chatter-slot copies - matches assignSlot handing out the
// real main session first.
app.get('/audio-stream', verifyUploadToken, (req, res) => {
  const { modelId } = req.query;
  const session = modelSessions[modelId];
  const sink = session?.displaySlot?.audioSink;
  if (!sink) return res.status(404).end();

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-cache, no-store');

  const ff = spawn(
    'ffmpeg',
    [
      '-f', 'pulse', '-i', `${sink}.monitor`,
      // CONFIRMED LIVE (2026-07-29): reported too quiet to be useful even
      // at the sink's own volume already maxed (100%, checked directly) -
      // OnlyFans' own in-page player volume is outside anything this
      // pipeline controls. dynaudnorm adaptively boosts quiet audio
      // without blowing out louder parts, instead of a flat multiplier
      // that would either still be too quiet or clip on louder content.
      '-af', 'dynaudnorm=f=200:g=15',
      '-ac', '2', '-ar', '44100', '-f', 'mp3', '-b:a', '64k', '-flush_packets', '1', 'pipe:1',
    ],
    { env: { ...process.env, PULSE_SERVER: '/run/pulse/native' }, stdio: ['ignore', 'pipe', 'ignore'] }
  );
  ff.stdout.pipe(res);
  const cleanup = () => {
    try {
      ff.kill('SIGTERM');
    } catch (e) {
      /* ignore */
    }
  };
  req.on('close', cleanup);
  res.on('close', cleanup);
  ff.on('error', (e) => console.warn(`[AUDIO-STREAM] ffmpeg error for ${modelId}:`, e.message));
});

async function handleUploadToVaultFan(req, res) {
  const { modelId, vaultFanLabel, vaultFanId, price, fileName, batchId, isLastInBatch, chatterName } = req.query;
  if (!modelId || (!vaultFanLabel && !vaultFanId) || !fileName) {
    return res.status(400).json({ error: 'Missing modelId, vaultFanLabel/vaultFanId, or fileName' });
  }

  const session = modelSessions[modelId];
  if (!session) return res.json({ status: 'no_session' });
  const page = session.page;

  // Streams the request body straight to disk instead of buffering the
  // whole thing in memory first (this route used to run behind
  // express.raw(), which does exactly that, capped at 300mb). This VPS
  // only has 1GB RAM, already sharing space with a running Chrome session
  // per connected model - buffering a multi-hundred-MB/GB video on top of
  // that risked exhausting it. Streaming means file size is bounded by
  // disk space, not RAM, and there's no longer a hardcoded upload ceiling
  // (or any need for the old client-side chunking this used to require -
  // that only ever existed because of Vercel's 4.5MB request cap, which
  // doesn't apply here at all now that uploads go straight to this VPS).
  const tempPath = path.join('/tmp', `upload-${Date.now()}-${String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')}`);
  try {
    await new Promise((resolve, reject) => {
      const writeStream = fsSync.createWriteStream(tempPath);
      req.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);
      req.pipe(writeStream);
    });
  } catch (e) {
    await fs.unlink(tempPath).catch(() => {});
    return res.status(400).json({ error: 'Datei-Upload fehlgeschlagen: ' + e.message });
  }

  const stat = await fs.stat(tempPath).catch(() => null);
  if (!stat || stat.size === 0) {
    await fs.unlink(tempPath).catch(() => {});
    return res.status(400).json({ error: 'Missing file body' });
  }

  const key = batchId || `single-${Date.now()}-${Math.random()}`;

  if (!pendingUploadBatches[key]) {
    pendingUploadBatches[key] = { modelId, vaultFanId, vaultFanLabel, price, filePaths: [], createdAt: Date.now() };
  }
  pendingUploadBatches[key].filePaths.push(tempPath);

  if (!batchId || isLastInBatch !== 'true') {
    return res.json({ status: 'staged', stagedCount: pendingUploadBatches[key].filePaths.length });
  }

  const batch = pendingUploadBatches[key];
  const filePaths = batch.filePaths;
  delete pendingUploadBatches[key];

  try {
    let opened;
    if (vaultFanId) {
      // Confirmed-unique target: the exact chat URL captured when the
      // admin picked this contact via the chat-search overlay - no text
      // search/ambiguity at all, so this can never land on the wrong fan
      // (which is exactly what happened with the old label-search-only
      // approach when the label matched more than one contact).
      await page.goto(`https://onlyfans.com/my/chats/chat/${vaultFanId}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise((r) => setTimeout(r, 1200));
      opened = true;
    } else {
      await page.goto('https://onlyfans.com/my/chats', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise((r) => setTimeout(r, 1000));

      // Chat-list search (confirmed live: autocomplete="chats-search-input"),
      // not the within-a-chat search - finds the "Vault"-labeled conversation
      // by the nickname the user sets on it. Fallback only for mappings
      // saved before vault_fan_id existed - a non-unique label can click
      // the wrong contact, which is why the ID path above is preferred.
      const searched = await page.evaluate(() => {
        var input = document.querySelector('input[autocomplete="chats-search-input"]');
        if (!input) return false;
        input.focus();
        return true;
      });
      if (!searched) return res.json({ status: 'error', error: 'Chat-Suche nicht gefunden' });
      await page.keyboard.type(String(vaultFanLabel));
      await new Promise((r) => setTimeout(r, 1200));

      opened = await page.evaluate(() => {
        var link = document.querySelector('.b-chats__item__link');
        if (!link) return false;
        link.click();
        return true;
      });
    }

    if (!opened) return res.json({ status: 'error', error: 'Vault-Fan-Chat nicht gefunden' });

    // Confirmed live bug: a flat 1200ms wait wasn't enough for the attach
    // button to exist yet after jumping straight to a chat via URL (this
    // page load has more to render than the old search-then-click flow
    // did, which had its own built-in waits along the way) - waitForSelector
    // waits for the actual element instead of guessing a fixed delay.
    try {
      await page.waitForSelector('#attach_file_photo, .attach_file', { timeout: 10000 });
    } catch (e) {
      return res.json({ status: 'error', error: 'Anhang-Button nicht geladen (Chat-Seite zu langsam oder Selektor falsch)' });
    }

    const [fileChooser] = await Promise.all([
      page.waitForFileChooser({ timeout: 8000 }).catch(() => null),
      page.evaluate(() => {
        var btn = document.querySelector('#attach_file_photo, .attach_file');
        if (btn) btn.click();
      }),
    ]);
    if (!fileChooser) {
      return res.json({ status: 'error', error: 'Datei-Dialog nicht ausgelöst (Selektor unbestätigt)' });
    }
    // Puppeteer's fileChooser.accept() takes an array of paths and selects
    // all of them in one native dialog interaction, exactly like a human
    // ctrl-clicking multiple files - this is the whole batching mechanism
    // on the browser side, the rest is just staging paths beforehand.
    // CONFIRMED LIVE (2026-07-29): unlike every other wait in this route,
    // this one had no timeout - a large video under memory pressure left a
    // request hanging forever with zero log output and zero response ever
    // sent to the client, indistinguishable from a dead server from the
    // outside. Everything else here fails loud within seconds; this must too.
    await Promise.race([
      fileChooser.accept(filePaths),
      new Promise((_, reject) => setTimeout(() => reject(new Error('accept_timeout')), 45000)),
    ]).catch(() => {
      throw Object.assign(new Error('Datei-Anhängen hat zu lange gedauert (Timeout)'), { isAcceptTimeout: true });
    });
    // UNVERIFIED (needs one live confirmation): a fixed 3s wait was fine
    // for one small file, but a batch of up to 20 (possibly large videos)
    // can genuinely take longer for OnlyFans to finish uploading/
    // rendering previews for all of them. Polling for the send button to
    // become enabled uses OnlyFans' own readiness signal (it presumably
    // disables Send while attachments are still processing) instead of
    // guessing a fixed duration - scaled ceiling gives large batches
    // realistic room without making a single file wait needlessly long.
    await page
      .waitForFunction(
        () => {
          var btn = document.querySelector('[at-attr="send_btn"]');
          return !!(btn && !btn.disabled);
        },
        { timeout: Math.min(90000, 5000 + filePaths.length * 3000) }
      )
      .catch(() => {});

    if (price) {
      // Confirmed live bug: this used to blindly page.keyboard.type() the
      // price regardless of whether a price field was actually found and
      // focused - if OnlyFans needed a toggle click to reveal the price
      // panel first (or the selector just didn't match), the keystrokes
      // went nowhere and the file got sent as a free message with no
      // error at all. Now: try to reveal the price panel, then REQUIRE
      // the input to exist and its value to actually match what we typed
      // before ever touching Send - if the price can't be confirmed, this
      // aborts with an error instead of silently sending unpriced content.
      // CONFIRMED LIVE (via debug-dom, in /insert-script-step's identical
      // price popup): the old '[at-attr*="price" i]'/'input[name*="price"
      // i]' guesses never matched - the real toggle is '[at-attr="price_btn"]'
      // and the input has name="" (empty) with autocomplete="price-input"
      // as its only stable handle. This route had the same broken guess
      // and was reported live failing with exactly the "Preisfeld nicht
      // gefunden" error this check exists to prevent - fixed to match the
      // proven-working selectors instead of guessing again.
      await page.evaluate(() => {
        var toggle = document.querySelector('[at-attr="price_btn"]');
        if (toggle) toggle.click();
      });
      const priceFocused = await page
        .waitForFunction(
          () => {
            var input = document.querySelector('input[autocomplete="price-input"]');
            if (!input) return false;
            input.focus();
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          },
          { timeout: 3000 }
        )
        .then(() => true)
        .catch(() => false);
      if (!priceFocused) {
        return res.json({ status: 'error', error: 'Preisfeld nicht gefunden - nicht gesendet, damit nichts kostenlos verschickt wird' });
      }
      await page.keyboard.type(String(price));
      await new Promise((r) => setTimeout(r, 200));

      const priceConfirmed = await page.evaluate((expected) => {
        var input = document.querySelector('input[autocomplete="price-input"]');
        return !!(input && input.value && input.value.replace(',', '.').indexOf(String(expected)) !== -1);
      }, price);
      if (!priceConfirmed) {
        return res.json({ status: 'error', error: 'Preis konnte nicht bestätigt werden - nicht gesendet, damit nichts kostenlos verschickt wird' });
      }
      // CONFIRMED (matching /insert-script-step's proven flow): this popup
      // also needs its own explicit "Speichern" click to commit the price -
      // typing into the field alone doesn't persist it before Send.
      const priceSaved = await page.evaluate(() => {
        var candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
        var btn = candidates.find(function (el) { return (el.textContent || '').trim().toLowerCase() === 'speichern'; });
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (!priceSaved) {
        return res.json({ status: 'error', error: 'Preis konnte nicht gespeichert werden (Speichern-Button nicht gefunden) - nicht gesendet, damit nichts kostenlos verschickt wird' });
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    const clickedAt = Date.now();
    const clicked = await page.evaluate(() => {
      var btn = document.querySelector('[at-attr="send_btn"]');
      if (!btn || btn.disabled) return false;
      btn.click();
      return true;
    });
    if (!clicked) {
      return res.json({ status: 'error', error: 'Senden-Button nicht gefunden oder deaktiviert - nicht gesendet' });
    }
    console.log(`[UPLOAD-TO-VAULT-FAN] Send clicked for ${filePaths.length} file(s), waiting for confirmation...`);

    // CRITICAL per the user's explicit ask: never report success just
    // because Send was clicked without proof the message actually went -
    // a model closing the tab believing it's done, when it silently
    // wasn't, is exactly the failure mode this guards against. OnlyFans
    // resets the compose box (attachments + price badge cleared) once a
    // send actually completes - polling for that is the proxy used here.
    // CONFIRMED LIVE (twice now): this proxy itself is correct - the
    // price input really does disappear from the DOM once a send truly
    // completes (checked live moments after a "failed" report and found
    // zero price inputs present, matching a fully reset compose box) -
    // but it can take longer than expected, especially from a phone:
    // real camera photos are typically several MB each versus the much
    // smaller test images used earlier, and OnlyFans has to actually
    // receive/process all of that before resetting. A first fix (scaling
    // up to 60s) still wasn't enough for an 11-file phone batch. Given
    // the real risk here isn't slowness but a chatter panic-retrying a
    // send that actually already went out (billing the fan twice for the
    // same content), correctness matters far more than how long this
    // takes - much larger budget, and the error message itself now says
    // not to blindly resend.
    const sendConfirmed = await page
      .waitForFunction(
        () => {
          var priceInput = document.querySelector('input[autocomplete="price-input"]');
          var stillHasPriceBadge = priceInput && priceInput.value && priceInput.value.trim() !== '';
          return !stillHasPriceBadge;
        },
        { timeout: Math.min(180000, 15000 + filePaths.length * 6000) }
      )
      .then(() => true)
      .catch(() => false);
    if (!sendConfirmed) {
      // Diagnostic snapshot at the exact moment we gave up - this is the
      // one thing missing last time (this whole path logged nothing at
      // all), which is why the previous two fixes were guesses instead
      // of based on real evidence.
      const domSnapshot = await page
        .evaluate(() => {
          var priceInput = document.querySelector('input[autocomplete="price-input"]');
          var sendBtn = document.querySelector('[at-attr="send_btn"]');
          var mediaBubbles = document.querySelectorAll('.b-chat__message.m-from-me.m-has-media').length;
          return {
            priceInputExists: !!priceInput,
            priceInputValue: priceInput ? priceInput.value : null,
            sendBtnDisabled: sendBtn ? sendBtn.disabled : null,
            mediaBubbleCount: mediaBubbles,
          };
        })
        .catch((e) => ({ evalError: e.message }));
      console.warn(
        `[UPLOAD-TO-VAULT-FAN] sendConfirmed timed out after ${Date.now() - clickedAt}ms for ${filePaths.length} file(s). DOM snapshot: ${JSON.stringify(domSnapshot)}`
      );
      return res.json({
        status: 'error',
        error: 'Senden konnte nicht bestätigt werden, ABER die Nachricht ist evtl. trotzdem rausgegangen - bitte erst in der Live-Ansicht prüfen, bevor erneut gesendet wird (sonst doppelte Abbuchung möglich)',
      });
    }
    console.log(`[UPLOAD-TO-VAULT-FAN] Send confirmed after ${Date.now() - clickedAt}ms for ${filePaths.length} file(s).`);

    // "Gesendet von" attribution - only when a real logged-in CRM user
    // (chatter/admin) drove this send. Per the user's explicit ask, the
    // model's OWN uploads never get labeled this way (nobody needs to be
    // told a model sent her own content) - the model workspace's own
    // caller simply never sends chatterName, so this whole block is
    // skipped there. Best-effort: a logging failure must never affect the
    // actual send result, which already succeeded by this point.
    if (chatterName && vaultFanId) {
      try {
        const mediaKeys = await page.evaluate((count) => {
          var mine = Array.from(document.querySelectorAll('.b-chat__message.m-from-me.m-has-media'));
          var last = mine.slice(-count);
          return last
            .map(function (el) {
              var img = el.querySelector('.post_media img, .b-chat__message__media img');
              return img && img.src ? img.src.split('?')[0] : null;
            })
            .filter(Boolean);
        }, filePaths.length);
        const appUrl = process.env.NEXT_PUBLIC_APP_URL;
        if (appUrl) {
          for (const mediaKey of mediaKeys) {
            await fetch(`${appUrl}/api/crm/log-sent-message`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ modelId, fanId: vaultFanId, chatterName, mediaKey }),
            }).catch(() => {});
          }
        }
      } catch (e) {
        console.warn('[UPLOAD-TO-VAULT-FAN] Sent-by logging failed (non-fatal):', e.message);
      }
    }

    res.json({ status: 'success', sentCount: filePaths.length });
  } catch (error) {
    console.error('[UPLOAD-TO-VAULT-FAN] Error:', error.message);
    res.status(200).json({ status: 'error', error: error.message });
  } finally {
    await Promise.all(filePaths.map((p) => fs.unlink(p).catch(() => {})));
  }
}

// Server-to-server variant (Next.js forwarding a file it already received
// from the client) - kept for now as a fallback/for any caller still using
// it, gated by the global shared-secret middleware like everything else.
app.post('/upload-to-vault-fan', handleUploadToVaultFan);

// Direct browser-to-VPS variant - the client (Upload Vault / model
// workspace, see lib/uploadVaultBatch.ts) uploads straight here instead of
// routing every file byte through a Vercel serverless function twice
// (client->Vercel->VPS), which is both slower and burns Vercel's own
// bandwidth allowance for no benefit. Exempted from the global X-VPS-Secret
// middleware above (that secret must never reach a browser) - verifyUploadToken
// checks a short-lived, model-scoped signed token instead.
app.post('/public-upload-to-vault-fan', verifyUploadToken, handleUploadToVaultFan);

// One-off diagnostic screenshot of a model's or slot's current page -
// useful for verifying layout/CSS changes without needing a live VNC
// viewer open. Shared-secret gated like everything else here.
app.get('/debug-screenshot', async (req, res) => {
  try {
    const { modelId, slotId } = req.query;
    let page;
    if (slotId) {
      const slot = CHATTER_SLOTS.find((s) => String(s.id) === String(slotId));
      if (!slot || !slot.page) return res.status(404).json({ error: 'No active page for that slot' });
      page = slot.page;
    } else {
      const session = modelSessions[modelId];
      if (!session) return res.status(404).json({ error: 'No active session for this model' });
      page = session.page;
    }
    const screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 85 });
    res.json({ status: 'success', screenshot });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Temporary network-call capture for finding real OnlyFans API endpoints by
// watching what the live page itself calls while manually clicking around
// (same "confirm, don't guess" approach as ONLYFANS_CHATS_ENDPOINT/
// ONLYFANS_ME_ENDPOINT) - unlike /sync-live's discover mode, this doesn't
// navigate anything itself, so it can be pointed at a chatter slot's page
// and run alongside normal VNC use without disrupting it.
function resolveDebugPage(req) {
  const { modelId, slotId } = req.query.slotId !== undefined || req.query.modelId !== undefined ? req.query : req.body || {};
  if (slotId) {
    const slot = CHATTER_SLOTS.find((s) => String(s.id) === String(slotId));
    return slot && slot.page ? slot.page : null;
  }
  const session = modelSessions[modelId];
  return session ? session.page : null;
}

app.post('/debug-network-start', (req, res) => {
  const page = resolveDebugPage(req);
  if (!page) return res.status(404).json({ error: 'No active page for that model/slot' });

  if (page._networkCaptureHandler) {
    page.off('request', page._networkCaptureHandler);
  }
  page._networkCaptureCalls = [];
  page._networkCaptureHandler = (r) => {
    if (r.url().includes('/api2/')) {
      page._networkCaptureCalls.push(`${r.method()} ${r.url()}`);
    }
  };
  page.on('request', page._networkCaptureHandler);
  res.json({ status: 'success', message: 'Capturing /api2/ calls - go click around now, then call /debug-network-stop' });
});

app.post('/debug-network-stop', (req, res) => {
  const page = resolveDebugPage(req);
  if (!page) return res.status(404).json({ error: 'No active page for that model/slot' });

  const calls = page._networkCaptureCalls || [];
  if (page._networkCaptureHandler) {
    page.off('request', page._networkCaptureHandler);
    page._networkCaptureHandler = null;
  }
  res.json({ status: 'success', calls, pageUrl: page.url() });
});

// Diagnostic-only: navigates a slot's page to an arbitrary OnlyFans URL,
// so a specific chat can be opened for testing without clicking through
// the VNC feed (unreliable to hit blind given the CRM's own display
// scaling).
app.post('/debug-goto', async (req, res) => {
  const page = resolveDebugPage(req);
  if (!page) return res.status(404).json({ error: 'No active page for that model/slot' });
  const url = req.body && req.body.url;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    res.json({ status: 'success', pageUrl: page.url() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Diagnostic-only: clicks the Nth (default 0) element matching a selector -
// used to explore multi-step flows (like OnlyFans' own vault-attach modal)
// live without needing to click through the VNC feed at the right pixel.
app.post('/debug-click', async (req, res) => {
  const page = resolveDebugPage(req);
  if (!page) return res.status(404).json({ error: 'No active page for that model/slot' });
  const { selector, index } = req.body || {};
  if (!selector) return res.status(400).json({ error: 'Missing selector' });

  try {
    const clicked = await page.evaluate((sel, idx) => {
      const els = document.querySelectorAll(sel);
      const el = els[idx || 0];
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    }, selector, index);
    res.json({ status: clicked ? 'success' : 'not_found' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Diagnostic-only: focuses a selector and types text into it (for search
// boxes inside modals, distinct from debug-send-test which targets the
// main chat compose box specifically).
app.post('/debug-type', async (req, res) => {
  const page = resolveDebugPage(req);
  if (!page) return res.status(404).json({ error: 'No active page for that model/slot' });
  const { selector, text } = req.body || {};
  if (!selector || !text) return res.status(400).json({ error: 'Missing selector or text' });

  try {
    const focused = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.focus();
      return true;
    }, selector);
    if (!focused) return res.json({ status: 'not_found' });
    await page.keyboard.type(text);
    res.json({ status: 'success' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Diagnostic-only: runs a same-origin fetch() from inside the live page
// (so it carries the page's own OnlyFans session cookies automatically)
// against an arbitrary /api2/ URL and returns the parsed JSON - used to
// explore what OnlyFans' own internal API returns before building a
// real feature around it.
app.post('/debug-fetch', async (req, res) => {
  const page = resolveDebugPage(req);
  if (!page) return res.status(404).json({ error: 'No active page for that model/slot' });
  const url = req.body && req.body.url;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    const result = await page.evaluate(async (u) => {
      const r = await fetch(u, { credentials: 'include' });
      const text = await r.text();
      let json = null;
      try { json = JSON.parse(text); } catch (e) {}
      return { status: r.status, ok: r.ok, json: json, textSample: json ? null : text.slice(0, 500) };
    }, url);
    res.json({ status: 'success', result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// One-off diagnostic only - lets a debugging pass run arbitrary read-only
// JS in the page's own real window (same origin/context page.evaluate
// already runs in, not an isolated content-script world) and see what it
// returns. Used to poke around for any internally-shared HTTP client
// OnlyFans' own Vue app might expose (the same thing a browser extension
// running in that page could reach) rather than needing a dedicated route
// for every single check.
app.post('/debug-eval', async (req, res) => {
  const page = resolveDebugPage(req);
  if (!page) return res.status(404).json({ error: 'No active page for that model/slot' });
  const code = req.body && req.body.code;
  if (!code) return res.status(400).json({ error: 'Missing code' });

  try {
    const result = await page.evaluate((src) => {
      try {
        // eslint-disable-next-line no-new-func
        return new Function(src)();
      } catch (e) {
        return { __evalError: e.message };
      }
    }, code);
    res.json({ status: 'success', result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// One-off: tests whether OnlyFans' attach-file mechanism actually accepts
// a given local file - confirms/rules out the theory that its photo/video
// attach flow silently ignores non-image/video files (e.g. a recorded
// audio memo), which would explain "Preisfeld/Senden-Button nicht
// gefunden" without ever really attaching anything. Stops right after
// attaching - never touches price or Send, so nothing can go out.
// Diagnostic only.
app.post('/debug-test-attach', async (req, res) => {
  const page = resolveDebugPage(req);
  if (!page) return res.status(404).json({ error: 'No active page for that model/slot' });
  const filePath = req.body && req.body.filePath;
  if (!filePath) return res.status(400).json({ error: 'Missing filePath' });

  try {
    const before = await page.evaluate(() => ({
      mediaBubbles: document.querySelectorAll('.b-chat__message.m-from-me.m-has-media').length,
      sendBtnDisabled: (function () {
        var b = document.querySelector('[at-attr="send_btn"]');
        return b ? b.disabled : null;
      })(),
    }));

    const [fileChooser] = await Promise.all([
      page.waitForFileChooser({ timeout: 8000 }).catch(() => null),
      page.evaluate(() => {
        var btn = document.querySelector('#attach_file_photo, .attach_file');
        if (btn) btn.click();
      }),
    ]);
    if (!fileChooser) return res.json({ status: 'error', error: 'Datei-Dialog nicht ausgelöst' });
    await fileChooser.accept([filePath]);
    await new Promise((r) => setTimeout(r, 4000));

    const after = await page.evaluate(() => {
      var priceBtn = document.querySelector('[at-attr="price_btn"]');
      var sendBtn = document.querySelector('[at-attr="send_btn"]');
      var toasts = Array.from(document.querySelectorAll('.b-notify, .notify, [class*="toast" i], [class*="notif" i]'))
        .map((el) => (el.textContent || '').trim())
        .filter(Boolean);
      return {
        mediaBubbles: document.querySelectorAll('.b-chat__message.m-from-me.m-has-media').length,
        composeAttachments: document.querySelectorAll(
          '.b-make-post__file, .b-chat-form__media, [class*="attach" i][class*="item" i], [class*="uploaded" i]'
        ).length,
        priceBtnExists: !!priceBtn,
        sendBtnDisabled: sendBtn ? sendBtn.disabled : null,
        toasts,
      };
    });

    res.json({ status: 'success', before, after });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Real Vault gallery, no VNC/live-browsing at all - a bare fetch() to
// OnlyFans' own /api2/ endpoints from outside the page gets rejected
// (confirmed live: "Something went wrong" error), because OnlyFans signs
// these requests with headers its own front-end JS computes internally.
// Rather than reverse-engineer that signing scheme, this navigates the
// chatter slot's page to the real Vault (or a specific category) and
// SNIFFS the response body of the request OnlyFans' own SPA code makes
// naturally while loading - already validly authenticated/signed, we
// just read it instead of making our own request. Returns real thumbnail
// URLs so the admin gets an actual image grid in our own UI, with
// selection tracked entirely in OUR state - no clicking inside the real
// OnlyFans page at all, so there's no risk of triggering its own
// move/delete multi-select mode.
app.post('/vault-media', async (req, res) => {
  try {
    const { userId, modelId, listId } = req.body || {};
    if (!userId || !modelId) return res.status(400).json({ error: 'Missing userId or modelId' });
    const slot = resolveViewerSlot(userId, modelId);
    if (!slot || !slot.page) return res.json({ status: 'no_slot', items: [], lists: [] });
    const page = slot.page;

    let mediaBody = null;
    let listsBody = null;
    const handler = async (response) => {
      try {
        const url = response.url();
        if (!mediaBody && url.indexOf('/api2/v2/vault/media?') !== -1) {
          mediaBody = await response.json();
        } else if (!listsBody && url.indexOf('/api2/v2/vault/lists?') !== -1) {
          listsBody = await response.json();
        }
      } catch (e) {
        /* ignore parse errors on unrelated responses */
      }
    };
    page.on('response', handler);

    try {
      const targetUrl = listId ? `https://onlyfans.com/my/vault/list/${listId}` : 'https://onlyfans.com/my/vault';
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

      const start = Date.now();
      while (!mediaBody && Date.now() - start < 8000) {
        await new Promise((r) => setTimeout(r, 200));
      }
    } finally {
      page.off('response', handler);
    }

    if (!mediaBody) {
      return res.json({ status: 'error', error: 'Keine Antwort von OnlyFans erhalten', items: [], lists: [] });
    }

    // UNVERIFIED field mapping - OnlyFans' actual response shape isn't
    // documented, so this tries several plausible field names. rawSample
    // is included so a mismatch can be diagnosed and fixed from the
    // actual live response instead of guessing blind again.
    const rawList = mediaBody.list || mediaBody.data || (Array.isArray(mediaBody) ? mediaBody : []);
    const items = rawList.map((m, i) => {
      const thumb =
        (m.thumb && (m.thumb.url || m.thumb.src)) ||
        (m.files && m.files.thumb && (m.files.thumb.url || m.files.thumb.src)) ||
        (m.preview && (m.preview.url || m.preview.src)) ||
        m.thumbUrl || m.previewUrl || m.url || null;
      return {
        id: m.id != null ? String(m.id) : String(i),
        label: m.name || m.fileName || ('Datei ' + (i + 1)),
        thumbnailUrl: thumb,
      };
    });

    const rawLists = (listsBody && (listsBody.list || listsBody.data)) || [];
    const lists = rawLists.map((l) => ({ id: String(l.id), name: l.name || l.title || String(l.id) }));

    res.json({
      status: 'success',
      items,
      lists,
      rawSample: items.length === 0 && rawList.length > 0 ? rawList[0] : undefined,
    });
  } catch (error) {
    console.error('[VAULT-MEDIA] Error:', error.message);
    res.status(200).json({ status: 'error', error: error.message, items: [], lists: [] });
  }
});

// Confirmed live: the thumbnail URLs /vault-media returns are AWS
// CloudFront-signed with an IpAddress condition locked to THIS VPS's own
// outbound IP (OnlyFans' anti-hotlinking measure) - loading them
// directly in the admin's own browser gets rejected since the request
// doesn't come from that IP. This proxies the actual image fetch through
// the VPS itself (Node's own fetch, not the browser's), so the request
// really does originate from the allowed IP, then streams the bytes
// back unchanged.
app.get('/vault-thumbnail', async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string' || !url.startsWith('https://cdn')) {
    return res.status(400).json({ error: 'Missing or invalid url' });
  }
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      return res.status(upstream.status).end();
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    console.error('[VAULT-THUMBNAIL] Error:', error.message);
    res.status(502).end();
  }
});

// Diagnostic-only: types real text into the compose box and presses Enter,
// entirely server-side via Puppeteer - used to verify the sent-by overlay's
// local-send-trigger detection without needing to click through the VNC
// feed at the right pixel (which the CRM's own display scaling makes
// unreliable to hit blind).
app.post('/debug-send-test', async (req, res) => {
  const page = resolveDebugPage(req);
  if (!page) return res.status(404).json({ error: 'No active page for that model/slot' });
  const text = (req.body && req.body.text) || 'debugsendtest';

  try {
    const focused = await page.evaluate(() => {
      var el = document.querySelector('textarea[placeholder*="message" i], div[contenteditable="true"]');
      if (!el) return false;
      el.focus();
      return true;
    });
    if (!focused) return res.json({ status: 'no_input' });

    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    res.json({ status: 'success' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// One-off DOM inspection - finds the real compose-box position and the
// outgoing/incoming message bubble selectors on the live chat page, so the
// floating emoji bar and a future "sent by" overlay can target real
// coordinates/classes instead of guessed ones. Diagnostic only.
app.get('/debug-dom', async (req, res) => {
  const page = resolveDebugPage(req);
  if (!page) return res.status(404).json({ error: 'No active page for that model/slot' });

  const selector = req.query.selector || null;

  try {
    const data = await page.evaluate((sel) => {
      const textarea = document.querySelector('textarea[placeholder*="message" i], div[contenteditable="true"]');
      const textareaRect = textarea ? textarea.getBoundingClientRect() : null;

      let selectorMatches = null;
      if (sel) {
        selectorMatches = Array.from(document.querySelectorAll(sel))
          .slice(0, 8)
          .map((el) => {
            const rect = el.getBoundingClientRect();
            const cs = window.getComputedStyle(el);
            const parent = el.parentElement;
            const pcs = parent ? window.getComputedStyle(parent) : null;
            const prect = parent ? parent.getBoundingClientRect() : null;
            return {
              tag: el.tagName,
              className: typeof el.className === 'string' ? el.className.slice(0, 300) : '',
              outerHTML: el.outerHTML.slice(0, 600),
              rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
              justifyContent: cs.justifyContent,
              marginLeft: cs.marginLeft,
              textAlign: cs.textAlign,
              position: cs.position,
              left: cs.left,
              paddingLeft: cs.paddingLeft,
              transform: cs.transform,
              marginRight: cs.marginRight,
              flexBasis: cs.flexBasis,
              width: cs.width,
              inlineStyle: el.getAttribute('style'),
              parent: parent
                ? {
                    tag: parent.tagName,
                    className: typeof parent.className === 'string' ? parent.className.slice(0, 200) : '',
                    display: pcs.display,
                    gridTemplateColumns: pcs.gridTemplateColumns,
                    paddingLeft: pcs.paddingLeft,
                    rect: prect ? { left: prect.left, width: prect.width } : null,
                  }
                : null,
            };
          });
      }

      const candidates = Array.from(document.querySelectorAll('[class*="message" i]')).slice(0, 15);
      const sample = candidates.map((el) => ({
        tag: el.tagName,
        className: typeof el.className === 'string' ? el.className.slice(0, 200) : '',
        text: (el.textContent || '').trim().slice(0, 40),
      }));

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        textareaRect: textareaRect
          ? { top: textareaRect.top, left: textareaRect.left, width: textareaRect.width, height: textareaRect.height, bottom: textareaRect.bottom }
          : null,
        messageElementSample: sample,
        selectorMatches,
      };
    }, selector);
    res.json({ status: 'success', data, pageUrl: page.url() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'running',
    activeSessions: Object.keys(modelSessions).length,
    maxConcurrentSessions: MAX_CONCURRENT_SESSIONS,
    chatterSlots: CHATTER_SLOTS.map((s) => ({ id: s.id, assignedTo: s.assignedTo, modelId: s.modelId })),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Every restart of this service (deploys, crashes) orphans the previous
// run's Xvfb/x11vnc/websockify children - they're spawned as detached
// child processes tracked only in the in-memory CHATTER_SLOTS array, which
// is gone the moment this process exits, but the children themselves keep
// running. Confirmed live after this session's many deploy restarts: two
// separate websockify processes bound to the same slot port at once.
// Killing anything still using a slot's known ports/displays before this
// instance spawns its own gives every fresh start a clean slate instead of
// accumulating duplicates indefinitely.
for (const slot of CHATTER_SLOTS) {
  spawn('pkill', ['-9', '-f', `Xvfb ${slot.display} `], { stdio: 'ignore' });
  spawn('pkill', ['-9', '-f', `x11vnc -display ${slot.display} `], { stdio: 'ignore' });
  spawn('pkill', ['-9', '-f', `websockify ${slot.wsPort} `], { stdio: 'ignore' });
}
// Same orphan-cleanup, for the dynamically-spawned model-display slots -
// skips the static :1 slot, which is systemd-managed and outside this
// process's lifecycle entirely.
for (const slot of MODEL_DISPLAY_SLOTS.filter((s) => !s.static)) {
  spawn('pkill', ['-9', '-f', `Xvfb ${slot.display} `], { stdio: 'ignore' });
  spawn('pkill', ['-9', '-f', `x11vnc -display ${slot.display} `], { stdio: 'ignore' });
  spawn('pkill', ['-9', '-f', `websockify ${slot.wsPort} `], { stdio: 'ignore' });
}

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Listening on port ${PORT}`);
  // Fire-and-forget - /health and every other route must stay available
  // immediately regardless of how long restoring N models' sessions takes.
  autoReconnectAllModels().catch((e) => console.error('[AUTO-RECONNECT] Unexpected error:', e.message));
});

// Close every browser promptly on shutdown so systemd doesn't have to wait
// out the full stop timeout and SIGKILL us (which used to take ~90s and
// left the next start racing Xvfb).
async function shutdown(signal) {
  const activeSlots = CHATTER_SLOTS.filter((s) => s.assignedTo);
  console.log(`[SERVER] ${signal} received, closing ${Object.keys(modelSessions).length} session(s) and ${activeSlots.length} chatter slot(s)...`);
  await Promise.all(Object.keys(modelSessions).map((modelId) => closeSession(modelId, `shutdown (${signal})`)));
  await Promise.all(activeSlots.map((slot) => releaseSlot(slot, `shutdown (${signal})`)));
  // The slot Xvfb/x11vnc/websockify processes are spawned by this process
  // directly (not systemd units) - they'd otherwise survive as orphans
  // across a redeploy/restart, quietly piling up on every deploy.
  for (const slot of [...CHATTER_SLOTS, ...MODEL_DISPLAY_SLOTS.filter((s) => !s.static)]) {
    for (const proc of [slot.xvfbProc, slot.x11vncProc, slot.websockifyProc]) {
      if (proc && proc.exitCode === null) {
        try {
          proc.kill();
        } catch (e) {
          /* ignore */
        }
      }
    }
  }
  server.close(() => process.exit(0));
  // CONFIRMED LIVE (journalctl): with 3 concurrent live sessions, closing
  // every session's real Chrome/Xvfb/x11vnc processes plus releasing
  // chatter slots took longer than 5s even running in parallel - systemd's
  // matching TimeoutStopSec=5 then SIGKILLed the process mid-cleanup,
  // abandoning whatever closeSession()/releaseSlot() work was still
  // in-flight for whichever model happened to still be closing. That's a
  // real, reproducible cause of a model looking "randomly" disconnected
  // after any restart (crash, deploy, or manual). Raised alongside
  // TimeoutStopSec in the systemd unit so a clean shutdown actually gets
  // to finish before anything forces the process to exit.
  setTimeout(() => process.exit(0), 20000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
