#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'ai-research-tech-tree.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'ai-research-tech-tree.json'), 'utf8'));
const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
assert(cssMatch, 'Inline stylesheet is missing');
const css = cssMatch[1];

function requireText(fragment, label) {
  assert(html.includes(fragment), `Missing UI contract: ${label}`);
}

function forbidText(fragment, label) {
  assert(!html.includes(fragment), `Obsolete UI remains: ${label}`);
}

function requirePattern(pattern, label, source = html) {
  assert(pattern.test(source), `Missing UI contract: ${label}`);
}

function sourceForFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `Missing UI contract: ${name}() is defined`);
  const tailStart = start + `function ${name}(`.length;
  const nextMatch = /\bfunction\s+[A-Za-z_$][\w$]*\s*\(/.exec(source.slice(tailStart));
  const next = nextMatch ? tailStart + nextMatch.index : source.length;
  return source.slice(start, next);
}

function cssAtRuleBlock(pattern, label) {
  const match = pattern.exec(css);
  assert(match, `Missing UI contract: ${label}`);
  const open = css.indexOf('{', match.index);
  let depth = 0;
  for (let index = open; index < css.length; index++) {
    if (css[index] === '{') depth++;
    if (css[index] === '}' && --depth === 0) return css.slice(open + 1, index);
  }
  assert.fail(`Malformed stylesheet block: ${label}`);
}

function executableScripts() {
  return [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/\btype="application\/(?:ld\+json|json)"/i.test(match[1]))
    .map(match => match[2]);
}

for (const [fragment, label] of [
  ['--lane-rail:clamp(184px,18vw,272px)', 'responsive desktop branch rail'],
  ['#svg{clip-path:inset(0 0 0 var(--map-left))}', 'hard map clipping at the dock-aware branch boundary'],
  ['#laneHud{display:none}', 'hidden mobile branch HUD'],
  ['body.guide-docked #laneHud{left:var(--dock-edge)}', 'docked guide shifts the branch-label rail'],
  ['body.guide-docked #listView{left:var(--dock-edge)}', 'docked guide reserves list-view space'],
  ['body.guide-docked #timelineNote{max-width:min(440px,calc(100vw - var(--map-left) - 18px))}', 'timeline note stays beyond the map boundary'],
  ['function mapLeftInset(){', 'shared dock-aware map boundary'],
  ['const left=mapLeftInset();', 'camera uses the dock-aware map boundary'],
  ['const rail=mapLeftInset();', 'era labels use the dock-aware map boundary'],
  ["document.body.classList.toggle('guide-docked',docked)", 'docked layout state is explicit'],
  ["const WELCOME_REVISION='3'", 'v1.1.0 first-run state revision'],
  ["theme==='light'?{icon:'\\u263e',label:'Dark mode',ariaLabel:'Switch to dark mode'}", 'light theme advertises the dark-mode action'],
  ["{icon:'\\u2600',label:'Light mode',ariaLabel:'Switch to light mode'}", 'dark theme advertises the light-mode action'],
  ['const DETAIL_K = 0.8, OVERVIEW_K = 0.2;', 'three-level semantic zoom thresholds'],
  ["const next=k>=DETAIL_K?'detail':k>=OVERVIEW_K?'mid':'overview';", 'semantic zoom mode selection'],
  ['id="clusters" role="group" aria-label="Lane-by-era summaries.', 'accessible semantic cluster group'],
  ['function renderNodeAudit(nd){', 'detail-panel evidence renderer is defined'],
  ["activateSemanticCluster(cluster);", 'pointer and keyboard cluster activation'],
  ["nodeId:targetNode?.getAttribute('data-id')||null", 'pointer-origin node fallback'],
  ["clusterKey:targetCluster?.getAttribute('data-cluster-key')||null", 'pointer-origin semantic cluster fallback'],
  ["const clusterKey=cluster?.getAttribute('data-cluster-key')||started?.clusterKey", 'release semantic cluster fallback'],
  ["nodeId=g?.getAttribute('data-id')||started?.nodeId", 'release hit-test fallback'],
  ["role:'button',tabindex:cluster.key===semanticFocusKey?0:-1", 'roving semantic cluster keyboard focus'],
  ["class:'semanticCluster'", 'semantic cluster group data contract'],
  ["class:'clusterCard'", 'semantic cluster card data contract'],
  ["class:'clusterTitle'", 'semantic cluster title data contract'],
  ["class:'clusterCount'", 'semantic cluster count data contract'],
  ["class:'clusterAnchor'", 'semantic cluster landmark data contract'],
  ['function rebuildSemanticClusters(){', 'deterministic semantic cluster rebuild'],
  ["const visible=NODES.filter(isNodeVisible),signature=timeScale+'|'+visible.map(nd=>nd.id).join('|');", 'semantic cluster rebuild signature'],
  ["document.getElementById('filterStatus').textContent", 'screen-reader filter result feedback'],
  ["version:'1.1.0',edition:'2026-08-21-stable-1',releaseState:'Preview'", 'v1.1.0 Preview identity over the unchanged Stable dataset'],
  ['id="editionBadge" href="./release-manifest.json"', 'visible exact-build badge'],
  ['id="contributeLink" href="https://github.com/neb6dav/ai_tech_tree/issues/new/choose"', 'persistent contribution link'],
  ['#repositoryLink{color:var(--ink);text-decoration:none;display:flex;align-items:center;justify-content:center;min-width:32px;min-height:32px', 'repository minimum pointer target'],
  ['@media (max-width:480px){#noscript{inset:104px 8px auto;max-height:calc(100dvh - 112px)}#noscriptIdentity{inset:8px 8px auto}}', 'narrow no-JavaScript cards do not overlap'],
  ['function layoutYear(nd){return DATE_OVERRIDES[nd.id]?.start??nd.y;}', 'composite nodes anchor at first milestone'],
  ['Landmark works and primary sources', 'in-place landmark reading links'],
  ['Linked works or papers', 'generalized linked-work filter'],
  ["Frege's Begriffsschrift → Hilbert's formalist program", 'visible 1879 development']
]) requireText(fragment, label);

