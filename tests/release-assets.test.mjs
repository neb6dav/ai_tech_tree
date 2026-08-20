import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import {
  buildCandidateReleaseAssets,
  buildStableReleaseAssets,
  extractCandidateChangeBody,
  extractUnreleasedBody,
  releaseAssetsConstants,
  validateCandidateArchiveInventory
} from '../scripts/release-assets.mjs';

const temporaryRoots = new Set();
const EXECUTED_RELEASE_TOOL_PATHS = Object.freeze([
  'scripts/release-assets.mjs',
  'scripts/release-ref.mjs',
  'scripts/release-spec.mjs',
  'scripts/stage-site.mjs',
  'scripts/strict-json.mjs'
]);

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function write(root, relativePath, contents) {
  const absolute = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, contents);
}

function git(root, argumentsList, environment = {}) {
  return execFileSync('git', argumentsList, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
    windowsHide: true
  }).trim();
}

function releaseSpec({
  edition = '2026-08-20-test-edition',
  status = 'planned',
  releaseDate = status === 'ready' ? '2026-08-23' : null
} = {}) {
  return {
    schemaVersion: '1.0.0',
    status,
    tag: 'v1.2.3',
    version: '1.2.3',
    edition,
    releaseDate,
    releaseState: 'Public beta',
    defaultBranch: 'main',
    protectedMainRef: 'refs/remotes/origin/main',
    productionEnvironment: 'github-pages',
    productionBaseUrl: 'https://neb6dav.github.io/ai_tech_tree/',
    prerelease: true,
    assetStem: 'fixture-v1.2.3'
  };
}

function stageConfig({ indexTarget = 'index.html' } = {}) {
  return {
    schemaVersion: '1.1.0',
    outputDirectory: '_site',
    releaseManifest: 'release-manifest.json',
    metadata: {
      packageFile: 'package.json',
      packageLockFile: 'package-lock.json',
      datasetFile: 'data.json',
      citationFile: 'CITATION.cff',
      changelogFile: 'CHANGELOG.md',
      releaseFile: 'config/releases/v1.2.3.json'
    },
    artifacts: [
      { kind: 'file', source: 'index.html', target: indexTarget, mediaType: 'text/html; charset=utf-8' },
      { kind: 'directory', source: 'public/data', target: 'data' }
    ],
    generatedFiles: [
      { target: '.nojekyll', contents: '', mediaType: 'application/octet-stream' }
    ]
  };
}

const normalChangelog = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '**Target: v1.2.3 development edition.** This is a candidate.',
  '',
  '### Added',
  '',
  '- Deterministic candidate assets.',
  '- Exact provenance closure.',
  '',
  '## [1.2.2] - 2026-08-01',
  '',
  '- Prior release.',
  ''
].join('\n');

const readyChangelog = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '- Post-freeze follow-up that is not part of v1.2.3.',
  '',
  '## [1.2.3] - 2026-08-23',
  '',
  '### Added',
  '',
  '- Frozen v1.2.3 release note.',
  '- Edition and publication dates are independent.',
  '',
  '## [1.2.2] - 2026-08-01',
  '',
  '- Prior release.',
  ''
].join('\n');

async function makeFixture({
  changelog,
  dataDigest = 'b'.repeat(64),
  edition = '2026-08-20-test-edition',
  indexTarget = 'index.html',
  largePayloadBytes = 0,
  largePayloadCount = 0,
  status = 'planned',
  releaseDate = status === 'ready' ? '2026-08-23' : null
} = {}) {
  const selectedChangelog = changelog ?? (status === 'ready' ? readyChangelog : normalChangelog);
  // GitHub-hosted Windows can expose os.tmpdir() through an 8.3 alias. Keep
  // fixture-created paths in the canonical spelling expected by the output
  // parent guard; production callers still have to supply a canonical path.
  const temporaryParent = await realpath(os.tmpdir());
  const base = await mkdtemp(path.join(temporaryParent, 'ai-tree-release-assets-test-'));
  temporaryRoots.add(base);
  const root = path.join(base, 'repository');
  await mkdir(root);
  await write(root, '.gitignore', '_site/\n.stage-site-*/\n');
  await write(root, 'package.json', '{"name":"fixture","version":"1.2.3"}\n');
  await write(root, 'package-lock.json', `${JSON.stringify({
    name: 'fixture',
    version: '1.2.3',
    lockfileVersion: 3,
    packages: { '': { name: 'fixture', version: '1.2.3' } }
  }, null, 2)}\n`);
  await write(root, 'data.json', `${JSON.stringify({
    generatorVersion: '4.5.6',
    dataset: {
      edition,
      releaseState: status === 'ready' ? 'Public beta' : 'Development edition',
      dataDigest
    }
  }, null, 2)}\n`);
  const citationLines = [
    'cff-version: 1.2.0',
    `message: ${status === 'ready' ? 'cite the annotated release manifest' : 'untagged development edition'}`,
    'title: AI Research Tech Tree',
    'type: dataset',
    'authors:',
    '  - name: Fixture Author',
    `version: ${status === 'ready' ? '1.2.3' : '1.2.3-dev'}`,
    'repository-code: https://github.com/neb6dav/ai_tech_tree',
    'url: https://neb6dav.github.io/ai_tech_tree/',
  ];
  if (status === 'ready') citationLines.push(`date-released: ${releaseDate}`);
  citationLines.push('');
  await write(root, 'CITATION.cff', citationLines.join('\n'));
  await write(root, 'CHANGELOG.md', selectedChangelog);
  await write(root, 'config/releases/v1.2.3.json', `${JSON.stringify(releaseSpec({ edition, status, releaseDate }), null, 2)}\n`);
  await write(root, 'config/pages-stage.v1.json', `${JSON.stringify(stageConfig({ indexTarget }), null, 2)}\n`);
  await write(root, 'index.html', '<!doctype html><title>Fixture</title>\n');
  await write(root, 'public/data/z.json', '{"z":1}\n');
  await write(root, 'public/data/a.json', '{"a":1}\n');
  for (const toolPath of EXECUTED_RELEASE_TOOL_PATHS) {
    await write(root, toolPath, await readFile(path.resolve(toolPath)));
  }
  for (let index = 0; index < largePayloadCount; index += 1) {
    await write(root, `public/data/large-${index}.bin`, Buffer.alloc(largePayloadBytes, index + 1));
  }
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.name', 'release-assets-test']);
  git(root, ['config', 'user.email', 'release-assets@example.invalid']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['branch', '-M', 'main']);
  git(root, ['add', '--', '.']);
  git(root, ['commit', '--quiet', '-m', 'candidate fixture'], {
    GIT_AUTHOR_DATE: '2026-08-20T12:00:00+00:00',
    GIT_COMMITTER_DATE: '2026-08-20T12:00:00+00:00'
  });
  const commit = git(root, ['rev-parse', 'HEAD']);
  return { base, root, commit };
}

function candidateEnvironment(overrides = {}) {
  return {
    npm_config_user_agent: 'npm/11.11.0 node/v24.14.1 test',
    ...overrides
  };
}

