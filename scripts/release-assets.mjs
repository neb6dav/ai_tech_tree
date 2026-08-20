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
  stat,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { normalizeManifestPath, stageSite, stageSiteConstants } from './stage-site.mjs';
import { verifyReleaseRef } from './release-ref.mjs';
import { parseStrictJson } from './strict-json.mjs';

const SCRIPT_VERSION = '1.1.0';
const ARCHIVE_FORMAT = 'ustar';
const ARCHIVE_BLOCK_SIZE = 512;
const ARCHIVE_END_BLOCK_COUNT = 2;
const ARCHIVE_FILE_MODE = 0o644;
const MAX_ARCHIVE_FILE_COUNT = 4096;
const MAX_ARCHIVE_FILE_BYTES = 16 * 1024 * 1024;
const MAX_ARCHIVE_TOTAL_BYTES = 64 * 1024 * 1024;
const DEFAULT_CONFIG_PATH = stageSiteConstants.defaultConfigPath;
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
const EXECUTED_RELEASE_TOOL_PATHS = Object.freeze([
  'scripts/release-assets.mjs',
  'scripts/release-ref.mjs',
  'scripts/release-spec.mjs',
  'scripts/stage-site.mjs',
  'scripts/strict-json.mjs'
]);
const AMBIENT_RELEASE_PREFIX = 'AI_TREE_RELEASE_';
const ADDITIONAL_RELEASE_ENVIRONMENT_KEYS = Object.freeze([
  'AI_TREE_PROTECTED_MAIN_REF'
]);
const CI_COMMIT_ENVIRONMENT_KEYS = Object.freeze([
  'CI_COMMIT_SHA',
  'GITHUB_SHA'
]);

function assetsError(message) {
  return new Error(`release-assets: ${message}`);
}

function compareBytes(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function assertFullCommit(value) {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)) {
    throw assetsError('--commit must be an exact lowercase 40- or 64-character Git object ID');
  }
  return value;
}

function assertAmbientEnvironmentIsCandidateSafe(environment, commit) {
  const releaseFlags = Object.keys(environment)
    .filter(name => (
      (name.startsWith(AMBIENT_RELEASE_PREFIX) || ADDITIONAL_RELEASE_ENVIRONMENT_KEYS.includes(name)) &&
      environment[name] !== undefined
    ))
    .sort(compareBytes);
  if (releaseFlags.length > 0) {
    throw assetsError(`candidate builds reject ambient release flags: ${releaseFlags.join(', ')}`);
  }
  if (
    environment.AI_TREE_STAGE_MODE !== undefined &&
    String(environment.AI_TREE_STAGE_MODE).trim() !== 'preview'
  ) {
    throw assetsError('AI_TREE_STAGE_MODE must be preview when supplied to a candidate build');
  }
  if (
    environment.AI_TREE_REQUIRE_CLEAN !== undefined &&
    !/^(?:true|yes|1)$/iu.test(String(environment.AI_TREE_REQUIRE_CLEAN).trim())
  ) {
    throw assetsError('AI_TREE_REQUIRE_CLEAN cannot disable strict clean-tree validation');
  }
  if (environment.AI_TREE_COMMIT_SHA !== undefined && environment.AI_TREE_COMMIT_SHA !== commit) {
    throw assetsError('ambient AI_TREE_COMMIT_SHA does not match the explicit candidate commit');
  }
}

function candidateStageEnvironment(environment, commit) {
  assertAmbientEnvironmentIsCandidateSafe(environment, commit);
  return {
    ...environment,
    AI_TREE_COMMIT_SHA: commit,
    AI_TREE_REQUIRE_CLEAN: 'true',
    AI_TREE_STAGE_MODE: 'preview'
  };
}

function assertExactTrimmedValue(value, option) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw assetsError(`${option} must be an explicit exact trimmed value`);
  }
  return value;
}

function stableStageEnvironment(environment, {
  commit,
  tag,
  releaseSpecPath,
  protectedMainRef
}) {
  const ambientControls = Object.keys(environment)
    .filter(name => name.startsWith('AI_TREE_') && environment[name] !== undefined)
    .sort(compareBytes);
  if (ambientControls.length > 0) {
    throw assetsError(`stable builds reject ambient release controls: ${ambientControls.join(', ')}`);
  }
  for (const name of CI_COMMIT_ENVIRONMENT_KEYS) {
    if (environment[name] !== undefined && environment[name] !== commit) {
      throw assetsError(`${name} does not match the explicit stable commit`);
    }
  }
  return {
    ...environment,
    AI_TREE_COMMIT_SHA: commit,
    AI_TREE_PROTECTED_MAIN_REF: protectedMainRef,
    AI_TREE_RELEASE_SPEC_PATH: releaseSpecPath,
    AI_TREE_RELEASE_TAG: tag,
    AI_TREE_REQUIRE_CLEAN: 'true',
    AI_TREE_STAGE_MODE: 'release'
  };
}

async function pathDoesNotExist(absolutePath, label) {
  try {
    await lstat(absolutePath);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw assetsError(`cannot inspect ${label}: ${error.message}`);
  }
  throw assetsError(`${label} already exists and will not be overwritten: ${absolutePath}`);
}

async function resolveOutputLocation(repositoryRoot, outputDirectory) {
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0 || !path.isAbsolute(outputDirectory)) {
    throw assetsError('--output-directory must be an explicit absolute path');
  }
  const requested = path.resolve(outputDirectory);
  const basename = path.basename(requested);
  if (basename === '' || basename === '.' || basename === '..') {
    throw assetsError('--output-directory must name a new directory');
  }
  const requestedParent = path.dirname(requested);
  let resolvedParent;
  try {
    resolvedParent = await realpath(requestedParent);
  } catch (error) {
    throw assetsError(`output parent is unavailable: ${error.message}`);
  }
  const parentStat = await stat(resolvedParent);
  if (!parentStat.isDirectory()) throw assetsError('output parent must be a directory');
  const resolved = path.join(resolvedParent, basename);
  if (!samePath(requested, resolved)) {
    throw assetsError('--output-directory cannot traverse a symbolic-link or junction parent');
  }
  if (isInside(repositoryRoot, resolved)) {
    throw assetsError('--output-directory must be outside the repository worktree');
  }
  await pathDoesNotExist(resolved, 'output directory');
  return { absolute: resolved, parent: resolvedParent, basename };
}

function assertPortableAssetStem(value) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value) ||
    value.endsWith('.')
  ) {
    throw assetsError('staged release assetStem is not a portable filename stem');
  }
  return value;
}

