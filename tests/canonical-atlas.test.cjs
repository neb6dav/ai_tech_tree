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
  applyCanonicalAtlas,
  buildExports,
  buildCanonicalArtifacts,
  extractModel,
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

function replaceOnce(value, pattern, replacement, label) {
  const matches = [...value.matchAll(pattern)];
  assert.equal(matches.length, 1, `${label} replacement count changed`);
  return value.replace(pattern, replacement);
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
  const legacy = extractModel(read('ai-research-tech-tree.html'));
  const canonical = loadCanonicalAtlas();

  assert.deepEqual(canonical.legacyModel, legacy);
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
  assert.equal(sha256(plainBody), 'e9163737adc8cc20a642c03ca1625f2c7969037e0ef5b8daf3007f9fa9ee3155');
  assert.equal(sha256(jsonLdBody), '37681fc2ff49ec07eab825a983e0baf0338d9c317587783a72d7c94cd55c7d4d');
  assert.equal(sha256(ndjsonBody), 'e2ed848e1e937fa8c929d02b9372bc3431ba8446981efe3b63b0582616cfe449');
  assert.equal(sha256(layoutBody), 'f3b888046699599fbfb95b6c32ab55dc128f58d7a1dd2bf7d9f8b7d1c3bde120');
});

test('canonical cutover atomically restores every embedded data projection byte', () => {
  const canonical = loadCanonicalAtlas();
  const html = read('ai-research-tech-tree.html');
  assert.equal(applyCanonicalAtlas(html, canonical), html);

  let projectionCount = 0;
  let poisoned = html.replace(
    /(\/\* ============ [^\r\n]+ ============ \*\/\n)P\(\n[\s\S]*?\n\);/g,
    (_match, heading) => {
      projectionCount += 1;
      return `${heading}P(\n{"id":"stale-${projectionCount}"}\n);`;
    }
  );
  assert.equal(projectionCount, 16, 'all 15 lanes and the research-expansion projection must be poisoned');
  poisoned = replaceOnce(
    poisoned,
    /(const WIKI_AUDIT = Object\.freeze\()[^\r\n]*(\);\n<\/script>)/g,
    '$1{}$2',
    'Wikipedia audit'
  );
  poisoned = replaceOnce(
    poisoned,
    /(const RESEARCH_GUIDE=Object\.freeze\()[^\r\n]*(\);\n<\/script>)/g,
    '$1{}$2',
    'research guide'
  );
  poisoned = replaceOnce(
    poisoned,
    /(<noscript><style>#bootPending\{display:none!important\}<\/style><section id="noscript"[\s\S]*?<tbody>)[\s\S]*?(<\/tbody><\/table><\/div><\/section><\/noscript>)/g,
    '$1<tr><td>stale</td></tr>$2',
    'no-script index'
  );
  poisoned = replaceOnce(
    poisoned,
    /const STATUS = \{[\s\S]*?const ERAS = \[[\s\S]*?\];(?=\n\n\/\* ---------- editorial model, chronology and validation ---------- \*\/)/g,
    'const STATUS = {};\nconst LANES = [];\nconst ERAS = [];',
    'catalog'
  );
  poisoned = replaceOnce(poisoned, /const PROJECT_META=Object\.freeze\([\s\S]*?\);(?=\nconst DATE_OVERRIDES=)/g, 'const PROJECT_META=Object.freeze({});', 'project');
  poisoned = replaceOnce(poisoned, /const DATE_OVERRIDES=Object\.freeze\([\s\S]*?\);(?=function formatNodeDate)/g, 'const DATE_OVERRIDES=Object.freeze({});', 'date overrides');
  poisoned = replaceOnce(poisoned, /const DESCRIPTION_REPAIRS=Object\.freeze\([\s\S]*?\);(?=Object\.entries\(DESCRIPTION_REPAIRS\))/g, 'const DESCRIPTION_REPAIRS=Object.freeze({});', 'description repairs');
  poisoned = replaceOnce(
    poisoned,
    /const RELATION_TYPES=Object\.freeze\([\s\S]*?\);const EDGE_META_OVERRIDES=Object\.freeze\([\s\S]*?\);(?=function structuralEdgeMeta)/g,
    'const RELATION_TYPES=Object.freeze({});const EDGE_META_OVERRIDES=Object.freeze({});',
    'relationship metadata'
  );
  poisoned = replaceOnce(poisoned, /(const DIRECTION_CARD_DATA=)[^\r\n]*(;\nfunction frozenList)/g, '$1{}$2', 'direction cards');
  poisoned = replaceOnce(
    poisoned,
    /PAPER_ROLE_OVERRIDES=Object\.freeze\([\s\S]*?\);(?=let activeResearchFilter=)/g,
    'PAPER_ROLE_OVERRIDES=Object.freeze({});',
    'paper role overrides'
  );
  poisoned = replaceOnce(
    poisoned,
    /const AUDIT_NODE_FINGERPRINTS=Object\.freeze\([\s\S]*?\);const AUDIT_EDGE_FINGERPRINTS=Object\.freeze\([\s\S]*?\);(?=const staleNodeFingerprintIds=)/g,
    'const AUDIT_NODE_FINGERPRINTS=Object.freeze({});const AUDIT_EDGE_FINGERPRINTS=Object.freeze({});',
    'review fingerprints'
  );
  poisoned = replaceOnce(
    poisoned,
    /(<script\b[^>]*\btype="application\/ld\+json"[^>]*>)[\s\S]*?(<\/script>)/g,
    '$1{}$2',
    'JSON-LD'
  );
  assert.notEqual(poisoned, html);

  const artifacts = buildCanonicalArtifacts(poisoned, canonical);
  assert.equal(artifacts.html, html);
  assert.equal(artifacts.jsonLdBody, read('ai-research-tech-tree.jsonld'));
  assert.equal(artifacts.plainBody, read('ai-research-tech-tree.json'));
  assert.equal(artifacts.ndjsonBody, read('ai-research-tech-tree.ndjson'));
});

test('canonical cutover fails closed instead of accepting missing or digest-drifted authority', () => {
  const html = read('ai-research-tech-tree.html');
  const missingLane = html.replace(
    /(\/\* ============ [^\r\n]+ ============ \*\/\n)P\(\n[\s\S]*?\n\);/u,
    '$1'
  );
  assert.throws(
    () => buildCanonicalArtifacts(missingLane, loadCanonicalAtlas()),
    /Expected exactly 16 canonical data projections/u
  );

  const drifted = loadCanonicalAtlas();
  drifted.manifest.expected.dataDigest = '0'.repeat(64);
  assert.throws(
    () => buildCanonicalArtifacts(html, drifted),
    /Canonical data digest changed/u
  );
});

test('canonical cutover rejects release-shell and normalized sidecar drift', () => {
  const html = read('ai-research-tech-tree.html');
  const staleVersion = html.replace(
    '<meta name="ai-tree-version" content="1.2.0">',
    '<meta name="ai-tree-version" content="stale">'
  );
  assert.notEqual(staleVersion, html);
  assert.throws(
    () => buildCanonicalArtifacts(staleVersion, loadCanonicalAtlas()),
    /Canonical release shell version metadata/u
  );

  const staleInventory = html.replace(
    'This no-JavaScript view contains all 324 mapped developments and 15 open directions.',
    'This no-JavaScript view contains all 323 mapped developments and 15 open directions.'
  );
  assert.notEqual(staleInventory, html);
  assert.throws(
    () => buildCanonicalArtifacts(staleInventory, loadCanonicalAtlas()),
    /Canonical release shell no-script inventory counts/u
  );

  const wikipediaDrift = loadCanonicalAtlas();
  wikipediaDrift.nodes.find(node => node.id === 'markov').audit.development.note = 'normalized-copy drift';
  assert.throws(
    () => buildCanonicalArtifacts(html, wikipediaDrift),
    /Canonical browser projection does not reproduce the assembled canonical model/u
  );

  const researchDrift = loadCanonicalAtlas();
  researchDrift.nodes.find(node => node.id === 'rlhf').research.sources[0].title = 'Normalized-copy drift';
  assert.throws(
    () => buildCanonicalArtifacts(html, researchDrift),
    /Canonical browser projection does not reproduce the assembled canonical model/u
  );
});

test('no-script sidecar is the exact ordered legacy projection', () => {
  const canonical = loadCanonicalAtlas();
  const html = read('ai-research-tech-tree.html');
  const body = /<noscript><style>#bootPending[\s\S]*?<tbody>([\s\S]*?)<\/tbody><\/table>/i.exec(html)?.[1];
  assert(body, 'legacy no-script table is missing');
  const rows = [...body.matchAll(/<tr>[\s\S]*?<\/tr>/g)].map(match => match[0]);

  assert.deepEqual(canonical.sidecars.noScript.rows.map(row => row.nodeId), canonical.nodes.map(node => node.id));
  assert.deepEqual(canonical.sidecars.noScript.rows.map(row => row.rowHtml), rows);
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
  const legacy = extractModel(read('ai-research-tech-tree.html'));

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
