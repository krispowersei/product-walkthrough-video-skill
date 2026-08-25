# Recording technique

## The synthetic cursor

Headless recordings never capture the OS pointer, so without one the video is hard to follow — a click just happens somewhere with no lead-up. Inject a synthetic cursor via `context.addInitScript`: an SVG arrow element plus a small "click ring" that pulses on every real click. Move it with a CSS `transition` on `left`/`top` (not a teleport) so intermediate frames show an actual glide toward the target, then pulse the ring right before the click fires.

**Real gotcha:** `addInitScript` runs at *document-start*, before `<head>`/`<body>` exist. Code that unconditionally does `document.head.appendChild(...)` throws immediately and silently kills the whole init script — nothing downstream that depends on it (e.g. a `window.__moveCursor` helper) ever gets defined, and the failure surfaces confusingly later, far from the real cause. Guard every bit of DOM work behind a readiness check:

```js
function setup() { /* create style tag, cursor element, click-ring element, define window.__moveCursor / __clickPulse */ }
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setup);
} else {
  setup();
}
```

Route every scripted interaction through helpers that move the cursor to the real element's bounding-box center, wait for the glide to finish, pulse, *then* act — never a bare `page.click()`/`page.fill()` with no cursor movement. See `record.template.js` for the exact helper shapes (`cursorTo`, `centerOfLocator`, `clickLocator`, `typeAt`, etc.).

## Which phase an action belongs in

`cue()` has three phases and choosing between them is the single biggest lever on whether the finished video feels synced:

| Phase | When it runs | What belongs there |
|---|---|---|
| `pre` | before the narration, in silence | settling only (see the recorder-lag note below) |
| `during` | **while the narration plays** | everything the sentence describes: typing, selecting, toggling, moving the cursor across the things being named |
| `post` | as the narration ends | the click that advances to the next screen |

The split matters because without `during`, every multi-second action is *structurally* silent — `pre` happens before the voice and `post` happens after it, so typing an alias or filling four form rows can only ever play against no narration at all.

Putting the screen-advancing click in `post` is the other half: the words lead *into* the transition rather than trailing behind it, so a cue reads as "here's what I'm about to do" followed by doing it.

If a `during` action outruns its narration the cue simply runs long, which is safe — every offset is stamped at its own cue's start. But it means silence, so the fix belongs in the script: see "size the narration to the action" in `narration-voice.md`.

## The cursor follows the sentence

Beyond parking the cursor on whatever's being named, on an explanatory cue with no click **move it across each thing in the order the narration names them**. If the line is "how many lines you need, and what kind — Standard covers most people, Obscura is the privacy line", glide to the quantity toggle, then Standard, then Obscura, timed under those clauses.

A cue whose `during` only moves the cursor is the normal shape for an explanatory beat — it isn't a dwell with nothing happening, it's the cursor acting as a pointer.

## Typing vs. pasting

