'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const EXPECTED_RELEASE_TAG = process.env.AI_TREE_EXPECT_RELEASE_TAG || null;
assert.ok(
  EXPECTED_RELEASE_TAG === null || EXPECTED_RELEASE_TAG === 'v1.0.0',
  'AI_TREE_EXPECT_RELEASE_TAG must be unset or exactly v1.0.0'
);
const EXPECTED = Object.freeze({
  version: '1.0.0',
  citationVersion: '1.0.0',
  edition: '2026-08-21-stable-1',
  releaseState: 'Stable',
  asOf: '2026-08-04',
  date: '2026-08-21',
  opportunityAsOf: '2026-08-19',
  opportunityStatus: 'alpha',
  opportunityImportStatus: 'imported_unreviewed',
  repositoryUrl: 'https://github.com/neb6dav/ai_tech_tree',
  correctionsUrl: 'https://github.com/neb6dav/ai_tech_tree/issues/new/choose',
  contributionGuideUrl: 'https://github.com/neb6dav/ai_tech_tree/blob/main/CONTRIBUTING.md',
  license: 'https://creativecommons.org/licenses/by-sa/4.0/'
});

const EXPECTED_DISTRIBUTIONS = Object.freeze([
  Object.freeze({
    name: 'JSON-LD knowledge graph',
    filename: 'ai-research-tech-tree.jsonld',
    encodingFormat: 'application/ld+json'
  }),
  Object.freeze({
    name: 'Normalized atlas data',
    filename: 'ai-research-tech-tree.json',
    encodingFormat: 'application/json'
  }),
  Object.freeze({
    name: 'Streaming graph records',
    filename: 'ai-research-tech-tree.ndjson',
    encodingFormat: 'application/x-ndjson'
  })
]);

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function readJson(relative) {
  return JSON.parse(read(relative));
}

function readNdjson(relative) {
  return read(relative).trimEnd().split(/\r?\n/u).map((line) => JSON.parse(line));
}

function occurrenceCount(text, fragment) {
  return text.split(fragment).length - 1;
}

function loadSnapshot() {
  const ndjson = readNdjson('ai-research-tech-tree.ndjson');
  return {
    package: readJson('package.json'),
    packageLock: readJson('package-lock.json'),
    canonicalHtml: read('ai-research-tech-tree.html'),
    indexHtml: read('index.html'),
    normalized: readJson('ai-research-tech-tree.json'),
    jsonLd: readJson('ai-research-tech-tree.jsonld'),
    ndjsonDataset: ndjson.find((record) => record.recordType === 'dataset'),
    citation: read('CITATION.cff'),
    changelog: read('CHANGELOG.md'),
    sitemap: read('sitemap.xml'),
    networkSource: read('src/network-view.js'),
    opportunitySource: read('src/opportunity-view.js'),
    opportunityData: readJson('src/data/opportunities/diffusion-models.alpha.json'),
    catalog: readJson('src/data/atlas/catalog.json'),
    stageConfig: readJson('config/pages-stage.v1.json'),
    manifest: readJson('_site/release-manifest.json'),
    pagesWorkflow: read('.github/workflows/pages.yml')
  };
}

