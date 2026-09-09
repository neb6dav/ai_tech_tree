import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { startStagedSiteServer } from '../scripts/lib/staged-site-server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve('axe-core/axe.min.js');
const AXE_SOURCE = await fs.readFile(AXE_PATH, 'utf8');
const SITE_ROOT = process.env.AI_TREE_TEST_SITE_ROOT ? path.resolve(process.env.AI_TREE_TEST_SITE_ROOT) : path.join(ROOT, '_site');
const VIEWPORTS = [{ width: 1366, height: 768 }, { width: 1280, height: 720 }];
const BROWSER_ENGINE = process.env.AI_TREE_BROWSER || 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(BROWSER_ENGINE)) throw new Error(`Unsupported AI_TREE_BROWSER: ${BROWSER_ENGINE}`);
const limitedCanvas = BROWSER_ENGINE === 'webkit' && process.platform === 'win32';
const DOM_LIMIT = JSON.parse(await fs.readFile(path.join(ROOT, 'performance-budget.json'), 'utf8')).regressionGuards.activeDomElements.maximum;
let domPeak = 0;
let domPeakLabel = '';
let browser;
let server;

before(async () => {
  await fs.access(path.join(SITE_ROOT, 'index.html'));
  browser = await (BROWSER_ENGINE === 'chromium' ? chromium : (await import('playwright'))[BROWSER_ENGINE]).launch({ headless: true });
  server = await startStagedSiteServer({ siteRoot: SITE_ROOT });
});

after(async () => {
  console.log(`DOM peak: ${domPeak} elements (${domPeakLabel || 'none'}); budget maximum: ${DOM_LIMIT}; platform: ${process.platform}`);
  if (limitedCanvas) console.log('LIMITATION: axe color-contrast excluded on Windows WebKit because its canvas image-data implementation failed. Chromium, Firefox, and Linux WebKit retain the full rule set.');
  await server?.close();
  await browser?.close();
});

async function session(options = {}) {
  const errors = [];
  const context = await browser.newContext({
    viewport: options.viewport || VIEWPORTS[0],
    colorScheme: options.colorScheme || 'light',
    javaScriptEnabled: options.javaScriptEnabled !== false,
    serviceWorkers: 'block'
  });
  context.setDefaultTimeout(8000);
  context.setDefaultNavigationTimeout(10000);
  const page = await context.newPage();
  page.on('console', message => {
    if (message.type() !== 'error') return;
    errors.push(message.text());
  });
  page.on('pageerror', error => { errors.push(`pageerror: ${error.message}`); });
  return { context, page, errors };
}

async function closeSession({ context, errors }, label) {
  const count = await context.pages()[0]?.locator('*').count().catch(() => 0) || 0;
  if (count > domPeak) { domPeak = count; domPeakLabel = label; }
  assert.ok(count <= DOM_LIMIT, `${label} DOM count ${count} exceeds performance-budget maximum ${DOM_LIMIT}`);
  await context.close();
  assert.deepEqual(errors, [], `${label} browser console/page errors: ${errors.join('; ')}`);
}

async function openApp(page, suffix = '') {
  await page.goto(`${server.url}${suffix}`, { waitUntil: 'networkidle' });
  await page.locator('[data-atlas-workspace]').waitFor();
}

async function pointerClick(page, locator) {
  const box = await locator.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, 'pointer target must have a positive hit area');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const isTarget = await locator.evaluate((expected, { x, y }) => {
    const target = document.elementFromPoint(x, y);
    return Boolean(target && (target === expected || expected.contains(target)));
  }, point);
  assert.equal(isTarget, true, 'pointer center must resolve to the requested hit target');
  await page.mouse.click(point.x, point.y);
}

test('desktop search Enter selects a node and exposes its evidence pane and source links', async () => {
  const sessionState = await session();
  const { context, page, errors } = sessionState;
  try {
    await openApp(page);
    const search = page.getByLabel(/find a node/i);
    await search.fill('Transformer');
    await search.press('Enter');
    await assertSelected(page, 'Transformer');
    assert.match(await page.locator('#detail-panel').innerText(), /Transformer[\s\S]*Evidence[\s\S]*Connections/i);
    assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('node'), 'transformer');
    const source = page.locator('#detail-panel a[href^="http"]');
    assert.ok(await source.count() >= 1, 'selected evidence pane should expose at least one source URL');
  } finally { await closeSession(sessionState, 'desktop search'); }
});

