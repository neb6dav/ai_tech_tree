'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const PROJECT_URL = new URL('https://neb6dav.github.io/ai_tech_tree/');
const JSON_EXPORT_URL = new URL('ai-research-tech-tree.json', PROJECT_URL);
const EXPECTED_NODE_COUNT = 339;

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
}

function readNdjson(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8')
    .trimEnd()
    .split('\n')
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${relative}:${index + 1}: ${error.message}`);
      }
    });
}

function expectedNodeUrl(id) {
  return `./#node=${encodeURIComponent(id)}`;
}

function assertRootNodeUrls(records, label) {
  assert.equal(records.length, EXPECTED_NODE_COUNT, `${label} atlas-entry count`);
  assert.equal(new Set(records.map(record => record.id)).size, EXPECTED_NODE_COUNT, `${label} IDs`);
  for (const record of records) {
    assert.equal(record.humanUrl, expectedNodeUrl(record.id), `${label} ${record.id}`);
    assert.equal(new URL(record.humanUrl, JSON_EXPORT_URL).origin, PROJECT_URL.origin, `${label} origin`);
    assert.equal(new URL(record.humanUrl, JSON_EXPORT_URL).pathname, PROJECT_URL.pathname, `${label} path`);
    assert(!record.humanUrl.includes('ai-research-tech-tree.html'), `${label} legacy alias: ${record.id}`);
  }
}

test('normalized JSON publishes root application URLs for the dataset and all 339 records', () => {
  const normalized = readJson('ai-research-tech-tree.json');
  assert.equal(normalized.generatorVersion, '1.3.1');
  assert.equal(normalized.dataset.humanUrl, './');
  assert.equal(new URL(normalized.dataset.humanUrl, JSON_EXPORT_URL).href, PROJECT_URL.href);
  assert.equal(normalized.dataset.canonicalUrl, PROJECT_URL.href);
  assertRootNodeUrls(normalized.nodes, 'JSON');
});

test('JSON-LD and NDJSON preserve the same 339 root destinations and dataset URL', () => {
  const normalized = readJson('ai-research-tech-tree.json');
  const jsonLd = readJson('ai-research-tech-tree.jsonld');
  const ndjson = readNdjson('ai-research-tech-tree.ndjson');
  const expectedById = new Map(normalized.nodes.map(node => [node.id, node.humanUrl]));

  const jsonLdNodes = jsonLd['@graph']
    .filter(entity => entity['tree:recordType'] === 'atlasEntry')
    .map(entity => ({
      id: entity['schema:identifier'],
      humanUrl: entity['schema:url']?.['@id']
    }));
  assertRootNodeUrls(jsonLdNodes, 'JSON-LD');

  const ndjsonDataset = ndjson.filter(record => record.recordType === 'dataset');
  assert.equal(ndjsonDataset.length, 1);
  assert.equal(ndjsonDataset[0].dataset.humanUrl, './');
  assert.equal(ndjsonDataset[0].dataset.canonicalUrl, PROJECT_URL.href);
  const ndjsonNodes = ndjson
    .filter(record => record.recordType === 'atlasEntry')
    .map(({ id, humanUrl }) => ({ id, humanUrl }));
  assertRootNodeUrls(ndjsonNodes, 'NDJSON');

  for (const records of [jsonLdNodes, ndjsonNodes]) {
    for (const record of records) {
      assert.equal(record.humanUrl, expectedById.get(record.id), `Cross-format URL for ${record.id}`);
    }
  }

  assert.equal(jsonLd['schema:url']?.['@id'], PROJECT_URL.href);
});

test('cross-format URL guard rejects legacy aliases and misdirected record IDs', () => {
  const normalized = readJson('ai-research-tech-tree.json');
  const legacyMutation = normalized.nodes.map(node => ({ ...node }));
  legacyMutation[0].humanUrl = `./ai-research-tech-tree.html#node=${legacyMutation[0].id}`;
  assert.throws(() => assertRootNodeUrls(legacyMutation, 'legacy mutation'), /legacy mutation/);

  const ownershipMutation = normalized.nodes.map(node => ({ ...node }));
  ownershipMutation[0].humanUrl = expectedNodeUrl(ownershipMutation[1].id);
  assert.throws(() => assertRootNodeUrls(ownershipMutation, 'ownership mutation'), /ownership mutation/);
});
