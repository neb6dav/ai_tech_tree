#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  access,
  lstat,
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
import { fileURLToPath } from 'node:url';

import { parseStrictJson } from './strict-json.mjs';

const SCRIPT_VERSION = '1.0.0';
const RECEIPT_SCHEMA_VERSION = '1.0.0';
const DESCRIPTOR_RELATIVE_PATH = 'config/rollback/production-2026-08-20-76483d2d.v1.json';
const ARCHIVE_RELATIVE_PATH = 'rollback/production-2026-08-20-76483d2d/artifact.tar';
const DESCRIPTOR_BYTES = 9730;
const DESCRIPTOR_SHA256 = 'd67958ed48719bc364a4a8a79202d2360ccce507d051ccfa6f5681ad999ab8f8';
const ARCHIVE_BYTES = 14059520;
const ARCHIVE_SHA256 = 'f04f46196b74982f9d725f032278f9b7ed48ae1ffd82db0dcff3fc39f739f9c4';
const ARCHIVE_GIT_BLOB = '651fab34624fd6b943054c8cb3e30c76a88e4024';
const BLOCK_BYTES = 512;
const TERMINAL_ZERO_BYTES = 1536;
const MAX_DESCRIPTOR_BYTES = 64 * 1024;
const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const TEMPORARY_PREFIX = 'ai-tree-rollback-rehearsal-';
const PRODUCTION_BASE_URL = 'https://neb6dav.github.io/ai_tech_tree/';
const DATASET_IDENTIFIER = 'urn:uuid:7d0547f2-6239-5a56-82a3-1c846701c866';
const EDITION = '2026-08-13-public-beta-1';
const RELEASE_STATE = 'Public beta';
const GENERATOR_VERSION = '1.3.0';
const DATA_DIGEST = 'f2d78f9cb04820bb9ed6ebaeb9a6a75f7faf64edbb52314eefc3114650a7455b';
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTHORITY = Object.freeze({
  authenticatedAuthority: false,
  productionEligible: false,
  operationAuthorized: false,
  externalMutationAuthorized: false,
  retryAuthorized: false,
  rollbackAuthorized: false,
  operationalReuseAuthorized: false,
  releaseAuthorized: false,
  deploymentAuthorized: false
});
const LIMITATIONS = Object.freeze([
  'This repository-held snapshot is a historical pre-repair rollback baseline, not evidence that the current release conforms to the current publication contract.',
  'Verification and rehearsal are local and read-only; they do not attest the GitHub artifact wrapper, protected branch, release, environment approval, deployment, or public production state.',
  'The snapshot does not authorize a rollback, deployment, release, tag, retry, or any external mutation.',
  'The plan-only historical smoke checks the seven archived payloads and makes no network request.'
]);
const TOP_LEVEL_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'status',
  'repository',
  'sourceArtifact',
  'archive',
  'smokePlan',
  'authority',
  'limitations'
]);
const REQUIRED_FILES = Object.freeze([
  'ai-research-tech-tree.json',
  'ai-research-tech-tree.jsonld',
  'ai-research-tech-tree.ndjson',
  'index.html',
  'robots.txt',
  'sitemap.xml',
  'social-card.png'
]);
const COLLECTION_RECORD_TYPES = Object.freeze({
  dataset: 1,
  lane: 15,
  editorialClassification: 7,
  atlasEntry: 339,
  relationship: 711,
  evidenceAssessment: 1389,
  paper: 176,
  paperAssociation: 186,
  landmarkWork: 76,
  landmarkWorkAssociation: 76,
  wikipediaRevision: 267
});
const COLLECTION_LENGTHS = Object.freeze({
  lanes: 15,
  classifications: 7,
  nodes: 339,
  relationships: 711,
  evidenceAssessments: 1389,
  papers: 176,
  paperLinks: 186,
  landmarkWorks: 76,
  landmarkWorkLinks: 76,
  wikipediaSources: 267
});
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

class RollbackBundleError extends Error {
  constructor(message) {
    super(`verify-rollback-bundle: ${message}`);
    this.name = 'RollbackBundleError';
  }
}

