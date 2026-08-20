#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { parseStrictJson } from './strict-json.mjs';

const SCRIPT_VERSION = '1.0.0';
const BLOCK_SIZE = 512;
const END_BLOCK_BYTES = BLOCK_SIZE * 2;
const MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;
const MAX_ARCHIVE_FILE_COUNT = 4096;
const MAX_ARCHIVE_FILE_BYTES = 16 * 1024 * 1024;
const MAX_ARCHIVE_PAYLOAD_BYTES = 64 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_NOTES_BYTES = 1024 * 1024;
const MAX_CHECKSUM_BYTES = 64 * 1024;
const PORTABLE_STEM = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const OFFSET_ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/u;
const SYNTHETIC_TEST_IDENTITY = Object.freeze({
  assetStem: 'ai-tree-synthetic-test-only-fixture-v1.2.3',
  edition: '2026-08-20-synthetic-test-only',
  generatorVersion: '1.0.0-synthetic-test-only',
  releaseDate: '2026-08-23',
  releaseSpecPath: 'config/releases/v1.2.3.json',
  releaseSpecSha256: '8690593b16c96380df97bd6605409853af5132a8894ea406deb330c6ace9e8dd',
  stageConfigSha256: '523efc9458c3111a1a62bbd27c4890ed4b55f073e9d55b2f227d68eae3ef9083',
  tag: 'v1.2.3',
  version: '1.2.3'
});
const MANIFEST_KEYS = Object.freeze([
  'commit', 'dataDigest', 'edition', 'fileCount', 'files', 'generatorVersion', 'manifest',
  'promotion', 'publicationMode', 'releaseSpec', 'releaseState', 'schemaVersion', 'sourceState',
  'stageConfig', 'stageConfigVersion', 'tag', 'toolchain', 'totalBytes', 'version'
]);
const RELEASE_SPEC_KEYS = Object.freeze([
  'assetStem', 'defaultBranch', 'edition', 'path', 'prerelease', 'productionBaseUrl',
  'productionEnvironment', 'protectedMainRef', 'releaseDate', 'releaseState', 'schemaVersion',
  'sha256', 'status', 'tag', 'version'
]);
const PROMOTION_KEYS = Object.freeze([
  'mode', 'protectedMainCommit', 'protectedMainRef', 'reachableFromProtectedMain', 'releaseDate',
  'tag', 'tagCommit', 'tagObject', 'taggedAt'
]);
const SOURCE_STATE_KEYS = Object.freeze([
  'changedEntryCount', 'clean', 'commitMatchesHead', 'directorySourceCount',
  'flaggedIndexEntryCount', 'gitObjectFormat', 'head', 'indexFlagsSha256', 'inputCount',
  'inputVerificationSha256', 'inputsMatchCommit', 'kind', 'matchedDirectorySourceCount',
  'matchedInputCount', 'objectDatabaseVerified', 'repositoryAttributesIsolated',
  'repositoryFsckConfigurationIsolated', 'repositoryRootMatchesTopLevel', 'repositoryTopLevel',
  'requiredClean', 'statusSha256', 'trackedTreeEntryCount', 'trackedTreeFilterAttributeCount',
  'trackedTreeFilterAuditSha256', 'trackedTreeFiltersVerified'
]);

function bundleError(message) {
  return new Error(`verify-stable-bundle: ${message}`);
}

function compareBytes(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function assertExactObjectKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw bundleError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort(compareBytes);
  const expected = [...expectedKeys].sort(compareBytes);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw bundleError(`${label} has missing or unsupported fields`);
  }
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
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function decodeUtf8(bytes, label) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw bundleError(`${label} must be valid UTF-8`);
  if (text.startsWith('\ufeff')) throw bundleError(`${label} must not contain a UTF-8 BOM`);
  if (text.includes('\u0000')) throw bundleError(`${label} must not contain NUL bytes`);
  if (/\r(?!\n)/u.test(text)) throw bundleError(`${label} must not contain lone carriage returns`);
  return text.replaceAll('\r\n', '\n');
}

function normalizeRelativePath(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.normalize('NFC') !== value ||
    value.includes('\\') ||
    path.posix.isAbsolute(value) ||
    /^[A-Za-z]:/u.test(value) ||
    path.posix.normalize(value) !== value ||
    value.endsWith('/')
  ) {
    throw bundleError(`${label} is not a canonical portable relative path`);
  }
  const segments = value.split('/');
  for (const segment of segments) {
    if (
      segment === '' ||
      segment === '.' ||
      segment === '..' ||
      !/^[A-Za-z0-9._~-]+$/u.test(segment) ||
      segment.endsWith('.') ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment)
    ) {
      throw bundleError(`${label} contains a non-portable path segment: ${segment || '(empty)'}`);
    }
  }
  return value;
}

function assertIsoDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw bundleError(`${label} must use YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw bundleError(`${label} must be a real calendar date`);
  }
}

function assertCaseUnique(values, label) {
  const seen = new Map();
  for (const value of values) {
    const folded = value.normalize('NFC').toLowerCase();
    const prior = seen.get(folded);
    if (prior !== undefined) {
      throw bundleError(`${label} contains a duplicate or case-colliding path: ${prior}, ${value}`);
    }
    seen.set(folded, value);
  }
}

function readNullTerminatedAscii(bytes, start, length, label) {
  const field = bytes.subarray(start, start + length);
  const nul = field.indexOf(0);
  const content = field.subarray(0, nul < 0 ? field.length : nul);
  if (content.some(byte => byte < 0x20 || byte > 0x7e)) {
    throw bundleError(`${label} is not printable ASCII`);
  }
  if (nul >= 0 && field.subarray(nul).some(byte => byte !== 0)) {
    throw bundleError(`${label} contains data after its NUL terminator`);
  }
  return content.toString('ascii');
}

function readOctal(bytes, start, length, label, { checksum = false } = {}) {
  const field = bytes.subarray(start, start + length);
  const digitLength = checksum ? length - 2 : length - 1;
  const digitsBytes = field.subarray(0, digitLength);
  const terminatorIsCanonical = checksum
    ? field[length - 2] === 0 && field[length - 1] === 0x20
    : field[length - 1] === 0;
  if (!terminatorIsCanonical || digitsBytes.some(byte => byte < 0x30 || byte > 0x37)) {
    throw bundleError(`${label} is not canonical USTAR octal`);
  }
  const digits = digitsBytes.toString('ascii');
  const value = Number.parseInt(digits, 8);
  if (!Number.isSafeInteger(value) || value < 0) throw bundleError(`${label} is out of range`);
  return value;
}

function canonicalUstarSplit(archivePath) {
  if (Buffer.byteLength(archivePath, 'utf8') <= 100) return { name: archivePath, prefix: '' };
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
  throw bundleError(`archive path cannot use the canonical portable USTAR split: ${archivePath}`);
}

function parseUstar(archiveBytes, assetStem) {
  if (archiveBytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw bundleError(`archive exceeds ${MAX_ARCHIVE_BYTES} bytes`);
  }
  if (archiveBytes.byteLength < END_BLOCK_BYTES || archiveBytes.byteLength % BLOCK_SIZE !== 0) {
    throw bundleError('archive length is not a complete USTAR block sequence');
  }
  const entries = [];
  let payloadBytes = 0;
  let offset = 0;
  let previousPath = null;
  while (offset < archiveBytes.byteLength) {
    const header = archiveBytes.subarray(offset, offset + BLOCK_SIZE);
    if (header.every(byte => byte === 0)) {
      const terminal = archiveBytes.subarray(offset);
      if (terminal.byteLength !== END_BLOCK_BYTES || !terminal.every(byte => byte === 0)) {
        throw bundleError('archive must end with exactly two zero blocks');
      }
      assertCaseUnique(entries.map(entry => entry.path), 'archive');
      return entries;
    }
    if (entries.length >= MAX_ARCHIVE_FILE_COUNT) {
      throw bundleError(`archive exceeds ${MAX_ARCHIVE_FILE_COUNT} files`);
    }
    if (header.subarray(257, 263).toString('binary') !== 'ustar\0') {
      throw bundleError('archive entry is missing the USTAR magic');
    }
    if (header.subarray(263, 265).toString('ascii') !== '00') {
      throw bundleError('archive entry has an unsupported USTAR version');
    }
    if (header[156] !== 0x30) throw bundleError('archive may contain only regular-file entries');
    for (const [start, end, label] of [
      [157, 257, 'linkname'],
      [265, 297, 'uname'],
      [297, 329, 'gname'],
      [329, 337, 'device major'],
      [337, 345, 'device minor'],
      [500, 512, 'reserved header']
    ]) {
      if (!header.subarray(start, end).every(byte => byte === 0)) {
        throw bundleError(`archive entry has unsupported nonzero ${label} metadata`);
      }
    }
    const storedChecksum = readOctal(header, 148, 8, 'USTAR header checksum', { checksum: true });
    const checksumHeader = Buffer.from(header);
    checksumHeader.fill(0x20, 148, 156);
    const computedChecksum = checksumHeader.reduce((sum, byte) => sum + byte, 0);
    if (storedChecksum !== computedChecksum) throw bundleError('archive entry header checksum does not match');
    if (readOctal(header, 100, 8, 'USTAR mode') !== 0o644) {
      throw bundleError('archive entries must use mode 0644');
    }
    if (
      readOctal(header, 108, 8, 'USTAR uid') !== 0 ||
      readOctal(header, 116, 8, 'USTAR gid') !== 0 ||
      readOctal(header, 136, 12, 'USTAR mtime') !== 0
    ) {
      throw bundleError('archive owner and timestamp metadata must be normalized to zero');
    }
    const name = readNullTerminatedAscii(header, 0, 100, 'USTAR name');
    const prefix = readNullTerminatedAscii(header, 345, 155, 'USTAR prefix');
    const archivePath = prefix === '' ? name : `${prefix}/${name}`;
    normalizeRelativePath(archivePath, 'archive path');
    const canonicalSplit = canonicalUstarSplit(archivePath);
    if (canonicalSplit.name !== name || canonicalSplit.prefix !== prefix) {
      throw bundleError(`archive path does not use its canonical USTAR name/prefix split: ${archivePath}`);
    }
    const expectedRoot = `${assetStem}/`;
    if (!archivePath.startsWith(expectedRoot)) {
      throw bundleError(`archive path is outside the exact ${assetStem} root: ${archivePath}`);
    }
    const relativePath = archivePath.slice(expectedRoot.length);
    normalizeRelativePath(relativePath, 'archive relative path');
    if (previousPath !== null && compareBytes(previousPath, relativePath) >= 0) {
      throw bundleError('archive paths must be uniquely byte-sorted');
    }
    const size = readOctal(header, 124, 12, 'USTAR file size');
    if (size > MAX_ARCHIVE_FILE_BYTES) {
      throw bundleError(`archive entry exceeds ${MAX_ARCHIVE_FILE_BYTES} bytes: ${relativePath}`);
    }
    payloadBytes += size;
    if (!Number.isSafeInteger(payloadBytes) || payloadBytes > MAX_ARCHIVE_PAYLOAD_BYTES) {
      throw bundleError(`archive payload exceeds ${MAX_ARCHIVE_PAYLOAD_BYTES} bytes`);
    }
    const dataStart = offset + BLOCK_SIZE;
    const dataEnd = dataStart + size;
    const paddedEnd = dataStart + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
    if (paddedEnd > archiveBytes.byteLength - END_BLOCK_BYTES) {
      throw bundleError(`archive entry is truncated: ${relativePath}`);
    }
    const padding = archiveBytes.subarray(dataEnd, paddedEnd);
    if (!padding.every(byte => byte === 0)) {
      throw bundleError(`archive entry has nonzero padding: ${relativePath}`);
    }
    entries.push(Object.freeze({
      archivePath,
      bytes: size,
      data: Buffer.from(archiveBytes.subarray(dataStart, dataEnd)),
      path: relativePath,
      sha256: sha256(archiveBytes.subarray(dataStart, dataEnd))
    }));
    previousPath = relativePath;
    offset = paddedEnd;
  }
  throw bundleError('archive is missing its two terminal zero blocks');
}

async function captureRegularFile(bundleRoot, name, maximumBytes) {
  normalizeRelativePath(name, 'bundle filename');
  if (name.includes('/')) throw bundleError(`bundle entry must be a top-level file: ${name}`);
  const absolute = path.join(bundleRoot, name);
  const before = await lstat(absolute, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) {
    throw bundleError(`bundle entry is not a regular file: ${name}`);
  }
  if (before.size > BigInt(maximumBytes)) throw bundleError(`bundle entry is too large: ${name}`);
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
    throw bundleError(`bundle entry changed while it was read: ${name}`);
  }
  return bytes;
}

async function captureBundle(bundleDirectory) {
  if (typeof bundleDirectory !== 'string' || bundleDirectory.length === 0 || !path.isAbsolute(bundleDirectory)) {
    throw bundleError('--bundle-directory must be an explicit absolute path');
  }
  const requested = path.resolve(bundleDirectory);
  if (path.normalize(bundleDirectory) !== requested) {
    throw bundleError('--bundle-directory must use its normalized canonical spelling');
  }
  const canonical = await realpath(requested);
  if (!samePath(requested, canonical)) {
    throw bundleError('--bundle-directory must be a canonical real directory, not a link or junction');
  }
  const rootStat = await lstat(canonical);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw bundleError('--bundle-directory must be a real directory');
  }
  const entries = await readdir(canonical, { withFileTypes: true });
  entries.sort((left, right) => compareBytes(left.name, right.name));
  if (entries.length !== 4 || entries.some(entry => !entry.isFile() || entry.isSymbolicLink())) {
    throw bundleError('bundle directory must contain exactly four regular top-level files');
  }
  const names = entries.map(entry => entry.name);
  assertCaseUnique(names, 'bundle directory');
  const checksumNames = names.filter(name => name.endsWith('.SHA256SUMS'));
  if (checksumNames.length !== 1) throw bundleError('bundle must contain exactly one .SHA256SUMS file');
  const checksumName = checksumNames[0];
  const assetStem = checksumName.slice(0, -'.SHA256SUMS'.length);
  if (!PORTABLE_STEM.test(assetStem) || assetStem.endsWith('.') || /candidate/iu.test(assetStem)) {
    throw bundleError('bundle asset stem must be a portable non-candidate stable stem');
  }
  const expectedNames = [
    `${assetStem}.SHA256SUMS`,
    `${assetStem}.notes.md`,
    `${assetStem}.release-manifest.json`,
    `${assetStem}.tar`
  ].sort(compareBytes);
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    throw bundleError('bundle filenames do not close over one stable asset stem');
  }
  const buffers = new Map();
  for (const name of names) {
    const maximum = name.endsWith('.tar')
      ? MAX_ARCHIVE_BYTES
      : name.endsWith('.release-manifest.json')
        ? MAX_MANIFEST_BYTES
        : name.endsWith('.notes.md')
          ? MAX_NOTES_BYTES
          : MAX_CHECKSUM_BYTES;
    buffers.set(name, await captureRegularFile(canonical, name, maximum));
  }
  return { assetStem, buffers, bundleRoot: canonical, names };
}

function verifyChecksums(captured) {
  const checksumName = `${captured.assetStem}.SHA256SUMS`;
  const text = decodeUtf8(captured.buffers.get(checksumName), checksumName);
  if (!text.endsWith('\n')) throw bundleError('SHA256SUMS must end with one newline');
  const lines = text.slice(0, -1).split('\n');
  if (lines.length !== 3 || lines.some(line => line === '')) {
    throw bundleError('SHA256SUMS must contain exactly three nonempty records');
  }
  const records = [];
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)$/u.exec(line);
    if (!match) throw bundleError('SHA256SUMS contains a malformed record');
    const [, digest, name] = match;
    if (name === checksumName || !captured.buffers.has(name)) {
      throw bundleError(`SHA256SUMS names an unexpected file: ${name}`);
    }
    records.push({ digest, name });
  }
  const expectedNames = captured.names.filter(name => name !== checksumName).sort(compareBytes);
  const recordNames = records.map(record => record.name);
  if (JSON.stringify(recordNames) !== JSON.stringify(expectedNames)) {
    throw bundleError('SHA256SUMS records must be unique, complete, and byte-sorted');
  }
  for (const record of records) {
    if (sha256(captured.buffers.get(record.name)) !== record.digest) {
      throw bundleError(`checksum does not match: ${record.name}`);
    }
  }
}

function assertStableManifest(manifest, assetStem, { requireSyntheticTestOnly }) {
  assertExactObjectKeys(manifest, MANIFEST_KEYS, 'release manifest');
  if (manifest.publicationMode !== 'release') throw bundleError('manifest must describe release-mode staging');
  if (manifest.schemaVersion !== '1.4.0' || manifest.stageConfigVersion !== '1.1.0') {
    throw bundleError('manifest uses an unknown release-manifest or stage-config schema version');
  }
  if (
    !manifest.stageConfig ||
    manifest.stageConfig.path !== 'config/pages-stage.v1.json' ||
    !DIGEST.test(manifest.stageConfig.sha256)
  ) {
    throw bundleError('manifest does not identify the canonical staged-site configuration');
  }
  assertExactObjectKeys(manifest.stageConfig, ['path', 'sha256'], 'manifest stageConfig');
  if (!OBJECT_ID.test(manifest.commit)) throw bundleError('manifest commit must be a full Git object ID');
  if (!DIGEST.test(manifest.dataDigest)) throw bundleError('manifest dataDigest must be a lowercase SHA-256 digest');
  if (
    typeof manifest.generatorVersion !== 'string' ||
    manifest.generatorVersion.length < 1 ||
    manifest.generatorVersion.length > 128 ||
    manifest.generatorVersion.trim() !== manifest.generatorVersion ||
    /[\u0000-\u001f\u007f]/u.test(manifest.generatorVersion)
  ) {
    throw bundleError('manifest generatorVersion must be a nonempty bounded printable string');
  }
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(manifest.version || '')) {
    throw bundleError('manifest version must be a stable three-part semantic version');
  }
  if (typeof manifest.edition !== 'string' || !/^\d{4}-\d{2}-\d{2}-[A-Za-z0-9._~-]+$/u.test(manifest.edition)) {
    throw bundleError('manifest edition must begin with a date and use a portable identifier');
  }
  assertIsoDate(manifest.edition.slice(0, 10), 'manifest edition date');
  const spec = manifest.releaseSpec;
  assertExactObjectKeys(spec, RELEASE_SPEC_KEYS, 'manifest releaseSpec');
  if (
    !spec ||
    spec.status !== 'ready' ||
    spec.assetStem !== assetStem ||
    spec.schemaVersion !== '1.0.0' ||
    !DIGEST.test(spec.sha256) ||
    spec.path !== `config/releases/v${manifest.version}.json` ||
    spec.defaultBranch !== 'main' ||
    spec.protectedMainRef !== 'refs/remotes/origin/main' ||
    spec.productionEnvironment !== 'github-pages' ||
    spec.productionBaseUrl !== 'https://neb6dav.github.io/ai_tech_tree/' ||
    spec.releaseState !== 'Public beta'
  ) {
    throw bundleError('manifest must contain a ready release specification for the bundle stem');
  }
  if (manifest.version !== spec.version || manifest.edition !== spec.edition || manifest.releaseState !== spec.releaseState) {
    throw bundleError('manifest top-level identity does not match its release specification');
  }
  if (manifest.tag !== spec.tag || manifest.tag !== `v${manifest.version}`) {
    throw bundleError('manifest tag and version identity do not close');
  }
  if (spec.releaseDate === null || spec.prerelease !== true) {
    throw bundleError('manifest stable fixture requires a dated prerelease specification');
  }
  assertIsoDate(spec.releaseDate, 'manifest release date');
  const promotion = manifest.promotion;
  assertExactObjectKeys(promotion, PROMOTION_KEYS, 'manifest promotion');
  if (
    !promotion ||
    promotion.mode !== 'annotated-tag' ||
    promotion.tag !== manifest.tag ||
    promotion.releaseDate !== spec.releaseDate ||
    promotion.tagCommit !== manifest.commit ||
    !OBJECT_ID.test(promotion.tagObject) ||
    promotion.protectedMainRef !== spec.protectedMainRef ||
    !OBJECT_ID.test(promotion.protectedMainCommit) ||
    promotion.reachableFromProtectedMain !== true ||
    typeof promotion.taggedAt !== 'string' ||
    !OFFSET_ISO_TIMESTAMP.test(promotion.taggedAt) ||
    promotion.taggedAt.slice(0, 10) !== spec.releaseDate ||
    Number.isNaN(Date.parse(promotion.taggedAt))
  ) {
    throw bundleError('manifest promotion record is not a complete annotated-tag proof');
  }
  const source = manifest.sourceState;
  assertExactObjectKeys(source, SOURCE_STATE_KEYS, 'manifest sourceState');
  const sourceCountPairs = [
    ['inputCount', 'matchedInputCount', 1],
    ['directorySourceCount', 'matchedDirectorySourceCount', 0]
  ];
  for (const [countKey, matchedKey, minimum] of sourceCountPairs) {
    if (
      !Number.isSafeInteger(source?.[countKey]) ||
      source[countKey] < minimum ||
      !Number.isSafeInteger(source[matchedKey]) ||
      source[matchedKey] < minimum ||
      source[countKey] !== source[matchedKey]
    ) {
      throw bundleError(`manifest sourceState ${matchedKey} must close a safe ${countKey} inventory`);
    }
  }
  if (!Number.isSafeInteger(source?.trackedTreeEntryCount) || source.trackedTreeEntryCount < 1) {
    throw bundleError('manifest sourceState trackedTreeEntryCount must be a positive safe integer');
  }
  for (const digestKey of [
    'trackedTreeFilterAuditSha256',
    'statusSha256',
    'indexFlagsSha256',
    'inputVerificationSha256'
  ]) {
    if (!DIGEST.test(source?.[digestKey] || '')) {
      throw bundleError(`manifest sourceState ${digestKey} must be a lowercase SHA-256 digest`);
    }
  }
  if (
    !source ||
    source.kind !== 'git' ||
    source.repositoryTopLevel !== '.' ||
    (source.gitObjectFormat !== 'sha1' && source.gitObjectFormat !== 'sha256') ||
    source.clean !== true ||
    source.requiredClean !== true ||
    source.repositoryRootMatchesTopLevel !== true ||
    source.objectDatabaseVerified !== true ||
    source.repositoryFsckConfigurationIsolated !== true ||
    source.repositoryAttributesIsolated !== true ||
    source.trackedTreeFiltersVerified !== true ||
    source.trackedTreeFilterAttributeCount !== 0 ||
    source.head !== manifest.commit ||
    source.commitMatchesHead !== true ||
    source.changedEntryCount !== 0 ||
    source.flaggedIndexEntryCount !== 0 ||
    source.inputsMatchCommit !== true ||
    source.inputCount !== source.matchedInputCount ||
    source.directorySourceCount !== source.matchedDirectorySourceCount
  ) {
    throw bundleError('manifest does not prove strict clean committed source closure');
  }
  const objectIdPattern = source.gitObjectFormat === 'sha1'
    ? /^[0-9a-f]{40}$/u
    : /^[0-9a-f]{64}$/u;
  for (const [label, objectId] of [
    ['commit', manifest.commit],
    ['promotion.tagCommit', promotion.tagCommit],
    ['promotion.tagObject', promotion.tagObject],
    ['promotion.protectedMainCommit', promotion.protectedMainCommit],
    ['sourceState.head', source.head]
  ]) {
    if (!objectIdPattern.test(objectId)) {
      throw bundleError(`manifest ${label} length does not match sourceState.gitObjectFormat`);
    }
  }
  assertExactObjectKeys(
    manifest.toolchain,
    ['node', 'npm', 'packageLockVersion', 'releaseRef', 'stageSite'],
    'manifest toolchain'
  );
  if (
    !manifest.toolchain ||
    !/^v24\./u.test(manifest.toolchain.node || '') ||
    !/^11\./u.test(manifest.toolchain.npm || '') ||
    manifest.toolchain.packageLockVersion !== 3 ||
    manifest.toolchain.releaseRef !== '1.0.0' ||
    manifest.toolchain.stageSite !== '1.4.0'
  ) {
    throw bundleError('manifest does not record the supported Node 24, npm 11, lockfile v3 toolchain');
  }
  assertExactObjectKeys(
    manifest.manifest,
    ['path', 'selfHashExcluded', 'filesCoverage', 'filesExcluded'],
    'manifest self-coverage record'
  );
  if (
    !manifest.manifest ||
    manifest.manifest.path !== 'release-manifest.json' ||
    manifest.manifest.selfHashExcluded !== true ||
    manifest.manifest.filesCoverage !== 'all-payload-files' ||
    JSON.stringify(manifest.manifest.filesExcluded) !== '["release-manifest.json"]'
  ) {
    throw bundleError('manifest self-exclusion and payload-coverage contract is invalid');
  }
  if (!Array.isArray(manifest.files)) throw bundleError('manifest files must be an array');
  if (requireSyntheticTestOnly) {
    const identity = {
      assetStem,
      edition: manifest.edition,
      generatorVersion: manifest.generatorVersion,
      releaseDate: spec.releaseDate,
      releaseSpecPath: spec.path,
      releaseSpecSha256: spec.sha256,
      stageConfigSha256: manifest.stageConfig.sha256,
      tag: manifest.tag,
      version: manifest.version
    };
    if (JSON.stringify(identity) !== JSON.stringify(SYNTHETIC_TEST_IDENTITY)) {
      throw bundleError('workflow bundle does not have the exact locked synthetic-test-only identity');
    }
    if (
      manifest.toolchain.node !== 'v24.14.1' ||
      manifest.toolchain.npm !== '11.11.0'
    ) {
      throw bundleError('synthetic parity manifest must record exactly Node v24.14.1 and npm 11.11.0');
    }
    if (
      !/^[0-9a-f]{40}$/u.test(manifest.commit) ||
      !/^[0-9a-f]{40}$/u.test(promotion.tagObject) ||
      !/^[0-9a-f]{40}$/u.test(promotion.protectedMainCommit) ||
      promotion.protectedMainCommit !== manifest.commit ||
      source.gitObjectFormat !== 'sha1'
    ) {
      throw bundleError('synthetic parity manifest must carry exact SHA-1 commit, tag, and protected-ref proof');
    }
  }
  return manifest;
}

function verifyArchiveClosure(entries, manifest, manifestBytes) {
  const manifestPath = manifest.manifest.path;
  const expectedPaths = [...manifest.files.map(file => file.path), manifestPath].sort(compareBytes);
  const actualPaths = entries.map(entry => entry.path);
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw bundleError('archive inventory does not close over the release manifest');
  }
  assertCaseUnique(expectedPaths, 'manifest inventory');
  let totalBytes = 0;
  let previousPath = null;
  const byPath = new Map(entries.map(entry => [entry.path, entry]));
  for (const [index, file] of manifest.files.entries()) {
    assertExactObjectKeys(file, ['bytes', 'mediaType', 'path', 'sha256'], `manifest files[${index}]`);
    normalizeRelativePath(file.path, `manifest files[${index}].path`);
    if (file.path === manifestPath || (previousPath !== null && compareBytes(previousPath, file.path) >= 0)) {
      throw bundleError('manifest payload paths must be uniquely byte-sorted and exclude the manifest');
    }
    if (
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      !DIGEST.test(file.sha256) ||
      typeof file.mediaType !== 'string' ||
      file.mediaType.length === 0
    ) {
      throw bundleError(`manifest payload metadata is invalid: ${file.path}`);
    }
    const entry = byPath.get(file.path);
    if (!entry || entry.bytes !== file.bytes || entry.sha256 !== file.sha256) {
      throw bundleError(`archive payload does not match its manifest record: ${file.path}`);
    }
    totalBytes += file.bytes;
    previousPath = file.path;
  }
  if (manifest.fileCount !== manifest.files.length || manifest.totalBytes !== totalBytes) {
    throw bundleError('manifest aggregate count or byte total does not close over its payload records');
  }
  const archivedManifest = byPath.get(manifestPath);
  if (!archivedManifest || !archivedManifest.data.equals(manifestBytes)) {
    throw bundleError('archived release manifest is not byte-identical to the standalone manifest');
  }
}

function requireExactlyOnce(text, fragment, label) {
  const first = text.indexOf(fragment);
  if (first < 0 || text.indexOf(fragment, first + fragment.length) >= 0) {
    throw bundleError(`release notes must contain exactly one ${label}`);
  }
}

function verifyNotes(notesBytes, manifest, assetStem, { requireSyntheticTestOnly }) {
  const notesName = `${assetStem}.notes.md`;
  const text = decodeUtf8(notesBytes, notesName);
  if (!text.endsWith('\n')) throw bundleError('release notes must end with a newline');
  const promotion = manifest.promotion;
  requireExactlyOnce(
    text,
    '> Locally verified artifact package. These files do not attest a GitHub Release, an environment approval, a deployment, or public post-deployment verification.',
    'local-only non-attestation statement'
  );
  const expectedFragments = [
    [`# ${assetStem} stable release assets`, 'stable heading'],
    [`- Version: \`${manifest.version}\``, 'version field'],
    [`- Edition: \`${manifest.edition}\``, 'edition field'],
    [`- Release date: \`${manifest.releaseSpec.releaseDate}\``, 'release-date field'],
    [`- Tag: \`${manifest.tag}\``, 'tag field'],
    [`- Tag object: \`${promotion.tagObject}\``, 'tag-object field'],
    [`- Tagged at: \`${promotion.taggedAt}\``, 'tagged-at field'],
    [`- Commit: \`${manifest.commit}\``, 'commit field'],
    [`- Data digest: \`${manifest.dataDigest}\``, 'data-digest field'],
    [`- Protected-main ref: \`${promotion.protectedMainRef}\``, 'protected-ref field'],
    [`- Protected-main commit: \`${promotion.protectedMainCommit}\``, 'protected-commit field'],
    [`- Prerelease: \`${manifest.releaseSpec.prerelease}\``, 'prerelease field'],
    ['- Publication mode: `release`', 'publication-mode field']
  ];
  for (const [fragment, label] of expectedFragments) requireExactlyOnce(text, fragment, label);
  if (requireSyntheticTestOnly) {
    requireExactlyOnce(
      text,
      '> Synthetic test-only fixture; never cite, publish, or deploy.',
      'synthetic test-only warning'
    );
  }
}