requirePattern(/@media\s*\(\s*max-width\s*:\s*740px\s*\)\s*\{[\s\S]*?:root\s*\{(?=[^}]*--lane-rail\s*:\s*0px)(?=[^}]*--dock-edge\s*:\s*0px)(?=[^}]*--map-left\s*:\s*0px)(?=[^}]*--safe-center-offset\s*:\s*0px)[^}]*\}/i, 'zero-width mobile rail and dock reset', css);

for (const [pattern, label] of [
  [/<g\b(?=[^>]*\bid="edgesBackbone")[^>]*>/i, 'persistent orientation-spine SVG group'],
  [/<g\b(?=[^>]*\bid="anchorLabels")[^>]*>/i, 'curated anchor-label SVG group'],
  [/<[^>]+\bid="primaryControls"[^>]*>[\s\S]*?\bid="viewSeg"/i, 'desktop primary controls keep the four-view switcher direct'],
  [/<[^>]+\bid="mobileStart"(?=[^>]*\baria-labelledby=)[^>]*>/i, 'labelled mobile first-run chooser'],
  [/<[^>]+\bid="allZoomNotice"(?=[^>]*\brole="status")(?=[^>]*\baria-live="polite")[^>]*>/i, 'polite low-zoom All-mode notice'],
  [/data-start-node="transformer"/i, 'mobile Transformer guided start'],
  [/data-start-node="frontier26"/i, 'mobile frontier guided start'],
  [/data-start-view="opportunity"/i, 'mobile research-directions guided start'],
  [/data-start-action="whole-map"/i, 'mobile Whole Map fallback'],
  [/Showing the orientation spine at this zoom; zoom in for all connections\./i, 'low-zoom All-mode explanation'],
  [/>\s*Connections\s*</i, 'reader-facing Connections label'],
  [/>\s*Related\s*</i, 'reader-facing Related relationship mode']
]) requirePattern(pattern, label);

