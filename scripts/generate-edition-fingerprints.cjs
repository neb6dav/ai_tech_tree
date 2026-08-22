#!/usr/bin/env node
'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = '1.0.0';
const DEFAULT_RELEASE_VERSION = '1.0.0';
const DEFAULT_INPUT = 'ai-research-tech-tree.json';
const DEFAULT_OUTPUT = 'src/data/editions/v1.0.0-fingerprints.json';
const FINGERPRINT_PATTERN = /^[0-9a-f]{8}$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

function compareIds(left, right) {
  // Pin the collation locale. The v1.0.0 digest was generated with the
  // runtime's en-US collation; making that locale explicit keeps regeneration
  // stable when a machine's ambient locale differs.
  return ID_COLLATOR.compare(left, right);
}

const ID_COLLATOR = new Intl.Collator('en-US', { numeric: false, sensitivity: 'variant' });

function sortedEntries(map) {
  return Object.entries(map).sort(([left], [right]) => compareIds(left, right));
}

function fail(message) {
  throw new Error(`edition-fingerprints: ${message}`);
}

function assertRecordArray(records, label) {
  if (!Array.isArray(records)) fail(`${label} must be an array`);
  const fingerprints = new Map();
  for (const record of records) {
    const id = record?.id;
    const fingerprint = record?.claimFingerprint;
    if (typeof id !== 'string' || id.length === 0) fail(`${label} contains a record without a stable id`);
    if (!FINGERPRINT_PATTERN.test(fingerprint || '')) fail(`${label} ${id} lacks a canonical claim fingerprint`);
    if (fingerprints.has(id)) fail(`${label} contains duplicate id ${id}`);
    fingerprints.set(id, fingerprint);
  }
  return Object.fromEntries(sortedEntries(Object.fromEntries(fingerprints)));
}

function semanticDigest(nodes, relationships) {
  const canonical = JSON.stringify({ nodes: sortedEntries(nodes), relationships: sortedEntries(relationships) });
  return createHash('sha256').update(canonical).digest('hex');
}

function assertFingerprintMap(map, label) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) fail(`${label} must be an object`);
  const normalized = {};
  for (const [id, fingerprint] of Object.entries(map)) {
    if (typeof id !== 'string' || id.length === 0) fail(`${label} contains a record without a stable id`);
    if (!FINGERPRINT_PATTERN.test(fingerprint || '')) {
      fail(`${label} ${id} lacks a canonical claim fingerprint`);
    }
    normalized[id] = fingerprint;
  }
  return Object.fromEntries(sortedEntries(normalized));
}

function normalizeFingerprintSource(source, label) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    fail(`${label} must be an object`);
  }
  return {
    nodes: Array.isArray(source.nodes)
      ? assertRecordArray(source.nodes, `${label}.nodes`)
      : assertFingerprintMap(source.nodes, `${label}.nodes`),
    relationships: Array.isArray(source.relationships)
      ? assertRecordArray(source.relationships, `${label}.relationships`)
      : assertFingerprintMap(source.relationships, `${label}.relationships`)
  };
}

function assertFingerprintIndex(index, label = 'fingerprint index') {
  if (!index || typeof index !== 'object' || Array.isArray(index)) fail(`${label} must be an object`);
  if (index.schemaVersion !== undefined && index.schemaVersion !== SCHEMA_VERSION) {
    fail(`${label} schemaVersion must be ${SCHEMA_VERSION}`);
  }
  const normalized = normalizeFingerprintSource(index, label);
  if (index.counts !== undefined) {
    if (!index.counts || index.counts.nodes !== Object.keys(normalized.nodes).length ||
      index.counts.relationships !== Object.keys(normalized.relationships).length) {
      fail(`${label} counts do not match fingerprint maps`);
    }
  }
  if (index.semanticDigest !== undefined && !DIGEST_PATTERN.test(index.semanticDigest)) {
    fail(`${label} semanticDigest must be a SHA-256 hexadecimal digest`);
  }
  return normalized;
}

function buildFingerprintIndex(dataset, options = {}) {
  if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset)) fail('dataset must be an object');
  const edition = dataset.dataset?.edition;
  if (typeof edition !== 'string' || edition.length === 0) fail('dataset edition is required');
  const releaseVersion = options.releaseVersion || DEFAULT_RELEASE_VERSION;
  if (!/^\d+\.\d+\.\d+$/u.test(releaseVersion)) fail('releaseVersion must be semantic version text');

  const nodes = assertRecordArray(dataset.nodes, 'nodes');
  const relationships = assertRecordArray(dataset.relationships, 'relationships');
  return {
    schemaVersion: SCHEMA_VERSION,
    releaseVersion,
    edition,
    generatedFrom: DEFAULT_INPUT,
    counts: {
      nodes: Object.keys(nodes).length,
      relationships: Object.keys(relationships).length
    },
    semanticDigest: semanticDigest(nodes, relationships),
    nodes,
    relationships
  };
}

function serializeFingerprintIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}

function diffFingerprintIndex(dataset, baseline) {
  const normalizeDiffSource = (source, label) => {
    if (source && !Array.isArray(source.nodes) &&
      (source.schemaVersion !== undefined || source.counts !== undefined || source.semanticDigest !== undefined)) {
      return assertFingerprintIndex(source, label);
    }
    return normalizeFingerprintSource(source, label);
  };
  const current = normalizeDiffSource(dataset, 'current');
  const prior = normalizeDiffSource(baseline || {}, 'baseline');

  function compare(current, prior) {
    const currentIds = new Set(Object.keys(current));
    const priorIds = new Set(Object.keys(prior));
    return {
      added: [...currentIds].filter(id => !priorIds.has(id)).sort(compareIds),
      removed: [...priorIds].filter(id => !currentIds.has(id)).sort(compareIds),
      changed: [...currentIds].filter(id => priorIds.has(id) && current[id] !== prior[id]).sort(compareIds)
    };
  }

  return {
    nodes: compare(current.nodes, prior.nodes),
    relationships: compare(current.relationships, prior.relationships)
  };
}

function main(argv = process.argv.slice(2)) {
  const repositoryRoot = path.resolve(__dirname, '..');
  const input = path.resolve(repositoryRoot, argv[0] || DEFAULT_INPUT);
  const output = path.resolve(repositoryRoot, argv[1] || DEFAULT_OUTPUT);
  const dataset = JSON.parse(fs.readFileSync(input, 'utf8'));
  const index = buildFingerprintIndex(dataset);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, serializeFingerprintIndex(index), 'utf8');
  process.stdout.write(`${JSON.stringify({ status: 'GENERATED', output: path.relative(repositoryRoot, output), ...index.counts, semanticDigest: index.semanticDigest }, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  SCHEMA_VERSION,
  DEFAULT_INPUT,
  DEFAULT_OUTPUT,
  FINGERPRINT_PATTERN,
  semanticDigest,
  assertFingerprintIndex,
  buildFingerprintIndex,
  diffFingerprintIndex,
  serializeFingerprintIndex
};
