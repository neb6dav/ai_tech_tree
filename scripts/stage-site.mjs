#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_VERSION = '1.2.0';
const RELEASE_MANIFEST_SCHEMA_VERSION = '1.2.0';
const CONFIG_SCHEMA_VERSION = '1.0.0';
const DEFAULT_CONFIG_PATH = 'config/pages-stage.v1.json';
const REQUIRED_OUTPUT_DIRECTORY = '_site';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');

const MEDIA_TYPES = new Map([
  ['.cff', 'text/yaml; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.csv', 'text/csv; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.htm', 'text/html; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.jsonld', 'application/ld+json'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.ndjson', 'application/x-ndjson'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.webp', 'image/webp'],
  ['.xml', 'application/xml; charset=utf-8']
]);

function stageError(message) {
  return new Error(`stage-site: ${message}`);
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw stageError(`${label} must be an object`);
  }
}

function assertOnlyKeys(value, allowedKeys, label) {
  assertObject(value, label);
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length > 0) {
    throw stageError(`${label} has unsupported keys: ${unknown.sort().join(', ')}`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw stageError(`${label} must be a non-empty, trimmed string without control characters`);
  }
  return value;
}

export function normalizeManifestPath(value, label = 'path') {
  assertNonEmptyString(value, label);
  if (value.includes('\\')) throw stageError(`${label} must use forward slashes`);
  if (path.posix.isAbsolute(value) || /^[A-Za-z]:/u.test(value)) {
    throw stageError(`${label} must be repository-relative`);
  }
  const normalized = path.posix.normalize(value);
  const segments = value.split('/');
  if (
    normalized !== value ||
    value === '.' ||
    value.endsWith('/') ||
    segments.some(segment => segment === '' || segment === '.' || segment === '..')
  ) {
    throw stageError(`${label} is not a canonical relative path: ${value}`);
  }
  for (const segment of segments) {
    if (!/^[A-Za-z0-9._~-]+$/u.test(segment)) {
      throw stageError(
        `${label} contains a non-portable path segment: ${segment}; ` +
        'published paths may use only ASCII letters, digits, dot, underscore, hyphen, and tilde'
      );
    }
    if (segment.endsWith('.') || segment.endsWith(' ')) {
      throw stageError(`${label} contains a segment with a trailing dot or space: ${segment}`);
    }
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment)) {
      throw stageError(`${label} contains a Windows-reserved device name: ${segment}`);
    }
  }
  return value;
}

function resolveInside(root, relativePath, label) {
  const absolute = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, absolute);
  if (relative === '' || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw stageError(`${label} escapes its allowed root: ${relativePath}`);
  }
  return absolute;
}

function caseFold(value) {
  return value.normalize('NFC').toLowerCase();
}

function isReservedOutputPath(value) {
  const firstSegment = String(value).split('/', 1)[0];
  return caseFold(firstSegment) === caseFold(REQUIRED_OUTPUT_DIRECTORY);
}

function isReservedTemporaryPath(value) {
  const firstSegment = caseFold(String(value).split('/', 1)[0]);
  return firstSegment.startsWith('.stage-site-');
}

function isGitAdministrativePath(value) {
  const firstSegment = String(value).split('/', 1)[0];
  return caseFold(firstSegment) === '.git';
}

