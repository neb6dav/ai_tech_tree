#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { killAll, launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { chromium } from 'playwright';

import { startStagedSiteServer } from './lib/staged-site-server.mjs';

const require = createRequire(import.meta.url);
const { evaluatePerformanceBudget } = require('./performance-budget-test.cjs');

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
const BUDGET_PATH = path.join(REPOSITORY_ROOT, 'performance-budget.json');
const SITE_ROOT = path.join(REPOSITORY_ROOT, '_site');

const METRIC_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'performanceScore', audit: null, operator: 'minimum' }),
  Object.freeze({ key: 'firstContentfulPaintMs', audit: 'first-contentful-paint', operator: 'maximum' }),
  Object.freeze({ key: 'largestContentfulPaintMs', audit: 'largest-contentful-paint', operator: 'maximum' }),
  Object.freeze({ key: 'totalBlockingTimeMs', audit: 'total-blocking-time', operator: 'maximum' }),
  Object.freeze({ key: 'cumulativeLayoutShift', audit: 'cumulative-layout-shift', operator: 'maximum' })
]);

export const LIGHTHOUSE_PROFILE = Object.freeze({
  locale: 'en-US',
  onlyCategories: Object.freeze(['performance']),
  formFactor: 'mobile',
  throttlingMethod: 'simulate',
  throttling: Object.freeze({
    rttMs: 150,
    throughputKbps: 1638.4,
    requestLatencyMs: 562.5,
    downloadThroughputKbps: 1474.5600000000002,
    uploadThroughputKbps: 675,
    cpuSlowdownMultiplier: 4
  }),
  screenEmulation: Object.freeze({
    mobile: true,
    width: 412,
    height: 823,
    deviceScaleFactor: 1.75,
    disabled: false
  }),
  emulatedUserAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36',
  maxWaitForFcp: 30_000,
  maxWaitForLoad: 45_000,
  pauseAfterFcpMs: 1_000,
  pauseAfterLoadMs: 1_000,
  networkQuietThresholdMs: 1_000,
  cpuQuietThresholdMs: 1_000,
  disableStorageReset: false,
  disableFullPageScreenshot: true
});

export function lighthouseProfileSha256(profile = LIGHTHOUSE_PROFILE) {
  return createHash('sha256').update(JSON.stringify(profile)).digest('hex');
}

export function assertCalibrationProfileBinding(mobileBudget, profileSha256) {
  if (mobileBudget.status !== 'blocking') return;
  const calibrated = mobileBudget.calibration?.profileSha256;
  if (calibrated !== profileSha256) {
    throw lighthouseError(`active profile SHA-256 ${profileSha256} does not match calibrated profile ${calibrated || 'missing'}`);
  }
}

export function calibrationReportContext({ measurement, mobileBudget, toolchain }) {
  const canonicalPlatformUsedForThisRun = toolchain.platform === measurement.canonicalPlatform;
  return Object.freeze({
    canonicalPlatform: measurement.canonicalPlatform,
    calibrationSourcePlatform: mobileBudget.calibration?.sourcePlatform ?? null,
    measurementPlatform: toolchain.platform,
    recordedCanonicalConfirmation: mobileBudget.calibration?.canonicalConfirmation ?? 'required',
    canonicalConfirmation: canonicalPlatformUsedForThisRun ? 'confirmed-this-run' : 'required',
    canonicalPlatformUsedForThisRun
  });
}

function lighthouseError(message) {
  return new Error(`lighthouse-budget: ${message}`);
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw lighthouseError(`${label} must be an object`);
  }
  return value;
}

function requiredNumber(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw lighthouseError(`${label} must be a finite non-negative number`);
  }
  return value;
}

function requiredOddRunCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value % 2 === 0) {
    throw lighthouseError(`${label} must be a positive odd integer`);
  }
  return value;
}

export function median(values) {
  if (!Array.isArray(values) || values.length === 0 || values.length % 2 === 0) {
    throw lighthouseError('median requires a non-empty odd-length array');
  }
  const ordered = values.map((value, index) => requiredNumber(value, `median[${index}]`)).sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)];
}

function auditNumericValue(lhr, auditId) {
  const audit = lhr.audits?.[auditId];
  if (!audit) throw lighthouseError(`Lighthouse result is missing audit ${auditId}`);
  assertAuditHealthy(audit, `audits.${auditId}`);
  return requiredNumber(audit.numericValue, `audits.${auditId}.numericValue`);
}

