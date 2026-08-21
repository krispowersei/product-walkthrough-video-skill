# Compositing pipeline

## Overall shape

1. Record the whole thing as **one continuous Playwright take** spanning every part (not one recording per part) — parts get split apart afterward, in post.
2. Split the raw take into per-part clips at the part-boundary cue offsets.
3. Add a freeze-tail to the end of each part's clip.
4. Composite each part's clip onto a floating-window-on-gradient-background canvas.
5. Render every slide (opening/contents/section×N/closing) to short silent clips at the same canvas size.
6. Concatenate: opening → contents (if any) → section₁ → part₁ → section₂ → part₂ → … → closing.
7. Compute where every narration clip lands in that final timeline, mix them into one audio track, and mux it onto the concatenated video.

## One frame rate, everywhere, set explicitly

**Pick one frame rate (25fps is a safe default) and pass it explicitly at every single encode in the pipeline** — the raw-take split, the freeze-tail, the compositing overlay, and every rendered slide. Never let any of these "inherit" a rate from their input by omitting `-r`/`-framerate`.

This is a real bug that happened, not a hypothetical: slides were rendered at 30fps (`render_slides.js`'s own default) while the recording — and therefore every composited part clip, which just carries the recording's native rate forward — was 25fps. Every individual piece still measured the *correct total duration* under `ffprobe`, so nothing looked wrong file-by-file. But concatenating 25fps and 30fps pieces together while re-encoding to one output rate silently corrupted **internal** timing on the 25fps segments — narration and picture drifted out of sync by several seconds, worse than un-fixed `-c copy` stream discontinuities, and in a way that only showed up when frame-checking *inside* a segment (a boundary check at a segment's very start still looked fine). A duration-sum check does not catch this either, for the same reason it doesn't catch the concat-timestamp bug above: the corruption is internal to a segment's timeline, not a difference in the total.

Fix: `-r <fps>` (or `-framerate <fps>` for the image-to-video slide renders) on the split, the `tpad` step, the compositing `overlay` output, and the slide renders — all the same number. Then the final concat re-encode has nothing to reconcile.

## Splitting the raw take

The recording script (`record.template.js`) writes two files as it runs: `offsets.json` (each cue id → milliseconds since the "clean start" moment, i.e. after any chrome dismissal) and `preroll.json` (`{ preRollMs }`, the gap between context/page creation and that clean-start moment). To find the absolute timestamp of a part boundary in the raw webm, add `preRollMs` back to the local offset of that part's first cue.

**Always recompute split points live from that run's own `offsets.json`/`preroll.json` — never reuse timestamps from a previous recording.** Any change to narration text shifts every cue's duration and therefore every offset after it; a stale split point can land mid-cue. As a sanity check every time: the split clips' durations, plus every slide's duration, should sum to exactly the final concatenated video's total duration — verify this explicitly before moving on, don't just assume it.

Use accurate (post-`-i`) seeking for the split cuts, not fast/keyframe seeking — see "Seeking accuracy" below.

```
ffmpeg -i raw.webm -ss <start> -to <end> -r <fps> -c:v libx264 -pix_fmt yuv420p raw_part.mp4
```

## Freeze-tail

Apply `tpad=stop_mode=clone:stop_duration=1` to the end of each part's raw clip (after splitting, before compositing) — this holds the last frame for an extra second, so the cut into the next slide has a beat of stillness rather than feeling abrupt. This is separate from, and happens before, the slide-timing leads/pauses described in `slide-design.md`.

```
ffmpeg -i raw_part.mp4 -vf "tpad=stop_mode=clone:stop_duration=1" -r <fps> -c:v libx264 -pix_fmt yuv420p padded_part.mp4
```

## Floating-window-on-gradient-background compositing

Play the actual recording as a rounded-corner "browser window" floating on a soft background texture, with a modest margin — not edge-to-edge. Mechanically:

- Pick a canvas size = recording size + 2× margin (e.g. a 1600×1000 recording with a 100px margin on every side → an 1800×1200 canvas).
- Render an alpha-mask PNG at the recording's own size: a solid white rounded-rectangle on a transparent background (an HTML page with `border-radius`, screenshotted via Playwright with `omitBackground: true` so the result is a true RGBA PNG, not a flattened opaque one).
- Render a shadow-layer PNG at the *full canvas* size: a dark rounded-rectangle positioned at the same `(margin, margin)` offset the recording will sit at, with a soft `box-shadow`, on a transparent background (same `omitBackground: true` technique).
- Source a background texture image (a soft, non-distracting gradient or texture — Unsplash's gradient/texture collections are a reasonable source; fetch a few candidates and compare rather than committing to the first one) sized to the full canvas.
- Composite with ffmpeg: `alphamerge` the recording against the mask (rounds its corners) → `overlay` the background and shadow layers together → `overlay` the rounded recording on top of that, at the `(margin, margin)` offset.

```
ffmpeg -i part_padded.mp4 -i background.jpg -i shadow.png -i mask.png -filter_complex "
  [0:v][3:v]alphamerge[rounded];
  [1:v][2:v]overlay=0:0[bg_shadow];
  [bg_shadow][rounded]overlay=<margin>:<margin>
" -r <fps> -c:v libx264 -pix_fmt yuv420p composited_part.mp4
```

(`-r <fps>` here is the explicit-everywhere frame rate from the section above — don't omit it.)

This treatment applies only to the live-recording segments. Title/contents/section/closing slides stay full-bleed solid black (`slide-design.md`) — don't put slides on the gradient background too, the two looks are meant to read as distinct ("this is the recording" vs. "this is a title card").

## Concatenation

**Re-encode at the concat step — don't stream-copy.** It's tempting to normalize every piece to the same codec/resolution/pixel format and then use the concat demuxer's fast `-c copy` path:

```
ffmpeg -f concat -safe 0 -i concat_list.txt -c copy video_silent.mp4   # DON'T — see below
```

This looks correct (matching codec/resolution/pixel format is necessary for stream-copy concat to not outright fail) and the resulting file's *total* duration will even come out right. But it's not sufficient: every piece here was produced by a **separate ffmpeg invocation**, each starting its own presentation timestamps near zero. Stream-copying just concatenates the encoded packets with their original timestamps — it doesn't renumber them into one continuous timeline. The result plays back with a real, reproducible sync bug: content after a concat boundary can appear several seconds earlier or later than intended, even though `ffprobe`'s reported total duration looks exactly right and a first-glance sanity check ("does the file open and play") shows nothing wrong. This is exactly the kind of bug a duration-sum check alone will miss — it's a **timestamp** problem, not a duration problem.

Fix it by re-encoding at the concat step instead:

```
ffmpeg -f concat -safe 0 -i concat_list.txt -r 25 -c:v libx264 -pix_fmt yuv420p -vsync cfr video_silent.mp4
```

This forces ffmpeg to decode every input and re-encode into one continuous, monotonically-timestamped output — slower than stream copy, but for a video this length the difference is seconds, not minutes, and it's the only way to guarantee segment boundaries land where the concat list says they should. Verify this isn't silently regressing by frame-checking a moment well inside a *later* segment (not just the first one) against what the narration at that timestamp is supposed to describe — a stream-copy version can look perfectly fine at the very start and only reveal the drift several segments in.

`concat_list.txt` lists every piece, one per line (`file 'opening.mp4'`, …), in final playback order.

## Computing where narration lands (`compute_offsets.js`)

The original build of this pipeline required hand-reconciling a `global_offsets.json` (each cue's start time in the *final* timeline) from the raw-recording-relative `offsets.json` plus the concat order — a manual, error-prone step. Don't repeat that: `scripts/compute_offsets.js` derives it automatically. Give it, in order: each piece's real measured duration (every slide clip's, and every part clip's, including its freeze-tail) and, for narration that plays *during* the recording (the action cues), each cue's local offset within its part. It walks the concat order accumulating a running total, and for each narration clip — title/contents/section-intro/action-cue alike — computes `runningTotalBeforeThisPiece + thatClip'sOwnLeadOffset` as its absolute start time in the final video. Run this fresh every time any piece's duration changes; never hand-edit the output.

## Mixing narration (`mix_audio.py`)

Build one `adelay=<ms>|<ms>` filter per narration clip (using the `global_offsets.json` this run produced), feed all of them into a single `amix`, then `apad` the mixed result out to the final video's exact total duration (otherwise the audio track ends at the last cue instead of running to the end of the closing slide).

**Critical flag: `normalize=0` on the `amix` filter.** `amix`'s default loudness normalization divides every input's volume by the total number of inputs — appropriate when mixing genuinely simultaneous sources, but this track is a sequence of non-overlapping cues, and the default silently makes a script with 20-30 cues nearly inaudible (it can look like "the recording has a long silent gap" in a `silencedetect` pass, when actually every cue's volume was just divided by the input count). Always pass `normalize=0` for a sequential-cue narration track.

## Seeking accuracy

`-ss` **before** `-i` is fast/keyframe-snapped seeking — fine for a rough cut, but on a capture with sparse keyframes it can land a second or more off from where you asked. `-ss` **after** `-i` is accurate/decoded seeking — use it for anything that has to be frame-exact: verification frame-grabs, and the split-point cuts themselves. A `silencedetect` pass only ever compares the audio track to itself, so it will report "clean" even if the whole video is seconds out of sync with its own narration — the only real check for that is reading back a frame at a cue's timestamp and confirming the picture matches the words being said.

## Playwright recording-start gotcha

`recordVideo` starts capturing when the page begins rendering, not when the browser context object is created — a wall-clock "pre-roll" measured from `newContext()` overshoots by however long browser startup happened to take (this is not a fixed number; it varies run to run). Derive the real pre-roll from the recording itself, or from an explicit clean-start timestamp written during the recording (see `preroll.json` above), not from a `Date.now()` taken before the browser even launched.