function assertPermittedRepositoryInputPath(value, label) {
  if (isReservedOutputPath(value)) {
    throw stageError(`${label} cannot read from ${REQUIRED_OUTPUT_DIRECTORY}`);
  }
  if (isReservedTemporaryPath(value)) {
    throw stageError(`${label} cannot read from stage-site temporary directories`);
  }
  if (isGitAdministrativePath(value)) {
    throw stageError(`${label} cannot read from Git administrative data`);
  }
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function mediaTypeForPath(filePath) {
  if (path.posix.basename(filePath) === '.nojekyll') return 'application/octet-stream';
  return MEDIA_TYPES.get(path.posix.extname(filePath).toLowerCase()) || 'application/octet-stream';
}

async function readJsonFile(absolutePath, label) {
  let bytes;
  try {
    bytes = await readFile(absolutePath);
  } catch (error) {
    throw stageError(`cannot read ${label}: ${error.message}`);
  }
  try {
    return { bytes, document: JSON.parse(bytes.toString('utf8')) };
  } catch (error) {
    throw stageError(`${label} is not valid JSON: ${error.message}`);
  }
}

function validateMediaType(value, label) {
  return assertNonEmptyString(value, label);
}

export function validateStageConfig(config) {
  assertOnlyKeys(
    config,
    ['schemaVersion', 'outputDirectory', 'releaseManifest', 'metadata', 'artifacts', 'generatedFiles'],
    'configuration'
  );
  if (config.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    throw stageError(`configuration schemaVersion must be ${CONFIG_SCHEMA_VERSION}`);
  }
  if (config.outputDirectory !== REQUIRED_OUTPUT_DIRECTORY) {
    throw stageError(`outputDirectory must be exactly ${REQUIRED_OUTPUT_DIRECTORY}`);
  }
  normalizeManifestPath(config.outputDirectory, 'outputDirectory');
  normalizeManifestPath(config.releaseManifest, 'releaseManifest');
  if (config.releaseManifest !== 'release-manifest.json') {
    throw stageError('releaseManifest must be exactly release-manifest.json');
  }

  assertOnlyKeys(config.metadata, ['packageFile', 'packageLockFile', 'datasetFile'], 'metadata');
  normalizeManifestPath(config.metadata.packageFile, 'metadata.packageFile');
  normalizeManifestPath(config.metadata.packageLockFile, 'metadata.packageLockFile');
  normalizeManifestPath(config.metadata.datasetFile, 'metadata.datasetFile');
  assertPermittedRepositoryInputPath(config.metadata.packageFile, 'metadata.packageFile');
  assertPermittedRepositoryInputPath(config.metadata.packageLockFile, 'metadata.packageLockFile');
  assertPermittedRepositoryInputPath(config.metadata.datasetFile, 'metadata.datasetFile');

  if (!Array.isArray(config.artifacts) || config.artifacts.length === 0) {
    throw stageError('artifacts must be a non-empty array');
  }
  config.artifacts.forEach((artifact, index) => {
    const label = `artifacts[${index}]`;
    assertOnlyKeys(artifact, ['kind', 'source', 'target', 'mediaType'], label);
    if (artifact.kind !== 'file' && artifact.kind !== 'directory') {
      throw stageError(`${label}.kind must be file or directory`);
    }
    normalizeManifestPath(artifact.source, `${label}.source`);
    normalizeManifestPath(artifact.target, `${label}.target`);
    assertPermittedRepositoryInputPath(artifact.source, `${label}.source`);
    if (artifact.mediaType !== undefined) {
      validateMediaType(artifact.mediaType, `${label}.mediaType`);
      const expectedMediaType = mediaTypeForPath(artifact.target);
      if (artifact.kind === 'file' && artifact.mediaType !== expectedMediaType) {
        throw stageError(
          `${label}.mediaType must match the canonical type for ${artifact.target}: ${expectedMediaType}`
        );
      }
    }
    if (artifact.kind === 'directory' && artifact.mediaType !== undefined) {
      throw stageError(`${label}.mediaType is only valid for file artifacts`);
    }
  });

  if (!Array.isArray(config.generatedFiles)) throw stageError('generatedFiles must be an array');
  config.generatedFiles.forEach((generated, index) => {
    const label = `generatedFiles[${index}]`;
    assertOnlyKeys(generated, ['target', 'contents', 'mediaType'], label);
    normalizeManifestPath(generated.target, `${label}.target`);
    if (typeof generated.contents !== 'string') throw stageError(`${label}.contents must be a string`);
    validateMediaType(generated.mediaType, `${label}.mediaType`);
    const expectedMediaType = mediaTypeForPath(generated.target);
    if (generated.mediaType !== expectedMediaType) {
      throw stageError(
        `${label}.mediaType must match the canonical type for ${generated.target}: ${expectedMediaType}`
      );
    }
  });

  return config;
}

async function assertPathComponentsAreSafe(root, relativePath, label) {
  let current = root;
  let finalStat = null;
  for (const segment of relativePath.split('/')) {
    current = path.join(current, segment);
    try {
      finalStat = await lstat(current);
    } catch (error) {
      if (error.code === 'ENOENT') throw stageError(`${label} is missing: ${relativePath}`);
      throw stageError(`cannot inspect ${label} ${relativePath}: ${error.message}`);
    }
    if (finalStat.isSymbolicLink()) {
      throw stageError(`${label} contains a symbolic link or junction: ${relativePath}`);
    }
  }
  return finalStat;
}

async function addDirectoryFiles(plan, repositoryRoot, sourceRelative, targetRelative) {
  const sourceAbsolute = resolveInside(repositoryRoot, sourceRelative, 'directory source');
  const entries = await readdir(sourceAbsolute, { withFileTypes: true });
  entries.sort((left, right) => compareText(left.name, right.name));

  for (const entry of entries) {
    const childSource = `${sourceRelative}/${entry.name}`;
    const childTarget = `${targetRelative}/${entry.name}`;
    normalizeManifestPath(childSource, 'directory child source');
    normalizeManifestPath(childTarget, 'directory child target');
    if (entry.isSymbolicLink()) {
      throw stageError(`directory source contains a symbolic link or junction: ${childSource}`);
    }
    if (entry.isDirectory()) {
      await addDirectoryFiles(plan, repositoryRoot, childSource, childTarget);
    } else if (entry.isFile()) {
      plan.push({
        sourceAbsolute: resolveInside(repositoryRoot, childSource, 'file source'),
        sourceRelative: childSource,
        target: childTarget,
        mediaType: mediaTypeForPath(childTarget),
        generatedContents: null
      });
    } else {
      throw stageError(`directory source contains an unsupported filesystem entry: ${childSource}`);
    }
  }
}

function validatePlanTargets(plan, releaseManifestPath) {
  const byFoldedTarget = new Map();
  for (const item of plan) {
    if (caseFold(item.target) === caseFold(releaseManifestPath)) {
      throw stageError(`staged target is reserved for the release manifest: ${item.target}`);
    }
    const folded = caseFold(item.target);
    const existing = byFoldedTarget.get(folded);
    if (existing) {
      throw stageError(`staged target collision between ${existing.target} and ${item.target}`);
    }
    byFoldedTarget.set(folded, item);
  }

  for (const item of plan) {
    const segments = item.target.split('/');
    for (let length = 1; length < segments.length; length += 1) {
      const ancestor = caseFold(segments.slice(0, length).join('/'));
      const conflictingFile = byFoldedTarget.get(ancestor);
      if (conflictingFile) {
        throw stageError(`staged file/directory collision between ${conflictingFile.target} and ${item.target}`);
      }
    }
  }
}

async function collectCopyPlan(repositoryRoot, config) {
  const plan = [];
  const directoryRequirements = [];
  for (let index = 0; index < config.artifacts.length; index += 1) {
    const artifact = config.artifacts[index];
    const sourceStat = await assertPathComponentsAreSafe(repositoryRoot, artifact.source, `artifacts[${index}].source`);
    if (artifact.kind === 'file') {
      if (!sourceStat.isFile()) throw stageError(`artifacts[${index}].source must be a regular file`);
      plan.push({
        sourceAbsolute: resolveInside(repositoryRoot, artifact.source, 'file source'),
        sourceRelative: artifact.source,
        target: artifact.target,
        mediaType: artifact.mediaType || mediaTypeForPath(artifact.target),
        generatedContents: null
      });
    } else {
      if (!sourceStat.isDirectory()) throw stageError(`artifacts[${index}].source must be a directory`);
      const firstFileIndex = plan.length;
      await addDirectoryFiles(plan, repositoryRoot, artifact.source, artifact.target);
      directoryRequirements.push({
        path: artifact.source,
        filePaths: plan.slice(firstFileIndex).map(item => item.sourceRelative).sort(compareText)
      });
    }
  }

  for (const generated of config.generatedFiles) {
    plan.push({
      sourceAbsolute: null,
      sourceRelative: null,
      target: generated.target,
      mediaType: generated.mediaType,
      generatedContents: generated.contents
    });
  }

  validatePlanTargets(plan, config.releaseManifest);
  plan.sort((left, right) => compareText(left.target, right.target));
  directoryRequirements.sort((left, right) => compareText(left.path, right.path));
  return { plan, directoryRequirements };
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function hydratePlan(plan) {
  const hydrated = [];
  for (const item of plan) {
    let bytes;
    if (item.generatedContents !== null) {
      bytes = Buffer.from(item.generatedContents, 'utf8');
    } else {
      try {
        bytes = await readFile(item.sourceAbsolute);
      } catch (error) {
        throw stageError(`cannot read staged source ${item.sourceRelative}: ${error.message}`);
      }
    }
    hydrated.push({ ...item, bytes, sha256: sha256(bytes) });
  }
  return hydrated;
}

function gitOutput(repositoryRoot, args) {
  try {
    return execFileSync('git', args, {
      cwd: repositoryRoot,
      env: gitEnvironment(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    }).trim();
  } catch {
    return null;
  }
}

function gitBuffer(repositoryRoot, args) {
  try {
    return execFileSync('git', args, {
      cwd: repositoryRoot,
      env: gitEnvironment(),
      encoding: null,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024
    });
  } catch {
    return null;
  }
}

function gitEnvironment() {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_'))
  );
  environment.GIT_NO_REPLACE_OBJECTS = '1';
  return environment;
}

function firstEnvironmentValue(environment, names) {
  for (const name of names) {
    const value = environment[name];
    if (typeof value === 'string' && value.trim() !== '') return { name, value: value.trim() };
  }
  return null;
}

function resolveCommit(repositoryRoot, environment) {
  const configured = firstEnvironmentValue(environment, ['AI_TREE_COMMIT_SHA', 'GITHUB_SHA', 'CI_COMMIT_SHA']);
  const commit = configured ? configured.value : gitOutput(repositoryRoot, ['rev-parse', 'HEAD']);
  if (!commit) throw stageError('commit is unavailable from the environment and git fallback');
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(commit)) {
    throw stageError(`commit must be a full 40- or 64-character hexadecimal git object ID: ${commit}`);
  }
  return commit.toLowerCase();
}

function requiredCleanSource(environment) {
  const raw = environment.AI_TREE_REQUIRE_CLEAN;
  if (raw == null || String(raw).trim() === '' || /^(?:0|false|no)$/iu.test(String(raw).trim())) return false;
  if (/^(?:1|true|yes)$/iu.test(String(raw).trim())) return true;
  throw stageError('AI_TREE_REQUIRE_CLEAN must be true/false, yes/no, or 1/0 when set');
}

function normalizeInputSnapshots(inputSnapshots) {
  const byPath = new Map();
  for (const snapshot of inputSnapshots) {
    const relativePath = normalizeManifestPath(snapshot.path, 'release input path');
    const bytes = Buffer.from(snapshot.bytes);
    const digest = sha256(bytes);
    const previous = byPath.get(relativePath);
    if (previous && previous.sha256 !== digest) {
      throw stageError(`release input changed while staging: ${relativePath}`);
    }
    if (!previous) byPath.set(relativePath, { path: relativePath, bytes, sha256: digest });
  }
  return [...byPath.values()].sort((left, right) => compareText(left.path, right.path));
}

function isGitLfsPointer(bytes) {
  const text = Buffer.from(bytes).subarray(0, 1024).toString('utf8');
  return /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\n/mu.test(text) &&
    /^oid sha256:[0-9a-f]{64}\r?$/imu.test(text) &&
    /^size [0-9]+\r?$/mu.test(text);
}

function parseGitTreeEntries(bytes) {
  if (bytes == null) return null;
  return bytes.toString('utf8').split('\0').filter(Boolean).map(record => {
    const match = /^([0-7]{6})\s+([^\s]+)\s+([0-9a-f]+)\t(.+)$/u.exec(record);
    return match ? { mode: match[1], type: match[2], object: match[3], path: match[4] } : null;
  }).filter(Boolean);
}

function verifyInputsAtCommit(repositoryRoot, commit, inputSnapshots, directoryRequirements) {
  const fileResults = inputSnapshots.map(snapshot => {
    const treeEntry = gitOutput(repositoryRoot, ['ls-tree', commit, '--', snapshot.path]);
    const treeMode = treeEntry?.match(/^([0-7]{6})\s/u)?.[1] || null;
    const committedBytes = gitBuffer(repositoryRoot, ['cat-file', 'blob', `${commit}:${snapshot.path}`]);
    const committedSha256 = committedBytes == null ? null : sha256(committedBytes);
    const filterAttribute = gitOutput(repositoryRoot, [
      'check-attr',
      `--source=${commit}`,
      'filter',
      '--',
      snapshot.path
    ]);
    const usesGitLfs = /:\s*filter:\s*lfs\s*$/iu.test(filterAttribute || '') ||
      (committedBytes != null && isGitLfsPointer(committedBytes));
    const publishableMode = treeMode === '100644' || treeMode === '100755';
    const contentMatches = committedSha256 === snapshot.sha256;
    const reason = !publishableMode
      ? `Git mode ${treeMode || 'missing'} is not a regular file`
      : usesGitLfs
        ? 'Git LFS inputs are not supported by deterministic staging'
        : !contentMatches
          ? 'working bytes differ from the committed blob'
          : null;
    return {
      path: snapshot.path,
      currentSha256: snapshot.sha256,
      committedSha256,
      treeMode,
      usesGitLfs,
      contentMatches,
      reason,
      matches: contentMatches && publishableMode && !usesGitLfs
    };
  });

  const directoryResults = directoryRequirements.map(requirement => {
    const rootEntry = gitOutput(repositoryRoot, ['ls-tree', commit, '--', requirement.path]);
    const rootMode = rootEntry?.match(/^([0-7]{6})\s/u)?.[1] || null;
    const committedEntries = parseGitTreeEntries(
      gitBuffer(repositoryRoot, ['ls-tree', '-r', '-z', commit, '--', requirement.path])
    ) || [];
    const committedPaths = committedEntries.map(entry => entry.path).sort(compareText);
    const unsafeEntry = committedEntries.find(entry => entry.mode !== '100644' && entry.mode !== '100755');
    const entrySetMatches = JSON.stringify(committedPaths) === JSON.stringify(requirement.filePaths);
    const matches = rootMode === '040000' && !unsafeEntry && entrySetMatches;
    const reason = rootMode !== '040000'
      ? `Git mode ${rootMode || 'missing'} is not a committed directory`
      : unsafeEntry
        ? `directory contains non-regular Git mode ${unsafeEntry.mode} at ${unsafeEntry.path}`
        : !entrySetMatches
          ? 'working directory file set differs from the committed recursive tree'
          : null;
    return {
      path: requirement.path,
      rootMode,
      fileCount: requirement.filePaths.length,
      committedFileCount: committedPaths.length,
      matches,
      reason
    };
  });
  const verificationRows = [
    ...fileResults.map(result => (
      `file\t${result.path}\t${result.currentSha256}\t${result.committedSha256 || 'missing'}\t` +
      `${result.treeMode || 'missing'}\t${result.usesGitLfs ? 'lfs' : 'plain'}\t${result.matches ? 'match' : 'mismatch'}`
    )),
    ...directoryResults.map(result => (
      `directory\t${result.path}\t${result.rootMode || 'missing'}\t${result.fileCount}\t` +
      `${result.committedFileCount}\t${result.matches ? 'match' : 'mismatch'}`
    ))
  ];
  const mismatches = [
    ...fileResults.filter(result => !result.matches),
    ...directoryResults.filter(result => !result.matches)
  ];
  return {
    inputCount: fileResults.length,
    matchedInputCount: fileResults.filter(result => result.matches).length,
    directorySourceCount: directoryResults.length,
    matchedDirectorySourceCount: directoryResults.filter(result => result.matches).length,
    inputsMatchCommit: mismatches.length === 0,
    inputVerificationSha256: sha256(Buffer.from(verificationRows.join('\n'), 'utf8')),
    mismatches
  };
}

function resolveIndexFlags(repositoryRoot) {
  const output = gitBuffer(repositoryRoot, ['ls-files', '-v', '-z']);
  if (output == null) return null;
  const records = output.toString('utf8').split('\0').filter(Boolean);
  const flagged = records.filter(record => {
    const tag = record[0] || '';
    return tag === 'S' || tag === 's' || /^[a-z]$/u.test(tag);
  });
  return {
    flagged,
    flaggedEntryCount: flagged.length,
    flagsSha256: sha256(Buffer.from(flagged.sort(compareText).join('\n'), 'utf8'))
  };
}

function resolveSourceState(repositoryRoot, environment, commit, rawInputSnapshots, directoryRequirements) {
  const requireClean = requiredCleanSource(environment);
  const inputSnapshots = normalizeInputSnapshots(rawInputSnapshots);
  const topLevel = gitOutput(repositoryRoot, ['rev-parse', '--show-toplevel']);
  const head = gitOutput(repositoryRoot, ['rev-parse', 'HEAD']);
  const indexFlags = resolveIndexFlags(repositoryRoot);
  const status = gitOutput(repositoryRoot, [
    '-c',
    'core.fsmonitor=false',
    '-c',
    'core.ignoreStat=false',
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--ignore-submodules=none',
    '--',
    '.'
  ]);

  if (topLevel == null || head == null || indexFlags == null || status == null) {
    if (requireClean) {
      throw stageError('a clean git source tree is required, but repository state is unavailable');
    }
    return {
      kind: 'unavailable',
      clean: null,
      requiredClean: false,
      repositoryTopLevel: null,
      repositoryRootMatchesTopLevel: null,
      head: null,
      commitMatchesHead: null,
      changedEntryCount: null,
      statusSha256: null,
      flaggedIndexEntryCount: null,
      indexFlagsSha256: null,
      inputCount: inputSnapshots.length,
      matchedInputCount: null,
      directorySourceCount: directoryRequirements.length,
      matchedDirectorySourceCount: null,
      inputsMatchCommit: null,
      inputVerificationSha256: null
    };
  }

  const resolvedTopLevel = path.resolve(topLevel);
  const rootMatchesTopLevel = process.platform === 'win32'
    ? caseFold(resolvedTopLevel) === caseFold(repositoryRoot)
    : resolvedTopLevel === repositoryRoot;
  if (!rootMatchesTopLevel) {
    throw stageError(
      `repository root must be the Git worktree top level; received ${repositoryRoot}, Git reports ${resolvedTopLevel}`
    );
  }

  const normalizedHead = head.toLowerCase();
  const entries = status === '' ? [] : status.split(/\r?\n/u);
  const clean = entries.length === 0 && indexFlags.flaggedEntryCount === 0;
  const commitMatchesHead = normalizedHead === commit;
  if (requireClean && !clean) {
    throw stageError(
      'a clean git source tree is required; found ' +
      `${entries.length} changed entr${entries.length === 1 ? 'y' : 'ies'} and ` +
      `${indexFlags.flaggedEntryCount} assume-unchanged or skip-worktree index entr` +
      `${indexFlags.flaggedEntryCount === 1 ? 'y' : 'ies'}`
    );
  }
  if (requireClean && !commitMatchesHead) {
    throw stageError(`advertised commit ${commit} does not match checked-out HEAD ${normalizedHead}`);
  }
  const inputVerification = verifyInputsAtCommit(repositoryRoot, commit, inputSnapshots, directoryRequirements);
  if (requireClean && !inputVerification.inputsMatchCommit) {
    const examples = inputVerification.mismatches
      .slice(0, 5)
      .map(item => `${item.path} (${item.reason})`)
      .join(', ');
    const remainder = inputVerification.mismatches.length > 5
      ? ` and ${inputVerification.mismatches.length - 5} more`
      : '';
    throw stageError(
      `${inputVerification.mismatches.length} release input${inputVerification.mismatches.length === 1 ? '' : 's'} ` +
      `${inputVerification.mismatches.length === 1 ? 'does' : 'do'} not match or cannot be published from ` +
      `advertised commit ${commit}: ` +
      `${examples}${remainder}`
    );
  }
  return {
    kind: 'git',
    clean,
    requiredClean: requireClean,
    repositoryTopLevel: '.',
    repositoryRootMatchesTopLevel: rootMatchesTopLevel,
    head: normalizedHead,
    commitMatchesHead,
    changedEntryCount: entries.length,
    statusSha256: sha256(Buffer.from(status, 'utf8')),
    flaggedIndexEntryCount: indexFlags.flaggedEntryCount,
    indexFlagsSha256: indexFlags.flagsSha256,
    inputCount: inputVerification.inputCount,
    matchedInputCount: inputVerification.matchedInputCount,
    directorySourceCount: inputVerification.directorySourceCount,
    matchedDirectorySourceCount: inputVerification.matchedDirectorySourceCount,
    inputsMatchCommit: inputVerification.inputsMatchCommit,
    inputVerificationSha256: inputVerification.inputVerificationSha256
  };
}

function resolveTag(repositoryRoot, environment) {
  const explicit = firstEnvironmentValue(environment, ['AI_TREE_RELEASE_TAG']);
  let tag = explicit?.value || null;
  if (!tag && environment.GITHUB_REF_TYPE === 'tag' && typeof environment.GITHUB_REF_NAME === 'string') {
    tag = environment.GITHUB_REF_NAME.trim();
  }
  if (!tag && typeof environment.GITHUB_REF === 'string' && environment.GITHUB_REF.startsWith('refs/tags/')) {
    tag = environment.GITHUB_REF.slice('refs/tags/'.length).trim();
  }
  if (!tag) return null;
  return assertNonEmptyString(tag, 'release tag');
}

function npmVersionFromEnvironment(environment) {
  const userAgent = typeof environment.npm_config_user_agent === 'string' ? environment.npm_config_user_agent : '';
  const match = /(?:^|\s)npm\/([^\s]+)/u.exec(userAgent);
  return match ? match[1] : null;
}

async function buildReleaseMetadata(
  repositoryRoot,
  config,
  environment,
  configPath,
  configBytes,
  hydratedPlan,
  directoryRequirements
) {
  const packageAbsolute = resolveInside(repositoryRoot, config.metadata.packageFile, 'package metadata path');
  const lockAbsolute = resolveInside(repositoryRoot, config.metadata.packageLockFile, 'package-lock metadata path');
  const datasetAbsolute = resolveInside(repositoryRoot, config.metadata.datasetFile, 'dataset metadata path');
  await assertPathComponentsAreSafe(repositoryRoot, config.metadata.packageFile, 'metadata.packageFile');
  await assertPathComponentsAreSafe(repositoryRoot, config.metadata.packageLockFile, 'metadata.packageLockFile');
  await assertPathComponentsAreSafe(repositoryRoot, config.metadata.datasetFile, 'metadata.datasetFile');

  const packageFile = await readJsonFile(packageAbsolute, 'package metadata');
  const packageLockFile = await readJsonFile(lockAbsolute, 'package-lock metadata');
  const datasetFile = await readJsonFile(datasetAbsolute, 'dataset metadata');
  const packageDocument = packageFile.document;
  const packageLockDocument = packageLockFile.document;
  const datasetDocument = datasetFile.document;
  const version = assertNonEmptyString(packageDocument.version, 'package version');
  const edition = assertNonEmptyString(datasetDocument.dataset?.edition, 'dataset edition');
  const releaseState = assertNonEmptyString(datasetDocument.dataset?.releaseState, 'dataset releaseState');
  const generatorVersion = assertNonEmptyString(datasetDocument.generatorVersion, 'dataset generatorVersion');
  const dataDigest = datasetDocument.dataset?.dataDigest ?? null;
  if (dataDigest !== null && !/^[0-9a-f]{64}$/iu.test(dataDigest)) {
    throw stageError('dataset dataDigest must be a SHA-256 hexadecimal digest when present');
  }

  const commit = resolveCommit(repositoryRoot, environment);
  const inputSnapshots = [
    { path: configPath, bytes: configBytes },
    { path: config.metadata.packageFile, bytes: packageFile.bytes },
    { path: config.metadata.packageLockFile, bytes: packageLockFile.bytes },
    { path: config.metadata.datasetFile, bytes: datasetFile.bytes },
    ...hydratedPlan
      .filter(item => item.sourceRelative !== null)
      .map(item => ({ path: item.sourceRelative, bytes: item.bytes }))
  ];
  return {
    edition,
    version,
    releaseState,
    commit,
    tag: resolveTag(repositoryRoot, environment),
    sourceState: resolveSourceState(
      repositoryRoot,
      environment,
      commit,
      inputSnapshots,
      directoryRequirements
    ),
    generatorVersion,
    dataDigest: dataDigest?.toLowerCase() || null,
    toolchain: {
      node: process.version,
      npm: npmVersionFromEnvironment(environment),
      packageLockVersion: packageLockDocument.lockfileVersion ?? null,
      stageSite: SCRIPT_VERSION
    }
  };
}

function buildReleaseManifest(config, metadata, hydratedPlan, configPath, configSha256) {
  const files = hydratedPlan.map(item => ({
    path: item.target,
    mediaType: item.mediaType,
    bytes: item.bytes.byteLength,
    sha256: item.sha256
  }));
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  return {
    schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION,
    stageConfigVersion: config.schemaVersion,
    stageConfig: {
      path: configPath,
      sha256: configSha256
    },
    edition: metadata.edition,
    version: metadata.version,
    releaseState: metadata.releaseState,
    commit: metadata.commit,
    tag: metadata.tag,
    sourceState: metadata.sourceState,
    generatorVersion: metadata.generatorVersion,
    dataDigest: metadata.dataDigest,
    toolchain: metadata.toolchain,
    manifest: {
      path: config.releaseManifest,
      selfHashExcluded: true,
      filesCoverage: 'all-payload-files',
      filesExcluded: [config.releaseManifest]
    },
    fileCount: files.length,
    totalBytes,
    files
  };
}

async function inspectOutputForSafeReplacement(outputAbsolute) {
  let outputStat;
  try {
    outputStat = await lstat(outputAbsolute);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw stageError(`cannot inspect existing ${REQUIRED_OUTPUT_DIRECTORY}: ${error.message}`);
  }
  if (outputStat.isSymbolicLink()) {
    throw stageError(`${REQUIRED_OUTPUT_DIRECTORY} is a symbolic link or junction and will not be replaced`);
  }
  if (!outputStat.isDirectory()) {
    throw stageError(`${REQUIRED_OUTPUT_DIRECTORY} exists but is not a directory`);
  }

  async function rejectLinks(directoryAbsolute, relative = REQUIRED_OUTPUT_DIRECTORY) {
    const entries = await readdir(directoryAbsolute, { withFileTypes: true });
    for (const entry of entries) {
      const childRelative = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        throw stageError(`${REQUIRED_OUTPUT_DIRECTORY} contains a symbolic link or junction: ${childRelative}`);
      }
      if (entry.isDirectory()) await rejectLinks(path.join(directoryAbsolute, entry.name), childRelative);
    }
  }
  await rejectLinks(outputAbsolute);
  return true;
}