function stableBuildOptions(fixture, overrides = {}) {
  return {
    repositoryRoot: fixture.root,
    commit: fixture.commit,
    tag: 'v1.2.3',
    releaseSpecPath: 'config/releases/v1.2.3.json',
    protectedMainRef: 'refs/remotes/origin/main',
    environment: candidateEnvironment(),
    ...overrides
  };
}

function createStableRefs(fixture, {
  tagTarget = fixture.commit,
  protectedMainCommit = fixture.commit,
  taggedAt = '2026-08-23T15:04:05+00:00',
  lightweight = false
} = {}) {
  git(fixture.root, ['update-ref', 'refs/remotes/origin/main', protectedMainCommit]);
  if (lightweight) {
    git(fixture.root, ['tag', 'v1.2.3', tagTarget]);
  } else {
    git(fixture.root, ['tag', '-a', 'v1.2.3', '-m', 'fixture stable release', tagTarget], {
      GIT_COMMITTER_DATE: taggedAt
    });
  }
  return git(fixture.root, ['rev-parse', 'refs/tags/v1.2.3']);
}

function addEmptyCommit(fixture) {
  git(fixture.root, ['commit', '--quiet', '--allow-empty', '-m', 'stable target'], {
    GIT_AUTHOR_DATE: '2026-08-22T12:00:00+00:00',
    GIT_COMMITTER_DATE: '2026-08-22T12:00:00+00:00'
  });
  fixture.commit = git(fixture.root, ['rev-parse', 'HEAD']);
  return fixture.commit;
}

function readNullTerminated(buffer, start, length) {
  const field = buffer.subarray(start, start + length);
  const nul = field.indexOf(0);
  return field.subarray(0, nul < 0 ? field.length : nul).toString('ascii');
}

function readOctal(buffer, start, length) {
  const value = buffer.subarray(start, start + length).toString('ascii').replace(/[\0 ]+$/gu, '');
  return value === '' ? 0 : Number.parseInt(value, 8);
}

function parseUstar(bytes) {
  const entries = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    const header = bytes.subarray(offset, offset + 512);
    assert.equal(header.byteLength, 512);
    if (header.every(byte => byte === 0)) {
      const second = bytes.subarray(offset + 512, offset + 1024);
      assert.equal(second.byteLength, 512);
      assert.ok(second.every(byte => byte === 0));
      assert.equal(offset + 1024, bytes.byteLength, 'archive has exactly two terminal zero blocks');
      return entries;
    }
    const expectedChecksum = readOctal(header, 148, 8);
    const checksumHeader = Buffer.from(header);
    checksumHeader.fill(0x20, 148, 156);
    const actualChecksum = checksumHeader.reduce((sum, byte) => sum + byte, 0);
    assert.equal(actualChecksum, expectedChecksum);
    assert.equal(readNullTerminated(header, 257, 6), 'ustar');
    assert.equal(header.subarray(263, 265).toString('ascii'), '00');
    assert.equal(header[156], 0x30);
    assert.equal(readOctal(header, 100, 8), 0o644);
    assert.equal(readOctal(header, 108, 8), 0);
    assert.equal(readOctal(header, 116, 8), 0);
    assert.equal(readOctal(header, 136, 12), 0);
    assert.equal(readNullTerminated(header, 157, 100), '');
    assert.equal(readNullTerminated(header, 265, 32), '');
    assert.equal(readNullTerminated(header, 297, 32), '');
    const name = readNullTerminated(header, 0, 100);
    const prefix = readNullTerminated(header, 345, 155);
    const archivePath = prefix === '' ? name : `${prefix}/${name}`;
    const size = readOctal(header, 124, 12);
    const dataStart = offset + 512;
    const data = Buffer.from(bytes.subarray(dataStart, dataStart + size));
    assert.equal(data.byteLength, size);
    entries.push({ path: archivePath, data, prefix, name });
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  assert.fail('archive is missing its two terminal zero blocks');
}

async function readOutputFiles(directory) {
  const names = (await readdir(directory)).sort();
  return new Map(await Promise.all(names.map(async name => [name, await readFile(path.join(directory, name))])));
}

test.afterEach(async () => {
  await Promise.all([...temporaryRoots].map(root => rm(root, { recursive: true, force: true })));
  temporaryRoots.clear();
});

test('builds byte-identical deterministic candidate assets with exact USTAR and checksum closure', async () => {
  const fixture = await makeFixture();
  const firstDirectory = path.join(fixture.base, 'candidate-one');
  const secondDirectory = path.join(fixture.base, 'candidate-two');
  const first = await buildCandidateReleaseAssets({
    repositoryRoot: fixture.root,
    commit: fixture.commit,
    outputDirectory: firstDirectory,
    environment: candidateEnvironment()
  });
  const second = await buildCandidateReleaseAssets({
    repositoryRoot: fixture.root,
    commit: fixture.commit,
    outputDirectory: secondDirectory,
    environment: candidateEnvironment()
  });

  assert.equal(first.status, 'BUILT');
  assert.equal(first.candidate, true);
  assert.equal(first.externalOutputCreated, true);
  assert.equal(first.stagedSiteRefreshed, true);
  assert.match(first.candidateStem, /-candidate-[0-9a-f]{40}$/u);
  assert.equal(first.publicationMode, 'preview');
  assert.equal(first.releaseSpecStatus, 'planned');
  assert.equal(first.commit, fixture.commit);
  assert.deepEqual(first.files, second.files);
  const firstFiles = await readOutputFiles(firstDirectory);
  const secondFiles = await readOutputFiles(secondDirectory);
  assert.deepEqual([...firstFiles.keys()], [...secondFiles.keys()]);
  for (const [name, bytes] of firstFiles) assert.ok(bytes.equals(secondFiles.get(name)), name);

  const base = `fixture-v1.2.3-candidate-${fixture.commit}`;
  assert.deepEqual([...firstFiles.keys()], [
    `${base}.SHA256SUMS`,
    `${base}.notes.md`,
    `${base}.release-manifest.json`,
    `${base}.tar`
  ]);
  assert.ok([...firstFiles.keys()].every(name => name.includes('-candidate-')));
  const archiveEntries = parseUstar(firstFiles.get(`${base}.tar`));
  const stageRoot = path.join(fixture.root, '_site');
  const stagedPaths = [];
  async function walk(directory, relative = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), child);
      else stagedPaths.push(child);
    }
  }
  await walk(stageRoot);
  stagedPaths.sort();
  assert.deepEqual(
    archiveEntries.map(entry => entry.path),
    stagedPaths.map(relative => `fixture-v1.2.3-candidate/${relative}`)
  );
  for (const entry of archiveEntries) {
    const relative = entry.path.slice('fixture-v1.2.3-candidate/'.length);
    assert.ok(entry.data.equals(await readFile(path.join(stageRoot, ...relative.split('/')))), relative);
  }
  const archivedManifest = archiveEntries.find(entry => entry.path.endsWith('/release-manifest.json')).data;
  assert.ok(archivedManifest.equals(firstFiles.get(`${base}.release-manifest.json`)));

  const checksums = firstFiles.get(`${base}.SHA256SUMS`).toString('utf8').trimEnd().split('\n');
  assert.deepEqual(checksums.map(line => line.slice(66)), [
    `${base}.notes.md`,
    `${base}.release-manifest.json`,
    `${base}.tar`
  ]);
  for (const line of checksums) {
    const match = /^([0-9a-f]{64})  (.+)$/u.exec(line);
    assert.ok(match);
    assert.equal(match[1], hash(firstFiles.get(match[2])));
  }
  const notes = firstFiles.get(`${base}.notes.md`).toString('utf8');
  assert.match(
    notes,
    /Candidate only\. This command does not create or attest a tag, GitHub Release, or deployment\./u
  );
  assert.ok(notes.includes(`Commit: \`${fixture.commit}\``));
  assert.match(notes, /Data digest: `b{64}`/u);
  assert.match(notes, /- Deterministic candidate assets\./u);
  assert.doesNotMatch(notes, /Prior release/u);
});

