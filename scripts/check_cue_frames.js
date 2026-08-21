#!/usr/bin/env node
/**
 * Extract a verification frame at every cue's own timestamp, computed
 * directly from the real offsets files — never by hand. Step 8 of SKILL.md
 * requires checking every cue's global offset against the final video, not
 * a sample; doing that arithmetic by hand (adding preroll, remembering which
 * recording take a number came from, converting ms to seconds) is exactly
 * the kind of mistake that produces false "still broken" alarms partway
 * through a debugging session. Let this script do the arithmetic instead.
 *
 * Two modes:
 *
 * 1. Checking the RAW recording (or a raw/composited part clip) against
 *    `offsets.json` (cue id -> ms since "clean start") + `preroll.json`
 *    (`{ preRollMs }`):
 *      node check_cue_frames.js offsets.json clips/live/xxx.webm out/ \
 *        --preroll preroll.json
 *
 * 2. Checking the FINAL muxed video against `global_offsets.json` (cue id
 *    -> seconds into the final timeline, from compute_offsets.js):
 *      node check_cue_frames.js out/global_offsets.json clips/final.mp4 out/final_check/
 *
 * Options:
 *   --preroll <path>   preroll.json to add (raw mode only; omit for global_offsets.json)
 *   --unit ms|sec      unit of the offsets file's values (default: ms if --preroll given, else sec)
 *   --delta <seconds>  offset added before extracting (default 0.5 — checks slightly INTO a cue's
 *                       dwell rather than its exact first instant, since a heavy-render cue can still
 *                       show the pre-render state for a moment even when correctly timed; see
 *                       references/recording-technique.md's recorder-lag note)
 *   --cues c01,c02     only these cue ids (default: every key in the offsets file)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const [offsetsPath, videoPath, outDir] = positional;
if (!offsetsPath || !videoPath || !outDir) {
  console.error('Usage: node check_cue_frames.js <offsets.json> <video> <outDir> [--preroll <preroll.json>] [--unit ms|sec] [--delta 0.5] [--cues c01,c02]');
  process.exit(1);
}

function optionValue(name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

const prerollPath = optionValue('preroll');
const preRollMs = prerollPath ? JSON.parse(fs.readFileSync(prerollPath, 'utf8')).preRollMs : 0;
const unit = optionValue('unit') || (prerollPath ? 'ms' : 'sec');
const delta = parseFloat(optionValue('delta') || '0.5');
const cuesFilter = optionValue('cues')?.split(',');

const offsets = JSON.parse(fs.readFileSync(offsetsPath, 'utf8'));
const cueIds = cuesFilter || Object.keys(offsets);

fs.mkdirSync(outDir, { recursive: true });

console.log(`${cueIds.length} cue(s), unit=${unit}, preRollMs=${preRollMs}, delta=+${delta}s`);
for (const cue of cueIds) {
  if (!(cue in offsets)) {
    console.log(`  ${cue}: MISSING from offsets file`);
    continue;
  }
  const rawValue = offsets[cue];
  const offsetSec = unit === 'ms' ? rawValue / 1000 : rawValue;
  const t = (preRollMs / 1000) + offsetSec + delta;
  const safeName = cue.replace(/[:]/g, '_');
  const outPath = path.join(outDir, `${safeName}.png`);
  execFileSync('ffmpeg', ['-y', '-i', videoPath, '-ss', t.toFixed(3), '-frames:v', '1', outPath, '-loglevel', 'error']);
  console.log(`  ${cue}: t=${t.toFixed(3)}s -> ${outPath}`);
}