async function safelyExtractAndVerify(entries, temporaryParent) {
  const parentRequested = path.resolve(temporaryParent);
  const parent = await realpath(parentRequested);
  if (!samePath(parentRequested, parent)) {
    throw bundleError('temporary extraction parent must use its canonical filesystem spelling');
  }
  const extractionRoot = await mkdtemp(path.join(parent, 'ai-tree-stable-bundle-verify-'));
  const canonicalRoot = await realpath(extractionRoot);
  if (!samePath(extractionRoot, canonicalRoot)) {
    await rm(extractionRoot, { recursive: true, force: true });
    throw bundleError('temporary extraction root is not canonical');
  }
  try {
    for (const entry of entries) {
      const destination = path.resolve(canonicalRoot, ...entry.path.split('/'));
      if (!isInside(canonicalRoot, destination) || samePath(canonicalRoot, destination)) {
        throw bundleError(`archive extraction path escapes its temporary root: ${entry.path}`);
      }
      const destinationParent = path.dirname(destination);
      await mkdir(destinationParent, { recursive: true, mode: 0o700 });
      const canonicalDestinationParent = await realpath(destinationParent);
      if (!isInside(canonicalRoot, canonicalDestinationParent)) {
        throw bundleError(`archive extraction parent escapes its temporary root: ${entry.path}`);
      }
      await writeFile(destination, entry.data, { flag: 'wx', mode: 0o600 });
      const extractedStat = await lstat(destination);
      const canonicalDestination = await realpath(destination);
      if (
        !extractedStat.isFile() ||
        extractedStat.isSymbolicLink() ||
        !isInside(canonicalRoot, canonicalDestination)
      ) {
        throw bundleError(`archive extraction target is not a contained regular file: ${entry.path}`);
      }
      const extracted = await readFile(destination);
      if (!extracted.equals(entry.data) || sha256(extracted) !== entry.sha256) {
        throw bundleError(`temporary extraction verification failed: ${entry.path}`);
      }
    }
  } finally {
    await rm(canonicalRoot, { recursive: true, force: true });
  }
}