function assertAuditHealthy(audit, label) {
  if (audit.scoreDisplayMode === 'error' || audit.errorMessage) {
    throw lighthouseError(`${label} failed: ${audit.errorMessage || 'scoreDisplayMode=error'}`);
  }
}

function assertLocalUrl(value, allowedOrigin, label) {
  if (typeof value !== 'string' || value.length === 0) throw lighthouseError(`${label} must be a URL`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw lighthouseError(`${label} is not a valid URL`);
  }
  if (parsed.origin !== allowedOrigin) throw lighthouseError(`${label} escaped the staged-site origin: ${value}`);
}

export function extractLighthouseRun(lhr, { allowedOrigin }) {
  assertObject(lhr, 'Lighthouse result');
  if (lhr.runtimeError) {
    throw lighthouseError(`Lighthouse runtime error: ${lhr.runtimeError.code || 'UNKNOWN'} ${lhr.runtimeError.message || ''}`.trim());
  }
  if (Array.isArray(lhr.runWarnings) && lhr.runWarnings.length > 0) {
    throw lighthouseError(`Lighthouse run warnings: ${lhr.runWarnings.join(' | ')}`);
  }

  for (const key of ['requestedUrl', 'mainDocumentUrl', 'finalDisplayedUrl', 'finalUrl']) {
    if (lhr[key] !== undefined) assertLocalUrl(lhr[key], allowedOrigin, key);
  }

  const networkAudit = assertObject(lhr.audits?.['network-requests'], 'audits.network-requests');
  assertAuditHealthy(networkAudit, 'audits.network-requests');
  const networkItems = networkAudit.details?.items;
  if (!Array.isArray(networkItems)) throw lighthouseError('audits.network-requests.details.items must be an array');
  const externalRequests = [];
  for (const item of networkItems) {
    if (typeof item?.url !== 'string') throw lighthouseError('network request is missing its URL');
    let requestUrl;
    try {
      requestUrl = new URL(item.url);
    } catch {
      throw lighthouseError(`network request URL is invalid: ${item.url}`);
    }
    if (!['data:', 'blob:'].includes(requestUrl.protocol) && requestUrl.origin !== allowedOrigin) {
      externalRequests.push(item.url);
    }
  }
  if (externalRequests.length > 0) {
    throw lighthouseError(`external requests were recorded: ${externalRequests.join(', ')}`);
  }

  const score = lhr.categories?.performance?.score;
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw lighthouseError('categories.performance.score must be between 0 and 1');
  }

  return Object.freeze({
    performanceScore: Number((score * 100).toFixed(2)),
    firstContentfulPaintMs: auditNumericValue(lhr, 'first-contentful-paint'),
    largestContentfulPaintMs: auditNumericValue(lhr, 'largest-contentful-paint'),
    totalBlockingTimeMs: auditNumericValue(lhr, 'total-blocking-time'),
    cumulativeLayoutShift: auditNumericValue(lhr, 'cumulative-layout-shift'),
    initialDomElements: auditNumericValue(lhr, 'dom-size-insight'),
    totalByteWeight: auditNumericValue(lhr, 'total-byte-weight'),
    networkRequestCount: networkItems.length,
    runWarnings: []
  });
}

function limitSetFor(mobileBudget) {
  const status = mobileBudget.status;
  if (status === 'calibration_pending') {
    return assertObject(mobileBudget.candidateLimits, 'mobileLighthouse.candidateLimits');
  }
  if (status === 'blocking') {
    return assertObject(mobileBudget.limits, 'mobileLighthouse.limits');
  }
  throw lighthouseError('mobileLighthouse.status must be calibration_pending or blocking');
}

function metricComparison(definition, measured, limitSet) {
  const configured = assertObject(limitSet[definition.key], `mobileLighthouse limits.${definition.key}`);
  const limit = requiredNumber(configured[definition.operator], `mobileLighthouse limits.${definition.key}.${definition.operator}`);
  if (definition.key === 'performanceScore' && limit > 100) {
    throw lighthouseError('mobile Lighthouse performance minimum must not exceed 100');
  }
  const passed = definition.operator === 'minimum' ? measured >= limit : measured <= limit;
  return Object.freeze({
    name: `mobileLighthouse.${definition.key}`,
    measured,
    [definition.operator]: limit,
    passed
  });
}

