import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { startStagedSiteServer } from '../scripts/lib/staged-site-server.mjs';

const MOUNT_PATH = '/ai_tech_tree/';
const APP_TIMEOUT = 30_000;
const EXPECTED = Object.freeze({
  atlasNodes: 339,
  atlasEdges: 711,
  directions: 15,
  opportunityNodes: 60,
  opportunityEdges: 94
});
const HEADLESS_WEBGL_READBACK_WARNING = /^\[\.WebGL-0x[0-9a-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$/i;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const performanceBudget = JSON.parse(await fs.readFile(path.join(repoRoot, 'performance-budget.json'), 'utf8'));
const DOM_BUDGET = performanceBudget.regressionGuards.activeDomElements.maximum;
const OBSERVED_DOM_BASELINE = performanceBudget.regressionGuards.activeDomElements.observedV0_2_0;
const siteRoot = path.join(repoRoot, '_site');
const measuredDomSamples = [];

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

  if (javaScriptEnabled) {
    await context.addInitScript(() => {
      try {
        localStorage.setItem('ai-tech-tree-welcome', '2');
      } catch {
        // Storage can be unavailable before the first document has an origin.
      }
    });
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
  const controls = page.locator('#controls');
  if ((await controls.getAttribute('aria-hidden')) === 'true') {
    await page.locator('#controlsBtn').click();
    await page.waitForFunction(() => document.querySelector('#controlsBtn')?.getAttribute('aria-expanded') === 'true');
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
    await page.keyboard.press('Escape');
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

    assert.ok(Math.max(...domSamples.map(sample => sample.count)) <= DOM_BUDGET);
    session.assertClean();
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
    assert.equal(await page.locator('#controls').getAttribute('aria-hidden'), 'false');
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

  test('measured active DOM peak matches the recorded v0.2.0 baseline', () => {
    const peak = measuredDomSamples.reduce((maximum, sample) => Math.max(maximum, sample.count), 0);
    assert.equal(peak, OBSERVED_DOM_BASELINE, 'update the recorded DOM baseline only after reviewing the browser change');
    assert.ok(peak <= DOM_BUDGET, `measured DOM peak ${peak} exceeds budget ${DOM_BUDGET}`);
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
