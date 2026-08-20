import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { normalizeManifestPath, stageSite } from './stage-site.mjs';

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
    dataset: {
      edition: '2026-test-edition',
      releaseState: 'Test development edition',
      dataDigest: 'b'.repeat(64)
    }
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
  assert.equal(manifest.releaseState, 'Test development edition');
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
    stageSite: '1.3.0'
  });
  assert.deepEqual(manifest.sourceState, {
    kind: 'unavailable',
    clean: null,
    requiredClean: false,
    repositoryTopLevel: null,
    repositoryRootMatchesTopLevel: null,
    gitObjectFormat: null,
    objectDatabaseVerified: false,
    repositoryAttributesIsolated: null,
    head: null,
    commitMatchesHead: null,
    changedEntryCount: null,
    statusSha256: null,
    flaggedIndexEntryCount: null,
    indexFlagsSha256: null,
    inputCount: 7,
    matchedInputCount: null,
    directorySourceCount: 1,
    matchedDirectorySourceCount: null,
    inputsMatchCommit: null,
    inputVerificationSha256: null
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

test('requires an explicit dataset release state for the staged identity', async () => {
  const root = await makeRoot();
  await writeBaseFixture(root);
  await write(root, 'data.json', JSON.stringify({
    generatorVersion: '4.5.6',
    dataset: { edition: '2026-test-edition', releaseState: '   ' }
  }));

  await assert.rejects(
    stageSite({ repositoryRoot: root, environment }),
    /dataset releaseState must be a non-empty, trimmed string/u
  );
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

test('rejects case aliases that attempt to read from the staged output', async () => {
  const root = await makeRoot();
  const config = baseConfig({
    artifacts: [{ kind: 'file', source: '_SITE/stale-secret.txt', target: 'leak.txt' }]
  });
  await writeBaseFixture(root, config);
  await write(root, '_site/stale-secret.txt', 'must not be restaged');

  await assert.rejects(
    stageSite({ repositoryRoot: root, environment }),
    /cannot read from _site/u
  );
  await assert.rejects(
    stageSite({ repositoryRoot: root, configPath: '_SITE/config.json', environment }),
    /config path cannot read from _site/u
  );
});

test('rejects declared media types that drift from the published path', async () => {
  const root = await makeRoot();
  const config = baseConfig({
    artifacts: [{
      kind: 'file',
      source: 'index.html',
      target: 'index.html',
      mediaType: 'application/json; charset=utf-8'
    }]
  });
  await writeBaseFixture(root, config);

  await assert.rejects(
    stageSite({ repositoryRoot: root, environment }),
    /mediaType must match the canonical type/u
  );
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

test('rejects platform-specific aliases and URI-ambiguous manifest paths', () => {
  const invalid = [
    'index.html:payload',
    'CON',
    'NUL.txt',
    'COM1.json',
    'LPT9/data.json',
    'trailing.',
    'trailing-space ',
    'query?.json',
    'fragment#.json',
    '%2e%2e/index.html',
    'encoded%2fsegment.json'
  ];
  for (const candidate of invalid) {
    assert.throws(
      () => normalizeManifestPath(candidate, 'test path'),
      /non-empty, trimmed|non-portable|trailing dot or space|Windows-reserved/u,
      candidate
    );
  }
  assert.equal(normalizeManifestPath('.nojekyll'), '.nojekyll');
  assert.equal(normalizeManifestPath('topics/diffusion/index.html'), 'topics/diffusion/index.html');
});

test('records dirty git provenance and enforces clean-source deployment mode', async () => {
  const root = await makeRoot();
  await writeBaseFixture(root);
  execFileSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'user.name', 'stage-site-test'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'user.email', 'stage-site-test@example.invalid'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root, windowsHide: true });
  execFileSync('git', ['add', '--', '.'], { cwd: root, windowsHide: true });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root, windowsHide: true });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  await write(root, 'dirty.txt', 'uncommitted\n');

  const dirty = await stageSite({
    repositoryRoot: root,
    environment: { ...environment, AI_TREE_COMMIT_SHA: head },
    checkOnly: true
  });
  assert.equal(dirty.manifest.sourceState.kind, 'git');
  assert.equal(dirty.manifest.sourceState.clean, false);
  assert.equal(dirty.manifest.sourceState.commitMatchesHead, true);
  assert.match(dirty.manifest.sourceState.gitObjectFormat, /^sha(?:1|256)$/u);
  assert.equal(dirty.manifest.sourceState.objectDatabaseVerified, true);
  assert.equal(dirty.manifest.sourceState.repositoryAttributesIsolated, true);
  assert.equal(dirty.manifest.sourceState.changedEntryCount, 1);
  assert.match(dirty.manifest.sourceState.statusSha256, /^[0-9a-f]{64}$/u);
  assert.equal(dirty.manifest.sourceState.flaggedIndexEntryCount, 0);
  assert.match(dirty.manifest.sourceState.indexFlagsSha256, /^[0-9a-f]{64}$/u);
  assert.equal(dirty.manifest.sourceState.inputCount, 7);
  assert.equal(dirty.manifest.sourceState.matchedInputCount, 7);
  assert.equal(dirty.manifest.sourceState.directorySourceCount, 1);
  assert.equal(dirty.manifest.sourceState.matchedDirectorySourceCount, 1);
  assert.equal(dirty.manifest.sourceState.inputsMatchCommit, true);
  assert.match(dirty.manifest.sourceState.inputVerificationSha256, /^[0-9a-f]{64}$/u);

  await assert.rejects(
    stageSite({
      repositoryRoot: root,
      environment: { ...environment, AI_TREE_COMMIT_SHA: head, AI_TREE_REQUIRE_CLEAN: 'true' },
      checkOnly: true
    }),
    /clean git source tree is required/u
  );
});

test('clean-source mode rejects ignored or untracked allowlisted inputs absent from the commit', async () => {
  const root = await makeRoot();
  await writeBaseFixture(root);
  await write(root, '.gitignore', 'public/data/ignored.json\n');
  execFileSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'user.name', 'stage-site-test'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'user.email', 'stage-site-test@example.invalid'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root, windowsHide: true });
  execFileSync('git', ['add', '--', '.'], { cwd: root, windowsHide: true });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root, windowsHide: true });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  await write(root, 'public/data/ignored.json', '{"secret":true}\n');

  assert.equal(
    execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true
    }).trim(),
    ''
  );
  await assert.rejects(
    stageSite({
      repositoryRoot: root,
      environment: { ...environment, AI_TREE_COMMIT_SHA: head, AI_TREE_REQUIRE_CLEAN: 'true' },
      checkOnly: true
    }),
    /release inputs? do(?:es)? not match or cannot be published from advertised commit.*public\/data\/ignored\.json/u
  );
});

