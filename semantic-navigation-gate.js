#!/usr/bin/env node
'use strict';

/*
 * v1.1.0 semantic-navigation release gate.
 *
 * This is intentionally a fail-closed, static contract. It does not try to
 * simulate a browser; the browser suite remains responsible for exercising the
 * hostile view-switching sequence and measuring the live DOM. This gate makes
 * that browser result meaningful by requiring the production implementation to
 * expose a single keyed relationship pool, deterministic semantic clusters,
 * one shared pointer/keyboard inspector, explicit lazy-view disposal, and a
 * live 8,000-element budget audit.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = __dirname;
const HTML_PATH = path.join(ROOT, 'ai-research-tech-tree.html');
const PRESENTATION_PATH = path.join(ROOT, 'src', 'ui', 'atlas-presentation.v1.json');
const CANONICAL_PATH = path.join(ROOT, 'ai-research-tech-tree.json');

const html = fs.readFileSync(HTML_PATH, 'utf8');
const presentation = JSON.parse(fs.readFileSync(PRESENTATION_PATH, 'utf8'));
const canonical = JSON.parse(fs.readFileSync(CANONICAL_PATH, 'utf8'));
const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
assert(cssMatch, 'Inline stylesheet is missing.');
const css = cssMatch[1];

const EXPECTED_TOURS = new Map([
  ['foundations-to-transformers', ['turing36', 'dartmouth', 'perceptron', 'backprop', 'imagenet', 'alexnet', 'transformer']],
  ['two-winters-and-revivals', ['dartmouth', 'perceptronsbook', 'lighthill', 'expertshells', 'aiwinter2', 'backprop', 'alexnet']],
  ['scaling-era', ['moore', 'gpgpu', 'imagenet', 'alexnet', 'transformer', 'scalinglaws', 'gpt3', 'frontier26']],
  ['reinforcement-keeps-returning', ['mdp', 'qlearning', 'policygrad', 'tdgammon', 'dqn', 'alphago', 'rlhf', 'agentsllm']],
  ['diffusion-decade', ['vae', 'gan', 'diffusion', 'txt2img', 'dit', 'diffusionllm']],
  ['agents-and-alignment', ['friendlyai', 'rlhf', 'constitutional', 'agentsllm', 'agentbench', 'aicontrol', 'selfgenagents', 'gap_agents']]
]);

function requireText(fragment, label, source = html) {
  assert(source.includes(fragment), `Missing v1.1 semantic-navigation contract: ${label}.`);
}

function requirePattern(pattern, label, source = html) {
  assert(pattern.test(source), `Missing v1.1 semantic-navigation contract: ${label}.`);
}

function forbidPattern(pattern, label, source = html) {
  assert(!pattern.test(source), `Obsolete v1.1 implementation remains: ${label}.`);
}

function executableScripts() {
  return [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\btype=["']application\/(?:ld\+json|json)["']/i.test(match[1]))
    .map((match) => match[2]);
}

function functionSource(source, name) {
  const signature = new RegExp(`\\bfunction\\s+${name}\\s*\\(`);
  const match = signature.exec(source);
  assert(match, `Missing v1.1 semantic-navigation contract: ${name}() is defined.`);
  const open = source.indexOf('{', match.index + match[0].length);
  assert(open >= 0, `${name}() has no body.`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}' && --depth === 0) return source.slice(match.index, index + 1);
  }
  assert.fail(`${name}() has an unbalanced body.`);
}

const scripts = executableScripts();
scripts.forEach((body, index) => new vm.Script(body, { filename: `inline-script-${index + 1}.js` }));
const applicationScript = scripts.find((body) => body.includes('function openPanel('));
assert(applicationScript, 'Main application script is missing.');

/* Curated tours are data, not parallel evidence. */
assert.equal(presentation.tours.length, 6, 'Presentation data must contain exactly six tours.');
assert.deepEqual(
  presentation.tours.map((tour) => tour.slug),
  [...EXPECTED_TOURS.keys()],
  'Tour slugs and their curated order must match the approved release plan.'
);
const canonicalNodeIds = new Set(canonical.nodes.map((node) => node.id));
let tourStepCount = 0;
for (const tour of presentation.tours) {
  const expectedSequence = EXPECTED_TOURS.get(tour.slug);
  assert.deepEqual(
    tour.steps.map((step) => step.nodeId),
    expectedSequence,
    `Tour ${tour.slug} does not match its approved node sequence.`
  );
  tour.steps.forEach((step, index) => {
    assert.equal(step.stepNumber, index + 1, `${tour.slug} step ${index + 1} is not 1-based.`);
    assert(canonicalNodeIds.has(step.nodeId), `${tour.slug} references unknown node ${step.nodeId}.`);
    assert.equal(step.narration, step.narration.trim(), `${tour.slug} step ${index + 1} narration is not trimmed.`);
    assert(!/[\r\n]/u.test(step.narration), `${tour.slug} step ${index + 1} must be one paragraph.`);
    assert(!/<\/?p\b|<br\b/i.test(step.narration), `${tour.slug} step ${index + 1} must be plain-text prose.`);
    assert(step.narration.length >= 40 && step.narration.length <= 360, `${tour.slug} step ${index + 1} is not a short curator paragraph.`);
    tourStepCount += 1;
  });
}

