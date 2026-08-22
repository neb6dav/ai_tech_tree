'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const ATLAS_PATH = path.join(ROOT, 'ai-research-tech-tree.json');
const EXPECTED_NODE_COUNT = 339;
const PROJECT_URL = 'https://neb6dav.github.io/ai_tech_tree/';
const {
  buildNodePageArtifacts,
  generateNodePages,
  isBibTeXEligible,
  renderBibTeX
} = require('../scripts/generate-node-pages.cjs');

function readAtlas() {
  return JSON.parse(fs.readFileSync(ATLAS_PATH, 'utf8'));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function artifactFor(artifacts, nodeId) {
  const artifact = artifacts.find(candidate => candidate.nodeId === nodeId);
  assert(artifact, `missing page for ${nodeId}`);
  return artifact;
}

function clone(value) {
  return structuredClone(value);
}

test('build produces one deterministic traversal-safe page for every canonical node', () => {
  const atlas = readAtlas();
  const first = buildNodePageArtifacts(atlas);
  const second = buildNodePageArtifacts(atlas);

  assert.equal(first.length, EXPECTED_NODE_COUNT);
  assert.equal(new Set(first.map(artifact => artifact.nodeId)).size, EXPECTED_NODE_COUNT);
  assert.equal(new Set(first.map(artifact => artifact.target)).size, EXPECTED_NODE_COUNT);
  assert.deepEqual(
    first.map(artifact => artifact.target),
    atlas.nodes.map(node => `nodes/${node.id}/index.html`)
  );
  assert.deepEqual(
    first.map(artifact => sha256(artifact.contents)),
    second.map(artifact => sha256(artifact.contents))
  );
  for (const artifact of first) {
    assert.match(artifact.target, /^nodes\/[A-Za-z0-9][A-Za-z0-9._~-]*\/index\.html$/u);
    assert.equal(artifact.mediaType, 'text/html; charset=utf-8');
    assert(artifact.contents.endsWith('\n'));
    assert.match(artifact.contents, /<h1>[^<]+<\/h1>/u);
    assert.match(artifact.contents, /<dt>Year<\/dt>/u);
    assert.match(artifact.contents, /<dt>Lane<\/dt>/u);
    assert.match(artifact.contents, /<dt>Status<\/dt>/u);
    assert.match(artifact.contents, /<h2 id="summary-title">Summary<\/h2>/u);
    assert.match(artifact.contents, /<h2 id="works-title">Works and sources<\/h2>/u);
    assert.match(artifact.contents, /<h2 id="evidence-title">Evidence caveat<\/h2>/u);
    assert.match(artifact.contents, /href="\/ai_tech_tree\/#node=/u);
    assert.match(artifact.contents, /<meta property="og:image" content="https:\/\//u);
    assert(!/<script\b/iu.test(artifact.contents));
  }
});

test('writer materializes exactly 339 node index pages beneath the requested output root', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tree-node-pages-'));
  try {
    const artifacts = await generateNodePages({ inputPath: ATLAS_PATH, outputDirectory: fixtureRoot });
    assert.equal(artifacts.length, EXPECTED_NODE_COUNT);
    const nodeDirectories = fs.readdirSync(path.join(fixtureRoot, 'nodes'), { withFileTypes: true });
    assert.equal(nodeDirectories.length, EXPECTED_NODE_COUNT);
    assert(nodeDirectories.every(entry => entry.isDirectory()));
    const generatedFiles = nodeDirectories.flatMap(entry =>
      fs.readdirSync(path.join(fixtureRoot, 'nodes', entry.name)).map(file => `${entry.name}/${file}`)
    );
    assert.equal(generatedFiles.length, EXPECTED_NODE_COUNT);
    assert(generatedFiles.every(file => file.endsWith('/index.html')));
  } finally {
    assert(fixtureRoot.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('unsafe and colliding node IDs are rejected before any artifact is returned', () => {
  const atlas = readAtlas();
  for (const unsafeId of ['../escape', 'a/b', 'a\\b', '.hidden', 'CON', 'con.txt', '%2e%2e', 'node name']) {
    const mutation = clone(atlas);
    mutation.nodes[0].id = unsafeId;
    assert.throws(
      () => buildNodePageArtifacts(mutation),
      /traversal-safe|portable on Windows/u,
      unsafeId
    );
  }

  const collision = clone(atlas);
  collision.nodes[1].id = collision.nodes[0].id.toUpperCase();
  assert.throws(() => buildNodePageArtifacts(collision), /collide on case-insensitive filesystems/u);
});

test('node content and metadata are escaped while backlink, canonical URL, and social image stay exact', () => {
  const atlas = readAtlas();
  const node = atlas.nodes.find(candidate => candidate.id === 'transformer');
  node.title = 'Transformer </title><script>alert("title")</script> & friends';
  node.description = 'Summary <img src=x onerror="alert(1)"> & evidence.';
  node.chronology.dateLabel = '2017 <script>year</script>';
  node.status.activity = 'active <script>status</script>';
  atlas.lanes.find(lane => lane.id === node.laneId).label = 'Neural <script>lane</script>';

  const html = artifactFor(buildNodePageArtifacts(atlas), 'transformer').contents;
  assert(!html.includes('<script>alert'));
  assert(!html.includes('<img src=x'));
  assert(html.includes('Transformer &lt;/title&gt;&lt;script&gt;alert(&quot;title&quot;)&lt;/script&gt; &amp; friends'));
  assert(html.includes('Summary &lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; evidence.'));
  assert(html.includes('2017 &lt;script&gt;year&lt;/script&gt;'));
  assert(html.includes('Neural &lt;script&gt;lane&lt;/script&gt;'));
  assert(html.includes('Active &lt;script&gt;status&lt;/script&gt;'));
  assert(html.includes('href="/ai_tech_tree/#node=transformer"'));
  assert(html.includes(`<link rel="canonical" href="${PROJECT_URL}nodes/transformer/">`));
  assert(html.includes(`<meta property="og:url" content="${PROJECT_URL}nodes/transformer/">`));
  assert(html.includes(`<meta property="og:image" content="${PROJECT_URL}social-card.png">`));
  assert(html.includes('<link rel="alternate" type="application/json" href="/ai_tech_tree/ai-research-tech-tree.json"'));
  assert(!/<script\b/iu.test(html));
  for (const requiredText of ['Year', 'Lane', 'Status', 'Works and sources', 'Evidence caveat']) {
    assert(html.includes(requiredText), `missing static node field: ${requiredText}`);
  }
});

test('explicit unsafe URL overrides fail closed instead of falling back to dataset metadata', () => {
  const atlas = readAtlas();
  assert.throws(
    () => buildNodePageArtifacts(atlas, { canonicalBaseUrl: '' }),
    /canonicalBaseUrl/u
  );
  assert.throws(
    () => buildNodePageArtifacts(atlas, { canonicalBaseUrl: 'https://example.test//evil/' }),
    /canonicalBaseUrl pathname cannot begin with \/\//u
  );
  assert.throws(
    () => buildNodePageArtifacts(atlas, { socialImageUrl: 'https://example.test/social.png?cache=1' }),
    /socialImageUrl/u
  );
});

test('root links follow the canonical project pathname for alternate mounts', () => {
  const atlas = readAtlas();
  const html = artifactFor(
    buildNodePageArtifacts(atlas, { canonicalBaseUrl: 'https://example.test/research/deck/' }),
    'transformer'
  ).contents;
  assert(html.includes('href="/research/deck/#node=transformer"'));
  assert(html.includes('<link rel="alternate" type="application/json" href="/research/deck/ai-research-tech-tree.json"'));
  assert(html.includes('<footer><a href="/research/deck/ai-research-tech-tree.json">'));
});

test('pages expose recorded works, sources, assessments, and BibTeX only for eligible linked metadata', () => {
  const atlas = readAtlas();
  const artifacts = buildNodePageArtifacts(atlas);
  const eligibleLinks = atlas.landmarkWorkLinks.filter(link => {
    const work = atlas.landmarkWorks.find(candidate => candidate.id === link.workId);
    return isBibTeXEligible(work);
  });
  assert(eligibleLinks.length > 0);

  const eligibleNodeId = eligibleLinks[0].nodeId;
  const eligiblePage = artifactFor(artifacts, eligibleNodeId).contents;
  assert(eligiblePage.includes('<h2 id="works-title">Works and sources</h2>'));
  assert(eligiblePage.includes('<h2 id="evidence-title">Evidence caveat</h2>'));
  assert(eligiblePage.includes('<section id="bibtex"'));
  assert(eligiblePage.includes('These entries use only bibliographic fields already present in the atlas.'));

  const ineligibleNode = atlas.nodes.find(node => {
    const works = atlas.landmarkWorkLinks
      .filter(link => link.nodeId === node.id)
      .map(link => atlas.landmarkWorks.find(work => work.id === link.workId));
    return works.every(work => !isBibTeXEligible(work));
  });
  assert(ineligibleNode);
  assert(!artifactFor(artifacts, ineligibleNode.id).contents.includes('<section id="bibtex"'));

  const complete = {
    id: 'recorded-work',
    title: 'Recorded & Reviewed Work',
    year: 2024,
    authors: ['A. Researcher'],
    url: 'https://doi.org/10.1234/example.42'
  };
  assert.equal(isBibTeXEligible(complete), true);
  const bibtex = renderBibTeX(complete);
  assert.match(bibtex, /title = \{Recorded \\& Reviewed Work\}/u);
  assert.match(bibtex, /author = \{\{A\. Researcher\}\}/u);
  assert.match(bibtex, /year = \{2024\}/u);
  assert.match(bibtex, /doi = \{10\.1234\/example\.42\}/u);
  assert.match(bibtex, /url = \{https:\/\/doi\.org\/10\.1234\/example\.42\}/u);

  assert.equal(isBibTeXEligible({ ...complete, authors: [] }), false);
  assert.equal(isBibTeXEligible({ ...complete, title: '' }), false);
  assert.equal(isBibTeXEligible({ ...complete, year: null }), false);
  assert.equal(isBibTeXEligible({ ...complete, url: 'javascript:alert(1)' }), false);
  assert.equal(isBibTeXEligible({ ...complete, authors: [], issuingOrganization: 'Recorded Lab' }), true);
  assert.equal(isBibTeXEligible({ ...complete, authors: [], issuingOrganization: undefined, organization: 'Unspecified Lab' }), false);
  assert.equal(isBibTeXEligible({ ...complete, url: 'https://user:secret@example.test/work' }), false);
});
