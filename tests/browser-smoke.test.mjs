import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { startStagedSiteServer } from '../scripts/lib/staged-site-server.mjs';

const MOUNT_PATH = '/ai_tech_tree/';
const APP_TIMEOUT = 30_000;
const WELCOME_REVISION = '3';
const APPROVED_TOUR_SLUGS = Object.freeze([
  'foundations-to-transformers',
  'two-winters-and-revivals',
  'scaling-era',
  'reinforcement-keeps-returning',
  'diffusion-decade',
  'agents-and-alignment'
]);
const RESPONSIVE_MATRIX = Object.freeze([
  Object.freeze({ width: 1920, height: 1080 }),
  Object.freeze({ width: 1366, height: 768 }),
  Object.freeze({ width: 1280, height: 768 }),
  Object.freeze({ width: 1109, height: 768 }),
  Object.freeze({ width: 1024, height: 768 }),
  Object.freeze({ width: 1023, height: 768 }),
  Object.freeze({ width: 960, height: 768 }),
  Object.freeze({ width: 741, height: 800 }),
  Object.freeze({ width: 740, height: 480 }),
  Object.freeze({ width: 375, height: 812 })
]);
const EXPECTED = Object.freeze({
  atlasNodes: 339,
  atlasEdges: 711,
  presentationAnchors: 24,
  directions: 15,
  opportunityNodes: 60,
  opportunityEdges: 94
});
const HEADLESS_WEBGL_READBACK_WARNING = /^\[\.WebGL-0x[0-9a-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$/i;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const performanceBudget = JSON.parse(await fs.readFile(path.join(repoRoot, 'performance-budget.json'), 'utf8'));
const DOM_BUDGET = performanceBudget.regressionGuards.activeDomElements.maximum;
const REVIEWED_DOM_PEAKS = performanceBudget.regressionGuards.activeDomElements.reviewedPeaksByPlatform;
const siteRoot = path.join(repoRoot, '_site');
const measuredDomSamples = [];

function reviewedDomPeakForPlatform(platform) {
  const peak = REVIEWED_DOM_PEAKS?.[platform];
  assert.ok(Number.isSafeInteger(peak) && peak >= 0, `no reviewed DOM peak is configured for ${platform}`);
  return peak;
}

const REVIEWED_DOM_PEAK = reviewedDomPeakForPlatform(process.platform);

let browser;
let stagedSite;
let baseOrigin;
let baseUrl;

function isIgnorableBrowserWarning(message) {
  return HEADLESS_WEBGL_READBACK_WARNING.test(message);
}

async function makeSession(testContext, options = {}) {
  const {
    javaScriptEnabled = true,
    dismissWelcome = true,
    reducedMotion = 'reduce',
    disableAnimationSupport = false,
    viewport = { width: 1366, height: 768 },
    ...contextOptions
  } = options;
  const context = await browser.newContext({
    colorScheme: 'dark',
    javaScriptEnabled,
    reducedMotion,
    serviceWorkers: 'block',
    viewport,
    ...contextOptions
  });
  testContext.after(async () => context.close());

  if (disableAnimationSupport) {
    await context.addInitScript(() => {
      try { Element.prototype.animate = undefined; } catch { /* unsupported DOM */ }
    });
  }

  if (javaScriptEnabled && dismissWelcome) {
    await context.addInitScript(revision => {
      try {
        localStorage.setItem('ai-tech-tree-welcome', revision);
      } catch {
        // Storage can be unavailable before the first document has an origin.
      }
    }, WELCOME_REVISION);
  }

  const externalRequests = [];
  await context.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    if (
      requestUrl.protocol !== 'data:' &&
      requestUrl.protocol !== 'blob:' &&
      requestUrl.origin !== baseOrigin
    ) {
      externalRequests.push(`${route.request().method()} ${requestUrl.href}`);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });

  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  const page = await context.newPage();
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
    if (message.type() === 'warning' && !isIgnorableBrowserWarning(message.text())) {
      consoleWarnings.push(message.text());
    }
  });
  page.on('pageerror', error => pageErrors.push(error.stack ?? error.message));

  return {
    context,
    page,
    assertClean() {
      assert.deepEqual(externalRequests, [], `external requests were attempted:\n${externalRequests.join('\n')}`);
      assert.deepEqual(consoleErrors, [], `console errors were emitted:\n${consoleErrors.join('\n')}`);
      assert.deepEqual(consoleWarnings, [], `console warnings were emitted:\n${consoleWarnings.join('\n')}`);
      assert.deepEqual(pageErrors, [], `uncaught page errors were emitted:\n${pageErrors.join('\n')}`);
    }
  };
}

async function navigate(page, hash = '', query = '') {
  const response = await page.goto(`${baseUrl}${query}${hash}`, {
    timeout: APP_TIMEOUT,
    waitUntil: 'load'
  });
  assert.ok(response, 'navigation did not produce an HTTP response');
  assert.equal(response.status(), 200, `unexpected response for ${page.url()}`);
}

async function waitForApp(page) {
  await page.waitForFunction(
    () => document.querySelector('#bootPending')?.hidden === true && Boolean(window.__AI_TREE_DIAGNOSTICS__),
    undefined,
    { timeout: APP_TIMEOUT }
  );
}

async function openControls(page) {
  const controlsButton = page.locator('#controlsBtn');
  const expanded = (await controlsButton.getAttribute('aria-expanded')) === 'true';
  const open = await page.locator('#controls').evaluate(element => element.classList.contains('open'));
  if (!expanded) {
    await controlsButton.click();
  }
  if (!open) {
    await page.waitForFunction(
      () =>
        document.querySelector('#controlsBtn')?.getAttribute('aria-expanded') === 'true' &&
        document.querySelector('#controls')?.classList.contains('open'),
      undefined,
      { timeout: APP_TIMEOUT }
    );
  }
}

async function switchView(page, view) {
  await openControls(page);
  const button = page.locator(`#viewSeg button[data-view="${view}"]`);
  await button.click();
  await page.waitForFunction(expected => document.body.dataset.view === expected, view);
  assert.equal(await button.getAttribute('aria-pressed'), 'true', `${view} control is not selected`);
  if (view === 'network') {
    await page.waitForFunction(
      () => document.querySelector('#networkView')?.dataset.networkState === 'ready',
      undefined,
      { timeout: APP_TIMEOUT }
    );
  }
  if (view === 'opportunity') {
    await page.waitForFunction(
      () => document.querySelector('#opportunityView')?.dataset.opportunityState === 'ready',
      undefined,
      { timeout: APP_TIMEOUT }
    );
  }
}

async function assertCurrentView(page, view) {
  const roots = {
    list: '#listView',
    map: '#stage',
    network: '#networkView',
    opportunity: '#opportunityView'
  };
  assert.equal(await page.locator('body').getAttribute('data-view'), view);
  assert.equal(await page.locator(`#viewSeg button[data-view="${view}"]`).getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(
    expected => {
      const root = document.querySelector({
        list: '#listView',
        map: '#stage',
        network: '#networkView',
        opportunity: '#opportunityView'
      }[expected]);
      if (!root) return false;
      const style = getComputedStyle(root);
      const rect = root.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    },
    view,
    { timeout: APP_TIMEOUT }
  );
  assert.equal(await page.locator(roots[view]).isVisible(), true, `${view} root is not visible`);

  if (view === 'map') {
    assert.equal(await page.locator('#nodes .node').count(), EXPECTED.atlasNodes);
  } else if (view === 'list') {
    assert.equal(await page.locator('#nodeTableBody tr').count(), EXPECTED.atlasNodes);
  } else if (view === 'network') {
    assert.equal(await page.locator('#networkView').getAttribute('data-network-state'), 'ready');
    assert.equal(await page.locator('#networkCanvas canvas').count(), 1);
    assert.equal(await page.locator('#networkFallback').isHidden(), true);
  } else if (view === 'opportunity') {
    assert.equal(await page.locator('#opportunityView').getAttribute('data-opportunity-state'), 'ready');
    assert.equal(await page.locator('.opportunityNode').count(), EXPECTED.opportunityNodes);
    assert.equal(await page.locator('.opportunityEdge').count(), EXPECTED.opportunityEdges);
    assert.equal(await page.locator('#opportunityArrow').count(), 1, 'runtime SVG arrow marker is absent');
    assert.equal(await page.locator('#opportunityFallback').isHidden(), true);
  }
}

async function recordDomCount(page, samples, label) {
  const count = await page.evaluate(() => document.getElementsByTagName('*').length);
  const sample = { count, label };
  samples.push(sample);
  measuredDomSamples.push(sample);
  assert.ok(count <= DOM_BUDGET, `${label} created ${count} DOM elements (budget ${DOM_BUDGET})`);
}

async function waitForFocus(page, selector) {
  await page.waitForFunction(
    expected => document.activeElement?.matches(expected),
    selector,
    { timeout: APP_TIMEOUT }
  );
}

async function waitForSemanticZoom(page, level) {
  await page.waitForFunction(
    expected => document.querySelector('#svg')?.classList.contains(expected),
    level,
    { timeout: APP_TIMEOUT }
  );
  assert.equal(await page.locator('#svg').evaluate((element, expected) => element.classList.contains(expected), level), true, `timeline did not enter ${level} semantic zoom`);
}

async function zoomToSemanticLevel(page, level) {
  await openControls(page);
  if (level === 'overview') {
    await page.locator('#fitAllBtn').click();
    await waitForSemanticZoom(page, level);
    return;
  }

  assert.ok(['mid', 'detail'].includes(level), `unsupported semantic zoom level: ${level}`);
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (await page.locator(`#svg.${level}`).count()) return;
    await page.locator('#zin').click();
    await page.waitForFunction(() => document.querySelector('#svg')?.classList.contains('overview') || document.querySelector('#svg')?.classList.contains('mid') || document.querySelector('#svg')?.classList.contains('detail'));
  }
  await waitForSemanticZoom(page, level);
}

async function findRelationshipPointerPoint(page, relationshipId) {
  return page.evaluate(({ relationshipId }) => {
    const entry = relationshipPointerIndex.entries.find(candidate => candidate.id === relationshipId);
    const stage = document.querySelector('#stage');
    if (!entry || !stage) return null;
    const stageRect = stage.getBoundingClientRect();
    const tolerance = RELATIONSHIP_POINTER_TOLERANCE;
    for (const segment of entry.segments) {
      const dx = segment.b.x - segment.a.x, dy = segment.b.y - segment.a.y, length = Math.hypot(dx, dy);
      if (!length) continue;
      const nx = -dy / length, ny = dx / length;
      for (const fraction of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        for (const offset of [0, tolerance * 0.45, -tolerance * 0.45, tolerance * 0.9, -tolerance * 0.9]) {
          const x = Math.round(segment.a.x + dx * fraction + nx * offset), y = Math.round(segment.a.y + dy * fraction + ny * offset);
          if (x < Math.max(0, stageRect.left) || x > Math.min(innerWidth, stageRect.right) || y < Math.max(0, stageRect.top) || y > Math.min(innerHeight, stageRect.bottom)) continue;
          const hitElement = document.elementFromPoint(x, y);
          if (!hitElement?.closest('#stage') || hitElement.closest('g.node,g.semanticCluster,g.anchorLabel,g.traceLabel')) continue;
          if (relationshipAtPointer(x, y)?.id === relationshipId) return { x, y };
        }
      }
    }
    return null;
  }, { relationshipId });
}

async function readOverviewAnchorLabelLayout(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('#stage')?.getBoundingClientRect();
    const labels = [...document.querySelectorAll('#anchorLabels .anchorLabel:not([aria-hidden="true"]) text')].map(text => {
      const rect = text.getBoundingClientRect();
      return { id: text.parentElement?.dataset.nodeId, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    });
    const collisions = [];
    for (let index = 0; index < labels.length; index += 1) {
      for (let next = index + 1; next < labels.length; next += 1) {
        const left = Math.max(labels[index].left, labels[next].left);
        const right = Math.min(labels[index].right, labels[next].right);
        const top = Math.max(labels[index].top, labels[next].top);
        const bottom = Math.min(labels[index].bottom, labels[next].bottom);
        if (right - left > 1 && bottom - top > 1) collisions.push([labels[index].id, labels[next].id]);
      }
    }
    const outside = stage
      ? labels.filter(label => label.left < stage.left - 1 || label.right > stage.right + 1 || label.top < stage.top - 1 || label.bottom > stage.bottom + 1).map(label => label.id)
      : labels.map(label => label.id);
    return { labels, collisions, outside };
  });
}

async function readOffscreenAnchorLabelLayout(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('#stage')?.getBoundingClientRect();
    if (!stage) return { offscreen: [], pinned: [] };
    const labels = [...document.querySelectorAll('#anchorLabels .anchorLabel:not([aria-hidden="true"])')].map(group => {
      const dot = group.querySelector('circle')?.getBoundingClientRect();
      const text = group.querySelector('text')?.getBoundingClientRect();
      const dotX = dot ? (dot.left + dot.right) / 2 : NaN;
      const dotY = dot ? (dot.top + dot.bottom) / 2 : NaN;
      const farOffscreen = dotX < stage.left - 96 || dotX > stage.right + 96 || dotY < stage.top - 96 || dotY > stage.bottom + 96;
      const textIntersectsStage = text && text.right > stage.left && text.left < stage.right && text.bottom > stage.top && text.top < stage.bottom;
      return { id: group.dataset.nodeId, dotX, dotY, farOffscreen, textIntersectsStage };
    });
    return { offscreen: labels.filter(label => label.farOffscreen), pinned: labels.filter(label => label.farOffscreen && label.textIntersectsStage) };
  });
}

function explicitContractError(contract, detail) {
  return `${contract} v1.1 browser contract is not present${detail ? `: ${detail}` : ''}`;
}

