// Renderer HTML → PNG via Playwright headless.
// Templates passent du HTML inline (CSS embedded) + viewport, on screenshot.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

let _browser = null;
async function getBrowser() {
  if (_browser) return _browser;
  _browser = await chromium.launch({ headless: true });
  return _browser;
}

export async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

/**
 * Render un HTML complet en PNG.
 * @param {object} args
 * @param {string} args.html - HTML complet (avec <style> inline + body)
 * @param {number} args.width - viewport width (1080)
 * @param {number} args.height - viewport height (1080 carré, 1920 vertical)
 * @param {string} args.outputPath - où sauvegarder le PNG
 * @param {number} [args.waitMs=400] - délai pour laisser les fonts/animations stabiliser
 * @param {boolean} [args.transparent=false] - si true, screenshot avec fond alpha (omitBackground) — utile pour overlays vidéo
 */
export async function renderHtmlToPng({ html, width, height, outputPath, waitMs = 400, transparent = false }) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1, // 1080x1080 actual pixels (TikTok limite à 2M pixels, retina x2 dépasse)
  });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.waitForTimeout(waitMs);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await page.screenshot({ path: outputPath, type: "png", omitBackground: transparent });
  await context.close();
  return outputPath;
}

/**
 * Render plusieurs slides d'un carrousel en une passe (réutilise le browser).
 */
export async function renderCarousel({ slides, outputDir, basename }) {
  const paths = [];
  for (const [i, slide] of slides.entries()) {
    const outputPath = path.join(outputDir, `${basename}-${String(i + 1).padStart(2, "0")}.png`);
    await renderHtmlToPng({
      html: slide.html,
      width: slide.width || 1080,
      height: slide.height || 1080,
      outputPath,
      waitMs: slide.waitMs || 400,
      transparent: slide.transparent || false,
    });
    paths.push(outputPath);
  }
  return paths;
}
