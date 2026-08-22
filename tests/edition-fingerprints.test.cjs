'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  buildFingerprintIndex,
  diffFingerprintIndex,
  serializeFingerprintIndex
} = require('../scripts/generate-edition-fingerprints.cjs');

const ROOT = path.resolve(__dirname, '..');
const dataset = JSON.parse(fs.readFileSync(path.join(ROOT, 'ai-research-tech-tree.json'), 'utf8'));

test('v1.0.0 fingerprint inventory is deterministic and complete', () => {
  const actual = buildFingerprintIndex(dataset);
  const checkedIn = fs.readFileSync(path.join(ROOT, 'src/data/editions/v1.0.0-fingerprints.json'), 'utf8');
  assert.equal(serializeFingerprintIndex(actual), checkedIn);
  assert.equal(actual.releaseVersion, '1.0.0');
  assert.equal(actual.counts.nodes, 339);
  assert.equal(actual.counts.relationships, 711);
  assert.equal(actual.semanticDigest, 'd4373ccad38b3a929cefd3a5cc61843c64d78861faae35b980a4f946219e04a7');
});

test('fingerprint serialization is independent of canonical record order', () => {
  const shuffled = structuredClone(dataset);
  shuffled.nodes.reverse();
  shuffled.relationships.reverse();
  assert.equal(
    serializeFingerprintIndex(buildFingerprintIndex(shuffled)),
    serializeFingerprintIndex(buildFingerprintIndex(dataset))
  );
});

test('current UI-only candidate reports zero semantic changes', () => {
  const baseline = buildFingerprintIndex(dataset);
  assert.deepEqual(diffFingerprintIndex(dataset, baseline), {
    nodes: { added: [], removed: [], changed: [] },
    relationships: { added: [], removed: [], changed: [] }
  });
});

test('diff classifies added, removed, and changed stable IDs', () => {
  const baseline = buildFingerprintIndex(dataset);
  const changed = structuredClone(dataset);
  changed.nodes[0].claimFingerprint = '00000000';
  changed.nodes.shift();
  changed.nodes.push({ id: 'future-node', claimFingerprint: '11111111' });
  changed.relationships[0].claimFingerprint = '22222222';
  const result = diffFingerprintIndex(changed, baseline);
  assert.deepEqual(result.nodes.added, ['future-node']);
  assert.deepEqual(result.nodes.removed, ['markov']);
  assert.deepEqual(result.nodes.changed, []);
  assert.deepEqual(result.relationships.changed, ['logicprog>godel:dep']);
});

test('diff reports a fingerprint mutation under the same stable ID', () => {
  const baseline = buildFingerprintIndex(dataset);
  const changed = structuredClone(dataset);
  changed.nodes.find(node => node.id === 'markov').claimFingerprint = '00000000';
  const result = diffFingerprintIndex(changed, baseline);
  assert.deepEqual(result.nodes, { added: [], removed: [], changed: ['markov'] });
  assert.deepEqual(result.relationships, { added: [], removed: [], changed: [] });
});

test('diff accepts a checked-in fingerprint index as the baseline', () => {
  const baseline = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'src/data/editions/v1.0.0-fingerprints.json'),
    'utf8'
  ));
  assert.deepEqual(diffFingerprintIndex(dataset, baseline), {
    nodes: { added: [], removed: [], changed: [] },
    relationships: { added: [], removed: [], changed: [] }
  });
});

test('browser diff contract lazy-loads the same-origin baseline on demand', async () => {
  const module = await import('../src/data/editions/edition-diff.mjs');
  assert.equal(module.BASELINE_FINGERPRINT_URL, './data/editions/v1.0.0-fingerprints.json');
  const baseline = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'src/data/editions/v1.0.0-fingerprints.json'),
    'utf8'
  ));
  let calls = 0;
  let request;
  const loaded = await module.loadFingerprintIndex({
    baseUrl: 'https://atlas.example/research/',
    fetchImpl: async (url, options) => {
      calls += 1;
      request = { url, options };
      return { ok: true, async json() { return baseline; } };
    }
  });
  assert.equal(calls, 1);
  assert.equal(request.url, 'https://atlas.example/research/data/editions/v1.0.0-fingerprints.json');
  assert.deepEqual(request.options, { credentials: 'same-origin' });
  assert.equal(loaded.semanticDigest, baseline.semanticDigest);
  await assert.rejects(
    module.loadFingerprintIndex({
      url: 'https://other.example/fingerprints.json',
      baseUrl: 'https://atlas.example/research/',
      fetchImpl: async () => ({ ok: true, async json() { return baseline; } })
    }),
    /same-origin/u
  );
});

test('fingerprint generation fails closed on missing or duplicate identity', () => {
  const missing = structuredClone(dataset);
  delete missing.nodes[0].claimFingerprint;
  assert.throws(() => buildFingerprintIndex(missing), /lacks a canonical claim fingerprint/u);

  const duplicate = structuredClone(dataset);
  duplicate.nodes[1].id = duplicate.nodes[0].id;
  assert.throws(() => buildFingerprintIndex(duplicate), /duplicate id/u);
});
