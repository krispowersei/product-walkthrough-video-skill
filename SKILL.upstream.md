---
name: product-walkthrough-video
description: Use when the user asks to make a "demo video", "walkthrough video", "product tour video", "screen-capture demo", or a "narrated recording" of a web app or prototype — produces a fully narrated, professionally paced video of one or more real flows in the app, with a synthetic cursor, a floating-window-on-gradient-background treatment, and title/section/closing slides, entirely from a headless Playwright recording plus an AI voiceover. Works on any web app; never assumes a specific brand, font, or color.
version: 1.2.0
---

Produces a narrated demo video of a real web app by driving it headlessly with Playwright, generating an AI voiceover with `edge-tts`, and compositing everything with `ffmpeg` into one finished `.mp4`. Every step below is written to be app-agnostic — it never assumes a specific brand, color, font, or DOM convention. Wherever a value would otherwise need hardcoding (a project's name, a font, an accent color, a chrome-bypass mechanism), this skill either infers it from the target app's own code or asks.

This is a heavier procedure than most skills: expect to spend real back-and-forth on step 1 before writing a line of code, and expect several passes of steps 6–8 (record → composite → verify) before the pacing feels right. Don't shortcut step 1 by guessing — a wrong guess about branding or app structure compounds through every later step.

## 1. Scope it — infer first, then ask

This skill is not written for any one industry — nothing here assumes enterprise SaaS, a dashboard, or any other specific vertical. Everything below, including the app's actual business domain and who it's for, gets inferred from that specific app's own code or confirmed with the user — never assumed from what a "typical" demo in some vertical looks like.

Try to infer the product identity before asking:
- Product name + one-line description: check `package.json` (`name`/`description`), `README.md`'s heading, a `CLAUDE.md`/`AGENTS.md` identity block, `index.html`'s `<title>`, `.vercel/project.json`.
- Accent color: look for CSS custom properties named like `--primary`/`--brand`/`--accent`/`--color-primary` in the app's global stylesheet, or a Tailwind config's `theme.colors`. If you can't find one, fall back to a neutral gray-on-black look — never invent a brand color.
- Display font: look for existing `@font-face` rules or a font stack already used by the app's own UI. Reuse those exact files/declarations for the slide HTML. If none exist, fall back to `system-ui` — never assume a specific licensed font.
- **Business domain, target customer, and core value prop.** Read the README/PRD-style docs, the data models (the entities and fields an app stores reveal who it's for — a `patientId`/`dosage` pair says something very different from a `cartId`/`sku` pair), and the UI's own copy (headings, empty states, onboarding text, any "who this is for" language). Figure out: what kind of user opens this app, and what job are they actually trying to get done? This determines the narrative's *frame*, not just its vocabulary — a consumer fitness app's demo centers on the individual's own goal ("see how your week's runs add up"), a marketplace's centers on a transaction between two sides, an internal ops tool's centers on a role's responsibility to an organization ("catch this before it becomes a support ticket"). Getting this wrong produces a demo that's technically accurate but reads as generic screen-clicking instead of a story that person would actually recognize themselves in.

Present what you inferred back to the user via `AskUserQuestion` (or a quick confirmation in conversation) rather than silently running with a guess — this includes the business domain/customer/value-prop inference, not just branding. If the app's code doesn't give you enough to infer that with real confidence (a thin README, no self-describing data model, an internal tool with no explanatory copy anywhere), don't guess a plausible-sounding vertical — ask the user directly what the app is, who uses it, and what they use it for. Everything in step 3's narrative script is downstream of getting this right. Then ask/confirm what inference can't tell you:
- Which flows should the video show, and in what order? If there's more than one distinct flow, group them into named **parts** (e.g. "Part 1: bulk import", "Part 2: single-item entry") — a video with only one flow gets no parts, and skips the section/contents slides described below entirely.
- What's the local dev URL to record against?
- Does the app have any prototype-only chrome that must never appear on screen or be mentioned in narration — a password/access gate, an onboarding or "guided tour" modal, a floating dev/debug toolbar? For each one found, figure out (read the app's own code, don't guess) exactly how it's dismissed or bypassed — a flag it checks in `sessionStorage`/`localStorage`, a close button, an `Escape` handler. This app's actual bypass mechanism is almost certainly different from any other app's; find this app's, every time.
- Where should the finished file go, and what should it be called? Default to `<repo>/Demo-Videos/<inferred project name> demo-v<n> - <ddmmyyyy>.mp4` (see `references/naming-and-output.md`) — list existing files in that folder to pick the next version number, and confirm the inferred project name rather than assuming it matches the local folder name (they often drift).

## 2. Set up a scratch working directory

Work in a scratch/temp directory, never inside the project repo itself — none of this pipeline's intermediate files (raw recordings, audio clips, slide PNGs) belong in git history. Copy this skill's `scripts/`, `slides/`, `bg/` folders into it, then fill in the placeholders each template calls out (font declarations, accent color, canvas size, app URL) using what step 1 resolved.

## 3. Author `script.json`

Follow `references/script-schema.md` for the exact shape. This is the single source of truth for every piece of narration text, the part structure, and the closing summary — every later script reads from it, nothing duplicates its text elsewhere (a real gap in the original build: the closing slide's bullet list was hand-copied into HTML separately from the script and could drift out of sync — don't repeat that here).

Shape the video before writing a line of it, following `references/narrative-arc.md` — how to split parts, and the explain-once-then-execute structure that the default pacing depends on. Then write the narration copy itself following `references/narration-voice.md` — tone, the measured words-per-minute target, what to narrate, what never to narrate, and TTS-specific pronunciation gotchas. Ground every line in the business domain/customer/value-prop confirmed in step 1 — narrate what that specific user is trying to accomplish and why a given screen matters to them, not just what button was clicked. The same click ("open this record's detail view") gets described differently for a nurse checking a patient's chart than for a warehouse manager checking a shipment, even though the UI action is identical.

## 4. Generate narration audio

Run `scripts/gen_audio.py` against `script.json`. It calls `edge-tts` for every piece of narration text — the title narration, the contents narration (if there's more than one part), each part's intro line, and every action cue — and immediately `ffprobe`s each resulting clip for its real duration, writing `durations.json`. Nothing downstream ever guesses a duration; everything is driven off this file.

## 5. Render the slides

Run `scripts/render_slides.js` to screenshot the HTML templates in `slides/` (opening, contents [only if there's more than one part], one section slide per part, closing) at the video's final output canvas size (recording size + the compositing margin from step 7 — render slides at the *final* size so nothing needs scaling later). `references/slide-design.md` covers the look and — this is the behavior change from the original build — the new narration-timing model that sizes each slide's on-screen duration from its own narration clip's real measured length, not a fixed number of seconds.

## 6. Record

Copy `scripts/record.template.js` into your working directory and fill in the app-specific parts: the local URL, the chrome-bypass mechanism from step 1, and one Playwright action (or short sequence of them) per cue, keyed by cue id. Everything else in the template — the synthetic cursor overlay, the `cue()` pacing driver, the typing/pasting helpers — is ready to use as-is.

**Put each action in the right cue phase.** `during` runs the action *while* its narration plays and is where most actions belong; `post` is for the click that advances the screen; `pre` is for settling only. This is what makes the narration track the mouse rather than bracket it.

Follow `references/recording-technique.md` for the phase table and the underlying rules (every click gets narration and a visible cursor pulse; type, don't magically fill, anything a user would actually type; a menu opening and a menu item being chosen are always two separate cues; hide chrome by matching its unique text/structure, never by matching a computed style value that some real UI element might share).

Record the whole thing as one continuous take spanning every part — parts get split apart from this single recording in the next step, not recorded separately.

## 7. Post-process and composite

Follow `references/compositing-pipeline.md` end to end:
1. Split the raw take into one clip per part, at the part-boundary cue offsets — always recomputed live from that run's own `offsets.json`/`preroll.json`, never reused from an earlier run (cue timings shift the moment any narration text changes).
2. Add a 1-second freeze-tail (`tpad`) to the end of each part's clip, so the cut into the next slide isn't abrupt.
3. Composite each part's clip onto the floating-window-on-gradient-background canvas (rounded corners via an alpha mask, a soft drop shadow, centered on a background texture).
4. Run `scripts/compute_offsets.js` to derive `global_offsets.json` automatically from the final concat order and every piece's real measured duration — this replaces what had to be hand-reconciled in the original build.
5. Mix all narration clips into one track (`scripts/mix_audio.py` — it takes the total duration as a *number of seconds*, so pass `video_silent.mp4`'s own ffprobed duration, not the file) and mux it onto the concatenated, silent video.

## 8. Verify

Don't trust a clean exit code. Check:
- `ffmpeg silencedetect` on the final audio — confirms speech lands where the script expects it to, with no unexpectedly long silent stretch (a sign the audio mix silently dropped volume).
- Duration reconciliation: the sum of every piece listed in the concat order should equal the final file's measured duration, exactly. **This check alone is not sufficient** — both known sync bugs in this pipeline's history (a concat-timestamp bug, and a frame-rate mismatch between slides and the recording — see `references/compositing-pipeline.md`) left the total duration looking completely correct while the *internal* timing of a segment was badly wrong. A clean duration sum tells you nothing about whether content lands on the right side of any given cue boundary.
- **Narration against the screen's actual fields, not just its variable values.** `narration-voice.md` warns about quoting a value that varies between runs. A separate, easier miss: narrating a *field that isn't rendered on that particular screen*. A line describing rows "grouped by supplier" survived review because the grouping was true of the data — but the table on screen had only SKU / Quantity / Location columns, so it named something the viewer couldn't see. For every cue that mentions a field, confirm that field is actually on that screen.
- Frame-checks at **every single cue's own global offset**, not a sample of a few — check that what's on screen at that exact timestamp is what that cue's narration is describing. A spot-check of "the first cue, a slide boundary, and a couple of interesting moments" has already once missed a real, severe desync sitting in an unchecked middle stretch of a part (right where a file upload and an eligibility check happened back to back) while the checked moments on either side of it looked fine. Use `scripts/check_cue_frames.js` to extract one frame per cue directly from `global_offsets.json` (or, for a raw/composited clip before the final mux, from `offsets.json` + `preroll.json`) — **compute every timestamp with that script, never by hand.**

  "Check every cue" needs a method, or it silently degrades back into spot-checking whichever frames are convenient. Downscale each frame (~760px wide) and tile them six-up into contact sheets with ffmpeg's `xstack`, so forty-odd cues are a handful of images you can actually read rather than a folder nobody opens. Note that `drawtext` is unavailable in most environments here (same limitation as the slides), so identify frames by their position in a known batch order rather than burning labels in. Manually adding preroll, converting ms to seconds, or keeping track of which recording take a number came from across a long debugging session is exactly how false "still broken" alarms happen — several in this pipeline's own history turned out to be arithmetic mistakes, not real bugs, once the offsets were computed by script instead of by eye.

## 9. Deliver

Save to the path agreed in step 1, applying the versioning rule in `references/naming-and-output.md` — a re-record never overwrites the previous file in place; a version found to be factually wrong gets deleted (not renumbered).

## 10. Log it

If the target repo keeps a running project log (a `projectlog.md` or equivalent), add an entry in whatever format that log already uses — what the video covers, what changed if this was a revision, what was verified.