test('ready previews remain candidate-only and source notes from the frozen version section', async () => {
  const fixture = await makeFixture({ status: 'ready' });
  const outputDirectory = path.join(fixture.base, 'ready-candidate');
  const result = await buildCandidateReleaseAssets({
    repositoryRoot: fixture.root,
    commit: fixture.commit,
    outputDirectory,
    environment: candidateEnvironment()
  });
  assert.equal(result.releaseSpecStatus, 'ready');
  assert.equal(result.publicationMode, 'preview');
  const output = await readOutputFiles(outputDirectory);
  assert.equal(output.size, 4);
  assert.ok([...output.keys()].every(name => name.includes('-candidate-')));
  const manifest = JSON.parse(
    [...output.entries()].find(([name]) => name.endsWith('.release-manifest.json'))[1].toString('utf8')
  );
  assert.equal(manifest.publicationMode, 'preview');
  assert.equal(manifest.tag, null);
  assert.equal(manifest.promotion, null);
  assert.equal(manifest.releaseSpec.status, 'ready');
  assert.equal(manifest.releaseSpec.releaseDate, '2026-08-23');
  assert.equal(manifest.edition, '2026-08-20-test-edition');
  const notes = [...output.entries()].find(([name]) => name.endsWith('.notes.md'))[1].toString('utf8');
  assert.match(notes, /## Candidate frozen v1\.2\.3 changes/u);
  assert.match(notes, /Frozen v1\.2\.3 release note/u);
  assert.match(notes, /Edition and publication dates are independent/u);
  assert.doesNotMatch(notes, /Post-freeze follow-up/u);
  assert.doesNotMatch(notes, /Prior release/u);
});

test('builds byte-identical deterministic stable assets with exact local release proof and closure', async () => {
  const fixture = await makeFixture({ status: 'ready' });
  const tagObject = createStableRefs(fixture);
  const firstDirectory = path.join(fixture.base, 'stable-one');
  const secondDirectory = path.join(fixture.base, 'stable-two');
  const first = await buildStableReleaseAssets(stableBuildOptions(fixture, {
    outputDirectory: firstDirectory
  }));
  const second = await buildStableReleaseAssets(stableBuildOptions(fixture, {
    outputDirectory: secondDirectory
  }));

  assert.equal(first.status, 'BUILT');
  assert.equal(first.candidate, false);
  assert.equal(first.stable, true);
  assert.equal(first.stableStem, 'fixture-v1.2.3');
  assert.equal(first.externalOutputCreated, true);
  assert.equal(first.publicationMode, 'release');
  assert.equal(first.releaseSpecStatus, 'ready');
  assert.equal(first.releaseDate, '2026-08-23');
  assert.equal(first.tag, 'v1.2.3');
  assert.equal(first.tagObject, tagObject);
  assert.equal(first.protectedMainCommit, fixture.commit);
  assert.equal(first.prerelease, true);
  assert.deepEqual(first.files, second.files);

  const firstFiles = await readOutputFiles(firstDirectory);
  const secondFiles = await readOutputFiles(secondDirectory);
  assert.deepEqual([...firstFiles.keys()], [
    'fixture-v1.2.3.SHA256SUMS',
    'fixture-v1.2.3.notes.md',
    'fixture-v1.2.3.release-manifest.json',
    'fixture-v1.2.3.tar'
  ]);
  assert.deepEqual([...firstFiles.keys()], [...secondFiles.keys()]);
  for (const [name, bytes] of firstFiles) {
    assert.ok(bytes.equals(secondFiles.get(name)), name);
    assert.doesNotMatch(name, /candidate/iu);
  }

  const archiveEntries = parseUstar(firstFiles.get('fixture-v1.2.3.tar'));
  assert.ok(archiveEntries.length > 0);
  assert.ok(archiveEntries.every(entry => entry.path.startsWith('fixture-v1.2.3/')));
  assert.ok(archiveEntries.every(entry => !/candidate/iu.test(entry.path)));
  const archivedManifest = archiveEntries.find(entry => entry.path.endsWith('/release-manifest.json')).data;
  assert.ok(archivedManifest.equals(firstFiles.get('fixture-v1.2.3.release-manifest.json')));

  const manifest = JSON.parse(firstFiles.get('fixture-v1.2.3.release-manifest.json').toString('utf8'));
  assert.equal(manifest.publicationMode, 'release');
  assert.equal(manifest.releaseState, 'Public beta');
  assert.equal(manifest.releaseSpec.status, 'ready');
  assert.equal(manifest.releaseSpec.path, 'config/releases/v1.2.3.json');
  assert.equal(manifest.tag, 'v1.2.3');
  assert.deepEqual(manifest.promotion, {
    releaseDate: '2026-08-23',
    tag: 'v1.2.3',
    mode: 'annotated-tag',
    tagObject,
    tagCommit: fixture.commit,
    taggedAt: '2026-08-23T15:04:05+00:00',
    protectedMainRef: 'refs/remotes/origin/main',
    protectedMainCommit: fixture.commit,
    reachableFromProtectedMain: true
  });
  assert.equal(manifest.sourceState.clean, true);
  assert.equal(manifest.sourceState.requiredClean, true);
  assert.equal(manifest.sourceState.inputsMatchCommit, true);

  const checksums = firstFiles.get('fixture-v1.2.3.SHA256SUMS').toString('utf8').trimEnd().split('\n');
  assert.deepEqual(checksums.map(line => line.slice(66)), [
    'fixture-v1.2.3.notes.md',
    'fixture-v1.2.3.release-manifest.json',
    'fixture-v1.2.3.tar'
  ]);
  for (const line of checksums) {
    const match = /^([0-9a-f]{64})  (.+)$/u.exec(line);
    assert.ok(match);
    assert.equal(match[1], hash(firstFiles.get(match[2])));
  }

  const notes = firstFiles.get('fixture-v1.2.3.notes.md').toString('utf8');
  assert.match(notes, /^# fixture-v1\.2\.3 stable release assets$/mu);
  assert.match(notes, /do not attest a GitHub Release, an environment approval, a deployment, or public post-deployment verification/u);
  assert.ok(notes.includes(`Tag object: \`${tagObject}\``));
  assert.match(notes, /Tagged at: `2026-08-23T15:04:05\+00:00`/u);
  assert.ok(notes.includes(`Commit: \`${fixture.commit}\``));
  assert.ok(notes.includes(`Protected-main commit: \`${fixture.commit}\``));
  assert.match(notes, /Prerelease: `true`/u);
  assert.match(notes, /^## \[1\.2\.3\] - 2026-08-23$/mu);
  assert.match(notes, /Frozen v1\.2\.3 release note/u);
  assert.doesNotMatch(notes, /Post-freeze follow-up|Prior release/u);
});

test('stable --check completes both local ref verifications without publishing an output directory', async () => {
  const fixture = await makeFixture({ status: 'ready' });
  createStableRefs(fixture);
  const outputDirectory = path.join(fixture.base, 'stable-check');
  const result = await buildStableReleaseAssets(stableBuildOptions(fixture, {
    outputDirectory,
    checkOnly: true
  }));
  assert.equal(result.status, 'VALID');
  assert.equal(result.stable, true);
  assert.equal(result.externalOutputCreated, false);
  assert.equal(result.files.length, 4);
  await assert.rejects(access(outputDirectory), error => error.code === 'ENOENT');
  await access(path.join(fixture.root, '_site', 'release-manifest.json'));
});

test('stable publish rechecks ref proof after temporary files exist and removes residue on drift', async () => {
  const fixture = await makeFixture({
    status: 'ready',
    largePayloadBytes: 15 * 1024 * 1024,
    largePayloadCount: 3
  });
  const originalTagObject = createStableRefs(fixture);
  const outputDirectory = path.join(fixture.base, 'stable-ref-drift');
  const script = path.resolve('scripts/release-assets.mjs');
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith('AI_TREE_') || name === 'GITHUB_SHA' || name === 'CI_COMMIT_SHA') delete environment[name];
  }
  environment.npm_config_user_agent = 'npm/11.11.0 node/v24.14.1 test';
  const child = spawn(process.execPath, [
    script,
    '--mode', 'stable',
    '--repository-root', fixture.root,
    '--commit', fixture.commit,
    '--output-directory', outputDirectory,
    '--tag', 'v1.2.3',
    '--release-spec-path', 'config/releases/v1.2.3.json',
    '--protected-main-ref', 'refs/remotes/origin/main'
  ], {
    cwd: path.resolve('.'),
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; });
  const closed = once(child, 'close');
  const temporaryPrefix = '.stable-ref-drift.tmp-';
  let observedTemporary = false;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline && child.exitCode === null) {
    const names = await readdir(fixture.base);
    if (names.some(name => name.startsWith(temporaryPrefix))) {
      observedTemporary = true;
      break;
    }
    await delay(2);
  }
  if (!observedTemporary && child.exitCode === null) child.kill();
  assert.equal(observedTemporary, true, 'test must observe the atomic temporary directory before final ref verification');

  git(fixture.root, ['tag', '--delete', 'v1.2.3']);
  git(fixture.root, ['tag', '-a', 'v1.2.3', '-m', 'changed after staging', fixture.commit], {
    GIT_COMMITTER_DATE: '2026-08-23T15:04:05+00:00'
  });
  const changedTagObject = git(fixture.root, ['rev-parse', 'refs/tags/v1.2.3']);
  assert.notEqual(changedTagObject, originalTagObject);

  const [exitCode] = await closed;
  assert.notEqual(exitCode, 0);
  assert.match(stderr, /final stable ref proof changed after staging: tagObject/u);
  await assert.rejects(access(outputDirectory), error => error.code === 'ENOENT');
  assert.equal(
    (await readdir(fixture.base)).some(name => name.startsWith(temporaryPrefix)),
    false,
    'failed final verification must remove its temporary output directory'
  );
});

