#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const DEFAULT_BUDGET_FILE = 'performance-budget.json';

function budgetError(message) {
  return new Error(`performance-budget: ${message}`);
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw budgetError(`${label} must be an object`);
  }
  return value;
}

function requiredNumber(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw budgetError(`${label} must be a finite non-negative number`);
  }
  return value;
}

function normalizeRelativePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw budgetError(`${label} must be a non-empty trimmed string`);
  }
  if (value.includes('\\') || path.posix.isAbsolute(value) || /^[A-Za-z]:/u.test(value)) {
    throw budgetError(`${label} must be a forward-slash relative path`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || value === '.' || value.endsWith('/') || value.split('/').some(part => part === '..' || part === '.')) {
    throw budgetError(`${label} must be a canonical relative path`);
  }
  return value;
}

function resolveInside(root, relative, label) {
  const normalized = normalizeRelativePath(relative, label);
  const target = path.resolve(root, ...normalized.split('/'));
  const fromRoot = path.relative(root, target);
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
    throw budgetError(`${label} escapes its configured root`);
  }
  return target;
}

function assertSafePathComponents(root, relative, label, finalKind) {
  const normalized = normalizeRelativePath(relative, label);
  let current = root;
  let stat = null;
  for (const segment of normalized.split('/')) {
    current = path.join(current, segment);
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      throw budgetError(`cannot inspect ${label}: ${error.message}`);
    }
    if (stat.isSymbolicLink()) throw budgetError(`${label} must not traverse a symbolic link or junction`);
  }
  if (finalKind === 'directory' && !stat.isDirectory()) throw budgetError(`${label} must be a regular directory`);
  if (finalKind === 'file' && !stat.isFile()) throw budgetError(`${label} must be a regular file`);
  return current;
}