export function evaluateLighthouseRuns({ runs, mobileBudget }) {
  if (!Array.isArray(runs) || runs.length === 0 || runs.length % 2 === 0) {
    throw lighthouseError('runs must be a non-empty odd-length array');
  }
  for (const [index, run] of runs.entries()) {
    assertObject(run, `runs[${index}]`);
    for (const definition of METRIC_DEFINITIONS) requiredNumber(run[definition.key], `runs[${index}].${definition.key}`);
  }

  const medians = Object.fromEntries(
    METRIC_DEFINITIONS.map(definition => [definition.key, median(runs.map(run => run[definition.key]))])
  );
  const checks = METRIC_DEFINITIONS.map(definition => metricComparison(definition, medians[definition.key], limitSetFor(mobileBudget)));
  const misses = checks.filter(check => !check.passed);
  const blocking = mobileBudget.status === 'blocking';

  return Object.freeze({
    status: blocking ? (misses.length === 0 ? 'PASS' : 'FAIL') : 'CALIBRATION_PENDING',
    enforcement: mobileBudget.status,
    medians,
    checks,
    candidateMisses: blocking ? [] : misses,
    failures: blocking ? misses : []
  });
}

export function parseArguments(argumentsList) {
  if (argumentsList.length === 0) return Object.freeze({ calibration: false });
  if (argumentsList.length === 1 && argumentsList[0] === '--calibrate') {
    return Object.freeze({ calibration: true });
  }
  throw lighthouseError('usage: node scripts/lighthouse-budget.mjs [--calibrate]');
}