export async function verifyStableBundle({
  bundleDirectory,
  requireSyntheticTestOnly = false,
  temporaryParent = os.tmpdir()
} = {}) {
  const captured = await captureBundle(bundleDirectory);
  verifyChecksums(captured);
  const manifestName = `${captured.assetStem}.release-manifest.json`;
  const manifestBytes = captured.buffers.get(manifestName);
  const manifest = assertStableManifest(
    parseStrictJson(manifestBytes, manifestName),
    captured.assetStem,
    { requireSyntheticTestOnly }
  );
  const archiveName = `${captured.assetStem}.tar`;
  const entries = parseUstar(captured.buffers.get(archiveName), captured.assetStem);
  verifyArchiveClosure(entries, manifest, manifestBytes);
  verifyNotes(captured.buffers.get(`${captured.assetStem}.notes.md`), manifest, captured.assetStem, {
    requireSyntheticTestOnly
  });
  await safelyExtractAndVerify(entries, temporaryParent);
  return Object.freeze({
    status: 'VALID',
    verifierVersion: SCRIPT_VERSION,
    bundleDirectory: captured.bundleRoot,
    assetStem: captured.assetStem,
    fixture: requireSyntheticTestOnly ? 'synthetic-test-only' : null,
    fileCount: captured.names.length,
    archiveEntryCount: entries.length,
    archiveSha256: sha256(captured.buffers.get(archiveName)),
    manifestSha256: sha256(manifestBytes),
    commit: manifest.commit,
    tag: manifest.tag,
    tagObject: manifest.promotion.tagObject,
    extraction: 'verified-in-removed-temporary-directory'
  });
}

