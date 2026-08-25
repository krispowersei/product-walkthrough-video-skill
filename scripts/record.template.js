/**
 * Playwright recorder template. Copy this into your scratch working
 * directory and fill in every block marked "FILL IN" — the cursor overlay,
 * chrome-hiding scaffold, and typing/clicking helpers below are ready to use
 * as-is; only the app-specific bits (URL, chrome bypass, and the actual
 * click/fill sequence per cue) need writing for the app you're recording.
 *
 * Requires: durations.json already exists (run gen_audio.py first) — every
 * cue's wait time is driven by its own measured narration duration, never a
 * guessed timeout.
 *
 * See references/recording-technique.md for the reasoning behind each
 * helper, and script-schema.md for what a cue id means.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const durations = JSON.parse(fs.readFileSync(path.join(BASE, 'durations.json'), 'utf8'));

// `pace` scales the whole recording's tempo, matching the same field in
// script.json that sets the narration rate. 1.0 is the default feel; >1 is
// faster. Gaps and typing scale with it deliberately: speeding only the voice
// leaves every pause intact, and the pauses are what actually make a demo
// drag. Floors keep a very high pace from becoming unreadable.
const PACE = durations.__pace || 1;
const BUFFER_MS = Math.max(220, Math.round(450 / PACE)); // breathing room after each cue's speech ends
// Per-character typing delay. Long strings get a lower one so a 20-digit
// field doesn't outlast the sentence describing it — see typeAt below.
const TYPING_DELAY_MS = Math.max(20, Math.round(60 / PACE));
// After any action that produces a LARGE visual change (many rows landing at
// once, a big list refreshing) — not a single field/status flipping — pause
// this long after confirming the new state exists before treating the cue as
// done. recordVideo's capture can lag several real seconds behind the DOM
// right after an expensive re-render; this gives it time to catch up before
// the next cue's narration gets scheduled against it. See
// references/recording-technique.md.
const HEAVY_RENDER_SETTLE_MS = 1800;

// FILL IN: the local dev URL to record against.
const APP_URL = 'http://localhost:PORT';

// FILL IN: any fixture data the recording needs (sample rows to paste/upload,
// specific record ids to search for, etc.) — keep it here, not scattered
// through the cue definitions below, so it's easy to regenerate consistently.

// ---- synthetic cursor: headless recordings never capture the OS pointer ----
function installCursor() {
  // addInitScript runs at document-start, before <head>/<body> exist — defer
  // all DOM work behind a readiness check, or this throws on `document.head`
  // being null and window.__moveCursor never gets defined at all.
  function setup() {
    const style = document.createElement('style');
    style.textContent = `
      #__cursor {
        position: fixed; top: 500px; left: 800px; width: 30px; height: 30px;
        margin-left: -2px; margin-top: -2px;
        pointer-events: none; z-index: 2147483647;
        transition: left 0.5s cubic-bezier(0.4,0,0.2,1), top 0.5s cubic-bezier(0.4,0,0.2,1);
      }
      #__cursor svg { display: block; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.5)); }
      #__click_ring {
        position: fixed; top: 0; left: 0; width: 34px; height: 34px; border-radius: 50%;
        border: 2px solid #6366f1; background: rgba(99,102,241,0.22);
        pointer-events: none; z-index: 2147483646;
        transform: translate(-50%,-50%) scale(0.5); opacity: 0;
      }
      #__click_ring.pulse { animation: __pulse 0.55s ease-out; }
      @keyframes __pulse {
        0% { transform: translate(-50%,-50%) scale(0.5); opacity: 0.9; }
        100% { transform: translate(-50%,-50%) scale(1.8); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
    const cursor = document.createElement('div');
    cursor.id = '__cursor';
    cursor.innerHTML = '<svg width="30" height="30" viewBox="0 0 30 30" fill="none"><path d="M4 3L4 24L10.5 18.5L14 27L18 25.3L14.3 17L22 17L4 3Z" fill="white" stroke="black" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const ring = document.createElement('div');
    ring.id = '__click_ring';
    document.body.appendChild(cursor);
    document.body.appendChild(ring);
    window.__moveCursor = (x, y) => { cursor.style.left = x + 'px'; cursor.style.top = y + 'px'; };
    window.__clickPulse = (x, y) => {
      ring.style.left = x + 'px'; ring.style.top = y + 'px';
      ring.classList.remove('pulse'); void ring.offsetWidth; ring.classList.add('pulse');
    };
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
}

// ---- hide prototype-only chrome ----
// FILL IN: replace this with whatever actually hides this app's own
// prototype-only chrome (a password gate, an info modal, a dev toolbar).
// Match on unique TEXT or structure, never on a computed style value — a
// real bug found building this pipeline: a chrome element and an unrelated,
// legitimate piece of UI (a dropzone) rendered the exact same computed
// border style, so no color-based CSS selector could tell them apart; a
// MutationObserver matching the chrome's own unique text did.
function hideProtoChrome() {
  function scan() {
    // Example shape — replace 'Some Unique Chrome Text' with a string that
    // only appears inside the element(s) you actually need to hide in THIS
    // app:
    document.querySelectorAll('body *').forEach((el) => {
      if (el.children.length === 0 && el.textContent?.includes('Some Unique Chrome Text')) {
        el.closest('[data-hide-me], body > div')?.style.setProperty('display', 'none', 'important');
      }
    });
  }
  function start() {
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}

async function main() {
  const browser = await chromium.launch();
  // FILL IN: pick a recording resolution that matches the app's normal
  // desktop layout (this becomes the "recording size" that
  // compositing-pipeline.md's margin gets added to).
  const RECORDING_SIZE = { width: 1600, height: 1000 };
  const context = await browser.newContext({
    viewport: RECORDING_SIZE,
    recordVideo: { dir: path.join(BASE, 'clips/live'), size: RECORDING_SIZE },
  });

  // FILL IN: if this app's chrome needs a pre-seeded flag to bypass it
  // (e.g. a sessionStorage/localStorage key an access gate checks), set it
  // here via addInitScript so it's present before the very first paint.
  // await context.addInitScript(() => sessionStorage.setItem('YOUR_APP_BYPASS_FLAG', 'true'));

  await context.addInitScript(installCursor);
  await context.addInitScript(hideProtoChrome);
  const page = await context.newPage();

  // ---- cursor + interaction helpers (ready to use as-is) ----
  async function cursorTo(x, y) {
    await page.evaluate(([x, y]) => window.__moveCursor(x, y), [x, y]);
    await page.waitForTimeout(520); // let the CSS glide play out on camera
  }
  async function centerOfLocator(loc) {
    const box = await loc.first().boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  async function clickLocator(loc) {
    const { x, y } = await centerOfLocator(loc);
    await cursorTo(x, y);
    await page.evaluate(([x, y]) => window.__clickPulse(x, y), [x, y]);
    await page.waitForTimeout(200);
    await loc.first().click();
    await page.waitForTimeout(150);
  }
  async function clickAt(selector) { await clickLocator(page.locator(selector)); }
  async function clickButtonNamed(name, opts) { await clickLocator(page.getByRole('button', { name, ...opts })); }
  async function clickTextNamed(text) { await clickLocator(page.getByText(text, { exact: true })); }
  async function fillAt(selector, text) {
    // Reserve this for an actual paste UI, or for clearing a field — see
    // references/recording-technique.md. Everything a user would actually
    // type belongs in typeAt() below instead.
    const { x, y } = await centerOfLocator(page.locator(selector));
    await cursorTo(x, y);
    await page.fill(selector, text);
    await page.waitForTimeout(150);
  }
  // Scale the per-character delay down for long strings: a 20-character alias
  // reads as typing at 60ms, but a 20-digit device id at the same rate runs
  // past the end of any sentence that would sensibly describe it.
  function delayFor(text) {
    if (text.length > 24) return Math.max(18, Math.round(TYPING_DELAY_MS * 0.4));
    if (text.length > 14) return Math.max(24, Math.round(TYPING_DELAY_MS * 0.75));
    return TYPING_DELAY_MS;
  }
  async function typeAt(selector, text, { clear = false } = {}) {
    const { x, y } = await centerOfLocator(page.locator(selector));
    await cursorTo(x, y);
    await page.evaluate(([x, y]) => window.__clickPulse(x, y), [x, y]);
    await page.waitForTimeout(150);
    await page.click(selector);
    if (clear) {
      // fill('') rather than Ctrl+A/Backspace: the keyboard combo proved
      // flaky against some inputs under headless Chromium. An instant clear
      // doesn't need justifying the way an instant appearance does.
      await page.fill(selector, '');
      await page.waitForTimeout(150);
    }
    await page.locator(selector).pressSequentially(text, { delay: delayFor(text) });
    await page.waitForTimeout(200);
  }

  const recordStart = Date.now();
  const offsets = {};

  await page.goto(APP_URL);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  // FILL IN: dismiss any chrome that has to be actively closed rather than
  // pre-seeded (e.g. an onboarding modal with no persistence flag):
  // await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // FILL IN: park the cursor somewhere sensible (e.g. near the top-right,
  // out of the way of the first real target) before the first cue starts.
  await page.evaluate(([x, y]) => window.__moveCursor(x, y), [RECORDING_SIZE.width - 300, 45]);
  await page.waitForTimeout(200);

  const cleanStart = Date.now();
  console.log('preRollMs', cleanStart - recordStart);

  // Three phases, and which one an action belongs in is the single biggest
  // lever on whether the video feels synced:
  //
  //   pre    - runs BEFORE the narration starts, in silence. Reserve it for
  //            settling (see HEAVY_RENDER_SETTLE_MS), not for anything the
  //            viewer is meant to watch.
  //   during - runs WHILE the narration plays. Everything the sentence
  //            describes goes here: typing, selecting, toggling, moving the
  //            cursor across the things being named. The cue then absorbs
  //            whatever narration time is left over. If the action outruns the
  //            narration the cue simply runs long, which is safe: every offset
  //            is stamped at its own cue's start.
  //   post   - runs as the narration ENDS. Reserve it for the click that
  //            advances to the next screen, so the words lead into the
  //            transition instead of trailing behind it.
  //
  // Without `during`, every multi-second action is structurally silent: `pre`
  // happens before the voice and `post` happens after it.
  async function cue(id, { pre, during, post } = {}) {
    if (pre) await pre();
    offsets[id] = Date.now() - cleanStart;
    const waitMs = Math.round(durations[id] * 1000) + BUFFER_MS;
    const started = Date.now();
    if (during) await during();
    const remaining = waitMs - (Date.now() - started);
    if (remaining > 0) await page.waitForTimeout(remaining);
    if (post) await post();
  }

  // ---- FILL IN: one `await cue(id, { pre, during, post })` per cue in
  // script.json, in the same order, doing whatever Playwright action
  // corresponds to that cue's narration. See the phase contract on `cue`
  // above — the short version is that anything the sentence describes goes
  // in `during`, and only the screen-advancing click goes in `post`.
  //
  // A cue with none of the three is a pure dwell beat; a cue whose `during`
  // only moves the cursor across the things being named is the normal shape
  // for an explanatory beat. Remember: a menu opening and an item inside it
  // being chosen are always two separate cues.
  //
  // await cue('c01', { post: async () => clickButtonNamed('Some Button') });
  // await cue('c02', { during: async () => typeAt('#some-input', 'a name'),
  //                    post: async () => clickButtonNamed('Continue') });
  // ...

  await page.waitForTimeout(800);

  fs.writeFileSync(path.join(BASE, 'offsets.json'), JSON.stringify(offsets, null, 2));
  fs.writeFileSync(path.join(BASE, 'preroll.json'), JSON.stringify({ preRollMs: cleanStart - recordStart }, null, 2));

  const videoPath = await page.video().path();
  await context.close();
  await browser.close();
  console.log('VIDEO_PATH', videoPath);
}

main().catch((e) => { console.error('RECORD_ERROR', e); process.exit(1); });
