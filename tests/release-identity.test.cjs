'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const EXPECTED = Object.freeze({
  version: '0.1.1',
  citationVersion: '0.1.1-dev',
  edition: '2026-08-20-public-beta-2',
  releaseState: 'Development edition',
  asOf: '2026-08-04',
  date: '2026-08-20',
  repositoryUrl: 'https://github.com/neb6dav/ai_tech_tree',
  correctionsUrl: 'https://github.com/neb6dav/ai_tech_tree/issues/new/choose'
});

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
  const stageConfig = readJson('config/pages-stage.v1.json');
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
    readme: read('README.md'),
    sitemap: read('sitemap.xml'),
    stageConfig,
    releasePlan: readJson(stageConfig.metadata.releaseFile),
    releasePlanBytes: fs.readFileSync(path.join(ROOT, stageConfig.metadata.releaseFile)),
    manifest: readJson('_site/release-manifest.json')
  };
}

function assertHtmlIdentity(html, label) {
  assert(html.includes('<title>AI Research Tech Tree - v0.1.1 Development Edition</title>'), `${label} title`);
  for (const fragment of [
    '<meta name="description" content="The v0.1.1 development edition',
    '<meta property="og:title" content="AI Research Tech Tree - v0.1.1 Development Edition">',
    '<meta property="og:description" content="Explore the v0.1.1 development edition',
    '<meta name="twitter:title" content="AI Research Tech Tree - v0.1.1 Development Edition">',
    '<meta name="twitter:description" content="The v0.1.1 development edition',
    '<meta name="ai-tree-version" content="0.1.1">',
    '<meta name="ai-tree-edition" content="2026-08-20-public-beta-2">',
    '<meta name="ai-tree-release-state" content="Development edition">'
  ]) assert(html.includes(fragment), `${label} missing ${fragment}`);

  assert.equal(occurrenceCount(html, 'id="editionBadge"'), 1, `${label} edition badge count`);
  assert(html.includes('id="editionBadge" href="./release-manifest.json"'), `${label} manifest badge target`);
  assert(html.includes('Development edition &middot; v0.1.1'), `${label} visible development label`);
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

  assertHtmlIdentity(snapshot.canonicalHtml, 'canonical HTML');
  assertHtmlIdentity(snapshot.indexHtml, 'generated index');

  assert.match(snapshot.citation, /^version:\s*0\.1\.1-dev\s*$/mu, 'CITATION development version');
  assert(!/^date-released:/mu.test(snapshot.citation), 'CITATION must not claim a release date before an authorized tag');
  assert(snapshot.citation.includes('untagged v0.1.1 development edition'), 'CITATION development warning');
  assert(snapshot.citation.includes('release-manifest.json'), 'CITATION exact-build route');

  assert(snapshot.changelog.includes('## [Unreleased]'), 'CHANGELOG Unreleased section');
  assert(snapshot.changelog.includes('Target: v0.1.1 development edition'), 'CHANGELOG development target');
  assert(!/^## \[0\.1\.1\]/mu.test(snapshot.changelog), 'CHANGELOG must not claim a v0.1.1 release before tagging');
  assert(snapshot.readme.includes('untagged `v0.1.1` development edition'), 'README development state');
  assert(snapshot.readme.includes('latest tagged release remains `v0.1.0`'), 'README latest stable tag');
  assert(snapshot.readme.includes(`[open a structured issue](${EXPECTED.correctionsUrl})`), 'README contribution route');
  assert(snapshot.sitemap.includes(`<lastmod>${EXPECTED.date}</lastmod>`), 'sitemap lastmod');
  assert.equal(EXPECTED.edition.slice(0, 10), EXPECTED.date, 'edition date and sitemap date contract');

  const citationArtifact = snapshot.stageConfig.artifacts.find((artifact) => artifact.target === 'CITATION.cff');
  assert(citationArtifact, 'CITATION staging entry');
  assert.equal(citationArtifact.source, 'CITATION.cff', 'CITATION staging source');
  assert.equal(citationArtifact.mediaType, 'text/yaml; charset=utf-8', 'CITATION media type');
  assert.equal(snapshot.stageConfig.schemaVersion, '1.1.0', 'stage configuration schema');
  assert.equal(snapshot.stageConfig.metadata.citationFile, 'CITATION.cff', 'citation identity input');
  assert.equal(snapshot.stageConfig.metadata.changelogFile, 'CHANGELOG.md', 'changelog identity input');
  assert.equal(snapshot.stageConfig.metadata.releaseFile, 'config/releases/v0.1.1.json', 'release-spec identity input');

  assert.equal(snapshot.manifest.version, EXPECTED.version, 'staged manifest version');
  assert.equal(snapshot.manifest.edition, EXPECTED.edition, 'staged manifest edition');
  assert.equal(snapshot.manifest.releaseState, EXPECTED.releaseState, 'staged manifest release state');
  assert.equal(snapshot.manifest.schemaVersion, '1.4.0', 'staged manifest identity schema');
  assert.match(snapshot.manifest.commit, /^[0-9a-f]{40}$/u, 'staged manifest full commit');
  const sourceState = snapshot.manifest.sourceState;
  assert.equal(sourceState.kind, 'git', 'staged manifest Git provenance kind');
  assert.equal(sourceState.repositoryTopLevel, '.', 'staged manifest checkout-relative repository root');
  assert.equal(sourceState.repositoryRootMatchesTopLevel, true, 'staged manifest repository-root closure');
  assert.match(sourceState.gitObjectFormat, /^sha(?:1|256)$/u, 'staged manifest Git object format');
  assert.equal(sourceState.objectDatabaseVerified, true, 'staged manifest Git object integrity');
  assert.equal(sourceState.repositoryFsckConfigurationIsolated, true, 'staged manifest Git fsck isolation');
  assert.equal(sourceState.repositoryAttributesIsolated, true, 'staged manifest Git attribute isolation');
  assert(sourceState.trackedTreeEntryCount > 0, 'staged manifest tracked-tree entry coverage');
  assert.equal(sourceState.trackedTreeFilterAttributeCount, 0, 'staged manifest tracked-tree filter closure');
  assert.equal(sourceState.trackedTreeFiltersVerified, true, 'staged manifest tracked-tree filter audit');
  assert.match(sourceState.trackedTreeFilterAuditSha256, /^[0-9a-f]{64}$/u, 'staged tracked-tree filter digest');
  assert.equal(sourceState.head, snapshot.manifest.commit, 'staged manifest HEAD and advertised commit');
  assert.equal(sourceState.commitMatchesHead, true, 'staged manifest commit-to-HEAD closure');
  assert.equal(typeof sourceState.clean, 'boolean', 'staged manifest source cleanliness is measured');
  assert.equal(typeof sourceState.requiredClean, 'boolean', 'staged manifest clean requirement is explicit');
  if (sourceState.requiredClean) assert.equal(sourceState.clean, true, 'required-clean stage is clean');
  assert.equal(sourceState.matchedInputCount, sourceState.inputCount, 'all staged inputs match the commit');
  assert.equal(
    sourceState.matchedDirectorySourceCount,
    sourceState.directorySourceCount,
    'all staged directory sources match the commit'
  );
  assert.equal(sourceState.inputsMatchCommit, true, 'staged manifest input-to-commit closure');
  assert.match(sourceState.inputVerificationSha256, /^[0-9a-f]{64}$/u, 'staged input verification digest');
  assert.equal(snapshot.releasePlan.status, 'planned', 'release specification remains planned');
  assert.equal(snapshot.releasePlan.releaseDate, null, 'planned release has no date');
  assert.equal(snapshot.releasePlan.version, EXPECTED.version, 'release specification version');
  assert.equal(snapshot.releasePlan.edition, EXPECTED.edition, 'release specification edition');
  assert.equal(snapshot.releasePlan.tag, `v${EXPECTED.version}`, 'release specification tag');
  assert.equal(snapshot.manifest.publicationMode, 'preview', 'development manifest publication mode');
  assert.deepEqual(snapshot.manifest.releaseSpec, {
    path: snapshot.stageConfig.metadata.releaseFile,
    sha256: createHash('sha256').update(snapshot.releasePlanBytes).digest('hex'),
    ...snapshot.releasePlan
  }, 'staged release specification provenance');
  assert.equal(snapshot.manifest.tag, null, 'development manifest tag');
  assert.equal(snapshot.manifest.promotion, null, 'development manifest promotion provenance');
  assert.equal(snapshot.manifest.toolchain.releaseRef, '1.0.0', 'release-ref verifier version');
  assert.equal(sourceState.inputCount, 17, 'all configured release inputs are covered');
  assert.equal(snapshot.manifest.fileCount, 14, 'development manifest payload count');
  const citationFile = snapshot.manifest.files.find((file) => file.path === 'CITATION.cff');
  assert(citationFile, 'staged CITATION payload');
  assert.equal(citationFile.mediaType, 'text/yaml; charset=utf-8', 'staged CITATION payload media type');
  assert.match(citationFile.sha256, /^[0-9a-f]{64}$/u, 'staged CITATION payload digest');
}

test('v0.1.1 development identity is synchronized across source, exports, UI, citation, and staged artifact', () => {
  assertIdentity(loadSnapshot());
});

test('identity contract fails closed on representative release-drift mutations', () => {
  const mutations = [
    ['stale lockfile', (copy) => { copy.packageLock.version = '0.1.0'; }],
    ['stale export', (copy) => { copy.normalized.dataset.edition = '2026-08-13-public-beta-1'; }],
    ['released citation', (copy) => { copy.citation += '\ndate-released: "2026-08-20"\n'; }],
    ['missing social identity', (copy) => { copy.indexHtml = copy.indexHtml.replace('AI Research Tech Tree - v0.1.1 Development Edition', 'AI Research Tech Tree'); }],
    ['misdirected badge', (copy) => { copy.canonicalHtml = copy.canonicalHtml.replace('id="editionBadge" href="./release-manifest.json"', 'id="editionBadge" href="./"'); }],
    ['premature tag', (copy) => { copy.manifest.tag = 'v0.1.1'; }],
    ['premature release mode', (copy) => { copy.manifest.publicationMode = 'release'; }],
    ['premature promotion provenance', (copy) => { copy.manifest.promotion = { mode: 'annotated-tag' }; }],
    ['stale release specification provenance', (copy) => { copy.manifest.releaseSpec.edition = '2026-08-13-public-beta-1'; }],
    ['stale manifest release state', (copy) => { copy.manifest.releaseState = 'Public beta'; }],
    ['unverified Git objects', (copy) => { copy.manifest.sourceState.objectDatabaseVerified = false; }],
    ['unisolated Git fsck configuration', (copy) => { copy.manifest.sourceState.repositoryFsckConfigurationIsolated = false; }],
    ['unisolated Git attributes', (copy) => { copy.manifest.sourceState.repositoryAttributesIsolated = false; }],
    ['unverified tracked-tree filters', (copy) => { copy.manifest.sourceState.trackedTreeFiltersVerified = false; }],
    ['tracked-tree filter present', (copy) => { copy.manifest.sourceState.trackedTreeFilterAttributeCount = 1; }],
    ['unmatched release inputs', (copy) => { copy.manifest.sourceState.inputsMatchCommit = false; }],
    ['missing citation payload', (copy) => { copy.manifest.files = copy.manifest.files.filter((file) => file.path !== 'CITATION.cff'); }]
  ];
  const original = loadSnapshot();
  for (const [label, mutate] of mutations) {
    const copy = structuredClone(original);
    mutate(copy);
    assert.throws(() => assertIdentity(copy), undefined, label);
  }
});
