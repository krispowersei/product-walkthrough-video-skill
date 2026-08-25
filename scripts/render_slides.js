#!/usr/bin/env node
/**
 * Render every slide this video needs (opening, contents [if multi-part],
 * one section slide per part [if multi-part], closing) to a screenshot, then
 * to a short silent mp4 clip at the duration slide_durations.json says it
 * should play for.
 *
 * Usage:
 *   node render_slides.js <script.json> <style.json> <slide_durations.json> <templatesDir> <outDir>
 *
 * style.json (built from what step 1 of SKILL.md resolved about the target
 * app — its own font/accent color, or the neutral fallback):
 *   {
 *     "canvasWidth": 1800, "canvasHeight": 1200, "fps": 25,
 *     "accentColor": "#6366f1",
 *     "fontFamily": "FKGrotesk, system-ui",   // a full CSS font-family list, not a bare name
 *     "fontFaceCss": ""   // real @font-face rules if the target app has its own licensed font files, else leave empty
 *   }
 *
 * `fps` MUST match the frame rate every other piece in the concat list is
 * encoded at (the recording, and every composited part clip) — see the
 * "render everything at one consistent frame rate" note in
 * references/compositing-pipeline.md. A slide rendered at a different fps
 * than the recording is a real, previously-hit bug: the concat step can
 * silently miscalculate durations/frame counts when mixing frame rates, even
 * with re-encoding, corrupting audio/video sync by several seconds with no
 * error and no obviously-wrong total duration.
 *
 * slide_durations.json comes from compute_offsets.js --slides-only (run
 * right after gen_audio.py, before any recording happens — see
 * references/compositing-pipeline.md).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [, , scriptPath, stylePath, durationsPath, templatesDir, outDir] = process.argv;
if (!scriptPath || !stylePath || !durationsPath || !templatesDir || !outDir) {
  console.error('Usage: node render_slides.js <script.json> <style.json> <slide_durations.json> <templatesDir> <outDir>');
  process.exit(1);
}

const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
const style = JSON.parse(fs.readFileSync(stylePath, 'utf8'));
const slideDurations = JSON.parse(fs.readFileSync(durationsPath, 'utf8'));

const parts = script.parts || [];
const multiPart = parts.length > 1;

const dynamicStyle = `
  ${style.fontFaceCss || ''}
  :root {
    --accent: ${style.accentColor || '#a3a3a3'};
    /* NOT quoted: wrapping the whole value turns a font stack like
       "FKGrotesk, system-ui" into one invalid quoted family name, and every
       slide silently falls back to a serif. style.fontFamily must therefore
       be a valid CSS font-family list, quoting individual names itself if
       any of them need it. */
    --font: ${style.fontFamily || 'system-ui'};
    --canvas-width: ${style.canvasWidth}px;
    --canvas-height: ${style.canvasHeight}px;
  }
`;

function dataFor(slideId) {
  if (slideId === 'opening') return script.title;
  if (slideId === 'contents') return { parts: parts.map((p) => ({ title: p.title })) };
  if (slideId.startsWith('section:')) {
    const partId = slideId.slice('section:'.length);
    const part = parts.find((p) => p.id === partId);
    if (!part) throw new Error(`No part "${partId}" in script.json`);
    return part;
  }
  if (slideId === 'closing') return { kicker: script.title?.kicker, bullets: script.closingBullets || [] };
  throw new Error(`Unknown slide id "${slideId}"`);
}

function templateFor(slideId) {
  if (slideId === 'opening') return 'opening.template.html';
  if (slideId === 'contents') return 'contents.template.html';
  if (slideId.startsWith('section:')) return 'section.template.html';
  if (slideId === 'closing') return 'closing.template.html';
  throw new Error(`Unknown slide id "${slideId}"`);
}

const slideIds = ['opening', ...(multiPart ? ['contents'] : []), ...(multiPart ? parts.map((p) => `section:${p.id}`) : []), 'closing'];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: style.canvasWidth, height: style.canvasHeight } });
  fs.mkdirSync(outDir, { recursive: true });

  for (const slideId of slideIds) {
    const templatePath = path.join(templatesDir, templateFor(slideId));
    const template = fs.readFileSync(templatePath, 'utf8');
    const html = template
      .replace('/*__DYNAMIC_STYLE__*/', dynamicStyle)
      .replace('"__DATA__"', JSON.stringify(dataFor(slideId)));

    const safeId = slideId.replace(':', '_');
    const htmlPath = path.join(outDir, `${safeId}.html`);
    const pngPath = path.join(outDir, `${safeId}.png`);
    const mp4Path = path.join(outDir, `${safeId}.mp4`);
    fs.writeFileSync(htmlPath, html);

    await page.goto('file://' + path.resolve(htmlPath));
    await page.waitForTimeout(200);
    await page.screenshot({ path: pngPath });

    const duration = slideDurations[slideId];
    if (duration == null) throw new Error(`No duration for slide "${slideId}" in slide_durations.json`);
    const fps = style.fps || 25;
    execFileSync('ffmpeg', [
      '-y', '-loop', '1', '-framerate', String(fps), '-t', String(duration), '-i', pngPath,
      '-r', String(fps), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4Path,
    ]);
    console.log(`${slideId}: ${duration.toFixed(2)}s -> ${mp4Path}`);
  }

  await browser.close();
})();
