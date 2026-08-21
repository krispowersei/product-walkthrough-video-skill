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

const [, , recW, recH, margin, radius, templatesDir, outDir] = process.argv;
if (!recW || !recH || !margin || !radius || !templatesDir || !outDir) {
  console.error('Usage: node render_bg_assets.js <recordingWidth> <recordingHeight> <margin> <radius> <templatesDir> <outDir>');
  process.exit(1);
}
const RECORDING_WIDTH = Number(recW);
const RECORDING_HEIGHT = Number(recH);
const MARGIN = Number(margin);
const RADIUS = Number(radius);
const CANVAS_WIDTH = RECORDING_WIDTH + 2 * MARGIN;
const CANVAS_HEIGHT = RECORDING_HEIGHT + 2 * MARGIN;

function fill(template) {
  return template
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

  await browser.close();
  console.log(`canvas ${CANVAS_WIDTH}x${CANVAS_HEIGHT}, recording centered with a ${MARGIN}px margin -> ${outDir}`);
  console.log('Still needed: a background texture image sized to the canvas — fetch a few gradient/texture');
  console.log('candidates (e.g. from Unsplash\'s gradient/texture collections), compare, and save the chosen');
  console.log('one as background.jpg alongside mask.png/shadow.png before running the compositing step.');
})();