test('stable mode rejects planned, absent, lightweight, wrong-target, wrong-date, wrong-ref, and unreachable tag state', async t => {
  await t.test('planned release specification', async () => {
    const fixture = await makeFixture({ status: 'planned' });
    createStableRefs(fixture);
    const outputDirectory = path.join(fixture.base, 'planned-stable');
    await assert.rejects(
      buildStableReleaseAssets(stableBuildOptions(fixture, { outputDirectory })),
      /release specification is planned, not ready/u
    );
    await assert.rejects(access(outputDirectory), error => error.code === 'ENOENT');
  });

  await t.test('missing tag', async () => {
    const fixture = await makeFixture({ status: 'ready' });
    git(fixture.root, ['update-ref', 'refs/remotes/origin/main', fixture.commit]);
    await assert.rejects(
      buildStableReleaseAssets(stableBuildOptions(fixture, {
        outputDirectory: path.join(fixture.base, 'missing-tag')
      })),
      /release tag.*does not resolve|cannot resolve release tag/iu
    );
  });

  await t.test('lightweight tag', async () => {
    const fixture = await makeFixture({ status: 'ready' });
    createStableRefs(fixture, { lightweight: true });
    await assert.rejects(
      buildStableReleaseAssets(stableBuildOptions(fixture, {
        outputDirectory: path.join(fixture.base, 'lightweight-tag')
      })),
      /annotated tag object/u
    );
  });

  await t.test('tag targets a commit other than HEAD', async () => {
    const fixture = await makeFixture({ status: 'ready' });
    const prior = fixture.commit;
    addEmptyCommit(fixture);
    createStableRefs(fixture, { tagTarget: prior });
    await assert.rejects(
      buildStableReleaseAssets(stableBuildOptions(fixture, {
        outputDirectory: path.join(fixture.base, 'wrong-target')
      })),
      /annotated tag must directly target HEAD/u
    );
  });

  await t.test('tagger calendar date differs from release date', async () => {
    const fixture = await makeFixture({ status: 'ready' });
    createStableRefs(fixture, { taggedAt: '2026-08-22T15:04:05+00:00' });
    await assert.rejects(
      buildStableReleaseAssets(stableBuildOptions(fixture, {
        outputDirectory: path.join(fixture.base, 'wrong-date')
      })),
      /annotated tag calendar date .* does not match/u
    );
  });

  await t.test('explicit protected ref differs from policy', async () => {
    const fixture = await makeFixture({ status: 'ready' });
    createStableRefs(fixture);
    await assert.rejects(
      buildStableReleaseAssets(stableBuildOptions(fixture, {
        outputDirectory: path.join(fixture.base, 'wrong-ref'),
        protectedMainRef: 'refs/heads/main'
      })),
      /AI_TREE_PROTECTED_MAIN_REF must be exactly refs\/remotes\/origin\/main/u
    );
  });

  await t.test('tag commit is not reachable from protected main', async () => {
    const fixture = await makeFixture({ status: 'ready' });
    const prior = fixture.commit;
    addEmptyCommit(fixture);
    createStableRefs(fixture, { protectedMainCommit: prior });
    await assert.rejects(
      buildStableReleaseAssets(stableBuildOptions(fixture, {
        outputDirectory: path.join(fixture.base, 'unreachable')
      })),
      /not reachable from protectedMainRef/u
    );
  });
});

