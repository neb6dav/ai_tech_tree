'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { evaluatePerformanceBudget } = require('../scripts/performance-budget-test.cjs');

async function fixture(overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-tree-performance-budget-'));
  const document = Buffer.from('<!doctype html><title>Budget fixture</title>\n');
  const social = Buffer.from('fixture-image');
  await fs.mkdir(path.join(root, '_site'));
  await fs.writeFile(path.join(root, '_site', 'index.html'), document);
  await fs.writeFile(path.join(root, '_site', 'social-card.png'), social);
  await fs.writeFile(path.join(root, '_site', 'release-manifest.json'), `${JSON.stringify({
    files: [
      {
        path: 'index.html',
        mediaType: 'text/html; charset=utf-8',
        bytes: document.byteLength,
        sha256: crypto.createHash('sha256').update(document).digest('hex')
      },
      {
        path: 'social-card.png',
        mediaType: 'image/png',
        bytes: social.byteLength,
        sha256: crypto.createHash('sha256').update(social).digest('hex')
      }
    ]
  }, null, 2)}\n`);
  const budget = {
    schemaVersion: 1,
    measurement: {
      artifactRoot: '_site',
      initialDocument: 'index.html',
      browserProfile: 'lighthouse-mobile',
      browserAggregation: 'median',
      scoreScale: '0-100',
      byteUnit: 'bytes',
      timeUnit: 'milliseconds'
    },
    regressionGuards: {
      enforcement: {
        artifactMetrics: 'blocking',
        browserMetrics: 'recorded_pending_WP-012-A'
      },
      initialDocument: {
        rawBytes: { maximum: 1000 },
        gzipBytes: { maximum: 1000 }
      },
      activeDomElements: { maximum: 7000 },
      mobileLighthouse: {
        performanceScore: { minimum: 73 },
        firstContentfulPaintMs: { maximum: 4500 },
        largestContentfulPaintMs: { maximum: 4600 },
        totalBlockingTimeMs: { maximum: 200 },
        cumulativeLayoutShift: { maximum: 0.02 }
      },
      socialImage: {
        path: 'social-card.png',
        maximumBytes: 1000,
        baseline: {
          bytes: social.byteLength,
          sha256: crypto.createHash('sha256').update(social).digest('hex')
        }
      }
    },
    futureTargets: {
      enforcement: 'nonblocking',
      notBefore: 'v0.2.2',
      initialDocument: { rawBytes: { maximum: 250000 } },
      compressedTransferBytes: { maximum: 307200 },
      activeDomElements: { maximum: 3500 },
      mobileLighthouse: {
        performanceScore: { minimum: 90 },
        firstContentfulPaintMs: { maximum: 2500 },
        largestContentfulPaintMs: { maximum: 2500 },
        totalBlockingTimeMs: { maximum: 150 },
        cumulativeLayoutShift: { maximum: 0.02 }
      },
      socialImageBytes: { maximum: 500000 }
    }
  };
  Object.assign(budget.regressionGuards.initialDocument.rawBytes, overrides.rawBytes || {});
  Object.assign(budget.regressionGuards.socialImage.baseline, overrides.baseline || {});
  if (overrides.socialPath) budget.regressionGuards.socialImage.path = overrides.socialPath;
  if (overrides.initialDocument) budget.measurement.initialDocument = overrides.initialDocument;
  await fs.writeFile(path.join(root, 'performance-budget.json'), `${JSON.stringify(budget, null, 2)}\n`);
  return { root };
}

test('passes deterministic artifact budgets and identifies deferred browser metrics', async t => {
  const current = await fixture();
  t.after(() => fs.rm(current.root, { recursive: true, force: true }));

  const report = evaluatePerformanceBudget({ repositoryRoot: current.root });
  assert.equal(report.status, 'PASS');
  assert.equal(report.failures.length, 0);
  assert.equal(report.deferredBrowserMetrics.status, 'NOT_MEASURED');
  assert.equal(report.deferredBrowserMetrics.plannedWorkPackage, 'WP-012-A');
});

test('fails a raw-byte regression and a stale social baseline', async t => {
  const current = await fixture({ rawBytes: { maximum: 1 }, baseline: { sha256: '0'.repeat(64) } });
  t.after(() => fs.rm(current.root, { recursive: true, force: true }));

  const report = evaluatePerformanceBudget({ repositoryRoot: current.root });
  assert.equal(report.status, 'FAIL');
  assert(report.failures.some(check => check.name === 'initialDocument.rawBytes'));
  assert(report.failures.some(check => check.name === 'socialImage.baselineSha256'));
});

test('rejects artifact paths that escape the staged root', async t => {
  const current = await fixture({ socialPath: '../outside.png' });
  t.after(() => fs.rm(current.root, { recursive: true, force: true }));

  assert.throws(
    () => evaluatePerformanceBudget({ repositoryRoot: current.root }),
    /socialImage\.path must be exactly social-card\.png/u
  );
});

test('rejects attempts to redirect the fixed initial document budget', async t => {
  const current = await fixture({ initialDocument: 'tiny.html' });
  t.after(() => fs.rm(current.root, { recursive: true, force: true }));

  assert.throws(
    () => evaluatePerformanceBudget({ repositoryRoot: current.root }),
    /initialDocument must be exactly index\.html/u
  );
});

test('fails when the release manifest no longer matches a measured payload', async t => {
  const current = await fixture();
  t.after(() => fs.rm(current.root, { recursive: true, force: true }));
  const manifestPath = path.join(current.root, '_site', 'release-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.files.find(file => file.path === 'index.html').sha256 = '0'.repeat(64);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const report = evaluatePerformanceBudget({ repositoryRoot: current.root });
  assert.equal(report.status, 'FAIL');
  assert(report.failures.some(check => check.name === 'releaseManifest.initialDocument'));
});
