'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const ATLAS_PATH = path.join(ROOT, 'ai-research-tech-tree.json');
const EXPECTED_NODE_COUNT = 339;
const EXPECTED_URL_COUNT = EXPECTED_NODE_COUNT + 1;
const PROJECT_URL = 'https://neb6dav.github.io/ai_tech_tree/';
const atlas = JSON.parse(fs.readFileSync(ATLAS_PATH, 'utf8'));
const { buildNodePageArtifacts } = require('../scripts/generate-node-pages.cjs');
const {
  buildSitemap,
  buildSitemapEntries,
  generateSitemap
} = require('../scripts/generate-sitemap.cjs');

function clone(value) {
  return structuredClone(value);
}

test('sitemap contains the canonical root and exactly one URL for all 339 canonical nodes', () => {
  const entries = buildSitemapEntries(atlas);
  const xml = buildSitemap(atlas);

  assert.equal(entries.length, EXPECTED_URL_COUNT);
  assert.equal((xml.match(/<url>/gu) || []).length, EXPECTED_URL_COUNT);
  assert.equal((xml.match(/<loc>/gu) || []).length, EXPECTED_URL_COUNT);
  assert.deepEqual(entries[0], {
    kind: 'root',
    loc: PROJECT_URL,
    lastmod: '2026-08-21',
    changefreq: 'monthly',
    priority: '1.0'
  });

  const nodeEntries = entries.slice(1);
  assert.equal(nodeEntries.length, EXPECTED_NODE_COUNT);
  assert.equal(new Set(nodeEntries.map(entry => entry.nodeId)).size, EXPECTED_NODE_COUNT);
  assert.equal(new Set(nodeEntries.map(entry => entry.loc)).size, EXPECTED_NODE_COUNT);
  assert(nodeEntries.every(entry => entry.lastmod === atlas.dataset.edition.slice(0, 10)));
  assert(nodeEntries.every(entry => Number(entry.priority) < Number(entries[0].priority)));
  assert.deepEqual(
    nodeEntries.map(entry => entry.nodeId),
    [...nodeEntries.map(entry => entry.nodeId)].sort()
  );
  assert(xml.endsWith('\n'));
});

test('sitemap node URLs exactly match the static node-page target inventory', () => {
  const sitemapNodeUrls = buildSitemapEntries(atlas)
    .filter(entry => entry.kind === 'node')
    .map(entry => entry.loc);
  const staticPageUrls = buildNodePageArtifacts(atlas)
    .map(artifact => new URL(artifact.target.replace(/index\.html$/u, ''), PROJECT_URL).href)
    .sort();

  assert.deepEqual(sitemapNodeUrls, staticPageUrls);
});

test('serialization is deterministic and XML-escapes canonical URL text', () => {
  const first = buildSitemap(atlas);
  const second = buildSitemap(clone(atlas));
  assert.equal(first, second);

  const escaped = buildSitemap(atlas, { canonicalBaseUrl: 'https://example.test/research&development/' });
  assert(escaped.includes('<loc>https://example.test/research&amp;development/</loc>'));
  assert(!escaped.includes('<loc>https://example.test/research&development/</loc>'));
  assert.throws(
    () => buildSitemap(atlas, { canonicalBaseUrl: '' }),
    /canonicalUrl/u
  );
});

test('unsafe, exact-duplicate, and case-colliding node IDs fail closed', () => {
  for (const unsafeId of ['../escape', 'a/b', 'a\\b', '.hidden', 'CON', 'con.txt', '%2e%2e', 'node name']) {
    const mutation = clone(atlas);
    mutation.nodes[0].id = unsafeId;
    assert.throws(() => buildSitemap(mutation), /traversal-safe|portable on Windows/u, unsafeId);
  }

  const duplicate = clone(atlas);
  duplicate.nodes[1].id = duplicate.nodes[0].id;
  assert.throws(() => buildSitemap(duplicate), /collide on case-insensitive filesystems/u);

  const collision = clone(atlas);
  collision.nodes[1].id = collision.nodes[0].id.toUpperCase();
  assert.throws(() => buildSitemap(collision), /collide on case-insensitive filesystems/u);
});

test('invalid canonical URLs and edition dates fail closed', () => {
  for (const canonicalUrl of [
    '',
    'relative/path/',
    'ftp://example.test/atlas/',
    'https://user:secret@example.test/atlas/',
    'https://example.test/atlas/?preview=1',
    'https://example.test/atlas/#node=transformer'
  ]) {
    const mutation = clone(atlas);
    mutation.dataset.canonicalUrl = canonicalUrl;
    assert.throws(() => buildSitemap(mutation), /canonicalUrl/u, canonicalUrl);
  }

  for (const edition of ['', '2026-8-21', '2026-02-30-preview', '0000-01-01', 'not-a-date']) {
    const mutation = clone(atlas);
    mutation.dataset.edition = edition;
    assert.throws(() => buildSitemap(mutation), /dataset edition/u, edition);
  }
});

test('generator writes the same deterministic 340-entry XML document', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tree-sitemap-'));
  const outputPath = path.join(fixtureRoot, 'nested', 'sitemap.xml');
  try {
    const result = await generateSitemap({ inputPath: ATLAS_PATH, outputPath });
    assert.equal(result.urlCount, EXPECTED_URL_COUNT);
    assert.equal(result.contents, buildSitemap(atlas));
    assert.equal(fs.readFileSync(outputPath, 'utf8'), result.contents);
  } finally {
    assert(fixtureRoot.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