test('stable mode rejects config mismatch, relative or linked roots, all ambient AI_TREE controls, and mismatched CI commits', async () => {
  const fixture = await makeFixture({ status: 'ready' });
  createStableRefs(fixture);

  await assert.rejects(
    buildStableReleaseAssets(stableBuildOptions(fixture, {
      outputDirectory: path.join(fixture.base, 'config-mismatch'),
      releaseSpecPath: 'config/releases/not-the-configured-release.json'
    })),
    /AI_TREE_RELEASE_SPEC_PATH must be exactly/u
  );
  await assert.rejects(
    buildStableReleaseAssets(stableBuildOptions(fixture, {
      configPath: 'config/alternate-pages-stage.json',
      outputDirectory: path.join(fixture.base, 'alternate-stage-config')
    })),
    /stable mode requires --config to be exactly config\/pages-stage\.v1\.json/u
  );
  await assert.rejects(
    buildStableReleaseAssets(stableBuildOptions(fixture, {
      repositoryRoot: undefined,
      outputDirectory: path.join(fixture.base, 'missing-root')
    })),
    /explicit absolute canonical path/u
  );
  await assert.rejects(
    buildStableReleaseAssets(stableBuildOptions(fixture, {
      repositoryRoot: path.relative(path.resolve('.'), fixture.root),
      outputDirectory: path.join(fixture.base, 'relative-root')
    })),
    /explicit absolute canonical path/u
  );
  await assert.rejects(
    buildStableReleaseAssets(stableBuildOptions(fixture, {
      repositoryRoot: `${fixture.root}${path.sep}.${path.sep}`,
      outputDirectory: path.join(fixture.base, 'dot-segment-root')
    })),
    /normalized canonical spelling/u
  );

  const linkedRoot = path.join(fixture.base, 'linked-repository');
  await symlink(fixture.root, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(
    buildStableReleaseAssets(stableBuildOptions(fixture, {
      repositoryRoot: linkedRoot,
      outputDirectory: path.join(fixture.base, 'linked-root-assets')
    })),
    /canonical worktree path/u
  );

  for (const name of ['AI_TREE_RELEASE_FUTURE_CONTROL', 'AI_TREE_STAGE_MODE', 'AI_TREE_UNRECOGNIZED']) {
    const outputDirectory = path.join(fixture.base, `ambient-${name.toLowerCase()}`);
    await assert.rejects(
      buildStableReleaseAssets(stableBuildOptions(fixture, {
        outputDirectory,
        environment: candidateEnvironment({ [name]: 'poisoned' })
      })),
      /stable builds reject ambient release controls/u,
      name
    );
    await assert.rejects(access(outputDirectory), error => error.code === 'ENOENT');
  }
  for (const name of ['GITHUB_SHA', 'CI_COMMIT_SHA']) {
    await assert.rejects(
      buildStableReleaseAssets(stableBuildOptions(fixture, {
        outputDirectory: path.join(fixture.base, `mismatch-${name.toLowerCase()}`),
        environment: candidateEnvironment({ [name]: 'f'.repeat(40) })
      })),
      new RegExp(`${name} does not match`, 'u')
    );
  }
});

test('stable mode binds every executing release tool to the advertised commit', async () => {
  const fixture = await makeFixture({ status: 'ready' });
  await write(fixture.root, 'scripts/release-assets.mjs', '// substituted release tool\n');
  git(fixture.root, ['add', '--', 'scripts/release-assets.mjs']);
  git(fixture.root, ['commit', '--quiet', '-m', 'substitute release tool'], {
    GIT_AUTHOR_DATE: '2026-08-21T12:00:00+00:00',
    GIT_COMMITTER_DATE: '2026-08-21T12:00:00+00:00'
  });
  fixture.commit = git(fixture.root, ['rev-parse', 'HEAD']);
  createStableRefs(fixture);
  const outputDirectory = path.join(fixture.base, 'substituted-release-tool');
  await assert.rejects(
    buildStableReleaseAssets(stableBuildOptions(fixture, { outputDirectory })),
    /executing release tool does not match the advertised commit: scripts\/release-assets\.mjs/u
  );
  await assert.rejects(access(outputDirectory), error => error.code === 'ENOENT');
});

test('release Git subprocess policies prohibit lazy network fetches', async () => {
  for (const sourcePath of ['scripts/release-assets.mjs', 'scripts/stage-site.mjs']) {
    const source = await readFile(path.resolve(sourcePath), 'utf8');
    assert.match(
      source,
      /environment\.GIT_NO_LAZY_FETCH = '1';/u,
      `${sourcePath} must disable promisor-object lazy fetches`
    );
    assert.match(
      source,
      /environment\.GIT_DISCOVERY_ACROSS_FILESYSTEM = '0';/u,
      `${sourcePath} must not discover a different repository across filesystem boundaries`
    );
  }
});

test('stable mode requires an observed supported Node, npm, and package-lock toolchain', async () => {
  const fixture = await makeFixture({ status: 'ready' });
  createStableRefs(fixture);

  for (const [label, userAgent] of [
    ['missing-npm', undefined],
    ['wrong-npm-major', 'npm/10.9.0 node/v24.14.1 test']
  ]) {
    const environment = {};
    if (userAgent !== undefined) environment.npm_config_user_agent = userAgent;
    await assert.rejects(
      buildStableReleaseAssets(stableBuildOptions(fixture, {
        outputDirectory: path.join(fixture.base, `unsupported-toolchain-${label}`),
        environment
      })),
      /stable assets require observed Node 24, npm 11, and package-lock v3 toolchain identity/u,
      label
    );
  }
});

test('stable mode requires a recorded data digest accepted by downstream verification', async () => {
  const fixture = await makeFixture({ status: 'ready', dataDigest: null });
  createStableRefs(fixture);
  const outputDirectory = path.join(fixture.base, 'missing-data-digest');
  await assert.rejects(
    buildStableReleaseAssets(stableBuildOptions(fixture, { outputDirectory })),
    /stable assets require a recorded lowercase SHA-256 data digest/u
  );
  await assert.rejects(access(outputDirectory), error => error.code === 'ENOENT');
});

test('candidate API rejects stable-only options and explicit candidate mode preserves artifact bytes', async () => {
  const fixture = await makeFixture();
  const defaultDirectory = path.join(fixture.base, 'candidate-default-mode');
  const explicitDirectory = path.join(fixture.base, 'candidate-explicit-mode');
  await buildCandidateReleaseAssets({
    repositoryRoot: fixture.root,
    commit: fixture.commit,
    outputDirectory: defaultDirectory,
    environment: candidateEnvironment()
  });
  await buildCandidateReleaseAssets({
    repositoryRoot: fixture.root,
    commit: fixture.commit,
    outputDirectory: explicitDirectory,
    environment: candidateEnvironment(),
    mode: 'candidate'
  });
  const defaults = await readOutputFiles(defaultDirectory);
  const explicit = await readOutputFiles(explicitDirectory);
  assert.deepEqual([...defaults.keys()], [...explicit.keys()]);
  for (const [name, bytes] of defaults) assert.ok(bytes.equals(explicit.get(name)), name);

  for (const option of [
    { mode: 'stable' },
    { tag: 'v1.2.3' },
    { releaseSpecPath: 'config/releases/v1.2.3.json' },
    { protectedMainRef: 'refs/remotes/origin/main' }
  ]) {
    await assert.rejects(
      buildCandidateReleaseAssets({
        repositoryRoot: fixture.root,
        commit: fixture.commit,
        outputDirectory: path.join(fixture.base, `rejected-${Object.keys(option)[0]}`),
        environment: candidateEnvironment(),
        ...option
      }),
      /candidate builds reject stable-only options/u
    );
  }
});

test('uses the USTAR prefix field for long representable paths', async () => {
  const target = `${'nested-segment-'.repeat(6)}x/index.html`;
  const fixture = await makeFixture({ indexTarget: target });
  const outputDirectory = path.join(fixture.base, 'long-path-candidate');
  await buildCandidateReleaseAssets({
    repositoryRoot: fixture.root,
    commit: fixture.commit,
    outputDirectory,
    environment: candidateEnvironment()
  });
  const output = await readOutputFiles(outputDirectory);
  const archive = [...output.entries()].find(([name]) => name.endsWith('.tar'))[1];
  const targetEntry = parseUstar(archive).find(entry => entry.path.endsWith(`/${target}`));
  assert.ok(targetEntry);
  assert.notEqual(targetEntry.prefix, '');
  assert.equal(targetEntry.name, 'index.html');
});

test('rejects a path whose final component cannot be represented by USTAR', async () => {
  const fixture = await makeFixture({ indexTarget: `pages/${'a'.repeat(101)}.html` });
  const outputDirectory = path.join(fixture.base, 'unrepresentable-candidate');
  await assert.rejects(
    buildCandidateReleaseAssets({
      repositoryRoot: fixture.root,
      commit: fixture.commit,
      outputDirectory,
      environment: candidateEnvironment()
    }),
    /cannot be represented by portable USTAR/u
  );
  await assert.rejects(access(outputDirectory), error => error.code === 'ENOENT');
});

test('--check performs full validation without creating the external output directory', async () => {
  const fixture = await makeFixture();
  const outputDirectory = path.join(fixture.base, 'checked-candidate');
  const result = await buildCandidateReleaseAssets({
    repositoryRoot: fixture.root,
    commit: fixture.commit,
    outputDirectory,
    checkOnly: true,
    environment: candidateEnvironment()
  });
  assert.equal(result.status, 'VALID');
  assert.equal(result.externalOutputCreated, false);
  assert.equal(result.stagedSiteRefreshed, true);
  assert.equal(result.files.length, 4);
  await assert.rejects(access(outputDirectory), error => error.code === 'ENOENT');
  await access(path.join(fixture.root, '_site', 'release-manifest.json'));
});

test('requires a new external absolute output directory and never overwrites it', async () => {
  const fixture = await makeFixture();
  const existing = path.join(fixture.base, 'existing');
  await mkdir(existing);
  await write(existing, 'sentinel.txt', 'preserve me');
  await assert.rejects(
    buildCandidateReleaseAssets({
      repositoryRoot: fixture.root,
      commit: fixture.commit,
      outputDirectory: existing,
      environment: candidateEnvironment()
    }),
    /already exists and will not be overwritten/u
  );
  assert.equal(await readFile(path.join(existing, 'sentinel.txt'), 'utf8'), 'preserve me');
  await assert.rejects(
    buildCandidateReleaseAssets({
      repositoryRoot: fixture.root,
      commit: fixture.commit,
      outputDirectory: path.join(fixture.root, 'assets'),
      environment: candidateEnvironment()
    }),
    /outside the repository worktree/u
  );
  await assert.rejects(
    buildCandidateReleaseAssets({
      repositoryRoot: fixture.root,
      commit: fixture.commit,
      outputDirectory: 'relative-assets',
      environment: candidateEnvironment()
    }),
    /explicit absolute path/u
  );
});

test('rejects an output directory reached through a symbolic-link or junction parent', async () => {
  const fixture = await makeFixture();
  const realParent = path.join(fixture.base, 'real-output-parent');
  const linkedParent = path.join(fixture.base, 'linked-output-parent');
  await mkdir(realParent);
  await symlink(realParent, linkedParent, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(
    buildCandidateReleaseAssets({
      repositoryRoot: fixture.root,
      commit: fixture.commit,
      outputDirectory: path.join(linkedParent, 'candidate'),
      environment: candidateEnvironment()
    }),
    /cannot traverse a symbolic-link or junction parent/u
  );
  assert.deepEqual(await readdir(realParent), [], 'rejected linked output leaves no candidate or temp residue');
});

test('rejects abbreviated commits, dirty source, and a commit other than exact HEAD', async () => {
  const fixture = await makeFixture();
  await assert.rejects(
    buildCandidateReleaseAssets({
      repositoryRoot: fixture.root,
      commit: fixture.commit.slice(0, 12),
      outputDirectory: path.join(fixture.base, 'abbreviated'),
      environment: candidateEnvironment()
    }),
    /exact lowercase 40- or 64-character/u
  );
  await write(fixture.root, 'index.html', '<!doctype html><title>Dirty</title>\n');
  await assert.rejects(
    buildCandidateReleaseAssets({
      repositoryRoot: fixture.root,
      commit: fixture.commit,
      outputDirectory: path.join(fixture.base, 'dirty'),
      environment: candidateEnvironment()
    }),
    /clean git source tree is required/u
  );
});

test('rejects all ambient release intent and conflicting candidate controls', async () => {
  const fixture = await makeFixture();
  for (const [name, value, expected] of [
    ['AI_TREE_RELEASE_TAG', 'v1.2.3', /ambient release flags/u],
    ['AI_TREE_RELEASE_SPEC_PATH', 'release.json', /ambient release flags/u],
    ['AI_TREE_PROTECTED_MAIN_REF', 'refs/remotes/origin/main', /ambient release flags/u],
    ['AI_TREE_STAGE_MODE', 'release', /must be preview/u],
    ['AI_TREE_REQUIRE_CLEAN', 'false', /cannot disable/u],
    ['AI_TREE_COMMIT_SHA', 'f'.repeat(40), /does not match/u]
  ]) {
    await assert.rejects(
      buildCandidateReleaseAssets({
        repositoryRoot: fixture.root,
        commit: fixture.commit,
        outputDirectory: path.join(fixture.base, `reject-${name.toLowerCase()}`),
        environment: candidateEnvironment({ [name]: value })
      }),
      expected,
      name
    );
  }
});

test('rejects hidden or ambiguous Unreleased headings while permitting harmless comments', async () => {
  assert.equal(
    extractUnreleasedBody(Buffer.from('# C\n\n## [Unreleased]\n\n<!-- note -->\n- Visible\n\n## [1.0.0]\n')),
    '- Visible\n'
  );
  for (const changelog of [
    '# C\n\n<!--\n## [Unreleased]\n-->\n\n## [Unreleased]\n\n- Visible\n',
    '# C\n\n```text\n## [Unreleased]\n```\n\n## [Unreleased]\n\n- Visible\n',
    '# C\n\n### [Unreleased]\n\n## [Unreleased]\n\n- Visible\n'
  ]) {
    assert.throws(() => extractUnreleasedBody(Buffer.from(changelog)), /Unreleased heading/u);
  }
  for (const underline of ['------------', '============']) {
    assert.throws(
      () => extractUnreleasedBody(Buffer.from(
        `# C\n\n## [Unreleased]\n\n- Visible\n\n[Unreleased]\n${underline}\n\n- Duplicate\n`
      )),
      /Setext Unreleased heading/u
    );
  }
  for (const changelog of [
    '# C\n\n## [Unreleased]\n\n<div hidden>not rendered as Markdown</div>\n- Visible\n',
    '# C\n\n## [Unreleased]\n\n<release-note>hidden</release-note>\n- Visible\n',
    '# C\n\n## [Unreleased]\n\n<?candidate hidden?>\n- Visible\n'
  ]) {
    assert.throws(() => extractUnreleasedBody(Buffer.from(changelog)), /unsupported raw HTML block/u);
  }

  const fixture = await makeFixture({
    changelog: '# Changelog\n\n<!--\n## [Unreleased]\n-->\n\n## [Unreleased]\n\n**Target: v1.2.3 development edition.**\n'
  });
  await assert.rejects(
    buildCandidateReleaseAssets({
      repositoryRoot: fixture.root,
      commit: fixture.commit,
      outputDirectory: path.join(fixture.base, 'hidden-heading'),
      environment: candidateEnvironment()
    }),
    /hides an Unreleased heading/u
  );
});

test('ready note extraction requires one exact dated version section and rejects hidden ambiguity', () => {
  const spec = releaseSpec({ status: 'ready', releaseDate: '2026-08-23' });
  const extracted = extractCandidateChangeBody(Buffer.from(readyChangelog), spec);
  assert.equal(extracted.section.heading, '## [1.2.3] - 2026-08-23');
  assert.match(extracted.body, /Frozen v1\.2\.3 release note/u);
  assert.doesNotMatch(extracted.body, /Post-freeze/u);
  const h1Boundary = extractCandidateChangeBody(Buffer.from([
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '## [1.2.3] - 2026-08-23',
    '',
    '- Intended release note.',
    '',
    '# Appendix',
    '',
    '- MUST NOT BE IN VERSION NOTES.',
    ''
  ].join('\n')), spec);
  assert.match(h1Boundary.body, /Intended release note/u);
  assert.doesNotMatch(h1Boundary.body, /Appendix|MUST NOT/u);
  const fencedHeading = extractCandidateChangeBody(Buffer.from([
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '## [1.2.3] - 2026-08-23',
    '',
    '- Before code example.',
    '',
    '```markdown',
    '<!-- literal code comment, not an HTML block -->',
    '## This is displayed as code, not a section boundary',
    '```',
    '',
    '- AFTER FENCE MUST REMAIN IN VERSION NOTES.',
    '',
    '## [1.2.2] - 2026-08-01',
    '',
    '- Prior release.',
    ''
  ].join('\n')), spec);
  assert.match(fencedHeading.body, /<!-- literal code comment, not an HTML block -->/u);
  assert.match(fencedHeading.body, /This is displayed as code/u);
  assert.match(fencedHeading.body, /AFTER FENCE MUST REMAIN/u);
  assert.match(fencedHeading.body, /```\n\n- AFTER FENCE/u);
  assert.doesNotMatch(fencedHeading.body, /Prior release/u);
  assert.throws(
    () => extractCandidateChangeBody(Buffer.from([
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '## [1.2.3] - 2026-08-23',
      '',
      '- Before adversarial fence.',
      '',
      '```markdown',
      '<!-- literal code comment starts',
      '```',
      '',
      '## [1.2.2] - 2026-08-01',
      '',
      '-->',
      '- MUST NOT BE IN VERSION NOTES.',
      '```',
      ''
    ].join('\n')), spec),
    /unterminated fenced block/u
  );
  assert.throws(
    () => extractCandidateChangeBody(Buffer.from([
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '## [1.2.3] - 2026-08-23',
      '',
      '- Intended release note.',
      '<!-- harmless comment -->```markdown',
      '',
      '## [1.2.2] - 2026-08-01',
      '',
      '- MUST NOT BE IN VERSION NOTES.',
      '```',
      ''
    ].join('\n')), spec),
    /HTML comments must occupy standalone physical lines/u
  );
  assert.throws(
    () => extractCandidateChangeBody(Buffer.from([
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '## [1.2.3] - 2026-08-23',
      '',
      '- Main release item',
      '',
      '  ## Nested migration detail',
      '',
      '  - THIS BELONGS TO VERSION NOTES.',
      '',
      '- FOLLOWING RELEASE NOTE MUST REMAIN.',
      '',
      '## [1.2.2] - 2026-08-01',
      ''
    ].join('\n')), spec),
    /unsupported indented ATX H1 or H2 heading/u
  );
  for (const indent of ['    ', '\t', ' \t', '  \t', '   \t']) {
    assert.throws(
      () => extractCandidateChangeBody(Buffer.from([
        '# Changelog',
        '',
        '## [Unreleased]',
        '',
        '## [1.2.3] - 2026-08-23',
        '',
        '- Intended release note.',
        '',
        `${indent}<!-- literal indented code starts`,
        '## [1.2.2] - 2026-08-01',
        `${indent}-->`,
        '- MUST NOT BE IN VERSION NOTES.',
        ''
      ].join('\n')), spec),
      /unsupported indented-code HTML comment opener/u
    );
  }
  for (const changelog of [
    readyChangelog.replace('## [1.2.3] - 2026-08-23', '### [1.2.3] - 2026-08-23'),
    `${readyChangelog}\n## [1.2.3] - 2026-08-23\n\n- Duplicate.\n`,
    readyChangelog.replace(
      '## [1.2.3] - 2026-08-23',
      '<!--\n## [1.2.3] - 2026-08-23\n-->\n\n## [1.2.3] - 2026-08-23'
    ),
    readyChangelog.replace(
      '## [1.2.3] - 2026-08-23',
      '```text\n## [1.2.3] - 2026-08-23\n```\n\n## [1.2.3] - 2026-08-23'
    ),
    readyChangelog.replace(
      '## [1.2.3] - 2026-08-23',
      '[1.2.3] - 2026-08-23\n------------------------\n\n## [1.2.3] - 2026-08-23'
    ),
    readyChangelog.replace(
      '## [1.2.2] - 2026-08-01',
      '[1.2.3] - 2026-08-22\n------------------------\n\n- MUST NOT BE IN VERSION NOTES.\n\n## [1.2.2] - 2026-08-01'
    )
  ]) {
    assert.throws(
      () => extractCandidateChangeBody(Buffer.from(changelog), spec),
      /\[1\.2\.3\].*(?:heading|Setext)|exactly one visible|unsupported Setext/iu
    );
  }
  assert.throws(
    () => extractCandidateChangeBody(Buffer.from(readyChangelog), { ...spec, releaseDate: '2026-02-30' }),
    /not a valid calendar date/u
  );
});

