#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildStableReleaseAssets } from './release-assets.mjs';
import { releaseSpecConstants } from './release-spec.mjs';

const SCRIPT_VERSION = '1.0.0';
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
const FIXTURE_VERSION = '1.2.3';
const FIXTURE_TAG = `v${FIXTURE_VERSION}`;
const FIXTURE_RELEASE_DATE = '2026-08-23';
const FIXTURE_EDITION = '2026-08-20-synthetic-test-only';
const FIXTURE_ASSET_STEM = 'ai-tree-synthetic-test-only-fixture-v1.2.3';
const FIXTURE_RELEASE_SPEC_PATH = 'config/releases/v1.2.3.json';
const FIXTURE_PROTECTED_MAIN_REF = releaseSpecConstants.policy.protectedMainRef;
const FIXTURE_COMMIT_TIMESTAMP = '1787227200';
const FIXTURE_TAG_TIMESTAMP = '1787497445';
const REQUIRED_NODE_VERSION = 'v24.14.1';
const REQUIRED_NPM_VERSION = '11.11.0';
const EXECUTED_RELEASE_TOOL_PATHS = Object.freeze([
  'scripts/release-assets.mjs',
  'scripts/release-ref.mjs',
  'scripts/release-spec.mjs',
  'scripts/stage-site.mjs',
  'scripts/strict-json.mjs'
]);

function fixtureError(message) {
  return new Error(`synthetic-stable-fixture: ${message}`);
}

function samePath(left, right) {
  const leftResolved = path.resolve(left);
  const rightResolved = path.resolve(right);
  return process.platform === 'win32'
    ? leftResolved.normalize('NFC').toLowerCase() === rightResolved.normalize('NFC').toLowerCase()
    : leftResolved === rightResolved;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function write(root, relativePath, contents) {
  const absolute = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, contents, { flag: 'wx', mode: 0o644 });
}

function isolatedGitEnvironment(overrides = {}) {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_'))
  );
  const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
  return {
    ...environment,
    GIT_ATTR_NOSYSTEM: '1',
    GIT_CONFIG_COUNT: '0',
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: nullDevice,
    GIT_DISCOVERY_ACROSS_FILESYSTEM: '0',
    GIT_NO_LAZY_FETCH: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    LANG: 'C',
    LC_ALL: 'C',
    ...overrides
  };
}

function assertAllowedLocalGitCommand(argumentsList) {
  const serialized = JSON.stringify(argumentsList);
  const exactCommands = new Set([
    JSON.stringify(['add', '--', '.']),
    JSON.stringify(['config', 'core.autocrlf', 'false']),
    JSON.stringify(['config', 'core.filemode', 'false']),
    JSON.stringify(['for-each-ref', '--format=%(refname)%00%(objectname)%00%(objecttype)']),
    JSON.stringify(['hash-object', '-t', 'commit', '-w', '--stdin']),
    JSON.stringify(['init', '--quiet', '--object-format=sha1', '--initial-branch=main']),
    JSON.stringify(['mktag']),
    JSON.stringify(['remote']),
    JSON.stringify(['remote', '-v']),
    JSON.stringify(['rev-parse', '--verify', 'HEAD']),
    JSON.stringify(['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none', '--', '.']),
    JSON.stringify(['write-tree'])
  ]);
  if (exactCommands.has(serialized)) return;
  if (
    argumentsList.length === 3 &&
    argumentsList[0] === 'update-ref' &&
    [
      'refs/heads/main',
      FIXTURE_PROTECTED_MAIN_REF,
      `refs/tags/${FIXTURE_TAG}`
    ].includes(argumentsList[1]) &&
    /^[0-9a-f]{40}$/u.test(argumentsList[2])
  ) {
    return;
  }
  if (
    argumentsList.length === 3 &&
    argumentsList[0] === 'ls-tree' &&
    argumentsList[1] === '-r' &&
    /^[0-9a-f]{40}$/u.test(argumentsList[2])
  ) {
    return;
  }
  throw fixtureError(`Git command is outside the local-only allowlist: ${argumentsList[0] || '(empty)'}`);
}