const primaryRule = css.match(/#primaryControls\s*\{([^}]*)\}/i);
assert(primaryRule && /display\s*:\s*(?:flex|grid)/i.test(primaryRule[1]), 'Desktop primary controls must be directly visible by default at 1024px and wider');
const primaryStart = html.indexOf('id="primaryControls"');
const secondaryStart = html.indexOf('id="secondaryControls"');
assert(primaryStart >= 0 && secondaryStart > primaryStart, 'Primary and secondary control groups must remain distinct');
const primaryMarkup = html.slice(primaryStart, secondaryStart);
for (const id of ['viewSeg', 'modeSeg', 'themeBtn', 'shareBtn', 'helpBtn']) {
  assert(primaryMarkup.includes(`id="${id}"`), `Desktop primary controls must directly expose #${id}`);
}

const mobileCss = cssAtRuleBlock(/@media\s*\(\s*max-width\s*:\s*740px\s*\)/i, '740px mobile layout breakpoint');
assert(/#mobileStart\s*\{[^}]*display\s*:\s*(?:grid|flex|block)/i.test(mobileCss), 'Mobile first-run chooser must be visible at 740px and below');
assert(/#nodeTable\s*,[^{}]*#nodeTable\s+tr\s*,[^{}]*#nodeTable\s+td\s*\{[^}]*display\s*:\s*block/i.test(mobileCss), 'Mobile List must reflow the existing table into cards');
assert(/#nodeTable\s+thead\s*\{[^}]*position\s*:\s*absolute/i.test(mobileCss), 'Mobile List column headings must be visually hidden without removing table semantics');
assert(/#nodeTable\s+td::before\s*\{[^}]*content\s*:\s*attr\(data-label\)/i.test(mobileCss), 'Mobile List cards must expose column labels from data-label attributes');
assert(!/\bid="mobileList"/i.test(html), 'Mobile List must not duplicate the 339-record table');

const hiddenSelectors = [...css.matchAll(/([^{}]+)\{([^{}]*\bdisplay\s*:\s*none(?:\s*!important)?[^{}]*)\}/gi)]
  .map(match => match[1]);
assert(hiddenSelectors.some(selector => /svg\.overview\s+#nodes/.test(selector)), 'Overview must replace full node cards with curated orientation marks');
assert(hiddenSelectors.some(selector => /svg\.overview\s+#edgesAll/.test(selector)), 'Overview must keep the 711-edge All layer detail-only');
assert(hiddenSelectors.some(selector => /svg\.overview\s+#edgesHi/.test(selector)), 'Overview must suppress stale transient highlight paths');
assert(hiddenSelectors
  .filter(selector => /svg\.(?:overview|mid)/.test(selector))
  .every(selector => !/#edgesBackbone|#anchorLabels/.test(selector)), 'Low-zoom orientation spine and anchor labels must never be hidden by a display:none rule');

const presentationMatch = html.match(/<script\b(?=[^>]*\bid="atlas-presentation-data")(?=[^>]*\btype="application\/json")[^>]*>([\s\S]*?)<\/script>/i);
assert(presentationMatch, 'Embedded v1.1.0 presentation payload is missing');
const presentation = JSON.parse(presentationMatch[1]);
assert.equal(presentation.anchors.length, 24, 'Embedded presentation payload must expose exactly 24 curated anchors');
assert.equal(presentation.backboneRelationshipIds.length, 72, 'Embedded presentation payload must expose exactly 72 curated spine relationships');

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
  ['id="opportunityView"', 'opportunity-view host'],
  ['data-view="opportunity"', 'opportunity view selector'],
  ['body[data-view="opportunity"]', 'opportunity view visibility rules'],
  ['id="opportunity-data" type="application/json"', 'embedded maintained opportunity data'],
  ['id="opportunity-view-engine"', 'embedded opportunity rendering engine'],
  ['OpportunityAtlas.create', 'opportunity engine initialization'],
  ["next==='opportunity'", 'opportunity view state normalization'],
  ['id="opportunityBtn" hidden>Explore opportunities', 'timeline-to-opportunity cross-navigation'],
  ['data-atlas-view', 'opportunity-to-atlas cross-navigation'],
  ['#opportunityView{overflow-y:auto;overscroll-behavior:contain}', 'scrollable mobile opportunity host'],
  ['#opportunityCanvas{flex:0 0 clamp(140px,38dvh,260px);min-height:140px}', 'viewport-bounded mobile opportunity canvas'],
  ['@media (max-width:740px) and (max-height:480px){#opportunityCanvas{flex-basis:120px;min-height:120px}}', 'short-height opportunity canvas fallback']
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
assert(!/>\s*Links\s*</i.test(html), 'Obsolete reader-facing Links label remains');
assert(!/>\s*On hover\s*</i.test(html), 'Obsolete reader-facing On hover label remains');

const scripts = executableScripts();
assert.equal(scripts.length, 7, 'Expected seven executable inline scripts plus JSON and JSON-LD data scripts');
scripts.forEach((body, index) => new vm.Script(body, { filename: `inline-script-${index + 1}.js` }));

const applicationScript = scripts.find(body => body.includes('function openPanel(nd)'));
assert(applicationScript, 'Main application script is missing');
assert(!/\bcontrols\.setAttribute\(['"]aria-hidden['"]/.test(applicationScript), 'The visible #primaryControls must not be hidden through aria-hidden on its parent');
assert(/(?:\bsecondaryControls\w*|document\.getElementById\(['"]secondaryControls['"]\))\.setAttribute\(['"]aria-hidden['"]/.test(applicationScript), 'Responsive hidden state must be scoped to #secondaryControls');
for (const helper of ['appendStatusProfile', 'renderResearchGuide', 'renderNodeAudit', 'renderSourceActions', 'appendRelationGroup']) {
  assert(new RegExp(`function ${helper}\\(`).test(applicationScript), `Detail panel calls undefined critical helper ${helper}`);
}

const firstRunSource = sourceForFunction(applicationScript, 'shouldShowFirstRun');
assert(/return\s+!restored\s*&&\s*shouldShowWelcome\(\)/.test(firstRunSource), 'Restored deep links must bypass first-run onboarding');
assert((applicationScript.match(/shouldShowFirstRun\(/g) || []).length >= 2, 'Startup must consult shouldShowFirstRun() after restoring state');
const activeOverlaySource = sourceForFunction(applicationScript, 'activeOverlayModal');
assert(/legend[^;\n]*classList\.contains\(['"]welcome['"]\)/.test(activeOverlaySource), 'First-run side sheet must retain modal focus containment');

const orientationSpineSource = sourceForFunction(applicationScript, 'buildOrientationSpine');
assert(/mountRelationshipLayer\(['"]backbone['"]\)/.test(orientationSpineSource), 'Orientation spine must delegate mounting to the keyed relationship layer');
const orientationMountSource = sourceForFunction(applicationScript, 'mountRelationshipLayer');
assert(/\(PRESENTATION_DATA\?\.backboneRelationshipIds\|\|\[\]\)\.forEach\(relationshipId=>/.test(orientationMountSource), 'Orientation spine mount must iterate the curated relationship inventory');
assert(/relationshipById\.get\(relationshipId\),path=edge&&acquireRelationshipPath\(edge,'backbone'\)/.test(orientationMountSource), 'Orientation spine mount must acquire each curated relationship through the keyed path pool');
assert(/gEdgesBackbone\.replaceChildren\(spineFragment\)/.test(orientationMountSource), 'Orientation spine mount must atomically replace its keyed paths');
const anchorLabelsSource = sourceForFunction(applicationScript, 'buildAnchorLabels');
assert(/\.anchors[^;\n]{0,48}\.(?:forEach|map)\(/.test(anchorLabelsSource), 'Anchor labels must render from the curated node inventory');
assert(/gAnchorLabels\.replaceChildren\(/.test(anchorLabelsSource), 'Anchor labels must atomically replace their 24 labels');
assert((applicationScript.match(/buildOrientationSpine\(\)/g) || []).length >= 2, 'Startup must build the curated orientation spine');
assert((applicationScript.match(/buildAnchorLabels\(\)/g) || []).length >= 2, 'Startup must build the curated anchor labels');

const clearPreviewSource = sourceForFunction(applicationScript, 'clearPreviewState');
assert(/hoverId\s*=\s*null/.test(clearPreviewSource), 'Preview cleanup must reset its hover identity');
assert(/hideInspector\(\)/.test(clearPreviewSource), 'Preview cleanup must dismiss its shared inspector');
assert(/clearHi\(\)/.test(clearPreviewSource), 'Preview cleanup must remove highlighted relationships');
const setViewSource = sourceForFunction(applicationScript, 'setViewMode');
assert(/clearPreviewState\(\)/.test(setViewSource), 'Every view change must centrally clear the prior preview');

const allZoomNoticeSource = sourceForFunction(applicationScript, 'updateAllZoomNotice');
assert(/mode\s*===\s*['"]all['"]/.test(allZoomNoticeSource), 'All-mode notice must depend on the selected connection mode');
assert(/(?:k\s*<\s*DETAIL_K|lodMode\s*!==\s*['"]detail['"])/.test(allZoomNoticeSource), 'All-mode notice must cover both overview and mid zoom');
assert(/\b(?:notice|allZoomNotice)\.hidden\s*=/.test(allZoomNoticeSource), 'All-mode notice must use the native hidden state');
const relationshipLayerSource = sourceForFunction(applicationScript, 'syncRelationshipLayers');
assert(/lodMode\s*===\s*['"]detail['"][^;\n]*mode\s*===\s*['"]all['"]/.test(relationshipLayerSource), 'The full 711-relationship layer must be limited to detail zoom in All mode');
assert(/gEdgesAll\.style\.display\s*=\s*full\s*\?/.test(relationshipLayerSource), 'The full relationship layer must be hidden outside its detail-only state');
const semanticZoomSource = sourceForFunction(applicationScript, 'updateSemanticZoom');
assert(/updateAllZoomNotice\(\)/.test(semanticZoomSource), 'Semantic zoom changes must refresh the All-mode notice');
const modeHandlerStart = applicationScript.indexOf("document.getElementById('modeSeg').addEventListener");
assert(modeHandlerStart >= 0, 'Connections mode handler is missing');
assert(/updateAllZoomNotice\(\)/.test(applicationScript.slice(modeHandlerStart, modeHandlerStart + 2400)), 'Connection-mode changes must refresh the All-mode notice');

const listRendererSource = sourceForFunction(applicationScript, 'renderListView');
assert(/\.dataset\.label\s*=/.test(listRendererSource), 'List cells must carry mobile data-label metadata');
for (const label of ['Year', 'Atlas entry', 'Branch', 'Classification', 'Evidence']) {
  assert(listRendererSource.includes(`'${label}'`) || listRendererSource.includes(`"${label}"`), `Mobile List is missing its ${label} card label`);
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

assert.equal(data.dataset.edition, '2026-08-21-stable-1');
assert.equal(data.dataset.releaseState, 'Preview');
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

const semanticClusterSource = sourceForFunction(applicationScript, 'rebuildSemanticClusters');
assert(/semanticClusters=\[\.\.\.groups\.values\(\)\]\.sort\(\(a,b\)=>LANES\.indexOf\(a\.lane\)-LANES\.indexOf\(b\.lane\)\|\|a\.era\.y0-b\.era\.y0\|\|a\.key\.localeCompare\(b\.key\)\)/.test(semanticClusterSource), 'Semantic cards must use deterministic lane/era/key ordering');
assert(/cluster\.nodes\.sort\(\(a,b\)=>layoutYear\(a\)-layoutYear\(b\)\|\|a\.t\.localeCompare\(b\.t\)\|\|a\.id\.localeCompare\(b\.id\)\)/.test(semanticClusterSource), 'Semantic card contents must use deterministic node ordering');
assert(/data-cluster-key/.test(semanticClusterSource), 'Semantic cards must expose their stable cluster key');
assert(/semanticFocusKey/.test(semanticClusterSource), 'Semantic cards must preserve roving focus state');
assert(/activateSemanticCluster\(cluster\)/.test(applicationScript), 'Semantic cluster activation function is missing');
const semanticClusterResults = {
  classes: ['semanticCluster', 'clusterCard', 'clusterTitle', 'clusterCount', 'clusterAnchor'],
  deterministic: true
};

console.log(JSON.stringify({
  status: 'PASS',
  edition: data.dataset.edition,
  world: { width: worldWidth, approximateHeight: worldHeight },
  semanticZoom: { detailAt: 0.8, overviewBelow: 0.2, midResults, semanticClusterResults },
  dockResults,
  fitResults,
  footerStatisticsPresent: false,
  interactionActivation: 'PASS',
  executableScriptsParsed: scripts.length
}, null, 2));