**Default to real per-character typing** (`locator.pressSequentially(text, { delay: ~60 })`, after a real click to focus the field — `record.template.js` scales this from `pace` and drops it further for long strings, so a twenty-digit field doesn't outlast the sentence describing it) for anything a user would actually type — form fields, search boxes. An instant `fill()` is indistinguishable on screen from content materializing out of nowhere, which reads as mysterious to a viewer with no idea what just happened.

Reserve instant fill for exactly two cases:
1. **An actual paste UI** — a "paste data" textarea, a clipboard-style input — and even then, say so in the narration ("I'll paste those straight in"). Don't silently fill a paste-shaped field either; narrate the action even when the mechanic is legitimately instant.
2. **Clearing a field before retyping into it.** Disappearance doesn't need justifying the way appearance does. If `Ctrl+A` + `Backspace` proves flaky under headless Chromium for a given input (a real, observed failure mode — not hypothetical), fall back to `page.fill(selector, '')` for the clear step specifically; it's instant and reliable, and nothing mysterious is "appearing."

When in doubt, click through the real UI rather than shortcutting with a paste/fill, even if it takes one more step to script.

## File uploads and drag-and-drop

Never let a file just "appear" — attaching a file has to read as an actual action, the same way typing does. An instant `page.setInputFiles()` with no visible lead-up is exactly the "content materialized out of nowhere" problem the typing rule above describes, just for files instead of text.

**Prefer a real simulated drag-and-drop over a bare `setInputFiles()` whenever the target element supports one.** Check the target app's dropzone for real `dragenter`/`dragover`/`drop` handlers (not just a decorative-looking dashed box that only works via a hidden `<input type="file">` opened on click) — a genuine implementation usually has a distinct visual "drag hover" state (a border/background color change) precisely so a real user gets feedback mid-drag. If it does:

1. Build a real `DataTransfer` carrying the actual file, in-page:
   ```js
   const buffer = fs.readFileSync(filePath);
   const dataTransfer = await page.evaluateHandle(([base64, fileName, mimeType]) => {
     const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
     const file = new File([bytes], fileName, { type: mimeType });
     const dt = new DataTransfer();
     dt.items.add(file);
     return dt;
   }, [buffer.toString('base64'), path.basename(filePath), 'text/csv']);
   ```
2. Dispatch `dragenter` then `dragover` on the dropzone with that `dataTransfer` — this is what flips the real hover state on screen — and hold for a beat (several hundred ms) so the highlighted dropzone is actually visible on camera, not a single flashed frame.
3. Dispatch `drop` with the same `dataTransfer` to complete it.

This drives the app's real handlers, not a fake overlay — the viewer sees the actual product's own drag-feedback, which is more honest than staging something the app doesn't really do.

**After the drop, wait for the real resulting state, never a fixed timeout.** `dispatchEvent('drop', ...)` (and `setInputFiles()`) resolves as soon as the app's synchronous handler code returns — if that handler kicks off a `FileReader.readAsText()` (or any other async read) to parse the file, the read-and-re-render happens *after* your dispatch call has already resolved, even for a tiny file. A fixed `waitForTimeout(400)` guessed to "probably be enough" is exactly the kind of assumption that quietly breaks: the narration for the *next* cue gets scheduled at whatever offset gets recorded once this cue's `post` returns, and if the real render lands later than the guessed timeout, that next narration starts playing over a screen that hasn't updated yet — a real, hard-to-notice desync. Wait on the actual resulting content instead — e.g. `await page.getByText(/rows uploaded/).waitFor({ state: 'visible' })` — so the recorded offset reflects when the result is *actually* on screen, not when you guessed it would be.

**If the dropzone only supports click-to-open (no real drag handlers), don't fake a hover state that doesn't exist** — instead, make the click-and-attach visually legible another way: park the cursor on the dropzone, pulse, then attach the file, then hold on the newly-populated result for its own beat before moving on (never advance to the next cue in the same instant the file lands). Either way, once the file is attached, **the resulting content (a row count, a parsed table, a file-name chip) needs its own dwell** — don't let the next cue's action fire before the viewer has had a moment to see the file was actually accepted and something real happened.

## Hiding prototype-only chrome

A demo shows the product, never the prototype's own review scaffolding — a password/access gate, an onboarding modal, a guided-tour picker, a floating dev/debug toolbar. None of it should appear on screen or get mentioned in narration.

**Figure out each one's actual bypass mechanism by reading the app's code — don't assume a convention from a different app.** Common shapes: a flag the gate checks in `sessionStorage`/`localStorage` that can be pre-seeded via `context.addInitScript` before first paint; a modal with no persistence that has to be actually dismissed (in which case, record a "clean start" timestamp once it's gone, and trim/measure every downstream offset from that timestamp, not from recording start); a toolbar that can be hidden with an injected stylesheet rule.

**Real gotcha, worth checking for on every app, not just the one it was first found on:** hiding chrome by matching a computed *style value* (e.g. "anything with this exact border") can silently catch real UI that happens to share the same computed style — a dev toolbar and a legitimate dropzone can both render `1px dashed rgb(209, 209, 209)` if they reference the same underlying color token, and no amount of selector specificity fixes that, because the browser serializes both to the identical string. **Match on the chrome's actual unique text or structure instead** — e.g. a `MutationObserver` scanning for a literal string only the chrome element contains, re-scanning on every DOM mutation so it survives re-renders (a one-time inline style get wiped the moment the framework re-renders that subtree).

## Pacing rules

