#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');
const {
  buildFingerprintIndex,
  diffFingerprintIndex,
  serializeFingerprintIndex
} = require('./scripts/generate-edition-fingerprints.cjs');

const ROOT = __dirname;
const HTML_FILE = 'ai-research-tech-tree.html';
const INDEX_FILE = 'index.html';
const LAYOUT_FILE = 'network-layout-v1.json';
const BUNDLE_FILE = 'network-atlas.bundle.js';
const OPPORTUNITY_DATA_FILE = path.join('src', 'data', 'opportunities', 'diffusion-models.alpha.json');
const OPPORTUNITY_BUNDLE_FILE = 'opportunity-atlas.bundle.js';
const PRESENTATION_DATA_FILE = path.join('src', 'ui', 'atlas-presentation.v1.json');
const NODE_PAGE_SCRIPT = path.join(ROOT, 'scripts', 'generate-node-pages.cjs');
const SITEMAP_SCRIPT = path.join(ROOT, 'scripts', 'generate-sitemap.cjs');
const NODE_PAGES_DIRECTORY = path.join(ROOT, 'nodes');
const SITEMAP_FILE = 'sitemap.xml';
const FINGERPRINT_FILE = path.join('src', 'data', 'editions', 'v1.0.0-fingerprints.json');

function removeStaleNodePages() {
  // The root `nodes/` directory is a build output, not an authoring source.
  // Validate its shape before removing it so a stale page cleanup cannot
  // follow a junction/symlink or accidentally target a broader directory.
  assert.equal(path.dirname(NODE_PAGES_DIRECTORY), ROOT, 'node-page output must remain directly beneath the repository root');
  let rootStat;
  try {
    rootStat = fs.lstatSync(NODE_PAGES_DIRECTORY);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  assert(!rootStat.isSymbolicLink(), 'root nodes output must not be a symbolic link or junction');
  assert(rootStat.isDirectory(), 'root nodes output must be a directory');

  function rejectLinks(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const stat = fs.lstatSync(absolute);
      assert(!stat.isSymbolicLink(), `root nodes output contains a symbolic link or junction: ${path.relative(ROOT, absolute)}`);
      if (stat.isDirectory()) rejectLinks(absolute);
    }
  }
  rejectLinks(NODE_PAGES_DIRECTORY);
  fs.rmSync(NODE_PAGES_DIRECTORY, { recursive: true, force: true });
}

function regenerateFingerprintIndex() {
  const inputPath = path.join(ROOT, 'ai-research-tech-tree.json');
  const outputPath = path.join(ROOT, FINGERPRINT_FILE);
  assert(fs.existsSync(outputPath), `${FINGERPRINT_FILE} is required as the v1.0.0 semantic baseline`);
  const dataset = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const baselineText = fs.readFileSync(outputPath, 'utf8');
  let baseline;
  try {
    baseline = JSON.parse(baselineText);
  } catch (error) {
    throw new Error(`${FINGERPRINT_FILE} is not valid JSON: ${error.message}`);
  }
  const candidate = buildFingerprintIndex(dataset, { releaseVersion: '1.0.0' });
  const diff = diffFingerprintIndex(dataset, baseline);
  assert.deepEqual(
    diff,
    { nodes: { added: [], removed: [], changed: [] }, relationships: { added: [], removed: [], changed: [] } },
    'canonical data has semantic drift from the checked-in v1.0.0 fingerprint baseline'
  );
  fs.writeFileSync(outputPath, serializeFingerprintIndex(candidate), 'utf8');
}

function generateStaticDeliveryArtifacts() {
  // Validate the semantic baseline before removing any existing generated
  // pages, so a failed release cannot strand a partially cleaned output tree.
  regenerateFingerprintIndex();
  removeStaleNodePages();
  run(process.execPath, [NODE_PAGE_SCRIPT, path.join(ROOT, 'ai-research-tech-tree.json'), ROOT]);
  run(process.execPath, [SITEMAP_SCRIPT, path.join(ROOT, 'ai-research-tech-tree.json'), path.join(ROOT, SITEMAP_FILE)]);
}

function run(executable, args) {
  execFileSync(executable, args, {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: true
  });
}