test('input blob verification defeats Git environment and assume-unchanged bypasses', async () => {
  const root = await makeRoot();
  await writeBaseFixture(root);
  await write(root, 'README.md', 'Fixture documentation\n');
  execFileSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'user.name', 'stage-site-test'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'user.email', 'stage-site-test@example.invalid'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root, windowsHide: true });
  execFileSync('git', ['add', '--', '.'], { cwd: root, windowsHide: true });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root, windowsHide: true });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const previousGitDir = process.env.GIT_DIR;
  const previousGitIndex = process.env.GIT_INDEX_FILE;
  try {
    process.env.GIT_DIR = path.join(root, 'hostile-git-dir');
    process.env.GIT_INDEX_FILE = path.join(root, 'hostile-index');
    const clean = await stageSite({
      repositoryRoot: root,
      environment: { ...environment, AI_TREE_COMMIT_SHA: head, AI_TREE_REQUIRE_CLEAN: 'true' },
      checkOnly: true
    });
    assert.equal(clean.manifest.sourceState.inputsMatchCommit, true);
  } finally {
    if (previousGitDir === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = previousGitDir;
    if (previousGitIndex === undefined) delete process.env.GIT_INDEX_FILE;
    else process.env.GIT_INDEX_FILE = previousGitIndex;
  }

  execFileSync('git', ['update-index', '--assume-unchanged', '--', 'README.md'], { cwd: root, windowsHide: true });
  await write(root, 'README.md', 'Hidden non-input mutation\n');
  assert.equal(
    execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true
    }).trim(),
    ''
  );
  await assert.rejects(
    stageSite({
      repositoryRoot: root,
      environment: { ...environment, AI_TREE_COMMIT_SHA: head, AI_TREE_REQUIRE_CLEAN: 'true' },
      checkOnly: true
    }),
    /clean git source tree is required.*assume-unchanged or skip-worktree/u
  );
});