test('rejects a release edition that could inject Markdown into deterministic notes', async () => {
  const fixture = await makeFixture({
    edition: '2026-08-20-candidate`<img-src=x>'
  });
  const outputDirectory = path.join(fixture.base, 'unsafe-edition');
  await assert.rejects(
    buildCandidateReleaseAssets({
      repositoryRoot: fixture.root,
      commit: fixture.commit,
      outputDirectory,
      environment: candidateEnvironment()
    }),
    /edition must be a Markdown-safe portable identifier/u
  );
  await assert.rejects(access(outputDirectory), error => error.code === 'ENOENT');
});

test('CLI exposes candidate check mode without producing the asset directory', async () => {
  const fixture = await makeFixture();
  const outputDirectory = path.join(fixture.base, 'cli-check');
  const script = path.resolve('scripts/release-assets.mjs');
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith('AI_TREE_')) delete environment[name];
  }
  environment.npm_config_user_agent = 'npm/11.11.0 node/v24.14.1 test';
  const result = spawnSync(process.execPath, [
    script,
    '--repository-root', fixture.root,
    '--commit', fixture.commit,
    '--output-directory', outputDirectory,
    '--check'
  ], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
    env: environment,
    windowsHide: true
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'VALID');
  assert.equal(report.candidate, true);
  await assert.rejects(access(outputDirectory), error => error.code === 'ENOENT');
});