function readJson(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw budgetError(`cannot read ${label}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw budgetError(`${label} is not valid JSON: ${error.message}`);
  }
}

function readPayload(file, label) {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) throw budgetError(`${label} must be a regular file, not a link`);
    return fs.readFileSync(file);
  } catch (error) {
    if (error.message.startsWith('performance-budget:')) throw error;
    throw budgetError(`cannot read ${label}: ${error.message}`);
  }
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function comparison(name, measured, limit, operator) {
  const passed = operator === 'maximum' ? measured <= limit : measured >= limit;
  return { name, measured, [operator]: limit, passed };
}

function evaluatePerformanceBudget({
  repositoryRoot = path.resolve(__dirname, '..'),
  budgetFile = DEFAULT_BUDGET_FILE
} = {}) {
  const root = path.resolve(repositoryRoot);
  const budgetPath = resolveInside(root, budgetFile, 'budget file');
  const budget = readJson(budgetPath, 'performance budget');
  if (budget.schemaVersion !== 1) throw budgetError('schemaVersion must be 1');

  const measurement = assertObject(budget.measurement, 'measurement');
  if (measurement.artifactRoot !== '_site') throw budgetError('measurement.artifactRoot must be exactly _site');
  if (measurement.initialDocument !== 'index.html') {
    throw budgetError('measurement.initialDocument must be exactly index.html');
  }
  if (measurement.browserProfile !== 'lighthouse-mobile' || measurement.browserAggregation !== 'median') {
    throw budgetError('measurement browser profile must be lighthouse-mobile with median aggregation');
  }
  if (measurement.scoreScale !== '0-100' || measurement.byteUnit !== 'bytes' || measurement.timeUnit !== 'milliseconds') {
    throw budgetError('measurement units or score scale do not match the release policy');
  }
  const guards = assertObject(budget.regressionGuards, 'regressionGuards');
  const enforcement = assertObject(guards.enforcement, 'regressionGuards.enforcement');
  if (enforcement.artifactMetrics !== 'blocking') {
    throw budgetError('regressionGuards.enforcement.artifactMetrics must be blocking');
  }
  if (enforcement.browserMetrics !== 'dom_blocking_lighthouse_pending_v0.2.2') {
    throw budgetError('regressionGuards.enforcement.browserMetrics must block DOM and defer Lighthouse to v0.2.2');
  }

  const artifactRoot = assertSafePathComponents(root, measurement.artifactRoot, 'measurement.artifactRoot', 'directory');

  const documentPath = assertSafePathComponents(
    artifactRoot,
    measurement.initialDocument,
    'measurement.initialDocument',
    'file'
  );
  const socialGuard = assertObject(guards.socialImage, 'regressionGuards.socialImage');
  if (socialGuard.path !== 'social-card.png') {
    throw budgetError('regressionGuards.socialImage.path must be exactly social-card.png');
  }
  const socialPath = assertSafePathComponents(
    artifactRoot,
    socialGuard.path,
    'regressionGuards.socialImage.path',
    'file'
  );
  const manifestPath = assertSafePathComponents(artifactRoot, 'release-manifest.json', 'release manifest', 'file');
  const document = readPayload(documentPath, 'initial document');
  const socialImage = readPayload(socialPath, 'social image');
  const releaseManifest = readJson(manifestPath, 'release manifest');
  if (!Array.isArray(releaseManifest.files)) throw budgetError('release manifest files must be an array');
  const manifestDocument = releaseManifest.files.find(file => file?.path === measurement.initialDocument);
  const manifestSocial = releaseManifest.files.find(file => file?.path === socialGuard.path);
  if (!manifestDocument || !manifestSocial) {
    throw budgetError('release manifest must cover index.html and social-card.png payloads');
  }
  const initialGuard = assertObject(guards.initialDocument, 'regressionGuards.initialDocument');
  const baseline = assertObject(socialGuard.baseline, 'regressionGuards.socialImage.baseline');
  const domGuard = assertObject(guards.activeDomElements, 'regressionGuards.activeDomElements');
  const domMaximum = requiredNumber(domGuard.maximum, 'regressionGuards.activeDomElements.maximum');
  const observedDom = requiredNumber(domGuard.observedV0_2_0, 'regressionGuards.activeDomElements.observedV0_2_0');
  if (observedDom > domMaximum) throw budgetError('observed v0.2.0 DOM baseline exceeds its blocking maximum');
  const mobile = assertObject(guards.mobileLighthouse, 'regressionGuards.mobileLighthouse');
  const performanceMinimum = requiredNumber(
    assertObject(mobile.performanceScore, 'regressionGuards.mobileLighthouse.performanceScore').minimum,
    'regressionGuards.mobileLighthouse.performanceScore.minimum'
  );
  if (performanceMinimum > 100) throw budgetError('mobile Lighthouse performance minimum must not exceed 100');
  requiredNumber(assertObject(mobile.firstContentfulPaintMs, 'regressionGuards.mobileLighthouse.firstContentfulPaintMs').maximum, 'regressionGuards.mobileLighthouse.firstContentfulPaintMs.maximum');
  requiredNumber(assertObject(mobile.largestContentfulPaintMs, 'regressionGuards.mobileLighthouse.largestContentfulPaintMs').maximum, 'regressionGuards.mobileLighthouse.largestContentfulPaintMs.maximum');
  requiredNumber(assertObject(mobile.totalBlockingTimeMs, 'regressionGuards.mobileLighthouse.totalBlockingTimeMs').maximum, 'regressionGuards.mobileLighthouse.totalBlockingTimeMs.maximum');
  requiredNumber(assertObject(mobile.cumulativeLayoutShift, 'regressionGuards.mobileLighthouse.cumulativeLayoutShift').maximum, 'regressionGuards.mobileLighthouse.cumulativeLayoutShift.maximum');

  const future = assertObject(budget.futureTargets, 'futureTargets');
  if (future.enforcement !== 'nonblocking' || future.notBefore !== 'v0.2.2') {
    throw budgetError('futureTargets must remain nonblocking until v0.2.2');
  }
  requiredNumber(assertObject(assertObject(future.initialDocument, 'futureTargets.initialDocument').rawBytes, 'futureTargets.initialDocument.rawBytes').maximum, 'futureTargets.initialDocument.rawBytes.maximum');
  requiredNumber(assertObject(future.compressedTransferBytes, 'futureTargets.compressedTransferBytes').maximum, 'futureTargets.compressedTransferBytes.maximum');
  requiredNumber(assertObject(future.activeDomElements, 'futureTargets.activeDomElements').maximum, 'futureTargets.activeDomElements.maximum');
  const futureMobile = assertObject(future.mobileLighthouse, 'futureTargets.mobileLighthouse');
  requiredNumber(assertObject(futureMobile.performanceScore, 'futureTargets.mobileLighthouse.performanceScore').minimum, 'futureTargets.mobileLighthouse.performanceScore.minimum');
  requiredNumber(assertObject(futureMobile.firstContentfulPaintMs, 'futureTargets.mobileLighthouse.firstContentfulPaintMs').maximum, 'futureTargets.mobileLighthouse.firstContentfulPaintMs.maximum');
  requiredNumber(assertObject(futureMobile.largestContentfulPaintMs, 'futureTargets.mobileLighthouse.largestContentfulPaintMs').maximum, 'futureTargets.mobileLighthouse.largestContentfulPaintMs.maximum');
  requiredNumber(assertObject(futureMobile.totalBlockingTimeMs, 'futureTargets.mobileLighthouse.totalBlockingTimeMs').maximum, 'futureTargets.mobileLighthouse.totalBlockingTimeMs.maximum');
  requiredNumber(assertObject(futureMobile.cumulativeLayoutShift, 'futureTargets.mobileLighthouse.cumulativeLayoutShift').maximum, 'futureTargets.mobileLighthouse.cumulativeLayoutShift.maximum');
  requiredNumber(assertObject(future.socialImageBytes, 'futureTargets.socialImageBytes').maximum, 'futureTargets.socialImageBytes.maximum');

  const checks = [
    comparison(
      'initialDocument.rawBytes',
      document.byteLength,
      requiredNumber(initialGuard.rawBytes?.maximum, 'regressionGuards.initialDocument.rawBytes.maximum'),
      'maximum'
    ),
    comparison(
      'initialDocument.gzipBytes',
      zlib.gzipSync(document, { level: 9 }).byteLength,
      requiredNumber(initialGuard.gzipBytes?.maximum, 'regressionGuards.initialDocument.gzipBytes.maximum'),
      'maximum'
    ),
    comparison(
      'socialImage.bytes',
      socialImage.byteLength,
      requiredNumber(socialGuard.maximumBytes, 'regressionGuards.socialImage.maximumBytes'),
      'maximum'
    ),
    {
      name: 'socialImage.baselineBytes',
      measured: socialImage.byteLength,
      expected: requiredNumber(baseline.bytes, 'regressionGuards.socialImage.baseline.bytes'),
      passed: socialImage.byteLength === baseline.bytes
    },
    {
      name: 'socialImage.baselineSha256',
      measured: sha256(socialImage),
      expected: String(baseline.sha256 || '').toLowerCase(),
      passed: /^[0-9a-f]{64}$/u.test(String(baseline.sha256 || '')) && sha256(socialImage) === String(baseline.sha256).toLowerCase()
    },
    {
      name: 'releaseManifest.initialDocument',
      measured: {
        bytes: document.byteLength,
        sha256: sha256(document),
        mediaType: 'text/html; charset=utf-8'
      },
      expected: manifestDocument,
      passed: manifestDocument.bytes === document.byteLength &&
        manifestDocument.sha256 === sha256(document) &&
        manifestDocument.mediaType === 'text/html; charset=utf-8'
    },
    {
      name: 'releaseManifest.socialImage',
      measured: {
        bytes: socialImage.byteLength,
        sha256: sha256(socialImage),
        mediaType: 'image/png'
      },
      expected: manifestSocial,
      passed: manifestSocial.bytes === socialImage.byteLength &&
        manifestSocial.sha256 === sha256(socialImage) &&
        manifestSocial.mediaType === 'image/png'
    }
  ];

  const failures = checks.filter(check => !check.passed);
  return {
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    budgetFile,
    artifactRoot: measurement.artifactRoot,
    checks,
    browserMetrics: {
      status: 'DOM_BLOCKING_LIGHTHOUSE_PENDING',
      activeDomElements: { observed: observedDom, maximum: domMaximum },
      pendingCheckpoint: 'v0.2.2',
      pendingMetrics: ['mobileLighthouse']
    },
    failures
  };
}

function main() {
  const report = evaluatePerformanceBudget();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.failures.length > 0) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { evaluatePerformanceBudget };