function assertHtmlIdentity(html, label) {
  assert(html.includes('<title>AI Research Tech Tree - v1.0.0 Stable</title>'), `${label} title`);
  for (const fragment of [
    '<meta name="description" content="The v1.0.0 stable edition',
    '<meta property="og:title" content="AI Research Tech Tree - v1.0.0 Stable">',
    '<meta property="og:description" content="Explore the v1.0.0 stable edition',
    '<meta name="twitter:title" content="AI Research Tech Tree - v1.0.0 Stable">',
    '<meta name="twitter:description" content="The v1.0.0 stable edition',
    '<meta name="ai-tree-version" content="1.0.0">',
    '<meta name="ai-tree-edition" content="2026-08-21-stable-1">',
    '<meta name="ai-tree-release-state" content="Stable">'
  ]) assert(html.includes(fragment), `${label} missing ${fragment}`);

  const head = html.slice(0, html.indexOf('</head>'));
  assert(!/development edition|public[ -]beta/iu.test(head), `${label} current head contains development/public-beta wording`);

  assert.equal(occurrenceCount(html, 'id="editionBadge"'), 1, `${label} edition badge count`);
  assert(html.includes('id="editionBadge" href="./release-manifest.json"'), `${label} manifest badge target`);
  assert(html.includes('Stable &middot; v1.0.0'), `${label} visible Stable label`);
  assert(html.includes('<span class="editionShort" aria-hidden="true">Stable</span>'), `${label} compact Stable label`);
  assert(html.includes(`id="repositoryLink" href="${EXPECTED.repositoryUrl}" target="_blank" rel="noopener noreferrer"`), `${label} repository link`);
  assert(html.includes(`id="contributeLink" href="${EXPECTED.correctionsUrl}" target="_blank" rel="noopener noreferrer"`), `${label} contribution link`);

  const barStart = html.indexOf('<div id="bar"');
  const controlsStart = html.indexOf('<div id="controls"', barStart);
  const contributeStart = html.indexOf('id="contributeLink"', barStart);
  assert(barStart >= 0 && contributeStart > barStart && contributeStart < controlsStart, `${label} persistent contribution placement`);

  for (const fragment of [
    'id="noscriptIdentity"',
    `id="nsRepositoryLink" href="${EXPECTED.repositoryUrl}"`,
    `id="nsContributeLink" href="${EXPECTED.correctionsUrl}"`,
    'id="nsCitationLink" href="./CITATION.cff"',
    'id="nsManifestLink" href="./release-manifest.json"',
    "addExternalLink(links,PROJECT_META.repositoryUrl,'Repository')",
    "addExternalLink(links,PROJECT_META.correctionsUrl,'Contribute or correct')",
    "[PROJECT_META.citationUrl,'Citation metadata']",
    "[PROJECT_META.manifestUrl,'Exact build manifest']"
  ]) assert(html.includes(fragment), `${label} publication surface missing ${fragment}`);
}

