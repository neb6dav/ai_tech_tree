import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { stageSite } from './stage-site.mjs';

const temporaryRoots = new Set();

async function makeRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ai-tree-stage-site-test-'));
  temporaryRoots.add(root);
  return root;
}

async function write(root, relativePath, contents) {
  const absolute = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, contents);
}

function baseConfig(overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    outputDirectory: '_site',
    releaseManifest: 'release-manifest.json',
    metadata: {
      packageFile: 'package.json',
      packageLockFile: 'package-lock.json',
      datasetFile: 'data.json'
    },
    artifacts: [
      { kind: 'file', source: 'index.html', target: 'index.html', mediaType: 'text/html; charset=utf-8' },
      { kind: 'directory', source: 'public/data', target: 'public/data' }
    ],
    generatedFiles: [
      { target: '.nojekyll', contents: '', mediaType: 'application/octet-stream' }
    ],
    ...overrides
  };
}

const environment = {
  AI_TREE_COMMIT_SHA: 'a'.repeat(40),
  AI_TREE_RELEASE_TAG: 'v1.2.3',
  npm_config_user_agent: 'npm/11.11.0 node/v24.14.1 test'
};

async function writeBaseFixture(root, config = baseConfig()) {
  await write(root, 'package.json', '{"version":"1.2.3"}\n');
  await write(root, 'package-lock.json', '{"lockfileVersion":3}\n');
  await write(root, 'data.json', JSON.stringify({
    generatorVersion: '4.5.6',
    dataset: { edition: '2026-test-edition', dataDigest: 'b'.repeat(64) }
  }));
  await write(root, 'index.html', '<!doctype html><title>Fixture</title>\n');
  await write(root, 'public/data/z.json', '{"z":1}\n');
  await write(root, 'public/data/a.json', '{"a":1}\n');
  await write(root, 'config/pages-stage.v1.json', `${JSON.stringify(config, null, 2)}\n`);
}

test.afterEach(async () => {
  await Promise.all([...temporaryRoots].map(root => rm(root, { recursive: true, force: true })));
  temporaryRoots.clear();
});

test('stages a deterministic tree and sorted release manifest', async () => {
  const root = await makeRoot();
  await writeBaseFixture(root);

  const first = await stageSite({ repositoryRoot: root, environment });
  const firstText = await readFile(path.join(root, '_site', 'release-manifest.json'), 'utf8');
  await write(root, '_site/stale.txt', 'must disappear');
  const second = await stageSite({ repositoryRoot: root, environment });
  const secondText = await readFile(path.join(root, '_site', 'release-manifest.json'), 'utf8');

  assert.equal(first.status, 'STAGED');
  assert.equal(second.status, 'STAGED');
  assert.equal(secondText, firstText);
  const manifest = JSON.parse(secondText);
  assert.deepEqual(manifest.files.map(file => file.path), [
    '.nojekyll',
    'index.html',
    'public/data/a.json',
    'public/data/z.json'
  ]);
  assert.equal(manifest.edition, '2026-test-edition');
  assert.equal(manifest.version, '1.2.3');
  assert.equal(manifest.commit, 'a'.repeat(40));
  assert.equal(manifest.tag, 'v1.2.3');
  assert.equal(manifest.generatorVersion, '4.5.6');
  assert.equal(manifest.dataDigest, 'b'.repeat(64));
  assert.deepEqual(manifest.stageConfig, {
    path: 'config/pages-stage.v1.json',
    sha256: createHash('sha256')
      .update(await readFile(path.join(root, 'config', 'pages-stage.v1.json')))
      .digest('hex')
  });
  assert.deepEqual(manifest.toolchain, {
    node: process.version,
    npm: '11.11.0',
    packageLockVersion: 3,
    stageSite: '1.0.0'
  });
  assert.equal(manifest.manifest.selfHashExcluded, true);
  assert.equal(manifest.manifest.filesCoverage, 'all-payload-files');
  assert.deepEqual(manifest.manifest.filesExcluded, ['release-manifest.json']);
  assert.equal(manifest.files.some(file => file.path === 'release-manifest.json'), false);
  const indexBytes = Buffer.from('<!doctype html><title>Fixture</title>\n');
  assert.equal(
    manifest.files.find(file => file.path === 'index.html').sha256,
    createHash('sha256').update(indexBytes).digest('hex')
  );
  await assert.rejects(readFile(path.join(root, '_site', 'stale.txt')), error => error.code === 'ENOENT');
});

test('check-only validates and hashes without replacing an existing output tree', async () => {
  const root = await makeRoot();
  await writeBaseFixture(root);
  await write(root, '_site/keep.txt', 'preserved');

  const result = await stageSite({ repositoryRoot: root, environment, checkOnly: true });

  assert.equal(result.status, 'VALID');
  assert.equal(await readFile(path.join(root, '_site', 'keep.txt'), 'utf8'), 'preserved');
  await assert.rejects(readFile(path.join(root, '_site', 'release-manifest.json')), error => error.code === 'ENOENT');
});

test('rejects traversal and missing sources before touching _site', async () => {
  const root = await makeRoot();
  const config = baseConfig({
    artifacts: [
      { kind: 'file', source: '../outside.html', target: 'index.html' }
    ]
  });
  await writeBaseFixture(root, config);
  await write(root, '_site/keep.txt', 'preserved');

  await assert.rejects(
    stageSite({ repositoryRoot: root, environment }),
    /not a canonical relative path|repository-relative/u
  );
  assert.equal(await readFile(path.join(root, '_site', 'keep.txt'), 'utf8'), 'preserved');

  config.artifacts[0].source = 'missing.html';
  await write(root, 'config/pages-stage.v1.json', `${JSON.stringify(config, null, 2)}\n`);
  await assert.rejects(stageSite({ repositoryRoot: root, environment }), /is missing/u);
  assert.equal(await readFile(path.join(root, '_site', 'keep.txt'), 'utf8'), 'preserved');
});

test('rejects case-insensitive target collisions', async () => {
  const root = await makeRoot();
  const config = baseConfig({
    artifacts: [
      { kind: 'file', source: 'index.html', target: 'Public/Index.html' },
      { kind: 'file', source: 'other.html', target: 'public/index.HTML' }
    ]
  });
  await writeBaseFixture(root, config);
  await write(root, 'other.html', '<!doctype html>Other\n');

  await assert.rejects(stageSite({ repositoryRoot: root, environment }), /target collision/u);
});

test('refuses any configured output other than repository-local _site', async () => {
  const root = await makeRoot();
  await writeBaseFixture(root, baseConfig({ outputDirectory: 'dist' }));

  await assert.rejects(stageSite({ repositoryRoot: root, environment }), /must be exactly _site/u);
});

test('rejects abbreviated commit IDs', async () => {
  const root = await makeRoot();
  await writeBaseFixture(root);

  await assert.rejects(
    stageSite({
      repositoryRoot: root,
      environment: { ...environment, AI_TREE_COMMIT_SHA: 'abcdef0' },
      checkOnly: true
    }),
    /full 40- or 64-character hexadecimal git object ID/u
  );
});
