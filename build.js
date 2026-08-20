#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');

const ROOT = __dirname;
const HTML_FILE = 'ai-research-tech-tree.html';
const INDEX_FILE = 'index.html';
const LAYOUT_FILE = 'network-layout-v1.json';
const BUNDLE_FILE = 'network-atlas.bundle.js';
const OPPORTUNITY_DATA_FILE = path.join('src', 'data', 'opportunities', 'diffusion-models.alpha.json');
const OPPORTUNITY_BUNDLE_FILE = 'opportunity-atlas.bundle.js';

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
  return result;
}

function injectBuiltAssets(html, layoutText, networkBundleText, opportunityDataText, opportunityBundleText) {
  return injectOpportunityAssets(
    injectNetworkAssets(html, layoutText, networkBundleText),
    opportunityDataText,
    opportunityBundleText
  );
}

function main() {
  run(process.execPath, [path.join(ROOT, 'validate-opportunity-data.js')]);
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
  const html = fs.readFileSync(htmlPath, 'utf8').replace(/\r\n/g, '\n');
  const layout = fs.readFileSync(layoutPath, 'utf8');
  const bundle = fs.readFileSync(bundlePath, 'utf8');
  const opportunityData = fs.readFileSync(opportunityDataPath, 'utf8');
  const opportunityBundle = fs.readFileSync(opportunityBundlePath, 'utf8');
  fs.writeFileSync(htmlPath, injectBuiltAssets(html, layout, bundle, opportunityData, opportunityBundle), 'utf8');

  run(process.execPath, [path.join(ROOT, 'generate-knowledge-graph.js')]);
  run(process.execPath, [path.join(ROOT, 'validate-opportunity-data.js')]);
  const firstLayout = fs.readFileSync(layoutPath, 'utf8');
  run(process.execPath, [path.join(ROOT, 'generate-network-layout.js')]);
  const refreshedLayout = fs.readFileSync(layoutPath, 'utf8');
  if (refreshedLayout !== firstLayout) {
    const refreshedHtml = fs.readFileSync(htmlPath, 'utf8').replace(/\r\n/g, '\n');
    fs.writeFileSync(htmlPath, injectBuiltAssets(refreshedHtml, refreshedLayout, bundle, opportunityData, opportunityBundle), 'utf8');
    run(process.execPath, [path.join(ROOT, 'generate-knowledge-graph.js')]);
    run(process.execPath, [path.join(ROOT, 'validate-opportunity-data.js')]);
  }
  run(process.execPath, [path.join(ROOT, 'generate-network-layout.js'), '--check']);
  fs.copyFileSync(htmlPath, path.join(ROOT, INDEX_FILE));

  console.log(JSON.stringify({
    status: 'BUILT',
    html: HTML_FILE,
    index: INDEX_FILE,
    layout: LAYOUT_FILE,
    bundle: BUNDLE_FILE,
    opportunityData: OPPORTUNITY_DATA_FILE.replace(/\\/g, '/'),
    opportunityBundle: OPPORTUNITY_BUNDLE_FILE
  }, null, 2));
}

if (require.main === module) main();

module.exports = { injectBuiltAssets, injectNetworkAssets, injectOpportunityAssets, injectScriptBody, safeInlineJson };
