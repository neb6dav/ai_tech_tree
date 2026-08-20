import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  access,
  copyFile,
  cp,
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
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildSyntheticStableFixture,
  syntheticStableFixtureConstants
} from '../scripts/synthetic-stable-fixture.mjs';
import { verifyStableBundle } from '../scripts/verify-stable-bundle.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_SCRIPT = path.join(REPOSITORY_ROOT, 'scripts', 'synthetic-stable-fixture.mjs');
const VERIFIER_SCRIPT = path.join(REPOSITORY_ROOT, 'scripts', 'verify-stable-bundle.mjs');
const STEM = syntheticStableFixtureConstants.assetStem;
const OBSERVED_NPM = /(?:^|\s)npm\/([^\s]+)/u.exec(process.env.npm_config_user_agent || '')?.[1];
assert.equal(process.version, 'v24.14.1', 'stable-bundle tests require exact Node v24.14.1');
assert.equal(OBSERVED_NPM, '11.11.0', 'stable-bundle tests must run through the exact npm 11.11.0 wrapper');
const NAMES = Object.freeze({
  archive: `${STEM}.tar`,
  checksums: `${STEM}.SHA256SUMS`,
  manifest: `${STEM}.release-manifest.json`,
  notes: `${STEM}.notes.md`
});
const RELEASE_TOOL_PATHS = Object.freeze([
  'scripts/release-assets.mjs',
  'scripts/release-ref.mjs',
  'scripts/release-spec.mjs',
  'scripts/stage-site.mjs',
  'scripts/strict-json.mjs'
]);

let temporaryRoot;
let bundleOne;
let bundleTwo;
let extractionParent;
let firstBuild;
let secondBuild;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function localGit(repositoryRoot, argumentsList, environment = {}) {
  const result = spawnSync('git', argumentsList, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
    windowsHide: true
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function sourceControlSnapshot(repositoryRoot) {
  return {
    head: localGit(repositoryRoot, ['rev-parse', '--verify', 'HEAD']),
    refs: localGit(repositoryRoot, ['for-each-ref', '--format=%(refname)%00%(objectname)%00%(objecttype)']),
    remotes: localGit(repositoryRoot, ['remote', '-v']),
    status: localGit(repositoryRoot, ['status', '--porcelain=v1', '--untracked-files=all'])
  };
}

async function readBundle(directory) {
  const names = (await readdir(directory)).sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  return new Map(await Promise.all(names.map(async name => [name, await readFile(path.join(directory, name))])));
}

async function cloneBundle(label) {
  const destination = path.join(temporaryRoot, label);
  await cp(bundleOne, destination, { recursive: true, errorOnExist: true, force: false });
  return destination;
}

async function rewriteChecksums(directory) {
  const names = [NAMES.notes, NAMES.manifest, NAMES.archive].sort((left, right) => (
    Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
  ));
  const lines = [];
  for (const name of names) lines.push(`${sha256(await readFile(path.join(directory, name)))}  ${name}\n`);
  await writeFile(path.join(directory, NAMES.checksums), lines.join(''), { flag: 'w' });
}

function readOctal(bytes, start, length) {
  return Number.parseInt(bytes.subarray(start, start + length).toString('ascii').replace(/[\0 ]+$/gu, ''), 8);
}

function recomputeHeaderChecksum(archive, offset) {
  const header = archive.subarray(offset, offset + 512);
  header.fill(0x20, 148, 156);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const field = Buffer.from(`${checksum.toString(8).padStart(6, '0')}\0 `, 'ascii');
  field.copy(header, 148);
}

function setHeaderAscii(archive, offset, start, length, value) {
  const bytes = Buffer.from(value, 'ascii');
  assert.ok(bytes.byteLength <= length);
  archive.fill(0, offset + start, offset + start + length);
  bytes.copy(archive, offset + start);
  recomputeHeaderChecksum(archive, offset);
}

function archiveOffsets(archive) {
  const offsets = [];
  let offset = 0;
  while (offset < archive.byteLength - 1024) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const size = readOctal(header, 124, 12);
    offsets.push({ offset, size, dataStart: offset + 512 });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return offsets;
}

async function mutateArchive(label, mutate) {
  const directory = await cloneBundle(label);
  const archivePath = path.join(directory, NAMES.archive);
  const archive = Buffer.from(await readFile(archivePath));
  mutate(archive);
  await writeFile(archivePath, archive, { flag: 'w' });
  await rewriteChecksums(directory);
  return directory;
}

async function mutateManifest(label, mutate) {
  const directory = await cloneBundle(label);
  const manifestPath = path.join(directory, NAMES.manifest);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  mutate(manifest);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'w' });
  await rewriteChecksums(directory);
  return directory;
}