async function writeStagedTree(repositoryRoot, config, hydratedPlan, manifest) {
  const outputAbsolute = resolveInside(repositoryRoot, config.outputDirectory, 'output directory');
  const outputExists = await inspectOutputForSafeReplacement(outputAbsolute);

  const temporaryParent = await mkdtemp(path.join(repositoryRoot, '.stage-site-'));
  const temporaryOutput = path.join(temporaryParent, REQUIRED_OUTPUT_DIRECTORY);
  const backupOutput = path.join(temporaryParent, 'previous-site');
  let preserveTemporaryParent = false;
  try {
    await mkdir(temporaryOutput, { recursive: false });
    for (const item of hydratedPlan) {
      const destination = resolveInside(temporaryOutput, item.target, 'staged target');
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, item.bytes, { flag: 'wx' });
    }
    const manifestDestination = resolveInside(temporaryOutput, config.releaseManifest, 'release manifest target');
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeFile(manifestDestination, manifestText, { encoding: 'utf8', flag: 'wx' });

    if (outputExists) await rename(outputAbsolute, backupOutput);
    try {
      await rename(temporaryOutput, outputAbsolute);
    } catch (publishError) {
      if (outputExists) {
        try {
          await rename(backupOutput, outputAbsolute);
        } catch (restoreError) {
          preserveTemporaryParent = true;
          throw stageError(
            `cannot publish the new staged tree (${publishError.message}) or restore the previous tree ` +
            `(${restoreError.message}); recovery copy retained at ${path.relative(repositoryRoot, backupOutput).replaceAll(path.sep, '/')}`
          );
        }
      }
      throw stageError(`cannot publish the new staged tree: ${publishError.message}`);
    }
    if (outputExists) await rm(backupOutput, { recursive: true, force: true });
  } finally {
    if (!preserveTemporaryParent) await rm(temporaryParent, { recursive: true, force: true });
  }
  return outputAbsolute;
}

