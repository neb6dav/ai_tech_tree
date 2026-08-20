#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { injectOpportunityAssets } = require('./build.js');
const { computeOpportunityLayout, opportunityPath, timeRatio } = require('./src/opportunity-layout.cjs');
const { validateOpportunityData } = require('./validate-opportunity-data.js');

const ROOT = __dirname;
const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8').replace(/\r\n/g, '\n');
const DATA_FILE = path.join('src', 'data', 'opportunities', 'diffusion-models.alpha.json');
const SCHEMA_FILE = path.join('src', 'data', 'opportunities', 'opportunity-map.schema.json');
const BUNDLE_FILE = 'opportunity-atlas.bundle.js';

const atlas = JSON.parse(read('ai-research-tech-tree.json'));
const dataText = read(DATA_FILE);
const data = JSON.parse(dataText);
const schema = JSON.parse(read(SCHEMA_FILE));
const html = read('ai-research-tech-tree.html');
const bundle = read(BUNDLE_FILE).trimEnd();

assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(schema.$id, 'https://neb6dav.github.io/ai_tech_tree/data/opportunities/opportunity-map.schema.json');
assert.equal(data.$schema, './opportunity-map.schema.json');
assert.equal(data.metadata.id, 'diffusion-models-opportunity-map');
assert.equal(data.metadata.anchorAtlasNodeId, 'diffusion');
assert.equal(data.metadata.pathWidthMode, 'fixed', 'Opportunity paths must never encode a quantitative flow width');

const validation = validateOpportunityData(data, { atlasData: atlas });
assert.deepEqual(validation.errors, [], validation.errors.map(item => `${item.location}: ${item.message}`).join('\n'));
assert.equal(validation.valid, true);
const firstLayout = computeOpportunityLayout(data);
const secondLayout = computeOpportunityLayout(JSON.parse(dataText));
assert.deepEqual(firstLayout, secondLayout, 'Opportunity layout is not deterministic');
assert.equal(firstLayout.nodes.length, data.nodes.length, 'Opportunity layout omits source nodes');
assert(Number.isInteger(data.metadata.timeDomain.focusStartYear), 'Opportunity time domain requires an explicit focusStartYear');
assert.equal(firstLayout.domain.focusStartYear, data.metadata.timeDomain.focusStartYear);
const focusRatio = timeRatio(firstLayout.domain.focusStartYear, firstLayout.domain);
assert(focusRatio >= 0.2 && focusRatio <= 0.3, `Opportunity focus year must occupy roughly 20-30% of usable width; found ${(focusRatio * 100).toFixed(1)}%`);
const focusTick = firstLayout.timeTicks.find(tick => tick.year === firstLayout.domain.focusStartYear);
assert(focusTick, 'Opportunity layout omits its focus-year tick');
const usableWidth = firstLayout.width - firstLayout.options.left - firstLayout.options.right - firstLayout.options.nodeWidth;
const tickRatio = (focusTick.x - firstLayout.options.left - firstLayout.options.nodeWidth / 2) / usableWidth;
assert(Math.abs(tickRatio - focusRatio) < 1e-9, 'Opportunity focus-year tick does not use the piecewise time scale');
assert(firstLayout.height >= 520 && firstLayout.height <= 3000, `Opportunity layout height ${firstLayout.height} is outside the bounded legibility target`);
for (const node of firstLayout.nodes) {
  assert([node.x, node.y, node.width, node.height].every(Number.isFinite), `Opportunity layout contains non-finite geometry for ${node.id}`);
}
const rowGroups = new Map();
for (const node of firstLayout.nodes) {
  const key = `${node.bandId}\u0000${node.row}`;
  if (!rowGroups.has(key)) rowGroups.set(key, []);
  rowGroups.get(key).push(node);
}
for (const [key, nodes] of rowGroups) {
  const sorted = [...nodes].sort((left, right) => left.x - right.x || left.id.localeCompare(right.id));
  for (let index = 1; index < sorted.length; index += 1) {
    assert(sorted[index - 1].x + sorted[index - 1].width <= sorted[index].x, `Opportunity node boxes overlap in band/row ${key}`);
  }
}
for (const relationship of data.relationships) {
  const source = firstLayout.byId.get(relationship.sourceNodeId);
  const target = firstLayout.byId.get(relationship.targetNodeId);
  assert(source && target, `Opportunity relationship ${relationship.id} has no layout endpoints`);
  assert.match(opportunityPath(source, target), /^M [-\d.]+ [-\d.]+ C [-\d., ]+$/, `Opportunity relationship ${relationship.id} has invalid SVG geometry`);
}