test('strict provenance rejects Git objects whose bytes do not match their tree object IDs', async () => {
  const root = await makeRoot();
  await writeBaseFixture(root);
  execFileSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'user.name', 'stage-site-test'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'user.email', 'stage-site-test@example.invalid'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root, windowsHide: true });
  execFileSync('git', ['add', '--', '.'], { cwd: root, windowsHide: true });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root, windowsHide: true });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const expectedBlob = execFileSync('git', ['rev-parse', 'HEAD:index.html'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  }).trim();
  const replacementHtml = '<!doctype html><title>Wrong object bytes</title>\n';
  const replacementBlob = execFileSync('git', ['hash-object', '-w', '--stdin'], {
    cwd: root,
    encoding: 'utf8',
    input: replacementHtml,
    windowsHide: true
  }).trim();
  const gitDirectory = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  }).trim();
  const expectedObjectPath = path.join(
    gitDirectory,
    'objects',
    expectedBlob.slice(0, 2),
    expectedBlob.slice(2)
  );
  await chmod(expectedObjectPath, 0o666);
  await copyFile(
    path.join(gitDirectory, 'objects', replacementBlob.slice(0, 2), replacementBlob.slice(2)),
    expectedObjectPath
  );
  await write(root, 'index.html', replacementHtml);

  const observed = await stageSite({
    repositoryRoot: root,
    environment: { ...environment, AI_TREE_COMMIT_SHA: head },
    checkOnly: true
  });
  assert.equal(observed.manifest.sourceState.objectDatabaseVerified, false);
  assert.equal(observed.manifest.sourceState.inputsMatchCommit, false);
  assert.equal(observed.manifest.sourceState.matchedInputCount, observed.manifest.sourceState.inputCount - 1);

  await assert.rejects(
    stageSite({
      repositoryRoot: root,
      environment: { ...environment, AI_TREE_COMMIT_SHA: head, AI_TREE_REQUIRE_CLEAN: 'true' },
      checkOnly: true
    }),
    /Git object database failed integrity validation/u
  );
});

test('strict provenance rejects custom Git filters on release inputs', async () => {
  const root = await makeRoot();
  await writeBaseFixture(root);
  await write(root, '.gitattributes', 'index.html filter=identity\n');
  await write(root, 'identity-filter.cjs', "'use strict';\nprocess.stdin.pipe(process.stdout);\n");
  execFileSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'user.name', 'stage-site-test'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'user.email', 'stage-site-test@example.invalid'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'filter.identity.clean', 'node identity-filter.cjs'], { cwd: root, windowsHide: true });
  execFileSync('git', ['add', '--', '.'], { cwd: root, windowsHide: true });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root, windowsHide: true });
  let head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();

  await assert.rejects(
    stageSite({
      repositoryRoot: root,
      environment: { ...environment, AI_TREE_COMMIT_SHA: head, AI_TREE_REQUIRE_CLEAN: 'true' },
      checkOnly: true
    }),
    /Git filter attribute identity is not supported by deterministic staging/u
  );

  for (const ambiguousFilterName of ['unspecified', 'unset']) {
    await write(root, '.gitattributes', `index.html filter=${ambiguousFilterName}\n`);
    execFileSync('git', ['config', `filter.${ambiguousFilterName}.clean`, 'node identity-filter.cjs'], {
      cwd: root,
      windowsHide: true
    });
    execFileSync('git', ['add', '--', '.gitattributes'], { cwd: root, windowsHide: true });
    execFileSync('git', ['commit', '--quiet', '-m', `fixture-${ambiguousFilterName}`], {
      cwd: root,
      windowsHide: true
    });
    head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true
    }).trim();
    await assert.rejects(
      stageSite({
        repositoryRoot: root,
        environment: { ...environment, AI_TREE_COMMIT_SHA: head, AI_TREE_REQUIRE_CLEAN: 'true' },
        checkOnly: true
      }),
      new RegExp(`Git filter attribute ${ambiguousFilterName} is not supported`, 'u')
    );
  }

  await write(root, '.git/info/attributes', 'index.html !filter\n');
  const locallyOverridden = await stageSite({
    repositoryRoot: root,
    environment: { ...environment, AI_TREE_COMMIT_SHA: head },
    checkOnly: true
  });
  assert.equal(locallyOverridden.manifest.sourceState.repositoryAttributesIsolated, false);
  assert.equal(locallyOverridden.manifest.sourceState.inputsMatchCommit, false);
  await assert.rejects(
    stageSite({
      repositoryRoot: root,
      environment: { ...environment, AI_TREE_COMMIT_SHA: head, AI_TREE_REQUIRE_CLEAN: 'true' },
      checkOnly: true
    }),
    /repository-local Git attribute overrides are not allowed/u
  );
});

