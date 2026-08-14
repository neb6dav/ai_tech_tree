#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'ai-research-tech-tree.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'ai-research-tech-tree.json'), 'utf8'));

function requireText(fragment, label) {
  assert(html.includes(fragment), `Missing UI contract: ${label}`);
}

function forbidText(fragment, label) {
  assert(!html.includes(fragment), `Obsolete UI remains: ${label}`);
}

function executableScripts() {
  return [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/\btype="application\/(?:ld\+json|json)"/i.test(match[1]))
    .map(match => match[2]);
}

for (const [fragment, label] of [
  ['--lane-rail:clamp(184px,18vw,272px)', 'responsive desktop branch rail'],
  ['#svg{clip-path:inset(0 0 0 var(--map-left))}', 'hard map clipping at the dock-aware branch boundary'],
  [':root{--lane-rail:0px;--dock-edge:0px;--map-left:0px;--safe-center-offset:0px}', 'zero-width mobile rail and dock reset'],
  ['#laneHud{display:none}', 'hidden mobile branch HUD'],
  ['body.guide-docked #laneHud{left:var(--dock-edge)}', 'docked guide shifts the branch-label rail'],
  ['body.guide-docked #listView{left:var(--dock-edge)}', 'docked guide reserves list-view space'],
  ['body.guide-docked #timelineNote{max-width:min(440px,calc(100vw - var(--map-left) - 18px))}', 'timeline note stays beyond the map boundary'],
  ['function mapLeftInset(){', 'shared dock-aware map boundary'],
  ['const left=mapLeftInset();', 'camera uses the dock-aware map boundary'],
  ['const rail=mapLeftInset();', 'era labels use the dock-aware map boundary'],
  ["document.body.classList.toggle('guide-docked',docked)", 'docked layout state is explicit'],
  ["!canDockGuide())setLegendPresentation('welcome')", 'narrow resize falls back to a modal guide'],
  ["function activeOverlayModal(){if(legend?.classList.contains('open')&&legend.classList.contains('welcome'))return legend;", 'centered welcome is modal at every viewport width'],
  ["const WELCOME_REVISION='2'", 'versioned welcome state'],
  ["if(showWelcome)setLegendOpen(true,false,'welcome')", 'welcome is independent of restored URL state'],
  ["dock.textContent='Dock it to the left'", 'first-load dock action'],
  ["dismiss.textContent='Close guide'", 'first-load close action'],
  ["theme==='light'?{icon:'\\u263e',label:'Dark mode',ariaLabel:'Switch to dark mode'}", 'light theme advertises the dark-mode action'],
  ["{icon:'\\u2600',label:'Light mode',ariaLabel:'Switch to light mode'}", 'dark theme advertises the light-mode action'],
  ['const DETAIL_K = 0.8, OVERVIEW_K = 0.2, OVERVIEW_CELL_PX = 20;', 'three-level semantic zoom thresholds'],
  ["const next=k>=DETAIL_K?'detail':k>=OVERVIEW_K?'mid':'overview';", 'semantic zoom mode selection'],
  ['svg.mid #edgesAll{display:none!important}', 'global-link suppression below detail zoom'],
  ['svg.overview #nodes,svg.overview #edgesAll,svg.overview #edgesHi{display:none}', 'overview aggregation replaces individual nodes'],
  ['role="group" aria-label="Grouped overview markers.', 'accessible overview cluster group'],
  ["if(cluster.nodes.length===1){const nd=cluster.nodes[0];select(nd.id);flyTo(nd,Math.max(k,.95));return;}", 'single overview markers open their detail panel'],
  ['function renderNodeAudit(nd){', 'detail-panel evidence renderer is defined'],
  ["activateOverviewCluster(cluster);", 'pointer and keyboard cluster activation'],
  ["nodeId:targetNode?.getAttribute('data-id')||null", 'pointer-origin node fallback'],
  ["nodeId=g?.getAttribute('data-id')||started?.nodeId", 'release hit-test fallback'],
  ["role:'button',tabindex:cluster.key===overviewFocusKey?0:-1", 'roving cluster keyboard focus'],
  ["document.getElementById('filterStatus').textContent", 'screen-reader filter result feedback'],
  ["edition:'2026-08-13-public-beta-1'", 'current edition marker'],
  ['function layoutYear(nd){return DATE_OVERRIDES[nd.id]?.start??nd.y;}', 'composite nodes anchor at first milestone'],
  ['Landmark works and primary sources', 'in-place landmark reading links'],
  ['Linked works or papers', 'generalized linked-work filter'],
  ["Frege's Begriffsschrift → Hilbert's formalist program", 'visible 1879 development']
]) requireText(fragment, label);