export async function stageSite({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  configPath = DEFAULT_CONFIG_PATH,
  environment = process.env,
  checkOnly = false
} = {}) {
  const requestedRoot = path.resolve(repositoryRoot);
  let resolvedRoot;
  try {
    resolvedRoot = await realpath(requestedRoot);
  } catch (error) {
    throw stageError(`repository root is unavailable: ${error.message}`);
  }
  normalizeManifestPath(configPath, 'config path');
  assertPermittedRepositoryInputPath(configPath, 'config path');
  await assertPathComponentsAreSafe(resolvedRoot, configPath, 'config path');
  const configAbsolute = resolveInside(resolvedRoot, configPath, 'config path');
  const configFile = await readJsonFile(configAbsolute, 'stage configuration');
  const config = validateStageConfig(configFile.document);
  const { plan, directoryRequirements } = await collectCopyPlan(resolvedRoot, config);
  const hydratedPlan = await hydratePlan(plan);
  const metadata = await buildReleaseMetadata(
    resolvedRoot,
    config,
    environment,
    configPath,
    configFile.bytes,
    hydratedPlan,
    directoryRequirements
  );
  const manifest = buildReleaseManifest(config, metadata, hydratedPlan, configPath, sha256(configFile.bytes));

  const outputAbsolute = checkOnly
    ? resolveInside(resolvedRoot, config.outputDirectory, 'output directory')
    : await writeStagedTree(resolvedRoot, config, hydratedPlan, manifest);

  return {
    status: checkOnly ? 'VALID' : 'STAGED',
    repositoryRoot: resolvedRoot,
    config: configPath,
    outputDirectory: outputAbsolute,
    releaseManifest: path.join(outputAbsolute, config.releaseManifest),
    fileCount: manifest.fileCount,
    totalBytes: manifest.totalBytes,
    manifest
  };
}