function assertStrictCleanSourceClosure(manifest, commit) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw assetsError('staged release manifest must be an object');
  }
  if (manifest.commit !== commit) {
    throw assetsError(`staged manifest commit ${manifest.commit || '(missing)'} does not match ${commit}`);
  }
  const source = manifest.sourceState;
  if (
    !source ||
    source.kind !== 'git' ||
    source.clean !== true ||
    source.requiredClean !== true ||
    source.repositoryRootMatchesTopLevel !== true ||
    source.objectDatabaseVerified !== true ||
    source.repositoryFsckConfigurationIsolated !== true ||
    source.repositoryAttributesIsolated !== true ||
    source.trackedTreeFiltersVerified !== true ||
    source.trackedTreeFilterAttributeCount !== 0 ||
    source.head !== commit ||
    source.commitMatchesHead !== true ||
    source.changedEntryCount !== 0 ||
    source.flaggedIndexEntryCount !== 0 ||
    source.inputsMatchCommit !== true ||
    source.inputCount !== source.matchedInputCount ||
    source.directorySourceCount !== source.matchedDirectorySourceCount
  ) {
    throw assetsError('staged manifest does not prove an exact clean committed source closure');
  }
}

function assertManifestIdentity(manifest) {
  if (!manifest.releaseSpec || typeof manifest.releaseSpec !== 'object') {
    throw assetsError('staged manifest is missing its release specification');
  }
  assertPortableAssetStem(manifest.releaseSpec.assetStem);
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw assetsError('staged manifest is missing version identity');
  }
  if (typeof manifest.edition !== 'string' || manifest.edition.length === 0) {
    throw assetsError('staged manifest is missing edition identity');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._~-]*$/u.test(manifest.edition)) {
    throw assetsError('staged manifest edition must be a Markdown-safe portable identifier');
  }
  if (manifest.dataDigest !== null && !/^[0-9a-f]{64}$/u.test(manifest.dataDigest)) {
    throw assetsError('staged manifest dataDigest must be a lowercase SHA-256 digest or null');
  }
}

function assertCandidateManifest(manifest, commit) {
  assertStrictCleanSourceClosure(manifest, commit);
  if (manifest.publicationMode !== 'preview') {
    throw assetsError('candidate assets require a preview publication manifest');
  }
  if (manifest.tag !== null || manifest.promotion !== null) {
    throw assetsError('candidate assets cannot carry a tag or promotion record');
  }
  assertManifestIdentity(manifest);
  if (manifest.releaseSpec.status !== 'planned' && manifest.releaseSpec.status !== 'ready') {
    throw assetsError('candidate release specification status must be planned or ready');
  }
}

const STABLE_PROMOTION_KEYS = Object.freeze([
  'mode',
  'protectedMainCommit',
  'protectedMainRef',
  'reachableFromProtectedMain',
  'releaseDate',
  'tag',
  'tagCommit',
  'tagObject',
  'taggedAt'
]);

function assertExactObjectKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw assetsError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort(compareBytes);
  const expected = [...expectedKeys].sort(compareBytes);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw assetsError(`${label} has missing or extra fields`);
  }
}

function assertStableManifest(manifest, {
  commit,
  tag,
  releaseSpecPath,
  protectedMainRef
}) {
  assertStrictCleanSourceClosure(manifest, commit);
  if (manifest.publicationMode !== 'release') {
    throw assetsError('stable assets require a release publication manifest');
  }
  if (manifest.stageConfig?.path !== DEFAULT_CONFIG_PATH) {
    throw assetsError(`stable assets require the canonical stage configuration ${DEFAULT_CONFIG_PATH}`);
  }
  assertManifestIdentity(manifest);
  if (manifest.releaseSpec.status !== 'ready') {
    throw assetsError('stable assets require a ready release specification');
  }
  if (manifest.releaseSpec.path !== releaseSpecPath) {
    throw assetsError('staged release specification path does not match the explicit stable path');
  }
  if (manifest.releaseSpec.tag !== tag || manifest.tag !== tag) {
    throw assetsError('staged release tag does not match the explicit stable tag');
  }
  if (manifest.releaseSpec.protectedMainRef !== protectedMainRef) {
    throw assetsError('staged release specification protected-main ref does not match the explicit stable ref');
  }
  if (
    typeof manifest.releaseState !== 'string' ||
    manifest.releaseState.length === 0 ||
    /development/iu.test(manifest.releaseState) ||
    manifest.releaseState !== manifest.releaseSpec.releaseState
  ) {
    throw assetsError('stable release state must be non-developmental and match the release specification');
  }
  if (!/^[0-9a-f]{64}$/u.test(manifest.dataDigest || '')) {
    throw assetsError('stable assets require a recorded lowercase SHA-256 data digest');
  }
  if (typeof manifest.releaseSpec.prerelease !== 'boolean') {
    throw assetsError('stable release specification prerelease must be boolean');
  }
  if (
    !manifest.toolchain ||
    typeof manifest.toolchain !== 'object' ||
    Array.isArray(manifest.toolchain) ||
    !/^v24\.\d+\.\d+$/u.test(manifest.toolchain.node || '') ||
    !/^11\.\d+\.\d+$/u.test(manifest.toolchain.npm || '') ||
    manifest.toolchain.packageLockVersion !== 3
  ) {
    throw assetsError('stable assets require observed Node 24, npm 11, and package-lock v3 toolchain identity');
  }
  assertExactObjectKeys(manifest.promotion, STABLE_PROMOTION_KEYS, 'staged stable promotion');
  const promotion = manifest.promotion;
  if (
    promotion.mode !== 'annotated-tag' ||
    promotion.tag !== tag ||
    promotion.releaseDate !== manifest.releaseSpec.releaseDate ||
    promotion.tagCommit !== commit ||
    promotion.protectedMainRef !== protectedMainRef ||
    promotion.reachableFromProtectedMain !== true ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(promotion.tagObject || '') ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(promotion.protectedMainCommit || '') ||
    typeof promotion.taggedAt !== 'string' ||
    promotion.taggedAt.length === 0
  ) {
    throw assetsError('staged stable promotion is not a complete exact annotated-tag proof');
  }
}

function assertCaseUnique(paths, label) {
  const seen = new Map();
  for (const candidate of paths) {
    const folded = candidate.normalize('NFC').toLowerCase();
    const prior = seen.get(folded);
    if (prior !== undefined && prior !== candidate) {
      throw assetsError(`${label} contains a case-colliding path pair: ${prior}, ${candidate}`);
    }
    if (prior !== undefined) throw assetsError(`${label} contains a duplicate path: ${candidate}`);
    seen.set(folded, candidate);
  }
}