async function readJson(file, label) {
  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    throw lighthouseError(`cannot read ${label}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw lighthouseError(`${label} is not valid JSON: ${error.message}`);
  }
}

async function installedToolchain() {
  const [lighthousePackage, chromeLauncherPackage, playwrightPackage, browsers] = await Promise.all([
    readJson(path.join(REPOSITORY_ROOT, 'node_modules/lighthouse/package.json'), 'Lighthouse package metadata'),
    readJson(path.join(REPOSITORY_ROOT, 'node_modules/chrome-launcher/package.json'), 'chrome-launcher package metadata'),
    readJson(path.join(REPOSITORY_ROOT, 'node_modules/playwright/package.json'), 'Playwright package metadata'),
    readJson(path.join(REPOSITORY_ROOT, 'node_modules/playwright-core/browsers.json'), 'Playwright browser metadata')
  ]);
  const chromiumMetadata = browsers.browsers?.find(browser => browser.name === 'chromium');
  if (!chromiumMetadata) throw lighthouseError('Playwright Chromium metadata is unavailable');
  return Object.freeze({
    lighthouseVersion: lighthousePackage.version,
    chromeLauncherVersion: chromeLauncherPackage.version,
    playwrightVersion: playwrightPackage.version,
    chromiumRevision: String(chromiumMetadata.revision),
    chromiumVersion: chromiumMetadata.browserVersion,
    nodeVersion: process.version,
    platform: await detectedPlatform(),
    architecture: process.arch
  });
}

async function detectedPlatform() {
  if (process.platform !== 'linux') return process.platform;
  try {
    const release = await fs.readFile('/etc/os-release', 'utf8');
    const fields = Object.fromEntries(
      release
        .split(/\r?\n/u)
        .filter(line => /^[A-Z_]+=/u.test(line))
        .map(line => {
          const separator = line.indexOf('=');
          return [line.slice(0, separator), line.slice(separator + 1).replace(/^"|"$/gu, '')];
        })
    );
    if (fields.ID && fields.VERSION_ID) return `${fields.ID}-${fields.VERSION_ID}`;
  } catch {
    // A Linux host without os-release is noncanonical for calibration.
  }
  return 'linux-unknown';
}

function assertToolchain(measurement, toolchain) {
  for (const key of ['lighthouseVersion', 'chromeLauncherVersion', 'playwrightVersion', 'chromiumRevision', 'chromiumVersion']) {
    if (measurement[key] !== toolchain[key]) {
      throw lighthouseError(`installed ${key} ${toolchain[key]} does not match budget ${measurement[key]}`);
    }
  }
}

export async function runLighthouseAudit(url, {
  launchBrowser = launch,
  killBrowsers = killAll,
  audit = lighthouse,
  chromePath = chromium.executablePath(),
  temporaryParent = os.tmpdir()
} = {}) {
  const resolvedTemporaryParent = path.resolve(temporaryParent);
  const cleanupRoot = await fs.mkdtemp(path.join(resolvedTemporaryParent, 'ai-tree-lighthouse-'));
  let chrome;
  let launched = false;
  try {
    try {
      chrome = await launchBrowser({
        chromePath,
        chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--force-prefers-reduced-motion'],
        handleSIGINT: false,
        logLevel: 'silent',
        userDataDir: cleanupRoot
      });
      launched = true;
    } catch (error) {
      const cleanupErrors = killBrowsers();
      if (Array.isArray(cleanupErrors) && cleanupErrors.length > 0) {
        throw new AggregateError([error, ...cleanupErrors], 'Lighthouse browser launch and cleanup failed');
      }
      throw error;
    }

    const result = await audit(url, {
      ...LIGHTHOUSE_PROFILE,
      port: chrome.port,
      logLevel: 'error',
      output: 'json'
    });
    if (!result?.lhr) throw lighthouseError('Lighthouse did not return an LHR');
    return result.lhr;
  } finally {
    const cleanupErrors = [];
    if (launched) {
      const exit = waitForProcessExit(chrome.process);
      try {
        chrome.kill();
      } catch (error) {
        cleanupErrors.push(error);
      }
      await exit;
    }
    const relativeCleanup = path.relative(resolvedTemporaryParent, cleanupRoot);
    if (relativeCleanup.startsWith('..') || path.isAbsolute(relativeCleanup)) {
      throw lighthouseError('temporary cleanup root escaped its requested parent');
    }
    try {
      await fs.rm(cleanupRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Lighthouse browser cleanup failed');
  }
}

function waitForProcessExit(child, timeoutMs = 5_000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const staticReport = evaluatePerformanceBudget();
  if (staticReport.failures.length > 0) {
    throw lighthouseError('deterministic artifact budget must pass before browser measurement');
  }

  const budget = await readJson(BUDGET_PATH, 'performance budget');
  const measurement = assertObject(budget.measurement, 'measurement');
  const mobileBudget = assertObject(budget.regressionGuards?.mobileLighthouse, 'mobileLighthouse');
  const toolchain = await installedToolchain();
  assertToolchain(measurement, toolchain);
  const profileSha256 = lighthouseProfileSha256();
  assertCalibrationProfileBinding(mobileBudget, profileSha256);
  const calibrationContext = calibrationReportContext({ measurement, mobileBudget, toolchain });
  const runCount = requiredOddRunCount(
    options.calibration ? measurement.calibrationRuns : measurement.browserRuns,
    options.calibration ? 'measurement.calibrationRuns' : 'measurement.browserRuns'
  );

  const stagedSite = await startStagedSiteServer({ siteRoot: SITE_ROOT });
  const runs = [];
  try {
    for (let index = 0; index < runCount; index += 1) {
      process.stderr.write(`Lighthouse ${options.calibration ? 'calibration ' : ''}run ${index + 1}/${runCount}\n`);
      const lhr = await runLighthouseAudit(stagedSite.url);
      runs.push(extractLighthouseRun(lhr, { allowedOrigin: stagedSite.origin }));
    }
  } finally {
    await stagedSite.close();
  }

  const evaluation = evaluateLighthouseRuns({ runs, mobileBudget });
  const artifactCheck = staticReport.checks.find(check => check.name === 'releaseManifest.initialDocument');
  const report = {
    status: evaluation.status,
    mode: options.calibration ? 'calibration' : 'gate',
    enforcement: evaluation.enforcement,
    ...calibrationContext,
    profile: LIGHTHOUSE_PROFILE,
    toolchain,
    artifact: artifactCheck?.measured ?? null,
    runs,
    medians: evaluation.medians,
    checks: evaluation.checks,
    candidateMisses: evaluation.candidateMisses,
    failures: evaluation.failures,
    profileSha256
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (evaluation.failures.length > 0) process.exitCode = 1;
}

if (import.meta.main) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 2;
  });
}
