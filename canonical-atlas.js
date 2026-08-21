'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const DEFAULT_DATA_ROOT = path.join(ROOT, 'src', 'data', 'atlas');
const SCHEMA_VERSION = '1.0.0';
const LANE_ORDER = Object.freeze([
  'roots',
  'symbolic',
  'search',
  'rl',
  'neural',
  'training',
  'language',
  'vision',
  'generative',
  'prob',
  'alt',
  'robotics',
  'safety',
  'systems',
  'science'
]);

const NODE_KEYS = Object.freeze([
  'ordinal',
  'id',
  'title',
  'year',
  'laneId',
  'classificationCode',
  'description',
  'dateOverride',
  'statusProfile',
  'audit',
  'auditRecordPresent',
  'research',
  'questions',
  'direction',
  'claimFingerprint'
]);

const RELATIONSHIP_KEYS = Object.freeze([
  'ordinal',
  'key',
  'sourceNodeId',
  'targetNodeId',
  'legacyKind',
  'relationshipType',
  'rationale',
  'reviewed',
  'reviewState',
  'evidenceGrade',
  'audit',
  'auditRecordPresent',
  'claimFingerprint',
  'lifecycle',
  'origin',
  'direction',
  'displayScope'
]);

const LEGACY_STATE_KEYS = Object.freeze([
  'researchExtensionEdgeKeys',
  'auditSummary',
  'researchSummary',
  'graphValidation',
  'auditHasWarnings',
  'auditValidation',
  'researchValidation',
  'researchReviewQueue',
  'compositeDateReviewIds'
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertPlainObject(value, label) {
  assert(isPlainObject(value), `${label} must be an object`);
}

function assertOnlyKeys(value, expected, label) {
  assertPlainObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert.deepEqual(actual, wanted, `${label} has unexpected or missing keys`);
}

function assertText(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
}

function assertSafeId(value, label) {
  assertText(value, label);
  assert(/^[a-z0-9][a-z0-9_-]*$/.test(value), `${label} is not a safe identifier`);
}

function readJson(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`${label} could not be read at ${file}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON at ${file}: ${error.message}`);
  }
}

function resolveDataFile(dataRoot, relative, label) {
  assertText(relative, `${label}.file`);
  assert(!path.isAbsolute(relative), `${label}.file must be relative`);
  const normalized = relative.replace(/\\/g, '/');
  assert(normalized === path.posix.normalize(normalized), `${label}.file is not normalized`);
  assert(!normalized.startsWith('../') && normalized !== '..', `${label}.file escapes the atlas root`);
  const resolvedRoot = path.resolve(dataRoot);
  const resolved = path.resolve(resolvedRoot, ...normalized.split('/'));
  assert(resolved.startsWith(`${resolvedRoot}${path.sep}`), `${label}.file escapes the atlas root`);
  return resolved;
}