function verifyTestBundle(bundleDirectory, options = {}) {
  return verifyStableBundle({
    bundleDirectory,
    requireSyntheticTestOnly: true,
    ...options
  });
}

before(async () => {
  const temporaryParent = await realpath(os.tmpdir());
  temporaryRoot = await mkdtemp(path.join(temporaryParent, 'ai-tree-stable-bundle-test-'));
  bundleOne = path.join(temporaryRoot, 'bundle-one');
  bundleTwo = path.join(temporaryRoot, 'bundle-two');
  extractionParent = path.join(temporaryRoot, 'extraction-parent');
  await mkdir(extractionParent);
  firstBuild = await buildSyntheticStableFixture({ outputDirectory: bundleOne });
  secondBuild = await buildSyntheticStableFixture({ outputDirectory: bundleTwo });
});

after(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
});

test('synthetic builder creates deterministic exact four-file stable bundles without source mutation', async () => {
  assert.equal(firstBuild.fixture, 'synthetic-test-only');
  assert.equal(firstBuild.commit, secondBuild.commit);
  assert.equal(firstBuild.tagObject, secondBuild.tagObject);
  assert.match(firstBuild.commit, /^[0-9a-f]{40}$/u);
  assert.match(firstBuild.tagObject, /^[0-9a-f]{40}$/u);
  const first = await readBundle(bundleOne);
  const second = await readBundle(bundleTwo);
  assert.deepEqual([...first.keys()], [NAMES.checksums, NAMES.notes, NAMES.manifest, NAMES.archive].sort());
  assert.deepEqual([...first.keys()], [...second.keys()]);
  for (const name of first.keys()) assert.ok(first.get(name).equals(second.get(name)), `${name} must be deterministic`);
});

test('offline verifier closes checksums, manifest, notes, archive, and removed temporary extraction', async () => {
  const report = await verifyTestBundle(bundleOne, {
    temporaryParent: extractionParent
  });
  assert.equal(report.status, 'VALID');
  assert.equal(report.fixture, 'synthetic-test-only');
  assert.equal(report.fileCount, 4);
  assert.equal(report.archiveEntryCount, 5);
  assert.match(report.commit, /^[0-9a-f]{40}$/u);
  assert.match(report.tagObject, /^[0-9a-f]{40}$/u);
  assert.deepEqual(await readdir(extractionParent), [], 'temporary extraction must be removed');
});

test('verifier CLI reports the synthetic bundle without network or extraction residue', async () => {
  const result = spawnSync(process.execPath, [
    VERIFIER_SCRIPT,
    '--bundle-directory', bundleOne,
    '--require-synthetic-test-only'
  ], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'VALID');
  assert.equal(report.extraction, 'verified-in-removed-temporary-directory');
});

test('verifier canonicalizes only its internal temporary default and rejects caller aliases', async () => {
  const canonicalParent = path.join(temporaryRoot, 'canonical-extraction-parent');
  const aliasedParent = path.join(temporaryRoot, 'aliased-extraction-parent');
  await mkdir(canonicalParent);
  await symlink(canonicalParent, aliasedParent, process.platform === 'win32' ? 'junction' : 'dir');
  const temporaryEnvironment = process.platform === 'win32'
    ? { ...process.env, TEMP: aliasedParent, TMP: aliasedParent }
    : { ...process.env, TMPDIR: aliasedParent };
  const internalDefault = spawnSync(process.execPath, [
    VERIFIER_SCRIPT,
    '--bundle-directory', bundleOne,
    '--require-synthetic-test-only'
  ], { encoding: 'utf8', env: temporaryEnvironment, windowsHide: true });
  assert.equal(internalDefault.status, 0, internalDefault.stderr);
  await assert.rejects(
    verifyTestBundle(bundleOne, { temporaryParent: aliasedParent }),
    /temporary extraction parent must use its canonical filesystem spelling/u
  );
  assert.deepEqual(await readdir(canonicalParent), [], 'rejected caller aliases must leave no extraction residue');
});

