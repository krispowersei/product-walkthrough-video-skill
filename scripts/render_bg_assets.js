#!/usr/bin/env node
/**
 * Render the two transparent-background PNGs the floating-window compositing
 * step needs (see references/compositing-pipeline.md):
 *   - mask.png   — a solid rounded-rect at the recording's own size, used to
 *                  round the recording's corners via ffmpeg's `alphamerge`.
 *   - shadow.png — a soft drop-shadow at the full canvas size, positioned at
 *                  the same offset the recording will sit at.
 *
 * Usage:
 *   node render_bg_assets.js <recordingWidth> <recordingHeight> <margin> <radius> <templatesDir> <outDir>
 *
 * canvasWidth/canvasHeight = recordingWidth/recordingHeight + 2*margin — the
 * compositing step centers the recording in that canvas.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [, , recW, recH, margin, radius, templatesDir, outDir, accent] = process.argv;
if (!recW || !recH || !margin || !radius || !templatesDir || !outDir) {
  console.error('Usage: node render_bg_assets.js <recordingWidth> <recordingHeight> <margin> <radius> <templatesDir> <outDir> [accentHex]');
  process.exit(1);
}
// Neutral slate when the app has no accent of its own, matching the
// "never invent a brand color" rule in SKILL.md step 1.
const ACCENT = accent || '#5a5a72';
const RECORDING_WIDTH = Number(recW);
const RECORDING_HEIGHT = Number(recH);
const MARGIN = Number(margin);
const RADIUS = Number(radius);
const CANVAS_WIDTH = RECORDING_WIDTH + 2 * MARGIN;
const CANVAS_HEIGHT = RECORDING_HEIGHT + 2 * MARGIN;

// The backdrop's three gradient tints are derived from the app's accent
// rather than hardcoded, so the canvas behind the recording belongs to the
// same product. Mixed toward a dark base so a bright UI still reads on top.
function mixToward(hex, targetHex, amount) {
  const parse = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = parse(hex);
  const [tr, tg, tb] = parse(targetHex);
  const mix = (a, t) => Math.round(a + (t - a) * amount);
  return '#' + [mix(r, tr), mix(g, tg), mix(b, tb)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function fill(template) {
  return template
    .replaceAll('__ACCENT_DEEP__', mixToward(ACCENT, '#000010', 0.62))
    .replaceAll('__ACCENT_SOFT__', mixToward(ACCENT, '#100018', 0.5))
    .replaceAll('__ACCENT_COOL__', mixToward(ACCENT, '#001030', 0.72))
    .replaceAll('__RECORDING_WIDTH__', RECORDING_WIDTH)
    .replaceAll('__RECORDING_HEIGHT__', RECORDING_HEIGHT)
    .replaceAll('__CANVAS_WIDTH__', CANVAS_WIDTH)
    .replaceAll('__CANVAS_HEIGHT__', CANVAS_HEIGHT)
    .replaceAll('__MARGIN__', MARGIN)
    .replaceAll('__RADIUS__', RADIUS);
}

(async () => {
  const browser = await chromium.launch();
  fs.mkdirSync(outDir, { recursive: true });

  const maskHtml = fill(fs.readFileSync(path.join(templatesDir, 'mask.template.html'), 'utf8'));
  const maskHtmlPath = path.join(outDir, 'mask.html');
  fs.writeFileSync(maskHtmlPath, maskHtml);
  const page1 = await browser.newPage({ viewport: { width: RECORDING_WIDTH, height: RECORDING_HEIGHT } });
  await page1.goto('file://' + path.resolve(maskHtmlPath));
  await page1.waitForTimeout(150);
  await page1.screenshot({ path: path.join(outDir, 'mask.png'), omitBackground: true });

  const shadowHtml = fill(fs.readFileSync(path.join(templatesDir, 'shadow.template.html'), 'utf8'));
  const shadowHtmlPath = path.join(outDir, 'shadow.html');
  fs.writeFileSync(shadowHtmlPath, shadowHtml);
  const page2 = await browser.newPage({ viewport: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } });
  await page2.goto('file://' + path.resolve(shadowHtmlPath));
  await page2.waitForTimeout(150);
  await page2.screenshot({ path: path.join(outDir, 'shadow.png'), omitBackground: true });

  const backdropHtml = fill(fs.readFileSync(path.join(templatesDir, 'backdrop.template.html'), 'utf8'));
  const backdropHtmlPath = path.join(outDir, 'backdrop.html');
  fs.writeFileSync(backdropHtmlPath, backdropHtml);
  const page3 = await browser.newPage({ viewport: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } });
  await page3.goto('file://' + path.resolve(backdropHtmlPath));
  await page3.waitForTimeout(150);
  await page3.screenshot({ path: path.join(outDir, 'background.png') });

  await browser.close();
  console.log(`canvas ${CANVAS_WIDTH}x${CANVAS_HEIGHT}, recording centered with a ${MARGIN}px margin -> ${outDir}`);
  console.log(`wrote mask.png, shadow.png, background.png (accent ${ACCENT})`);
})();