function assertIdentity(snapshot) {
  assert.equal(snapshot.package.version, EXPECTED.version, 'package version');
  assert.equal(snapshot.packageLock.version, EXPECTED.version, 'package-lock top-level version');
  assert.equal(snapshot.packageLock.packages[''].version, EXPECTED.version, 'package-lock root-package version');

  for (const [label, dataset] of [
    ['normalized JSON', snapshot.normalized.dataset],
    ['NDJSON', snapshot.ndjsonDataset?.dataset]
  ]) {
    assert(dataset, `${label} dataset record`);
    assert.equal(dataset.edition, EXPECTED.edition, `${label} edition`);
    assert.equal(dataset.releaseState, EXPECTED.releaseState, `${label} release state`);
    assert.equal(dataset.asOf, EXPECTED.asOf, `${label} historical review cutoff`);
  }
  assert.equal(snapshot.jsonLd['schema:version'], EXPECTED.edition, 'JSON-LD edition');
  assert.equal(snapshot.jsonLd['tree:releaseState'], EXPECTED.releaseState, 'JSON-LD release state');
  assert.deepEqual(snapshot.normalized.dataset.distributions, EXPECTED_DISTRIBUTIONS, 'public distribution discovery contract');
  assert.equal(snapshot.catalog.project.contributionGuideUrl, EXPECTED.contributionGuideUrl, 'public contribution-guide URL');
  assert.equal(snapshot.catalog.project.license, EXPECTED.license, 'public content-license URL');

  assertHtmlIdentity(snapshot.canonicalHtml, 'canonical HTML');
  assertHtmlIdentity(snapshot.indexHtml, 'generated index');

  assert.match(snapshot.citation, /^version:\s*1\.0\.0\s*$/mu, 'CITATION stable source version');
  assert.match(snapshot.citation, /^date-released:\s*"2026-08-21"\s*$/mu, 'CITATION release date');
  assert.match(snapshot.citation, /Cite the tagged v1\.0\.0 stable release dated 2026-08-21/u, 'CITATION tagged-release instruction');
  assert(snapshot.citation.includes('release-manifest.json'), 'CITATION exact-build route');
  assert(!/development edition|public[ -]beta/iu.test(snapshot.citation), 'CITATION current identity must be stable');

  assert(snapshot.changelog.includes('## [Unreleased]'), 'CHANGELOG Unreleased section');
  assert(snapshot.changelog.includes('## [1.0.0] - 2026-08-21'), 'CHANGELOG stable release section');
  assert(snapshot.changelog.includes('authorized annotated `v1.0.0` tag'), 'CHANGELOG annotated-tag release boundary');
  const currentChangelog = snapshot.changelog.slice(0, snapshot.changelog.indexOf('## [0.1.0]'));
  assert(!/development edition|public[ -]beta/iu.test(currentChangelog), 'current CHANGELOG identity must be stable');
  assert(snapshot.changelog.includes('**Public beta**'), 'historical public-beta changelog wording must remain');
  assert(snapshot.sitemap.includes(`<lastmod>${EXPECTED.date}</lastmod>`), 'sitemap lastmod');
  assert.equal(EXPECTED.edition.slice(0, 10), EXPECTED.date, 'edition date and sitemap date contract');

  assert.match(snapshot.networkSource, /export const VERSION = '1\.0\.0'/u, 'Network source version');
  assert.match(snapshot.opportunitySource, /export const VERSION = '1\.0\.0'/u, 'Opportunity renderer source version');
  assert.equal(snapshot.opportunityData.metadata.asOf, EXPECTED.opportunityAsOf, 'Opportunity review date remains distinct');
  assert.equal(snapshot.opportunityData.metadata.status, EXPECTED.opportunityStatus, 'Opportunity data status remains alpha');
  assert.equal(snapshot.opportunityData.metadata.importStatus.state, EXPECTED.opportunityImportStatus, 'Opportunity import remains unreviewed');
  assert.match(snapshot.opportunityData.metadata.importStatus.notes, /manual bibliography[\s\S]*review before publication-level promotion/iu, 'Opportunity disclosure');

  const citationArtifact = snapshot.stageConfig.artifacts.find((artifact) => artifact.target === 'CITATION.cff');
  assert(citationArtifact, 'CITATION staging entry');
  assert.equal(citationArtifact.source, 'CITATION.cff', 'CITATION staging source');
  assert.equal(citationArtifact.mediaType, 'text/yaml; charset=utf-8', 'CITATION media type');

  assert.equal(snapshot.manifest.version, EXPECTED.version, 'staged manifest version');
  assert.equal(snapshot.manifest.edition, EXPECTED.edition, 'staged manifest edition');
  assert.equal(snapshot.manifest.releaseState, EXPECTED.releaseState, 'staged manifest release state');
  assert.equal(snapshot.manifest.schemaVersion, '1.2.0', 'staged manifest identity schema');
  assert.match(snapshot.manifest.commit, /^[0-9a-f]{40}$/u, 'staged manifest full commit');
  assert.equal(snapshot.manifest.tag, EXPECTED_RELEASE_TAG, 'staged manifest must match the explicitly expected release tag');
  assert.equal(snapshot.manifest.fileCount, 14, 'stable manifest payload count');
  const citationFile = snapshot.manifest.files.find((file) => file.path === 'CITATION.cff');
  assert(citationFile, 'staged CITATION payload');
  assert.equal(citationFile.mediaType, 'text/yaml; charset=utf-8', 'staged CITATION payload media type');
  assert.match(citationFile.sha256, /^[0-9a-f]{64}$/u, 'staged CITATION payload digest');

  for (const fragment of [
    'workflow_dispatch:',
    'ref: refs/tags/v1.0.0',
    'test "$GITHUB_REF" = "refs/heads/main"',
    'test "$GITHUB_WORKFLOW_SHA" = "$GITHUB_SHA"',
    'pages.yml@refs/heads/main',
    'test "$(git cat-file -t "$tag_ref")" = "tag"',
    '67e1f7b7dea394451d4a2d54a929037982d30517',
    '7d0d26fe87c8be2868c63738c503f90d35789b3a',
    'test "$tag_object" = "$AI_TREE_AUTHORIZED_TAG_OBJECT"',
    'test "$tag_commit" = "$AI_TREE_AUTHORIZED_TAG_COMMIT"',
    'test "$GITHUB_SHA" = "$main_commit"',
    'git merge-base --is-ancestor "$tag_commit" "$main_commit"',
    'test "$(git rev-list --count "${tag_commit}..${main_commit}")" = "1"',
    'test "$(git rev-parse "${main_commit}^")" = "$tag_commit"',
    'git diff --name-status --no-renames "$tag_commit" "$main_commit"',
    'M\\t.github/workflows/pages.yml',
    'M\\tdocs/ROADMAP_DECISIONS.md',
    'M\\ttests/release-identity.test.cjs',
    'npx playwright install --with-deps chromium',
    'AI_TREE_EXPECT_RELEASE_TAG=$AI_TREE_AUTHORIZED_TAG'
  ]) assert(snapshot.pagesWorkflow.includes(fragment), `Pages release guard missing ${fragment}`);
}

