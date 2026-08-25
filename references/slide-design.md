# Slide design and the narration-timing model

## Look

Title/contents/section/closing slides all share one visual language: a solid black background (never a gradient or a brand-color fill — that treatment is reserved for the *background behind the floating recording*, see `compositing-pipeline.md`, and mixing the two looks inconsistent), set in whichever font the target app already uses for its own UI (reuse its real `@font-face` declarations/font files if it has any; fall back to `system-ui` if it doesn't — never assume a specific licensed font belongs here). An accent color — a tinted kicker, a colored bullet dot, whatever the slide template uses for emphasis — should be the app's own inferred accent color (step 1 of `SKILL.md`) or a neutral gray if none was found.

Render every slide (via Playwright screenshotting a throwaway HTML page) at the **final output canvas size** — the recording's own resolution plus the compositing margin from `compositing-pipeline.md` — not the recording's native size. Rendering at final size from the start avoids a scaling step later, and keeps the slide's typography crisp.

`ffmpeg` in most environments has no `drawtext`/`libfreetype` support strong enough for real typography, so text must be rendered by the browser (an HTML page, screenshotted), never by ffmpeg directly.

## The four slide types

1. **Opening** — kicker / title / subtitle, pulled straight from `script.json`'s `title` object. Give the title real visual weight above the subtitle (a noticeably larger, bolder weight vs. a smaller gray subtitle) — a title and subtitle set at the same size and weight fails to read as a cover slide.
2. **Contents** *(only when `parts.length > 1`)* — lists every part's kicker/title as short lines of on-screen text, so a viewer can see the shape of what's coming. Skip this slide type entirely for a single-flow video.
3. **Section** *(one per part, only when there's more than one part)* — kicker ("Part N of M") + title, matching that part's entry in `script.json`.
4. **Closing** — a bulleted "what we covered" summary, built directly from `script.json`'s `closingBullets` (template-substituted at render time — don't hand-duplicate the list into the HTML separately from `script.json`, or the two can drift). Never more than 10 bullets; each no more than 5-6 words, naming an actual scenario shown in the video. If more than 10 things were shown, keep the most significant ones and drop the rest rather than shrinking text to fit everything.

## Narration timing model

This is the piece that changed from the original build of this pipeline, where every slide played in total silence for a fixed number of seconds. Now, every slide's on-screen duration is **derived from its own narration clip's real measured duration** (never a fixed guess), and narration starts almost immediately rather than after a long silent hold.

- **Opening slide:** the slide is visible from the very start of the video (t=0). Narration (`titleNarration`) begins **~1 second in** and reads a conversational paraphrase of the title + subtitle — not a verbatim reading of the on-screen text. Slide duration = `1.0s` lead-in + the narration clip's measured duration + `~0.5s` trailing buffer.
- **Contents slide** *(only if `parts.length > 1`)*: appears immediately after the opening slide ends. Narration (`contentsNarration`) is brief and explicitly does **not** enumerate every part out loud — it just flags that there's more than one (e.g. "This one's got three parts") — the on-screen list is what actually tells the viewer what they are. Slide duration = the narration clip's measured duration + `~1.5s` extra hold, since the viewer needs a moment to actually read the list after the voice stops.
- **Section slide** *(one per part, only if `parts.length > 1`)*: `~0.4s` lead pause (visible, silent) → the part's `narrationIntro` plays → `~0.4s` trail pause → cut into that part's recording. The intro doesn't need to match the on-screen title word-for-word; it's a short, conversational lead-in to what's about to happen, not a reading of the slide. Slide duration = `0.4s` + the narration clip's measured duration + `0.4s`.
- **Held beat before every slide cut (unchanged from prior practice, composes with the above):** don't cut from a just-finished action straight into the next slide — hold the last frame of the preceding recorded segment for about a second first (a `tpad` freeze-tail applied to the *end* of that segment, not a separate blank pause; see `compositing-pipeline.md`), so the viewer gets a beat to register that the previous thing actually finished before the slide interrupts.
- **Closing slide:** unchanged — keep any closing narration line short, and pad the slide a couple of extra seconds past where the narration ends, since the viewer needs real time to read a bulleted list, not just hear about it.

Every one of these durations is computed from a real `ffprobe`'d clip, the same discipline the action-cue timing already follows (`narration-voice.md`) — never hardcode a number here without measuring the actual generated audio for that specific script.