for (const [fragment, label] of [
  ['id="networkView"', 'network-view host'],
  ['data-view="network"', 'network view selector'],
  ['body[data-view="network"]', 'network view visibility rules'],
  ['id="network-layout-data" type="application/json"', 'embedded deterministic network layout'],
  ['id="network-view-engine"', 'embedded network rendering engine'],
  ['NetworkAtlas.create', 'network engine initialization'],
  ["next==='network'", 'network view state normalization']
]) requireText(fragment, label);

for (const [fragment, label] of [
  ['id="stats"', 'footer statistics markup'],
  ['#stats', 'footer statistics style'],
  ['zoomPct', 'footer zoom percentage'],
  ['updateStats', 'footer statistics renderer'],
  ['statPart', 'footer statistics helper'],
  ['stats-top', 'footer theme variable'],
  ['stats-bottom', 'footer theme variable'],
  ['svg.far', 'obsolete binary zoom styling'],
  ['FAR_K', 'obsolete binary zoom threshold'],
  ['id="allStatusBtn"', 'ineffective all-classifications control'],
  ["getElementById('allStatusBtn')", 'removed all-classifications handler'],
  ['aria-pressed="false" aria-label="Light mode"', 'state-labeled theme toggle']
]) forbidText(fragment, label);

const scripts = executableScripts();
assert.equal(scripts.length, 6, 'Expected six executable inline scripts plus JSON and JSON-LD data scripts');
scripts.forEach((body, index) => new vm.Script(body, { filename: `inline-script-${index + 1}.js` }));

