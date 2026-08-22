import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertCalibrationProfileBinding,
  calibrationReportContext,
  evaluateLighthouseRuns,
  extractLighthouseRun,
  lighthouseProfileSha256,
  median,
  parseArguments,
  runLighthouseAudit
} from '../scripts/lighthouse-budget.mjs';
import { startStagedSiteServer } from '../scripts/lib/staged-site-server.mjs';

const ORIGIN = 'http://127.0.0.1:43210';
const LIMITS = Object.freeze({
  performanceScore: { minimum: 80 },
  firstContentfulPaintMs: { maximum: 2000 },
  largestContentfulPaintMs: { maximum: 3000 },
  totalBlockingTimeMs: { maximum: 200 },
  cumulativeLayoutShift: { maximum: 0.02 }
});

function audit(numericValue, extra = {}) {
  return { numericValue, scoreDisplayMode: 'numeric', ...extra };
}

function lhr(overrides = {}) {
  const result = {
    requestedUrl: `${ORIGIN}/ai_tech_tree/`,
    mainDocumentUrl: `${ORIGIN}/ai_tech_tree/`,
    finalDisplayedUrl: `${ORIGIN}/ai_tech_tree/`,
    finalUrl: `${ORIGIN}/ai_tech_tree/`,
    runWarnings: [],
    categories: { performance: { score: 0.8 } },
    audits: {
      'first-contentful-paint': audit(2000),
      'largest-contentful-paint': audit(3000),
      'total-blocking-time': audit(200),
      'cumulative-layout-shift': audit(0.02),
      'dom-size-insight': audit(6500),
      'total-byte-weight': audit(4516265),
      'network-requests': {
        scoreDisplayMode: 'informative',
        details: { items: [{ url: `${ORIGIN}/ai_tech_tree/` }] }
      }
    }
  };
  return {
    ...result,
    ...overrides,
    categories: { ...result.categories, ...(overrides.categories || {}) },
    audits: { ...result.audits, ...(overrides.audits || {}) }
  };
}

test('median accepts odd samples and rejects empty, even, or invalid samples', () => {
  assert.equal(median([9, 1, 5]), 5);
  assert.throws(() => median([]), /non-empty odd-length/u);
  assert.throws(() => median([1, 2]), /non-empty odd-length/u);
  assert.throws(() => median([1, Number.NaN, 3]), /finite non-negative/u);
});

test('extracts a complete local Lighthouse result at equality boundaries', () => {
  const run = extractLighthouseRun(lhr(), { allowedOrigin: ORIGIN });
  assert.deepEqual(run, {
    performanceScore: 80,
    firstContentfulPaintMs: 2000,
    largestContentfulPaintMs: 3000,
    totalBlockingTimeMs: 200,
    cumulativeLayoutShift: 0.02,
    initialDomElements: 6500,
    totalByteWeight: 4516265,
    networkRequestCount: 1,
    runWarnings: []
  });
});

test('rejects runtime errors, warnings, audit errors, invalid metrics, and external requests', () => {
  assert.throws(
    () => extractLighthouseRun(lhr({ runtimeError: { code: 'ERRORED_DOCUMENT_REQUEST', message: 'failed' } }), { allowedOrigin: ORIGIN }),
    /runtime error/u
  );
  assert.throws(
    () => extractLighthouseRun(lhr({ runWarnings: ['navigation warning'] }), { allowedOrigin: ORIGIN }),
    /run warnings/u
  );
  assert.throws(
    () => extractLighthouseRun(lhr({
      audits: { 'first-contentful-paint': audit(123, { scoreDisplayMode: 'error', errorMessage: 'trace failed' }) }
    }), { allowedOrigin: ORIGIN }),
    /trace failed/u
  );
  assert.throws(
    () => extractLighthouseRun(lhr({ audits: { 'largest-contentful-paint': audit(Number.NaN) } }), { allowedOrigin: ORIGIN }),
    /finite non-negative/u
  );
  assert.throws(
    () => extractLighthouseRun(lhr({
      audits: {
        'network-requests': {
          scoreDisplayMode: 'informative',
          details: { items: [{ url: 'https://example.com/external.js' }] }
        }
      }
    }), { allowedOrigin: ORIGIN }),
    /external requests were recorded/u
  );
});

test('aggregates each metric independently and treats limit equality as passing', () => {
  const runs = [
    { performanceScore: 70, firstContentfulPaintMs: 1000, largestContentfulPaintMs: 3000, totalBlockingTimeMs: 200, cumulativeLayoutShift: 0.01 },
    { performanceScore: 80, firstContentfulPaintMs: 3000, largestContentfulPaintMs: 2000, totalBlockingTimeMs: 100, cumulativeLayoutShift: 0.02 },
    { performanceScore: 90, firstContentfulPaintMs: 2000, largestContentfulPaintMs: 4000, totalBlockingTimeMs: 300, cumulativeLayoutShift: 0.03 }
  ];
  const pending = evaluateLighthouseRuns({
    runs,
    mobileBudget: { status: 'calibration_pending', candidateLimits: LIMITS }
  });
  assert.equal(pending.status, 'CALIBRATION_PENDING');
  assert.deepEqual(pending.medians, {
    performanceScore: 80,
    firstContentfulPaintMs: 2000,
    largestContentfulPaintMs: 3000,
    totalBlockingTimeMs: 200,
    cumulativeLayoutShift: 0.02
  });
  assert(pending.checks.every(check => check.passed));

  const blocking = evaluateLighthouseRuns({ runs, mobileBudget: { status: 'blocking', limits: LIMITS } });
  assert.equal(blocking.status, 'PASS');
  assert.equal(blocking.failures.length, 0);
});