test('builder rejects a falsified npm wrapper identity before creating output', async () => {
  const output = path.join(temporaryRoot, 'wrong-toolchain-output');
  const result = spawnSync(process.execPath, [
    FIXTURE_SCRIPT,
    '--output-directory', output
  ], {
    encoding: 'utf8',
    env: { ...process.env, npm_config_user_agent: 'npm/11.10.0 node/v24.14.1 synthetic-test' },
    windowsHide: true
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /truthfully observed supported Node 24 and npm 11 toolchain/u);
  await assert.rejects(access(output), { code: 'ENOENT' });
});

test('failing fixture construction preserves source HEAD, status, refs, and remotes and publishes no output', async () => {
  const sourceRoot = path.join(temporaryRoot, 'failing-source-repository');
  await mkdir(path.join(sourceRoot, 'scripts'), { recursive: true });
  for (const relativePath of RELEASE_TOOL_PATHS) {
    await copyFile(path.join(REPOSITORY_ROOT, ...relativePath.split('/')), path.join(sourceRoot, ...relativePath.split('/')));
  }
  await writeFile(path.join(sourceRoot, 'scripts', 'release-assets.mjs'), '\n// deliberate source-tool mismatch\n', { flag: 'a' });
  localGit(sourceRoot, ['init', '--quiet', '--object-format=sha1', '--initial-branch=main']);
  localGit(sourceRoot, ['config', 'user.name', 'failure-fixture']);
  localGit(sourceRoot, ['config', 'user.email', 'failure-fixture@example.invalid']);
  localGit(sourceRoot, ['config', 'core.autocrlf', 'false']);
  localGit(sourceRoot, ['add', '--', '.']);
  localGit(sourceRoot, ['commit', '--quiet', '-m', 'Failure fixture'], {
    GIT_AUTHOR_DATE: '2026-08-20T12:00:00+00:00',
    GIT_COMMITTER_DATE: '2026-08-20T12:00:00+00:00'
  });
  const beforeState = sourceControlSnapshot(sourceRoot);
  const output = path.join(temporaryRoot, 'failing-source-output');
  await assert.rejects(
    buildSyntheticStableFixture({
      outputDirectory: output,
      sourceRepositoryRoot: sourceRoot
    }),
    /executing release tool does not match the advertised commit/u
  );
  assert.deepEqual(sourceControlSnapshot(sourceRoot), beforeState);
  await assert.rejects(access(output), { code: 'ENOENT' });
});

test('verifier rejects changed content when SHA256SUMS is stale', async () => {
  const directory = await cloneBundle('stale-checksum');
  await writeFile(path.join(directory, NAMES.notes), '\nchanged\n', { flag: 'a' });
  await assert.rejects(
    verifyTestBundle(directory),
    /checksum does not match/u
  );
});

test('verifier rejects notes whose synthetic warning no longer closes over identity', async () => {
  const directory = await cloneBundle('bad-notes');
  const notesPath = path.join(directory, NAMES.notes);
  const notes = (await readFile(notesPath, 'utf8')).replace(
    '> Synthetic test-only fixture; never cite, publish, or deploy.',
    '> Stable release.'
  );
  await writeFile(notesPath, notes, { flag: 'w' });
  await rewriteChecksums(directory);
  await assert.rejects(
    verifyTestBundle(directory),
    /synthetic test-only warning/u
  );
});

test('verifier rejects notes whose local-only non-attestation statement is removed', async () => {
  const directory = await cloneBundle('missing-non-attestation');
  const notesPath = path.join(directory, NAMES.notes);
  const notes = (await readFile(notesPath, 'utf8')).replace(
    '> Locally verified artifact package. These files do not attest a GitHub Release, an environment approval, a deployment, or public post-deployment verification.\n\n',
    ''
  );
  await writeFile(notesPath, notes, { flag: 'w' });
  await rewriteChecksums(directory);
  await assert.rejects(
    verifyTestBundle(directory),
    /local-only non-attestation statement/u
  );
});

test('verifier rejects a standalone manifest that is not byte-identical inside the archive', async () => {
  const directory = await cloneBundle('standalone-manifest-drift');
  const manifestPath = path.join(directory, NAMES.manifest);
  await writeFile(manifestPath, `${await readFile(manifestPath, 'utf8')}\n`, { flag: 'w' });
  await rewriteChecksums(directory);
  await assert.rejects(
    verifyTestBundle(directory),
    /archived release manifest is not byte-identical/u
  );
});

test('verifier rejects malformed or cross-date annotated-tag manifest proof', async t => {
  const scenarios = [
    ['tagged-at syntax', manifest => { manifest.promotion.taggedAt = '2026-08-23Z'; }],
    ['tagged-at date', manifest => { manifest.promotion.taggedAt = '2026-08-24T15:04:05+00:00'; }],
    ['tag object length', manifest => { manifest.promotion.tagObject = 'a'.repeat(64); }],
    ['protected commit mismatch', manifest => { manifest.promotion.protectedMainCommit = 'a'.repeat(40); }]
  ];
  for (const [label, mutate] of scenarios) {
    await t.test(label, async () => {
      const directory = await mutateManifest(`proof-${label.replaceAll(' ', '-')}`, mutate);
      await assert.rejects(
        verifyTestBundle(directory),
        /annotated-tag proof|exact SHA-1|gitObjectFormat/u
      );
    });
  }
});

test('verifier rejects synthetic manifest schema, policy, toolchain, and identity drift', async t => {
  const scenarios = [
    ['manifest schema', manifest => { manifest.schemaVersion = '1.5.0'; }, /unknown release-manifest/u],
    ['generator version', manifest => { manifest.generatorVersion = {}; }, /generatorVersion/u],
    ['stage digest', manifest => { manifest.stageConfig.sha256 = 'a'.repeat(64); }, /exact locked synthetic-test-only identity/u],
    ['release spec path', manifest => { manifest.releaseSpec.path = 'config/releases/v9.9.9.json'; }, /ready release specification/u],
    ['release spec policy', manifest => { manifest.releaseSpec.productionEnvironment = 'production'; }, /ready release specification/u],
    ['tool version', manifest => { manifest.toolchain.stageSite = '9.0.0'; }, /supported Node 24/u],
    [
      'Node patch',
      manifest => { manifest.toolchain.node = process.version === 'v24.99.99' ? 'v24.99.98' : 'v24.99.99'; },
      /exactly Node v24\./u
    ],
    ['edition', manifest => { manifest.edition = '2026-08-20-other'; }, /top-level identity/u]
  ];
  for (const [label, mutate, expected] of scenarios) {
    await t.test(label, async () => {
      const directory = await mutateManifest(`manifest-${label.replaceAll(' ', '-')}`, mutate);
      await assert.rejects(
        verifyTestBundle(directory),
        expected
      );
    });
  }
});

test('verifier rejects unsupported deployment, release, and provenance claims anywhere in the manifest', async t => {
  const scenarios = [
    ['top-level deployment', manifest => { manifest.deployment = { status: 'published' }; }],
    ['GitHub Release claim', manifest => { manifest.promotion.githubReleasePublished = true; }],
    ['release-spec claim', manifest => { manifest.releaseSpec.releaseUrl = 'https://example.invalid/release'; }],
    ['source-state claim', manifest => { manifest.sourceState.reviewed = true; }],
    ['toolchain claim', manifest => { manifest.toolchain.runner = 'trusted'; }],
    ['self-coverage claim', manifest => { manifest.manifest.complete = true; }],
    ['file-record claim', manifest => { manifest.files[0].deployed = true; }]
  ];
  for (const [label, mutate] of scenarios) {
    await t.test(label, async () => {
      const directory = await mutateManifest(`unsupported-${label.replaceAll(' ', '-')}`, mutate);
      await assert.rejects(
        verifyTestBundle(directory),
        /missing or unsupported fields/u
      );
    });
  }
});

test('verifier rejects malformed source-state counts, digests, roots, and object-format closure', async t => {
  const scenarios = [
    ['input count type', manifest => { manifest.sourceState.inputCount = 'bogus'; }, /safe inputCount inventory/u],
    ['matched count type', manifest => { manifest.sourceState.matchedInputCount = 'bogus'; }, /safe inputCount inventory/u],
    ['negative tree count', manifest => { manifest.sourceState.trackedTreeEntryCount = -1; }, /positive safe integer/u],
    ['repository root', manifest => { manifest.sourceState.repositoryTopLevel = 'elsewhere'; }, /strict clean committed source closure/u],
    ['object format', manifest => { manifest.sourceState.gitObjectFormat = 'sha512'; }, /strict clean committed source closure/u],
    ['status digest', manifest => { manifest.sourceState.statusSha256 = 'bogus'; }, /lowercase SHA-256 digest/u],
    ['mixed object IDs', manifest => { manifest.promotion.tagObject = 'a'.repeat(64); }, /gitObjectFormat/u]
  ];
  for (const [label, mutate, expected] of scenarios) {
    await t.test(label, async () => {
      const directory = await mutateManifest(`source-${label.replaceAll(' ', '-')}`, mutate);
      await assert.rejects(verifyTestBundle(directory), expected);
    });
  }
});

test('verifier rejects USTAR traversal before extracting outside its temporary root', async () => {
  const directory = await mutateArchive('archive-traversal', archive => {
    setHeaderAscii(archive, 0, 0, 100, `${STEM}/../escape.txt`);
  });
  const escapePath = path.join(extractionParent, 'escape.txt');
  await assert.rejects(
    verifyTestBundle(directory, {
      temporaryParent: extractionParent
    }),
    /canonical portable relative path|non-portable path segment/u
  );
  await assert.rejects(access(escapePath), { code: 'ENOENT' });
  assert.deepEqual(await readdir(extractionParent), []);
});

test('verifier rejects identical malformed USTAR headers and metadata', async t => {
  const scenarios = [
    ['typeflag', archive => {
      archive[156] = 0x32;
      recomputeHeaderChecksum(archive, 0);
    }, /regular-file entries/u],
    ['linkname', archive => {
      archive[157] = 0x78;
      recomputeHeaderChecksum(archive, 0);
    }, /nonzero linkname/u],
    ['uname', archive => {
      archive[265] = 0x78;
      recomputeHeaderChecksum(archive, 0);
    }, /nonzero uname/u],
    ['device metadata', archive => {
      archive[329] = 0x31;
      recomputeHeaderChecksum(archive, 0);
    }, /nonzero device major/u],
    ['reserved header', archive => {
      archive[500] = 0x78;
      recomputeHeaderChecksum(archive, 0);
    }, /nonzero reserved header/u],
    ['header checksum', archive => { archive[148] = archive[148] === 0x30 ? 0x31 : 0x30; }, /header checksum does not match/u]
    ,
    ['noncanonical octal', archive => {
      Buffer.from('00000000', 'ascii').copy(archive, 108);
      recomputeHeaderChecksum(archive, 0);
    }, /canonical USTAR octal/u],
    ['noncanonical name prefix', archive => {
      setHeaderAscii(archive, 0, 0, 100, '.nojekyll');
      setHeaderAscii(archive, 0, 345, 155, STEM);
    }, /canonical USTAR name\/prefix split/u]
  ];
  for (const [label, mutate, expected] of scenarios) {
    await t.test(label, async () => {
      const directory = await mutateArchive(`archive-${label.replaceAll(' ', '-')}`, mutate);
      await assert.rejects(
        verifyTestBundle(directory),
        expected
      );
    });
  }
});

test('verifier rejects USTAR padding, terminal blocks, and manifest inventory drift', async t => {
  await t.test('nonzero padding', async () => {
    const directory = await mutateArchive('archive-padding', archive => {
      const entry = archiveOffsets(archive).find(candidate => candidate.size > 0 && candidate.size % 512 !== 0);
      assert.ok(entry);
      archive[entry.dataStart + entry.size] = 1;
    });
    await assert.rejects(
      verifyTestBundle(directory),
      /nonzero padding/u
    );
  });
  await t.test('terminal blocks', async () => {
    const directory = await mutateArchive('archive-terminal', archive => { archive[archive.length - 1] = 1; });
    await assert.rejects(
      verifyTestBundle(directory),
      /exactly two zero blocks/u
    );
  });
  await t.test('inventory drift', async () => {
    const directory = await mutateArchive('archive-inventory', archive => {
      const offsets = archiveOffsets(archive);
      assert.ok(offsets.length > 1);
      const headerOffset = offsets[1].offset;
      const header = archive.subarray(headerOffset, headerOffset + 512);
      const nul = header.subarray(0, 100).indexOf(0);
      const original = header.subarray(0, nul).toString('ascii');
      assert.match(original, /a\.json$/u);
      setHeaderAscii(archive, headerOffset, 0, 100, original.replace(/a\.json$/u, 'x.json'));
    });
    await assert.rejects(
      verifyTestBundle(directory),
      /archive inventory does not close/u
    );
  });
});

test('CLI help labels synthetic fixture output and verifier as local offline tooling', () => {
  const fixtureHelp = spawnSync(process.execPath, [FIXTURE_SCRIPT, '--help'], { encoding: 'utf8', windowsHide: true });
  const verifierHelp = spawnSync(process.execPath, [VERIFIER_SCRIPT, '--help'], { encoding: 'utf8', windowsHide: true });
  assert.equal(fixtureHelp.status, 0, fixtureHelp.stderr);
  assert.equal(verifierHelp.status, 0, verifierHelp.stderr);
  assert.match(fixtureHelp.stdout, /synthetic test-only material; never publish or deploy/u);
  assert.match(fixtureHelp.stdout, /performs no network requests/u);
  assert.match(verifierHelp.stdout, /No network is used/u);
});