function git(repositoryRoot, argumentsList, { environment = {}, input = undefined } = {}) {
  assertAllowedLocalGitCommand(argumentsList);
  try {
    return execFileSync('git', [
      '--no-pager',
      '--no-replace-objects',
      '-c', 'core.fsmonitor=false',
      '-c', 'core.hooksPath=',
      '-c', 'core.pager=cat',
      ...argumentsList
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: isolatedGitEnvironment(environment),
      input,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    }).replace(/\r?\n$/u, '');
  } catch (error) {
    const stderr = Buffer.isBuffer(error.stderr)
      ? error.stderr.toString('utf8').trim()
      : String(error.stderr || '').trim();
    const detail = stderr === '' ? '' : `: ${stderr.split(/\r?\n/u)[0]}`;
    throw fixtureError(`local Git command failed (${argumentsList[0]})${detail}`);
  }
}

function assertToolchain() {
  const userAgent = typeof process.env.npm_config_user_agent === 'string'
    ? process.env.npm_config_user_agent
    : '';
  const npmMatch = /(?:^|\s)npm\/([^\s]+)/u.exec(userAgent);
  const npmExecutable = process.env.npm_execpath;
  if (typeof npmExecutable !== 'string' || !path.isAbsolute(npmExecutable)) {
    throw fixtureError('synthetic parity must run through an npm wrapper with an absolute npm_execpath');
  }
  let observedNpm;
  try {
    observedNpm = execFileSync(process.execPath, [npmExecutable, '--version'], {
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    }).trim();
  } catch (error) {
    throw fixtureError(`cannot observe npm through the active PATH: ${error.message}`);
  }
  if (
    npmMatch?.[1] !== observedNpm ||
    !/^v24\./u.test(process.version) ||
    !/^11\./u.test(observedNpm)
  ) {
    throw fixtureError('synthetic fixture requires a truthfully observed supported Node 24 and npm 11 toolchain');
  }
  if (process.version !== REQUIRED_NODE_VERSION || observedNpm !== REQUIRED_NPM_VERSION) {
    throw fixtureError(
      `synthetic parity requires exactly Node ${REQUIRED_NODE_VERSION} and npm ${REQUIRED_NPM_VERSION} through the npm wrapper`
    );
  }
  return Object.freeze({ node: process.version, npm: observedNpm });
}

function sourceControlSnapshot(repositoryRoot) {
  return Object.freeze({
    head: git(repositoryRoot, ['rev-parse', '--verify', 'HEAD']),
    refs: git(repositoryRoot, ['for-each-ref', '--format=%(refname)%00%(objectname)%00%(objecttype)']),
    remotes: git(repositoryRoot, ['remote', '-v']),
    status: git(repositoryRoot, [
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
      '--ignore-submodules=none',
      '--',
      '.'
    ])
  });
}

function assertSameSourceControlSnapshot(before, after) {
  if (
    before.head !== after.head ||
    before.refs !== after.refs ||
    before.remotes !== after.remotes ||
    before.status !== after.status
  ) {
    throw fixtureError('source repository HEAD, status, refs, or configured remotes changed during synthetic fixture construction');
  }
}

function assertFixtureHasNoRemotes(repositoryRoot) {
  if (git(repositoryRoot, ['remote']) !== '') {
    throw fixtureError('synthetic fixture repository must have zero configured remotes');
  }
}

function stableEnvironment() {
  return {
    npm_config_user_agent: process.env.npm_config_user_agent
  };
}

function fixtureReleaseSpec() {
  return {
    schemaVersion: '1.0.0',
    status: 'ready',
    tag: FIXTURE_TAG,
    version: FIXTURE_VERSION,
    edition: FIXTURE_EDITION,
    releaseDate: FIXTURE_RELEASE_DATE,
    releaseState: releaseSpecConstants.policy.releaseState,
    defaultBranch: releaseSpecConstants.policy.defaultBranch,
    protectedMainRef: FIXTURE_PROTECTED_MAIN_REF,
    productionEnvironment: releaseSpecConstants.policy.productionEnvironment,
    productionBaseUrl: releaseSpecConstants.policy.productionBaseUrl,
    prerelease: true,
    assetStem: FIXTURE_ASSET_STEM
  };
}