function validateManifest(manifest) {
  assertOnlyKeys(
    manifest,
    ['schemaVersion', 'laneOrder', 'nodeShards', 'relationshipShards', 'sidecars', 'expected'],
    'manifest'
  );
  assert.equal(manifest.schemaVersion, SCHEMA_VERSION, 'manifest.schemaVersion is unsupported');
  assert.deepEqual(manifest.laneOrder, LANE_ORDER, 'manifest.laneOrder must be the approved 15-lane order');
  assert(Array.isArray(manifest.nodeShards), 'manifest.nodeShards must be an array');
  assert(Array.isArray(manifest.relationshipShards), 'manifest.relationshipShards must be an array');
  assert.equal(manifest.nodeShards.length, LANE_ORDER.length, 'manifest must name exactly 15 node shards');
  assert.equal(manifest.relationshipShards.length, LANE_ORDER.length, 'manifest must name exactly 15 relationship shards');

  for (const [kind, shards] of [['node', manifest.nodeShards], ['relationship', manifest.relationshipShards]]) {
    shards.forEach((entry, index) => {
      const label = `manifest.${kind}Shards[${index}]`;
      assertOnlyKeys(entry, ['laneId', 'file', 'count'], label);
      assert.equal(entry.laneId, LANE_ORDER[index], `${label}.laneId is out of order`);
      assert.equal(entry.file, `${kind === 'node' ? 'nodes' : 'relationships'}/${entry.laneId}.json`, `${label}.file is not canonical`);
      assert(Number.isInteger(entry.count) && entry.count >= 0, `${label}.count must be a non-negative integer`);
    });
  }

  assertOnlyKeys(
    manifest.sidecars,
    ['catalog', 'directions', 'researchGuide', 'wikipediaAudit', 'reviewFingerprints', 'noScript'],
    'manifest.sidecars'
  );
  assert.deepEqual(manifest.sidecars, {
    catalog: 'catalog.json',
    directions: 'directions.json',
    researchGuide: 'research-guide.json',
    wikipediaAudit: 'wikipedia-audit.json',
    reviewFingerprints: 'review-fingerprints.json',
    noScript: 'no-script.json'
  }, 'manifest.sidecars must use the canonical fixed paths');
  assertOnlyKeys(manifest.expected, ['nodes', 'relationships', 'dataDigest'], 'manifest.expected');
  assert.equal(manifest.expected.nodes, 339, 'manifest expected node count changed');
  assert.equal(manifest.expected.relationships, 711, 'manifest expected relationship count changed');
  assert.match(manifest.expected.dataDigest, /^[0-9a-f]{64}$/, 'manifest.expected.dataDigest must be SHA-256');
}

function validateCatalog(catalog) {
  assertOnlyKeys(
    catalog,
    ['schemaVersion', 'project', 'lanes', 'classifications', 'eras', 'relationshipTypes', 'legacyModelState'],
    'catalog'
  );
  assert.equal(catalog.schemaVersion, SCHEMA_VERSION, 'catalog.schemaVersion is unsupported');
  assertPlainObject(catalog.project, 'catalog.project');
  assert(Array.isArray(catalog.lanes), 'catalog.lanes must be an array');
  assert.deepEqual(catalog.lanes.map(lane => lane.id), LANE_ORDER, 'catalog lanes differ from manifest lane order');
  catalog.lanes.forEach((lane, index) => {
    assertOnlyKeys(lane, ['id', 'n'], `catalog.lanes[${index}]`);
    assertText(lane.n, `catalog.lanes[${index}].n`);
  });
  assertPlainObject(catalog.classifications, 'catalog.classifications');
  assert(Array.isArray(catalog.eras) && catalog.eras.length > 0, 'catalog.eras must be a non-empty array');
  assertPlainObject(catalog.relationshipTypes, 'catalog.relationshipTypes');
  assertOnlyKeys(catalog.legacyModelState, LEGACY_STATE_KEYS, 'catalog.legacyModelState');
  assert(Array.isArray(catalog.legacyModelState.researchExtensionEdgeKeys), 'researchExtensionEdgeKeys must be an array');
  assert.equal(catalog.legacyModelState.auditHasWarnings, false, 'shadow source contains audit warnings');
}

function validateSidecarEnvelope(value, label) {
  assertOnlyKeys(value, ['schemaVersion', 'data'], label);
  assert.equal(value.schemaVersion, SCHEMA_VERSION, `${label}.schemaVersion is unsupported`);
  assertPlainObject(value.data, `${label}.data`);
}

