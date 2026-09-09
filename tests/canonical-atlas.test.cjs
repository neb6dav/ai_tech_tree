'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = path.join(ROOT, 'src', 'data', 'atlas');
const {
  LANE_ORDER,
  loadCanonicalAtlas
} = require('../canonical-atlas.js');
const {
  buildExports,
  safeJson
} = require('../generate-knowledge-graph.js');
const {
  buildLayout,
  serializeLayout
} = require('../generate-network-layout.js');

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n');
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function withFixture(mutate, assertion) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tree-canonical-atlas-'));
  const fixtureData = path.join(fixtureRoot, 'atlas');
  try {
    fs.cpSync(DATA_ROOT, fixtureData, { recursive: true, errorOnExist: true });
    mutate(fixtureData);
    assertion(fixtureData);
  } finally {
    assert(fixtureRoot.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

test('canonical shadow assembles the exact legacy semantic model', () => {
  const canonical = loadCanonicalAtlas();

  const legacy = canonical.legacyModel;
  assert.equal(legacy.nodes.filter(node => node.statusProfile.kind === 'development').length, 324);
  assert.equal(legacy.nodes.filter(node => node.statusProfile.kind === 'open_direction').length, 15);
  assert.equal(legacy.relationships.length, 711);
  assert.equal(legacy.nodes.length, 339);
  assert.deepEqual(canonical.catalog.eras, legacy.eras);
  assert.deepEqual(canonical.catalog.relationshipTypes, legacy.relationshipTypes);
  assert.deepEqual(canonical.sidecars.researchGuide.data, legacy.researchGuide);
  assert.deepEqual(canonical.sidecars.wikipediaAudit.data, legacy.wikipediaAudit);
  assert.equal(canonical.nodes.length, 339);
  assert.equal(canonical.relationships.length, 711);
  assert.deepEqual(canonical.catalog.lanes.map(lane => lane.id), LANE_ORDER);
  assert.deepEqual(canonical.nodes.map(node => node.ordinal), Array.from({ length: 339 }, (_, index) => index));
  assert.deepEqual(canonical.relationships.map(edge => edge.ordinal), Array.from({ length: 711 }, (_, index) => index));

  const nodeById = new Map(canonical.nodes.map(node => [node.id, node]));
  const relationshipLaneByKey = new Map();
  for (const shard of canonical.manifest.relationshipShards) {
    for (const edge of readJson(path.join(DATA_ROOT, shard.file)).relationships) {
      relationshipLaneByKey.set(edge.key, shard.laneId);
    }
  }
  for (const edge of canonical.relationships) {
    assert.equal(edge.direction, 'source_to_target');
    assert.equal(edge.lifecycle, 'active');
    assert.deepEqual(edge.displayScope, ['timeline', 'network']);
    assert.equal(edge.reviewState, edge.reviewed ? 'reviewed' : 'unreviewed');
    assert.equal(nodeById.get(edge.targetNodeId).laneId, relationshipLaneByKey.get(edge.key));
  }
});

test('Wikipedia audit edges are a canonical-only projection', () => {
  const canonical = loadCanonicalAtlas();
  const canonicalRelationshipKeys = new Set(canonical.relationships.map(edge => edge.key));
  const auditEdges = canonical.sidecars.wikipediaAudit.data.edges;

  assert.equal(Object.hasOwn(auditEdges, 'multimodal>rtfm:dep'), false);
  for (const key of Object.keys(auditEdges)) {
    assert.equal(canonicalRelationshipKeys.has(key), true, `orphan Wikipedia audit edge: ${key}`);
  }
});

test('loader fails closed when a Wikipedia audit edge is not canonical', () => {
  withFixture(
    fixture => {
      const file = path.join(fixture, 'wikipedia-audit.json');
      const sidecar = readJson(file);
      sidecar.data.edges['multimodal>rtfm:dep'] = {
        state: 'indirect',
        confidence: 'medium',
        note: 'fixture orphan',
        sources: []
      };
      writeJson(file, sidecar);
    },
    fixture => assert.throws(
      () => loadCanonicalAtlas({ dataRoot: fixture }),
      /wikipedia audit edge multimodal>rtfm:dep does not reference a canonical relationship/u
    )
  );
});

test('canonical shadow reproduces every generated dataset byte and layout byte', () => {
  const canonical = loadCanonicalAtlas();
  const { plain, datasetGraph, ndjsonRecords } = buildExports(canonical.legacyModel);
  const plainBody = `${JSON.stringify(plain, null, 2)}\n`;
  const jsonLdBody = safeJson(datasetGraph);
  const ndjsonBody = `${ndjsonRecords.map(record => JSON.stringify(record)).join('\n')}\n`;
  const layoutBody = serializeLayout(buildLayout(plain));

  assert.equal(plainBody, read('ai-research-tech-tree.json'));
  assert.equal(jsonLdBody, read('ai-research-tech-tree.jsonld'));
  assert.equal(ndjsonBody, read('ai-research-tech-tree.ndjson'));
  assert.equal(layoutBody, read('network-layout-v1.json'));
  assert.equal(plain.dataset.dataDigest, canonical.manifest.expected.dataDigest);
  assert.equal(sha256(plainBody), '6b70ef24ee62f96b5564284ac1877d90e3dd00472de4a093fdcd8ecbb5c09468');
  assert.equal(sha256(jsonLdBody), 'c5e83de813a88a19093b1c829ae6bc18c600af0fd2bfc00a800f0bc34f48549c');
  assert.equal(sha256(ndjsonBody), '6aa6124136ce56aab0ecaa4745d0f23d32fb286253a13c5c76946e17b4179e72');
  assert.equal(sha256(layoutBody), 'f3b888046699599fbfb95b6c32ab55dc128f58d7a1dd2bf7d9f8b7d1c3bde120');
});

test('no-script index exposes canonical ordered node links', () => {
  const canonical = loadCanonicalAtlas();
  const html = read('index.html');
  const body = /<noscript>[\s\S]*?<ul>([\s\S]*?)<\/ul>/i.exec(html)?.[1];
  assert(body, 'canonical no-script node list is missing');
  const rows = [...body.matchAll(/<li>[\s\S]*?<\/li>/g)].map(match => match[0]);

  assert.deepEqual(canonical.sidecars.noScript.rows.map(row => row.nodeId), canonical.nodes.map(node => node.id));
  assert.deepEqual(rows.map(row => row.match(/href="\.\/nodes\/([^/]+)\/"/)?.[1]), canonical.nodes.map(node => node.id));
});

test('loader fails closed when a required shard is missing', () => {
  withFixture(
    fixture => fs.rmSync(path.join(fixture, 'nodes', 'roots.json')),
    fixture => assert.throws(() => loadCanonicalAtlas({ dataRoot: fixture }), /could not be read/u)
  );
});

test('loader rejects duplicate node identity and ordinal ownership', () => {
  withFixture(
    fixture => {
      const file = path.join(fixture, 'nodes', 'roots.json');
      const shard = readJson(file);
      shard.nodes[1].id = shard.nodes[0].id;
      shard.nodes[1].ordinal = shard.nodes[0].ordinal;
      writeJson(file, shard);
    },
    fixture => assert.throws(() => loadCanonicalAtlas({ dataRoot: fixture }), /node ordinals are not dense|duplicate canonical node id/u)
  );
});

test('loader rejects relationship placement outside the target-node lane', () => {
  withFixture(
    fixture => {
      const manifestFile = path.join(fixture, 'manifest.json');
      const manifest = readJson(manifestFile);
      const rootsFile = path.join(fixture, 'relationships', 'roots.json');
      const symbolicFile = path.join(fixture, 'relationships', 'symbolic.json');
      const roots = readJson(rootsFile);
      const symbolic = readJson(symbolicFile);
      symbolic.relationships.push(roots.relationships.shift());
      manifest.relationshipShards[0].count = roots.relationships.length;
      manifest.relationshipShards[1].count = symbolic.relationships.length;
      writeJson(rootsFile, roots);
      writeJson(symbolicFile, symbolic);
      writeJson(manifestFile, manifest);
    },
    fixture => assert.throws(() => loadCanonicalAtlas({ dataRoot: fixture }), /not sharded by target-node lane/u)
  );
});

test('loader rejects mixed-authority path substitution', () => {
  withFixture(
    fixture => {
      const manifestFile = path.join(fixture, 'manifest.json');
      const manifest = readJson(manifestFile);
      manifest.nodeShards[0].file = '../../ai-research-tech-tree.html';
      writeJson(manifestFile, manifest);
    },
    fixture => assert.throws(() => loadCanonicalAtlas({ dataRoot: fixture }), /file is not canonical|escapes the atlas root/u)
  );
});

test('loader rejects relationship-origin drift and incomplete no-script projection', () => {
  withFixture(
    fixture => {
      const file = path.join(fixture, 'relationships', 'roots.json');
      const shard = readJson(file);
      shard.relationships[0].origin = shard.relationships[0].origin === 'curated_map' ? 'research_extension' : 'curated_map';
      writeJson(file, shard);
    },
    fixture => assert.throws(() => loadCanonicalAtlas({ dataRoot: fixture }), /origin disagrees/u)
  );

  withFixture(
    fixture => {
      const file = path.join(fixture, 'no-script.json');
      const sidecar = readJson(file);
      sidecar.rows.pop();
      writeJson(file, sidecar);
    },
    fixture => assert.throws(() => loadCanonicalAtlas({ dataRoot: fixture }), /must cover every node/u)
  );
});

test('legacy parity detects semantic drift in every declared canonical sidecar', () => {
  const legacy = loadCanonicalAtlas().legacyModel;

  withFixture(
    fixture => {
      const file = path.join(fixture, 'research-guide.json');
      const sidecar = readJson(file);
      sidecar.data.scope = 'stale replacement scope';
      writeJson(file, sidecar);
    },
    fixture => assert.notDeepEqual(loadCanonicalAtlas({ dataRoot: fixture }).legacyModel, legacy)
  );

  withFixture(
    fixture => {
      const file = path.join(fixture, 'wikipedia-audit.json');
      const sidecar = readJson(file);
      sidecar.data.scope = 'stale replacement scope';
      writeJson(file, sidecar);
    },
    fixture => assert.notDeepEqual(loadCanonicalAtlas({ dataRoot: fixture }).legacyModel, legacy)
  );

  withFixture(
    fixture => {
      const file = path.join(fixture, 'catalog.json');
      const catalog = readJson(file);
      catalog.eras[0].n = 'Stale era label';
      writeJson(file, catalog);
    },
    fixture => assert.notDeepEqual(loadCanonicalAtlas({ dataRoot: fixture }).legacyModel, legacy)
  );

  withFixture(
    fixture => {
      const file = path.join(fixture, 'catalog.json');
      const catalog = readJson(file);
      catalog.relationshipTypes.prerequisite.label = 'Stale relationship label';
      writeJson(file, catalog);
    },
    fixture => assert.notDeepEqual(loadCanonicalAtlas({ dataRoot: fixture }).legacyModel, legacy)
  );
});