function fixtureStageConfig() {
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
      releaseFile: FIXTURE_RELEASE_SPEC_PATH
    },
    artifacts: [
      {
        kind: 'file',
        source: 'index.html',
        target: 'index.html',
        mediaType: 'text/html; charset=utf-8'
      },
      {
        kind: 'directory',
        source: 'public/data',
        target: 'data'
      }
    ],
    generatedFiles: [
      {
        target: '.nojekyll',
        contents: '',
        mediaType: 'application/octet-stream'
      }
    ]
  };
}

async function assertCanonicalExternalOutput(outputDirectory, sourceRoot) {
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0 || !path.isAbsolute(outputDirectory)) {
    throw fixtureError('--output-directory must be an explicit absolute path');
  }
  const requested = path.resolve(outputDirectory);
  if (requested !== path.normalize(outputDirectory)) {
    throw fixtureError('--output-directory must use its normalized canonical spelling');
  }
  const parent = path.dirname(requested);
  const canonicalParent = await realpath(parent);
  if (!samePath(parent, canonicalParent)) {
    throw fixtureError('--output-directory cannot traverse a symbolic-link or junction parent');
  }
  if (isInside(sourceRoot, requested)) {
    throw fixtureError('--output-directory must be outside the source repository');
  }
  try {
    await lstat(requested);
  } catch (error) {
    if (error.code === 'ENOENT') return { absolute: requested, parent: canonicalParent };
    throw fixtureError(`cannot inspect output directory: ${error.message}`);
  }
  throw fixtureError(`output directory already exists and will not be overwritten: ${requested}`);
}

