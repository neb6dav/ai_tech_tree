import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  classifyNetworkFailure,
  planPostDeploySmoke,
  postDeploySmokeConstants,
  runPostDeploySmoke
} from '../scripts/post-deploy-smoke.mjs';

const BASE = 'https://neb6dav.github.io/ai_tech_tree/';
const TAG = 'v0.1.1';
const COMMIT = '1'.repeat(40);
const TAG_OBJECT = '2'.repeat(40);
const PROTECTED_COMMIT = '3'.repeat(40);
const temporaryRoots = new Set();

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function contentTypeFor(filePath) {
  if (filePath === 'CITATION.cff') return 'text/yaml; charset=utf-8';
  if (filePath === 'robots.txt') return 'text/plain; charset=utf-8';
  if (filePath === 'sitemap.xml') return 'application/xml; charset=utf-8';
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.jsonld')) return 'application/ld+json';
  if (filePath.endsWith('.ndjson')) return 'application/octet-stream';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function makeFixture({ mutateManifest, mutateFiles } = {}) {
  const payloads = new Map([
    ['.nojekyll', Buffer.alloc(0)],
    ['CITATION.cff', Buffer.from('cff-version: 1.2.0\n')],
    ['ai-research-tech-tree.html', Buffer.from('<!doctype html><title>Alias</title>\n')],
    ['ai-research-tech-tree.json', Buffer.from('{"kind":"atlas"}\n')],
    ['ai-research-tech-tree.jsonld', Buffer.from('{"@context":"https://schema.org"}\n')],
    ['ai-research-tech-tree.ndjson', Buffer.from('{"id":"alexnet"}\n')],
    ['data/opportunities/diffusion-models.alpha.json', Buffer.from('{"id":"diffusion-models"}\n')],
    ['data/opportunities/opportunity-map.schema.json', Buffer.from('{"$schema":"https://json-schema.org/draft/2020-12/schema"}\n')],
    ['index.html', Buffer.from('<!doctype html><title>AI Research Tech Tree</title>\n')],
    ['robots.txt', Buffer.from('User-agent: *\nAllow: /\n')],
    ['sitemap.xml', Buffer.from('<?xml version="1.0"?><urlset/>\n')],
    ['social-card.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])]
  ]);
  mutateFiles?.(payloads);
  const files = [...payloads]
    .map(([filePath, bytes]) => ({
      path: filePath,
      mediaType: contentTypeFor(filePath),
      bytes: bytes.byteLength,
      sha256: digest(bytes)
    }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const manifest = {
    schemaVersion: '1.4.0',
    stageConfigVersion: '1.1.0',
    stageConfig: {
      path: 'config/pages-stage.v1.json',
      sha256: '8'.repeat(64)
    },
    edition: '2026-08-20-public-beta-2',
    version: '0.1.1',
    releaseState: 'Public beta',
    commit: COMMIT,
    publicationMode: 'release',
    releaseSpec: {
      path: 'config/releases/v0.1.1.json',
      sha256: '4'.repeat(64),
      schemaVersion: '1.0.0',
      status: 'ready',
      tag: TAG,
      version: '0.1.1',
      edition: '2026-08-20-public-beta-2',
      releaseDate: '2026-08-20',
      releaseState: 'Public beta',
      defaultBranch: 'main',
      protectedMainRef: 'refs/remotes/origin/main',
      productionEnvironment: 'github-pages',
      productionBaseUrl: BASE,
      prerelease: true,
      assetStem: 'ai-research-tech-tree-v0.1.1'
    },
    tag: TAG,
    promotion: {
      releaseDate: '2026-08-20',
      tag: TAG,
      mode: 'annotated-tag',
      tagObject: TAG_OBJECT,
      tagCommit: COMMIT,
      taggedAt: '2026-08-20T15:04:05+00:00',
      protectedMainRef: 'refs/remotes/origin/main',
      protectedMainCommit: PROTECTED_COMMIT,
      reachableFromProtectedMain: true
    },
    sourceState: {
      kind: 'git',
      clean: true,
      requiredClean: true,
      repositoryTopLevel: '.',
      repositoryRootMatchesTopLevel: true,
      gitObjectFormat: 'sha1',
      objectDatabaseVerified: true,
      repositoryFsckConfigurationIsolated: true,
      repositoryAttributesIsolated: true,
      trackedTreeEntryCount: 70,
      trackedTreeFilterAttributeCount: 0,
      trackedTreeFiltersVerified: true,
      trackedTreeFilterAuditSha256: '5'.repeat(64),
      head: COMMIT,
      commitMatchesHead: true,
      changedEntryCount: 0,
      statusSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      flaggedIndexEntryCount: 0,
      indexFlagsSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      inputCount: 17,
      matchedInputCount: 17,
      directorySourceCount: 0,
      matchedDirectorySourceCount: 0,
      inputsMatchCommit: true,
      inputVerificationSha256: '6'.repeat(64)
    },
    generatorVersion: '1.3.1',
    dataDigest: '7'.repeat(64),
    toolchain: {
      node: 'v24.14.1',
      npm: '11.11.0',
      packageLockVersion: 3,
      releaseRef: '1.0.0',
      stageSite: '1.4.0'
    },
    manifest: {
      path: 'release-manifest.json',
      selfHashExcluded: true,
      filesCoverage: 'all-payload-files',
      filesExcluded: ['release-manifest.json']
    },
    fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    files
  };
  mutateManifest?.(manifest);
  const expectedManifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  return {
    manifest,
    payloads,
    options: {
      expectedManifestBytes,
      expectedManifestSha256: digest(expectedManifestBytes),
      expectedTag: TAG,
      expectedCommit: COMMIT
    }
  };
}

function makeTransport(fixture, mutate) {
  const calls = [];
  const request = async descriptor => {
    calls.push(descriptor);
    assert.equal(descriptor.method, 'GET');
    assert.equal(descriptor.redirect, 'manual');
    assert.equal(descriptor.credentials, 'omit');
    assert.equal(descriptor.headers['Accept-Encoding'], 'identity');
    const url = new URL(descriptor.url);
    let response;
    if (descriptor.url === BASE.slice(0, -1)) {
      response = { status: 301, url: descriptor.url, headers: { location: BASE, 'content-length': '0' }, body: Buffer.alloc(0) };
    } else if (url.pathname.endsWith('__ai-tree-release-smoke__-must-not-exist-7f4c48f8')) {
      response = { status: 404, url: descriptor.url, headers: { 'content-type': 'text/html', 'content-length': '9' }, body: Buffer.from('not found') };
    } else if (url.pathname.endsWith('/release-manifest.json')) {
      const bytes = fixture.options.expectedManifestBytes;
      response = {
        status: 200,
        url: descriptor.url,
        headers: { 'content-type': 'application/json; charset=utf-8', 'content-length': String(bytes.byteLength) },
        body: bytes
      };
    } else {
      let relative = decodeURIComponent(url.pathname.slice(new URL(BASE).pathname.length));
      if (relative === '') relative = 'index.html';
      const bytes = fixture.payloads.get(relative);
      assert.ok(bytes, `unexpected requested path ${relative}`);
      response = {
        status: 200,
        url: descriptor.url,
        headers: { 'content-type': contentTypeFor(relative), 'content-length': String(bytes.byteLength) },
        body: bytes
      };
    }
    return mutate ? (await mutate({ descriptor, response, calls })) || response : response;
  };
  return { calls, request };
}

function immediateDependencies(request, overrides = {}) {
  let current = 1_700_000_000_000;
  return {
    request,
    now: () => current,
    sleep: async milliseconds => { current += milliseconds; },
    deadlineMs: 1000,
    retryDelayMs: 1,
    timeoutMs: 100,
    concurrency: 1,
    ...overrides
  };
}

test.afterEach(async () => {
  await Promise.all([...temporaryRoots].map(root => rm(root, { recursive: true, force: true })));
  temporaryRoots.clear();
});

test('plan is deterministic, sorted, complete, and makes zero requests', async () => {
  const fixture = makeFixture();
  let requests = 0;
  const first = await runPostDeploySmoke(fixture.options, { request: async () => { requests += 1; } });
  const second = planPostDeploySmoke(fixture.options);

  assert.deepEqual(first, second);
  assert.equal(requests, 0);
  assert.equal(first.mode, 'plan');
  assert.equal(first.baseUrl, BASE);
  assert.equal(first.version, '0.1.1');
  assert.equal(first.edition, '2026-08-20-public-beta-2');
  assert.equal(first.releaseState, 'Public beta');
  assert.equal(first.dataDigest, '7'.repeat(64));
  assert.equal(first.clientStateUrls.length, 4);
  assert.ok(first.clientStateUrls.every(item =>
    item.clientStateVerified === false && item.artifactBound === true &&
    item.networkRequest === false && item.requestUrl === BASE));
  assert.equal(first.representativeAlias.url, `${BASE}ai-research-tech-tree.html`);
  assert.equal(first.representativeAlias.requestUrl, `${BASE}ai-research-tech-tree.html`);
  assert.equal(first.representativeAlias.serverArtifactVerified, false);
  assert.deepEqual(first.targets.map(target => target.id), [...first.targets.map(target => target.id)].sort());
  assert.equal(first.deploymentControl.path, '.nojekyll');
  assert.equal(first.deploymentControl.publicRequest, false);
  assert.ok(first.targets.some(target => target.id === 'root'));
  assert.ok(first.targets.some(target => target.id === 'payload:ai-research-tech-tree.html'));
  assert.ok(first.probes.some(probe => probe.kind === 'canonicalization'));
  assert.ok(first.probes.some(probe => probe.kind === 'not-found'));
  assert.deepEqual(postDeploySmokeConstants, {
    scriptVersion: '1.0.0',
    reportSchemaVersion: '1.0.0',
    productionBaseUrl: BASE,
    defaultDeadlineMs: 720000,
    defaultRetryDelayMs: 15000,
    defaultRequestTimeoutMs: 20000,
    maxManifestFiles: 64,
    maxPayloadBytes: 16777216,
    maxTotalPayloadBytes: 67108864,
    maxManifestPathBytes: 512,
    maxPublicUrlBytes: 2048,
    maxPlannedTransferBytes: 33554432,
    maxWaitMs: 60000,
    maxConcurrency: 4
  });
});

test('happy-path execution verifies exact manifest bytes before and after every public payload', async () => {
  const fixture = makeFixture();
  const transport = makeTransport(fixture);
  const dependencies = immediateDependencies(transport.request);
  const first = await runPostDeploySmoke({ ...fixture.options, execute: true }, dependencies);
  const secondTransport = makeTransport(fixture);
  const second = await runPostDeploySmoke({ ...fixture.options, execute: true }, immediateDependencies(secondTransport.request));

  assert.deepEqual(first, second);
  assert.equal(first.status, 'verified');
  assert.equal(first.version, '0.1.1');
  assert.equal(first.edition, '2026-08-20-public-beta-2');
  assert.equal(first.releaseState, 'Public beta');
  assert.equal(first.dataDigest, '7'.repeat(64));
  assert.equal(first.representativeAlias.serverArtifactVerified, true);
  assert.equal(first.attempts, 1);
  assert.equal(first.manifestStart.sha256, fixture.options.expectedManifestSha256);
  assert.equal(first.manifestEnd.sha256, fixture.options.expectedManifestSha256);
  assert.equal(transport.calls[0].url, `${BASE}release-manifest.json`);
  assert.equal(transport.calls.at(-1).url, `${BASE}release-manifest.json`);
  assert.equal(transport.calls.some(call => call.url.endsWith('/.nojekyll')), false);
  assert.equal(first.targets.length, fixture.payloads.size - 1 + 1);
  assert.equal(transport.calls.filter(call => call.url === BASE).length, 1);
  assert.equal(transport.calls.filter(call => call.url === `${BASE}ai-research-tech-tree.html`).length, 1);
  assert.deepEqual(first.probes.map(probe => probe.status).sort(), [301, 404]);
});

test('stale remote manifest converges within a bounded deadline', async () => {
  const fixture = makeFixture();
  const stale = Buffer.concat([fixture.options.expectedManifestBytes, Buffer.from(' ')]);
  let manifestCalls = 0;
  const transport = makeTransport(fixture, ({ descriptor, response }) => {
    if (descriptor.url.endsWith('/release-manifest.json') && ++manifestCalls === 1) {
      return { ...response, body: stale, headers: { ...response.headers, 'content-length': String(stale.byteLength) } };
    }
  });
  const report = await runPostDeploySmoke(
    { ...fixture.options, execute: true },
    immediateDependencies(transport.request, { deadlineMs: 50, retryDelayMs: 10 })
  );
  assert.equal(report.attempts, 2);
  assert.equal(manifestCalls, 3);
});

test('stale remote manifest fails closed when the deadline expires', async () => {
  const fixture = makeFixture();
  const stale = Buffer.from(fixture.options.expectedManifestBytes);
  stale[10] = stale[10] === 32 ? 33 : 32;
  const transport = makeTransport(fixture, ({ descriptor, response }) => {
    if (descriptor.url.endsWith('/release-manifest.json')) {
      return { ...response, body: stale, headers: { ...response.headers, 'content-length': String(stale.byteLength) } };
    }
  });
  await assert.rejects(
    runPostDeploySmoke(
      { ...fixture.options, execute: true },
      immediateDependencies(transport.request, { deadlineMs: 20, retryDelayMs: 10 })
    ),
    /did not converge before the absolute 20ms deadline after 2 attempt\(s\)/u
  );
});

test('absolute deadline rejects zero before any request and clips every request timeout', async t => {
  await t.test('zero budget', async () => {
    const fixture = makeFixture();
    let calls = 0;
    await assert.rejects(
      runPostDeploySmoke(
        { ...fixture.options, execute: true },
        immediateDependencies(async () => { calls += 1; }, { deadlineMs: 0 })
      ),
      /dependency deadlineMs must be a safe integer from 1/u
    );
    assert.equal(calls, 0);
  });
  await t.test('clipped request timeouts and no late success', async () => {
    const fixture = makeFixture();
    const transport = makeTransport(fixture);
    const timeouts = [];
    let current = 1_000;
    const request = async descriptor => {
      timeouts.push(descriptor.timeoutMs);
      const response = await transport.request(descriptor);
      current += timeouts.length === 1 ? 30 : 20;
      return response;
    };
    await assert.rejects(
      runPostDeploySmoke(
        { ...fixture.options, execute: true },
        {
          request,
          now: () => current,
          sleep: async milliseconds => { current += milliseconds; },
          deadlineMs: 50,
          retryDelayMs: 10,
          timeoutMs: 100,
          concurrency: 1
        }
      ),
      /absolute 50ms deadline expired after/u
    );
    assert.deepEqual(timeouts, [50, 20]);
    assert.equal(transport.calls.length, 2);
  });
  await t.test('the report duration uses the same validated success timestamp', async () => {
    const fixture = makeFixture();
    const transport = makeTransport(fixture);
    let manifestCalls = 0;
    let finalManifestReturned = false;
    let postFinalClockCalls = 0;
    const request = async descriptor => {
      const response = await transport.request(descriptor);
      if (descriptor.url.endsWith('/release-manifest.json') && ++manifestCalls === 2) {
        finalManifestReturned = true;
      }
      return response;
    };
    const now = () => {
      if (!finalManifestReturned) return 0;
      postFinalClockCalls += 1;
      if (postFinalClockCalls <= 2) return 0;
      return postFinalClockCalls === 3 ? 99 : 100;
    };
    const report = await runPostDeploySmoke(
      { ...fixture.options, execute: true },
      {
        request,
        now,
        sleep: async () => {},
        deadlineMs: 100,
        retryDelayMs: 10,
        timeoutMs: 100,
        concurrency: 1
      }
    );
    assert.equal(report.durationMs, 99);
    assert.ok(report.durationMs < 100);
    assert.equal(postFinalClockCalls, 3, 'success must not read an unvalidated second timestamp');
  });
});

test('a failed concurrent batch drains in-flight work and launches nothing after settlement', async () => {
  const fixture = makeFixture();
  const transport = makeTransport(fixture);
  let batchCalls = 0;
  let releaseSecond;
  let signalForSecond;
  let markSecondStarted;
  const secondStarted = new Promise(resolve => { markSecondStarted = resolve; });
  const secondLatch = new Promise(resolve => { releaseSecond = resolve; });
  const request = async descriptor => {
    const response = await transport.request(descriptor);
    if (descriptor.url.endsWith('/release-manifest.json')) return response;
    batchCalls += 1;
    if (batchCalls === 1) return { ...response, status: 400 };
    if (batchCalls === 2) {
      signalForSecond = descriptor.signal;
      markSecondStarted();
      await secondLatch;
    }
    return response;
  };
  let settled = false;
  const operation = runPostDeploySmoke(
    { ...fixture.options, execute: true },
    immediateDependencies(request, { concurrency: 2 })
  );
  operation.then(() => { settled = true; }, () => { settled = true; });
  await secondStarted;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, 'the attempt must drain the second in-flight request');
  assert.equal(signalForSecond.aborted, true, 'the failed worker must cancel its in-flight peer');
  releaseSecond();
  await assert.rejects(operation, /returned HTTP 400/u);
  const callsAtSettlement = transport.calls.length;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(transport.calls.length, callsAtSettlement);
  assert.equal(batchCalls, 2);
});

test('HTTP retry policy is narrow and deterministic 4xx responses are immediate', async t => {
  for (const status of [404, 408, 425, 429, 500]) {
    await t.test(`retry ${status}`, async () => {
      const fixture = makeFixture();
      let first = true;
      const transport = makeTransport(fixture, ({ descriptor, response }) => {
        if (first && descriptor.url.endsWith('/release-manifest.json')) {
          first = false;
          return { ...response, status };
        }
      });
      const report = await runPostDeploySmoke(
        { ...fixture.options, execute: true },
        immediateDependencies(transport.request, { deadlineMs: 100, retryDelayMs: 10 })
      );
      assert.equal(report.attempts, 2);
    });
  }
  for (const status of [400, 409, 422]) {
    await t.test(`do not retry ${status}`, async () => {
      const fixture = makeFixture();
      let calls = 0;
      const transport = makeTransport(fixture, ({ descriptor, response }) => {
        calls += 1;
        return descriptor.url.endsWith('/release-manifest.json') ? { ...response, status } : undefined;
      });
      await assert.rejects(
        runPostDeploySmoke(
          { ...fixture.options, execute: true },
          immediateDependencies(transport.request, { deadlineMs: 100, retryDelayMs: 10 })
        ),
        new RegExp(`returned HTTP ${status}`, 'u')
      );
      assert.equal(calls, 1);
    });
  }
});

test('401 and 403 authorization failures are immediate and never retried', async t => {
  for (const status of [401, 403]) {
    await t.test(String(status), async () => {
      const fixture = makeFixture();
      let calls = 0;
      const request = async descriptor => {
        calls += 1;
        return {
          status,
          url: descriptor.url,
          headers: { 'content-type': 'text/plain', 'content-length': '0' },
          body: Buffer.alloc(0)
        };
      };
      await assert.rejects(
        runPostDeploySmoke(
          { ...fixture.options, execute: true },
          immediateDependencies(request, { deadlineMs: 100, retryDelayMs: 10 })
        ),
        new RegExp(`non-retryable authorization failure HTTP ${status}`, 'u')
      );
      assert.equal(calls, 1);
    });
  }
});

test('5xx and transient DNS failures remain retryable and can converge', async t => {
  await t.test('503', async () => {
    const fixture = makeFixture();
    let first = true;
    const transport = makeTransport(fixture, ({ descriptor, response }) => {
      if (first && descriptor.url.endsWith('/release-manifest.json')) {
        first = false;
        return { ...response, status: 503 };
      }
    });
    const report = await runPostDeploySmoke(
      { ...fixture.options, execute: true },
      immediateDependencies(transport.request, { deadlineMs: 50, retryDelayMs: 10 })
    );
    assert.equal(report.attempts, 2);
  });
  await t.test('503 from a probe', async () => {
    const fixture = makeFixture();
    let first = true;
    const transport = makeTransport(fixture, ({ descriptor, response }) => {
      if (first && descriptor.url.includes('__ai-tree-release-smoke__')) {
        first = false;
        return { ...response, status: 503 };
      }
    });
    const report = await runPostDeploySmoke(
      { ...fixture.options, execute: true },
      immediateDependencies(transport.request, { deadlineMs: 50, retryDelayMs: 10 })
    );
    assert.equal(report.attempts, 2);
  });
  await t.test('DNS', async () => {
    const fixture = makeFixture();
    const transport = makeTransport(fixture);
    let first = true;
    const request = descriptor => {
      if (first) {
        first = false;
        const error = new Error('getaddrinfo ENOTFOUND');
        error.code = 'ENOTFOUND';
        throw error;
      }
      return transport.request(descriptor);
    };
    const report = await runPostDeploySmoke(
      { ...fixture.options, execute: true },
      immediateDependencies(request, { deadlineMs: 50, retryDelayMs: 10 })
    );
    assert.equal(report.attempts, 2);
  });
});

test('TLS certificate and protocol failures are classified as permanent', async () => {
  const certificateCause = new Error('self signed certificate');
  certificateCause.code = 'DEPTH_ZERO_SELF_SIGNED_CERT';
  const fetchError = new Error('fetch failed', { cause: certificateCause });
  assert.deepEqual(classifyNetworkFailure(fetchError), {
    category: 'tls-certificate-or-protocol',
    retryable: false
  });
  for (const code of ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND']) {
    const transient = new Error(code);
    transient.code = code;
    assert.deepEqual(classifyNetworkFailure(transient), { category: 'transient-network', retryable: true });
  }

  const fixture = makeFixture();
  let calls = 0;
  const request = async () => {
    calls += 1;
    throw fetchError;
  };
  await assert.rejects(
    runPostDeploySmoke(
      { ...fixture.options, execute: true },
      immediateDependencies(request, { deadlineMs: 100, retryDelayMs: 10 })
    ),
    /tls-certificate-or-protocol/u
  );
  assert.equal(calls, 1);
});

for (const scenario of [
  {
    name: 'redirect',
    mutate: ({ descriptor, response }) => descriptor.url.endsWith('/ai-research-tech-tree.json')
      ? { ...response, status: 302, headers: { location: 'https://example.test/' } }
      : undefined,
    pattern: /attempted an HTTP redirect/u
  },
  {
    name: 'changed response URL or origin',
    mutate: ({ descriptor, response }) => descriptor.url.endsWith('/ai-research-tech-tree.json')
      ? { ...response, url: 'https://example.test/ai-research-tech-tree.json' }
      : undefined,
    pattern: /changed origin or URL/u
  },
  {
    name: 'machine payload served as HTML',
    mutate: ({ descriptor, response }) => descriptor.url.endsWith('/ai-research-tech-tree.json')
      ? { ...response, headers: { ...response.headers, 'content-type': 'text/html' } }
      : undefined,
    pattern: /machine payload .* was served as HTML/u
  },
  {
    name: 'non-UTF-8 textual charset',
    mutate: ({ descriptor, response }) => descriptor.url.endsWith('/ai-research-tech-tree.json')
      ? { ...response, headers: { ...response.headers, 'content-type': 'application/json; charset=iso-8859-1' } }
      : undefined,
    pattern: /declares non-UTF-8 charset iso-8859-1/u
  },
  {
    name: 'wrong Content-Length',
    mutate: ({ descriptor, response }) => descriptor.url.endsWith('/ai-research-tech-tree.json')
      ? { ...response, headers: { ...response.headers, 'content-length': String(response.body.byteLength + 1) } }
      : undefined,
    pattern: /Content-Length .* does not match received/u
  },
  {
    name: 'compressed transfer',
    mutate: ({ descriptor, response }) => descriptor.url.endsWith('/ai-research-tech-tree.json')
      ? { ...response, headers: { ...response.headers, 'content-encoding': 'gzip' } }
      : undefined,
    pattern: /forbidden content-encoding gzip/u
  },
  {
    name: 'wrong exact bytes',
    mutate: ({ descriptor, response }) => {
      if (!descriptor.url.endsWith('/ai-research-tech-tree.json')) return undefined;
      const body = Buffer.from(response.body);
      body[0] ^= 1;
      return { ...response, body };
    },
    pattern: /has SHA-256 .* expected/u
  },
  {
    name: 'oversize body',
    mutate: ({ descriptor, response }) => descriptor.url.endsWith('/ai-research-tech-tree.json')
      ? { ...response, body: Buffer.concat([response.body, Buffer.from('x')]), headers: { ...response.headers, 'content-length': String(response.body.byteLength + 1) } }
      : undefined,
    pattern: /exceeded its .*byte cap/u
  }
]) {
  test(`execution rejects ${scenario.name}`, async () => {
    const fixture = makeFixture();
    const transport = makeTransport(fixture, scenario.mutate);
    await assert.rejects(
      runPostDeploySmoke({ ...fixture.options, execute: true }, immediateDependencies(transport.request)),
      scenario.pattern
    );
  });
}

test('canonicalization cannot redirect outside the exact fixed production URL', async () => {
  const fixture = makeFixture();
  const transport = makeTransport(fixture, ({ descriptor, response }) => descriptor.url === BASE.slice(0, -1)
    ? { ...response, headers: { ...response.headers, location: 'https://example.test/' } }
    : undefined);
  await assert.rejects(
    runPostDeploySmoke({ ...fixture.options, execute: true }, immediateDependencies(transport.request)),
    /canonicalization escaped the fixed production URL/u
  );
});

test('nonexistent sentinel must remain a 404', async () => {
  const fixture = makeFixture();
  const transport = makeTransport(fixture, ({ descriptor, response }) => descriptor.url.includes('__ai-tree-release-smoke__')
    ? { ...response, status: 200 }
    : undefined);
  await assert.rejects(
    runPostDeploySmoke({ ...fixture.options, execute: true }, immediateDependencies(transport.request)),
    /nonexistent sentinel returned HTTP 200/u
  );
});

test('manifest validation rejects preview, planned, identity drift, incomplete closure, and unsafe paths', async t => {
  const cases = [
    ['unknown top-level key', manifest => { manifest.untrusted = true; }, /top-level keys must be exactly/u],
    ['schema drift', manifest => { manifest.schemaVersion = '1.5.0'; }, /schemaVersion must be exactly 1\.4\.0/u],
    ['stage configuration drift', manifest => { manifest.stageConfigVersion = '1.2.0'; }, /stageConfigVersion must be exactly 1\.1\.0/u],
    ['generator drift', manifest => { manifest.generatorVersion = '1.4.0'; }, /generatorVersion must be exactly 1\.3\.1/u],
    ['release-ref tool drift', manifest => { manifest.toolchain.releaseRef = '1.1.0'; }, /toolchain.releaseRef must be exactly 1\.0\.0/u],
    ['stage-site tool drift', manifest => { manifest.toolchain.stageSite = '1.5.0'; }, /toolchain.stageSite must be exactly 1\.4\.0/u],
    ['release path drift', manifest => { manifest.releaseSpec.path = 'config/releases/other.json'; }, /bind the expected release file path/u],
    ['release SHA drift', manifest => { manifest.releaseSpec.sha256 = 'not-a-digest'; }, /bind the expected release file path/u],
    ['release schema drift', manifest => { manifest.releaseSpec.schemaVersion = '1.1.0'; }, /releaseSpec.schemaVersion must be exactly 1\.0\.0/u],
    ['top version drift', manifest => { manifest.version = '0.1.2'; }, /manifest version must be exactly 0\.1\.1/u],
    ['spec version drift', manifest => { manifest.releaseSpec.version = '0.1.2'; }, /version must match the expected tag/u],
    ['invalid edition identity', manifest => { manifest.edition = 'alpha'; manifest.releaseSpec.edition = 'alpha'; }, /edition date prefix must be an ISO calendar date/u],
    ['edition date and release date drift', manifest => {
      manifest.edition = '2026-08-21-public-beta-2';
      manifest.releaseSpec.edition = '2026-08-21-public-beta-2';
    }, /edition date prefix must match releaseSpec.releaseDate/u],
    ['edition drift', manifest => { manifest.releaseSpec.edition = 'other'; }, /edition must match/u],
    ['invalid release date', manifest => { manifest.releaseSpec.releaseDate = '2026-02-30'; manifest.promotion.releaseDate = '2026-02-30'; }, /valid ISO calendar date/u],
    ['release state drift', manifest => { manifest.releaseSpec.releaseState = 'Stable'; }, /releaseState must match/u],
    ['coordinated release state drift', manifest => { manifest.releaseState = 'Stable'; manifest.releaseSpec.releaseState = 'Stable'; }, /releaseState must be exactly Public beta/u],
    ['default branch drift', manifest => { manifest.releaseSpec.defaultBranch = 'develop'; }, /defaultBranch must be exactly main/u],
    ['environment drift', manifest => { manifest.releaseSpec.productionEnvironment = 'other'; }, /productionEnvironment must be exactly github-pages/u],
    ['prerelease drift', manifest => { manifest.releaseSpec.prerelease = false; }, /prerelease must be exactly true/u],
    ['asset stem drift', manifest => { manifest.releaseSpec.assetStem = 'other'; }, /assetStem must be exactly/u],
    ['data digest drift', manifest => { manifest.dataDigest = 'invalid'; }, /dataDigest must be a lowercase SHA-256/u],
    ['preview', manifest => { manifest.publicationMode = 'preview'; }, /publicationMode must be exactly release/u],
    ['planned', manifest => { manifest.releaseSpec.status = 'planned'; }, /releaseSpec.status must be exactly ready/u],
    ['tag drift', manifest => { manifest.tag = 'v0.1.2'; }, /manifest tag must be exactly v0.1.1/u],
    ['commit drift', manifest => { manifest.commit = '9'.repeat(40); }, /manifest commit must be exactly/u],
    ['unclean', manifest => { manifest.sourceState.clean = false; }, /sourceState.clean must be exactly true/u],
    ['input gap', manifest => { manifest.sourceState.matchedInputCount -= 1; }, /must close the complete inputCount inventory/u],
    ['promotion gap', manifest => { manifest.promotion.reachableFromProtectedMain = false; }, /reachableFromProtectedMain must be exactly true/u],
    ['base URL drift', manifest => { manifest.releaseSpec.productionBaseUrl = 'https://example.test/'; }, /productionBaseUrl must be exactly/u],
    ['traversal', manifest => { manifest.files[0].path = '../escape'; }, /canonical portable relative URL path/u],
    ['case collision', manifest => {
      const source = manifest.files.find(file => file.path === 'robots.txt');
      manifest.files.push({ ...source, path: 'ROBOTS.TXT' });
      manifest.fileCount += 1;
      manifest.totalBytes += source.bytes;
      manifest.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    }, /case-colliding paths/u]
  ];
  for (const [name, mutateManifest, pattern] of cases) {
    await t.test(name, () => {
      const fixture = makeFixture({ mutateManifest });
      assert.throws(() => planPostDeploySmoke(fixture.options), pattern);
    });
  }
});

test('manifest inventory budgets fail closed before any network request', async t => {
  await t.test('more than 64 files', () => {
    const fixture = makeFixture({ mutateManifest: manifest => {
      for (let index = 0; index < 53; index += 1) {
        manifest.files.push({
          path: `extra/record-${String(index).padStart(2, '0')}.json`,
          mediaType: 'application/json; charset=utf-8',
          bytes: 1,
          sha256: digest(Buffer.from('x'))
        });
      }
      manifest.files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
      manifest.fileCount = manifest.files.length;
      manifest.totalBytes += 53;
    } });
    assert.throws(() => planPostDeploySmoke(fixture.options), /safe integer from 0 through 64/u);
  });
  await t.test('a payload above 16 MiB', () => {
    const fixture = makeFixture({ mutateManifest: manifest => {
      const file = manifest.files.find(item => item.path === 'ai-research-tech-tree.json');
      manifest.totalBytes += (16 * 1024 * 1024) + 1 - file.bytes;
      file.bytes = (16 * 1024 * 1024) + 1;
    } });
    assert.throws(() => planPostDeploySmoke(fixture.options), /safe integer from 0 through 16777216/u);
  });
  await t.test('aggregate payload inventory above 64 MiB', () => {
    const fixture = makeFixture({ mutateManifest: manifest => { manifest.totalBytes = (64 * 1024 * 1024) + 1; } });
    assert.throws(() => planPostDeploySmoke(fixture.options), /safe integer from 0 through 67108864/u);
  });
  await t.test('manifest path above 512 bytes', () => {
    const fixture = makeFixture({ mutateManifest: manifest => {
      const file = manifest.files.find(item => item.path === 'robots.txt');
      file.path = `${'a'.repeat(509)}.txt`;
      manifest.files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    } });
    assert.throws(() => planPostDeploySmoke(fixture.options), /exceeds the 512-byte path budget/u);
  });
  await t.test('actual successful transfer plan above 32 MiB', () => {
    const fixture = makeFixture({ mutateManifest: manifest => {
      const file = manifest.files.find(item => item.path === 'index.html');
      manifest.totalBytes += (16 * 1024 * 1024) - file.bytes;
      file.bytes = 16 * 1024 * 1024;
    } });
    assert.throws(() => planPostDeploySmoke(fixture.options), /planned successful transfer .* exceeds the 33554432-byte budget/u);
  });
});

test('local manifest bytes require an explicit matching SHA-256', () => {
  const fixture = makeFixture();
  assert.throws(
    () => planPostDeploySmoke({ ...fixture.options, expectedManifestSha256: undefined }),
    /must be an explicitly supplied lowercase SHA-256/u
  );
  assert.throws(
    () => planPostDeploySmoke({ ...fixture.options, expectedManifestSha256: '0'.repeat(64) }),
    /does not match explicitly supplied/u
  );
  const oversized = Buffer.concat([
    fixture.options.expectedManifestBytes,
    Buffer.alloc((4 * 1024 * 1024) + 1 - fixture.options.expectedManifestBytes.byteLength, 0x20)
  ]);
  assert.throws(
    () => planPostDeploySmoke({ ...fixture.options, expectedManifestBytes: oversized, expectedManifestSha256: digest(oversized) }),
    /exceeds the 4194304-byte release-manifest cap/u
  );
});

test('real loopback HTTP transport can exercise the exact GET plan without contacting production', async t => {
  const fixture = makeFixture();
  const server = http.createServer((request, response) => {
    const incoming = new URL(request.url, 'http://127.0.0.1/');
    if (incoming.pathname.endsWith('/release-manifest.json')) {
      response.writeHead(200, { 'content-type': 'application/json', 'content-length': fixture.options.expectedManifestBytes.byteLength });
      response.end(fixture.options.expectedManifestBytes);
      return;
    }
    if (incoming.pathname.endsWith('__ai-tree-release-smoke__-must-not-exist-7f4c48f8')) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('missing');
      return;
    }
    if (incoming.searchParams.get('slashless') === '1') {
      response.writeHead(301, { location: BASE, 'content-length': 0 });
      response.end();
      return;
    }
    let relative = incoming.pathname.slice(new URL(BASE).pathname.length);
    if (relative === '') relative = 'index.html';
    const bytes = fixture.payloads.get(relative);
    response.writeHead(200, { 'content-type': contentTypeFor(relative), 'content-length': bytes.byteLength });
    response.end(bytes);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const address = server.address();
  const request = async descriptor => {
    const source = new URL(descriptor.url);
    const isSlashless = descriptor.url === BASE.slice(0, -1);
    const local = new URL(`http://127.0.0.1:${address.port}${source.pathname}${isSlashless ? '?slashless=1' : ''}`);
    const response = await fetch(local, { method: 'GET', redirect: 'manual', headers: descriptor.headers });
    return {
      status: response.status,
      url: descriptor.url,
      headers: response.headers,
      body: Buffer.from(await response.arrayBuffer())
    };
  };
  const report = await runPostDeploySmoke(
    { ...fixture.options, execute: true },
    immediateDependencies(request, { concurrency: 4 })
  );
  assert.equal(report.status, 'verified');
});

test('CLI defaults to a network-free plan and rejects arbitrary base URL arguments', async () => {
  const fixture = makeFixture();
  const root = await mkdtemp(path.join(os.tmpdir(), 'post-deploy-smoke-'));
  temporaryRoots.add(root);
  const manifestPath = path.join(root, 'release-manifest.json');
  await writeFile(manifestPath, fixture.options.expectedManifestBytes);
  const script = fileURLToPath(new URL('../scripts/post-deploy-smoke.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [
    script,
    '--manifest', manifestPath,
    '--manifest-sha256', fixture.options.expectedManifestSha256,
    '--expected-tag', TAG,
    '--expected-commit', COMMIT
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, 'plan');
  assert.equal(report.baseUrl, BASE);

  const rejected = spawnSync(process.execPath, [script, '--base-url', 'http://127.0.0.1/'], { encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /unknown argument --base-url/u);
});
