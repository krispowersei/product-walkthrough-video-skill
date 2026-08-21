#!/usr/bin/env node
/**
 * Derive slide durations and the final narration timeline automatically,
 * instead of hand-reconciling them (which is what the original build of
 * this pipeline required, and which drifts the moment any narration text
 * changes).
 *
 * Usage:
 *   node compute_offsets.js <script.json> <durations.json> <offsets.json> <pieces.json> <outDir> [--slides-only]
 *
 * Run once with --slides-only right after gen_audio.py, before recording —
 * this gives you slide_durations.json, which tells you exactly how long to
 * render each slide clip (`ffmpeg -t <duration>`) before you've composited
 * any part clips yet.
 *
 * Run again (without --slides-only) once every part has been split, given
 * its freeze-tail, and composited onto the gradient-background canvas — this
 * time it also ffprobes each real part clip file and produces
 * global_offsets.json (for mix_audio.py) and concat_list.txt (for the
 * concat-demuxer step), on top of slide_durations.json.
 *
 * pieces.json shape (the concat order, authored once per project):
 *   [
 *     { "type": "slide", "id": "opening" },
 *     { "type": "slide", "id": "contents" },        // omit if parts.length <= 1
 *     { "type": "slide", "id": "section:part1" },   // omit if parts.length <= 1
 *     { "type": "part",  "id": "part1", "file": "clips/composited_part1.mp4" },
 *     { "type": "slide", "id": "section:part2" },
 *     { "type": "part",  "id": "part2", "file": "clips/composited_part2.mp4" },
 *     { "type": "slide", "id": "closing" }
 *   ]
 * For a single-flow video (no parts), this collapses to just
 * [{"type":"slide","id":"opening"}, {"type":"part","id":"main","file":"..."}, {"type":"slide","id":"closing"}].
 *
 * Slide timing constants below implement the narration-timing model in
 * references/slide-design.md — see that doc for the reasoning, not just the
 * numbers.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OPENING_LEAD_IN_SEC = 1.0;
const OPENING_TRAIL_SEC = 0.5;
const CONTENTS_HOLD_SEC = 1.5;
const SECTION_LEAD_SEC = 0.4;
const SECTION_TRAIL_SEC = 0.4;
const CLOSING_DEFAULT_SEC = 6.0; // no narration-timing change requested for closing; tune per project

const [, , scriptPath, durationsPath, offsetsPath, piecesPath, outDir, ...flags] = process.argv;
const slidesOnly = flags.includes('--slides-only');

if (!scriptPath || !durationsPath || !offsetsPath || !piecesPath || !outDir) {
  console.error('Usage: node compute_offsets.js <script.json> <durations.json> <offsets.json> <pieces.json> <outDir> [--slides-only]');
  process.exit(1);
}

const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
const durations = JSON.parse(fs.readFileSync(durationsPath, 'utf8'));
const cueOffsetsMs = JSON.parse(fs.readFileSync(offsetsPath, 'utf8'));
const pieces = JSON.parse(fs.readFileSync(piecesPath, 'utf8'));

const parts = script.parts || [];
const multiPart = parts.length > 1;

function ffprobeDurationSec(filePath) {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ], { encoding: 'utf8' });
  return parseFloat(out.trim());
}

// --- compute each slide's duration + its own narration clip's local offset ---
function slideSpec(id) {
  if (id === 'opening') {
    return {
      duration: OPENING_LEAD_IN_SEC + (durations.title || 0) + OPENING_TRAIL_SEC,
      narration: durations.title != null ? [{ id: 'title', localOffsetSec: OPENING_LEAD_IN_SEC }] : [],
    };
  }
  if (id === 'contents') {
    if (!multiPart) throw new Error('pieces.json has a "contents" slide but script.json has <=1 parts');
    return {
      duration: (durations.contents || 0) + CONTENTS_HOLD_SEC,
      narration: durations.contents != null ? [{ id: 'contents', localOffsetSec: 0 }] : [],
    };
  }
  if (id.startsWith('section:')) {
    const partId = id.slice('section:'.length);
    const narrId = `part:${partId}`;
    return {
      duration: SECTION_LEAD_SEC + (durations[narrId] || 0) + SECTION_TRAIL_SEC,
      narration: durations[narrId] != null ? [{ id: narrId, localOffsetSec: SECTION_LEAD_SEC }] : [],
    };
  }
  if (id === 'closing') {
    return { duration: CLOSING_DEFAULT_SEC, narration: [] };
  }
  throw new Error(`Unknown slide id "${id}" in pieces.json`);
}

const slideDurations = {};
const resolvedPieces = pieces.map((piece) => {
  if (piece.type === 'slide') {
    const spec = slideSpec(piece.id);
    slideDurations[piece.id] = spec.duration;
    return { ...piece, duration: spec.duration, narration: spec.narration };
  }
  if (piece.type === 'part') {
    if (slidesOnly) return { ...piece, duration: null, narration: [] };
    const duration = ffprobeDurationSec(piece.file);
    // In a multi-part video, only this part's own cues play during this
    // clip, and the split cut for it landed exactly at its first cue — so
    // that cue's raw offset is the zero point for everything in this clip.
    // In a single-flow video (no parts declared) every cue belongs to the
    // one clip, and its zero point is simply the first cue overall.
    const partCues = multiPart
      ? (script.cues || []).filter((c) => c.part === piece.id)
      : (script.cues || []);
    const baseMs = partCues.length ? cueOffsetsMs[partCues[0].id] : 0;
    const narration = partCues.map((c) => ({
      id: c.id,
      localOffsetSec: (cueOffsetsMs[c.id] - baseMs) / 1000,
    }));
    return { ...piece, duration, narration };
  }
  throw new Error(`Unknown piece type "${piece.type}"`);
});

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'slide_durations.json'), JSON.stringify(slideDurations, null, 2));
console.log('wrote slide_durations.json:', slideDurations);

if (slidesOnly) {
  console.log('\n--slides-only: stopping here. Render slide clips at these durations, split/tpad/composite the');
  console.log('part clips, then re-run without --slides-only to get global_offsets.json + concat_list.txt.');
  process.exit(0);
}

// --- walk the concat order, accumulating absolute narration offsets ---
const globalOffsets = {};
let runningTotalSec = 0;
for (const piece of resolvedPieces) {
  for (const n of piece.narration) {
    globalOffsets[n.id] = runningTotalSec + n.localOffsetSec;
  }
  runningTotalSec += piece.duration;
}

fs.writeFileSync(path.join(outDir, 'global_offsets.json'), JSON.stringify(globalOffsets, null, 2));

const concatLines = resolvedPieces.map((p) => `file '${p.file || `${p.id.replace(':', '_')}.mp4`}'`);
fs.writeFileSync(path.join(outDir, 'concat_list.txt'), concatLines.join('\n') + '\n');

console.log('wrote global_offsets.json:', globalOffsets);
console.log('wrote concat_list.txt');
console.log(`total final video duration: ${runningTotalSec.toFixed(2)}s`);
console.log('(pass this number to mix_audio.py as --total-duration, and double check it against');
console.log(' the final concatenated video\'s own ffprobe duration once video_silent.mp4 exists)');