function expectedDirectories(filePaths) {
  const directories = new Set();
  for (const filePath of filePaths) {
    let directory = path.posix.dirname(filePath);
    while (directory !== '.') {
      directories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }
  return [...directories].sort(compareBytes);
}

export function validateCandidateArchiveInventory(entries) {
  if (!Array.isArray(entries)) throw assetsError('archive inventory must be an array');
  if (entries.length > MAX_ARCHIVE_FILE_COUNT) {
    throw assetsError(
      `archive inventory has ${entries.length} files; maximum is ${MAX_ARCHIVE_FILE_COUNT}`
    );
  }
  let totalBytes = 0;
  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw assetsError(`archive inventory[${index}] must be an object`);
    }
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
      throw assetsError(`archive inventory[${index}].bytes must be a non-negative safe integer`);
    }
    if (entry.bytes > MAX_ARCHIVE_FILE_BYTES) {
      throw assetsError(
        `archive file exceeds ${MAX_ARCHIVE_FILE_BYTES} bytes: ${entry.path || `(entry ${index})`}`
      );
    }
    totalBytes += entry.bytes;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_ARCHIVE_TOTAL_BYTES) {
      throw assetsError(`archive payload exceeds ${MAX_ARCHIVE_TOTAL_BYTES} total bytes`);
    }
  }
  return Object.freeze({ fileCount: entries.length, totalBytes });
}

async function walkStagedTree(root) {
  const files = [];
  const directories = [];
  async function visit(absoluteDirectory, relativeDirectory = '') {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    entries.sort((left, right) => compareBytes(left.name, right.name));
    for (const entry of entries) {
      const relative = relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;
      normalizeManifestPath(relative, 'staged path');
      const absolute = path.join(absoluteDirectory, entry.name);
      const entryStat = await lstat(absolute);
      if (entryStat.isSymbolicLink()) {
        throw assetsError(`staged tree contains a symbolic link or junction: ${relative}`);
      }
      if (entryStat.isDirectory()) {
        directories.push(relative);
        await visit(absolute, relative);
      } else if (entryStat.isFile()) {
        files.push(relative);
      } else {
        throw assetsError(`staged tree contains a special file: ${relative}`);
      }
    }
  }
  await visit(root);
  files.sort(compareBytes);
  directories.sort(compareBytes);
  assertCaseUnique([...directories, ...files], 'staged tree');
  return { files, directories };
}

async function captureRegularFile(root, relativePath) {
  const absolute = path.resolve(root, ...relativePath.split('/'));
  if (!isInside(root, absolute) || samePath(root, absolute)) {
    throw assetsError(`staged path escapes its root: ${relativePath}`);
  }
  const before = await lstat(absolute, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) {
    throw assetsError(`staged path is not a regular file: ${relativePath}`);
  }
  const bytes = await readFile(absolute);
  const after = await lstat(absolute, { bigint: true });
  if (
    !after.isFile() ||
    after.isSymbolicLink() ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    BigInt(bytes.byteLength) !== after.size
  ) {
    throw assetsError(`staged file changed while it was captured: ${relativePath}`);
  }
  return bytes;
}

async function captureStagedSite(stageResult, commit, assertManifest = assertCandidateManifest) {
  const outputStat = await lstat(stageResult.outputDirectory);
  if (!outputStat.isDirectory() || outputStat.isSymbolicLink()) {
    throw assetsError('stage-site output is not a regular directory');
  }
  const manifestPath = stageResult.manifest?.manifest?.path;
  normalizeManifestPath(manifestPath, 'release manifest path');
  const manifestBytes = await captureRegularFile(stageResult.outputDirectory, manifestPath);
  const manifest = parseStrictJson(manifestBytes, 'staged release manifest');
  assertManifest(manifest, commit);
  const expectedManifestBytes = Buffer.from(`${JSON.stringify(stageResult.manifest, null, 2)}\n`, 'utf8');
  if (!manifestBytes.equals(expectedManifestBytes)) {
    throw assetsError('staged release manifest bytes differ from the in-memory stage result');
  }
  if (!Array.isArray(manifest.files)) throw assetsError('staged manifest files must be an array');
  if (manifest.manifest.selfHashExcluded !== true || manifest.manifest.filesCoverage !== 'all-payload-files') {
    throw assetsError('staged manifest does not declare complete payload coverage');
  }
  if (
    !Array.isArray(manifest.manifest.filesExcluded) ||
    manifest.manifest.filesExcluded.length !== 1 ||
    manifest.manifest.filesExcluded[0] !== manifestPath
  ) {
    throw assetsError('staged manifest exclusion must contain only the manifest itself');
  }

  const listedPaths = [];
  let listedBytes = 0;
  let previousPath = null;
  for (const [index, file] of manifest.files.entries()) {
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      throw assetsError(`manifest files[${index}] must be an object`);
    }
    normalizeManifestPath(file.path, `manifest files[${index}].path`);
    if (file.path === manifestPath) throw assetsError('manifest cannot include its own digest record');
    if (previousPath !== null && compareBytes(previousPath, file.path) >= 0) {
      throw assetsError('manifest file records must be uniquely byte-sorted by path');
    }
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) {
      throw assetsError(`manifest files[${index}].bytes must be a non-negative safe integer`);
    }
    if (!/^[0-9a-f]{64}$/u.test(file.sha256)) {
      throw assetsError(`manifest files[${index}].sha256 must be a lowercase SHA-256 digest`);
    }
    listedPaths.push(file.path);
    listedBytes += file.bytes;
    previousPath = file.path;
  }
  assertCaseUnique([...listedPaths, manifestPath], 'manifest inventory');
  if (manifest.fileCount !== listedPaths.length || manifest.totalBytes !== listedBytes) {
    throw assetsError('manifest aggregate file count or byte count does not close over its records');
  }

  validateCandidateArchiveInventory([
    ...manifest.files.map(file => ({ path: file.path, bytes: file.bytes })),
    { path: manifestPath, bytes: manifestBytes.byteLength }
  ]);

  const expectedFiles = [...listedPaths, manifestPath].sort(compareBytes);
  const tree = await walkStagedTree(stageResult.outputDirectory);
  if (JSON.stringify(tree.files) !== JSON.stringify(expectedFiles)) {
    throw assetsError('staged file inventory has missing or extra files relative to the release manifest');
  }
  const directories = expectedDirectories(expectedFiles);
  if (JSON.stringify(tree.directories) !== JSON.stringify(directories)) {
    throw assetsError('staged directory inventory has missing or extra directories');
  }

  const buffers = new Map();
  for (const relativePath of expectedFiles) {
    const bytes = relativePath === manifestPath
      ? manifestBytes
      : await captureRegularFile(stageResult.outputDirectory, relativePath);
    buffers.set(relativePath, bytes);
  }
  for (const file of manifest.files) {
    const bytes = buffers.get(file.path);
    if (bytes.byteLength !== file.bytes || sha256(bytes) !== file.sha256) {
      throw assetsError(`staged payload does not match its manifest size and digest: ${file.path}`);
    }
  }
  const finalManifestBytes = await captureRegularFile(stageResult.outputDirectory, manifestPath);
  if (!finalManifestBytes.equals(manifestBytes)) {
    throw assetsError('staged release manifest changed while the site was captured');
  }
  return { manifest, manifestBytes, buffers, paths: expectedFiles };
}

