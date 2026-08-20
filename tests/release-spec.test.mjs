import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadReleaseSpec, validateReleaseSpec } from '../scripts/release-spec.mjs';

const planned = Object.freeze({
  schemaVersion: '1.0.0',
  status: 'planned',
  tag: 'v0.1.1',
  version: '0.1.1',
  edition: '2026-08-20-public-beta-2',
  releaseDate: null,
  releaseState: 'Public beta',
  defaultBranch: 'main',
  protectedMainRef: 'refs/remotes/origin/main',
  productionEnvironment: 'github-pages',
  productionBaseUrl: 'https://neb6dav.github.io/ai_tech_tree/',
  prerelease: true,
  assetStem: 'ai-research-tech-tree-v0.1.1'
});

test('validates planned and ready release specifications', () => {
  assert.deepEqual(validateReleaseSpec(planned), planned);
  const ready = { ...planned, status: 'ready', releaseDate: '2026-08-20' };
  assert.deepEqual(validateReleaseSpec(ready, { requireReady: true }), ready);
  assert.throws(
    () => validateReleaseSpec(planned, { requireReady: true }),
    /planned, not ready/u
  );
});

test('fails closed on identity, date, URL, branch, and schema drift', () => {
  const mutations = [
    ['unknown key', { extra: true }, /unsupported keys/u],
    ['schema', { schemaVersion: '2.0.0' }, /schemaVersion/u],
    ['tag', { tag: 'v0.1.2' }, /tag must be exactly/u],
    ['version', { version: '01.1.0', tag: 'v01.1.0' }, /semantic version/u],
    ['edition date', { edition: '2026-02-30-public-beta' }, /edition date prefix/u],
    ['planned date', { releaseDate: '2026-08-20' }, /planned releases/u],
    ['invalid date', { status: 'ready', releaseDate: '2026-02-30' }, /valid calendar date/u],
    ['developmental target state', { releaseState: 'Development edition' }, /cannot be developmental/u],
    ['wrong target state', { releaseState: 'Stable' }, /releaseState must be exactly Public beta/u],
    ['wrong default branch', { defaultBranch: 'candidate', protectedMainRef: 'refs/remotes/origin/candidate' }, /defaultBranch must be exactly main/u],
    ['wrong production environment', { productionEnvironment: 'unreviewed' }, /productionEnvironment must be exactly github-pages/u],
    ['wrong production URL', { productionBaseUrl: 'https://example.invalid/wrong/' }, /productionBaseUrl must be exactly/u],
    ['stable release channel', { prerelease: false }, /prerelease must be exactly true/u],
    ['protected ref', { protectedMainRef: 'refs/heads/main' }, /origin\/<defaultBranch>/u],
    ['base URL protocol', { productionBaseUrl: 'http://neb6dav.github.io/ai_tech_tree/' }, /credential-free HTTPS/u],
    ['base URL query', { productionBaseUrl: 'https://neb6dav.github.io/ai_tech_tree/?x=1' }, /credential-free HTTPS/u],
    ['asset stem', { assetStem: '../release' }, /portable filename/u]
  ];
  for (const [label, mutation, expected] of mutations) {
    assert.throws(() => validateReleaseSpec({ ...planned, ...mutation }), expected, label);
  }
});

test('loads only a repository-relative JSON specification', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ai-tree-release-spec-'));
  try {
    const relativePath = 'config/releases/v0.1.1.json';
    const absolutePath = path.join(root, 'config', 'releases', 'v0.1.1.json');
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${JSON.stringify(planned, null, 2)}\n`);
    const loaded = await loadReleaseSpec(root, relativePath);
    assert.equal(loaded.path, relativePath);
    assert.deepEqual(loaded.spec, planned);
    assert.match(loaded.bytes.toString('utf8'), /"status": "planned"/u);
    await writeFile(absolutePath, '{"schemaVersion":"1.0.0","status":"planned","status":"ready"}\n');
    await assert.rejects(loadReleaseSpec(root, relativePath), /duplicate key #\/status/u);
    await assert.rejects(loadReleaseSpec(root, '../outside.json'), /canonical repository-relative/u);
    await assert.rejects(loadReleaseSpec(root, 'release.json:payload'), /non-portable path segment/u);
    await assert.rejects(loadReleaseSpec(root, 'CON/release.json'), /Windows-reserved device/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