async function createFixtureRepository(base, sourceRoot) {
  const repositoryRoot = path.join(base, 'synthetic-test-only-repository');
  await mkdir(repositoryRoot, { mode: 0o700 });
  await write(repositoryRoot, '.gitignore', '_site/\n.stage-site-*/\n');
  await write(repositoryRoot, '.gitattributes', '* -text\n');
  await write(repositoryRoot, 'package.json', `${JSON.stringify({
    name: 'ai-tree-synthetic-test-only-fixture',
    version: FIXTURE_VERSION,
    private: true
  }, null, 2)}\n`);
  await write(repositoryRoot, 'package-lock.json', `${JSON.stringify({
    name: 'ai-tree-synthetic-test-only-fixture',
    version: FIXTURE_VERSION,
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'ai-tree-synthetic-test-only-fixture',
        version: FIXTURE_VERSION
      }
    }
  }, null, 2)}\n`);
  await write(repositoryRoot, 'data.json', `${JSON.stringify({
    generatorVersion: '1.0.0-synthetic-test-only',
    dataset: {
      edition: FIXTURE_EDITION,
      releaseState: releaseSpecConstants.policy.releaseState,
      dataDigest: 'b'.repeat(64)
    }
  }, null, 2)}\n`);
  await write(repositoryRoot, 'CITATION.cff', [
    'cff-version: 1.2.0',
    'message: Synthetic test-only fixture; never cite, publish, or deploy.',
    'title: AI Research Tech Tree',
    'type: dataset',
    'authors:',
    '  - name: CI Fixture',
    `version: ${FIXTURE_VERSION}`,
    `date-released: ${FIXTURE_RELEASE_DATE}`,
    'repository-code: https://github.com/neb6dav/ai_tech_tree',
    `url: ${releaseSpecConstants.policy.productionBaseUrl}`,
    ''
  ].join('\n'));
  await write(repositoryRoot, 'CHANGELOG.md', [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '- Synthetic fixture follow-up excluded from the frozen fixture section.',
    '',
    `## [${FIXTURE_VERSION}] - ${FIXTURE_RELEASE_DATE}`,
    '',
    '> Synthetic test-only fixture; never cite, publish, or deploy.',
    '',
    '### Added',
    '',
    '- Cross-platform stable-asset byte-parity fixture.',
    '- Offline bundle verification fixture.',
    '',
    '## [1.2.2] - 2026-08-01',
    '',
    '- Prior synthetic fixture.',
    ''
  ].join('\n'));
  await write(repositoryRoot, FIXTURE_RELEASE_SPEC_PATH, `${JSON.stringify(fixtureReleaseSpec(), null, 2)}\n`);
  await write(repositoryRoot, 'config/pages-stage.v1.json', `${JSON.stringify(fixtureStageConfig(), null, 2)}\n`);
  await write(repositoryRoot, 'index.html', [
    '<!doctype html>',
    '<meta charset="utf-8">',
    '<title>Synthetic test-only fixture</title>',
    '<p>Synthetic test-only fixture; never cite, publish, or deploy.</p>',
    ''
  ].join('\n'));
  await write(repositoryRoot, 'public/data/a.json', '{"fixture":"synthetic-test-only","order":"a"}\n');
  await write(repositoryRoot, 'public/data/z.json', '{"fixture":"synthetic-test-only","order":"z"}\n');
  for (const toolPath of EXECUTED_RELEASE_TOOL_PATHS) {
    const source = path.resolve(sourceRoot, ...toolPath.split('/'));
    const canonicalSource = await realpath(source);
    const sourceStat = await lstat(source);
    if (!samePath(source, canonicalSource) || !sourceStat.isFile() || sourceStat.isSymbolicLink()) {
      throw fixtureError(`release tool source must be a canonical regular file: ${toolPath}`);
    }
    await write(repositoryRoot, toolPath, await readFile(source));
  }

  git(repositoryRoot, ['init', '--quiet', '--object-format=sha1', '--initial-branch=main']);
  git(repositoryRoot, ['config', 'core.autocrlf', 'false']);
  git(repositoryRoot, ['config', 'core.filemode', 'false']);
  assertFixtureHasNoRemotes(repositoryRoot);
  git(repositoryRoot, ['add', '--', '.']);
  const tree = git(repositoryRoot, ['write-tree']);
  const treeEntries = git(repositoryRoot, ['ls-tree', '-r', tree]).split(/\r?\n/u).filter(Boolean);
  if (treeEntries.length === 0 || treeEntries.some(entry => !entry.startsWith('100644 blob '))) {
    throw fixtureError('synthetic fixture tree must contain only regular 100644 blobs');
  }
  const identity = 'synthetic-stable-fixture <synthetic-stable-fixture@example.invalid>';
  const commitBytes = Buffer.from([
    `tree ${tree}`,
    `author ${identity} ${FIXTURE_COMMIT_TIMESTAMP} +0000`,
    `committer ${identity} ${FIXTURE_COMMIT_TIMESTAMP} +0000`,
    '',
    'Synthetic test-only stable fixture',
    ''
  ].join('\n'), 'utf8');
  const commit = git(repositoryRoot, ['hash-object', '-t', 'commit', '-w', '--stdin'], { input: commitBytes });
  git(repositoryRoot, ['update-ref', 'refs/heads/main', commit]);
  git(repositoryRoot, ['update-ref', FIXTURE_PROTECTED_MAIN_REF, commit]);
  const tagBytes = Buffer.from([
    `object ${commit}`,
    'type commit',
    `tag ${FIXTURE_TAG}`,
    `tagger ${identity} ${FIXTURE_TAG_TIMESTAMP} +0000`,
    '',
    'Synthetic test-only stable fixture',
    ''
  ].join('\n'), 'utf8');
  const tagObject = git(repositoryRoot, ['mktag'], { input: tagBytes });
  git(repositoryRoot, ['update-ref', `refs/tags/${FIXTURE_TAG}`, tagObject]);
  assertFixtureHasNoRemotes(repositoryRoot);
  return { repositoryRoot, commit, tagObject };
}