/* Three semantic altitudes: stable lane-by-era cards, then canonical records. */
for (const className of ['semanticCluster', 'clusterCard', 'clusterTitle', 'clusterCount', 'clusterAnchor']) {
  requirePattern(
    new RegExp(`class\\s*:\\s*['"]${className}['"]`),
    `semantic cluster rendering token ${className}`,
    applicationScript
  );
}
const semanticClusters = functionSource(applicationScript, 'rebuildSemanticClusters');
requirePattern(/NODES\.filter\(isNodeVisible\)/, 'semantic clusters derive from the active canonical records', semanticClusters);
requirePattern(/(?:nd\.lane|lane\.id)/, 'semantic clusters group by canonical lane', semanticClusters);
requirePattern(/eraOf\(nd\.y\)/, 'semantic clusters group by canonical era', semanticClusters);
requirePattern(/['"]:['"]/, 'semantic cluster keys combine lane and era', semanticClusters);
requirePattern(/PRESENTATION_(?:ANCHORS|ANCHOR_IDS)/, 'representative cluster labels come from curated anchors', semanticClusters);
requirePattern(/\.sort\(/, 'semantic clusters have a deterministic order', semanticClusters);
requirePattern(/data-cluster-key/, 'semantic clusters expose their stable lane-era key', semanticClusters);
requirePattern(/nodes\.length/, 'semantic cards expose canonical record counts', semanticClusters);
forbidPattern(/\b(?:gx|gy)\b|Math\.floor\([^)]*\bk\b[^)]*\/(?:cell|OVERVIEW_CELL_PX)/, 'screen-grid anonymous-dot clustering', semanticClusters);
const semanticZoom = functionSource(applicationScript, 'updateSemanticZoom');
requirePattern(/next\s*===\s*['"]overview['"]/, 'overview altitude branch', semanticZoom);
requirePattern(/next\s*===\s*['"]mid['"]/, 'mid altitude branch', semanticZoom);
requirePattern(/next\s*===\s*['"]detail['"]|k\s*>=\s*DETAIL_K/, 'detail altitude branch', semanticZoom);
assert((semanticZoom.match(/rebuildSemanticClusters\(\)/g) || []).length >= 1, 'Mid altitude must render semantic lane-by-era cluster cards.');

/* Density is compatible-by-default; linear is explicitly proportional. */
requirePattern(/id=["']scaleSeg["'][\s\S]*?data-scale=["']density["'][\s\S]*?data-scale=["']linear["']/i, 'density/linear time-scale control');
requirePattern(/\b(?:let|const)\s+timeScale\s*=\s*['"]density['"]/, 'density remains the default time scale', applicationScript);
const scaleXForYear = functionSource(applicationScript, 'scaleXForYear');
requirePattern(/timeScale\s*===\s*['"]linear['"]/, 'linear year-coordinate branch', scaleXForYear);
requirePattern(/(?:year|y)\s*-\s*(?:MIN_YEAR|YEAR_MIN|yearMin)|(?:MIN_YEAR|YEAR_MIN|yearMin)\s*-\s*(?:year|y)/, 'linear coordinates use elapsed years', scaleXForYear);
const relayoutTimeline = functionSource(applicationScript, 'relayoutTimeline');
requirePattern(/scaleXForYear\(/, 'time-scale changes recompute node positions', relayoutTimeline);
requirePattern(/(?:setAttribute\(['"]d['"]|edgePath\()/, 'time-scale changes recompute relationship paths', relayoutTimeline);
const setTimeScale = functionSource(applicationScript, 'setTimeScale');
requirePattern(/['"]density['"]/, 'time-scale setter accepts density', setTimeScale);
requirePattern(/['"]linear['"]/, 'time-scale setter accepts linear', setTimeScale);
requirePattern(/relayoutTimeline\(\)/, 'time-scale setter relayouts the map', setTimeScale);

/* URL compatibility and the only v1.1 hash additions. */
const currentParams = functionSource(applicationScript, 'currentParams');
for (const key of ['scale', 'tour', 'step']) {
  requirePattern(new RegExp(`\\.set\\(['"]${key}['"]\\s*,`), `${key}= is serialized`, currentParams);
}
requirePattern(/timeScale\s*!==\s*['"]density['"]|timeScale\s*===\s*['"]linear['"]/, 'density URLs remain backward compatible without scale=', currentParams);
requirePattern(/mode\s*!==\s*['"]hover['"]/, 'default Related mode keeps the legacy compact URL', currentParams);
const restoreState = functionSource(applicationScript, 'restoreState');
for (const key of ['scale', 'tour', 'step', 'mode']) {
  requirePattern(new RegExp(`\\.get\\(['"]${key}['"]\\)`), `${key}= is restored`, restoreState);
}
requirePattern(/['"]hover['"]/, 'legacy mode=hover remains accepted', restoreState);
requirePattern(/['"]density['"][^;\n]{0,180}['"]linear['"]|['"]linear['"][^;\n]{0,180}['"]density['"]/, 'scale restoration is limited to density or linear', restoreState);
requirePattern(/(?:>=\s*1|>\s*0|Math\.max\(1)/, 'tour steps reject or clamp zero to the 1-based range', restoreState);
requirePattern(/(?:steps\.length|tour\.steps)/, 'tour steps are bounded by their selected tour', restoreState);

/* Six shareable tours and a complete command palette. */
requirePattern(/id=["']commandPalette["']/i, 'command palette host');
requirePattern(/id=["']commandPaletteInput["']/i, 'command palette input');
requirePattern(/id=["']commandPaletteList["']/i, 'command palette result list');
requirePattern(/id=["']commandPalette["'][^>]*\brole=["']dialog["']/i, 'command palette dialog semantics');
requirePattern(/\b(?:const|let)\s+COMMANDS\s*=/, 'central command inventory', applicationScript);
for (const commandId of ['view-map', 'view-network', 'view-opportunity', 'view-list', 'fit', 'copy-link', 'copy-citation', 'copy-node-json']) {
  requireText(commandId, `command palette action ${commandId}`, applicationScript);
}
requirePattern(/PRESENTATION_(?:DATA\.)?TOURS|PRESENTATION_DATA\??\.tours|PRESENTATION_DATA\.tours/, 'tour commands are generated from curated presentation data', applicationScript);
requirePattern(/PRESENTATION_TOURS\.map\(/, 'command palette includes generated tour commands', applicationScript);
for (const functionName of ['openCommandPalette', 'closeCommandPalette', 'executeCommandPaletteCommand', 'startTour', 'showTourStep']) {
  functionSource(applicationScript, functionName);
}
requirePattern(/\((?:event\.ctrlKey\s*\|\|\s*event\.metaKey|event\.metaKey\s*\|\|\s*event\.ctrlKey)\)[\s\S]{0,180}(?:event\.key\.toLowerCase\(\)|event\.key)\s*===\s*['"]k['"]/, 'Ctrl/Cmd+K opens the command palette', applicationScript);
requirePattern(/event\.key\s*===\s*['"]\/['"][\s\S]{0,180}(?:q|searchInput)\.focus\(\)/, '/ remains direct search', applicationScript);

/* One fixed inspector is shared by pointer hover and keyboard focus. */
requirePattern(/id=["']inspector["'][^>]*\brole=["']status["'][^>]*\baria-live=["']polite["']/i, 'polite inspector status region');
const inspectorRule = css.match(/#inspector\s*\{([^}]*)\}/i);
assert(inspectorRule, 'Missing v1.1 semantic-navigation contract: #inspector style rule.');
requirePattern(/position\s*:\s*fixed/i, 'desktop inspector is fixed', inspectorRule[1]);
requirePattern(/bottom\s*:/i, 'inspector uses a bottom treatment', inspectorRule[1]);
requirePattern(/body\.inspector-open|body\[data-inspector/, 'inspector-open layout state', css);
for (const functionName of ['buildInspector', 'showInspector', 'hideInspector']) functionSource(applicationScript, functionName);
requirePattern(/(?:pointerenter|mouseenter|mouseover)[\s\S]{0,220}showInspector\(nd/, 'pointer hover uses the shared inspector renderer', applicationScript);
requirePattern(/['"]focus['"][\s\S]{0,220}showInspector\(nd/, 'keyboard focus uses the shared inspector renderer', applicationScript);
requirePattern(/(?:pointerleave|mouseleave|mouseout)[\s\S]{0,220}hideInspector\(/, 'pointer exit clears inspector preview', applicationScript);
forbidPattern(/function\s+(?:showTip|positionTip|buildTip)\s*\(/, 'floating pointer tooltip implementation', applicationScript);

/* All remains detail-only, with the selected mode retained at lower zoom. */
const relationshipLayers = functionSource(applicationScript, 'syncRelationshipLayers');
requirePattern(/lodMode\s*===\s*['"]detail['"][^;\n]{0,120}mode\s*===\s*['"]all['"]|mode\s*===\s*['"]all['"][^;\n]{0,120}lodMode\s*===\s*['"]detail['"]/, 'All relationships render only at detail altitude', relationshipLayers);
const allNotice = functionSource(applicationScript, 'updateAllZoomNotice');
requirePattern(/mode\s*===\s*['"]all['"]/, 'All-mode lower-zoom notice retains the selected mode', allNotice);
requirePattern(/lodMode\s*!==\s*['"]detail['"]|k\s*<\s*DETAIL_K/, 'All-mode notice appears below detail altitude', allNotice);
requireText('Showing the orientation spine at this zoom; zoom in for all connections.', 'required All-mode lower-zoom explanation');

/* No duplicate SVG graph: every relationship ID owns one reusable path. */
requirePattern(/\bconst\s+relationshipPathPool\s*=\s*new\s+Map\s*\(/, 'single keyed relationship path pool', applicationScript);
const acquireRelationshipPath = functionSource(applicationScript, 'acquireRelationshipPath');
requirePattern(/edgeAuditKey\(edge\)/, 'path pool keys use stable canonical relationship IDs', acquireRelationshipPath);
requirePattern(/relationshipPathPool\.get\(/, 'path acquisition reuses an existing path', acquireRelationshipPath);
requirePattern(/relationshipPathPool\.set\(/, 'path acquisition records one newly created path', acquireRelationshipPath);
requirePattern(/createElementNS\([^,]+,\s*['"]path['"]\)/, 'path acquisition owns relationship SVG creation', acquireRelationshipPath);
requirePattern(/dataset\.relationshipId|data-relationship-id/, 'pooled paths retain canonical relationship IDs', acquireRelationshipPath);
const mountRelationshipLayer = functionSource(applicationScript, 'mountRelationshipLayer');
requirePattern(/acquireRelationshipPath\(/, 'relationship-layer mounting uses the keyed path pool', mountRelationshipLayer);
for (const builderName of ['buildOrientationSpine', 'buildAllEdges']) {
  const builder = functionSource(applicationScript, builderName);
  requirePattern(/(?:acquireRelationshipPath|mountRelationshipLayer)\(/, `${builderName} reuses the keyed path pool`, builder);
}
const drawHighlight = functionSource(applicationScript, 'drawHi');
requirePattern(/(?:acquireRelationshipPath|relationshipPathPool|relationshipPaths)\(/, 'active traces reuse canonical paths', drawHighlight);
forbidPattern(/createElementNS\([^,]+,\s*['"]path['"]\)|createRelationshipPath\(/, 'active trace creates duplicate relationship paths', drawHighlight);
requirePattern(/relationshipPathPool\.size\s*(?:<=?|>=|>)\s*EDGES\.length/, 'path pool enforces the 711-relationship ceiling', applicationScript);

/* Lazy view teardown plus a live post-transition DOM ceiling. */
requirePattern(/\bconst\s+ACTIVE_DOM_LIMIT\s*=\s*8_?000\b/, '8,000 active-element ceiling', applicationScript);
const disposeInactiveView = functionSource(applicationScript, 'disposeInactiveView');
requirePattern(/network/i, 'inactive Network view disposal', disposeInactiveView);
requirePattern(/opportunity/i, 'inactive Opportunity view disposal', disposeInactiveView);
requirePattern(/(?:\.destroy(?:\?\.)?\(|\.dispose(?:\?\.)?\(|replaceChildren\()/, 'inactive lazy renderers are actually disposed', disposeInactiveView);
const auditActiveDomBudget = functionSource(applicationScript, 'auditActiveDomBudget');
requirePattern(/document\.querySelectorAll\(['"]\*['"]\)\.length/, 'live active-element count', auditActiveDomBudget);
requirePattern(/ACTIVE_DOM_LIMIT/, 'live count is checked against the release ceiling', auditActiveDomBudget);
const setViewMode = functionSource(applicationScript, 'setViewMode');
requirePattern(/disposeInactiveView\(/, 'every view transition disposes the prior lazy renderer', setViewMode);
requirePattern(/auditActiveDomBudget(?:\(|\))/,'every view transition schedules or performs the DOM audit', setViewMode);
requirePattern(/['"]map['"][\s\S]{0,180}['"]opportunity['"][\s\S]{0,180}['"]network['"][\s\S]{0,180}['"]list['"]/i, 'hostile Map/Opportunity/Network/List sequence is declared for verification', applicationScript);

console.log(JSON.stringify({
  status: 'PASS',
  release: 'v1.1.0',
  tours: presentation.tours.length,
  tourSteps: tourStepCount,
  semanticAltitudes: ['overview', 'mid', 'detail'],
  timeScales: ['density', 'linear'],
  relationshipPathCeiling: canonical.relationships.length,
  activeDomLimit: 8000,
  hashAdditions: ['scale', 'tour', 'step'],
  legacyHashMode: 'hover'
}, null, 2));