test('strict provenance rejects common attribute overrides in linked worktrees', async () => {
  const parent = await makeRoot();
  const primary = path.join(parent, 'primary');
  const linked = path.join(parent, 'linked');
  await mkdir(primary, { recursive: true });
  await writeBaseFixture(primary);
  execFileSync('git', ['init', '--quiet'], { cwd: primary, windowsHide: true });
  execFileSync('git', ['config', 'user.name', 'stage-site-test'], { cwd: primary, windowsHide: true });
  execFileSync('git', ['config', 'user.email', 'stage-site-test@example.invalid'], {
    cwd: primary,
    windowsHide: true
  });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: primary, windowsHide: true });
  execFileSync('git', ['add', '--', '.'], { cwd: primary, windowsHide: true });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: primary, windowsHide: true });
  execFileSync('git', ['worktree', 'add', '--quiet', '--detach', linked, 'HEAD'], {
    cwd: primary,
    windowsHide: true
  });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: linked,
    encoding: 'utf8',
    windowsHide: true
  }).trim();
  const commonAttributesPath = execFileSync(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-path', 'info/attributes'],
    { cwd: linked, encoding: 'utf8', windowsHide: true }
  ).trim();
  await mkdir(path.dirname(commonAttributesPath), { recursive: true });
  await writeFile(commonAttributesPath, 'index.html !filter\n');

  const observed = await stageSite({
    repositoryRoot: linked,
    environment: { ...environment, AI_TREE_COMMIT_SHA: head },
    checkOnly: true
  });
  assert.equal(observed.manifest.sourceState.repositoryAttributesIsolated, false);
  assert.equal(observed.manifest.sourceState.inputsMatchCommit, false);
  await assert.rejects(
    stageSite({
      repositoryRoot: linked,
      environment: { ...environment, AI_TREE_COMMIT_SHA: head, AI_TREE_REQUIRE_CLEAN: 'true' },
      checkOnly: true
    }),
    /repository-local Git attribute overrides are not allowed/u
  );
});

test('strict provenance disables Git replacement objects', async () => {
  const root = await makeRoot();
  await writeBaseFixture(root);
  execFileSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'user.name', 'stage-site-test'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'user.email', 'stage-site-test@example.invalid'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root, windowsHide: true });
  execFileSync('git', ['add', '--', '.'], { cwd: root, windowsHide: true });
  execFileSync('git', ['commit', '--quiet', '-m', 'original'], { cwd: root, windowsHide: true });
  const original = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  await write(root, 'index.html', '<!doctype html><title>Malicious replacement</title>\n');
  execFileSync('git', ['add', '--', 'index.html'], { cwd: root, windowsHide: true });
  execFileSync('git', ['commit', '--quiet', '-m', 'replacement'], { cwd: root, windowsHide: true });
  const replacement = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  execFileSync('git', ['checkout', '--quiet', '--detach', original], { cwd: root, windowsHide: true });
  execFileSync('git', ['replace', original, replacement], { cwd: root, windowsHide: true });
  await write(root, 'index.html', '<!doctype html><title>Malicious replacement</title>\n');

  await assert.rejects(
    stageSite({
      repositoryRoot: root,
      environment: { ...environment, AI_TREE_COMMIT_SHA: original, AI_TREE_REQUIRE_CLEAN: 'true' },
      checkOnly: true
    }),
    /clean git source tree is required|release input does not match or cannot be published/u
  );
});

test('requires repositoryRoot to be the canonical Git worktree top level', async () => {
  const parent = await makeRoot();
  const root = path.join(parent, 'nested');
  await mkdir(root, { recursive: true });
  await writeBaseFixture(root);
  execFileSync('git', ['init', '--quiet'], { cwd: parent, windowsHide: true });
  execFileSync('git', ['config', 'user.name', 'stage-site-test'], { cwd: parent, windowsHide: true });
  execFileSync('git', ['config', 'user.email', 'stage-site-test@example.invalid'], { cwd: parent, windowsHide: true });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: parent, windowsHide: true });
  execFileSync('git', ['add', '--', '.'], { cwd: parent, windowsHide: true });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: parent, windowsHide: true });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: parent, encoding: 'utf8', windowsHide: true }).trim();

  await assert.rejects(
    stageSite({
      repositoryRoot: root,
      environment: { ...environment, AI_TREE_COMMIT_SHA: head, AI_TREE_REQUIRE_CLEAN: 'true' },
      checkOnly: true
    }),
    /repository root must be the Git worktree top level/u
  );
});