- **A menu opening and an item inside it being chosen are always two separate cues, not one.** Splitting them means the popover is fully visible and narrated ("let's open its menu") before anything inside it gets clicked — combining them into one fast cue makes the menu's contents flash past too quickly for a viewer to register what was actually available.
- **Give a genuinely static moment its own dwell beat if the next click would otherwise land before a viewer can read what just appeared** — e.g. right after a bulk upload completes and a results table appears, or right after any action produces new on-screen content that the narration is about to reference. A cue with no action of its own, just a narrated pause, is a legitimate and often-needed beat.
- **Whatever the narration is talking about must be on screen and pointed at, at the moment it's said.** If a sentence names a screen, be on that screen already, not navigating to it as the words land — reword a "this is the screen where…" line into a forward-looking one and let the *next* cue describe what's now visible. If a sentence names a specific cell/row/field, park the cursor on it while the words play, rather than leaving the cursor wherever the last click happened to leave it.
- **Scope hover/cursor-target selectors to the layer actually in front.** A drawer or modal sits on top of a page that often has the same markup underneath it — a broad selector matching "the list" can resolve to the list behind an open overlay rather than the one in front. Scope selectors to the overlay's own container when one is open.
- **Watch for selectors resolving to a hidden node.** A text selector can match an invisible option element rather than the visible control that actually displays it; prefer a selector that only matches visible elements, or target the real interactive control directly.
- **An icon font breaks exact-text matching.** Menu items commonly render an icon and its label inside the same element. With an icon *font* (Material Symbols and friends) the glyph is real text, so the element's `textContent` is `"restart_altResend activation"` and `getByText('Resend activation', { exact: true })` never resolves — while the same selector without `exact` works fine. Prefer `locator('button').filter({ hasText: '...' })` for menu items.

## The recording can lag behind the real DOM by several seconds after a heavy re-render

Every cue's timing is driven by `Date.now()` — real, accurate wall-clock time relative to the DOM. But Playwright's `recordVideo` capture is a separate, asynchronous screencast pipeline, and it does not always keep up with that wall-clock in real time. Right after an expensive re-render (a table with a dozen-plus new rows appearing, a big list refreshing), the *DOM* can be confirmed present and visible (an `expect(...).toBeVisible()` or a `.waitFor()` resolves correctly, proving the automation itself is accurate) while the *video frames* still show the old, pre-render state for another one to several seconds. This is real, measured behavior, not a hypothetical — narration scheduled right at the `Date.now()`-measured offset for a big re-render started playing over a screen the recording hadn't visually caught up to yet, even though every timestamp involved was individually correct.

There's no way to make the recorder itself catch up instantly, so mitigate instead: after any cue whose action produces a **large** visual change (many new rows landing at once, not a single field or status flipping), add a deliberate settle pause — a plain `waitForTimeout` of a second or two — *after* confirming the new state is present, before treating the cue as done. This gives the recorder real wall-clock time to actually capture the new frame before the next narration is scheduled against it. A small, single-element change (a button's label changing, one status pill flipping) hasn't shown this lag — reserve the extra settle for genuinely heavy re-renders, not every action, or the video accumulates unnecessary dead time.

This also affects how you verify: a frame-check taken at *exactly* a heavy-render cue's computed global offset can still show the pre-render state even in a correctly-timed recording, simply because of this lag. Check a moment slightly *into* that cue's dwell, not its exact first instant, before concluding something is desynced.

## A real bug worth checking for before you conclude a menu "just isn't rendering in the recording"

If a click opens a menu/popover and Playwright reports it as `visible: true` with a normal bounding box, yet it never shows up in an actual screenshot or frame, don't assume it's a recording-script pacing issue before checking the DOM. A common real cause: an ancestor with `overflow-x: auto` (for horizontal scrolling) also computes `overflow-y: auto` — per the CSS overflow spec, setting only one axis to non-`visible` forces the other axis to `auto` as well, so a short/filtered table's wrapper can end up exactly tall enough to clip a popover that renders below the last row. This is a genuine product bug, not just a recording quirk — if you find it, fix the component (e.g. portal the popover to `document.body` with `position: fixed` coordinates from the trigger's real bounding rect, rather than `position: absolute` inside the clipping ancestor) rather than only working around it in the recording script, and ship the fix independent of the video.