test('desktop viewport matrix keeps the selected node in the map and detail pane independently scrollable', async () => {
  for (const viewport of VIEWPORTS) {
    for (const colorScheme of ['light', 'dark']) {
      const sessionState = await session({ viewport, colorScheme });
      const { context, page } = sessionState;
      try {
        await openApp(page, '#node=transformer');
        const svgBox = await page.locator('#atlas-map').boundingBox();
        const selectedBox = await page.locator('svg .node.selected, svg .node-card.selected').first().boundingBox();
        assert.ok(svgBox && selectedBox, `${viewport.width} ${colorScheme}: selected node should render`);
        assert.ok(selectedBox.x >= svgBox.x && selectedBox.y >= svgBox.y && selectedBox.x + selectedBox.width <= svgBox.x + svgBox.width && selectedBox.y + selectedBox.height <= svgBox.y + svgBox.height, `${viewport.width} ${colorScheme}: selected node must remain inside map`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${viewport.width} ${colorScheme}: horizontal overflow`);
        const detail = page.locator('#detail-panel');
        const scrollable = await detail.evaluate(el => el.scrollHeight > el.clientHeight);
        assert.equal(scrollable, true, `${viewport.width} ${colorScheme}: detail pane should own its overflow`);
      } finally { await closeSession(sessionState, `viewport ${viewport.width} ${colorScheme}`); }
    }
  }
});

test('map nodes and edges are selectable, showing review evidence, while Fit and all connections preserve a bounded map', async () => {
  const sessionState = await session();
  const { context, page } = sessionState;
  try {
    await openApp(page);
    const node = page.locator('svg [data-id]:not([data-id="transformer"])').first();
    const targetId = await node.getAttribute('data-id');
    assert.ok(targetId && targetId !== 'transformer', 'mouse target must be a different SVG node');
    const targetTitle = (await node.getAttribute('aria-label')).replace(/^Open\s+/u, '');
    const box = await node.boundingBox();
    assert.ok(box, 'different SVG node must be visible for a real mouse click');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(id => new URLSearchParams(location.hash.slice(1)).get('node') === id, targetId);
    assert.equal(await page.locator('svg .selected[data-id]').getAttribute('data-id'), targetId);
    assert.equal(await page.locator('#detail-panel h2').first().innerText(), targetTitle);
    await page.getByLabel(/find a node/i).fill('Transformer');
    await page.getByLabel(/find a node/i).press('Enter');
    await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get('node') === 'transformer');
    const keyboardNode = page.locator(`svg [data-id="${targetId}"]`).first();
    await keyboardNode.focus();
    await keyboardNode.press('Enter');
    await page.waitForFunction(id => new URLSearchParams(location.hash.slice(1)).get('node') === id, targetId);
    assert.equal(await page.locator('svg .selected[data-id]').getAttribute('data-id'), targetId, 'keyboard selection must preserve active node id after rerender');
    assert.equal(await page.locator('#detail-panel h2').first().innerText(), targetTitle);
    assert.match(await page.locator('#detail-panel').innerText(), /Connections/i);
    assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), 'BODY', 'keyboard node selection must retain a relevant focus target');
    const edge = page.getByRole('button', { name: /Inspect relationship from Attention mechanism to Transformer/u }).first();
    assert.ok(await edge.count(), 'workspace must expose keyboard/clickable relationship targets');
    await pointerClick(page, edge);
    const edgeText = await page.locator('#detail-panel').innerText();
    assert.match(edgeText, /Evidence|grade/i);
    assert.match(edgeText, /review(ed| state| pending| unreviewed)/i);
    assert.ok(await page.locator('#detail-panel a[href^="http"]').count() >= 1, 'edge evidence should expose source URLs');
    assert.match(await page.locator('#detail-panel').getByRole('heading', { level: 2 }).first().innerText(), /Attention mechanism[\s\S]*Transformer|Transformer[\s\S]*Attention mechanism/iu);
    await page.getByLabel(/find a node/i).fill('Transformer');
    await page.getByLabel(/find a node/i).press('Enter');
    await page.getByRole('button', { name: /show all connections/i }).click();
    const connectionText = await page.locator('#detail-panel').innerText();
    assert.match(connectionText, /Connections · 22/iu);
    const before = await page.locator('svg .node').count();
    assert.ok(before < 339, 'all connections must not render every atlas node');
    const cameraBefore = await page.locator('#map-content').getAttribute('transform');
    await page.getByRole('button', { name: /zoom in/i }).click();
    const zoomed = await page.locator('#map-content').getAttribute('transform');
    await page.getByRole('button', { name: /fit map/i }).click();
    assert.notEqual(await page.locator('#map-content').getAttribute('transform'), zoomed || cameraBefore, 'Fit must change the camera');
    assert.ok(await page.locator('svg .node').count() < 339, 'Fit must keep the visible workspace bounded');
    await page.getByRole('button', { name: /reset/i }).click();
    assert.match(await page.locator('#map-content').getAttribute('transform') || '', /translate\(0\s+0\)\s+scale\(1\)|^$/u, 'Reset must restore the identity camera');
  } finally { await closeSession(sessionState, 'map selection'); }
});

test('deep links restore a selected record and browser navigation returns to the prior selection', async () => {
  const sessionState = await session();
  const { context, page } = sessionState;
  try {
    await openApp(page, '#node=transformer');
    await assertSelected(page, 'Transformer');
    await page.getByLabel(/find a node/i).fill('Attention');
    await page.getByLabel(/find a node/i).press('Enter');
    await assertSelected(page, 'Attention mechanism');
    await page.goBack();
    await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get('node') === 'transformer');
    assert.equal(await page.locator('#detail-panel h2').first().innerText(), 'Transformer');
    await page.goForward();
    await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get('node') === 'attention');
    assert.equal(await page.locator('#detail-panel h2').first().innerText(), 'Attention mechanism');
  } finally { await closeSession(sessionState, 'deep links'); }
});

test('Learn and Opportunity views disclose their user-facing research content', async () => {
  const sessionState = await session();
  const { context, page } = sessionState;
  try {
    await openApp(page);
    await page.getByRole('button', { name: 'Learn', exact: true }).click();
    const firstLearn = await page.locator('#detail-panel').innerText();
    assert.match(firstLearn, /LEARN|narrated|Open record/i);
    const next = page.getByRole('button', { name: /next/i });
    assert.ok(await next.count(), 'Learn must expose a Next control');
    await next.click();
    assert.notEqual(await page.locator('#detail-panel').innerText(), firstLearn, 'Learn Next must change target and explanation');
    await assertAccessible(page, 'Learn');
    await page.getByRole('button', { name: 'Opportunity', exact: true }).click();
    const text = await page.locator('#detail-panel').innerText();
    assert.match(text, /Measurement-consistent generative reconstruction with calibrated abstention/iu);
    assert.match(text, /hypothes|constraint|imported|unreviewed/i);
    for (const url of ['https://arxiv.org/abs/2209.14687', 'https://arxiv.org/abs/2503.11043', 'https://arxiv.org/abs/2605.13146', 'https://arxiv.org/abs/2603.11325']) {
      assert.ok(await page.locator(`a[href="${url}"]`).count() >= 1, `Opportunity card must expose ${url}`);
    }
    await assertAccessible(page, 'Opportunity');
  } finally { await closeSession(sessionState, 'Learn and Opportunity'); }
});

test('Opportunity collections expose stable counts and complete first hypothesis evidence', async () => {
  const sessionState = await session();
  const { page } = sessionState;
  try {
    await openApp(page, '#view=opportunity');
    const collection = page.getByLabel('Opportunity collection');
    for (const [value, label, count] of [['hypotheses', 'Hypotheses', 8], ['records', 'Records', 60], ['constraints', 'Constraints', 8], ['relationships', 'Relationships', 94]]) {
      await collection.selectOption(value);
      assert.equal(await collection.locator('option:checked').innerText(), `${label} (${count})`);
      assert.equal(await page.locator('#opportunity-browser .list-card').count(), count);
    }
    await collection.selectOption('hypotheses');
    const cards = page.locator('#opportunity-browser .list-card');
    await pointerClick(page, cards.nth(1));
    await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).has('opportunity'));
    assert.equal(await page.locator('#detail-panel h2').first().innerText(), 'Persistent object-centric 3D state for generative world models');
    assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('opportunity'), 'card-opp02');
    await collection.selectOption('records');
    assert.equal(await collection.locator('option:checked').innerText(), 'Records (60)');
    const record = page.locator('#opportunity-browser .list-card').filter({ hasText: 'Learned reverse variances and improved objectives' });
    assert.equal(await record.count(), 1);
    await record.click();
    assert.equal(await collection.inputValue(), 'records', 'r01 must remain in Records collection after selection');
    await collection.selectOption('hypotheses');
    await page.locator('#opportunity-browser .list-card').first().click();
    const cardText = await page.locator('#detail-panel').innerText();
    assert.match(cardText, /Test:\s|minimal experiment/i);
    assert.match(cardText, /Disconfirming result:/i);
    assert.match(cardText, /Blocker:/i);
    assert.match(cardText, /Complement:/i);
    assert.ok(await page.locator('#detail-panel a[href^="http"]').count() >= 1, 'first hypothesis must expose references');
    await openApp(page, '#view=opportunity&opportunity=p01');
    assert.equal(await collection.inputValue(), 'records');
    for (const pattern of [/Precursor/u, /1997[–-]2001/u, /Core/u]) assert.match(await page.locator('#detail-panel').innerText(), pattern);
    await openApp(page, '#view=opportunity&opportunity=m05');
    assert.match(await page.locator('#detail-panel').innerText(), /Title\/author string should be checked against final publication record before public ingestion/u);
    await openApp(page, '#view=opportunity&opportunity=constraint-k01');
    const constraintText = await page.locator('#detail-panel').innerText();
    for (const pattern of [/Sampling Latency/u, /Affects:/u, /Mitigated by:/u]) assert.match(constraintText, pattern);
    await openApp(page, '#view=opportunity&opportunity=opp01');
    assert.equal(await collection.inputValue(), 'records', 'opportunity=opp01 must resolve to the Records collection');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await collection.inputValue(), 'records', 'exact record selection must survive reload');
    await openApp(page, '#card=opp01');
    assert.equal(await collection.inputValue(), 'hypotheses', 'explicit legacy card alias must resolve to the hypothesis card');
  } finally { await closeSession(sessionState, 'Opportunity collections'); }
});

test('invalid URL state is canonicalized to a valid selected node and tour step', async () => {
  const sessionState = await session();
  const { page } = sessionState;
  try {
    await openApp(page, '#node=does-not-exist&view=learn&tour=does-not-exist&step=999');
    await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get('view') === 'learn');
    const params = await page.evaluate(() => Object.fromEntries(new URLSearchParams(location.hash.slice(1))));
    assert.notEqual(params.node, 'does-not-exist');
    assert.equal(params.tour, undefined);
    assert.ok(/^\d+$/u.test(params.step || '') && Number(params.step) >= 0 && Number(params.step) <= 6, 'invalid step must be clamped to the canonical pilot range');
    assert.equal(await page.locator('#detail-panel h2').first().innerText(), 'End with an open question');
    assert.equal(await page.locator('svg .selected[data-id]').getAttribute('data-id'), 'gap_tabular');
  } finally { await closeSession(sessionState, 'invalid URL canonicalization'); }
});

test('static and interactive surfaces remain axe clean with JavaScript enabled', async () => {
  const surfaces = [
    ['', 'Explore'], ['', 'Search expanded'], ['#view=list', 'List'], ['#view=learn', 'Learn'], ['#view=opportunity', 'Opportunity'],
    ['#view=explore', 'Help'], ['#view=explore', 'Dark'], ['nodes/transformer/', 'static Transformer'], ['nodes/gap_tabular/', 'static gap_tabular']
  ];
  for (const [suffix, label] of surfaces) {
    const sessionState = await session({ colorScheme: label === 'Dark' ? 'dark' : 'light' });
    const { page } = sessionState;
    try {
      if (suffix.startsWith('nodes/')) {
        const response = await page.goto(`${server.url}${suffix}`, { waitUntil: 'networkidle' });
        assert.equal(response?.status(), 200);
      } else await openApp(page, suffix);
      if (label === 'Help') { await page.getByRole('button', { name: /^help$/i }).click(); }
      if (label === 'Dark') { assert.equal(await page.locator('html').evaluate(element => element.classList.contains('dark')), true); }
      if (label === 'Search expanded') {
        await page.getByLabel(/find a node/i).fill('Transformer');
        await page.getByLabel(/find a node/i).waitFor();
      }
      await assertAccessible(page, label);
    } finally { await closeSession(sessionState, `axe ${label}`); }
  }
});

test('help dialog has focus behavior, Escape closes it, and theme control changes the document', async () => {
  const sessionState = await session();
  const { context, page } = sessionState;
  try {
    await openApp(page);
    await page.getByRole('button', { name: /^help$/i }).click();
    const dialog = page.locator('#help-dialog');
    assert.equal(await dialog.getAttribute('open'), '');
    assert.equal(await page.evaluate(() => document.activeElement?.closest('dialog')?.id), 'help-dialog');
    await assertAccessible(page, 'Help dialog');
    await page.keyboard.press('Escape');
    assert.equal(await dialog.getAttribute('open'), null);
    const before = await page.locator('html').getAttribute('class');
    await page.getByRole('button', { name: /toggle theme/i }).click();
    assert.notEqual(await page.locator('html').getAttribute('class'), before);
    await page.getByRole('button', { name: /^help$/i }).click();
    await assertAccessible(page, 'Help and dark theme');
  } finally { await closeSession(sessionState, 'help dialog'); }
});

test('small width keeps a readable list fallback and bounded active DOM', async () => {
  const sessionState = await session({ viewport: { width: 375, height: 812 } });
  const { context, page } = sessionState;
  try {
    await openApp(page);
    const list = page.getByRole('button', { name: 'List', exact: true });
    await list.click();
    await page.getByLabel(/find a node/i).fill('Transformer');
    assert.equal(await page.locator('#list-panel').isVisible(), true);
    const listText = await page.locator('#list-panel').innerText();
    assert.match(listText, /Transformer/u);
    assert.doesNotMatch(listText, /AlexNet/u, 'global search should remove unrelated List records');
    assert.ok(await page.locator('#list-panel .list-card').count() < 339, 'global search should reduce List results');
    assert.ok(await page.locator('*').count() < 8000, 'active workspace DOM should remain bounded');
  } finally { await closeSession(sessionState, 'small width'); }
});

test('workspace is self-contained, quiet in the console, and static records remain readable without JavaScript', async () => {
  const sessionState = await session();
  const { context, page, errors } = sessionState;
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  try {
    await openApp(page);
    assert.ok(requests.every(url => url.startsWith(server.origin)), 'workspace made an external runtime request');
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Learn', exact: true }).click();
    assert.match(await page.locator('#detail-panel').innerText(), /LEARN|narrated/i, 'workspace should remain usable offline after initial load');
  } finally { await closeSession(sessionState, 'workspace offline'); }
  const noJs = await session({ javaScriptEnabled: false });
  try {
    const rootResponse = await noJs.page.goto(server.url, { waitUntil: 'domcontentloaded' });
    assert.equal(rootResponse?.status(), 200);
    const fallbackHeading = noJs.page.locator('noscript h2');
    assert.match(await noJs.page.locator('body').innerText(), /AI Research Tech Tree/u, 'no-JS fallback heading must be present in the initial viewport');
    const fallbackBox = await fallbackHeading.boundingBox();
    assert.ok(fallbackBox && fallbackBox.y >= 0 && fallbackBox.y < 768, 'no-JS fallback heading must occupy the initial viewport');
    assert.equal(await noJs.page.locator('[data-atlas-workspace]').isVisible(), false, 'interactive workspace must be hidden without JavaScript');
    assert.ok(await noJs.page.locator('a[href*="/nodes/"]').count() >= 339, 'no-JS root should expose all static records');
    const response = await noJs.page.goto(`${server.url}nodes/transformer/`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200);
    assert.match(await noJs.page.locator('body').innerText(), /Transformer|Summary|canonical JSON/i);
    assert.match(await noJs.page.locator('h1').first().innerText(), /Transformer/i);
    assert.match(await noJs.page.locator('body').innerText(), /Related records|Connections|Evidence/i);
  } finally { await closeSession(noJs, 'no-JS static records'); }
});

async function assertSelected(page, title) {
  await page.locator('#detail-panel h2').filter({ hasText: title }).first().waitFor();
  assert.equal(await page.locator('#detail-panel h2').first().innerText(), title);
  assert.ok(await page.locator('svg .node.selected, svg .node-card.selected').count(), 'selected SVG record should be marked');
}

async function assertAccessible(page, label) {
  await page.evaluate(source => { (0, eval)(source); }, AXE_SOURCE);
  const result = await page.evaluate(async limited => window.axe.run(document, { resultTypes: ['violations'], rules: limited ? { 'color-contrast': { enabled: false } } : {} }), limitedCanvas);
  assert.deepEqual(result.violations, [], `${label} accessibility violations: ${result.violations.map(v => v.id).join(', ')}`);
}