test('rejects committed symlink modes and Git LFS pointers as release inputs', async () => {
  for (const mode of ['symlink', 'lfs']) {
    const root = await makeRoot();
    const config = baseConfig({
      artifacts: [{
        kind: 'file',
        source: mode === 'symlink' ? 'link.html' : 'image.png',
        target: mode === 'symlink' ? 'index.html' : 'social.png'
      }]
    });
    await writeBaseFixture(root, config);
    if (mode === 'symlink') await write(root, 'link.html', 'index.html');
    else {
      await write(root, '.gitattributes', 'image.png filter=lfs diff=lfs merge=lfs -text\n');
      await write(root, 'image.png', [
        'version https://git-lfs.github.com/spec/v1',
        `oid sha256:${'a'.repeat(64)}`,
        'size 1234',
        ''
      ].join('\n'));
    }
    execFileSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true });
    execFileSync('git', ['config', 'user.name', 'stage-site-test'], { cwd: root, windowsHide: true });
    execFileSync('git', ['config', 'user.email', 'stage-site-test@example.invalid'], { cwd: root, windowsHide: true });
    execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root, windowsHide: true });
    execFileSync('git', ['config', 'core.symlinks', 'false'], { cwd: root, windowsHide: true });
    execFileSync('git', ['add', '--', '.'], { cwd: root, windowsHide: true });
    if (mode === 'symlink') {
      const blob = execFileSync('git', ['hash-object', '-w', '--', 'link.html'], {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true
      }).trim();
      execFileSync('git', ['update-index', '--add', '--cacheinfo', `120000,${blob},link.html`], {
        cwd: root,
        windowsHide: true
      });
    }
    execFileSync('git', ['commit', '--quiet', '-m', mode], { cwd: root, windowsHide: true });
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();

    await assert.rejects(
      stageSite({
        repositoryRoot: root,
        environment: { ...environment, AI_TREE_COMMIT_SHA: head, AI_TREE_REQUIRE_CLEAN: 'true' },
        checkOnly: true
      }),
      mode === 'symlink' ? /Git mode 120000 is not a regular file/u : /Git LFS inputs are not supported/u,
      mode
    );
  }
});

test('tracked staged-output files are included in the clean-tree gate', async () => {
  const root = await makeRoot();
  await writeBaseFixture(root);
  await write(root, '_site/marker.txt', 'tracked output marker\n');
  execFileSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'user.name', 'stage-site-test'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'user.email', 'stage-site-test@example.invalid'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root, windowsHide: true });
  execFileSync('git', ['add', '--', '.'], { cwd: root, windowsHide: true });
  execFileSync('git', ['add', '--force', '--', '_site/marker.txt'], { cwd: root, windowsHide: true });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root, windowsHide: true });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  await write(root, '_site/marker.txt', 'modified output marker\n');

  await assert.rejects(
    stageSite({
      repositoryRoot: root,
      environment: { ...environment, AI_TREE_COMMIT_SHA: head, AI_TREE_REQUIRE_CLEAN: 'true' },
      checkOnly: true
    }),
    /clean git source tree is required/u
  );
});

test('clean-tree status overrides local submodule ignore settings', async () => {
  const root = await makeRoot();
  const child = await makeRoot();
  await writeBaseFixture(root);
  await write(child, 'tracked.txt', 'submodule original\n');
  for (const repository of [child, root]) {
    execFileSync('git', ['init', '--quiet'], { cwd: repository, windowsHide: true });
    execFileSync('git', ['config', 'user.name', 'stage-site-test'], { cwd: repository, windowsHide: true });
    execFileSync('git', ['config', 'user.email', 'stage-site-test@example.invalid'], { cwd: repository, windowsHide: true });
    execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: repository, windowsHide: true });
    execFileSync('git', ['add', '--', '.'], { cwd: repository, windowsHide: true });
    execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: repository, windowsHide: true });
  }
  execFileSync('git', [
    '-c',
    'protocol.file.allow=always',
    'submodule',
    'add',
    '--quiet',
    '--',
    child,
    'vendor'
  ], { cwd: root, windowsHide: true });
  execFileSync('git', ['commit', '--quiet', '-am', 'add submodule'], { cwd: root, windowsHide: true });
  execFileSync('git', ['config', 'submodule.vendor.ignore', 'all'], { cwd: root, windowsHide: true });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  await write(root, 'vendor/tracked.txt', 'submodule modified\n');
  assert.equal(
    execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true
    }).trim(),
    ''
  );

  await assert.rejects(
    stageSite({
      repositoryRoot: root,
      environment: { ...environment, AI_TREE_COMMIT_SHA: head, AI_TREE_REQUIRE_CLEAN: 'true' },
      checkOnly: true
    }),
    /clean git source tree is required/u
  );
});

