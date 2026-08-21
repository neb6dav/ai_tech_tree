#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildLayout, serializeLayout, sourceDigest } = require('./generate-network-layout.js');
const { injectNetworkAssets } = require('./build.js');

const ROOT = __dirname;
const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8').replace(/\r\n/g, '\n');

const data = JSON.parse(read('ai-research-tech-tree.json'));
const layoutText = read('network-layout-v1.json');
const layout = JSON.parse(layoutText);
const html = read('ai-research-tech-tree.html');
const bundle = read('network-atlas.bundle.js');
const source = read('src/network-view.js');
const packageJson = JSON.parse(read('package.json'));
const packageLock = JSON.parse(read('package-lock.json'));

assert.equal(packageJson.dependencies['@cosmos.gl/graph'], '3.4.0', 'Cosmos graph dependency must be exactly pinned');
assert.equal(packageLock.packages['node_modules/@cosmos.gl/graph'].version, '3.4.0', 'Lockfile Cosmos graph version drifted');
assert.equal(packageLock.packages['node_modules/esbuild'].version, packageJson.devDependencies.esbuild, 'Lockfile esbuild version drifted');
assert.match(source, /export const VERSION = '1\.0\.0'/u, 'Network source version must match v1.0.0');

assert.equal(layout.schemaVersion, '1.0.0');
assert.equal(layout.layoutVersion, 'network-v1');
assert.equal(layout.algorithm, 'deterministic-lane-force-v1');
assert.equal(layout.seed, 'ai-research-tech-tree-network-v1');
assert.equal(layout.sourceDigest, sourceDigest(data), 'Layout source digest does not match normalized graph data');
assert.equal(layout.nodeCount, data.nodes.length);
assert.equal(layout.relationshipCount, data.relationships.length);
assert.deepEqual(layout.coordinateSystem, { dimensions: 2, units: 'layout', extent: [-1800, 1800] });
assert.equal(layout.nodes.length, data.nodes.length);
assert.equal(layout.lanes.length, data.lanes.length);
assert(!/(?:generatedAt|timestamp|createdAt)/.test(layoutText), 'Layout must not contain wall-clock metadata');
assert.equal(layoutText, serializeLayout(buildLayout(data)), 'Layout generation is not byte-for-byte deterministic');

const dataNodeIds = new Set(data.nodes.map(node => node.id));
const layoutNodeIds = new Set(layout.nodes.map(node => node.id));
assert.equal(layoutNodeIds.size, layout.nodes.length, 'Layout node identifiers are not unique');
assert.deepEqual([...layoutNodeIds].sort(), [...dataNodeIds].sort(), 'Layout node set differs from normalized data');
const dataLaneByNode = new Map(data.nodes.map(node => [node.id, node.laneId]));
for (const node of layout.nodes) {
  assert.equal(node.laneId, dataLaneByNode.get(node.id), `Layout lane differs for ${node.id}`);
  assert(Number.isFinite(node.x) && Number.isFinite(node.y), `Non-finite position for ${node.id}`);
  assert(node.x >= -1800 && node.x <= 1800 && node.y >= -1800 && node.y <= 1800, `Out-of-bounds position for ${node.id}`);
}

const xValues = layout.nodes.map(node => node.x);
const yValues = layout.nodes.map(node => node.y);
const xRange = Math.max(...xValues) - Math.min(...xValues);
const yRange = Math.max(...yValues) - Math.min(...yValues);
assert(xRange > 2500 && yRange > 2500, 'Layout is degenerate or overly compressed');
const laneCentroids = new Map(layout.lanes.map(lane => [lane.id, lane.centroid]));
let nearestOwnLane = 0;
for (const node of layout.nodes) {
  let nearestLane = null;
  let nearestDistance = Infinity;
  for (const [laneId, centroid] of laneCentroids) {
    const distance = Math.hypot(node.x - centroid.x, node.y - centroid.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestLane = laneId;
    }
  }
  if (nearestLane === node.laneId) nearestOwnLane += 1;
}
assert(nearestOwnLane / layout.nodes.length >= 0.7, 'Lane clustering signal is too weak');

const scriptBodies = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .map(match => ({ attributes: match[1], body: match[2] }));
assert.equal(scriptBodies.length, 10, 'Expected ten inline script elements');
const embeddedLayouts = scriptBodies.filter(script => /\bid=["']network-layout-data["']/i.test(script.attributes));
assert.equal(embeddedLayouts.length, 1, 'Expected one embedded network layout');
assert.match(embeddedLayouts[0].attributes, /\btype=["']application\/json["']/i);
assert.deepEqual(JSON.parse(embeddedLayouts[0].body), layout, 'Embedded network layout differs from sidecar');
const embeddedEngines = scriptBodies.filter(script => /\bid=["']network-view-engine["']/i.test(script.attributes));
assert.equal(embeddedEngines.length, 1, 'Expected one embedded network engine');
assert.equal(embeddedEngines[0].body, bundle.trimEnd(), 'Embedded network engine differs from the reproducible bundle');
assert.match(bundle, /COSMOS_GRAPH_VERSION/);
assert.match(bundle, /3\.4\.0/);
assert.match(bundle, /NetworkAtlas/);
assert.match(bundle, /1\.0\.0/u, 'Network bundle version must match v1.0.0');
assert(!bundle.includes('0.1.1'), 'Network bundle contains the superseded pre-v1 version');
assert(!/(?:eval\s*\(|new\s+Function\b)/.test(bundle), 'Network bundle requires unsafe evaluation');
new vm.Script(bundle, { filename: 'network-atlas.bundle.js' });

const injectedFixture = injectNetworkAssets(
  '<script id="network-layout-data" type="application/json">{}</script><script id="network-view-engine"></script>',
  '{"safe":"<tag>"}',
  'var NetworkAtlas={VERSION:"test"};\n'
);
assert(injectedFixture.includes('{"safe":"\\u003ctag>"}'), 'Inline layout did not neutralize HTML-significant JSON');
assert(injectedFixture.includes('var NetworkAtlas={VERSION:"test"};'), 'Network bundle injection failed');

console.log(JSON.stringify({
  status: 'PASS',
  engine: '@cosmos.gl/graph@3.4.0',
  layout: {
    version: layout.layoutVersion,
    algorithm: layout.algorithm,
    sourceDigest: layout.sourceDigest,
    nodes: layout.nodeCount,
    relationships: layout.relationshipCount,
    xRange: Math.round(xRange),
    yRange: Math.round(yRange),
    nearestOwnLanePercent: Math.round((nearestOwnLane / layout.nodes.length) * 1000) / 10
  },
  integration: {
    inlineScripts: scriptBodies.length,
    embeddedLayoutParity: true,
    embeddedBundleParity: true
  }
}, null, 2));