export async function buildSyntheticStableFixture({
  outputDirectory,
  sourceRepositoryRoot = SOURCE_REPOSITORY_ROOT
} = {}) {
  const sourceRequested = path.resolve(sourceRepositoryRoot);
  const sourceRoot = await realpath(sourceRequested);
  if (!samePath(sourceRequested, sourceRoot)) {
    throw fixtureError('source repository root must use its canonical filesystem spelling');
  }
  assertToolchain();
  const sourceControlBefore = sourceControlSnapshot(sourceRoot);
  const output = await assertCanonicalExternalOutput(outputDirectory, sourceRoot);
  const base = await mkdtemp(path.join(output.parent, '.ai-tree-synthetic-stable-'));
  const ownedBundle = path.join(base, 'owned-stable-assets');
  let failure = null;
  let requestedOutputOwned = false;
  try {
    if (isInside(base, output.absolute)) {
      throw fixtureError('--output-directory must be outside the temporary fixture repository');
    }
    const fixture = await createFixtureRepository(base, sourceRoot);
    const result = await buildStableReleaseAssets({
      repositoryRoot: fixture.repositoryRoot,
      commit: fixture.commit,
      outputDirectory: ownedBundle,
      tag: FIXTURE_TAG,
      releaseSpecPath: FIXTURE_RELEASE_SPEC_PATH,
      protectedMainRef: FIXTURE_PROTECTED_MAIN_REF,
      environment: stableEnvironment()
    });
    if (result.tagObject !== fixture.tagObject) {
      throw fixtureError('stable builder did not preserve the synthetic annotated-tag object');
    }
    assertFixtureHasNoRemotes(fixture.repositoryRoot);
    assertSameSourceControlSnapshot(sourceControlBefore, sourceControlSnapshot(sourceRoot));
    await mkdir(output.absolute, { mode: 0o700 });
    requestedOutputOwned = true;
    for (const file of result.files) {
      const source = path.join(ownedBundle, file.name);
      const sourceStat = await lstat(source);
      if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
        throw fixtureError(`owned stable output is not a regular file: ${file.name}`);
      }
      const bytes = await readFile(source);
      if (bytes.byteLength !== file.bytes) {
        throw fixtureError(`owned stable output size changed before handoff: ${file.name}`);
      }
      await writeFile(path.join(output.absolute, file.name), bytes, { flag: 'wx', mode: 0o644 });
    }
    return Object.freeze({
      ...result,
      outputDirectory: output.absolute,
      fixture: 'synthetic-test-only',
      fixtureBuilderVersion: SCRIPT_VERSION
    });
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    let snapshotFailure = null;
    try {
      assertSameSourceControlSnapshot(sourceControlBefore, sourceControlSnapshot(sourceRoot));
    } catch (error) {
      snapshotFailure = error;
    }
    let cleanupFailure = null;
    try {
      await rm(base, { recursive: true, force: true });
    } catch (error) {
      cleanupFailure = error;
    }
    if ((failure !== null || snapshotFailure !== null || cleanupFailure !== null) && requestedOutputOwned) {
      await rm(output.absolute, { recursive: true, force: true });
    }
    const finalizationFailure = snapshotFailure ?? cleanupFailure;
    if (finalizationFailure !== null) {
      if (failure !== null) {
        throw new AggregateError(
          [failure, finalizationFailure],
          'synthetic-stable-fixture: fixture build failed and source control state also changed'
        );
      }
      throw finalizationFailure;
    }
  }
}

function usage() {
  return [
    'Usage: node scripts/synthetic-stable-fixture.mjs --output-directory <absolute-new-path>',
    '',
    'Builds a local annotated-tag fixture and four deterministic stable-asset files.',
    'The fixture and outputs are synthetic test-only material; never publish or deploy them.',
    'This command performs no network requests and does not mutate the source repository.'
  ].join('\n');
}

function parseArguments(argumentsList) {
  if (argumentsList.includes('--help') || argumentsList.includes('-h')) return { help: true };
  let outputDirectory;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument !== '--output-directory') throw fixtureError(`unknown argument: ${argument}`);
    if (outputDirectory !== undefined) throw fixtureError('--output-directory may be supplied only once');
    index += 1;
    if (index >= argumentsList.length || argumentsList[index].startsWith('--')) {
      throw fixtureError('--output-directory requires a value');
    }
    outputDirectory = argumentsList[index];
  }
  if (outputDirectory === undefined) throw fixtureError('--output-directory is required');
  return { help: false, outputDirectory };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await buildSyntheticStableFixture(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isEntrypoint) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

export const syntheticStableFixtureConstants = Object.freeze({
  assetStem: FIXTURE_ASSET_STEM,
  edition: FIXTURE_EDITION,
  releaseDate: FIXTURE_RELEASE_DATE,
  releaseSpecPath: FIXTURE_RELEASE_SPEC_PATH,
  requiredNodeVersion: REQUIRED_NODE_VERSION,
  requiredNpmVersion: REQUIRED_NPM_VERSION,
  scriptVersion: SCRIPT_VERSION,
  tag: FIXTURE_TAG,
  version: FIXTURE_VERSION
});