function writeAscii(target, offset, length, value, label) {
  const bytes = Buffer.from(value, 'ascii');
  if (bytes.byteLength > length) throw assetsError(`${label} exceeds its USTAR field width`);
  bytes.copy(target, offset);
}

function writeOctal(target, offset, length, value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw assetsError(`${label} is not a non-negative safe integer`);
  const digits = value.toString(8);
  if (digits.length > length - 1) throw assetsError(`${label} is too large for USTAR`);
  writeAscii(target, offset, length, `${digits.padStart(length - 1, '0')}\0`, label);
}

function splitUstarPath(archivePath) {
  const bytes = Buffer.from(archivePath, 'utf8');
  if (bytes.byteLength <= 100) return { name: archivePath, prefix: '' };
  const slashIndexes = [];
  for (let index = 0; index < archivePath.length; index += 1) {
    if (archivePath[index] === '/') slashIndexes.push(index);
  }
  for (let index = slashIndexes.length - 1; index >= 0; index -= 1) {
    const split = slashIndexes[index];
    const prefix = archivePath.slice(0, split);
    const name = archivePath.slice(split + 1);
    if (Buffer.byteLength(prefix, 'utf8') <= 155 && Buffer.byteLength(name, 'utf8') <= 100) {
      return { name, prefix };
    }
  }
  throw assetsError(`archive path cannot be represented by portable USTAR: ${archivePath}`);
}

function ustarHeader(archivePath, size) {
  if (!/^[\x20-\x7e]+$/u.test(archivePath) || archivePath.includes('\\')) {
    throw assetsError(`archive path is not portable ASCII: ${archivePath}`);
  }
  const { name, prefix } = splitUstarPath(archivePath);
  const header = Buffer.alloc(ARCHIVE_BLOCK_SIZE);
  writeAscii(header, 0, 100, name, 'USTAR name');
  writeOctal(header, 100, 8, ARCHIVE_FILE_MODE, 'USTAR mode');
  writeOctal(header, 108, 8, 0, 'USTAR uid');
  writeOctal(header, 116, 8, 0, 'USTAR gid');
  writeOctal(header, 124, 12, size, 'USTAR file size');
  writeOctal(header, 136, 12, 0, 'USTAR mtime');
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  writeAscii(header, 257, 6, 'ustar\0', 'USTAR magic');
  writeAscii(header, 263, 2, '00', 'USTAR version');
  writeAscii(header, 345, 155, prefix, 'USTAR prefix');
  let checksum = 0;
  for (const byte of header) checksum += byte;
  const checksumDigits = checksum.toString(8);
  if (checksumDigits.length > 6) throw assetsError('USTAR header checksum exceeds its field width');
  writeAscii(header, 148, 8, `${checksumDigits.padStart(6, '0')}\0 `, 'USTAR checksum');
  return header;
}

function buildUstarArchive(rootName, paths, buffers, mode = 'candidate') {
  if (mode === 'candidate') {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*-candidate$/u.test(rootName)) {
      throw assetsError('archive root must be a portable candidate name');
    }
  } else if (mode === 'stable') {
    assertPortableAssetStem(rootName);
    if (/candidate/iu.test(rootName)) {
      throw assetsError('stable archive root must not contain candidate identity');
    }
  } else {
    throw assetsError(`unsupported archive mode: ${mode}`);
  }
  const sortedPaths = [...paths].sort(compareBytes);
  const chunks = [];
  for (const relativePath of sortedPaths) {
    normalizeManifestPath(relativePath, 'archive relative path');
    const bytes = buffers.get(relativePath);
    if (!Buffer.isBuffer(bytes)) throw assetsError(`archive buffer is missing: ${relativePath}`);
    const archivePath = `${rootName}/${relativePath}`;
    chunks.push(ustarHeader(archivePath, bytes.byteLength), bytes);
    const remainder = bytes.byteLength % ARCHIVE_BLOCK_SIZE;
    if (remainder !== 0) chunks.push(Buffer.alloc(ARCHIVE_BLOCK_SIZE - remainder));
  }
  chunks.push(Buffer.alloc(ARCHIVE_BLOCK_SIZE * ARCHIVE_END_BLOCK_COUNT));
  return Buffer.concat(chunks);
}

function decodeUtf8(bytes, label) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw assetsError(`${label} must be valid UTF-8`);
  if (text.startsWith('\ufeff')) throw assetsError(`${label} must not contain a UTF-8 BOM`);
  if (text.includes('\u0000')) throw assetsError(`${label} must not contain NUL bytes`);
  if (/\r(?!\n)/u.test(text)) throw assetsError(`${label} must not contain lone carriage returns`);
  return text.replaceAll('\r\n', '\n');
}

function isolatedGitEnvironment() {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_'))
  );
  const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
  environment.GIT_NO_REPLACE_OBJECTS = '1';
  environment.GIT_ATTR_NOSYSTEM = '1';
  environment.GIT_CONFIG_COUNT = '0';
  environment.GIT_CONFIG_GLOBAL = nullDevice;
  environment.GIT_CONFIG_NOSYSTEM = '1';
  environment.GIT_CONFIG_SYSTEM = nullDevice;
  environment.GIT_DISCOVERY_ACROSS_FILESYSTEM = '0';
  environment.GIT_NO_LAZY_FETCH = '1';
  environment.GIT_OPTIONAL_LOCKS = '0';
  environment.GIT_TERMINAL_PROMPT = '0';
  return environment;
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function candidateSection(releaseSpec) {
  if (releaseSpec.status === 'planned') {
    return Object.freeze({
      heading: '## [Unreleased]',
      headingLabel: 'Unreleased',
      sectionLabel: 'changes from [Unreleased]',
      tokenPattern: 'Unreleased'
    });
  }
  if (releaseSpec.status !== 'ready') {
    throw assetsError('release specification status must be planned or ready when selecting candidate notes');
  }
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(releaseSpec.version || '')) {
    throw assetsError('ready release specification version must be a stable three-part semantic version');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(releaseSpec.releaseDate || '')) {
    throw assetsError('ready release specification must supply its actual YYYY-MM-DD releaseDate');
  }
  const parsedDate = new Date(`${releaseSpec.releaseDate}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== releaseSpec.releaseDate) {
    throw assetsError('ready release specification releaseDate is not a valid calendar date');
  }
  return Object.freeze({
    heading: `## [${releaseSpec.version}] - ${releaseSpec.releaseDate}`,
    headingLabel: `[${releaseSpec.version}]`,
    sectionLabel: `frozen v${releaseSpec.version} changes`,
    tokenPattern: escapeRegularExpression(releaseSpec.version)
  });
}

