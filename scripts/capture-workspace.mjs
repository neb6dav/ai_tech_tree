// Capture the actual staged UI for the README and social preview.
// Run explicitly after visual review; screenshots are not part of the data build.
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStagedSiteServer } from './lib/staged-site-server.mjs';

const server = await startStagedSiteServer({ siteRoot: '_site' });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto(`${server.url}#node=transformer`, { waitUntil: 'networkidle' });
  await page.locator('svg .node.selected[data-id="transformer"]').waitFor();
  await mkdir('docs/images', { recursive: true });
  await page.screenshot({ path: 'docs/images/desktop-workspace.png' });
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.screenshot({ path: 'social-card.png' });
  console.log('Captured docs/images/desktop-workspace.png and social-card.png from the staged UI.');
} finally {
  await browser.close();
  await server.close();
}
