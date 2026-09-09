'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ROOT = path.resolve(__dirname, '..');
const { loadCanonicalAtlas } = require('../canonical-atlas.js');
const graphStateSource = fs.readFileSync(path.join(ROOT, 'src/workspace/graph-state.js'), 'utf8');

function workspaceLogic() {
  const context = { Set, Map, Array, Math, String, Number, window: {} };
  vm.runInNewContext(graphStateSource, context);
  return context.window.AtlasWorkspaceLogic;
}

test('chronology layout is deterministic, year ordered, lane aware, and collision safe', () => {
  const atlas = loadCanonicalAtlas();
  const positions = workspaceLogic().chronologyLayout({ nodes: atlas.nodes, catalog: atlas.catalog });
  assert.equal(positions.size, 339);
  assert.equal(positions.lanes.length, 15);
  assert.equal(positions.eras.length, 13);
  const repeated = workspaceLogic().chronologyLayout({ nodes: atlas.nodes.slice().reverse(), catalog: atlas.catalog });
  for (const [id, point] of positions) assert.equal(JSON.stringify(repeated.get(id)), JSON.stringify(point), `layout must not depend on input order: ${id}`);
  const byYear = new Map();
  for (const node of atlas.nodes) {
    const point = positions.get(node.id);
    const year = node.dateOverride?.start || node.year;
    if (!byYear.has(year)) byYear.set(year, point.x);
    assert.equal(point.x, byYear.get(year));
    const lane = positions.lanes.find(lane => lane.id === node.laneId);
    assert.ok(point.y >= lane.y0 && point.y <= lane.y1, `${node.id} must stay in its lane`);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  for (let index = 1; index < years.length; index += 1) assert.ok(byYear.get(years[index]) > byYear.get(years[index - 1]), 'later years must appear to the right');
  const points = atlas.nodes.map(node => positions.get(node.id));
  for (let index = 0; index < points.length; index += 1) for (let other = index + 1; other < points.length; other += 1) {
    const distance = Math.hypot(points[index].x - points[other].x, points[index].y - points[other].y);
    assert.ok(distance >= 8, `overlapping markers: ${atlas.nodes[index].id}/${atlas.nodes[other].id} (${distance})`);
  }
});

test('workspace payload preserves canonical identity and complete graph', () => {
  const atlas = loadCanonicalAtlas();
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const match = html.match(/<script\b[^>]*id="atlas-data"[^>]*>([\s\S]*?)<\/script>/i);
  assert(match, 'generated index must embed atlas-data');
  const payload = JSON.parse(match[1]);
  assert.equal(payload.nodes.length, 339);
  assert.equal(payload.relationships.length, 711);
  assert.deepEqual(payload.nodes, atlas.nodes);
  assert.deepEqual(payload.relationships, atlas.relationships);
  const exported = JSON.parse(fs.readFileSync(path.join(ROOT, 'ai-research-tech-tree.json'), 'utf8'));
  assert.equal(payload.dataset.identifier, exported.dataset.identifier);
  assert.equal(payload.dataset.dataDigest, atlas.manifest.expected.dataDigest);
});

test('workspace retains exact Opportunity authority and supplemental pilot boundaries', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const payload = JSON.parse(html.match(/id="atlas-data"[^>]*>([\s\S]*?)<\/script>/i)[1]);
  const opportunity = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/opportunities/diffusion-models.alpha.json'), 'utf8'));
  assert.deepEqual(payload.opportunity, opportunity);
  assert.equal(payload.evidencePilot.relationships.length, 22);
  assert(payload.evidencePilot.relationships.every(record => record.reviewState === 'pending_curator_review'));
  const canonical = require('../canonical-atlas.js').loadCanonicalAtlas();
  const keys = new Set(canonical.relationships.filter(edge => edge.sourceNodeId === 'transformer' || edge.targetNodeId === 'transformer').map(edge => edge.key));
  assert.deepEqual(new Set(payload.evidencePilot.relationships.map(record => record.relationshipKey)), keys);
});

test('frozen export byte identities remain unchanged', () => {
  const crypto = require('node:crypto');
  for (const [file, expected] of Object.entries({
    'ai-research-tech-tree.jsonld': 'c5e83de813a88a19093b1c829ae6bc18c600af0fd2bfc00a800f0bc34f48549c',
    'ai-research-tech-tree.json': '6b70ef24ee62f96b5564284ac1877d90e3dd00472de4a093fdcd8ecbb5c09468',
    'ai-research-tech-tree.ndjson': '6aa6124136ce56aab0ecaa4745d0f23d32fb286253a13c5c76946e17b4179e72'
  })) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex'), expected, file);
});

test('workspace remains single-file and CSP-hashed', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(!/<script\s+src=|<link[^>]+stylesheet/i.test(html));
  assert(!/unsafe-inline|unsafe-eval/i.test(html));
  assert.match(html, /script-src[^";]*sha256-/i);
  assert.match(html, /style-src-elem[^";]*sha256-/i);
});