const applicationScript = scripts.find(body => body.includes('function openPanel(nd)'));
assert(applicationScript, 'Main application script is missing');
for (const helper of ['appendStatusProfile', 'renderResearchGuide', 'renderNodeAudit', 'renderSourceActions', 'appendRelationGroup']) {
  assert(new RegExp(`function ${helper}\\(`).test(applicationScript), `Detail panel calls undefined critical helper ${helper}`);
}
assert.equal((applicationScript.match(/function renderNodeAudit\(nd\)\{/g) || []).length, 1, 'Evidence renderer must have exactly one definition');
assert(applicationScript.includes(';renderNodeAudit(nd);renderSourceActions(nd);'), 'Detail panel no longer invokes its evidence renderer');
const auditRendererMatch = applicationScript.match(/function renderNodeAudit\(nd\)\{[^{}]*\}/);
assert(auditRendererMatch, 'Evidence renderer cannot be isolated for its regression probe');
const auditRoot = {
  children: [],
  replaceChildren() { this.children.length = 0; },
  appendChild(child) { this.children.push(child); return child; }
};
const auditCalls = [];
const auditContext = {
  document: {
    getElementById(id) { assert.equal(id, 'pAudit'); return auditRoot; },
    createElement(tagName) {
      return {
        tagName,
        className: '',
        textContent: '',
        children: [],
        append(...children) { this.children.push(...children); },
        appendChild(child) { this.children.push(child); return child; }
      };
    }
  },
  nodeAuditById: new Map([['transformer', {
    development: { state: 'confirmed' },
    mapStatus: { state: 'editorial_only' }
  }]]),
  appendAuditLine(root, label, claim) {
    auditCalls.push({ label, state: claim.state });
    root.appendChild({ label, state: claim.state });
  }
};
vm.runInNewContext(`${auditRendererMatch[0]};globalThis.renderAuditProbe=renderNodeAudit;`, auditContext);
auditContext.renderAuditProbe({ id: 'transformer' });
assert.deepEqual(auditCalls, [
  { label: 'Development', state: 'confirmed' },
  { label: 'Map status', state: 'editorial_only' }
], 'Transformer evidence renderer did not render both audit claims');
assert(auditRoot.children.some(child => child.tagName === 'strong' && child.textContent === 'Wikipedia cross-check'), 'Evidence renderer omitted its heading');
assert(auditRoot.children.some(child => child.tagName === 'details' && child.className === 'auditLimits'), 'Evidence renderer omitted its interpretation limits');

assert.equal(data.dataset.edition, '2026-08-13-public-beta-1');
assert.equal(data.nodes.length, 339);
assert.equal(data.lanes.length, 15);
assert.equal(data.landmarkWorks.length, 76);
assert.equal(data.landmarkWorkLinks.length, 76);
assert.equal(data.dataset.counts.publicDomainWorks, 4);

const eras = [
  [1879, 1949], [1950, 1956], [1957, 1969], [1970, 1979], [1980, 1987],
  [1988, 1994], [1995, 2005], [2006, 2011], [2012, 2016], [2017, 2019],
  [2020, 2022], [2023, 2024], [2025, 2026]
].map(([y0, y1]) => ({ y0, y1, count: 0 }));

const nodes = data.nodes.map(node => ({
  id: node.id,
  title: node.title,
  year: node.chronology.startYear,
  laneId: node.laneId,
  classification: node.legacyClassification.code
}));

function hash(value) {
  let result = 0;
  for (let index = 0; index < value.length; index++) result = (result * 31 + value.charCodeAt(index)) | 0;
  return Math.abs(result);
}

for (const node of nodes) eras.find(era => node.year >= era.y0 && node.year <= era.y1).count++;
let eraX = 0;
for (const era of eras) {
  era.x0 = eraX;
  era.width = Math.max(760, 320 + era.count * 27);
  era.x1 = era.x0 + era.width;
  eraX = era.x1;
}
const worldWidth = eraX;

for (const node of nodes) {
  const era = eras.find(item => node.year >= item.y0 && node.year <= item.y1);
  const fraction = (node.year - era.y0 + 0.5) / (era.y1 - era.y0 + 1);
  node.width = Math.min(300, Math.max(88, node.title.length * 6.25 + 34));
  node.x = era.x0 + 60 + fraction * (era.width - 120) + (hash(node.id) % 44) - 22;
}

let laneY = 36;
for (const lane of data.lanes) {
  const laneNodes = nodes.filter(node => node.laneId === lane.id).sort((left, right) => left.x - right.x);
  const rowEnds = [];
  for (const node of laneNodes) {
    let row = rowEnds.findIndex(end => node.x > end + 20);
    if (row < 0) {
      row = rowEnds.length;
      rowEnds.push(0);
    }
    rowEnds[row] = node.x + node.width;
    node.row = row;
  }
  lane.y0 = laneY;
  lane.height = 44 + Math.max(1, rowEnds.length) * 35 + 18;
  for (const node of laneNodes) node.y = lane.y0 + 44 + node.row * 35;
  laneY += lane.height;
}
const worldHeight = laneY + 30;

function railWidth(viewportWidth) {
  return viewportWidth <= 740 ? 0 : Math.min(272, Math.max(184, viewportWidth * 0.18));
}

const dockFunctionMatch = html.match(/function computeDockLayout\(viewportWidth,guideRight,docked,rightInset=0\)\{[\s\S]*?\n\}/);
assert(dockFunctionMatch, 'Dock geometry helper is missing');
const dockContext = {};
vm.runInNewContext(dockFunctionMatch[0] + ';globalThis.computeDockLayout=computeDockLayout;', dockContext);

function intersects(left, right) {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

const dockResults = [];
for (const [width, height] of [[741, 600], [800, 600], [900, 700], [1024, 768], [1280, 720], [1366, 768], [1440, 900], [1920, 1080]]) {
  const guideWidth = Math.min(370, Math.max(0, width - 24));
  const guide = { left: 12, right: 12 + guideWidth, top: 64, bottom: height - 12 };
  const layout = dockContext.computeDockLayout(width, guide.right, true, 0);
  const dockable = width > 740 && layout.usable >= 280;
  if (width <= 800) assert.equal(dockable, false, `A ${width}px viewport must retain the centered modal instead of a false dock`);
  if (width >= 900) assert.equal(dockable, true, `A ${width}px viewport should support the reserved dock`);
  if (!dockable) { dockResults.push({ width, dockable, usable: Math.round(layout.usable) }); continue; }
  const branchWords = { left: layout.dockEdge, right: layout.mapLeft - 18, top: 52, bottom: height };
  const mapPaint = { left: layout.mapLeft, right: width, top: 52, bottom: height };
  const eraWords = { left: layout.mapLeft + 6, right: width, top: 56, bottom: 86 };
  const timelineNote = { left: layout.mapLeft + 6, right: width - 12, top: 90, bottom: 124 };
  const listWords = { left: layout.dockEdge + 18, right: width, top: 52, bottom: height };
  for (const [label, rect] of Object.entries({ branchWords, mapPaint, eraWords, timelineNote, listWords })) {
    assert(!intersects(guide, rect), `Dock overlaps ${label} at ${width}x${height}`);
  }
  assert(layout.dockEdge >= guide.right + 12, `Dock gap is lost at ${width}px`);
  assert(layout.mapLeft === layout.dockEdge + layout.rail, `Map and label boundaries diverge at ${width}px`);
  dockResults.push({ width, dockable, dockEdge: layout.dockEdge, mapLeft: Math.round(layout.mapLeft), usable: Math.round(layout.usable) });
}

const fitResults = [];
for (const [width, height] of [[360, 640], [740, 800], [741, 700], [800, 700], [1024, 768], [1366, 768], [1440, 900], [1920, 1080]]) {
  const rail = railWidth(width);
  const available = width - rail;
  const scale = Math.max(0.02, Math.min(3.5, Math.min((available - 60) / worldWidth, (height - 60) / worldHeight)));
  const leftEdge = rail + (available - worldWidth * scale) / 2;
  const rightEdge = leftEdge + worldWidth * scale;
  assert(leftEdge >= rail + 29.999, `Fit-all content enters the branch rail at ${width}x${height}`);
  assert(rightEdge <= width - 29.999, `Fit-all content exceeds the right fit padding at ${width}x${height}`);
  fitResults.push({ width, height, rail: Math.round(rail * 10) / 10, scale: Math.round(scale * 1000) / 1000 });
}

const midResults = [];
for (const scale of [0.2, 0.34, 0.79]) {
  const radius = Math.min(3.6, Math.max(1.35, 35 * scale * 0.36));
  const widestNormalDiameter = 2 * radius + 1.5;
  assert(widestNormalDiameter < 35 * scale, `Mid-zoom markers overlap adjacent rows at scale ${scale}`);
  midResults.push({ scale, radiusPx: Math.round(radius * 100) / 100, rowSpacingPx: Math.round(35 * scale * 100) / 100 });
}
assert(26 * 0.8 >= 20, 'Detail cards begin before they reach a readable height');
assert(12 * 0.8 >= 9.5, 'Detail labels begin before they reach a readable text size');

const clusterResults = [];
for (const scale of [0.02, 0.05, 0.1, 0.199]) {
  const cell = 20;
  const groups = new Map();
  for (const node of nodes) {
    const gx = Math.floor(((node.x + node.width / 2) * scale) / cell);
    const gy = Math.floor(((node.y + 13) * scale) / cell);
    const key = `${gx}:${gy}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  const total = [...groups.values()].reduce((sum, count) => sum + count, 0);
  assert.equal(total, nodes.length, `Overview grouping lost entries at scale ${scale}`);
  assert(12 + 1.25 < cell, 'Maximum overview glyph exceeds its map cell');
  clusterResults.push({ scale, markers: groups.size, entries: total, largestGroup: Math.max(...groups.values()) });
}

const activationMatch = html.match(/function activateOverviewCluster\(cluster\)\{[\s\S]*?\n\}/);
assert(activationMatch, 'Overview activation function is missing');
const activationCalls = [];
const activationContext = {
  k: 0.1,
  select: id => activationCalls.push(['select', id]),
  flyTo: (node, scale) => activationCalls.push(['flyTo', node.id, scale]),
  zoomOverviewCluster: cluster => activationCalls.push(['zoom', cluster.nodes.length])
};
vm.runInNewContext(activationMatch[0] + ';globalThis.activateOverviewCluster=activateOverviewCluster;', activationContext);
activationContext.activateOverviewCluster({ nodes: [{ id: 'singleton' }] });
assert.deepEqual(activationCalls, [['select', 'singleton'], ['flyTo', 'singleton', 0.95]], 'A singleton overview marker must open and reveal its node');
activationCalls.length = 0;
activationContext.activateOverviewCluster({ nodes: [{ id: 'one' }, { id: 'two' }] });
assert.deepEqual(activationCalls, [['zoom', 2]], 'A multi-entry overview marker must remain a disambiguating zoom action');

console.log(JSON.stringify({
  status: 'PASS',
  edition: data.dataset.edition,
  world: { width: worldWidth, approximateHeight: worldHeight },
  semanticZoom: { detailAt: 0.8, overviewBelow: 0.2, midResults, clusterResults },
  dockResults,
  fitResults,
  footerStatisticsPresent: false,
  interactionActivation: 'PASS',
  executableScriptsParsed: scripts.length
}, null, 2));
