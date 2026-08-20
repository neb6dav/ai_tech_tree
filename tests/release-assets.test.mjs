import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildCandidateReleaseAssets,
  extractUnreleasedBody,
  releaseAssetsConstants,
  validateCandidateArchiveInventory
} from '../scripts/release-assets.mjs';

const temporaryRoots = new Set();

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

function releaseSpec({ edition = '2026-08-20-test-edition' } = {}) {
  return {
    schemaVersion: '1.0.0',
    status: 'planned',
    tag: 'v1.2.3',
    version: '1.2.3',
    edition,
    releaseDate: null,
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

async function makeFixture({
  changelog = normalChangelog,
  edition = '2026-08-20-test-edition',
  indexTarget = 'index.html'
} = {}) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'ai-tree-release-assets-test-'));
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
      releaseState: 'Development edition',
      dataDigest: 'b'.repeat(64)
    }
  }, null, 2)}\n`);
  await write(root, 'CITATION.cff', [
    'cff-version: 1.2.0',
    'message: untagged development edition',
    'title: AI Research Tech Tree',
    'type: dataset',
    'authors:',
    '  - name: Fixture Author',
    'version: 1.2.3-dev',
    'repository-code: https://github.com/neb6dav/ai_tech_tree',
    'url: https://neb6dav.github.io/ai_tech_tree/',
    ''
  ].join('\n'));
  await write(root, 'CHANGELOG.md', changelog);
  await write(root, 'config/releases/v1.2.3.json', `${JSON.stringify(releaseSpec({ edition }), null, 2)}\n`);
  await write(root, 'config/pages-stage.v1.json', `${JSON.stringify(stageConfig({ indexTarget }), null, 2)}\n`);
  await write(root, 'index.html', '<!doctype html><title>Fixture</title>\n');
  await write(root, 'public/data/z.json', '{"z":1}\n');
  await write(root, 'public/data/a.json', '{"a":1}\n');
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
    scriptVersion: '1.0.0'
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