test('CLI stable mode requires explicit release identity and performs a local check without publishing', async () => {
  const fixture = await makeFixture({ status: 'ready' });
  createStableRefs(fixture);
  const outputDirectory = path.join(fixture.base, 'cli-stable-check');
  const script = path.resolve('scripts/release-assets.mjs');
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith('AI_TREE_') || name === 'GITHUB_SHA' || name === 'CI_COMMIT_SHA') {
      delete environment[name];
    }
  }
  environment.npm_config_user_agent = 'npm/11.11.0 node/v24.14.1 test';
  const stable = spawnSync(process.execPath, [
    script,
    '--mode', 'stable',
    '--repository-root', fixture.root,
    '--commit', fixture.commit,
    '--output-directory', outputDirectory,
    '--tag', 'v1.2.3',
    '--release-spec-path', 'config/releases/v1.2.3.json',
    '--protected-main-ref', 'refs/remotes/origin/main',
    '--check'
  ], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
    env: environment,
    windowsHide: true
  });
  assert.equal(stable.status, 0, stable.stderr);
  const report = JSON.parse(stable.stdout);
  assert.equal(report.status, 'VALID');
  assert.equal(report.candidate, false);
  assert.equal(report.stable, true);
  assert.equal(report.publicationMode, 'release');
  await assert.rejects(access(outputDirectory), error => error.code === 'ENOENT');

  const environmentWithoutNpmIdentity = { ...environment };
  delete environmentWithoutNpmIdentity.npm_config_user_agent;
  const missingNpmIdentity = spawnSync(process.execPath, [
    script,
    '--mode', 'stable',
    '--repository-root', fixture.root,
    '--commit', fixture.commit,
    '--output-directory', path.join(fixture.base, 'cli-stable-missing-npm'),
    '--tag', 'v1.2.3',
    '--release-spec-path', 'config/releases/v1.2.3.json',
    '--protected-main-ref', 'refs/remotes/origin/main',
    '--check'
  ], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
    env: environmentWithoutNpmIdentity,
    windowsHide: true
  });
  assert.notEqual(missingNpmIdentity.status, 0);
  assert.match(
    missingNpmIdentity.stderr,
    /stable assets require observed Node 24, npm 11, and package-lock v3 toolchain identity/u
  );

  const alternateStageConfig = spawnSync(process.execPath, [
    script,
    '--mode', 'stable',
    '--repository-root', fixture.root,
    '--commit', fixture.commit,
    '--output-directory', path.join(fixture.base, 'cli-stable-alternate-config'),
    '--config', 'config/alternate-pages-stage.json',
    '--tag', 'v1.2.3',
    '--release-spec-path', 'config/releases/v1.2.3.json',
    '--protected-main-ref', 'refs/remotes/origin/main',
    '--check'
  ], { cwd: path.resolve('.'), encoding: 'utf8', env: environment, windowsHide: true });
  assert.notEqual(alternateStageConfig.status, 0);
  assert.match(
    alternateStageConfig.stderr,
    /stable mode requires --config to be exactly config\/pages-stage\.v1\.json/u
  );

  const missing = spawnSync(process.execPath, [
    script,
    '--mode', 'stable',
    '--repository-root', fixture.root,
    '--commit', fixture.commit,
    '--output-directory', path.join(fixture.base, 'missing-stable-args'),
    '--check'
  ], { cwd: path.resolve('.'), encoding: 'utf8', env: environment, windowsHide: true });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /--tag is required in stable mode/u);

  const candidateWithTag = spawnSync(process.execPath, [
    script,
    '--mode', 'candidate',
    '--repository-root', fixture.root,
    '--commit', fixture.commit,
    '--output-directory', path.join(fixture.base, 'candidate-with-tag'),
    '--tag', 'v1.2.3',
    '--check'
  ], { cwd: path.resolve('.'), encoding: 'utf8', env: environment, windowsHide: true });
  assert.notEqual(candidateWithTag.status, 0);
  assert.match(candidateWithTag.stderr, /candidate mode rejects stable-only arguments: --tag/u);

  const help = spawnSync(process.execPath, [script, '--help'], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
    env: environment,
    windowsHide: true
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--mode candidate\|stable/u);
  assert.match(help.stdout, /Stable mode verifies an existing annotated tag/u);
  assert.match(help.stdout, /Neither mode creates a tag, GitHub Release, approval, deployment, or public verification/u);
});

