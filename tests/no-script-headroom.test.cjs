'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const { loadCanonicalAtlas } = require('../canonical-atlas.js');
const { renderNoScriptRows } = require('../generate-knowledge-graph.js');

function readSidecar() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'atlas', 'no-script.json'), 'utf8'));
}

function parseRow(rowHtml) {
  const match = rowHtml.match(
    /^<tr><td>([^<]+)<\/td><td><strong><a href="(nodes\/[^/]+\/)"[^>]*>([\s\S]+?)<\/a><\/strong><\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>$/u
  );
  assert(match, `unexpected no-script row projection: ${rowHtml}`);
  return { date: match[1], href: match[2], title: match[3], lane: match[4], status: match[5] };
}

test('no-script input keeps all 339 ordered records and projects only static node links', () => {
  const sidecar = readSidecar();
  const canonical = loadCanonicalAtlas();

  assert.equal(sidecar.schemaVersion, '1.0.0');
  assert.equal(sidecar.rows.length, 339);
  assert.deepEqual(Object.keys(sidecar.rows[0]).sort(), ['nodeId', 'ordinal', 'rowHtml']);
  assert.deepEqual(sidecar.rows.map(row => row.nodeId), canonical.nodes.map(node => node.id));
  assert.deepEqual(sidecar.rows.map(row => row.ordinal), Array.from({ length: 339 }, (_, index) => index));

  for (const [index, row] of sidecar.rows.entries()) {
    const projection = parseRow(row.rowHtml);
    assert.equal(projection.href, `nodes/${row.nodeId}/`);
    assert(projection.date.length > 0);
    assert(projection.title.length > 0);
    assert(projection.lane.length > 0);
    assert(projection.status.length > 0);
    assert(fs.existsSync(path.join(ROOT, projection.href, 'index.html')), `missing static page for row ${index}`);
    assert(!row.rowHtml.includes('nsDesc'));
    assert(!row.rowHtml.includes(canonical.nodes[index].description));
  }
});

test('generated no-script projection is deterministic and has no duplicated long descriptions', () => {
  const canonical = loadCanonicalAtlas();
  const first = renderNoScriptRows(canonical);
  const second = renderNoScriptRows(canonical);

  assert.equal(first, second);
  const rows = [...first.matchAll(/<tr>[\s\S]*?<\/tr>/gu)].map(match => match[0]);
  assert.equal(rows.length, 339);
  assert.equal((first.match(/<a href="nodes\/[^"]+\/">/gu) || []).length, 339);
  assert(!first.includes('nsDesc'));
  assert(!first.includes('<span'));
  for (const node of canonical.nodes) assert(!first.includes(node.description));
});