function usage() {
  return [
    'Usage: node scripts/verify-stable-bundle.mjs --bundle-directory <absolute-path> [--require-synthetic-test-only]',
    '',
    'Verifies four stable bundle files, checksums, manifest/archive/notes closure,',
    'and safe USTAR extraction inside a removed temporary directory. No network is used.'
  ].join('\n');
}

function parseArguments(argumentsList) {
  if (argumentsList.includes('--help') || argumentsList.includes('-h')) return { help: true };
  let bundleDirectory;
  let requireSyntheticTestOnly = false;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--require-synthetic-test-only') {
      if (requireSyntheticTestOnly) throw bundleError('--require-synthetic-test-only may be supplied only once');
      requireSyntheticTestOnly = true;
      continue;
    }
    if (argument !== '--bundle-directory') throw bundleError(`unknown argument: ${argument}`);
    if (bundleDirectory !== undefined) throw bundleError('--bundle-directory may be supplied only once');
    index += 1;
    if (index >= argumentsList.length || argumentsList[index].startsWith('--')) {
      throw bundleError('--bundle-directory requires a value');
    }
    bundleDirectory = argumentsList[index];
  }
  if (bundleDirectory === undefined) throw bundleError('--bundle-directory is required');
  return { help: false, bundleDirectory, requireSyntheticTestOnly };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await verifyStableBundle(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isEntrypoint) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

export const stableBundleVerifierConstants = Object.freeze({
  archiveBlockSize: BLOCK_SIZE,
  maximumArchiveBytes: MAX_ARCHIVE_BYTES,
  maximumArchiveFileBytes: MAX_ARCHIVE_FILE_BYTES,
  maximumArchiveFileCount: MAX_ARCHIVE_FILE_COUNT,
  maximumArchivePayloadBytes: MAX_ARCHIVE_PAYLOAD_BYTES,
  scriptVersion: SCRIPT_VERSION
});
