#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  buildFingerprintIndex,
  diffFingerprintIndex,
  serializeFingerprintIndex
} = require('./scripts/generate-edition-fingerprints.cjs');

const ROOT = __dirname;
const HTML_FILE = 'ai-research-tech-tree.html';
const INDEX_FILE = 'index.html';
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

function main() {
  run(process.execPath, [path.join(ROOT, 'generate-knowledge-graph.js')]);
  run(process.execPath, [path.join(ROOT, 'validate-opportunity-data.js')]);
  run(process.execPath, [path.join(ROOT, 'scripts', 'validate-presentation-data.cjs')]);
  run(process.execPath, [path.join(ROOT, 'scripts', 'build-workspace.cjs')]);
  run(process.execPath, [path.join(ROOT, 'scripts', 'finalize-html.cjs'), path.join(ROOT, INDEX_FILE)]);
  generateStaticDeliveryArtifacts();

  console.log(JSON.stringify({
    status: 'BUILT',
    html: HTML_FILE,
    index: INDEX_FILE,
    exports: ['ai-research-tech-tree.jsonld', 'ai-research-tech-tree.json', 'ai-research-tech-tree.ndjson']
  }, null, 2));
}

if (require.main === module) main();

module.exports = { generateStaticDeliveryArtifacts };