test('blocking evaluation fails misses while pending evaluation only reports candidates', () => {
  const runs = Array.from({ length: 3 }, () => ({
    performanceScore: 70,
    firstContentfulPaintMs: 2500,
    largestContentfulPaintMs: 3500,
    totalBlockingTimeMs: 250,
    cumulativeLayoutShift: 0.03
  }));
  const pending = evaluateLighthouseRuns({
    runs,
    mobileBudget: { status: 'calibration_pending', candidateLimits: LIMITS }
  });
  assert.equal(pending.failures.length, 0);
  assert.equal(pending.candidateMisses.length, 5);

  const blocking = evaluateLighthouseRuns({ runs, mobileBudget: { status: 'blocking', limits: LIMITS } });
  assert.equal(blocking.status, 'FAIL');
  assert.equal(blocking.failures.length, 5);
});

test('Chrome is killed and its owned profile is removed when Lighthouse throws after launch', async t => {
  const temporaryParent = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-tree-lighthouse-test-'));
  t.after(() => fs.rm(temporaryParent, { recursive: true, force: true }));
  let killed = 0;
  await assert.rejects(
    () => runLighthouseAudit(`${ORIGIN}/ai_tech_tree/`, {
      chromePath: 'fixture-chrome',
      temporaryParent,
      launchBrowser: async options => {
        await fs.writeFile(path.join(options.userDataDir, 'fixture'), 'profile');
        return { port: 9222, kill: () => { killed += 1; } };
      },
      audit: async () => { throw new Error('fixture audit failure'); },
      killBrowsers: () => []
    }),
    /fixture audit failure/u
  );
  assert.equal(killed, 1);
  assert.deepEqual(await fs.readdir(temporaryParent), []);
});

test('launch rejection invokes chrome-launcher cleanup and removes its owned profile', async t => {
  const temporaryParent = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-tree-lighthouse-launch-test-'));
  t.after(() => fs.rm(temporaryParent, { recursive: true, force: true }));
  let cleanupCalls = 0;

  await assert.rejects(
    () => runLighthouseAudit(`${ORIGIN}/ai_tech_tree/`, {
      chromePath: 'fixture-chrome',
      temporaryParent,
      launchBrowser: async options => {
        await fs.writeFile(path.join(options.userDataDir, 'fixture'), 'profile');
        throw new Error('fixture launch failure');
      },
      killBrowsers: () => {
        cleanupCalls += 1;
        return [];
      }
    }),
    /fixture launch failure/u
  );
  assert.equal(cleanupCalls, 1);
  assert.deepEqual(await fs.readdir(temporaryParent), []);
});

test('shared staged-site server preserves the mounted no-store browser contract', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-tree-staged-server-'));
  await fs.writeFile(path.join(root, 'index.html'), '<!doctype html><title>fixture</title>\n');
  const server = await startStagedSiteServer({ siteRoot: root });
  t.after(async () => {
    await server.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  const response = await fetch(server.url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(await response.text(), /fixture/u);
  assert.equal((await fetch(`${server.origin}/outside`)).status, 404);
  await server.close();
  await server.close();
});

test('CLI accepts only the fixed gate and calibration modes', () => {
  assert.deepEqual(parseArguments([]), { calibration: false });
  assert.deepEqual(parseArguments(['--calibrate']), { calibration: true });
  assert.throws(() => parseArguments(['--runs', '5']), /usage/u);
});

test('blocking calibration is cryptographically bound to the active profile', () => {
  const active = lighthouseProfileSha256();
  assert.equal(active, 'e1e49f07f8a53fa3adff45cb88d23d5c2cedbb4f1fc73bbda1fca067b4852f3a');
  assert.doesNotThrow(() => assertCalibrationProfileBinding({
    status: 'blocking',
    calibration: { profileSha256: active }
  }, active));
  assert.throws(
    () => assertCalibrationProfileBinding({
      status: 'blocking',
      calibration: { profileSha256: '0'.repeat(64) }
    }, active),
    /does not match calibrated profile/u
  );
  assert.doesNotThrow(() => assertCalibrationProfileBinding({ status: 'calibration_pending' }, active));
});

test('report names recorded calibration source and confirms only a canonical run dynamically', () => {
  const measurement = { canonicalPlatform: 'ubuntu-24.04' };
  const mobileBudget = {
    calibration: { sourcePlatform: 'win32', canonicalConfirmation: 'required' }
  };
  assert.deepEqual(
    calibrationReportContext({ measurement, mobileBudget, toolchain: { platform: 'win32' } }),
    {
      canonicalPlatform: 'ubuntu-24.04',
      calibrationSourcePlatform: 'win32',
      measurementPlatform: 'win32',
      recordedCanonicalConfirmation: 'required',
      canonicalConfirmation: 'required',
      canonicalPlatformUsedForThisRun: false
    }
  );
  assert.equal(
    calibrationReportContext({ measurement, mobileBudget, toolchain: { platform: 'ubuntu-24.04' } }).canonicalConfirmation,
    'confirmed-this-run'
  );
});