function usage() {
  return [
    'Usage: node scripts/stage-site.mjs [--config <repo-relative-path>] [--check]',
    '',
    `Default config: ${DEFAULT_CONFIG_PATH}`,
    `Output: ${REQUIRED_OUTPUT_DIRECTORY}/ (always repository-local)`,
    '',
    '--check validates and hashes all inputs without changing the output directory.'
  ].join('\n');
}

function parseArguments(argumentsList) {
  let configPath = DEFAULT_CONFIG_PATH;
  let checkOnly = false;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--help' || argument === '-h') return { help: true, configPath, checkOnly };
    if (argument === '--check') {
      checkOnly = true;
      continue;
    }
    if (argument === '--config') {
      index += 1;
      if (index >= argumentsList.length) throw stageError('--config requires a path');
      configPath = argumentsList[index];
      continue;
    }
    throw stageError(`unknown argument: ${argument}`);
  }
  return { help: false, configPath, checkOnly };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await stageSite({ configPath: options.configPath, checkOnly: options.checkOnly });
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    config: result.config,
    outputDirectory: path.relative(result.repositoryRoot, result.outputDirectory).replaceAll(path.sep, '/'),
    releaseManifest: path.relative(result.repositoryRoot, result.releaseManifest).replaceAll(path.sep, '/'),
    fileCount: result.fileCount,
    totalBytes: result.totalBytes,
    commit: result.manifest.commit,
    tag: result.manifest.tag,
    sourceState: result.manifest.sourceState,
    dataDigest: result.manifest.dataDigest
  }, null, 2)}\n`);
}

const executedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (executedPath === import.meta.url) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export const stageSiteConstants = Object.freeze({
  configSchemaVersion: CONFIG_SCHEMA_VERSION,
  defaultConfigPath: DEFAULT_CONFIG_PATH,
  outputDirectory: REQUIRED_OUTPUT_DIRECTORY,
  releaseManifestSchemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION,
  scriptVersion: SCRIPT_VERSION
});