function validateNode(record, shardLane, label) {
  assertOnlyKeys(record, NODE_KEYS, label);
  assert(Number.isInteger(record.ordinal) && record.ordinal >= 0, `${label}.ordinal must be non-negative`);
  assertSafeId(record.id, `${label}.id`);
  assert.equal(record.laneId, shardLane, `${label} belongs in the ${record.laneId} node shard`);
  assertText(record.title, `${label}.title`);
  assert(Number.isInteger(record.year), `${label}.year must be an integer`);
  assertText(record.classificationCode, `${label}.classificationCode`);
  assertText(record.description, `${label}.description`);
  assert(record.dateOverride === null || isPlainObject(record.dateOverride), `${label}.dateOverride must be null or an object`);
  assertPlainObject(record.statusProfile, `${label}.statusProfile`);
  assertPlainObject(record.audit, `${label}.audit`);
  assertPlainObject(record.auditRecordPresent, `${label}.auditRecordPresent`);
  assertPlainObject(record.research, `${label}.research`);
  assert(Array.isArray(record.questions), `${label}.questions must be an array`);
  assert(record.direction === null || isPlainObject(record.direction), `${label}.direction must be null or an object`);
  assert.match(record.claimFingerprint, /^[0-9a-f]{8}$/, `${label}.claimFingerprint is invalid`);
}

function validateRelationship(record, label) {
  assertOnlyKeys(record, RELATIONSHIP_KEYS, label);
  assert(Number.isInteger(record.ordinal) && record.ordinal >= 0, `${label}.ordinal must be non-negative`);
  assertText(record.key, `${label}.key`);
  assertSafeId(record.sourceNodeId, `${label}.sourceNodeId`);
  assertSafeId(record.targetNodeId, `${label}.targetNodeId`);
  assert(['dep', 'sup', 'gap'].includes(record.legacyKind), `${label}.legacyKind is invalid`);
  assert.equal(record.key, `${record.sourceNodeId}>${record.targetNodeId}:${record.legacyKind}`, `${label}.key does not match its endpoints`);
  assertText(record.relationshipType, `${label}.relationshipType`);
  assertText(record.rationale, `${label}.rationale`);
  assert.equal(typeof record.reviewed, 'boolean', `${label}.reviewed must be boolean`);
  assert.equal(record.reviewState, record.reviewed ? 'reviewed' : 'unreviewed', `${label}.reviewState disagrees with reviewed`);
  assert(['direct', 'partial', 'contextual', 'editorial', 'unassessed', 'hypothesis'].includes(record.evidenceGrade), `${label}.evidenceGrade is invalid`);
  assertPlainObject(record.audit, `${label}.audit`);
  assert.equal(typeof record.auditRecordPresent, 'boolean', `${label}.auditRecordPresent must be boolean`);
  assert.match(record.claimFingerprint, /^[0-9a-f]{8}$/, `${label}.claimFingerprint is invalid`);
  assert.equal(record.lifecycle, 'active', `${label}.lifecycle must be active in the current inventory`);
  assert(['curated_map', 'research_extension'].includes(record.origin), `${label}.origin is invalid`);
  assert.equal(record.direction, 'source_to_target', `${label}.direction is invalid`);
  assert.deepEqual(record.displayScope, ['timeline', 'network'], `${label}.displayScope is invalid`);
}

function withoutKeys(value, omitted) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !omitted.has(key)));
}

function assembleLegacyModel(canonical) {
  const state = canonical.catalog.legacyModelState;
  return {
    project: canonical.catalog.project,
    lanes: canonical.catalog.lanes,
    eras: canonical.catalog.eras,
    classifications: canonical.catalog.classifications,
    relationshipTypes: canonical.catalog.relationshipTypes,
    researchGuide: canonical.sidecars.researchGuide.data,
    wikipediaAudit: canonical.sidecars.wikipediaAudit.data,
    nodes: canonical.nodes.map(node => withoutKeys(node, new Set(['ordinal']))),
    relationships: canonical.relationships.map(relationship => withoutKeys(
      relationship,
      new Set(['ordinal', 'reviewState', 'lifecycle', 'origin', 'direction', 'displayScope'])
    )),
    researchExtensionEdgeKeys: state.researchExtensionEdgeKeys,
    auditSummary: state.auditSummary,
    researchSummary: state.researchSummary,
    graphValidation: state.graphValidation,
    auditHasWarnings: state.auditHasWarnings,
    auditValidation: state.auditValidation,
    researchValidation: state.researchValidation,
    researchReviewQueue: state.researchReviewQueue,
    compositeDateReviewIds: state.compositeDateReviewIds
  };
}

