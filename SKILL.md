---
name: product-walkthrough-video
description: Use when a Grok Bot agent must record a narrated walkthrough/demo video of a real web app (e.g. Discord web + Trello) by driving a browser with Playwright, adding an edge-tts voiceover, synthetic cursor and title/section slides, and compositing to one MP4 with ffmpeg.
---
# Product walkthrough video (Grok Bot wrapper)
Fork of gaurabhmathure/product-walkthrough-video-skill (MIT). Upstream procedure is unchanged in `SKILL.upstream.md` — read it fully before step 3.

**Box path:** `/workspace/demo-studio/tools/product-walkthrough-video-skill`
**Python venv (edge-tts):** `/workspace/demo-studio/tools/.venv`

## Steps
1. Setup: `scripts/grokbot_setup.sh` (installs playwright+chromium, edge-tts).
2. Make a scratch work dir (never inside a project repo), e.g. `/workspace/demo-studio/work/<slug>`; copy `scripts/ slides/ bg/` into it.
3. Write `script.json` (title, parts, cues with narration text) per SKILL.upstream.md §1–3.
4. Audio: `/workspace/demo-studio/tools/.venv/bin/python scripts/gen_audio.py script.json .` → `audio/*.mp3`, `durations.json`.
5. Record: copy `scripts/record.template.js` to `record.js`, fill in URL, auth (use a saved `storageState` for logged-in sites), and one Playwright action per cue id; `node record.js` → raw `.webm`.
6. Slides/bg: `node render_slides.js`, `node render_bg_assets.js`.
7. Composite + mix per `references/compositing-pipeline.md` (`compute_offsets.js`, `mix_audio.py`, ffmpeg) → final `.mp4`.
8. Verify: `node check_cue_frames.js` contact sheets; check every cue, not just total duration.

## Inputs / outputs
- In: app URL(s), login state, flow description, voice (edge-tts voice id).
- Out: `<workdir>/*.mp4` (narrated), plus `durations.json`, raw webm, slide PNGs.