test('v1.0.0 Stable release identity is synchronized without promoting alpha Opportunity data', () => {
  assertIdentity(loadSnapshot());
});

test('identity contract fails closed on representative release-drift mutations', () => {
  const mutations = [
    ['stale lockfile', (copy) => { copy.packageLock.version = '0.1.0'; }],
    ['stale export', (copy) => { copy.normalized.dataset.edition = '2026-08-20-public-beta-2'; }],
    ['stale citation date', (copy) => { copy.citation = copy.citation.replace('date-released: "2026-08-21"', 'date-released: "2026-08-20"'); }],
    ['missing social identity', (copy) => { copy.indexHtml = copy.indexHtml.replace('AI Research Tech Tree - v1.0.0 Stable', 'AI Research Tech Tree'); }],
    ['misdirected badge', (copy) => { copy.canonicalHtml = copy.canonicalHtml.replace('id="editionBadge" href="./release-manifest.json"', 'id="editionBadge" href="./"'); }],
    ['unexpected tag', (copy) => { copy.manifest.tag = EXPECTED_RELEASE_TAG === null ? 'v1.0.0' : null; }],
    ['stale manifest release state', (copy) => { copy.manifest.releaseState = 'Development edition'; }],
    ['renamed public distribution', (copy) => { copy.normalized.dataset.distributions[0].filename = 'graph.jsonld'; }],
    ['redirected contribution guide', (copy) => { copy.catalog.project.contributionGuideUrl = 'https://example.test/contribute'; }],
    ['promoted Opportunity data', (copy) => { copy.opportunityData.metadata.importStatus.state = 'validated'; }],
    ['stale Network source version', (copy) => { copy.networkSource = copy.networkSource.replace("VERSION = '1.0.0'", "VERSION = '0.1.1'"); }],
    ['missing citation payload', (copy) => { copy.manifest.files = copy.manifest.files.filter((file) => file.path !== 'CITATION.cff'); }],
    ['lightweight-tag release workflow', (copy) => { copy.pagesWorkflow = copy.pagesWorkflow.replace('git cat-file -t', 'git rev-parse'); }],
    ['unbounded recovery workflow', (copy) => { copy.pagesWorkflow = copy.pagesWorkflow.replace('M\\tdocs/ROADMAP_DECISIONS.md', 'M\\tREADME.md'); }],
    ['missing browser runtime install', (copy) => { copy.pagesWorkflow = copy.pagesWorkflow.replace('npx playwright install --with-deps chromium', 'echo skip-browser-runtime'); }]
  ];
  const original = loadSnapshot();
  for (const [label, mutate] of mutations) {
    const copy = structuredClone(original);
    mutate(copy);
    assert.throws(() => assertIdentity(copy), undefined, label);
  }
});