function loadCanonicalAtlas(options = {}) {
  const dataRoot = path.resolve(options.dataRoot || DEFAULT_DATA_ROOT);
  const manifest = readJson(path.join(dataRoot, 'manifest.json'), 'canonical atlas manifest');
  validateManifest(manifest);

  const catalog = readJson(resolveDataFile(dataRoot, manifest.sidecars.catalog, 'catalog'), 'canonical atlas catalog');
  validateCatalog(catalog);

  const sidecars = {};
  for (const [name, relative] of Object.entries(manifest.sidecars)) {
    if (name === 'catalog') continue;
    sidecars[name] = readJson(resolveDataFile(dataRoot, relative, name), `canonical atlas ${name}`);
  }
  for (const name of ['directions', 'researchGuide', 'wikipediaAudit']) validateSidecarEnvelope(sidecars[name], name);
  assertOnlyKeys(sidecars.reviewFingerprints, ['schemaVersion', 'nodes', 'relationships'], 'reviewFingerprints');
  assert.equal(sidecars.reviewFingerprints.schemaVersion, SCHEMA_VERSION, 'reviewFingerprints.schemaVersion is unsupported');
  assertPlainObject(sidecars.reviewFingerprints.nodes, 'reviewFingerprints.nodes');
  assertPlainObject(sidecars.reviewFingerprints.relationships, 'reviewFingerprints.relationships');
  assertOnlyKeys(sidecars.noScript, ['schemaVersion', 'rows'], 'noScript');
  assert.equal(sidecars.noScript.schemaVersion, SCHEMA_VERSION, 'noScript.schemaVersion is unsupported');
  assert(Array.isArray(sidecars.noScript.rows), 'noScript.rows must be an array');

  const nodes = [];
  for (const [index, entry] of manifest.nodeShards.entries()) {
    const label = `node shard ${entry.laneId}`;
    const shard = readJson(resolveDataFile(dataRoot, entry.file, label), label);
    assertOnlyKeys(shard, ['schemaVersion', 'laneId', 'nodes'], label);
    assert.equal(shard.schemaVersion, SCHEMA_VERSION, `${label}.schemaVersion is unsupported`);
    assert.equal(shard.laneId, entry.laneId, `${label}.laneId disagrees with the manifest`);
    assert(Array.isArray(shard.nodes), `${label}.nodes must be an array`);
    assert.equal(shard.nodes.length, entry.count, `${label} count disagrees with the manifest`);
    shard.nodes.forEach((record, recordIndex) => validateNode(record, LANE_ORDER[index], `${label}.nodes[${recordIndex}]`));
    nodes.push(...shard.nodes);
  }
  nodes.sort((left, right) => left.ordinal - right.ordinal);
  assert.equal(nodes.length, manifest.expected.nodes, 'assembled node count differs from the manifest');
  nodes.forEach((node, ordinal) => assert.equal(node.ordinal, ordinal, `node ordinals are not dense at ${ordinal}`));
  const nodeById = new Map();
  for (const node of nodes) {
    assert(!nodeById.has(node.id), `duplicate canonical node id ${node.id}`);
    nodeById.set(node.id, node);
    assert(Object.hasOwn(catalog.classifications, node.classificationCode), `node ${node.id} has unknown classification ${node.classificationCode}`);
  }

  const relationships = [];
  for (const entry of manifest.relationshipShards) {
    const label = `relationship shard ${entry.laneId}`;
    const shard = readJson(resolveDataFile(dataRoot, entry.file, label), label);
    assertOnlyKeys(shard, ['schemaVersion', 'laneId', 'relationships'], label);
    assert.equal(shard.schemaVersion, SCHEMA_VERSION, `${label}.schemaVersion is unsupported`);
    assert.equal(shard.laneId, entry.laneId, `${label}.laneId disagrees with the manifest`);
    assert(Array.isArray(shard.relationships), `${label}.relationships must be an array`);
    assert.equal(shard.relationships.length, entry.count, `${label} count disagrees with the manifest`);
    shard.relationships.forEach((record, recordIndex) => {
      validateRelationship(record, `${label}.relationships[${recordIndex}]`);
      assert(nodeById.has(record.sourceNodeId), `relationship ${record.key} has unknown source node`);
      assert(nodeById.has(record.targetNodeId), `relationship ${record.key} has unknown target node`);
      assert.equal(nodeById.get(record.targetNodeId).laneId, entry.laneId, `relationship ${record.key} is not sharded by target-node lane`);
    });
    relationships.push(...shard.relationships);
  }
  relationships.sort((left, right) => left.ordinal - right.ordinal);
  assert.equal(relationships.length, manifest.expected.relationships, 'assembled relationship count differs from the manifest');
  relationships.forEach((relationship, ordinal) => assert.equal(relationship.ordinal, ordinal, `relationship ordinals are not dense at ${ordinal}`));
  const relationshipByKey = new Map();
  for (const relationship of relationships) {
    assert(!relationshipByKey.has(relationship.key), `duplicate canonical relationship key ${relationship.key}`);
    relationshipByKey.set(relationship.key, relationship);
  }

  const extensionKeys = new Set(catalog.legacyModelState.researchExtensionEdgeKeys);
  assert.equal(extensionKeys.size, catalog.legacyModelState.researchExtensionEdgeKeys.length, 'research extension keys are duplicated');
  relationships.forEach(relationship => {
    assert.equal(
      relationship.origin,
      extensionKeys.has(relationship.key) ? 'research_extension' : 'curated_map',
      `relationship ${relationship.key} origin disagrees with the legacy research extension registry`
    );
  });

  const nodeFingerprintKeys = Object.keys(sidecars.reviewFingerprints.nodes).sort();
  const relationshipFingerprintKeys = Object.keys(sidecars.reviewFingerprints.relationships).sort();
  assert.deepEqual(nodeFingerprintKeys, [...nodeById.keys()].sort(), 'node fingerprint coverage differs from node inventory');
  assert.deepEqual(relationshipFingerprintKeys, [...relationshipByKey.keys()].sort(), 'relationship fingerprint coverage differs from relationship inventory');
  nodes.forEach(node => assert.equal(sidecars.reviewFingerprints.nodes[node.id], node.claimFingerprint, `node ${node.id} fingerprint differs from its sidecar`));
  relationships.forEach(relationship => assert.equal(sidecars.reviewFingerprints.relationships[relationship.key], relationship.claimFingerprint, `relationship ${relationship.key} fingerprint differs from its sidecar`));

  const directionIds = nodes.filter(node => node.direction !== null).map(node => node.id).sort();
  assert.deepEqual(Object.keys(sidecars.directions.data).sort(), directionIds, 'direction sidecar coverage differs from canonical direction nodes');
  nodes.filter(node => node.direction !== null).forEach(node => {
    assert.deepEqual(sidecars.directions.data[node.id], node.direction, `direction sidecar differs for ${node.id}`);
  });

  assert.equal(sidecars.noScript.rows.length, nodes.length, 'no-script projection must cover every node');
  sidecars.noScript.rows.forEach((row, ordinal) => {
    const label = `noScript.rows[${ordinal}]`;
    assertOnlyKeys(row, ['ordinal', 'nodeId', 'rowHtml'], label);
    assert.equal(row.ordinal, ordinal, `${label}.ordinal is not dense`);
    assert.equal(row.nodeId, nodes[ordinal].id, `${label}.nodeId differs from canonical node order`);
    assert(typeof row.rowHtml === 'string' && /^<tr>[\s\S]*<\/tr>$/.test(row.rowHtml), `${label}.rowHtml is invalid`);
  });

  const canonical = { manifest, catalog, nodes, relationships, sidecars };
  canonical.legacyModel = assembleLegacyModel(canonical);
  return canonical;
}

module.exports = {
  DEFAULT_DATA_ROOT,
  LANE_ORDER,
  SCHEMA_VERSION,
  assembleLegacyModel,
  loadCanonicalAtlas
};