function containsCandidateHeading(line, section) {
  return new RegExp(
    `^[ ]{0,3}#{1,6}[ \\t]+\\[${section.tokenPattern}\\](?:[ \\t]+.*)?$`,
    'iu'
  ).test(line.trimStart());
}

function stripHtmlComments(line, state, section) {
  let remainder = line;
  let visible = '';
  while (remainder.length > 0) {
    if (state.inComment) {
      const end = remainder.indexOf('-->');
      const hidden = end < 0 ? remainder : remainder.slice(0, end);
      if (containsCandidateHeading(hidden, section)) {
        const article = section.headingLabel === 'Unreleased' ? 'an' : 'a';
        throw assetsError(`CHANGELOG hides ${article} ${section.headingLabel} heading inside an HTML comment`);
      }
      if (end < 0) return visible;
      state.inComment = false;
      const suffix = remainder.slice(end + 3);
      if (suffix.trim() !== '') {
        throw assetsError('CHANGELOG HTML comments must occupy standalone physical lines');
      }
      remainder = suffix;
      continue;
    }
    const start = remainder.indexOf('<!--');
    if (start < 0) return visible + remainder;
    const prefix = remainder.slice(0, start);
    if (prefix.trim() !== '') {
      throw assetsError('CHANGELOG HTML comments must occupy standalone physical lines');
    }
    visible += prefix;
    state.inComment = true;
    remainder = remainder.slice(start + 4);
  }
  return visible;
}