function fail(message) {
  throw new RollbackBundleError(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitBlobSha1(bytes) {
  const header = Buffer.from(`blob ${bytes.byteLength}\0`, 'utf8');
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function samePath(left, right) {
  const a = path.resolve(left).normalize('NFC');
  const b = path.resolve(right).normalize('NFC');
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function assertPlainObject(value, label) {
  if (value == null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(`${label} must be a plain object`);
  }
  return value;
}

function assertOnlyKeys(value, expected, label) {
  assertPlainObject(value, label);
  const actual = Object.keys(value).sort(compareText);
  const wanted = [...expected].sort(compareText);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} keys must be exactly: ${wanted.join(', ')}`);
  }
}

function assertExactJson(left, right, label) {
  const canonical = value => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value != null && typeof value === 'object') {
      return `{${Object.keys(value).sort(compareText).map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  };
  if (canonical(left) !== canonical(right)) fail(`${label} does not match the fixed historical baseline`);
}

function assertExactBuffer(value, label, maximumBytes) {
  if (
    !Buffer.isBuffer(value) ||
    Object.getPrototypeOf(value) !== Buffer.prototype ||
    !(value.buffer instanceof ArrayBuffer)
  ) {
    fail(`${label} must be an ordinary non-shared Buffer`);
  }
  if (value.byteLength > maximumBytes) fail(`${label} exceeds its ${maximumBytes}-byte cap`);
  return Buffer.from(value);
}

function captureApiInputs(options) {
  assertPlainObject(options, 'options');
  const descriptors = Object.getOwnPropertyDescriptors(options);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== 2 || !keys.includes('descriptorBytes') || !keys.includes('archiveBytes')) {
    fail('options must contain exactly descriptorBytes and archiveBytes');
  }
  for (const key of keys) {
    if (typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value')) {
      fail('options must use own data properties only');
    }
  }
  return Object.freeze({
    descriptorBytes: assertExactBuffer(descriptors.descriptorBytes.value, 'descriptorBytes', MAX_DESCRIPTOR_BYTES),
    archiveBytes: assertExactBuffer(descriptors.archiveBytes.value, 'archiveBytes', MAX_ARCHIVE_BYTES)
  });
}

function validateDescriptor(descriptorBytes) {
  let descriptor;
  try {
    descriptor = parseStrictJson(descriptorBytes, 'rollback descriptor');
  } catch (error) {
    fail(error.message || String(error));
  }
  const canonical = Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`, 'utf8');
  if (!canonical.equals(descriptorBytes)) fail('rollback descriptor must use the exact canonical JSON encoding');
  if (descriptorBytes.byteLength !== DESCRIPTOR_BYTES || sha256(descriptorBytes) !== DESCRIPTOR_SHA256) {
    fail('rollback descriptor bytes do not match the fixed historical baseline');
  }
  assertOnlyKeys(descriptor, TOP_LEVEL_KEYS, 'rollback descriptor');
  if (
    descriptor.schemaVersion !== '1.0.0' ||
    descriptor.kind !== 'read-only-production-rollback-baseline' ||
    descriptor.status !== 'historical-pre-repair-snapshot'
  ) {
    fail('rollback descriptor identity is not the supported fixed historical baseline');
  }
  if (
    descriptor.repository?.slug !== 'neb6dav/ai_tech_tree' ||
    descriptor.repository?.defaultBranch !== 'main' ||
    descriptor.repository?.productionBaseUrl !== PRODUCTION_BASE_URL
  ) {
    fail('rollback descriptor repository identity is not exact');
  }
  const source = descriptor.sourceArtifact;
  if (
    source?.headCommit !== '76483d2d59f52f30202b52fe52a26a7c832a1252' ||
    source?.headTree !== '97bbd11d6d82b09eba5f3627dfb617d1e18b4e65' ||
    source?.workflowRunId !== 32328029844 ||
    source?.artifactId !== 9392055435 ||
    source?.artifactName !== 'github-pages' ||
    source?.wrapperSha256 !== '6a7c9bea76948a8c5f82431dd762aef82adba982286a5d317688061c4c447f0a' ||
    source?.wrapperDigestAuthenticated !== false
  ) {
    fail('rollback descriptor source-artifact binding is not exact');
  }
  const archive = descriptor.archive;
  if (
    archive?.path !== ARCHIVE_RELATIVE_PATH ||
    archive?.format !== 'legacy-gnu-tar' ||
    archive?.bytes !== ARCHIVE_BYTES ||
    archive?.sha256 !== ARCHIVE_SHA256 ||
    archive?.gitBlob !== ARCHIVE_GIT_BLOB ||
    archive?.payloadBytes !== 14052260 ||
    archive?.entryCount !== 8 ||
    archive?.terminalZeroBytes !== TERMINAL_ZERO_BYTES ||
    !Array.isArray(archive?.entries) || archive.entries.length !== 8
  ) {
    fail('rollback descriptor archive binding is not exact');
  }
  if (
    descriptor.smokePlan?.mode !== 'plan-only-offline-historical-smoke' ||
    descriptor.smokePlan?.productionBaseUrl !== PRODUCTION_BASE_URL ||
    descriptor.smokePlan?.networkRequests !== 0
  ) {
    fail('rollback descriptor must retain the fixed plan-only zero-network smoke boundary');
  }
  assertExactJson(descriptor.smokePlan.requiredFiles, REQUIRED_FILES, 'rollback smoke requiredFiles');
  assertExactJson(descriptor.smokePlan.expectations.ndjsonRecordTypes, COLLECTION_RECORD_TYPES, 'rollback smoke record counts');
  assertExactJson(descriptor.authority, AUTHORITY, 'rollback authority');
  assertExactJson(descriptor.limitations, LIMITATIONS, 'rollback limitations');
  if (!descriptor.limitations.some(value => typeof value === 'string' && value.includes('not evidence that the current release conforms'))) {
    fail('rollback limitations must explicitly disclaim current-release conformance');
  }
  return descriptor;
}

function readTerminatedAscii(header, offset, length, label) {
  const field = header.subarray(offset, offset + length);
  const nul = field.indexOf(0);
  const end = nul < 0 ? field.length : nul;
  const content = field.subarray(0, end);
  if (content.some(byte => byte < 0x20 || byte > 0x7e)) fail(`${label} must be printable ASCII`);
  if (nul >= 0 && field.subarray(nul).some(byte => byte !== 0)) fail(`${label} has data after its NUL terminator`);
  return content.toString('ascii');
}

function readCanonicalOctal(header, offset, length, label, checksum = false) {
  const field = header.subarray(offset, offset + length);
  const digitLength = checksum ? length - 2 : length - 1;
  const terminatorValid = checksum
    ? field[length - 2] === 0 && field[length - 1] === 0x20
    : field[length - 1] === 0;
  if (!terminatorValid || field.subarray(0, digitLength).some(byte => byte < 0x30 || byte > 0x37)) {
    fail(`${label} is not canonical legacy-GNU octal`);
  }
  const value = Number.parseInt(field.subarray(0, digitLength).toString('ascii'), 8);
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} is outside the safe integer range`);
  return value;
}

function validateArchivePath(archivePath, type, seen) {
  if (
    archivePath.includes('\0') ||
    archivePath.includes('\\') ||
    archivePath.startsWith('/') ||
    /^[A-Za-z]:/u.test(archivePath) ||
    archivePath.normalize('NFC') !== archivePath
  ) {
    fail(`archive path is absolute, non-canonical, or contains a forbidden separator: ${archivePath}`);
  }
  if (type === 'directory') {
    if (archivePath !== './') fail('archive may contain only the exact ./ root directory');
  } else {
    if (!/^\.\/[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(archivePath)) {
      fail(`archive regular path is not an exact portable top-level path: ${archivePath}`);
    }
    const relative = archivePath.slice(2);
    if (relative === '.' || relative === '..' || relative.includes('/')) {
      fail(`archive path contains traversal or a file-directory collision: ${archivePath}`);
    }
  }
  const folded = archivePath.toLowerCase();
  if (seen.has(folded)) fail(`archive has a duplicate or case-colliding path: ${archivePath}`);
  seen.add(folded);
}

function parseLegacyArchive(archiveBytes, descriptor) {
  if (archiveBytes.byteLength < BLOCK_BYTES + TERMINAL_ZERO_BYTES || archiveBytes.byteLength % BLOCK_BYTES !== 0) {
    fail('archive is not a complete legacy-GNU tar block sequence');
  }
  const expectedEntries = descriptor.archive.entries;
  const seen = new Set();
  const entries = [];
  let offset = 0;
  let payloadBytes = 0;
  while (offset < archiveBytes.byteLength) {
    const header = archiveBytes.subarray(offset, offset + BLOCK_BYTES);
    if (header.every(byte => byte === 0)) {
      const terminal = archiveBytes.subarray(offset);
      if (terminal.byteLength !== TERMINAL_ZERO_BYTES || terminal.some(byte => byte !== 0)) {
        fail(`archive must end with exactly ${TERMINAL_ZERO_BYTES} zero bytes`);
      }
      break;
    }
    if (entries.length >= expectedEntries.length) fail('archive contains more than the exact root-plus-seven inventory');
    const expected = expectedEntries[entries.length];
    if (!header.subarray(257, 263).equals(Buffer.from('ustar ', 'ascii'))) {
      fail('archive entry does not use the exact legacy-GNU magic');
    }
    if (header[263] !== 0x20 || header[264] !== 0) fail('archive entry does not use the exact legacy-GNU version');
    for (const [start, end, label] of [
      [157, 257, 'link target'],
      [329, 337, 'device major'],
      [337, 345, 'device minor'],
      [345, 500, 'prefix'],
      [500, 512, 'reserved metadata']
    ]) {
      if (header.subarray(start, end).some(byte => byte !== 0)) {
        fail(`archive entry contains forbidden ${label} metadata`);
      }
    }
    const typeByte = header[156];
    const type = typeByte === 0x35 ? 'directory' : typeByte === 0x30 ? 'regular' : null;
    if (type == null) fail('archive contains an extension, link, or special entry type');
    const archivePath = readTerminatedAscii(header, 0, 100, 'archive path');
    validateArchivePath(archivePath, type, seen);
    const mode = readCanonicalOctal(header, 100, 8, 'archive mode').toString(8).padStart(4, '0');
    const uid = readCanonicalOctal(header, 108, 8, 'archive uid');
    const gid = readCanonicalOctal(header, 116, 8, 'archive gid');
    const size = readCanonicalOctal(header, 124, 12, 'archive size');
    const mtime = readCanonicalOctal(header, 136, 12, 'archive mtime');
    const storedChecksum = readCanonicalOctal(header, 148, 8, 'archive header checksum', true);
    const checksumHeader = Buffer.from(header);
    checksumHeader.fill(0x20, 148, 156);
    const computedChecksum = checksumHeader.reduce((sum, byte) => sum + byte, 0);
    if (storedChecksum !== computedChecksum) fail(`archive header checksum does not match for ${archivePath}`);
    const uname = readTerminatedAscii(header, 265, 32, 'archive uname');
    const gname = readTerminatedAscii(header, 297, 32, 'archive gname');
    if (type === 'directory' && size !== 0) fail('archive root directory must have zero payload bytes');
    if (size > 8 * 1024 * 1024) fail(`archive entry exceeds the fixed per-file cap: ${archivePath}`);
    const dataStart = offset + BLOCK_BYTES;
    const dataEnd = dataStart + size;
    const paddedEnd = dataStart + Math.ceil(size / BLOCK_BYTES) * BLOCK_BYTES;
    if (paddedEnd > archiveBytes.byteLength - TERMINAL_ZERO_BYTES) fail(`archive entry is truncated: ${archivePath}`);
    if (archiveBytes.subarray(dataEnd, paddedEnd).some(byte => byte !== 0)) {
      fail(`archive entry has nonzero padding: ${archivePath}`);
    }
    const actual = Object.freeze({
      path: archivePath,
      type,
      headerOffset: offset,
      headerSha256: sha256(header),
      headerChecksum: storedChecksum,
      mode,
      uid,
      gid,
      uname,
      gname,
      mtime: new Date(mtime * 1000).toISOString().replace('.000Z', 'Z'),
      bytes: size,
      data: Buffer.from(archiveBytes.subarray(dataStart, dataEnd)),
      sha256: type === 'regular' ? sha256(archiveBytes.subarray(dataStart, dataEnd)) : undefined,
      gitBlob: type === 'regular' ? gitBlobSha1(archiveBytes.subarray(dataStart, dataEnd)) : undefined
    });
    for (const key of ['path', 'type', 'headerOffset', 'mode', 'uid', 'gid', 'uname', 'gname', 'mtime', 'bytes', 'headerChecksum', 'headerSha256']) {
      if (actual[key] !== expected[key]) fail(`archive ${key} does not match the descriptor at entry ${entries.length}`);
    }
    entries.push(actual);
    payloadBytes += size;
    offset = paddedEnd;
  }
  if (entries.length !== expectedEntries.length) fail('archive inventory does not contain the exact root-plus-seven entries');
  if (payloadBytes !== descriptor.archive.payloadBytes) fail('archive payload byte total does not match the descriptor');
  return entries;
}

function decodeUtf8(bytes, label) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) fail(`${label} is not valid UTF-8`);
  if (text.startsWith('\ufeff') || text.includes('\0')) fail(`${label} contains a BOM or NUL byte`);
  if (text.includes('\r')) fail(`${label} does not use the fixed LF-only historical encoding`);
  return text;
}

function exactOccurrence(text, needle, label) {
  const first = text.indexOf(needle);
  if (first < 0 || text.indexOf(needle, first + needle.length) >= 0) {
    fail(`${label} must occur exactly once in the historical HTML`);
  }
}

function parseJsonBytes(bytes, label) {
  try {
    return parseStrictJson(bytes, label);
  } catch (error) {
    fail(error.message || String(error));
  }
}

function validateDatasetIdentity(dataset, expectations, label) {
  assertPlainObject(dataset, label);
  if (
    dataset.identifier !== expectations.datasetIdentifier ||
    dataset.edition !== expectations.edition ||
    dataset.releaseState !== expectations.releaseState ||
    dataset.canonicalUrl !== PRODUCTION_BASE_URL ||
    dataset.dataDigest !== expectations.dataDigest
  ) {
    fail(`${label} does not close over the fixed dataset, edition, release state, URL, and digest`);
  }
  assertExactJson(dataset.counts, expectations.counts, `${label} counts`);
}

function validatePng(bytes, expectations) {
  if (bytes.byteLength < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) fail('social-card.png has an invalid PNG signature');
  if (bytes.readUInt32BE(8) !== 13 || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') {
    fail('social-card.png does not begin with an exact IHDR chunk');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== expectations.socialCardWidth || height !== expectations.socialCardHeight) {
    fail('social-card.png dimensions do not match the historical smoke plan');
  }
  return Object.freeze({ width, height });
}

function runHistoricalSmoke(fileBytes, descriptor) {
  const plan = descriptor.smokePlan;
  const expectations = plan.expectations;
  const actualNames = [...fileBytes.keys()].sort(compareText);
  const expectedNames = [...REQUIRED_FILES].sort(compareText);
  if (actualNames.length !== expectedNames.length || actualNames.some((name, index) => name !== expectedNames[index])) {
    fail('historical smoke received an incomplete or ambiguous seven-file inventory');
  }

  const html = decodeUtf8(fileBytes.get('index.html'), 'index.html');
  exactOccurrence(html, `<title>${expectations.htmlTitle}</title>`, 'fixed title');
  exactOccurrence(html, `<link rel="canonical" href="${PRODUCTION_BASE_URL}">`, 'fixed canonical link');
  exactOccurrence(html, `<meta property="og:image" content="${PRODUCTION_BASE_URL}social-card.png">`, 'fixed social-card link');
  for (const [mime, filename] of [
    ['application/ld+json', 'ai-research-tech-tree.jsonld'],
    ['application/json', 'ai-research-tech-tree.json'],
    ['application/x-ndjson', 'ai-research-tech-tree.ndjson']
  ]) {
    exactOccurrence(html, `rel="alternate" type="${mime}" href="./${filename}"`, `fixed ${filename} alternate link`);
  }

  const normalized = parseJsonBytes(fileBytes.get('ai-research-tech-tree.json'), 'historical normalized JSON');
  if (normalized.schemaVersion !== 2 || normalized.generatorVersion !== expectations.generatorVersion) {
    fail('historical normalized JSON schema or generator identity is not exact');
  }
  validateDatasetIdentity(normalized.dataset, expectations, 'historical normalized JSON dataset');
  if (normalized.namespace?.datasetIri !== expectations.datasetIdentifier) {
    fail('historical normalized JSON namespace does not bind the dataset identifier');
  }
  for (const [collection, expectedLength] of Object.entries(COLLECTION_LENGTHS)) {
    const value = normalized[collection];
    const actualLength = collection === 'classifications' && value != null && !Array.isArray(value)
      ? Object.keys(value).length
      : Array.isArray(value) ? value.length : -1;
    if (actualLength !== expectedLength) fail(`historical normalized JSON ${collection} count does not match`);
  }
  const developmentCount = normalized.nodes.filter(node => node.type === 'development').length;
  const directionCount = normalized.nodes.filter(node => node.type === 'open_direction').length;
  if (developmentCount !== expectations.counts.developments || directionCount !== expectations.counts.openDirections) {
    fail('historical normalized JSON node kinds do not close over the development and direction counts');
  }

  const jsonLd = parseJsonBytes(fileBytes.get('ai-research-tech-tree.jsonld'), 'historical JSON-LD');
  if (
    jsonLd['@id'] !== expectations.datasetIdentifier ||
    jsonLd['schema:identifier'] !== expectations.datasetIdentifier ||
    jsonLd['schema:version'] !== expectations.edition ||
    jsonLd['schema:url']?.['@id'] !== PRODUCTION_BASE_URL ||
    jsonLd['tree:releaseState'] !== expectations.releaseState ||
    jsonLd['tree:dataDigest'] !== expectations.dataDigest ||
    jsonLd['tree:generatorVersion'] !== expectations.generatorVersion
  ) {
    fail('historical JSON-LD identity does not cross-bind the fixed dataset, edition, URL, release state, digest, and generator');
  }
  assertExactJson(jsonLd['tree:counts']?.['@value'], expectations.counts, 'historical JSON-LD counts');
  if (!Array.isArray(jsonLd['@graph']) || jsonLd['@graph'].length !== expectations.jsonLdGraphEntries) {
    fail('historical JSON-LD graph count does not match the smoke plan');
  }

  const ndjsonText = decodeUtf8(fileBytes.get('ai-research-tech-tree.ndjson'), 'historical NDJSON');
  if (!ndjsonText.endsWith('\n') || ndjsonText.endsWith('\n\n')) fail('historical NDJSON must end in exactly one LF');
  const lines = ndjsonText.slice(0, -1).split('\n');
  if (lines.length !== expectations.ndjsonRecords || lines.some(line => line.length === 0)) {
    fail('historical NDJSON record count does not match the smoke plan');
  }
  const records = lines.map((line, index) => parseJsonBytes(Buffer.from(line), `historical NDJSON record ${index + 1}`));
  const first = records[0];
  if (first.recordType !== 'dataset' || first.schemaVersion !== 2 || first.generatorVersion !== expectations.generatorVersion) {
    fail('historical NDJSON dataset envelope does not match the normalized JSON identity');
  }
  validateDatasetIdentity(first.dataset, expectations, 'historical NDJSON dataset');
  if (first.namespace?.datasetIri !== expectations.datasetIdentifier) {
    fail('historical NDJSON namespace does not bind the dataset identifier');
  }
  const recordCounts = Object.create(null);
  for (const record of records) {
    if (typeof record.recordType !== 'string') fail('historical NDJSON record lacks a recordType');
    recordCounts[record.recordType] = (recordCounts[record.recordType] || 0) + 1;
  }
  assertExactJson(recordCounts, expectations.ndjsonRecordTypes, 'historical NDJSON record types');

  const robots = decodeUtf8(fileBytes.get('robots.txt'), 'robots.txt');
  const expectedRobots = `User-agent: *\nAllow: /\n\nSitemap: ${PRODUCTION_BASE_URL}sitemap.xml\n`;
  if (robots !== expectedRobots) fail('robots.txt does not match the fixed production-base smoke expectation');
  const sitemap = decodeUtf8(fileBytes.get('sitemap.xml'), 'sitemap.xml');
  exactOccurrence(sitemap, `<loc>${PRODUCTION_BASE_URL}</loc>`, 'fixed sitemap production URL');
  exactOccurrence(sitemap, '<lastmod>2026-08-13</lastmod>', 'fixed sitemap historical date');
  const socialCard = validatePng(fileBytes.get('social-card.png'), expectations);

  return Object.freeze({
    mode: plan.mode,
    productionBaseUrl: plan.productionBaseUrl,
    networkRequests: 0,
    fileCount: REQUIRED_FILES.length,
    datasetIdentifier: expectations.datasetIdentifier,
    edition: expectations.edition,
    dataDigest: expectations.dataDigest,
    ndjsonRecords: lines.length,
    jsonLdGraphEntries: jsonLd['@graph'].length,
    socialCard
  });
}

function bindPayloadsAndArchive(entries, archiveBytes, descriptor) {
  for (let index = 0; index < entries.length; index += 1) {
    const actual = entries[index];
    const expected = descriptor.archive.entries[index];
    if (actual.type === 'regular' && (actual.sha256 !== expected.sha256 || actual.gitBlob !== expected.gitBlob)) {
      fail(`archive payload digest or Git blob does not match for ${actual.path}`);
    }
  }
  if (archiveBytes.byteLength !== ARCHIVE_BYTES) fail(`archive must contain exactly ${ARCHIVE_BYTES} bytes`);
  if (sha256(archiveBytes) !== ARCHIVE_SHA256 || gitBlobSha1(archiveBytes) !== ARCHIVE_GIT_BLOB) {
    fail('archive SHA-256 or Git blob does not match the fixed historical baseline');
  }
}

function verifyCore({ descriptorBytes, archiveBytes }) {
  const descriptor = validateDescriptor(descriptorBytes);
  const entries = parseLegacyArchive(archiveBytes, descriptor);
  const fileBytes = new Map(entries.filter(entry => entry.type === 'regular').map(entry => [entry.path.slice(2), entry.data]));
  const smoke = runHistoricalSmoke(fileBytes, descriptor);
  bindPayloadsAndArchive(entries, archiveBytes, descriptor);
  const receipt = Object.freeze({
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    scriptVersion: SCRIPT_VERSION,
    outcome: 'verified-read-only-rollback-baseline',
    status: 'verified',
    descriptor: Object.freeze({
      path: DESCRIPTOR_RELATIVE_PATH,
      bytes: descriptorBytes.byteLength,
      sha256: sha256(descriptorBytes)
    }),
    archive: Object.freeze({
      path: ARCHIVE_RELATIVE_PATH,
      bytes: archiveBytes.byteLength,
      sha256: sha256(archiveBytes),
      gitBlob: gitBlobSha1(archiveBytes),
      entryCount: entries.length,
      payloadBytes: descriptor.archive.payloadBytes,
      terminalZeroBytes: descriptor.archive.terminalZeroBytes
    }),
    smokePlan: smoke,
    authority: AUTHORITY,
    limitations: LIMITATIONS
  });
  return { descriptor, entries, receipt };
}

export function verifyRollbackBundle(options) {
  return verifyCore(captureApiInputs(options)).receipt;
}

async function captureFixedFile(relativePath, maximumBytes) {
  const requested = path.resolve(REPOSITORY_ROOT, ...relativePath.split('/'));
  if (!isInside(REPOSITORY_ROOT, requested)) fail(`fixed input escapes the repository root: ${relativePath}`);
  const canonical = await realpath(requested);
  if (!samePath(requested, canonical)) fail(`fixed input must not be a symlink or path alias: ${relativePath}`);
  const before = await lstat(canonical, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.size > BigInt(maximumBytes)) {
    fail(`fixed input must be a bounded regular file: ${relativePath}`);
  }
  const bytes = await readFile(canonical);
  const after = await lstat(canonical, { bigint: true });
  if (
    !after.isFile() || after.isSymbolicLink() ||
    before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
    BigInt(bytes.byteLength) !== after.size
  ) {
    fail(`fixed input changed while it was read: ${relativePath}`);
  }
  return bytes;
}

async function captureExtractedFile(root, filename, expected) {
  const absolute = path.resolve(root, filename);
  if (!isInside(root, absolute)) fail(`extracted path escapes the tool-created temporary directory: ${filename}`);
  const canonical = await realpath(absolute);
  if (!samePath(absolute, canonical)) fail(`extracted file became a symlink or path alias: ${filename}`);
  const before = await lstat(canonical, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.size !== BigInt(expected.bytes)) {
    fail(`extracted payload is not the expected exclusive regular file: ${filename}`);
  }
  const bytes = await readFile(canonical);
  const after = await lstat(canonical, { bigint: true });
  if (
    !after.isFile() || after.isSymbolicLink() ||
    before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
    sha256(bytes) !== expected.sha256 || gitBlobSha1(bytes) !== expected.gitBlob
  ) {
    fail(`extracted payload changed or failed digest closure: ${filename}`);
  }
  return bytes;
}

async function rehearseVerifiedBundle(verified) {
  const temporaryParent = await realpath(os.tmpdir());
  const cleanupRoot = await mkdtemp(path.join(temporaryParent, TEMPORARY_PREFIX));
  let canonicalRoot = null;
  let smoke;
  let primaryError = null;
  try {
    const lexicalStat = await lstat(cleanupRoot);
    if (!lexicalStat.isDirectory() || lexicalStat.isSymbolicLink()) {
      fail('tool-created temporary root is not a real directory');
    }
    canonicalRoot = await realpath(cleanupRoot);
    if (!samePath(cleanupRoot, canonicalRoot) || !isInside(temporaryParent, canonicalRoot)) {
      fail('tool-created temporary directory did not retain its canonical boundary');
    }
    const rootStat = await lstat(canonicalRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('tool-created temporary root is not a real directory');
    const regularEntries = verified.entries.filter(entry => entry.type === 'regular');
    for (const entry of regularEntries) {
      const filename = entry.path.slice(2);
      const destination = path.resolve(canonicalRoot, filename);
      if (!isInside(canonicalRoot, destination)) fail(`rehearsal extraction escaped its temporary root: ${filename}`);
      await writeFile(destination, entry.data, { flag: 'wx', mode: 0o600 });
      const created = await lstat(destination);
      if (!created.isFile() || created.isSymbolicLink()) fail(`rehearsal did not create an exclusive regular file: ${filename}`);
    }
    const directoryEntries = await readdir(canonicalRoot, { withFileTypes: true });
    directoryEntries.sort((left, right) => compareText(left.name, right.name));
    const names = directoryEntries.map(entry => entry.name);
    const expectedNames = [...REQUIRED_FILES].sort(compareText);
    if (
      names.length !== expectedNames.length ||
      names.some((name, index) => name !== expectedNames[index]) ||
      directoryEntries.some(entry => !entry.isFile() || entry.isSymbolicLink())
    ) {
      fail('rehearsal extraction inventory is incomplete, ambiguous, or not regular-file-only');
    }
    const reread = new Map();
    for (const entry of regularEntries) {
      const filename = entry.path.slice(2);
      const expected = verified.descriptor.archive.entries.find(candidate => candidate.path === entry.path);
      reread.set(filename, await captureExtractedFile(canonicalRoot, filename, expected));
    }
    smoke = runHistoricalSmoke(reread, verified.descriptor);
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      await rm(cleanupRoot, { recursive: true, force: true });
      await access(cleanupRoot);
      fail('tool-created temporary rehearsal directory remained after cleanup');
    } catch (cleanupError) {
      if (cleanupError instanceof RollbackBundleError) {
        if (primaryError == null) primaryError = cleanupError;
      } else if (cleanupError?.code !== 'ENOENT' && primaryError == null) {
        primaryError = new RollbackBundleError(`temporary rehearsal cleanup failed: ${cleanupError.message || cleanupError}`);
      }
    }
  }
  if (primaryError != null) throw primaryError;
  return Object.freeze({
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    scriptVersion: SCRIPT_VERSION,
    outcome: 'rollback-bundle-rehearsed',
    nextStep: 'continue-to-final-read-only-preflight',
    status: 'verified',
    baseline: verified.receipt,
    extraction: 'verified-in-removed-tool-created-temporary-directory',
    smoke,
    authority: AUTHORITY,
    limitations: LIMITATIONS
  });
}

async function main(argv) {
  if (argv.length !== 0) fail('the fixed-path rollback rehearsal accepts no arguments or caller-selected destination');
  const descriptorBytes = await captureFixedFile(DESCRIPTOR_RELATIVE_PATH, MAX_DESCRIPTOR_BYTES);
  const archiveBytes = await captureFixedFile(ARCHIVE_RELATIVE_PATH, MAX_ARCHIVE_BYTES);
  const verified = verifyCore({ descriptorBytes, archiveBytes });
  const receipt = await rehearseVerifiedBundle(verified);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.message || error}\n`);
    process.exitCode = 1;
  });
}

export const rollbackBundleConstants = Object.freeze({
  scriptVersion: SCRIPT_VERSION,
  receiptSchemaVersion: RECEIPT_SCHEMA_VERSION,
  descriptorRelativePath: DESCRIPTOR_RELATIVE_PATH,
  descriptorBytes: DESCRIPTOR_BYTES,
  descriptorSha256: DESCRIPTOR_SHA256,
  archiveRelativePath: ARCHIVE_RELATIVE_PATH,
  archiveBytes: ARCHIVE_BYTES,
  archiveSha256: ARCHIVE_SHA256,
  archiveGitBlob: ARCHIVE_GIT_BLOB,
  terminalZeroBytes: TERMINAL_ZERO_BYTES,
  temporaryPrefix: TEMPORARY_PREFIX,
  productionBaseUrl: PRODUCTION_BASE_URL,
  authority: AUTHORITY,
  limitations: LIMITATIONS
});