function injectScriptBody(html, id, body, requiredType = null) {
  const pattern = new RegExp(`<script\\b([^>]*\\bid=["']${id}["'][^>]*)>([\\s\\S]*?)<\\/script>`, 'gi');
  const matches = [...html.matchAll(pattern)];
  assert.equal(matches.length, 1, `Expected exactly one #${id} script placeholder, found ${matches.length}`);
  const attributes = matches[0][1];
  if (requiredType) {
    const typePattern = new RegExp(`\\btype=["']${requiredType.replace('/', '\\/')}["']`, 'i');
    assert.match(attributes, typePattern, `#${id} must use type=${requiredType}`);
  } else {
    assert(!/\btype=["'](?:application\/(?:json|ld\+json)|importmap)["']/i.test(attributes), `#${id} must be executable JavaScript`);
  }
  const start = matches[0].index;
  const end = start + matches[0][0].length;
  const openingTag = matches[0][0].slice(0, matches[0][0].indexOf('>') + 1);
  return `${html.slice(0, start)}${openingTag}${body}</script>${html.slice(end)}`;
}

function safeInlineJson(text) {
  const value = JSON.parse(text);
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function declareRuntimeFragments(html, scriptId, fragmentIds) {
  const pattern = new RegExp(`<script\\b[^>]*\\bid=["']${scriptId}["'][^>]*>`, 'gi');
  const matches = [...html.matchAll(pattern)];
  assert.equal(matches.length, 1, `Expected exactly one #${scriptId} script for runtime fragment declarations`);
  const declaration = [...new Set(fragmentIds)].sort().join(' ');
  const openingTag = matches[0][0]
    .replace(/\sdata-runtime-fragment-ids=(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/>$/u, ` data-runtime-fragment-ids="${declaration}">`);
  return `${html.slice(0, matches[0].index)}${openingTag}${html.slice(matches[0].index + matches[0][0].length)}`;
}

function injectNetworkAssets(html, layoutText, bundleText) {
  assert(!/<\/script/i.test(bundleText), `${BUNDLE_FILE} contains a closing script sequence and cannot be safely inlined`);
  let result = injectScriptBody(html, 'network-layout-data', safeInlineJson(layoutText), 'application/json');
  result = injectScriptBody(result, 'network-view-engine', bundleText.replace(/\r\n/g, '\n').trimEnd());
  return result;
}

function injectOpportunityAssets(html, dataText, bundleText) {
  assert(!/<\/script/i.test(bundleText), `${OPPORTUNITY_BUNDLE_FILE} contains a closing script sequence and cannot be safely inlined`);
  let result = injectScriptBody(html, 'opportunity-data', safeInlineJson(dataText), 'application/json');
  result = injectScriptBody(result, 'opportunity-view-engine', bundleText.replace(/\r\n/g, '\n').trimEnd());
  return declareRuntimeFragments(result, 'opportunity-view-engine', ['opportunityArrow']);
}

function injectPresentationAsset(html, presentationText) {
  const id = 'atlas-presentation-data';
  if (new RegExp(`<script\\b[^>]*\\bid=["']${id}["']`, 'i').test(html)) {
    return injectScriptBody(html, id, safeInlineJson(presentationText), 'application/json');
  }
  const marker = '<script id="network-layout-data"';
  assert(html.includes(marker), 'Expected #network-layout-data marker for presentation-data insertion');
  return html.replace(
    marker,
    `<script id="${id}" type="application/json">${safeInlineJson(presentationText)}</script>\n${marker}`
  );
}

function injectBuiltAssets(html, layoutText, networkBundleText, opportunityDataText, opportunityBundleText, presentationText) {
  return injectOpportunityAssets(
    injectPresentationAsset(injectNetworkAssets(html, layoutText, networkBundleText), presentationText),
    opportunityDataText,
    opportunityBundleText
  );
}

function main() {
  run(process.execPath, [path.join(ROOT, 'generate-knowledge-graph.js')]);
  run(process.execPath, [path.join(ROOT, 'validate-opportunity-data.js')]);
  run(process.execPath, [path.join(ROOT, 'scripts', 'validate-presentation-data.cjs')]);
  run(process.execPath, [path.join(ROOT, 'generate-network-layout.js')]);
  if (process.env.AI_TREE_PREBUILT_NETWORK !== '1') {
    esbuild.buildSync({
      entryPoints: [path.join(ROOT, 'src', 'network-view.js')],
      bundle: true,
      format: 'iife',
      globalName: 'NetworkAtlas',
      platform: 'browser',
      target: 'es2020',
      outfile: path.join(ROOT, BUNDLE_FILE),
      minify: true,
      legalComments: 'eof'
    });
  } else {
    assert(fs.existsSync(path.join(ROOT, BUNDLE_FILE)), `${BUNDLE_FILE} is required when AI_TREE_PREBUILT_NETWORK=1`);
  }
  if (process.env.AI_TREE_PREBUILT_OPPORTUNITY !== '1') {
    esbuild.buildSync({
      entryPoints: [path.join(ROOT, 'src', 'opportunity-view.js')],
      bundle: true,
      format: 'iife',
      globalName: 'OpportunityAtlas',
      platform: 'browser',
      target: 'es2020',
      outfile: path.join(ROOT, OPPORTUNITY_BUNDLE_FILE),
      minify: true,
      legalComments: 'eof'
    });
  } else {
    assert(fs.existsSync(path.join(ROOT, OPPORTUNITY_BUNDLE_FILE)), `${OPPORTUNITY_BUNDLE_FILE} is required when AI_TREE_PREBUILT_OPPORTUNITY=1`);
  }

  const htmlPath = path.join(ROOT, HTML_FILE);
  const layoutPath = path.join(ROOT, LAYOUT_FILE);
  const bundlePath = path.join(ROOT, BUNDLE_FILE);
  const opportunityDataPath = path.join(ROOT, OPPORTUNITY_DATA_FILE);
  const opportunityBundlePath = path.join(ROOT, OPPORTUNITY_BUNDLE_FILE);
  const presentationDataPath = path.join(ROOT, PRESENTATION_DATA_FILE);
  const html = fs.readFileSync(htmlPath, 'utf8').replace(/\r\n/g, '\n');
  const layout = fs.readFileSync(layoutPath, 'utf8');
  const bundle = fs.readFileSync(bundlePath, 'utf8');
  const opportunityData = fs.readFileSync(opportunityDataPath, 'utf8');
  const opportunityBundle = fs.readFileSync(opportunityBundlePath, 'utf8');
  const presentationData = fs.readFileSync(presentationDataPath, 'utf8');
  fs.writeFileSync(htmlPath, injectBuiltAssets(html, layout, bundle, opportunityData, opportunityBundle, presentationData), 'utf8');

  run(process.execPath, [path.join(ROOT, 'generate-knowledge-graph.js')]);
  run(process.execPath, [path.join(ROOT, 'validate-opportunity-data.js')]);
  const firstLayout = fs.readFileSync(layoutPath, 'utf8');
  run(process.execPath, [path.join(ROOT, 'generate-network-layout.js')]);
  const refreshedLayout = fs.readFileSync(layoutPath, 'utf8');
  if (refreshedLayout !== firstLayout) {
    const refreshedHtml = fs.readFileSync(htmlPath, 'utf8').replace(/\r\n/g, '\n');
    fs.writeFileSync(htmlPath, injectBuiltAssets(refreshedHtml, refreshedLayout, bundle, opportunityData, opportunityBundle, presentationData), 'utf8');
    run(process.execPath, [path.join(ROOT, 'generate-knowledge-graph.js')]);
    run(process.execPath, [path.join(ROOT, 'validate-opportunity-data.js')]);
  }
  run(process.execPath, [path.join(ROOT, 'generate-network-layout.js'), '--check']);
  generateStaticDeliveryArtifacts();
  fs.copyFileSync(htmlPath, path.join(ROOT, INDEX_FILE));

  console.log(JSON.stringify({
    status: 'BUILT',
    html: HTML_FILE,
    index: INDEX_FILE,
    layout: LAYOUT_FILE,
    bundle: BUNDLE_FILE,
    opportunityData: OPPORTUNITY_DATA_FILE.replace(/\\/g, '/'),
    opportunityBundle: OPPORTUNITY_BUNDLE_FILE,
    presentationData: PRESENTATION_DATA_FILE.replace(/\\/g, '/')
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  declareRuntimeFragments,
  injectBuiltAssets,
  injectNetworkAssets,
  injectOpportunityAssets,
  injectPresentationAsset,
  injectScriptBody,
  generateStaticDeliveryArtifacts,
  safeInlineJson
};