function extractCandidateSectionBody(changelogBytes, releaseSpec) {
  const text = decodeUtf8(changelogBytes, 'CHANGELOG');
  const section = candidateSection(releaseSpec);
  const state = { inComment: false, fence: null };
  const visibleLines = [];
  const headings = [];
  for (const originalLine of text.split('\n')) {
    if (state.fence !== null) {
      const line = originalLine;
      if (containsCandidateHeading(line, section)) {
        const article = section.headingLabel === 'Unreleased' ? 'an' : 'a';
        throw assetsError(`CHANGELOG hides ${article} ${section.headingLabel} heading inside a fenced block`);
      }
      visibleLines.push(line);
      const close = new RegExp(`^[ ]{0,3}${state.fence.character}{${state.fence.length},}[ \\t]*$`, 'u');
      if (close.test(line)) state.fence = null;
      continue;
    }
    if (!state.inComment && /^(?: {4,}| {0,3}\t).*<!--/u.test(originalLine)) {
      throw assetsError('CHANGELOG contains an unsupported indented-code HTML comment opener');
    }
    const line = stripHtmlComments(originalLine, state, section);
    if (/^[ ]{0,3}(?:-+|=+)[ \t]*$/u.test(line) && (visibleLines.at(-1) || '').trim() !== '') {
      const previousIsTarget = new RegExp(
        `^[ ]{0,3}\\[${section.tokenPattern}\\]${releaseSpec.status === 'ready' ? `[ \\t]+-[ \\t]+${escapeRegularExpression(releaseSpec.releaseDate)}` : ''}[ \\t]*$`,
        'iu'
      ).test(visibleLines.at(-1));
      if (previousIsTarget) {
        throw assetsError(`CHANGELOG contains an ambiguous Setext ${section.headingLabel} heading`);
      }
      throw assetsError('CHANGELOG contains an unsupported Setext heading');
    }
    if (/<(?:\/?[A-Za-z][A-Za-z0-9-]*(?=[ \t/>]|$)|[!?])/u.test(line)) {
      throw assetsError('CHANGELOG contains an unsupported raw HTML block');
    }
    const opening = /^[ ]{0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
      state.fence = { character: opening[1][0], length: opening[1].length };
      visibleLines.push(line);
      continue;
    }
    if (containsCandidateHeading(line, section) && line !== section.heading) {
      throw assetsError(`CHANGELOG contains a malformed or ambiguous ${section.headingLabel} heading`);
    }
    if (/^[ ]{1,3}#{1,2}(?:[ \t]+|$)/u.test(line)) {
      throw assetsError('CHANGELOG contains an unsupported indented ATX H1 or H2 heading');
    }
    const lineIndex = visibleLines.length;
    visibleLines.push(line);
    if (/^#{1,2}(?:[ \t]+|$)/u.test(line)) headings.push({ index: lineIndex, line });
  }
  if (state.inComment) throw assetsError('CHANGELOG contains an unterminated HTML comment');
  if (state.fence !== null) throw assetsError('CHANGELOG contains an unterminated fenced block');

  const matching = headings.filter(heading => heading.line === section.heading);
  if (matching.length !== 1) {
    throw assetsError(`CHANGELOG must contain exactly one visible ${section.heading} heading`);
  }
  const start = matching[0].index + 1;
  const nextHeading = headings.find(heading => heading.index >= start);
  const end = nextHeading?.index ?? visibleLines.length;
  const bodyLines = visibleLines.slice(start, end);
  while (bodyLines.length > 0 && bodyLines[0].trim() === '') bodyLines.shift();
  while (bodyLines.length > 0 && bodyLines.at(-1).trim() === '') bodyLines.pop();
  if (bodyLines.length === 0) throw assetsError(`CHANGELOG ${section.headingLabel} section must not be empty`);
  return Object.freeze({ body: `${bodyLines.join('\n')}\n`, section });
}

export function extractUnreleasedBody(changelogBytes) {
  return extractCandidateSectionBody(changelogBytes, { status: 'planned' }).body;
}

export function extractCandidateChangeBody(changelogBytes, releaseSpec) {
  return extractCandidateSectionBody(changelogBytes, releaseSpec);
}

function readCommittedBlob(repositoryRoot, commit, relativePath) {
  normalizeManifestPath(relativePath, 'committed metadata path');
  try {
    return execFileSync('git', ['show', `${commit}:${relativePath}`], {
      cwd: repositoryRoot,
      encoding: 'buffer',
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      env: isolatedGitEnvironment(),
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch (error) {
    throw assetsError(`cannot read committed ${relativePath}: ${error.message}`);
  }
}

async function assertExecutingReleaseToolsMatchCommit(repositoryRoot, commit) {
  for (const relativePath of EXECUTED_RELEASE_TOOL_PATHS) {
    const localPath = path.resolve(DEFAULT_REPOSITORY_ROOT, ...relativePath.split('/'));
    const canonicalLocalPath = await realpath(localPath);
    const localStat = await lstat(localPath);
    if (!samePath(localPath, canonicalLocalPath) || !localStat.isFile() || localStat.isSymbolicLink()) {
      throw assetsError(`executing release tool must be a canonical regular file: ${relativePath}`);
    }
    const runningBytes = await readFile(localPath);
    const committedBytes = readCommittedBlob(repositoryRoot, commit, relativePath);
    if (!runningBytes.equals(committedBytes)) {
      throw assetsError(`executing release tool does not match the advertised commit: ${relativePath}`);
    }
  }
}

function candidateNotes(manifest, candidateChanges) {
  const digest = manifest.dataDigest === null ? 'not recorded' : manifest.dataDigest;
  return Buffer.from([
    `# ${manifest.releaseSpec.assetStem} candidate assets`,
    '',
    '> Candidate only. This command does not create or attest a tag, GitHub Release, or deployment.',
    '',
    `- Version: \`${manifest.version}\``,
    `- Edition: \`${manifest.edition}\``,
    `- Commit: \`${manifest.commit}\``,
    `- Data digest: \`${digest}\``,
    '- Publication mode: `preview`',
    `- Release-spec status: \`${manifest.releaseSpec.status}\``,
    '',
    `## Candidate ${candidateChanges.section.sectionLabel}`,
    '',
    candidateChanges.body.trimEnd(),
    ''
  ].join('\n'), 'utf8');
}

function stableNotes(manifest, stableChanges) {
  const digest = manifest.dataDigest === null ? 'not recorded' : manifest.dataDigest;
  const promotion = manifest.promotion;
  return Buffer.from([
    `# ${manifest.releaseSpec.assetStem} stable release assets`,
    '',
    '> Locally verified artifact package. These files do not attest a GitHub Release, an environment approval, a deployment, or public post-deployment verification.',
    '',
    `- Version: \`${manifest.version}\``,
    `- Edition: \`${manifest.edition}\``,
    `- Release date: \`${manifest.releaseSpec.releaseDate}\``,
    `- Tag: \`${manifest.tag}\``,
    `- Tag object: \`${promotion.tagObject}\``,
    `- Tagged at: \`${promotion.taggedAt}\``,
    `- Commit: \`${manifest.commit}\``,
    `- Data digest: \`${digest}\``,
    `- Protected-main ref: \`${promotion.protectedMainRef}\``,
    `- Protected-main commit: \`${promotion.protectedMainCommit}\``,
    `- Prerelease: \`${manifest.releaseSpec.prerelease}\``,
    '- Publication mode: `release`',
    '',
    stableChanges.section.heading,
    '',
    stableChanges.body.trimEnd(),
    ''
  ].join('\n'), 'utf8');
}

const STABLE_REF_PROOF_KEYS = Object.freeze([
  'mode',
  'protectedMainCommit',
  'protectedMainRef',
  'reachableFromProtectedMain',
  'tagCommit',
  'tagObject',
  'taggedAt'
]);

function assertStableFinalProof(manifest, proof) {
  assertExactObjectKeys(proof, STABLE_REF_PROOF_KEYS, 'final stable ref proof');
  const expected = {
    releaseDate: manifest.releaseSpec.releaseDate,
    tag: manifest.tag,
    ...proof
  };
  assertExactObjectKeys(expected, STABLE_PROMOTION_KEYS, 'final stable promotion proof');
  for (const key of STABLE_PROMOTION_KEYS) {
    if (expected[key] !== manifest.promotion[key]) {
      throw assetsError(`final stable ref proof changed after staging: ${key}`);
    }
  }
}

function checksumFile(namedBuffers) {
  const names = [...namedBuffers.keys()].sort(compareBytes);
  return Buffer.from(names.map(name => `${sha256(namedBuffers.get(name))}  ${name}\n`).join(''), 'utf8');
}

async function writeAtomically(output, namedBuffers, {
  beforePublish = null,
  artifactLabel = 'candidate'
} = {}) {
  await pathDoesNotExist(output.absolute, 'output directory');
  const temporary = await mkdtemp(path.join(output.parent, `.${output.basename}.tmp-`));
  let published = false;
  try {
    for (const name of [...namedBuffers.keys()].sort(compareBytes)) {
      await writeFile(path.join(temporary, name), namedBuffers.get(name), {
        flag: 'wx',
        mode: ARCHIVE_FILE_MODE
      });
    }
    await pathDoesNotExist(output.absolute, 'output directory');
    if (beforePublish !== null) await beforePublish();
    await pathDoesNotExist(output.absolute, 'output directory');
    await rename(temporary, output.absolute);
    published = true;
  } catch (error) {
    if (error.message?.startsWith('release-assets:')) throw error;
    throw assetsError(`cannot publish ${artifactLabel} assets atomically: ${error.message}`);
  } finally {
    if (!published) await rm(temporary, { recursive: true, force: true });
  }
}

export async function buildCandidateReleaseAssets({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  configPath = DEFAULT_CONFIG_PATH,
  commit,
  outputDirectory,
  checkOnly = false,
  environment = process.env,
  mode,
  tag,
  releaseSpecPath,
  protectedMainRef
} = {}) {
  const stableOnlyOptions = [
    ['mode', mode !== undefined && mode !== 'candidate'],
    ['tag', tag !== undefined],
    ['releaseSpecPath', releaseSpecPath !== undefined],
    ['protectedMainRef', protectedMainRef !== undefined]
  ].filter(([, supplied]) => supplied).map(([name]) => name);
  if (stableOnlyOptions.length > 0) {
    throw assetsError(`candidate builds reject stable-only options: ${stableOnlyOptions.join(', ')}`);
  }
  const fullCommit = assertFullCommit(commit);
  const requestedRoot = path.resolve(repositoryRoot);
  let resolvedRoot;
  try {
    resolvedRoot = await realpath(requestedRoot);
  } catch (error) {
    throw assetsError(`repository root is unavailable: ${error.message}`);
  }
  normalizeManifestPath(configPath, 'config path');
  const output = await resolveOutputLocation(resolvedRoot, outputDirectory);
  const stageEnvironment = candidateStageEnvironment(environment, fullCommit);
  const stageResult = await stageSite({
    repositoryRoot: resolvedRoot,
    configPath,
    environment: stageEnvironment,
    checkOnly: false
  });
  const captured = await captureStagedSite(stageResult, fullCommit);

  const committedConfigBytes = readCommittedBlob(resolvedRoot, fullCommit, configPath);
  if (sha256(committedConfigBytes) !== captured.manifest.stageConfig.sha256) {
    throw assetsError('committed stage configuration does not match the staged manifest');
  }
  const committedConfig = parseStrictJson(committedConfigBytes, 'committed stage configuration');
  const changelogPath = committedConfig?.metadata?.changelogFile;
  normalizeManifestPath(changelogPath, 'CHANGELOG path');
  const changelogBytes = readCommittedBlob(resolvedRoot, fullCommit, changelogPath);
  const candidateChanges = extractCandidateChangeBody(changelogBytes, captured.manifest.releaseSpec);

  const assetStem = assertPortableAssetStem(captured.manifest.releaseSpec.assetStem);
  const candidateBase = `${assetStem}-candidate-${fullCommit}`;
  const archiveRoot = `${assetStem}-candidate`;
  const archiveName = `${candidateBase}.tar`;
  const manifestName = `${candidateBase}.release-manifest.json`;
  const notesName = `${candidateBase}.notes.md`;
  const checksumsName = `${candidateBase}.SHA256SUMS`;
  const archiveBytes = buildUstarArchive(archiveRoot, captured.paths, captured.buffers);
  const notesBytes = candidateNotes(captured.manifest, candidateChanges);
  const distributable = new Map([
    [archiveName, archiveBytes],
    [manifestName, captured.manifestBytes],
    [notesName, notesBytes]
  ]);
  const checksumsBytes = checksumFile(distributable);
  const outputBuffers = new Map([...distributable, [checksumsName, checksumsBytes]]);

  if (!checkOnly) await writeAtomically(output, outputBuffers);
  const files = [...outputBuffers.entries()]
    .sort(([left], [right]) => compareBytes(left, right))
    .map(([name, bytes]) => Object.freeze({ name, bytes: bytes.byteLength, sha256: sha256(bytes) }));
  return Object.freeze({
    status: checkOnly ? 'VALID' : 'BUILT',
    candidate: true,
    candidateStem: candidateBase,
    externalOutputCreated: !checkOnly,
    stagedSiteRefreshed: true,
    repositoryRoot: resolvedRoot,
    outputDirectory: output.absolute,
    config: configPath,
    commit: fullCommit,
    version: captured.manifest.version,
    edition: captured.manifest.edition,
    dataDigest: captured.manifest.dataDigest,
    publicationMode: captured.manifest.publicationMode,
    releaseSpecStatus: captured.manifest.releaseSpec.status,
    assetStem,
    archiveRoot,
    files: Object.freeze(files)
  });
}

export async function buildStableReleaseAssets({
  repositoryRoot,
  configPath = DEFAULT_CONFIG_PATH,
  commit,
  outputDirectory,
  tag,
  releaseSpecPath,
  protectedMainRef,
  checkOnly = false,
  environment = process.env
} = {}) {
  const fullCommit = assertFullCommit(commit);
  if (configPath !== DEFAULT_CONFIG_PATH) {
    throw assetsError(`stable mode requires --config to be exactly ${DEFAULT_CONFIG_PATH}`);
  }
  const exactTag = assertExactTrimmedValue(tag, '--tag');
  const exactReleaseSpecPath = assertExactTrimmedValue(releaseSpecPath, '--release-spec-path');
  const exactProtectedMainRef = assertExactTrimmedValue(protectedMainRef, '--protected-main-ref');
  normalizeManifestPath(configPath, 'config path');
  normalizeManifestPath(exactReleaseSpecPath, 'release specification path');

  if (typeof repositoryRoot !== 'string' || repositoryRoot.length === 0 || !path.isAbsolute(repositoryRoot)) {
    throw assetsError('--repository-root must be an explicit absolute canonical path in stable mode');
  }
  if (path.normalize(repositoryRoot) !== repositoryRoot) {
    throw assetsError('--repository-root must use its normalized canonical spelling in stable mode');
  }
  const requestedRoot = path.resolve(repositoryRoot);
  let resolvedRoot;
  try {
    resolvedRoot = await realpath(requestedRoot);
  } catch (error) {
    throw assetsError(`repository root is unavailable: ${error.message}`);
  }
  if (!samePath(requestedRoot, resolvedRoot)) {
    throw assetsError('--repository-root must be the canonical worktree path, not a symbolic link or junction');
  }
  await assertExecutingReleaseToolsMatchCommit(resolvedRoot, fullCommit);
  const output = await resolveOutputLocation(resolvedRoot, outputDirectory);
  const stageEnvironment = stableStageEnvironment(environment, {
    commit: fullCommit,
    tag: exactTag,
    releaseSpecPath: exactReleaseSpecPath,
    protectedMainRef: exactProtectedMainRef
  });
  const stageResult = await stageSite({
    repositoryRoot: resolvedRoot,
    configPath,
    environment: stageEnvironment,
    checkOnly: false
  });
  const captured = await captureStagedSite(
    stageResult,
    fullCommit,
    manifest => assertStableManifest(manifest, {
      commit: fullCommit,
      tag: exactTag,
      releaseSpecPath: exactReleaseSpecPath,
      protectedMainRef: exactProtectedMainRef
    })
  );

  const committedConfigBytes = readCommittedBlob(resolvedRoot, fullCommit, configPath);
  if (sha256(committedConfigBytes) !== captured.manifest.stageConfig.sha256) {
    throw assetsError('committed stage configuration does not match the staged manifest');
  }
  const committedConfig = parseStrictJson(committedConfigBytes, 'committed stage configuration');
  if (committedConfig?.metadata?.releaseFile !== exactReleaseSpecPath) {
    throw assetsError('explicit stable release-spec path does not match the committed stage configuration');
  }
  const changelogPath = committedConfig?.metadata?.changelogFile;
  normalizeManifestPath(changelogPath, 'CHANGELOG path');
  const changelogBytes = readCommittedBlob(resolvedRoot, fullCommit, changelogPath);
  const stableChanges = extractCandidateChangeBody(changelogBytes, captured.manifest.releaseSpec);

  const assetStem = assertPortableAssetStem(captured.manifest.releaseSpec.assetStem);
  if (/candidate/iu.test(assetStem)) {
    throw assetsError('stable assetStem must not contain candidate identity');
  }
  const archiveName = `${assetStem}.tar`;
  const manifestName = `${assetStem}.release-manifest.json`;
  const notesName = `${assetStem}.notes.md`;
  const checksumsName = `${assetStem}.SHA256SUMS`;
  const archiveBytes = buildUstarArchive(assetStem, captured.paths, captured.buffers, 'stable');
  const notesBytes = stableNotes(captured.manifest, stableChanges);
  const distributable = new Map([
    [archiveName, archiveBytes],
    [manifestName, captured.manifestBytes],
    [notesName, notesBytes]
  ]);
  const checksumsBytes = checksumFile(distributable);
  const outputBuffers = new Map([...distributable, [checksumsName, checksumsBytes]]);

  const verifyFinalRef = async () => {
    const proof = await verifyReleaseRef({
      repositoryRoot: resolvedRoot,
      tag: exactTag,
      protectedMainRef: exactProtectedMainRef,
      expectedVersion: captured.manifest.version,
      expectedReleaseDate: captured.manifest.releaseSpec.releaseDate,
      expectedCommit: fullCommit
    });
    assertStableFinalProof(captured.manifest, proof);
  };
  if (checkOnly) {
    await verifyFinalRef();
  } else {
    await writeAtomically(output, outputBuffers, {
      beforePublish: verifyFinalRef,
      artifactLabel: 'stable release'
    });
  }

  const files = [...outputBuffers.entries()]
    .sort(([left], [right]) => compareBytes(left, right))
    .map(([name, bytes]) => Object.freeze({ name, bytes: bytes.byteLength, sha256: sha256(bytes) }));
  return Object.freeze({
    status: checkOnly ? 'VALID' : 'BUILT',
    candidate: false,
    stable: true,
    stableStem: assetStem,
    externalOutputCreated: !checkOnly,
    stagedSiteRefreshed: true,
    repositoryRoot: resolvedRoot,
    outputDirectory: output.absolute,
    config: configPath,
    commit: fullCommit,
    version: captured.manifest.version,
    edition: captured.manifest.edition,
    releaseDate: captured.manifest.releaseSpec.releaseDate,
    dataDigest: captured.manifest.dataDigest,
    publicationMode: captured.manifest.publicationMode,
    releaseSpecStatus: captured.manifest.releaseSpec.status,
    tag: captured.manifest.tag,
    tagObject: captured.manifest.promotion.tagObject,
    protectedMainRef: captured.manifest.promotion.protectedMainRef,
    protectedMainCommit: captured.manifest.promotion.protectedMainCommit,
    prerelease: captured.manifest.releaseSpec.prerelease,
    assetStem,
    archiveRoot: assetStem,
    files: Object.freeze(files)
  });
}

function usage() {
  return [
    'Usage: node scripts/release-assets.mjs [--mode candidate|stable] --repository-root <absolute-path> --commit <full-object-id> --output-directory <absolute-new-path> [--config <repo-relative-path>] [--check]',
    '       stable mode additionally requires --tag <tag> --release-spec-path <repo-relative-path> --protected-main-ref <full-ref>',
    '',
    'Candidate mode is the default and preserves the candidate-only artifact contract.',
    'Stable mode verifies an existing annotated tag and protected-main reachability entirely from local Git state.',
    'Neither mode creates a tag, GitHub Release, approval, deployment, or public verification.',
    '--check refreshes repository-local ignored _site for byte validation but creates no external asset directory.'
  ].join('\n');
}

function parseArguments(argumentsList) {
  const options = { mode: 'candidate', configPath: DEFAULT_CONFIG_PATH, checkOnly: false };
  const seen = new Set();
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--check') {
      if (seen.has(argument)) throw assetsError(`${argument} may be supplied only once`);
      seen.add(argument);
      options.checkOnly = true;
      continue;
    }
    const mappings = new Map([
      ['--repository-root', 'repositoryRoot'],
      ['--commit', 'commit'],
      ['--output-directory', 'outputDirectory'],
      ['--config', 'configPath'],
      ['--mode', 'mode'],
      ['--tag', 'tag'],
      ['--release-spec-path', 'releaseSpecPath'],
      ['--protected-main-ref', 'protectedMainRef']
    ]);
    const key = mappings.get(argument);
    if (key === undefined) throw assetsError(`unknown argument: ${argument}`);
    if (seen.has(argument)) throw assetsError(`${argument} may be supplied only once`);
    seen.add(argument);
    index += 1;
    if (index >= argumentsList.length || argumentsList[index].startsWith('--')) {
      throw assetsError(`${argument} requires a value`);
    }
    options[key] = argumentsList[index];
  }
  for (const [argument, key] of [
    ['--repository-root', 'repositoryRoot'],
    ['--commit', 'commit'],
    ['--output-directory', 'outputDirectory']
  ]) {
    if (options[key] === undefined) throw assetsError(`${argument} is required`);
  }
  if (options.mode !== 'candidate' && options.mode !== 'stable') {
    throw assetsError('--mode must be exactly candidate or stable');
  }
  const stableArguments = [
    ['--tag', 'tag'],
    ['--release-spec-path', 'releaseSpecPath'],
    ['--protected-main-ref', 'protectedMainRef']
  ];
  if (options.mode === 'candidate') {
    const supplied = stableArguments.filter(([, key]) => options[key] !== undefined).map(([argument]) => argument);
    if (supplied.length > 0) {
      throw assetsError(`candidate mode rejects stable-only arguments: ${supplied.join(', ')}`);
    }
  } else {
    for (const [argument, key] of stableArguments) {
      if (options[key] === undefined) throw assetsError(`${argument} is required in stable mode`);
    }
  }
  return { help: false, ...options };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const { mode, ...buildOptions } = options;
  const result = mode === 'stable'
    ? await buildStableReleaseAssets(buildOptions)
    : await buildCandidateReleaseAssets({ ...buildOptions, mode });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const executedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (executedPath === import.meta.url) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export const releaseAssetsConstants = Object.freeze({
  archiveBlockSize: ARCHIVE_BLOCK_SIZE,
  archiveEndBlockCount: ARCHIVE_END_BLOCK_COUNT,
  archiveFileMode: ARCHIVE_FILE_MODE,
  archiveFormat: ARCHIVE_FORMAT,
  maxArchiveFileBytes: MAX_ARCHIVE_FILE_BYTES,
  maxArchiveFileCount: MAX_ARCHIVE_FILE_COUNT,
  maxArchiveTotalBytes: MAX_ARCHIVE_TOTAL_BYTES,
  defaultConfigPath: DEFAULT_CONFIG_PATH,
  scriptVersion: SCRIPT_VERSION
});
