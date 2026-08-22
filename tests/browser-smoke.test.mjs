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
  Object.freeze({ width: 1024, height: 768 }),
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
    viewport = { width: 1366, height: 768 },
    ...contextOptions
  } = options;
  const context = await browser.newContext({
    colorScheme: 'dark',
    javaScriptEnabled,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    viewport,
    ...contextOptions
  });
  testContext.after(async () => context.close());

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

    for (const slug of APPROVED_TOUR_SLUGS) {
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

  test('hostile Map -> All -> Opportunity -> Network -> List -> Map sequence stays below 8000 active DOM elements', async testContext => {
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
        if (viewport.width >= 1024) {
          assert.equal(initial.quickPrimaryVisible, true, `${label} quick primary controls should remain visible`);
        } else {
          assert.equal(initial.quickPrimaryVisible, false, `${label} quick primary controls should wait behind More`);
          assert.equal(initial.quickPrimaryParent, 'secondaryControls', `${label} quick primary controls were not moved into secondary controls`);
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
      if (viewport.width >= 1024) {
        assert.equal(await page.locator('#quickPrimary').isVisible(), true, `${label} quick primary controls disappeared after More opened`);
      } else if (viewport.width >= 741) {
        assert.equal(await page.locator('#quickPrimary').evaluate(element => element.parentElement?.id), 'secondaryControls', `${label} quick primary controls are not inside secondary controls`);
        assert.equal(await page.locator('#quickPrimary').isVisible(), true, `${label} quick primary controls did not become visible after More opened`);
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