describe('staged browser smoke', { concurrency: false }, () => {
  before(async () => {
    stagedSite = await startStagedSiteServer({ siteRoot });
    baseOrigin = stagedSite.origin;
    baseUrl = stagedSite.url;
    browser = await chromium.launch({ headless: true });
  });

  after(async () => {
    try {
      await browser?.close();
    } finally {
      await stagedSite?.close();
    }
  });

  test('desktop renders all four views, restores deep links, and preserves details focus', async testContext => {
    const session = await makeSession(testContext);
    const { page } = session;
    const domSamples = [];

    await navigate(page);
    await waitForApp(page);
    assert.match(await page.title(), /AI Research Tech Tree/);

    const diagnostics = await page.evaluate(() => window.__AI_TREE_DIAGNOSTICS__);
    assert.deepEqual(
      {
        auditWarnings: diagnostics.auditWarnings,
        directions: diagnostics.directions,
        edges: diagnostics.edges,
        graphIssues: diagnostics.graphIssues,
        graphWarnings: diagnostics.graphWarnings,
        nodes: diagnostics.nodes
      },
      {
        auditWarnings: false,
        directions: EXPECTED.directions,
        edges: EXPECTED.atlasEdges,
        graphIssues: 0,
        graphWarnings: 0,
        nodes: EXPECTED.atlasNodes
      }
    );

    await assertCurrentView(page, 'map');
    await recordDomCount(page, domSamples, 'desktop Timeline');

    await switchView(page, 'list');
    await assertCurrentView(page, 'list');
    await recordDomCount(page, domSamples, 'desktop List');

    const transformerRow = page.locator('.nodeListButton[data-node-id="transformer"]');
    await transformerRow.click();
    await page.waitForFunction(() => document.querySelector('#panel')?.getAttribute('aria-hidden') === 'false');
    assert.equal(await page.locator('#pTitle').textContent(), 'Transformer');
    await waitForFocus(page, '#pTitle');
    await page.locator('#pClose').click({ force: true });
    await page.waitForFunction(() => document.querySelector('#panel')?.getAttribute('aria-hidden') === 'true');
    await waitForFocus(page, '.nodeListButton[data-node-id="transformer"]');

    await switchView(page, 'opportunity');
    await assertCurrentView(page, 'opportunity');
    await recordDomCount(page, domSamples, 'desktop Opportunity');

    await switchView(page, 'network');
    await assertCurrentView(page, 'network');
    await recordDomCount(page, domSamples, 'desktop Network');

    await switchView(page, 'map');
    await assertCurrentView(page, 'map');
    await recordDomCount(page, domSamples, 'desktop Timeline after lazy views');

    await navigate(page, '#view=list&node=transformer&theme=dark', '?smoke=atlas-deep-link');
    await waitForApp(page);
    await page.waitForFunction(() => document.body.dataset.view === 'list');
    assert.equal(await page.locator('body').getAttribute('data-theme'), 'dark');
    assert.equal(await page.locator('#panel').getAttribute('aria-hidden'), 'false');
    assert.equal(await page.locator('#pTitle').textContent(), 'Transformer');
    await recordDomCount(page, domSamples, 'desktop List deep link');

    await navigate(
      page,
      '#view=opportunity&opportunity=diffusion-models-opportunity-map&opp=c03&oppPanel=1&theme=dark',
      '?smoke=opportunity-deep-link'
    );
    await waitForApp(page);
    await page.waitForFunction(
      () =>
        document.body.dataset.view === 'opportunity' &&
        document.querySelector('#opportunityView')?.dataset.opportunityState === 'ready' &&
        document.querySelector('.opportunityNode[data-node-id="c03"]')?.getAttribute('aria-pressed') === 'true',
      undefined,
      { timeout: APP_TIMEOUT }
    );
    assert.equal(await page.locator('#panel').getAttribute('aria-hidden'), 'false');
    assert.equal(await page.locator('#pTitle').textContent(), 'Denoising diffusion probabilistic models');
    await recordDomCount(page, domSamples, 'desktop Opportunity deep link');

    await navigate(page, '#opportunity=diffusion-models-opportunity-map', '?smoke=legacy-opportunity-deep-link');
    await waitForApp(page);
    await page.waitForFunction(
      () => document.body.dataset.view === 'opportunity' && document.querySelector('#opportunityView')?.dataset.opportunityState === 'ready',
      undefined,
      { timeout: APP_TIMEOUT }
    );
    assert.equal(await page.locator('#opportunityView').getAttribute('data-opportunity-state'), 'ready', 'legacy opportunity hash did not restore Opportunity view');

    await navigate(page, '#opportunity=unknown-map-id', '?smoke=unknown-opportunity-deep-link');
    await waitForApp(page);
    assert.equal(await page.locator('body').getAttribute('data-view'), 'map', 'unknown opportunity hash unexpectedly redirected to Opportunity view');

    assert.ok(Math.max(...domSamples.map(sample => sample.count)) <= DOM_BUDGET);
    session.assertClean();
  });

  test('desktop detail panels stay below the header and close with focus restoration', async testContext => {
    for (const viewport of [
      { width: 1366, height: 768 },
      { width: 1024, height: 768 },
      { width: 741, height: 800 }
    ]) {
      const session = await makeSession(testContext, { viewport });
      const { page } = session;
      await navigate(page, '#view=list', `?smoke=panel-geometry-${viewport.width}`);
      await waitForApp(page);
      const transformerRow = page.locator('.nodeListButton[data-node-id="transformer"]');
      await transformerRow.click();
      await page.waitForFunction(() => document.querySelector('#panel')?.getAttribute('aria-hidden') === 'false');
      const geometry = await page.evaluate(() => {
        const header = document.querySelector('#bar')?.getBoundingClientRect();
        const panel = document.querySelector('#panel')?.getBoundingClientRect();
        return {
          headerBottom: header?.bottom ?? -1,
          panelTop: panel?.top ?? -1,
          panelBottom: panel?.bottom ?? -1,
          viewportHeight: innerHeight
        };
      });
      assert.ok(geometry.panelTop >= geometry.headerBottom - 1, `${viewport.width}px detail panel overlaps the header: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.panelBottom <= geometry.viewportHeight + 1, `${viewport.width}px detail panel escapes the viewport: ${JSON.stringify(geometry)}`);
      await page.locator('#pClose').click();
      await page.waitForFunction(() => document.querySelector('#panel')?.getAttribute('aria-hidden') === 'true');
      await waitForFocus(page, '.nodeListButton[data-node-id="transformer"]');
      session.assertClean();
    }
  });

  test('first-run onboarding opens only for a fresh landing and restored deep links bypass it', async testContext => {
    const firstRun = await makeSession(testContext, { dismissWelcome: false });
    const { page } = firstRun;

    await navigate(page, '', '?smoke=first-run');
    await waitForApp(page);
    await page.waitForFunction(
      () => document.querySelector('#legend')?.getAttribute('aria-hidden') === 'false' && document.querySelector('#legend')?.classList.contains('welcome'),
      undefined,
      { timeout: APP_TIMEOUT }
    );
    assert.equal(await page.locator('#legendDismiss').isVisible(), true, 'fresh landing did not expose the onboarding dismissal');
    await page.locator('#legendDismiss').click();
    await page.waitForFunction(() => document.querySelector('#legend')?.getAttribute('aria-hidden') === 'true');
    assert.equal(await page.evaluate(() => localStorage.getItem('ai-tech-tree-welcome')), WELCOME_REVISION);
    firstRun.assertClean();

    const restored = await makeSession(testContext, { dismissWelcome: false });
    await navigate(restored.page, '#view=list&node=transformer&theme=dark', '?smoke=first-run-restored');
    await waitForApp(restored.page);
    await restored.page.waitForFunction(() => document.body.dataset.view === 'list');
    assert.equal(await restored.page.locator('#legend').getAttribute('aria-hidden'), 'true', 'restored deep link opened first-run onboarding');
    assert.equal(await restored.page.locator('#legend').evaluate(element => element.classList.contains('welcome')), false);
    assert.equal(await restored.page.locator('#panel').getAttribute('aria-hidden'), 'false');
    restored.assertClean();
  });

  test('startup hash matrix restores intent, precedence, and camera validity deterministically', async testContext => {
    const session = await makeSession(testContext);
    const { page } = session;
    const cases = [
      { name: 'empty', hash: '', recognized: false, view: 'map', camera: false },
      { name: 'legacy unknown', hash: '#legacy=1', recognized: false, view: 'map', camera: false },
      { name: 'theme-only', hash: '#theme=light', recognized: true, view: 'map', camera: false, theme: 'light' },
      { name: 'scale-only', hash: '#scale=linear', recognized: true, view: 'map', camera: false, scale: 'linear' },
      { name: 'hover mode', hash: '#mode=hover', recognized: true, view: 'map', camera: false, mode: 'hover' },
      { name: 'view-only', hash: '#view=list', recognized: true, view: 'list', camera: false },
      { name: 'filter', hash: '#status=d', recognized: true, view: 'map', camera: false, status: 'd' },
      { name: 'zero-result filter', hash: '#status=none', recognized: true, view: 'map', camera: false, status: 'none' },
      { name: 'incomplete camera', hash: '#cx=10&cy=20', recognized: true, view: 'map', camera: false },
      { name: 'invalid camera', hash: '#cx=10&cy=20&z=not-a-number', recognized: true, view: 'map', camera: false },
      { name: 'nonpositive camera', hash: '#cx=10&cy=20&z=0', recognized: true, view: 'map', camera: false },
      { name: 'node', hash: '#node=transformer', recognized: true, view: 'map', camera: false, focus: 'transformer' },
      { name: 'tour', hash: '#tour=foundations-to-transformers&step=3', recognized: true, view: 'map', camera: false, focus: 'perceptron' },
      { name: 'trace', hash: '#trace=transformer', recognized: true, view: 'map', camera: false, trace: true },
      { name: 'complete camera', hash: '#cx=10&cy=20&z=0.75', recognized: true, view: 'map', camera: true },
      { name: 'precedence', hash: '#view=list&trace=transformer&node=transformer&cx=0&cy=0&z=1', recognized: true, view: 'list', camera: true, focus: 'transformer' }
    ];

    for (const item of cases) {
      await navigate(page, item.hash, `?smoke=startup-hash-${item.name.replaceAll(' ', '-')}`);
      await waitForApp(page);
      await page.waitForFunction(() => Boolean(window.__AI_TREE_RESTORE_STATE__));
      const state = await page.evaluate(() => {
        const params = new URLSearchParams(window.location.hash.slice(1));
        return {
          recognized: window.__AI_TREE_RESTORE_STATE__?.recognizedIntent,
          view: document.body.dataset.view,
          theme: document.body.dataset.theme,
          scale: document.querySelector('#scaleSeg [aria-pressed="true"]')?.dataset.scale || 'density',
          mode: document.querySelector('#modeSeg [aria-pressed="true"]')?.dataset.m,
          camera: window.__AI_TREE_RESTORE_STATE__?.camera,
          trace: document.querySelector('#inspector')?.dataset.mode === 'trace',
          tour: document.querySelector('#tourDialog')?.dataset.tourActive || null,
          focusedTarget: window.__AI_TREE_RESTORE_STATE__?.focusedTarget,
          filter: params.get('status'),
          transform: document.querySelector('#world')?.getAttribute('transform') || '',
          lod: ['overview', 'mid', 'detail'].find(level => document.querySelector(`#svg.${level}`)) || null,
          emptyVisible: document.querySelector('#emptyState')?.hidden === false,
          emptyResetVisible: Boolean(document.querySelector('#emptyResetBtn')?.getClientRects().length)
        };
      });
      assert.equal(state.recognized, item.recognized, `${item.name} recognized-intent mismatch`);
      assert.equal(state.view, item.view, `${item.name} view mismatch`);
      assert.equal(state.camera.valid, item.camera, `${item.name} camera validity mismatch`);
      if (item.theme) assert.equal(state.theme, item.theme);
      if (item.scale) assert.equal(state.scale, item.scale);
      if (item.mode) assert.equal(state.mode, item.mode);
      if (item.status) assert.equal(state.filter, item.status);
      if (item.focus) assert.equal(state.focusedTarget, item.focus, `${item.name} focus precedence mismatch`);
      if (item.trace) assert.equal(state.trace, true, 'trace intent did not win startup restoration');
      if (item.view === 'map' && !item.camera && ['empty', 'legacy unknown', 'theme-only', 'scale-only', 'hover mode', 'filter', 'zero-result filter', 'incomplete camera', 'invalid camera', 'nonpositive camera'].includes(item.name)) {
        const scale = Number(state.transform.match(/scale\(([-+]?\d*\.?\d+)/u)?.[1]);
        assert.ok(Number.isFinite(scale) && Math.abs(scale - 1) > 0.0001, `${item.name} remained at the un-fitted scale: ${state.transform}`);
        assert.ok(state.lod, `${item.name} did not establish a semantic zoom level`);
      }
      if (item.name === 'zero-result filter') {
        assert.equal(state.emptyVisible, true, 'zero-result filter must expose the recovery empty state');
        assert.equal(state.emptyResetVisible, true, 'zero-result filter must expose a visible Reset filters recovery control');
      }
      if (item.name === 'tour') {
        assert.equal(state.tour, 'foundations-to-transformers');
        assert.match(await page.locator('#tourStepNarration').textContent(), /perceptron|examples/u);
      }
    }
    session.assertClean();
  });

  test('Share preserves camera while trace-summary Copy link intentionally omits it', async testContext => {
    const session = await makeSession(testContext);
    const { page } = session;
    await session.context.addInitScript(() => {
      const writes = [];
      Object.defineProperty(window, '__AI_TREE_CLIPBOARD__', { configurable: true, value: writes });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: value => { writes.push(String(value)); return Promise.resolve(); } }
      });
    });

    await navigate(page, '#cx=10&cy=20&z=0.75&theme=dark', '?smoke=share-camera');
    await waitForApp(page);
    await page.locator('#shareBtn').click();
    const shared = await page.evaluate(() => window.__AI_TREE_CLIPBOARD__?.at(-1));
    assert.match(shared || '', /https:\/\/neb6dav\.github\.io\/ai_tech_tree\//u);
    const sharedParams = new URL(shared).hash.slice(1).split('&').reduce((params, pair) => {
      const [key, value] = pair.split('=');
      params.set(key, decodeURIComponent(value || ''));
      return params;
    }, new Map());
    assert.equal(sharedParams.get('cx'), '10.0');
    assert.equal(sharedParams.get('cy'), '20.0');
    assert.equal(sharedParams.get('z'), '0.750');

    await navigate(page, '#trace=transformer&cx=10&cy=20&z=0.75', '?smoke=trace-copy-camera');
    await waitForApp(page);
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'trace');
    await page.locator('#shareBtn').click();
    const generalTraceLink = await page.evaluate(() => window.__AI_TREE_CLIPBOARD__?.at(-1));
    assert.match(generalTraceLink || '', /(?:^|[&#])cx=10\.0(?:&|$)/u);
    await page.locator('#inspector .traceSummary .btn', { hasText: 'Copy link' }).click();
    const traceSummaryLink = await page.evaluate(() => window.__AI_TREE_CLIPBOARD__?.at(-1));
    const traceParams = new URL(traceSummaryLink).hash.slice(1);
    assert.match(traceParams, /(?:^|&)trace=transformer(?:&|$)/u);
    assert.doesNotMatch(traceParams, /(?:^|&)(?:cx|cy|z)=/u, 'trace-summary Copy link must not leak transient camera coordinates');
    session.assertClean();
  });

  test('light, reduced-motion, and forced-colors browser modes remain usable', async testContext => {
    const cases = [
      { name: 'light', options: { colorScheme: 'light' }, media: '(prefers-color-scheme: light)' },
      { name: 'reduced', options: { reducedMotion: 'reduce' }, media: '(prefers-reduced-motion: reduce)' },
      { name: 'forced', options: { forcedColors: 'active' }, media: '(forced-colors: active)' }
    ];
    for (const item of cases) {
      const session = await makeSession(testContext, item.options);
      const { page } = session;
      await navigate(page, '#view=map', `?smoke=browser-mode-${item.name}`);
      await waitForApp(page);
      assert.equal(await page.evaluate(query => matchMedia(query).matches, item.media), true, `${item.name} media query was not exposed by the browser context`);
      assert.equal(await page.locator('#bootPending').isHidden(), true, `${item.name} mode did not complete startup`);
      assert.equal(await page.locator('#nodes .node').count(), EXPECTED.atlasNodes, `${item.name} mode did not render the atlas`);
      if (item.name === 'light') {
        assert.equal(await page.locator('body').getAttribute('data-theme'), 'light');
        await page.locator('#themeBtn').click();
        await page.waitForFunction(() => document.body.dataset.theme === 'dark');
      }
      session.assertClean();
    }
  });

  test('fresh orientation reveal completes, cancels, skips, and honors bypasses', async testContext => {
    const complete = await makeSession(testContext, { dismissWelcome: false, reducedMotion: 'no-preference' });
    await navigate(complete.page, '', '?smoke=intro-complete');
    await waitForApp(complete.page);
    await complete.page.locator('#legendDismiss').click();
    await complete.page.waitForFunction(() => document.body.dataset.introReveal === 'complete', undefined, { timeout: APP_TIMEOUT });
    assert.equal(await complete.page.locator('.introRevealSkip').count(), 0);
    assert.deepEqual(await complete.page.evaluate(() => ({ paths: document.body.dataset.introRevealPaths, labels: document.body.dataset.introRevealLabels })), { paths: '72', labels: '24' });
    complete.assertClean();

    const cancelled = await makeSession(testContext, { dismissWelcome: false, reducedMotion: 'no-preference' });
    await navigate(cancelled.page, '', '?smoke=intro-cancel');
    await waitForApp(cancelled.page);
    await cancelled.page.locator('#legendDismiss').click();
    await cancelled.page.waitForFunction(() => document.body.dataset.introReveal === 'running', undefined, { timeout: APP_TIMEOUT });
    await cancelled.page.mouse.move(8, 8);
    await cancelled.page.mouse.down();
    await cancelled.page.mouse.up();
    await cancelled.page.waitForFunction(() => document.body.dataset.introReveal === 'cancelled', undefined, { timeout: APP_TIMEOUT });
    cancelled.assertClean();

    const skipped = await makeSession(testContext, { dismissWelcome: false, reducedMotion: 'no-preference' });
    await navigate(skipped.page, '', '?smoke=intro-skip');
    await waitForApp(skipped.page);
    await skipped.page.evaluate(() => {
      const nativeRequestAnimationFrame = window.requestAnimationFrame;
      const nativeBodyAppendChild = document.body.appendChild;
      let safetyTimer;
      let observer;
      const maybeSkip = () => {
        const skip = document.querySelector('.introRevealSkip');
        if (document.body?.dataset.introReveal !== 'running' || !skip) return;
        restoreNativeRequestAnimationFrame();
        skip.click();
      };
      const restoreNativeRequestAnimationFrame = () => {
        window.requestAnimationFrame = nativeRequestAnimationFrame;
        document.body.appendChild = nativeBodyAppendChild;
        observer?.disconnect();
        window.clearTimeout(safetyTimer);
      };
      const wrappedRequestAnimationFrame = callback => nativeRequestAnimationFrame.call(window, timestamp => {
        callback(timestamp);
        maybeSkip();
      });
      observer = new MutationObserver(maybeSkip);
      observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
      window.requestAnimationFrame = wrappedRequestAnimationFrame;
      document.body.appendChild = function appendChildWithSkipProbe(node) {
        const result = nativeBodyAppendChild.call(this, node);
        maybeSkip();
        return result;
      };
      safetyTimer = window.setTimeout(restoreNativeRequestAnimationFrame, 5000);
      document.querySelector('#legendDismiss').click();
    });
    try {
      await skipped.page.waitForFunction(() => document.body.dataset.introReveal === 'skipped', undefined, { timeout: APP_TIMEOUT });
    } catch (error) {
      const diagnostic = await skipped.page.evaluate(() => ({
        introReveal: document.body?.dataset.introReveal || null,
        introRevealSkipPresent: Boolean(document.querySelector('.introRevealSkip'))
      }));
      assert.fail(`${error instanceof Error ? error.message : String(error)}; introReveal=${diagnostic.introReveal}; introRevealSkipPresent=${diagnostic.introRevealSkipPresent}`);
    }
    assert.equal(await skipped.page.locator('.introRevealSkip').count(), 0);
    skipped.assertClean();

    const bypassCases = [
      { label: 'deep link', options: { dismissWelcome: false, reducedMotion: 'no-preference' }, hash: '#view=list&node=transformer' },
      { label: 'prior dismissal', options: { reducedMotion: 'no-preference' }, hash: '' },
      { label: 'embed', options: { dismissWelcome: false, reducedMotion: 'no-preference' }, query: '?embed=1', hash: '' },
      { label: 'reduced motion', options: { dismissWelcome: false, reducedMotion: 'reduce' }, hash: '' },
      { label: 'forced colors', options: { dismissWelcome: false, reducedMotion: 'no-preference', forcedColors: 'active' }, hash: '' },
      { label: 'missing animation support', options: { dismissWelcome: false, reducedMotion: 'no-preference', disableAnimationSupport: true }, hash: '' },
      { label: 'targeted start', options: { dismissWelcome: false, reducedMotion: 'no-preference' }, hash: '', targeted: true }
    ];
    for (const item of bypassCases) {
      const session = await makeSession(testContext, item.options);
      await navigate(session.page, item.hash || '', item.query || `?smoke=intro-bypass-${item.label.replaceAll(' ', '-')}`);
      await waitForApp(session.page);
      if (item.targeted) {
        await session.page.locator('#legend [data-start="transformer"]').click();
      } else if (await session.page.locator('#legendDismiss').isVisible()) {
        await session.page.locator('#legendDismiss').click();
      }
      await session.page.waitForFunction(() => ['bypassed', 'complete', 'cancelled', 'skipped'].includes(document.body.dataset.introReveal));
      assert.equal(await session.page.evaluate(() => document.body.dataset.introReveal), 'bypassed', `${item.label} did not bypass orientation reveal`);
      assert.equal(await session.page.locator('.introRevealSkip').count(), 0, `${item.label} exposed the skip control`);
      session.assertClean();
    }
  });

  test('timeline semantic zoom, time scale, and hash state round-trip', async testContext => {
    const session = await makeSession(testContext);
    const { page } = session;

    await navigate(page, '', '?smoke=semantic-navigation');
    await waitForApp(page);
    await zoomToSemanticLevel(page, 'overview');
    assert.equal(await page.locator('#edgesAll path').count(), 0, 'overview rendered contextual relationship paths');
    assert.equal(
      await page.locator('#anchorLabels .anchorLabel:not([aria-hidden="true"])').count(),
      EXPECTED.presentationAnchors,
      'overview did not expose all curated anchor labels'
    );

    await zoomToSemanticLevel(page, 'mid');
    assert.ok(await page.locator('#clusters .semanticCluster').count() > 0, 'mid zoom did not render semantic lane-by-era clusters');
    assert.equal(
      await page.locator('#anchorLabels .anchorLabel:not([aria-hidden="true"])').count(),
      0,
      'mid zoom retained standalone anchor labels outside cluster cards'
    );
    assert.ok(
      await page.locator('#clusters .clusterAnchor').evaluateAll(elements => elements.some(element => /(?:Landmark|Nearest landmark):/.test(element.textContent || ''))),
      'mid zoom omitted representative landmark text from semantic cluster cards'
    );
    assert.equal(await page.locator('#edgesAll path').count(), 0, 'mid zoom rendered contextual relationship paths');

    await zoomToSemanticLevel(page, 'detail');
    assert.equal(await page.locator('#nodes .node').count(), EXPECTED.atlasNodes);
    assert.equal(await page.locator('#clusters .semanticCluster').count(), 0, 'detail zoom retained semantic clusters');

    await page.locator('#modeSeg button[data-m="all"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#modeSeg button[data-m="all"]')?.getAttribute('aria-pressed') === 'true' &&
        document.querySelectorAll('#edgesBackbone path').length === 72 &&
        document.querySelectorAll('#edgesAll path').length === 639,
      undefined,
      { timeout: APP_TIMEOUT }
    );
    const detailRelationshipIds = await page.locator('#edgesBackbone path, #edgesAll path').evaluateAll(paths => paths.map(path => path.dataset.relationshipId));
    assert.equal(await page.locator('#edgesBackbone path').count(), 72, 'detail All mode rendered the wrong spine path count');
    assert.equal(await page.locator('#edgesAll path').count(), 639, 'detail All mode rendered the wrong contextual path count');
    assert.equal(detailRelationshipIds.length, 711, 'detail All mode did not pool all 711 relationship paths');
    assert.equal(new Set(detailRelationshipIds).size, 711, 'detail All mode reused a relationship ID across pooled paths');

    await zoomToSemanticLevel(page, 'overview');
    assert.equal(await page.locator('#modeSeg button[data-m="all"]').getAttribute('aria-pressed'), 'true', 'All mode was lost when zooming back to overview');
    assert.equal(await page.locator('#edgesAll path').count(), 0, 'overview rendered contextual relationship paths in All mode');
    assert.equal(await page.locator('#edgesBackbone path').count(), 72, 'overview rendered the wrong spine path count');
    assert.equal(await page.locator('#edgesBackbone path, #edgesAll path').count(), 72, 'overview rendered more than the pooled orientation spine');
    assert.equal(await page.locator('#allZoomNotice').isVisible(), true, 'overview All mode did not expose its zoom notice');

    await page.locator('#scaleSeg [data-scale="linear"]').click();
    await page.waitForFunction(() => document.querySelector('#scaleSeg [data-scale="linear"]')?.getAttribute('aria-pressed') === 'true');
    await page.waitForFunction(() => new URL(window.location.href).hash.includes('scale=linear'), undefined, { timeout: APP_TIMEOUT });
    const linearHash = await page.evaluate(() => window.location.hash);
    const semanticZoomBeforeRoundTrip = await page.locator('#svg').evaluate(element => ['overview', 'mid', 'detail'].find(level => element.classList.contains(level)));
    assert.ok(semanticZoomBeforeRoundTrip, 'timeline did not expose a semantic zoom class before hash round-trip');
    assert.match(linearHash, /(?:^|#|[?&])scale=linear(?:&|$)/);

    await navigate(page, linearHash, '?smoke=semantic-navigation-round-trip');
    await waitForApp(page);
    await page.waitForFunction(() => document.querySelector('#scaleSeg [data-scale="linear"]')?.getAttribute('aria-pressed') === 'true');
    assert.equal(
      await page.locator('#svg').evaluate((element, expected) => element.classList.contains(expected), semanticZoomBeforeRoundTrip),
      true,
      `timeline semantic zoom changed during hash round-trip (expected ${semanticZoomBeforeRoundTrip})`
    );
    assert.match(await page.evaluate(() => window.location.hash), /(?:^|#|[?&])scale=linear(?:&|$)/);
    await openControls(page);
    await page.locator('#scaleSeg [data-scale="density"]').click();
    await page.waitForFunction(() => document.querySelector('#scaleSeg [data-scale="density"]')?.getAttribute('aria-pressed') === 'true');
    await page.waitForFunction(() => !new URL(window.location.href).hash.includes('scale=linear'), undefined, { timeout: APP_TIMEOUT });
    session.assertClean();
  });

  test('overview anchor labels remain readable at desktop and tablet widths', async testContext => {
    for (const viewport of [{ width: 1366, height: 768 }, { width: 1024, height: 768 }]) {
      const session = await makeSession(testContext, { viewport });
      await navigate(session.page, '', `?smoke=overview-anchor-layout-${viewport.width}`);
      await waitForApp(session.page);
      await zoomToSemanticLevel(session.page, 'overview');
      const layout = await readOverviewAnchorLabelLayout(session.page);
      assert.equal(layout.labels.length, EXPECTED.presentationAnchors, `${viewport.width}px overview did not expose all curated anchor labels`);
      assert.deepEqual(layout.collisions, [], `${viewport.width}px overview anchor labels overlap: ${JSON.stringify(layout.collisions)}`);
      assert.deepEqual(layout.outside, [], `${viewport.width}px overview anchor labels escaped the usable stage: ${JSON.stringify(layout.outside)}`);
      session.assertClean();
    }
  });

  test('offscreen overview anchors do not pin their labels into the viewport while panning', async testContext => {
    const session = await makeSession(testContext, { viewport: { width: 1024, height: 768 } });
    const { page } = session;
    await navigate(page, '', '?smoke=overview-anchor-offscreen-pan');
    await waitForApp(page);
    await zoomToSemanticLevel(page, 'overview');
    await page.locator('#controlsBtn').click();
    await page.waitForFunction(() => document.querySelector('#controlsBtn')?.getAttribute('aria-expanded') === 'false');
    const stage = await page.locator('#stage').boundingBox();
    assert.ok(stage, 'timeline stage is missing before pan');
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
    for (let step = 0; step < 4; step += 1) await page.mouse.wheel(0, -40);
    await page.waitForFunction(() => document.querySelector('#svg')?.classList.contains('overview'));
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await page.mouse.down();
    await page.mouse.move(stage.x + 4, stage.y + stage.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    const layout = await readOffscreenAnchorLabelLayout(page);
    assert.ok(layout.offscreen.length > 0, 'pan did not move any anchor dots beyond the near-viewport threshold');
    assert.deepEqual(layout.pinned, [], `offscreen anchor labels were pinned into the viewport: ${JSON.stringify(layout.pinned)}`);
    session.assertClean();
  });

  test('all six curated tours expose the approved runtime contract', async testContext => {
    const session = await makeSession(testContext);
    const { page } = session;

    await navigate(page, '', '?smoke=curated-tours');
    await waitForApp(page);
    const launcher = page.locator('#tourBtn');
    assert.equal(await launcher.count(), 1, explicitContractError('curated tours', 'expected the Tours launcher'));
    assert.equal(await page.locator('#tourDialog').isHidden(), true, 'fresh state unexpectedly opened the tour chooser');
    assert.equal(await page.evaluate(() => new URLSearchParams(window.location.hash.slice(1)).has('tour')), false, 'fresh state added a tour to the URL hash');
    assert.equal(await page.locator('[data-tour-active]').count(), 0, 'fresh state marked a current tour');
    await launcher.click();
    await page.waitForFunction(
      expected => {
        const dialog = document.querySelector('#tourDialog');
        return Boolean(dialog) && !dialog.hidden && document.querySelectorAll('[data-tour-slug]').length === expected;
      },
      APPROVED_TOUR_SLUGS.length,
      { timeout: APP_TIMEOUT }
    );
    assert.equal(await page.evaluate(() => new URLSearchParams(window.location.hash.slice(1)).has('tour')), false, 'opening the tour chooser added a tour to the URL hash');
    assert.equal(await page.locator('#tourDialog').getAttribute('data-tour-active'), null, 'opening the tour chooser marked a current tour');
    const tourItems = page.locator('[data-tour-slug]');
    await page.waitForFunction(
      expected => document.querySelectorAll('[data-tour-slug]').length === expected,
      APPROVED_TOUR_SLUGS.length,
      { timeout: APP_TIMEOUT }
    );

    const tourData = await page.evaluate(() => JSON.parse(document.querySelector('#atlas-presentation-data')?.textContent || '{}').tours || []);

    for (const slug of APPROVED_TOUR_SLUGS) {
      if (await page.locator('#tourDialog').isHidden()) {
        await page.locator('#tourBtn').click();
        await page.waitForFunction(
          expected => !document.querySelector('#tourDialog')?.hidden && document.querySelectorAll('[data-tour-slug]').length === expected,
          APPROVED_TOUR_SLUGS.length,
          { timeout: APP_TIMEOUT }
        );
      }
      const item = page.locator(`[data-tour-slug="${slug}"]`).first();
      assert.equal(await item.count(), 1, `curated tours runtime is missing approved slug ${slug}`);
      assert.equal(await item.isVisible(), true, `curated tour ${slug} is not visible after opening the tour runtime`);
      assert.equal(await item.getAttribute('aria-current'), 'false', `fresh tour chooser marked ${slug} current before selection`);
      assert.equal(await item.getAttribute('aria-pressed'), 'false', `fresh tour chooser pressed ${slug} before selection`);
      await item.click();
      await page.waitForFunction(
        expected => {
          const selected = document.querySelector(`[data-tour-slug="${expected}"]`);
          const active = selected?.getAttribute('aria-current') === 'true' || selected?.getAttribute('aria-pressed') === 'true';
          const state = document.querySelector('[data-tour-active]')?.getAttribute('data-tour-active') === expected;
          return active || state;
        },
        slug,
        { timeout: APP_TIMEOUT }
      );
      assert.equal(await page.locator('#tourDialog').getAttribute('data-tour-active'), slug, `explicit tour card click did not start ${slug}`);
      const tour = tourData.find(candidate => candidate.slug === slug);
      assert.ok(tour?.steps?.length >= 2, `${slug} has too few steps to exercise restoration`);
      for (const [index, step] of tour.steps.entries()) {
        await page.waitForFunction(({ expectedSlug, expectedStep }) => {
          const meta = document.querySelector('#tourStepMeta')?.textContent || '';
          return document.querySelector('#tourDialog')?.dataset.tourActive === expectedSlug && meta.includes(`step ${expectedStep} of`);
        }, { expectedSlug: slug, expectedStep: index + 1 });
        assert.equal(await page.locator('#tourStepNarration').textContent(), step.narration, `${slug} step ${index + 1} narration drifted`);
        assert.match(await page.locator('#tourAnnouncement').textContent(), new RegExp(`step ${index + 1} of ${tour.steps.length}`, 'u'));
        if (index < tour.steps.length - 1) {
          await page.locator('#tourNext').click();
        } else {
          await page.locator('#tourNext').click();
          await page.waitForFunction(() => document.querySelector('#tourDialog')?.hidden === true);
          await waitForFocus(page, '#tourBtn');
        }
      }
    }
    session.assertClean();
  });

  test('Ctrl/Cmd+K command palette opens with focus and closes on Escape', async testContext => {
    const session = await makeSession(testContext);
    const { page } = session;

    await navigate(page, '', '?smoke=command-palette');
    await waitForApp(page);
    const palette = page.locator('#commandPalette,[data-command-palette]').first();
    assert.ok(await palette.count(), explicitContractError('command palette', 'expected #commandPalette or [data-command-palette]'));
    const paletteInput = palette.locator('#commandPaletteInput,[data-command-palette-input],input,[role="combobox"]').first();
    assert.ok(await paletteInput.count(), explicitContractError('command palette', 'expected a focusable input or combobox'));

    for (const modifier of ['Control', 'Meta']) {
      await page.locator('#q').focus();
      await page.keyboard.press(`${modifier}+k`);
      await page.waitForFunction(() => {
        const element = document.querySelector('#commandPalette,[data-command-palette]');
        return Boolean(element) && !element.hasAttribute('hidden') && getComputedStyle(element).display !== 'none';
      }, undefined, { timeout: APP_TIMEOUT });
      assert.equal(await paletteInput.evaluate(element => element === document.activeElement), true, `${modifier}+K did not move focus into the command palette`);
      await paletteInput.fill('transformer');
      assert.equal(await paletteInput.evaluate(element => element === document.activeElement), true, `${modifier}+K palette lost input focus while filtering`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => {
        const element = document.querySelector('#commandPalette,[data-command-palette]');
        return !element || element.hasAttribute('hidden') || getComputedStyle(element).display === 'none';
      }, undefined, { timeout: APP_TIMEOUT });
      await waitForFocus(page, '#q');
    }
    session.assertClean();
  });

  test('0 fits the active view while physical Shift+0 fits the whole map', async testContext => {
    const session = await makeSession(testContext);
    const { page } = session;

    await navigate(page, '#status=f', '?smoke=fit-shortcuts');
    await waitForApp(page);
    const readTransform = () => page.locator('#world').getAttribute('transform');
    const waitForTransformChange = previous => page.waitForFunction(
      previousTransform => document.querySelector('#world')?.getAttribute('transform') !== previousTransform,
      previous,
      { timeout: APP_TIMEOUT }
    );
    const focusMapNode = async () => {
      const target = page.locator('#anchorLabels .anchorLabel[tabindex="0"]').first();
      assert.equal(await target.count(), 1, 'fit shortcut test requires a focusable visible map anchor');
      await target.focus();
      assert.equal(await target.evaluate(element => element === document.activeElement), true, 'map anchor did not receive focus before shortcut');
    };

    const initial = await readTransform();
    await page.locator('#zin').click();
    await waitForTransformChange(initial);
    const zoomed = await readTransform();
    assert.notEqual(zoomed, initial, 'zoom control must change the camera before testing ordinary 0');
    await focusMapNode();
    await page.keyboard.press('0');
    await waitForTransformChange(zoomed);
    const visibleFit = await readTransform();
    assert.notEqual(visibleFit, zoomed, 'ordinary 0 must fit the active filtered view');

    await page.locator('#zin').click();
    await waitForTransformChange(visibleFit);
    const shiftedZoomed = await readTransform();
    await focusMapNode();
    await page.keyboard.press('Shift+0');
    await waitForTransformChange(shiftedZoomed);
    const wholeFit = await readTransform();
    assert.notEqual(wholeFit, shiftedZoomed, 'Shift+0 must change a zoomed camera');
    assert.notEqual(wholeFit, visibleFit, 'Shift+0 must fit the whole map instead of the active filter');

    await page.locator('#zin').click();
    await waitForTransformChange(wholeFit);
    const layoutShiftedZoomed = await readTransform();
    await focusMapNode();
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        code: 'Digit0',
        key: ')',
        shiftKey: true
      }));
    });
    await waitForTransformChange(layoutShiftedZoomed);
    const layoutShiftedWholeFit = await readTransform();
    assert.notEqual(layoutShiftedWholeFit, layoutShiftedZoomed, 'layout-shifted Shift+0 must change a zoomed camera');
    assert.equal(layoutShiftedWholeFit, wholeFit, 'Shift+0 must use the physical Digit0 code when the layout changes its key value');
    session.assertClean();
  });

  test('extended hostile Map -> All -> trace -> overview -> filters -> era -> questions -> views sequence stays below 8000', async testContext => {
    const session = await makeSession(testContext);
    const { page } = session;
    const samples = [];

    await navigate(page, '', '?smoke=hostile-sequence');
    await waitForApp(page);
    await switchView(page, 'map');
    await assertCurrentView(page, 'map');
    await recordDomCount(page, samples, 'hostile Map');

    await page.locator('#modeSeg button[data-m="all"]').click();
    await page.waitForFunction(() => document.querySelector('#modeSeg button[data-m="all"]')?.getAttribute('aria-pressed') === 'true');
    await assertCurrentView(page, 'map');
    await recordDomCount(page, samples, 'hostile All');

    await navigate(page, '#trace=transformer&mode=all', '?smoke=hostile-transformer-trace');
    await waitForApp(page);
    await zoomToSemanticLevel(page, 'detail');
    assert.equal(await page.locator('#svg').evaluate(element => element.classList.contains('detail')), true, 'Transformer trace did not reach detail semantic zoom');
    const pooled = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('#edgesBackbone path[data-relationship-id],#edgesAll path[data-relationship-id],#edgesHi path[data-relationship-id]')].map(path => path.dataset.relationshipId);
      return { count: ids.length, unique: new Set(ids).size };
    });
    assert.deepEqual(pooled, { count: 711, unique: 711 }, 'Transformer trace All mode must pool each canonical relationship exactly once');
    await recordDomCount(page, samples, 'hostile Transformer trace');

    await page.locator('#fitAllBtn').click();
    await waitForSemanticZoom(page, 'overview');
    assert.equal(await page.locator('#svg').evaluate(element => element.classList.contains('trace-active')), true, 'semantic zoom must preserve the active Transformer trace');
    assert.equal(await page.locator('#edgesAll path').count(), 0, 'overview must not render contextual relationship paths');
    assert.ok(await page.locator('#edgesHi path').count() > 0, 'overview must retain highlighted lineage relationships');
    await recordDomCount(page, samples, 'hostile trace overview');

    await openControls(page);
    await page.locator('#chips .chip[data-s="d"]').click();
    await page.waitForFunction(() => document.querySelector('#filterChip')?.textContent.includes('shown'));
    await recordDomCount(page, samples, 'hostile filtered trace');
    await page.locator('#resetFiltersBtn').click();
    await page.waitForFunction(() => document.querySelector('#chips .chip[data-s="d"]')?.getAttribute('aria-pressed') === 'true');
    await recordDomCount(page, samples, 'hostile reset filters');

    await page.locator('#controlsBtn').click();
    await page.waitForFunction(() => document.querySelector('#controlsBtn')?.getAttribute('aria-expanded') === 'false');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#svg')?.classList.contains('trace-active'));
    assert.deepEqual(await page.evaluate(() => ({
      backbone: document.querySelectorAll('#edgesBackbone path[data-relationship-id]').length,
      all: document.querySelectorAll('#edgesAll path[data-relationship-id]').length,
      active: document.querySelectorAll('#edgesHi path[data-relationship-id]').length
    })), { backbone: 72, all: 0, active: 0 }, 'clearing the trace must restore only the 72-path orientation spine');

    await page.locator('#eraSelect').selectOption('0');
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'era');
    assert.ok(await page.locator('.eraCard').count() > 0, 'era lens did not render cards in hostile sequence');
    await recordDomCount(page, samples, 'hostile era lens');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#inspector')?.getAttribute('data-mode') !== 'era');

    await page.locator('#unfinishedBtn').click({ force: true });
    await page.waitForFunction(() => document.body.dataset.view === 'list' && !document.querySelector('#questionDeck')?.hidden);
    assert.equal(await page.locator('.questionCard').count(), 12);
    await recordDomCount(page, samples, 'hostile question deck');
    await page.locator('#questionDeckClose').click();
    await page.waitForFunction(() => document.querySelector('#questionDeck')?.hidden);

    await switchView(page, 'opportunity');
    await assertCurrentView(page, 'opportunity');
    await recordDomCount(page, samples, 'hostile Opportunity');

    await switchView(page, 'network');
    await assertCurrentView(page, 'network');
    await recordDomCount(page, samples, 'hostile Network');

    await switchView(page, 'list');
    await assertCurrentView(page, 'list');
    await recordDomCount(page, samples, 'hostile List');

    await switchView(page, 'map');
    await assertCurrentView(page, 'map');
    await recordDomCount(page, samples, 'hostile Map final');
    assert.deepEqual(await page.evaluate(() => ({
      backbone: document.querySelectorAll('#edgesBackbone path[data-relationship-id]').length,
      all: document.querySelectorAll('#edgesAll path[data-relationship-id]').length,
      active: document.querySelectorAll('#edgesHi path[data-relationship-id]').length
    })), { backbone: 72, all: 0, active: 0 }, 'final Map must teardown trace and restore the 72-path orientation spine');
    assert.ok(samples.every(sample => sample.count <= 8000), `hostile sequence exceeded 8000 active DOM elements: ${JSON.stringify(samples)}`);
    session.assertClean();
  });

  test('responsive acceptance matrix keeps layout, controls, touch targets, and surfaces usable', async testContext => {
    for (const viewport of RESPONSIVE_MATRIX) {
      const session = await makeSession(testContext, { viewport });
      const { page } = session;
      const label = `${viewport.width}x${viewport.height}`;

      await navigate(page, '', `?smoke=responsive-${label}`);
      await waitForApp(page);

      const initial = await page.evaluate(() => {
        const visible = element => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const rect = selector => {
          const element = document.querySelector(selector);
          if (!element || !visible(element)) return null;
          const box = element.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
        };
        return {
          viewport: { width: innerWidth, height: innerHeight },
          horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
          controlsDisplay: getComputedStyle(document.querySelector('#controls')).display,
          secondaryVisible: visible(document.querySelector('#secondaryControls')),
          primaryVisible: visible(document.querySelector('#viewSeg')),
          quickPrimaryVisible: visible(document.querySelector('#quickPrimary')),
          quickPrimaryParent: document.querySelector('#quickPrimary')?.parentElement?.id || null,
          quickPrimaryButtons: [...document.querySelectorAll('#quickPrimary > button')].filter(visible).map(button => button.id),
          quickButtonParents: Object.fromEntries(['themeBtn', 'shareBtn', 'diffBtn', 'helpBtn', 'tourBtn', 'unfinishedBtn'].map(id => [id, document.getElementById(id)?.parentElement?.id || null])),
          compactLongTitle: getComputedStyle(document.querySelector('#title .titleLong')).display,
          compactShortEdition: getComputedStyle(document.querySelector('#editionBadge .editionShort')).display,
          compactShortControls: getComputedStyle(document.querySelector('#controlsBtn .controlsShort')).display,
          header: rect('#bar'),
          stage: rect('#stage')
        };
      });
      assert.ok(initial.horizontalOverflow <= 1, `${label} has ${initial.horizontalOverflow}px document horizontal overflow`);
      assert.ok(initial.header && initial.stage, `${label} is missing the header or stage surface`);
      assert.ok(initial.header.bottom <= initial.stage.top + 1, `${label} header overlaps the stage by more than 1px`);
      assert.equal(initial.primaryVisible, viewport.width >= 741, `${label} primary view switcher visibility is incorrect`);
      if (viewport.width >= 741) {
        assert.notEqual(initial.controlsDisplay, 'none', `${label} desktop/tablet controls were hidden`);
        assert.equal(initial.secondaryVisible, false, `${label} secondary controls should start closed`);
        assert.equal(initial.quickPrimaryVisible, true, `${label} quick primary controls should remain visible`);
        assert.equal(initial.quickPrimaryParent, 'primaryControls', `${label} quick primary controls left the primary controls group`);
        const expectedQuickButtons = viewport.width >= 1280
          ? ['themeBtn', 'shareBtn', 'diffBtn', 'helpBtn', 'tourBtn', 'unfinishedBtn']
          : viewport.width >= 1024
            ? ['themeBtn', 'shareBtn', 'helpBtn']
            : ['themeBtn'];
        assert.deepEqual(initial.quickPrimaryButtons, expectedQuickButtons, `${label} quick-primary buttons drifted from the approved breakpoint contract`);
        const expectedQuickButtonParents = viewport.width >= 1280
          ? Object.fromEntries(expectedQuickButtons.map(id => [id, 'quickPrimary']))
          : viewport.width >= 1024
            ? { themeBtn: 'quickPrimary', shareBtn: 'quickPrimary', helpBtn: 'quickPrimary', diffBtn: 'secondaryControls', tourBtn: 'secondaryControls', unfinishedBtn: 'secondaryControls' }
            : { themeBtn: 'quickPrimary', shareBtn: 'secondaryControls', diffBtn: 'secondaryControls', helpBtn: 'secondaryControls', tourBtn: 'secondaryControls', unfinishedBtn: 'secondaryControls' };
        for (const [id, parent] of Object.entries(expectedQuickButtonParents)) {
          assert.equal(initial.quickButtonParents[id], parent, `${label} ${id} is not in the approved More/quick-primary slot`);
        }
      } else {
        assert.equal(initial.controlsDisplay, 'none', `${label} compact controls should start behind the menu`);
        assert.equal(initial.secondaryVisible, false, `${label} secondary controls should start closed`);
        assert.equal(initial.compactLongTitle, 'none', `${label} long header title should be compacted`);
        assert.notEqual(initial.compactShortEdition, 'none', `${label} compact edition badge is missing`);
        assert.notEqual(initial.compactShortControls, 'none', `${label} compact controls label is missing`);
      }

      await page.locator('#controlsBtn').click();
      await page.waitForFunction(() => document.querySelector('#controls')?.classList.contains('open'));
      await page.waitForFunction(() => document.querySelector('#secondaryControls')?.getAttribute('aria-hidden') === 'false');
      assert.equal(await page.locator('#secondaryControls').isVisible(), true, `${label} secondary controls did not open`);
      if (viewport.width >= 741) {
        assert.equal(await page.locator('#quickPrimary').isVisible(), true, `${label} quick primary controls disappeared after More opened`);
        assert.equal(await page.locator('#quickPrimary').evaluate(element => element.parentElement?.id), 'primaryControls', `${label} quick primary controls left the primary controls group after More opened`);
      }

      if (viewport.width <= 740) {
        const chipsOverflow = await page.locator('#chips').evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
        assert.ok(chipsOverflow.scrollWidth <= chipsOverflow.clientWidth + 1, `${label} chips overflow horizontally (${chipsOverflow.scrollWidth}px > ${chipsOverflow.clientWidth}px)`);
        const touchTargets = await page.evaluate(() => {
          const visible = element => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
          };
          return [...document.querySelectorAll('#bar a[href], #bar button, #bar input, #controls.open .btn, #controls.open .chip, #controls.open .seg button, #controls.open #auditFilter, #controls.open #researchFilter')]
            .filter(visible)
            .map(element => {
              const rect = element.getBoundingClientRect();
              return { id: element.id || element.getAttribute('aria-label') || element.textContent.trim().slice(0, 30), width: rect.width, height: rect.height };
            });
        });
        assert.ok(touchTargets.length > 0, `${label} exposed no measurable compact touch targets`);
        for (const target of touchTargets) {
          assert.ok(target.width >= 44 - 0.01 && target.height >= 44 - 0.01, `${label} target ${target.id} is ${target.width}x${target.height}px, below the 44px touch contract`);
        }

        if (viewport.width === 375) {
          await switchView(page, 'list');
          const listDescription = await page.locator('.nodeListDesc').first().evaluate(element => {
            const row = element.closest('tr');
            const rowStyle = getComputedStyle(row);
            const rowBox = row.getBoundingClientRect();
            const rowContentWidth = rowBox.width - parseFloat(rowStyle.paddingLeft) - parseFloat(rowStyle.paddingRight);
            return { descriptionWidth: element.getBoundingClientRect().width, rowContentWidth };
          });
          assert.ok(listDescription.descriptionWidth >= listDescription.rowContentWidth * 0.8, `${label} first list description is trapped in the label column (${listDescription.descriptionWidth}px of ${listDescription.rowContentWidth}px)`);
        }
      }

      await openControls(page);
      await page.keyboard.press('Escape');
      await page.waitForFunction(
        () => !document.querySelector('#controls')?.classList.contains('open'),
        undefined,
        { timeout: APP_TIMEOUT }
      );
      await waitForFocus(page, '#controlsBtn');
      await openControls(page);
      await page.locator('#helpBtn').click();
      await page.waitForFunction(() => document.querySelector('#legend')?.getAttribute('aria-hidden') === 'false');

      const surfaces = await page.evaluate(() => {
        const read = selector => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return null;
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
        };
        const overlapArea = (left, right) => {
          if (!left || !right) return 0;
          return Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) * Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
        };
        return {
          viewport: { width: innerWidth, height: innerHeight },
          header: read('#bar'),
          stage: read('#stage'),
          guide: read('#legend'),
          inspector: read('#inspector'),
          guideClass: document.querySelector('#legend')?.className || '',
          guideInspectorOverlap: overlapArea(read('#legend'), read('#inspector'))
        };
      });
      assert.ok(surfaces.guide, `${label} guide did not become visible`);
      for (const [name, surface] of Object.entries({ guide: surfaces.guide, inspector: surfaces.inspector })) {
        if (!surface) continue;
        assert.ok(surface.left >= -1 && surface.top >= -1, `${label} ${name} surface escapes the viewport at top/left`);
        assert.ok(surface.right <= surfaces.viewport.width + 1 && surface.bottom <= surfaces.viewport.height + 1, `${label} ${name} surface escapes the viewport at right/bottom`);
        assert.ok(surface.top >= surfaces.header.bottom - 1, `${label} ${name} surface overlaps the header`);
      }
      if (surfaces.inspector) {
        const inspectorArea = surfaces.inspector.width * surfaces.inspector.height;
        assert.ok(surfaces.guideInspectorOverlap <= inspectorArea * 0.2, `${label} guide and inspector grossly overlap`);
      }
      if (viewport.width <= 740) {
        const guideTargets = await page.evaluate(() => [...document.querySelectorAll('#legend button')].filter(element => {
          const style = getComputedStyle(element), rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        }).map(element => ({ id: element.id || element.textContent.trim().slice(0, 30), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
        for (const target of guideTargets) {
          assert.ok(target.width >= 44 - 0.01 && target.height >= 44 - 0.01, `${label} guide target ${target.id} is below the 44px touch contract`);
        }
      }
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelector('#legend')?.getAttribute('aria-hidden') === 'true');
      session.assertClean();
    }
  });

  test('mobile renders all four views and keeps menu focus behavior intact', async testContext => {
    const session = await makeSession(testContext, {
      hasTouch: true,
      isMobile: true,
      viewport: { width: 375, height: 812 }
    });
    const { page } = session;
    const domSamples = [];

    await navigate(page);
    await waitForApp(page);
    await assertCurrentView(page, 'map');
    const mobileOrientation = await page.evaluate(() => {
      const row = document.querySelector('#mobileOrientation');
      const selector = document.querySelector('#eraSelect');
      const rowBox = row?.getBoundingClientRect();
      const selectorBox = selector?.getBoundingClientRect();
      return {
        rowVisible: row ? getComputedStyle(row).display !== 'none' : false,
        rowHeight: rowBox?.height ?? 0,
        selectorHeight: selectorBox?.height ?? 0,
        selectorOptions: selector?.options.length ?? 0,
        eraHud: getComputedStyle(document.querySelector('#eraHud')).display,
        laneHud: getComputedStyle(document.querySelector('#laneHud')).display,
        visibleDateTags: [...document.querySelectorAll('#eraHud .dateRulerTag')].filter(element => getComputedStyle(element).display !== 'none').length,
        documentOverflow: document.documentElement.scrollWidth - innerWidth
      };
    });
    assert.equal(mobileOrientation.rowVisible, true, 'mobile map is missing the compact orientation row');
    assert.ok(mobileOrientation.rowHeight >= 44 - 0.01, 'mobile orientation row misses the 44px target height');
    assert.ok(mobileOrientation.selectorHeight >= 44 - 0.01, 'mobile era selector misses the 44px target height');
    assert.equal(mobileOrientation.selectorOptions, 13, 'mobile era selector must retain all 13 eras');
    assert.equal(mobileOrientation.eraHud, 'none', 'mobile map must not show the desktop era rail');
    assert.equal(mobileOrientation.laneHud, 'none', 'mobile map must not show the desktop lane rail');
    assert.equal(mobileOrientation.visibleDateTags, 0, 'mobile map must not show desktop date labels');
    assert.ok(mobileOrientation.documentOverflow <= 1, 'mobile orientation row creates horizontal page overflow');
    await recordDomCount(page, domSamples, 'mobile Timeline');

    await page.locator('#controlsBtn').focus();
    await page.locator('#controlsBtn').click();
    assert.equal(await page.locator('#controlsBtn').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#controls').evaluate(element => element.classList.contains('open')), true);
    assert.equal(await page.locator('#secondaryControls').getAttribute('aria-hidden'), 'false');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#controlsBtn')?.getAttribute('aria-expanded') === 'false');
    await waitForFocus(page, '#controlsBtn');

    for (const [view, focusTarget] of [
      ['list', '#listView'],
      ['network', '#networkView'],
      ['opportunity', '#opportunityView'],
      ['map', '#controlsBtn']
    ]) {
      await switchView(page, view);
      await assertCurrentView(page, view);
      await waitForFocus(page, focusTarget);
      await recordDomCount(page, domSamples, `mobile ${view}`);
    }

    assert.ok(Math.max(...domSamples.map(sample => sample.count)) <= DOM_BUDGET);
    session.assertClean();
  });

  test('pinned era labels stay collision-free at the reviewed boundary widths', async testContext => {
    for (const width of [1280, 1109, 1024, 1023, 960, 741, 740, 375]) {
      const session = await makeSession(testContext, { viewport: { width, height: width <= 740 ? 480 : 768 } });
      const { page } = session;
      await navigate(page, '#view=map', `?smoke=era-culling-${width}`);
      await waitForApp(page);
      const metrics = await page.evaluate(() => {
        const visible = element => Boolean(element) && getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0;
        const eraTags = [...document.querySelectorAll('#eraHud .eraTag')].filter(visible).map(element => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        }).sort((a, b) => a.left - b.left);
        const overlaps = eraTags.some((tag, index) => index > 0 && tag.left < eraTags[index - 1].right + 9);
        return {
          eraTags,
          overlaps,
          dateTags: [...document.querySelectorAll('#eraHud .dateRulerTag')].filter(visible).length,
          options: document.querySelectorAll('#eraSelect option').length,
          mobileRow: visible(document.querySelector('#mobileOrientation')),
          desktopRails: [document.querySelector('#eraHud'), document.querySelector('#laneHud')].map(visible),
          overflow: document.documentElement.scrollWidth - innerWidth
        };
      });
      assert.equal(metrics.overlaps, false, `${width}px era labels overlap`);
      assert.ok(metrics.dateTags <= 32, `${width}px date ruler exceeds 32 labels`);
      assert.equal(metrics.options, 13, `${width}px era selector lost an era`);
      if (width <= 740) {
        assert.equal(metrics.mobileRow, true, `${width}px compact orientation row is missing`);
        assert.deepEqual(metrics.desktopRails, [false, false], `${width}px desktop rails remain visible`);
      }
      assert.ok(metrics.overflow <= 1, `${width}px orientation surfaces create horizontal overflow`);
      session.assertClean();
    }
  });

  test('date, lane, and compact orientation surfaces stay pinned through map state changes', async testContext => {
    const readPinnedSurfaces = page => page.evaluate(() => {
      const read = selector => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { position: getComputedStyle(element).position, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      return { era: read('#eraHud'), lane: read('#laneHud'), mobile: read('#mobileOrientation'), overflow: document.documentElement.scrollWidth - innerWidth, viewportWidth: innerWidth };
    });
    const assertPinned = (surfaces, label) => {
      for (const [name, surface] of Object.entries(surfaces)) {
        if (name === 'overflow' || name === 'viewportWidth' || !surface || surface.width === 0) continue;
        assert.equal(surface.position, 'fixed', `${label} ${name} surface is no longer viewport-pinned`);
        assert.ok(surface.left >= -1 && surface.right <= surfaces.viewportWidth + 1, `${label} ${name} surface escaped its viewport`);
      }
      assert.ok(surfaces.overflow <= 1, `${label} pinned surfaces created horizontal overflow`);
    };

    const desktop = await makeSession(testContext, { viewport: { width: 1024, height: 768 } });
    const page = desktop.page;
    await navigate(page, '#view=map', '?smoke=pinned-map-surfaces');
    await waitForApp(page);
    assertPinned(await readPinnedSurfaces(page), 'initial desktop');
    const stage = await page.locator('#stage').boundingBox();
    assert.ok(stage, 'desktop stage missing for pinned-surface pan');
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await page.mouse.down();
    await page.mouse.move(stage.x + 32, stage.y + stage.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(80);
    assertPinned(await readPinnedSurfaces(page), 'after pan and scale');
    await page.locator('#eraSelect').focus();
    await page.locator('#eraSelect').selectOption('0');
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'era');
    assertPinned(await readPinnedSurfaces(page), 'era lens');
    await page.keyboard.press('Escape');
    await page.locator('#helpBtn').click();
    await page.waitForFunction(() => document.querySelector('#legend')?.classList.contains('open'));
    assertPinned(await readPinnedSurfaces(page), 'guide');
    await page.keyboard.press('Escape');
    desktop.assertClean();

    const mobile = await makeSession(testContext, { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
    const mobilePage = mobile.page;
    await navigate(mobilePage, '#view=map', '?smoke=pinned-mobile-orientation');
    await waitForApp(mobilePage);
    const initialMobile = await readPinnedSurfaces(mobilePage);
    assert.equal(initialMobile.mobile?.position, 'fixed');
    assert.ok(initialMobile.mobile?.height >= 44, 'mobile orientation row is below its 44px target');
    assert.match(await mobilePage.locator('#mobileEraOrientation').textContent(), /.+/u);
    assert.match(await mobilePage.locator('#mobileLaneOrientation').textContent(), /.+/u);
    await mobilePage.locator('#controlsBtn').click();
    await mobilePage.locator('#zin').click();
    await mobilePage.keyboard.press('Escape');
    await mobilePage.waitForFunction(() => !document.querySelector('#controls')?.classList.contains('open'));
    await waitForFocus(mobilePage, '#controlsBtn');
    await mobilePage.mouse.wheel(0, -80);
    await mobilePage.waitForTimeout(80);
    const afterMobileScale = await readPinnedSurfaces(mobilePage);
    assert.equal(afterMobileScale.mobile?.position, 'fixed');
    assert.ok(afterMobileScale.mobile?.top >= 55 && afterMobileScale.mobile?.bottom <= 150, 'mobile orientation row moved out of its pinned header slot');
    assert.ok(afterMobileScale.overflow <= 1, 'mobile orientation row created horizontal overflow');
    mobile.assertClean();
  });

  test('narrow detail and compact filter surfaces avoid horizontal overflow', async testContext => {
    const mobileSession = await makeSession(testContext, {
      hasTouch: true,
      isMobile: true,
      viewport: { width: 375, height: 812 }
    });
    const { page } = mobileSession;

    for (const query of ['?smoke=responsive-panel', '?embed=1&smoke=responsive-panel-embed']) {
      await navigate(page, '#view=map&node=transformer', query);
      await waitForApp(page);
      await page.waitForFunction(() => document.querySelector('#panel')?.getAttribute('aria-hidden') === 'false');
      const panelOverflow = await page.evaluate(() => {
        const read = selector => {
          const element = document.querySelector(selector);
          return element ? { scrollWidth: element.scrollWidth, clientWidth: element.clientWidth } : null;
        };
        return {
          document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: innerWidth },
          panel: read('#panel'),
          body: read('#pBody'),
          actions: read('#pActions'),
          actionButtons: [...document.querySelectorAll('#pActions .btn')].filter(element => getComputedStyle(element).display !== 'none').map(element => {
            const rect = element.getBoundingClientRect();
            return { label: element.textContent.trim(), left: rect.left, right: rect.right, width: rect.width, height: rect.height };
          })
        };
      });
      for (const [surface, bounds] of Object.entries({ panel: panelOverflow.panel, body: panelOverflow.body, actions: panelOverflow.actions })) {
        assert.ok(bounds, `${query} missing ${surface}`);
        assert.ok(bounds.scrollWidth <= bounds.clientWidth + 1, `${query} ${surface} overflows horizontally (${bounds.scrollWidth}px > ${bounds.clientWidth}px)`);
      }
      assert.ok(panelOverflow.document.scrollWidth <= panelOverflow.document.clientWidth + 1, `${query} document overflows horizontally`);
      for (const button of panelOverflow.actionButtons) {
        assert.ok(button.left >= -1 && button.right <= 376, `${query} action ${button.label} escapes the viewport`);
        assert.ok(button.height >= 44 - 0.01, `${query} action ${button.label} is below the 44px touch target`);
      }
    }

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#panel')?.getAttribute('aria-hidden') === 'true');
    await navigate(page, '#view=map', '?smoke=responsive-connection-menu');
    await waitForApp(page);
    await openControls(page);
    const connectionMenu = await page.evaluate(() => {
      const group = document.querySelector('#connectionPrimary');
      const segment = document.querySelector('#modeSeg');
      const groupBox = group?.getBoundingClientRect();
      const segmentBox = segment?.getBoundingClientRect();
      const buttons = [...document.querySelectorAll('#modeSeg button')].map(element => {
        const rect = element.getBoundingClientRect();
        return { label: element.textContent.trim(), left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      });
      return {
        group: group ? { left: groupBox.left, right: groupBox.right } : null,
        segment: segment ? { scrollWidth: segment.scrollWidth, clientWidth: segment.clientWidth, left: segmentBox.left, right: segmentBox.right } : null,
        buttons
      };
    });
    assert.equal(connectionMenu.buttons.length, 3, 'compact connection menu must expose Off, Related, and All');
    assert.ok(connectionMenu.group, 'compact connection group is missing');
    assert.ok(connectionMenu.segment, 'compact connection segment is missing');
    assert.ok(connectionMenu.segment.left <= connectionMenu.group.left + 1, 'compact connection segment drifted right inside its group');
    assert.ok(connectionMenu.segment.scrollWidth <= connectionMenu.segment.clientWidth + 1, 'compact connection segment overflows horizontally');
    for (const button of connectionMenu.buttons) {
      assert.ok(button.left >= -1 && button.right <= 376, `compact connection button ${button.label} is clipped`);
      assert.ok(button.width >= 44 - 0.01 && button.height >= 44 - 0.01, `compact connection button ${button.label} misses the touch target`);
    }
    mobileSession.assertClean();

    const tabletSession = await makeSession(testContext, { viewport: { width: 741, height: 800 } });
    const tabletPage = tabletSession.page;
    await navigate(tabletPage, '#view=map', '?smoke=responsive-tablet-filters');
    await waitForApp(tabletPage);
    await openControls(tabletPage);
    const tabletFilters = await tabletPage.evaluate(() => {
      const panel = document.querySelector('#secondaryControls');
      const chips = document.querySelector('#chips');
      const chipButtons = [...document.querySelectorAll('#chips .chip')].filter(element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      }).map(element => {
        const rect = element.getBoundingClientRect();
        return { label: element.textContent.trim(), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      });
      return {
        panel: panel ? { scrollWidth: panel.scrollWidth, clientWidth: panel.clientWidth } : null,
        chips: chips ? { scrollWidth: chips.scrollWidth, clientWidth: chips.clientWidth } : null,
        chipButtons
      };
    });
    assert.equal(tabletFilters.chipButtons.length, 7, 'tablet More panel must show all seven editorial status chips');
    for (const [surface, bounds] of Object.entries({ panel: tabletFilters.panel, chips: tabletFilters.chips })) {
      assert.ok(bounds, `tablet More panel is missing ${surface}`);
      assert.ok(bounds.scrollWidth <= bounds.clientWidth + 1, `tablet ${surface} overflows horizontally (${bounds.scrollWidth}px > ${bounds.clientWidth}px)`);
    }
    for (const chip of tabletFilters.chipButtons) {
      assert.ok(chip.left >= -1 && chip.right <= 742, `tablet chip ${chip.label} is clipped`);
    }
    tabletSession.assertClean();
  });

  test('JavaScript-disabled mobile view exposes the complete static index', async testContext => {
    const session = await makeSession(testContext, {
      javaScriptEnabled: false,
      viewport: { width: 375, height: 812 }
    });
    const { page } = session;

    await navigate(page);
    assert.equal(await page.locator('html').evaluate(element => element.classList.contains('no-js')), true);
    assert.equal(await page.locator('#noscriptIdentity').isVisible(), true);
    assert.equal(await page.locator('#noscript').isVisible(), true);
    assert.equal(await page.locator('#noscript .staticIndex tbody tr').count(), EXPECTED.atlasNodes);

    const citation = new URL(await page.locator('#nsCitationLink').getAttribute('href'), page.url());
    const manifest = new URL(await page.locator('#nsManifestLink').getAttribute('href'), page.url());
    assert.equal(citation.origin, baseOrigin);
    assert.equal(citation.pathname, `${MOUNT_PATH}CITATION.cff`);
    assert.equal(manifest.origin, baseOrigin);
    assert.equal(manifest.pathname, `${MOUNT_PATH}release-manifest.json`);
    assert.match(await page.locator('#nsRepositoryLink').getAttribute('href'), /^https:\/\/github\.com\//);
    assert.match(await page.locator('#nsContributeLink').getAttribute('href'), /^https:\/\/github\.com\//);

    await recordDomCount(page, [], 'JavaScript-disabled mobile index');
    session.assertClean();
  });

  test('read-only embed mode hides chrome, preserves atlas views, and round-trips state', async testContext => {
    const session = await makeSession(testContext);
    const { page } = session;

    await navigate(
      page,
      '#view=list&node=rbm&audit=fully_covered&mode=all&scale=linear&theme=light',
      '?embed=1&smoke=embed'
    );
    await waitForApp(page);

    assert.equal(new URL(page.url()).searchParams.get('embed'), '1');
    assert.equal(await page.locator('body').getAttribute('data-embed'), 'true');
    assert.equal(await page.locator('body').getAttribute('data-read-only'), 'true');
    assert.equal(await page.locator('#bar').isHidden(), true, 'embed mode exposed the application chrome');
    assert.equal(await page.locator('#legend').getAttribute('aria-hidden'), 'true', 'embed mode opened onboarding/guide UI');
    assert.equal(await page.locator('#panel').getAttribute('aria-hidden'), 'false');
    assert.equal(await page.locator('#pTitle').textContent(), 'Restricted Boltzmann machines');
    assert.equal(await page.locator('body').getAttribute('data-view'), 'list');
    assert.equal(await page.locator('body').getAttribute('data-theme'), 'light');
    assert.equal(await page.locator('#auditFilter').inputValue(), 'fully_covered');
    assert.equal(await page.locator('#modeSeg [data-m="all"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#scaleSeg [data-scale="linear"]').getAttribute('aria-pressed'), 'true');

    await navigate(page, '#view=map&tour=foundations-to-transformers&step=2&theme=light', '?embed=1&smoke=embed-tour');
    await waitForApp(page);
    assert.equal(await page.locator('[data-tour-active="foundations-to-transformers"]').count(), 1);

    const mutationRequests = [];
    page.on('request', request => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutationRequests.push(`${request.method()} ${request.url()}`);
    });
    assert.equal(await page.locator('[contenteditable="true"], [data-editable="true"]').count(), 0);
    await page.keyboard.press('Control+s');
    assert.deepEqual(mutationRequests, [], 'embed mode attempted a mutating request');

    for (const [view, root] of [['map', '#stage'], ['list', '#listView'], ['network', '#networkView'], ['opportunity', '#opportunityView']]) {
      await navigate(page, `#view=${view}&theme=light`, `?embed=1&smoke=embed-${view}`);
      await waitForApp(page);
      await page.waitForFunction(expected => document.body.dataset.view === expected, view, { timeout: APP_TIMEOUT });
      assert.equal(await page.locator(root).isVisible(), true, `embed mode could not access ${view} view`);
    }

    await navigate(page, '#view=map&theme=dark', '?smoke=normal-url');
    await waitForApp(page);
    assert.equal(new URL(page.url()).searchParams.has('embed'), false);
    assert.notEqual(await page.locator('#bar').isHidden(), true, 'normal URL incorrectly entered embed mode');
    assert.notEqual(await page.locator('body').getAttribute('data-read-only'), 'true');

    await page.locator('#skipList').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.body.dataset.view === 'list' && document.activeElement?.id === 'listView');
    assert.equal(await page.locator('#listView').isVisible(), true, 'skip-link navigation did not expose the list view');
    session.assertClean();
  });

  test('edition diff is lazy, semantic, polite, and focus-safe', async testContext => {
    const session = await makeSession(testContext);
    const { page } = session;
    const fingerprintRequests = [];
    page.on('request', request => {
      const requestUrl = new URL(request.url());
      if (requestUrl.pathname === `${MOUNT_PATH}data/editions/v1.0.0-fingerprints.json`) fingerprintRequests.push(request);
    });

    await navigate(page, '', '?smoke=edition-diff');
    await waitForApp(page);
    assert.equal(fingerprintRequests.length, 0, 'edition fingerprints were fetched before opening Diff');

    const diffButton = page.locator('#diffBtn,[data-diff-trigger],button').filter({ hasText: /diff|compare editions?/iu }).first();
    assert.equal(await diffButton.count(), 1, 'edition Diff control is missing');
    await diffButton.focus();
    const fingerprintResponsePromise = page.waitForResponse(
      response => {
        const requestUrl = new URL(response.url());
        return requestUrl.pathname === `${MOUNT_PATH}data/editions/v1.0.0-fingerprints.json` && response.request().method() === 'GET';
      },
      { timeout: APP_TIMEOUT }
    );
    await diffButton.click();
    const fingerprintResponse = await fingerprintResponsePromise;
    assert.equal(fingerprintResponse.status(), 200, 'edition fingerprint request did not succeed');
    await page.waitForFunction(() => {
      const dialog = document.querySelector('#diffDialog,[data-diff-dialog]');
      return Boolean(dialog) && !dialog.hidden && getComputedStyle(dialog).display !== 'none';
    }, undefined, { timeout: APP_TIMEOUT });
    assert.equal(fingerprintRequests.length, 1, 'opening Diff did not make exactly one fingerprint request');
    assert.equal(fingerprintRequests[0].method(), 'GET');
    assert.equal(new URL(fingerprintRequests[0].url()).origin, baseOrigin);

    const dialog = page.locator('#diffDialog,[data-diff-dialog]').first();
    const status = dialog.locator('#diffStatus,[data-diff-status],[role="status"]').first();
    assert.equal(await status.count(), 1, 'Diff is missing its polite status region');
    assert.equal(await status.getAttribute('aria-live'), 'polite');
    await page.waitForFunction(
      () => {
        const dialog = document.querySelector('#diffDialog,[data-diff-dialog]');
        return /0\s+(?:added|removed|changed)/iu.test(
          dialog?.querySelector('#diffStatus,[data-diff-status],[role="status"]')?.textContent ?? ''
        );
      },
      undefined,
      { timeout: APP_TIMEOUT }
    );
    assert.match(await status.textContent(), /0\s+(added|removed|changed)/iu);
    assert.match(await dialog.textContent(), /no semantic changes|0\s+added[\s,]+0\s+removed[\s,]+0\s+changed/iu);

    const closeButton = dialog.locator('#diffClose,[data-diff-close],button').filter({ hasText: /close|done/iu }).first();
    assert.equal(await closeButton.count(), 1, 'Diff is missing a close control');
    await closeButton.click();
    await page.waitForFunction(() => {
      const dialog = document.querySelector('#diffDialog,[data-diff-dialog]');
      return !dialog || dialog.hidden || getComputedStyle(dialog).display === 'none';
    }, undefined, { timeout: APP_TIMEOUT });
    await waitForFocus(page, '#diffBtn,[data-diff-trigger]');

    await diffButton.click();
    await page.waitForFunction(() => {
      const dialog = document.querySelector('#diffDialog,[data-diff-dialog]');
      return Boolean(dialog) && !dialog.hidden && getComputedStyle(dialog).display !== 'none';
    }, undefined, { timeout: APP_TIMEOUT });
    assert.equal(fingerprintRequests.length, 1, 'reopening Diff refetched the immutable baseline');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
      const dialog = document.querySelector('#diffDialog,[data-diff-dialog]');
      return !dialog || dialog.hidden || getComputedStyle(dialog).display === 'none';
    }, undefined, { timeout: APP_TIMEOUT });
    await waitForFocus(page, '#diffBtn,[data-diff-trigger]');
    session.assertClean();
  });

  test('representative static node page is crawlable without JavaScript and restores its atlas hash', async testContext => {
    const session = await makeSession(testContext, { javaScriptEnabled: false });
    const { page } = session;

    await page.goto(`${baseUrl}nodes/transformer/`, { timeout: APP_TIMEOUT, waitUntil: 'load' });
    assert.equal(await page.title(), 'Transformer — AI Research Tech Tree');
    assert.equal(await page.locator('script').count(), 0, 'static node page requires JavaScript');
    assert.equal(await page.locator('h1').textContent(), 'Transformer');
    for (const field of ['Year', 'Lane', 'Status']) {
      assert.equal(await page.locator('dt', { hasText: field }).count(), 1, `static node page is missing ${field}`);
    }
    assert.equal(await page.locator('#summary-title').textContent(), 'Summary');
    assert.equal(await page.locator('#works-title').textContent(), 'Works and sources');
    assert.ok((await page.locator('.sources').count()) >= 1, 'static node page is missing source entries');
    assert.equal(await page.locator('#evidence-title').textContent(), 'Evidence caveat');
    assert.equal(await page.locator('meta[property="og:title"]').getAttribute('content'), 'Transformer');
    assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'), 'https://neb6dav.github.io/ai_tech_tree/nodes/transformer/');
    assert.equal(await page.locator('meta[property="og:image"]').count(), 1);
    const returnLink = page.locator('a[href*="#node=transformer"]').first();
    assert.equal(await returnLink.count(), 1, 'static node page is missing its atlas return link');
    assert.equal(await returnLink.getAttribute('href'), '/ai_tech_tree/#node=transformer', 'static node page backlink must preserve the staged project mount');
    assert.equal(
      await page.locator('link[rel="alternate"][type="application/json"]').getAttribute('href'),
      '/ai_tech_tree/ai-research-tech-tree.json',
      'static node page canonical dataset link must preserve the staged project mount'
    );
    await returnLink.click();
    assert.equal(new URL(page.url()).hash, '#node=transformer');
    session.assertClean();
  });

  test('trace restoration, low-LOD previews, view teardown, and era lens contracts hold', async testContext => {
    const session = await makeSession(testContext);
    const { page } = session;

    await navigate(page, '#trace=transformer&node=gpt3', '?smoke=trace-no-camera');
    await waitForApp(page);
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'trace');
    const noCamera = await page.evaluate(() => ({
      camera: window.__AI_TREE_RESTORE_STATE__?.camera,
      transform: document.querySelector('#world')?.getAttribute('transform'),
      summary: document.querySelector('#inspector')?.textContent
    }));
    assert.equal(noCamera.camera.valid, false);
    assert.equal(await page.locator('#inspector h3').textContent(), 'Full lineage · Transformer', 'valid trace must win over a conflicting node hash');
    assert.match(noCamera.summary, /117 total nodes/);
    assert.match(noCamera.summary, /196 total relationships/);
    assert.doesNotMatch(noCamera.transform || '', /scale\(1\)$/u);

    await navigate(page, '#trace=transformer&cx=0&cy=0&z=1', '?smoke=trace-complete-camera');
    await waitForApp(page);
    const completeCamera = await page.evaluate(() => ({
      camera: window.__AI_TREE_RESTORE_STATE__?.camera,
      transform: document.querySelector('#world')?.getAttribute('transform')
    }));
    assert.equal(completeCamera.camera.valid, true);
    assert.match(completeCamera.transform || '', /scale\(1\)$/u);

    await navigate(page, '#trace=transformer&mode=off&cx=1000&cy=500&z=0.250', '?smoke=trace-roundtrip-camera');
    await waitForApp(page);
    await page.waitForFunction(() => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      return params.get('cx') && params.get('cy') && params.get('z') && document.querySelector('#inspector')?.dataset.mode === 'trace';
    });
    const roundTripCamera = await page.evaluate(() => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      return { cx: Number(params.get('cx')), cy: Number(params.get('cy')), z: Number(params.get('z')) };
    });
    assert.ok(Math.abs(roundTripCamera.cx - 1000) <= 0.2, `camera cx drifted to ${roundTripCamera.cx}`);
    assert.ok(Math.abs(roundTripCamera.cy - 500) <= 0.2, `camera cy drifted to ${roundTripCamera.cy}`);
    assert.ok(Math.abs(roundTripCamera.z - 0.25) <= 0.002, `camera z drifted to ${roundTripCamera.z}`);

    await navigate(page, '#trace=transformer&mode=off', '?smoke=trace-connections-off');
    await waitForApp(page);
    assert.ok(await page.locator('#edgesHi path').count() > 0, 'explicit trace must render with Connections Off');
    await openControls(page);
    await page.locator('#chips .chip[data-s="d"]').click();
    await page.waitForFunction(() => document.querySelector('#inspector')?.textContent.includes('filter-hidden'));
    assert.match(await page.locator('#inspector').textContent(), /filter-hidden/);
    await page.locator('#resetFiltersBtn').click();
    await page.waitForFunction(() => document.querySelector('#inspector')?.textContent.includes('0 filter-hidden'));
    await page.keyboard.press('Escape');
    await page.locator('#fitAllBtn').click();
    await waitForSemanticZoom(page, 'overview');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
    const lowLod = await page.evaluate(() => ({
      dots: document.querySelectorAll('#nodes .node.lit .ndot').length,
      labels: document.querySelectorAll('#traceLabels .traceLabel:not([aria-hidden="true"])').length,
      unlitCards: [...document.querySelectorAll('#nodes .node:not(.lit)')].filter(node => getComputedStyle(node).display !== 'none').length
    }));
    assert.ok(lowLod.dots > 0 && lowLod.labels > 0);
    assert.equal(lowLod.unlitCards, 0);

    const previewPoint = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('#traceLabels .traceLabel[data-node-id]')].filter(candidate => {
        if (candidate.dataset.nodeId === 'transformer' || candidate.getAttribute('aria-hidden') === 'true' || getComputedStyle(candidate).display === 'none') return false;
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight;
      });
      for (const label of labels) {
        const nodeId = label.dataset.nodeId;
        const dot = document.querySelector(`#nodes .node[data-id="${CSS.escape(nodeId)}"] .ndot`);
        if (!dot) continue;
        const matrix = dot.getScreenCTM();
        const cx = Number(dot.getAttribute('cx')), cy = Number(dot.getAttribute('cy'));
        if (!matrix || !Number.isFinite(cx) || !Number.isFinite(cy)) continue;
        const dotPoint = new DOMPoint(cx, cy).matrixTransform(matrix);
        if (dotPoint.x <= 0 || dotPoint.x >= innerWidth || dotPoint.y <= 0 || dotPoint.y >= innerHeight) continue;
        if (document.elementFromPoint(dotPoint.x, dotPoint.y)?.closest('g.node')?.dataset.id !== nodeId) continue;
        return { nodeId, x: dotPoint.x, y: dotPoint.y };
      }
      return null;
    });
    assert.ok(previewPoint, 'overview trace did not expose an in-viewport non-root lineage marker');
    const previewNode = page.locator(`#nodes .node.lit[data-id="${previewPoint.nodeId}"]`);
    const livePreviewPoint = await page.evaluate(nodeId => {
      const dot = document.querySelector(`#nodes .node[data-id="${CSS.escape(nodeId)}"] .ndot`);
      const matrix = dot?.getScreenCTM(), cx = Number(dot?.getAttribute('cx')), cy = Number(dot?.getAttribute('cy'));
      if (!matrix || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
      const point = new DOMPoint(cx, cy).matrixTransform(matrix);
      return point.x > 0 && point.x < innerWidth && point.y > 0 && point.y < innerHeight && document.elementFromPoint(point.x, point.y)?.closest('g.node')?.dataset.id === nodeId
        ? { x: point.x, y: point.y }
        : null;
    }, previewPoint.nodeId);
    assert.ok(livePreviewPoint, 'overview trace marker moved before pointer activation');
    await page.mouse.move(0, 0);
    await page.mouse.move(livePreviewPoint.x, livePreviewPoint.y);
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'preview', undefined, { timeout: APP_TIMEOUT });
    const hoverText = await page.locator('#inspector').textContent();
    await previewNode.focus({ force: true });
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'preview');
    const previewText = await page.locator('#inspector').textContent();
    assert.ok(previewText?.trim());
    assert.equal(previewText, hoverText, 'pointer and keyboard lineage previews must match');
    await previewNode.press('Enter');
    await page.waitForFunction(() => document.querySelector('#panel')?.classList.contains('open'));
    assert.equal(await page.locator('#traceBtn').getAttribute('aria-pressed'), 'true', 'opening a lineage node must preserve the active trace');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'trace');
    await openControls(page);
    await page.locator('#fitAllBtn').click();
    await waitForSemanticZoom(page, 'overview');
    await page.keyboard.press('Escape');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
    const lstmMarker = page.locator('#nodes .node.lit[data-id="lstm"] .ndot');
    assert.equal(await lstmMarker.count(), 1, 'overview trace must expose the LSTM lineage marker');
    const lstmMarkerState = await lstmMarker.evaluate(element => ({
      litAncestor: Boolean(element.closest('.node.lit')),
      ancestorDisplay: getComputedStyle(element.closest('.node')).display,
      visibility: getComputedStyle(element).visibility,
      radius: Number(element.getAttribute('r') || 0)
    }));
    assert.equal(lstmMarkerState.litAncestor, true, 'LSTM lineage marker lost its lit lineage state');
    assert.notEqual(lstmMarkerState.ancestorDisplay, 'none', 'LSTM lineage marker ancestor is display-hidden');
    assert.notEqual(lstmMarkerState.visibility, 'hidden', 'LSTM lineage marker is visibility-hidden');
    assert.ok(lstmMarkerState.radius > 0, 'LSTM lineage marker has no rendered circle radius');
    const placedTraceNodeId = await page.evaluate(() => {
      for (const label of document.querySelectorAll('#traceLabels .traceLabel[data-node-id]')) {
        const nodeId = label.dataset.nodeId;
        if (!nodeId || nodeId === 'transformer' || label.getAttribute('aria-hidden') === 'true' || getComputedStyle(label).display === 'none') continue;
        const rect = label.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight) return nodeId;
      }
      return null;
    });
    assert.ok(placedTraceNodeId, 'overview trace did not place a non-root lineage label for activation');
    const placedTraceLabel = page.locator(`#traceLabels .traceLabel[data-node-id="${placedTraceNodeId}"]`);
    await placedTraceLabel.focus();
    await waitForFocus(page, `#traceLabels .traceLabel[data-node-id="${placedTraceNodeId}"]`);
    await placedTraceLabel.press('Enter');
    await page.waitForFunction(() => document.querySelector('#panel')?.classList.contains('open'));
    assert.match(await page.evaluate(() => window.location.hash), /trace=transformer/);
    assert.ok(await page.locator('#edgesHi path').count() > 0, 'trace-label activation must retain lineage paths');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'trace');
    await waitForFocus(page, '#inspector .traceSummary h3');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('#inspector .traceSummary h3')), true, 'Escape from lineage details must focus the trace summary');
    await page.locator('#controlsBtn').focus();
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'trace');

    await switchView(page, 'network');
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'trace');
    const networkLabelIds = await page.locator('.networkLabel').evaluateAll(elements => elements.map(element => element.textContent));
    assert.ok(networkLabelIds.length > 0);
    await switchView(page, 'list');
    assert.equal(await page.locator('#inspector').getAttribute('data-mode'), null);
    await switchView(page, 'map');
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode !== 'trace' && !document.querySelector('#svg')?.classList.contains('trace-active'));
    await page.waitForFunction(() => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      return (params.get('view') === 'map' || params.get('view') === null) && document.body.dataset.view === 'map' && !params.has('trace');
    }, undefined, { timeout: APP_TIMEOUT });
    assert.doesNotMatch(await page.evaluate(() => window.location.hash), /trace=/, 'returning from List must not resurrect the trace hash');
    assert.equal(await page.locator('#traceLabels .traceLabel').count(), 0, 'returning from List must not resurrect trace labels');
    await navigate(page, '#trace=transformer', '?smoke=trace-opportunity-teardown');
    await waitForApp(page);
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'trace');
    await switchView(page, 'opportunity');
    assert.equal(await page.locator('#inspector').getAttribute('data-mode'), null, 'Opportunity view must clear an active trace');
    await switchView(page, 'map');
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode !== 'trace' && !document.querySelector('#svg')?.classList.contains('trace-active'));
    await page.waitForFunction(() => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      return (params.get('view') === 'map' || params.get('view') === null) && document.body.dataset.view === 'map' && !params.has('trace');
    }, undefined, { timeout: APP_TIMEOUT });
    assert.doesNotMatch(await page.evaluate(() => window.location.hash), /trace=/, 'returning from Opportunity must not resurrect the trace hash');
    assert.equal(await page.locator('#traceLabels .traceLabel').count(), 0, 'returning from Opportunity must not resurrect trace labels');
    await navigate(page, '#trace=transformer&mode=all', '?smoke=trace-pooled-all');
    await waitForApp(page);
    await zoomToSemanticLevel(page, 'detail');
    const allPool = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('#edgesBackbone path[data-relationship-id],#edgesAll path[data-relationship-id],#edgesHi path[data-relationship-id]')].map(path => path.dataset.relationshipId);
      return { count: ids.length, unique: new Set(ids).size };
    });
    assert.equal(allPool.count, 711, 'All mode must mount exactly one path for each canonical relationship');
    assert.equal(allPool.unique, 711, 'All mode must not duplicate pooled relationship paths');
    await page.locator('#fitAllBtn').click();
    await waitForSemanticZoom(page, 'overview');
    await page.locator('#traceBtn').count();
    if (await page.locator('#controls').evaluate(element => element.classList.contains('open'))) await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#controls')?.classList.contains('open') !== true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#svg')?.classList.contains('trace-active'));
    const clearedPaths = await page.evaluate(() => ({
      backbone: document.querySelectorAll('#edgesBackbone path[data-relationship-id]').length,
      all: document.querySelectorAll('#edgesAll path[data-relationship-id]').length,
      active: document.querySelectorAll('#edgesHi path[data-relationship-id]').length
    }));
    assert.deepEqual(clearedPaths, { backbone: 72, all: 0, active: 0 }, 'clearing an overview trace must restore only the 72-path spine');

    const paginatedEra = await page.evaluate(() => ERAS.findIndex(era => NODES.filter(node => {
      const year = layoutYear(node);
      return year >= era.y0 && year <= era.y1;
    }).length > 24));
    assert.ok(paginatedEra >= 0, 'no canonical era contains enough records to exercise pagination');
    await page.locator('#eraSelect').selectOption(String(paginatedEra));
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'era' && document.querySelectorAll('.eraCard').length > 0);
    assert.ok(await page.locator('.eraLaneGroup h4').count() > 0);
    assert.ok(await page.locator('.eraCard').count() <= 24);
    const eraPageOne = await page.locator('.eraPager span').textContent();
    assert.match(eraPageOne || '', /Page 1 of [2-9]/);
    await page.locator('.eraPager .btn').last().click();
    await page.waitForFunction(() => document.querySelector('.eraPager span')?.textContent.includes('Page 2 of'));
    await page.locator('.eraPager .btn').first().click();
    await page.waitForFunction(() => document.querySelector('.eraPager span')?.textContent.includes('Page 1 of'));
    await page.locator('#controlsBtn').focus();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'controlsBtn');
    await switchView(page, 'network');
    assert.equal(await page.locator('#inspector').getAttribute('data-mode'), null);
    await switchView(page, 'opportunity');
    assert.equal(await page.locator('#inspector').getAttribute('data-mode'), null);
    session.assertClean();
  });

  test('relationship rationale previews stay identical across grades, filters, and row-only access', async testContext => {
    const grades = Object.freeze(['contextual', 'editorial', 'hypothesis', 'unassessed', 'direct', 'partial']);
    const session = await makeSession(testContext, { dismissWelcome: true });
    const { page } = session;
    await navigate(page, '#mode=all', '?smoke=rationale-candidates');
    await waitForApp(page);

    for (const requestedGrade of grades) {
      const candidates = await page.evaluate(grade => EDGES
        .filter(edge => edgeEvidenceGrade(edge) === grade)
        .map(edge => ({ id: edgeAuditKey(edge), sourceId: edge.a, targetId: edge.b }))
        .sort((left, right) => left.id.localeCompare(right.id)), requestedGrade);
      assert.ok(candidates.length, `no relationship candidates exist for requested ${requestedGrade} grade`);
      let selected = null;
      for (const candidate of candidates.slice(0, 24)) {
        const activated = await page.evaluate(targetId => {
          if (typeof clearTrace === 'function') clearTrace({ restoreFocus: false });
          return typeof activateTrace === 'function' && activateTrace(targetId);
        }, candidate.targetId);
        if (!activated) continue;
        await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'trace');
        const fitted = await page.evaluate(({ sourceId, targetId }) => {
          const sourceNode = byId.get(sourceId), targetNode = byId.get(targetId);
          if (!sourceNode || !targetNode) return false;
          fitRect(
            Math.min(sourceNode.px, targetNode.px),
            Math.min(sourceNode.py, targetNode.py),
            Math.max(sourceNode.px + sourceNode.w, targetNode.px + targetNode.w),
            Math.max(sourceNode.py + NODE_H, targetNode.py + NODE_H),
            80
          );
          return true;
        }, candidate);
        if (!fitted) continue;
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
        const pointerPoint = await findRelationshipPointerPoint(page, candidate.id);
        if (pointerPoint) {
          selected = { ...candidate };
          break;
        }
        await page.evaluate(() => { if (typeof clearTrace === 'function') clearTrace({ restoreFocus: false }); });
      }
      assert.ok(selected, `no real stage-visible pointer coordinate was found for requested ${requestedGrade} grade`);
      const { id, sourceId, targetId } = selected;
      assert.equal(await page.evaluate(({ relationshipId, grade }) => edgeEvidenceGrade(relationshipById.get(relationshipId)) === grade, { relationshipId: id, grade: requestedGrade }), true, `${id} did not retain the requested ${requestedGrade} evidence grade`);
      assert.equal(await page.evaluate(() => {
        const candidate = relationshipPaths().find(path => path.isConnected && path.getClientRects().length);
        if (!candidate) return false;
        Object.defineProperty(candidate, 'getBoundingClientRect', {
          configurable: true,
          value: () => ({ left: -100000, right: -99900, top: -100000, bottom: -99900 })
        });
        rebuildRelationshipPointerIndex();
        const excluded = !relationshipPointerIndex.entries.some(entry => entry.path === candidate);
        delete candidate.getBoundingClientRect;
        rebuildRelationshipPointerIndex();
        return excluded;
      }), true, `${id} offscreen path was not excluded from the pointer index`);
      const expectedTitle = await page.evaluate(({ sourceId: source, targetId: target }) => `${byId.get(source)?.t || ''} → ${byId.get(target)?.t || ''}`, { sourceId, targetId });
      assert.match(expectedTitle, /.+ → .+/u, `${id} has no stable relationship title`);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
      const pointerPoint = await findRelationshipPointerPoint(page, id);
      assert.ok(pointerPoint, `${id} lost its stage-visible pointer coordinate after index rebuild`);
      await page.mouse.move(0, 0);
      await page.mouse.move(pointerPoint.x, pointerPoint.y);
      await page.waitForFunction(({ relationshipId, expectedRelationshipTitle }) =>
        relationshipPointerPreviewId === relationshipId &&
        document.querySelector('#inspector')?.dataset.mode === 'relationship' &&
        document.querySelector('#inspector .tt')?.textContent?.trim() === expectedRelationshipTitle,
      { relationshipId: id, expectedRelationshipTitle: expectedTitle }, { timeout: APP_TIMEOUT });
      assert.equal(await page.evaluate(() => relationshipPointerPreviewId), id, `${id} pointer preview selected a different relationship`);
      const pointerText = await page.locator('#inspector').textContent();
      await page.mouse.move(0, 0);
      await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'trace');
      await page.getByRole('button', { name: 'Open details', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#panel')?.classList.contains('open'));
      await page.locator('#pRelationsDetails summary').click();
      await page.waitForFunction(() => document.querySelector('#pRelationsDetails')?.open === true);
      const rowIndex = await page.locator('#pRel .relWrap').evaluateAll((rows, source) => rows.findIndex(row => row.querySelector('.rel')?.dataset.go === source), sourceId);
      assert.ok(rowIndex >= 0, `${id} is not represented in the target relationship dock`);
      const row = page.locator('#pRel .relWrap').nth(rowIndex);
      await row.locator('.rel').focus();
      assert.equal(await page.evaluate(expectedSource => document.activeElement?.matches('.rel') && document.activeElement.dataset.go === expectedSource, sourceId), true, `${id} row focus did not land on the expected relationship control`);
      await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'relationship');
      assert.equal(await page.locator('#inspector').textContent(), pointerText, `${id} row focus preview differs from pointer preview`);
      assert.equal(await page.locator('#inspector .tt').textContent(), expectedTitle, `${id} row focus preview differs from pointer preview`);
      assert.match(await page.locator('#inspector').textContent(), /Canonical relationship rationale/u);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelector('#panel')?.classList.contains('open') !== true);
      await page.evaluate(() => { if (typeof clearTrace === 'function') clearTrace({ restoreFocus: false }); });
    }

    await navigate(page, '#mode=all', '?smoke=rationale-buckets');
    await waitForApp(page);
    await zoomToSemanticLevel(page, 'detail');
    const bucketCounts = await page.evaluate(() => {
      const counts = { evidence: 0, contextual: 0, hypothesis: 0 };
      for (const path of document.querySelectorAll('#edgesBackbone path[data-relationship-id],#edgesAll path[data-relationship-id],#edgesHi path[data-relationship-id]')) {
        if (path.classList.contains('bucket-evidence-backed')) counts.evidence += 1;
        else if (path.classList.contains('bucket-hypothesis')) counts.hypothesis += 1;
        else if (path.classList.contains('bucket-contextual-editorial-or-unassessed')) counts.contextual += 1;
      }
      return counts;
    });
    assert.deepEqual(bucketCounts, { evidence: 9, contextual: 658, hypothesis: 44 }, 'runtime display buckets drifted');

    const filterTarget = await page.evaluate(() => {
      const path = [...document.querySelectorAll('#edgesBackbone path[data-relationship-id],#edgesAll path[data-relationship-id],#edgesHi path[data-relationship-id]')]
        .find(candidate => {
          const [source, targetAndType] = candidate.dataset.relationshipId.split('>');
          const target = targetAndType.split(':')[0];
          return [source, target].some(id => document.querySelector(`#nodes .node[data-id="${CSS.escape(id)}"]`)?.classList.contains('status-d'));
        });
      return path?.dataset.relationshipId || null;
    });
    assert.ok(filterTarget, 'no relationship available for filter visibility check');
    await openControls(page);
    await page.locator('#chips .chip[data-s="d"]').click();
    await page.waitForFunction(id => document.querySelector(`path[data-relationship-id="${CSS.escape(id)}"]`)?.style.display === 'none', filterTarget);
    await page.locator('#resetFiltersBtn').click();
    await page.waitForFunction(id => document.querySelector(`path[data-relationship-id="${CSS.escape(id)}"]`)?.style.display !== 'none', filterTarget);

    await navigate(page, '#trace=transformer&mode=all');
    await waitForApp(page);
    await zoomToSemanticLevel(page, 'detail');
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'trace');
    const pooled = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('#edgesBackbone path[data-relationship-id],#edgesAll path[data-relationship-id],#edgesHi path[data-relationship-id]')]
        .map(path => path.dataset.relationshipId);
      return { count: ids.length, unique: new Set(ids).size };
    });
    assert.deepEqual(pooled, { count: 711, unique: 711 }, 'trace detail must preserve one pooled path per relationship');
    await page.locator('#fitAllBtn').click();
    await waitForSemanticZoom(page, 'overview');
    if (await page.locator('#controls').evaluate(element => element.classList.contains('open'))) await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#controls')?.classList.contains('open') !== true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode !== 'trace' && !document.querySelector('#svg')?.classList.contains('trace-active'));
    assert.equal(await page.locator('#inspector').getAttribute('data-mode'), null, 'clearing an overview trace must hide the trace dock');
    assert.deepEqual(await page.evaluate(() => ({
      backbone: document.querySelectorAll('#edgesBackbone path[data-relationship-id]').length,
      all: document.querySelectorAll('#edgesAll path[data-relationship-id]').length,
      active: document.querySelectorAll('#edgesHi path[data-relationship-id]').length
    })), { backbone: 72, all: 0, active: 0 }, 'trace restore must return to the 72-path orientation spine');
    await page.locator('#eraSelect').focus();
    await page.locator('#eraSelect').selectOption('0');
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'era');
    const eraCard = page.locator('.eraCard').first();
    assert.match(await eraCard.getAttribute('data-era-node'), /^[a-z0-9_]+$/u);
    assert.ok((await eraCard.locator('strong').textContent())?.trim(), 'era card is missing its title field');
    assert.match((await eraCard.locator('span').textContent()) || '', / · /u, 'era card is missing its date/status field');
    assert.doesNotMatch(await page.evaluate(() => window.location.hash), /(?:^|[#&])era=/u, 'era lens state must remain transient and not enter the share hash');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#inspector').getAttribute('data-mode'), null, 'era dock must restore without stale relationship content');
    await waitForFocus(page, '#eraSelect');
    assert.doesNotMatch(await page.evaluate(() => window.location.hash), /(?:^|[#&])era=/u, 'closing era lens must not leave an era hash behind');

    await navigate(page, '#trace=transformer', '?smoke=rationale-era-teardown-trace');
    await waitForApp(page);
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'trace');
    await page.locator('#eraSelect').focus();
    await page.locator('#eraSelect').selectOption('0');
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'era');
    await switchView(page, 'network');
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'trace' && document.body.dataset.view === 'network' && !eraLensState && document.querySelectorAll('.eraCard').length === 0 && document.querySelector('#networkView')?.dataset.networkState === 'ready');
    assert.equal(await page.locator('#inspector').getAttribute('data-mode'), 'trace', 'Network view must restore the active trace summary after disposing the era lens');
    assert.equal(await page.evaluate(() => traced && Boolean(traceRootId)), true, 'Network view must preserve the active trace state');
    assert.match(await page.locator('#inspector .traceCounts').textContent(), /^117 total nodes · \d+ visible · \d+ filter-hidden · 196 total relationships ·/u, 'Network trace summary totals drifted');
    await page.waitForFunction(() => document.querySelectorAll('#networkLabelLayer .networkLabel.selected').length > 0);
    assert.ok(await page.locator('#networkLabelLayer .networkLabel.selected').count() > 0, 'Network view must retain highlighted trace labels');
    await switchView(page, 'list');
    await page.waitForFunction(() => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      return document.body.dataset.view === 'list' && !params.has('trace');
    }, undefined, { timeout: APP_TIMEOUT });
    assert.doesNotMatch(await page.evaluate(() => window.location.hash), /(?:^|[#&])trace=/u, 'List teardown must clear a trace that was behind the era lens');
    await switchView(page, 'map');
    await navigate(page, '#trace=transformer', '?smoke=rationale-trace-escape');
    await waitForApp(page);
    await page.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'trace');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#inspector')?.getAttribute('data-mode') == null && !document.querySelector('#svg')?.classList.contains('trace-active'));
    await page.waitForFunction(() => {
      const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden');
      const active = document.activeElement;
      return visible(active) && (active.matches('#anchorLabels .anchorLabel[data-node-id="transformer"]') || active.matches('#nodes .node[data-id="transformer"]') || active.id === 'controlsBtn');
    }, undefined, { timeout: APP_TIMEOUT });
    const restoredFocus = await page.evaluate(() => ({
      id: document.activeElement?.id || null,
      node: document.activeElement?.matches('#nodes .node[data-id="transformer"]') || false,
      anchor: document.activeElement?.matches('#anchorLabels .anchorLabel[data-node-id="transformer"]') || false,
      visible: Boolean(document.activeElement?.getClientRects().length)
    }));
    assert.equal(restoredFocus.visible, true, `Escape from a trace summary restored focus to a non-visible target: ${JSON.stringify(restoredFocus)}`);
    assert.equal(restoredFocus.node || restoredFocus.anchor || restoredFocus.id === 'controlsBtn', true, `Escape from a trace summary restored focus to an unexpected target: ${JSON.stringify(restoredFocus)}`);
    await page.waitForFunction(() => !new URLSearchParams(window.location.hash.slice(1)).has('trace'), undefined, { timeout: APP_TIMEOUT });
    assert.doesNotMatch(await page.evaluate(() => window.location.hash), /(?:^|[#&])trace=/u, 'Escape from a trace summary must clear the trace hash');
    session.assertClean();

    const mobileSession = await makeSession(testContext, {
      viewport: { width: 375, height: 812 },
      hasTouch: true,
      isMobile: true
    });
    const mobilePage = mobileSession.page;
    await navigate(mobilePage, '#node=a3cppo&mode=all');
    await waitForApp(mobilePage);
    await mobilePage.waitForFunction(() => window.innerWidth <= 740 && window.matchMedia('(pointer: coarse)').matches);
    await mobilePage.locator('#pRelationsDetails summary').click();
    await mobilePage.waitForFunction(() => document.querySelector('#pRelationsDetails')?.open === true);
    const mobileRowIndex = await mobilePage.locator('#pRel .relWrap').evaluateAll((rows, source) =>
      rows.findIndex(row => row.querySelector('.rel')?.dataset.go === source), 'policygrad');
    assert.ok(mobileRowIndex >= 0, 'mobile relationship dock lost the representative row');
    const mobileRow = mobilePage.locator('#pRel .relWrap').nth(mobileRowIndex);
    await mobileRow.locator('.rel').focus();
    assert.equal(await mobilePage.evaluate(expectedSource => document.activeElement?.matches('.rel') && document.activeElement.dataset.go === expectedSource, 'policygrad'), true, 'mobile row focus did not land on the expected relationship control');
    await mobilePage.waitForFunction(() => document.querySelector('#inspector')?.dataset.mode === 'relationship');
    assert.match(await mobilePage.locator('#inspector').textContent(), /Canonical relationship rationale/u);
    await mobilePage.evaluate(() => document.querySelector('#stage').dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      clientX: 180,
      clientY: 320,
      pointerType: 'mouse'
    })));
    assert.equal(await mobilePage.locator('#inspector').getAttribute('data-mode'), 'relationship', 'mobile pointer movement must not displace row-only access');
    mobileSession.assertClean();
  });

  test('Unfinished Business deck preserves canonical question inventory and actions', async testContext => {
    const session = await makeSession(testContext);
    const { page } = session;
    await navigate(page, '#view=list&research=questions');
    await waitForApp(page);
    const initial = await page.evaluate(() => ({
      cards: document.querySelectorAll('.questionCard').length,
      count: document.querySelector('#questionDeckCount')?.textContent,
      segments: [...document.querySelectorAll('[data-question-segment]')].map(button => button.textContent),
      first: document.querySelector('.questionCard')?.dataset.questionNode,
      tableHidden: document.querySelector('#listView .tableScroll')?.hidden,
      hash: window.location.hash
    }));
    assert.equal(initial.cards, 12);
    assert.match(initial.count || '', /Showing 74 matching questions · Page 1 of 7/);
    assert.deepEqual(initial.segments, ['All 74', 'Open directions 15', 'Other recorded questions 59']);
    assert.equal(initial.first, 'gap_activeinf');
    assert.equal(initial.tableHidden, true);
    assert.match(initial.hash, /research=questions/);
    const canonicalCardFields = await page.locator('.questionCard').first().locator('.questionCardMeta span').evaluateAll(elements => elements.map(element => element.textContent));
    assert.equal(canonicalCardFields.length, 4, 'question cards must expose title, date, lane, and status fields');
    assert.match(canonicalCardFields[0] || '', /^Title: .+/u);
    assert.match(canonicalCardFields[1] || '', /^Date: .+/u);
    assert.match(canonicalCardFields[2] || '', /^Lane: .+/u);
    assert.match(canonicalCardFields[3] || '', /^Status: .+/u);
    assert.equal(await page.locator('#listView').getAttribute('aria-labelledby'), 'questionDeckTitle');
    const desktopRects = await page.evaluate(() => {
      const rect = selector => { const value = document.querySelector(selector)?.getBoundingClientRect(); return value ? { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height } : null; };
      return { chip: rect('#filterChip'), title: rect('#questionDeckTitle'), listTitle: rect('#listTitle'), listCount: rect('#listCount') };
    });
    const overlaps = (left, right) => left && right && left.width > 0 && right.width > 0 && left.right > right.left && right.right > left.left && left.bottom > right.top && right.bottom > left.top;
    assert.equal(overlaps(desktopRects.chip, desktopRects.title), false);
    assert.equal(overlaps(desktopRects.chip, desktopRects.listTitle), false);
    assert.equal(overlaps(desktopRects.chip, desktopRects.listCount), false);

    await page.locator('[data-question-segment="all"]').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('#questionDeckCount')?.textContent.includes('15 matching questions'));
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.questionSegment), 'open');
    assert.equal(await page.locator('[data-question-segment="open"]').getAttribute('tabindex'), '0');
    assert.equal(await page.locator('[data-question-segment="all"]').getAttribute('tabindex'), '-1');
    await page.keyboard.press('End');
    await page.waitForFunction(() => document.querySelector('#questionDeckCount')?.textContent.includes('59 matching questions'));
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.questionSegment), 'other');
    await page.keyboard.press('Home');
    await page.waitForFunction(() => document.querySelector('#questionDeckCount')?.textContent.includes('74 matching questions'));
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.questionSegment), 'all');

    await page.locator('[data-question-segment="open"]').click();
    await page.waitForFunction(() => document.querySelector('#questionDeckCount')?.textContent.includes('Page 1 of 2'));
    assert.equal(await page.locator('.questionCard').count(), 12);
    const pagerNext = page.locator('#questionDeckPager button').nth(1);
    await pagerNext.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#questionDeckCount')?.textContent.includes('Page 2 of 2'));
    await page.waitForFunction(() => document.activeElement === document.querySelectorAll('#questionDeckPager button')[0]);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#questionDeckCount')?.textContent.includes('Page 1 of 2'));
    await page.waitForFunction(() => document.activeElement === document.querySelectorAll('#questionDeckPager button')[1]);
    await page.locator('[data-question-segment="other"]').click();
    await page.waitForFunction(() => document.querySelector('#questionDeckCount')?.textContent.includes('Page 1 of 5'));
    assert.equal(await page.locator('.questionCard').count(), 12);
    await page.locator('[data-question-segment="all"]').click();
    await page.locator('#questionDeckSearch').fill('zzzz-no-canonical-question-match');
    await page.waitForFunction(() => document.querySelectorAll('.questionCard').length === 0);
    await page.locator('#questionDeckSearch').fill('');

    await page.locator('#controlsBtn').click();
    await page.locator('#spotBtn').click();
    await page.waitForFunction(() => document.querySelector('#questionDeckCount')?.textContent.includes('18 matching questions'));
    assert.equal(await page.locator('#filterChip').textContent(), '15 of 339 shown · Reset');
    await page.locator('#filterChip').click();
    await page.waitForFunction(() => document.querySelector('#questionDeck')?.hidden);
    await page.locator('#unfinishedBtn').click({ force: true });
    await page.waitForFunction(() => document.querySelector('#questionDeckCount')?.textContent.includes('74 matching questions'));

    const evidenceCard = page.locator('.questionCard').first();
    const evidenceTitle = await evidenceCard.locator('.questionCardMeta span').first().textContent();
    await evidenceCard.locator('[data-question-action="evidence"]').click();
    await page.waitForFunction(() => document.querySelector('#panel')?.classList.contains('open'));
    assert.equal(await page.locator('#pTitle').textContent(), (evidenceTitle || '').replace(/^Title: /, ''));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#panel')?.classList.contains('open'));
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-question-action') === 'evidence', undefined, { timeout: APP_TIMEOUT });
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-question-action')), 'evidence');

    await page.locator('.questionCard').first().locator('[data-question-action="timeline"]').click();
    await page.waitForFunction(() => document.body.dataset.view === 'map');
    await page.locator('#unfinishedBtn').click({ force: true });
    await page.waitForFunction(() => document.body.dataset.view === 'list' && !document.querySelector('#questionDeck')?.hidden);

    await page.keyboard.press('Control+K');
    await page.waitForFunction(() => !document.querySelector('#commandPalette')?.hidden);
    await page.locator('#commandPaletteInput').fill('Unfinished Business');
    await page.locator('[data-command-id="unfinished-business"]').click();
    await page.waitForFunction(() => document.body.dataset.view === 'list' && !document.querySelector('#questionDeck')?.hidden);
    await page.locator('#questionDeckClose').click();
    await page.waitForFunction(() => document.querySelector('#questionDeck')?.hidden);
    assert.equal(await page.locator('#listView').getAttribute('aria-labelledby'), 'listTitle');
    await waitForFocus(page, '#listView');
    await page.locator('#unfinishedBtn').click({ force: true });
    await page.waitForFunction(() => !document.querySelector('#questionDeck')?.hidden);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(150);
    const mobile = await page.evaluate(() => ({
      cards: document.querySelectorAll('.questionCard').length,
      width: document.querySelector('.questionCard')?.getBoundingClientRect().width || 0,
      actionHeights: [...document.querySelectorAll('.questionCardActions .btn')].map(button => button.getBoundingClientRect().height),
      chip: (() => { const value = document.querySelector('#filterChip')?.getBoundingClientRect(); return value ? { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height } : null; })(),
      title: (() => { const value = document.querySelector('#questionDeckTitle')?.getBoundingClientRect(); return value ? { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height } : null; })(),
      listTitle: (() => { const value = document.querySelector('#listTitle')?.getBoundingClientRect(); return value ? { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height } : null; })(),
      listCount: (() => { const value = document.querySelector('#listCount')?.getBoundingClientRect(); return value ? { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height } : null; })(),
      overflow: document.documentElement.scrollWidth - window.innerWidth
    }));
    assert.ok(mobile.cards <= 12);
    assert.ok(mobile.width <= 375);
    assert.ok(mobile.actionHeights.length > 0 && mobile.actionHeights.every(height => height >= 44));
    assert.equal(overlaps(mobile.chip, mobile.title), false);
    assert.equal(overlaps(mobile.chip, mobile.listTitle), false);
    assert.equal(overlaps(mobile.chip, mobile.listCount), false);
    assert.ok(mobile.overflow <= 1);
    session.assertClean();
  });

  test('measured active DOM peak matches the reviewed platform baseline', () => {
    const peak = measuredDomSamples.reduce((maximum, sample) => Math.max(maximum, sample.count), 0);
    assert.equal(
      peak,
      REVIEWED_DOM_PEAK,
      `update the reviewed ${process.platform} DOM peak only after reviewing the browser change; samples: ${JSON.stringify(measuredDomSamples)}`
    );
    assert.ok(peak <= DOM_BUDGET, `measured DOM peak ${peak} exceeds budget ${DOM_BUDGET}`);
    assert.throws(() => reviewedDomPeakForPlatform('unsupported-platform'), /no reviewed DOM peak is configured/u);
  });

  test('warning filter ignores only the known headless WebGL diagnostic', () => {
    assert.equal(
      isIgnorableBrowserWarning('[.WebGL-0x123abc]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels'),
      true
    );
    assert.equal(isIgnorableBrowserWarning('application warning'), false);
    assert.equal(isIgnorableBrowserWarning('GPU stall due to ReadPixels'), false);
  });
});