const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .map(match => ({ attributes: match[1], body: match[2] }));
assert.equal(scripts.length, 10, 'Expected ten inline script elements');
const embeddedData = scripts.filter(script => /\bid=["']opportunity-data["']/i.test(script.attributes));
assert.equal(embeddedData.length, 1, 'Expected one embedded Opportunity View data payload');
assert.match(embeddedData[0].attributes, /\btype=["']application\/json["']/i);
assert.deepEqual(JSON.parse(embeddedData[0].body), data, 'Embedded Opportunity View data differs from maintained source');
assert(!embeddedData[0].body.includes('<'), 'Embedded Opportunity View data contains HTML-significant less-than characters');
assert(!/[\u2028\u2029]/u.test(embeddedData[0].body), 'Embedded Opportunity View data contains unsafe line separators');

const embeddedEngines = scripts.filter(script => /\bid=["']opportunity-view-engine["']/i.test(script.attributes));
assert.equal(embeddedEngines.length, 1, 'Expected one embedded Opportunity View engine');
assert.equal(embeddedEngines[0].body, bundle, 'Embedded Opportunity View engine differs from the reproducible bundle');
assert.match(bundle, /OpportunityAtlas/);
assert(!/(?:eval\s*\(|new\s+Function\b)/.test(bundle), 'Opportunity bundle requires unsafe evaluation');
assert(!/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(/.test(bundle), 'Opportunity bundle contains an HTML injection sink');
new vm.Script(bundle, { filename: BUNDLE_FILE });
assert(/\.opportunityEdge\{[^}]*stroke-width:2\.25(?:px)?[;}]/.test(html), 'Opportunity paths must render at one fixed width');
assert(html.includes('#opportunityView{overflow-y:auto;overscroll-behavior:contain}'), 'Mobile Opportunity host must remain vertically scrollable');
assert(html.includes('#opportunityCanvas{flex:0 0 clamp(140px,38dvh,260px);min-height:140px}'), 'Mobile Opportunity canvas must use a viewport-bounded height');
assert(html.includes('@media (max-width:740px) and (max-height:480px){#opportunityCanvas{flex-basis:120px;min-height:120px}}'), 'Short mobile viewports must reserve a compact 120px Opportunity canvas');
assert(html.includes('Width is uniform and does not represent volume, importance, value, certainty, or remaining opportunity.'), 'Opportunity UI omits the non-quantitative fixed-width warning');
assert(html.includes("imported_unreviewed:'Imported, manual review pending'"), 'Opportunity UI omits the imported/manual-review caveat');
const closeOpportunityStart = html.indexOf('function closeOpportunityPanel(options={})');
const closeOpportunityEnd = html.indexOf('\nfunction closePanel(', closeOpportunityStart);
assert(closeOpportunityStart >= 0 && closeOpportunityEnd > closeOpportunityStart, 'Opportunity drawer close handler is missing');
assert(html.slice(closeOpportunityStart, closeOpportunityEnd).includes('scheduleState();'), 'Closing the Opportunity drawer must remove its open state from the share URL');
assert(html.includes("searchOpportunityMode=viewMode==='opportunity'"), 'Search must become Opportunity-aware in Opportunity View');
assert(html.includes('button.dataset.oppGo=item.id'), 'Opportunity-only search results must be directly activatable');
assert(html.includes("if(!didSelect){opportunityController?.setBand?.('all')"), 'Stale or incompatible branch URLs must fall back to the full Opportunity map');
assert(html.includes("item.noveltySearch.asOf&&'checked '+item.noveltySearch.asOf"), 'Opportunity details must show novelty-review status and checked date');

const injectedFixture = injectOpportunityAssets(
  '<script id="opportunity-data" type="application/json">{}</script><script id="opportunity-view-engine"></script>',
  '{"safe":"<tag>"}',
  'var OpportunityAtlas={VERSION:"test"};\n'
);
assert(injectedFixture.includes('{"safe":"\\u003ctag>"}'), 'Inline Opportunity JSON did not neutralize HTML-significant text');
assert(injectedFixture.includes('var OpportunityAtlas={VERSION:"test"};'), 'Opportunity bundle injection failed');

const forbiddenWidthFields = new Set(['width', 'pathWidth', 'strokeWidth', 'weight', 'value', 'flow', 'magnitude']);
for (const relationship of data.relationships) {
  assert.deepEqual(Object.keys(relationship).filter(key => forbiddenWidthFields.has(key)), [], `Relationship ${relationship.id} carries a forbidden quantitative width field`);
}

const crosswalk = new Map();
for (const node of data.nodes) {
  for (const link of node.atlasLinks) {
    if (!crosswalk.has(link.atlasNodeId)) crosswalk.set(link.atlasNodeId, []);
    crosswalk.get(link.atlasNodeId).push({ opportunityNodeId: node.id, relation: link.relation });
  }
}
assert(crosswalk.has(data.metadata.anchorAtlasNodeId), 'Opportunity data must cross-link its historical atlas anchor');
assert.equal(
  data.nodes.filter(node => node.atlasLinks.some(link => link.atlasNodeId === data.metadata.anchorAtlasNodeId && link.relation === 'same_as')).length,
  1,
  'Exactly one Opportunity node must map same_as to the historical anchor'
);

const invalidWidth = JSON.parse(dataText);
if (invalidWidth.relationships.length > 0) {
  invalidWidth.relationships[0].width = 9;
  assert.equal(validateOpportunityData(invalidWidth, { atlasData: atlas }).valid, false, 'Validator accepted a quantitative path width');
}
const invalidCrosswalk = JSON.parse(dataText);
invalidCrosswalk.nodes[0].atlasLinks[0].atlasNodeId = 'not-a-real-atlas-node';
assert.equal(validateOpportunityData(invalidCrosswalk, { atlasData: atlas }).valid, false, 'Validator accepted a dangling atlas cross-link');

console.log(JSON.stringify({
  status: 'PASS',
  schemaVersion: data.schemaVersion,
  dataStatus: data.metadata.status,
  importStatus: data.metadata.importStatus.state,
  pathWidthMode: data.metadata.pathWidthMode,
  counts: validation.counts,
  atlasCrosswalkTargets: crosswalk.size,
  deterministicLayout: true,
  focusYearSharePercent: Math.round(focusRatio * 1000) / 10,
  layoutHeight: firstLayout.height,
  embeddedDataParity: true,
  embeddedBundleParity: true,
  mutationProbes: data.relationships.length > 0 ? 2 : 1
}, null, 2));