test('rejects gitlinks and ignored empty directories used as directory artifacts', async () => {
  for (const mode of ['gitlink', 'ignored-empty']) {
    const root = await makeRoot();
    const config = baseConfig({
      artifacts: [{ kind: 'directory', source: 'vendor', target: 'vendor' }]
    });
    await writeBaseFixture(root, config);
    await mkdir(path.join(root, 'vendor'), { recursive: true });
    if (mode === 'ignored-empty') await write(root, '.gitignore', 'vendor/\n');
    execFileSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true });
    execFileSync('git', ['config', 'user.name', 'stage-site-test'], { cwd: root, windowsHide: true });
    execFileSync('git', ['config', 'user.email', 'stage-site-test@example.invalid'], { cwd: root, windowsHide: true });
    execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root, windowsHide: true });
    execFileSync('git', ['add', '--', '.'], { cwd: root, windowsHide: true });
    execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root, windowsHide: true });
    if (mode === 'gitlink') {
      const targetCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true
      }).trim();
      execFileSync('git', ['update-index', '--add', '--cacheinfo', `160000,${targetCommit},vendor`], {
        cwd: root,
        windowsHide: true
      });
      execFileSync('git', ['commit', '--quiet', '-m', 'gitlink'], { cwd: root, windowsHide: true });
    }
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();

    await assert.rejects(
      stageSite({
        repositoryRoot: root,
        environment: { ...environment, AI_TREE_COMMIT_SHA: head, AI_TREE_REQUIRE_CLEAN: 'true' },
        checkOnly: true
      }),
      mode === 'gitlink' ? /Git mode 160000 is not a committed directory/u : /Git mode missing is not a committed directory/u,
      mode
    );
  }
});

test('rejects stage-site temporary directories as configuration or artifact sources', async () => {
  const root = await makeRoot();
  const config = baseConfig({
    artifacts: [{ kind: 'file', source: '.stage-site-hostile/payload.html', target: 'index.html' }]
  });
  await writeBaseFixture(root, config);
  await write(root, '.stage-site-hostile/payload.html', '<!doctype html>hostile\n');

  await assert.rejects(stageSite({ repositoryRoot: root, environment }), /stage-site temporary directories/u);
  await assert.rejects(
    stageSite({ repositoryRoot: root, configPath: '.stage-site-hostile/config.json', environment }),
    /stage-site temporary directories/u
  );
});

test('rejects metadata, artifact, and configuration reads from generated or Git-admin paths', async () => {
  const root = await makeRoot();
  await writeBaseFixture(root);

  for (const [label, config, expected] of [
    ['metadata output', baseConfig({ metadata: {
      packageFile: '_SITE/package.json',
      packageLockFile: 'package-lock.json',
      datasetFile: 'data.json'
    } }), /metadata\.packageFile cannot read from _site/u],
    ['metadata temporary', baseConfig({ metadata: {
      packageFile: 'package.json',
      packageLockFile: '.stage-site-hostile/package-lock.json',
      datasetFile: 'data.json'
    } }), /metadata\.packageLockFile cannot read from stage-site temporary directories/u],
    ['artifact Git admin', baseConfig({ artifacts: [
      { kind: 'file', source: '.GIT/config', target: 'leak.txt' }
    ] }), /artifacts\[0\]\.source cannot read from Git administrative data/u]
  ]) {
    await write(root, 'config/pages-stage.v1.json', `${JSON.stringify(config, null, 2)}\n`);
    await assert.rejects(stageSite({ repositoryRoot: root, environment }), expected, label);
  }

  await assert.rejects(
    stageSite({ repositoryRoot: root, configPath: '.GIT/config', environment }),
    /config path cannot read from Git administrative data/u
  );
});
