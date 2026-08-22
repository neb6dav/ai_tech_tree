'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const { loadCanonicalAtlas } = require('../canonical-atlas.js');
const {
  applyCanonicalAtlas,
  buildExports,
  renderProject
} = require('../generate-knowledge-graph.js');

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n');
}

test('runtime PROJECT_META omits the duplicated changelog and its UI projection', () => {
  const canonical = loadCanonicalAtlas();
  const projectScript = renderProject(canonical.catalog.project);
  assert(!projectScript.includes('changelog:'));
  assert(projectScript.includes(`version:'${canonical.catalog.project.version}'`));

  const projected = applyCanonicalAtlas(read('ai-research-tech-tree.html'), canonical);
  const projectMatch = projected.match(/const PROJECT_META=Object\.freeze\((\{[\s\S]*?\})\);(?=\nconst DATE_OVERRIDES=)/u);
  assert(projectMatch, 'project metadata projection is missing');
  assert(!projectMatch[1].includes('changelog:'));
  assert(!projected.includes("PROJECT_META.changelog.forEach"));
  assert.equal(applyCanonicalAtlas(projected, canonical), projected, 'canonical projection must be idempotent');
});

test('canonical export history remains byte-for-byte unchanged', () => {
  const canonical = loadCanonicalAtlas();
  const { plain, datasetGraph, ndjsonRecords } = buildExports(canonical.legacyModel);
  const plainBody = `${JSON.stringify(plain, null, 2)}\n`;
  const jsonLdBody = JSON.stringify(datasetGraph);
  const ndjsonBody = `${ndjsonRecords.map(record => JSON.stringify(record)).join('\n')}\n`;

  assert.deepEqual(plain.dataset.changelog, canonical.catalog.project.changelog);
  assert.equal(plainBody, read('ai-research-tech-tree.json'));
  assert.equal(jsonLdBody, read('ai-research-tech-tree.jsonld'));
  assert.equal(ndjsonBody, read('ai-research-tech-tree.ndjson'));
});