test('exports the fixed deterministic archive policy', () => {
  assert.deepEqual(releaseAssetsConstants, {
    archiveBlockSize: 512,
    archiveEndBlockCount: 2,
    archiveFileMode: 0o644,
    archiveFormat: 'ustar',
    defaultConfigPath: 'config/pages-stage.v1.json',
    maxArchiveFileBytes: 16 * 1024 * 1024,
    maxArchiveFileCount: 4096,
    maxArchiveTotalBytes: 64 * 1024 * 1024,
    scriptVersion: '1.1.0'
  });
});

test('enforces bounded file-count, per-file, and aggregate archive inventory limits', () => {
  assert.deepEqual(
    validateCandidateArchiveInventory([
      { path: 'a', bytes: 16 * 1024 * 1024 },
      { path: 'b', bytes: 1 }
    ]),
    { fileCount: 2, totalBytes: 16 * 1024 * 1024 + 1 }
  );
  assert.throws(
    () => validateCandidateArchiveInventory(
      Array.from({ length: 4097 }, (_, index) => ({ path: String(index), bytes: 0 }))
    ),
    /maximum is 4096/u
  );
  assert.throws(
    () => validateCandidateArchiveInventory([{ path: 'too-large', bytes: 16 * 1024 * 1024 + 1 }]),
    /archive file exceeds/u
  );
  assert.throws(
    () => validateCandidateArchiveInventory([
      { path: 'a', bytes: 16 * 1024 * 1024 },
      { path: 'b', bytes: 16 * 1024 * 1024 },
      { path: 'c', bytes: 16 * 1024 * 1024 },
      { path: 'd', bytes: 16 * 1024 * 1024 },
      { path: 'e', bytes: 1 }
    ]),
    /archive payload exceeds/u
  );
});
