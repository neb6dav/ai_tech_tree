'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const EXPECTED_RELEASE_TAG = process.env.AI_TREE_EXPECT_RELEASE_TAG || null;
assert(
  EXPECTED_RELEASE_TAG === null || EXPECTED_RELEASE_TAG === 'v1.2.0',
  'Stable candidates may only be staged without a tag or with the exact v1.2.0 release tag'
);
const EXPECTED = Object.freeze({
  version: '1.2.0',
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

function topLevelBlock(text, key) {
  const lines = text.split(/\r?\n/u);
  const start = lines.findIndex((line) => line === `${key}:`);
  assert(start >= 0, `workflow is missing top-level ${key}`);
  const end = lines.findIndex((line, index) => index > start && /^\S/u.test(line));
  return lines.slice(start, end < 0 ? lines.length : end).join('\n');
}

function childKeys(block, indent = 2) {
  const prefix = ' '.repeat(indent);
  const childPattern = new RegExp(`^${prefix}([A-Za-z0-9_-]+):`);
  return block.split(/\r?\n/u).flatMap((line) => {
    const match = line.match(childPattern);
    return match ? [match[1]] : [];
  });
}

function childBlock(parentBlock, key, indent = 2) {
  const lines = parentBlock.split(/\r?\n/u);
  const childPattern = new RegExp(`^${' '.repeat(indent)}${key}:$`);
  const start = lines.findIndex((line) => childPattern.test(line));
  assert(start >= 0, `workflow is missing ${key} block`);
  const endPattern = new RegExp(`^${' '.repeat(indent)}\\S`);
  const end = lines.findIndex((line, index) => index > start && endPattern.test(line));
  return lines.slice(start, end < 0 ? lines.length : end).join('\n');
}

function assertCleanSourceCheck(block, label) {
  assert(block.includes('git diff --exit-code'), `${label} must check tracked-source cleanliness`);
  assert(block.includes('git status --porcelain --untracked-files=all'), `${label} must check untracked-source cleanliness`);
}

function assertValidateWorkflow(workflow) {
  assert.equal(workflow.match(/^name: .*$/mu)?.[0], 'name: Validate pull requests and release candidates', 'validate workflow name');
  const triggers = topLevelBlock(workflow, 'on');
  assert.match(triggers, /^  pull_request:\s*$/mu, 'validate pull_request trigger');
  assert.match(triggers, /^  workflow_dispatch:\s*$/mu, 'validate workflow_dispatch trigger');
  assert.doesNotMatch(triggers, /^  push:/mu, 'validate workflow must not have a push trigger');
  assert.doesNotMatch(workflow, /^  push:/mu, 'validate workflow must not declare an automatic main trigger');

  const jobs = topLevelBlock(workflow, 'jobs');
  assert.deepEqual(childKeys(jobs), ['pr-integrity', 'release-candidate'], 'validate top-level jobs');
  const pr = childBlock(jobs, 'pr-integrity');
  assert.match(pr, /^    name: Fast data, generation, and HTML integrity$/mu, 'PR job display name');
  assert.match(pr, /if:\s*\$\{\{\s*github\.event_name\s*==\s*'pull_request'\s*\}\}/u, 'PR event condition');
  assert(pr.includes('npm run build'), 'PR job build');
  assert(pr.includes('npm run test:fast'), 'PR job fast tier');
  assertCleanSourceCheck(pr, 'PR job');
  assert.doesNotMatch(pr, /npx playwright install[^\n]*chromium/iu, 'PR job must not install Chromium');
  assert.doesNotMatch(pr, /npm test(?:\s|$)/u, 'PR job must not run full npm test');
  assert.doesNotMatch(pr, /test:browser|test:lighthouse|upload-artifact|preview/iu, 'PR job must not run browser/Lighthouse or upload preview');

  const manual = childBlock(jobs, 'release-candidate');
  assert.match(manual, /^    name: Full browser and Lighthouse validation$/mu, 'manual job display name');
  assert.match(manual, /if:\s*\$\{\{\s*github\.event_name\s*==\s*'workflow_dispatch'\s*\}\}/u, 'manual event condition');
  assert.match(manual, /npx playwright install[^\n]*chromium/iu, 'manual Chromium install');
  assert(manual.includes('npm run build'), 'manual job build');
  assert.match(manual, /run:\s*npm test\s*$/mu, 'manual full test suite');
  assertCleanSourceCheck(manual, 'manual job');
  assert.match(manual, /uses:\s*actions\/upload-artifact@v4/u, 'manual preview upload');
  assert.match(manual, /name:\s*release-candidate-preview-/u, 'manual preview artifact name');
}

function assertPagesWorkflow(workflow) {
  const triggers = topLevelBlock(workflow, 'on');
  assert.match(triggers, /^  workflow_dispatch:\s*$/mu, 'Pages workflow_dispatch trigger');
  assert.doesNotMatch(triggers, /^  (?:push|pull_request):/mu, 'Pages workflow must remain manual-only');
  const jobs = topLevelBlock(workflow, 'jobs');
  assert.deepEqual(childKeys(jobs), ['deploy'], 'Pages must have exactly one top-level job');
  const deploy = childBlock(jobs, 'deploy');
  for (const permission of ['contents: read', 'actions: read', 'pages: write', 'id-token: write']) {
    assert(deploy.includes(`      ${permission}`), `Pages deploy job permission ${permission}`);
  }
  assert.doesNotMatch(deploy, /^\s+needs:/mu, 'Pages deploy must not use needs');
  assert.doesNotMatch(deploy, /npx playwright install[^\n]*chromium|npm test(?:\s|$)|test:browser|test:lighthouse/iu, 'Pages must not run browser/full-suite gates');
  assert.equal(occurrenceCount(deploy, 'npm run build'), 1, 'Pages build exactly once');
  assert.equal(occurrenceCount(deploy, 'npm run stage:site'), 1, 'Pages stage exactly once');
  assert.equal(occurrenceCount(deploy, 'npm run test:release-identity'), 1, 'Pages release identity exactly once');
  const build = deploy.indexOf('npm run build');
  const clean = deploy.indexOf('git diff --exit-code', build);
  const stage = deploy.indexOf('npm run stage:site', clean);
  const identity = deploy.indexOf('npm run test:release-identity', stage);
  assert(build >= 0 && clean > build && stage > clean && identity > stage, 'Pages build/clean/stage/identity order');
  assert.match(deploy, /uses:\s*actions\/configure-pages@v5/u, 'Pages configure step');
  assert.match(deploy, /uses:\s*actions\/upload-pages-artifact@v5/u, 'Pages upload step');
  assert.match(deploy, /include-hidden-files:\s*true/u, 'Pages preserves hidden files');
  assert.match(deploy, /uses:\s*actions\/deploy-pages@v5/u, 'Pages deploy step');
  assert.match(deploy, /environment:\s*\n\s+name:\s+github-pages\s*\n\s+url:/u, 'Pages environment and URL');
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
    presentationData: readJson('src/ui/atlas-presentation.v1.json'),
    catalog: readJson('src/data/atlas/catalog.json'),
    stageConfig: readJson('config/pages-stage.v1.json'),
    manifest: readJson('_site/release-manifest.json'),
    validateWorkflow: read('.github/workflows/validate.yml'),
    pagesWorkflow: read('.github/workflows/pages.yml')
  };
}

function assertHtmlIdentity(html, label) {
  assert(html.includes('<title>AI Research Tech Tree - v1.2.0 Stable</title>'), `${label} title`);
  for (const fragment of [
    '<meta name="description" content="The v1.2.0 stable edition',
    '<meta property="og:title" content="AI Research Tech Tree - v1.2.0 Stable">',
    '<meta property="og:description" content="Explore the v1.2.0 stable edition',
    '<meta name="twitter:title" content="AI Research Tech Tree - v1.2.0 Stable">',
    '<meta name="twitter:description" content="The v1.2.0 stable edition',
    '<meta name="ai-tree-version" content="1.2.0">',
    '<meta name="ai-tree-edition" content="2026-08-21-stable-1">',
    '<meta name="ai-tree-release-state" content="Stable">'
  ]) assert(html.includes(fragment), `${label} missing ${fragment}`);

  const head = html.slice(0, html.indexOf('</head>'));
  assert(!/development edition|public[ -]beta/iu.test(head), `${label} current head contains development/public-beta wording`);

  assert.equal(occurrenceCount(html, 'id="editionBadge"'), 1, `${label} edition badge count`);
  assert(html.includes('id="editionBadge" href="./release-manifest.json"'), `${label} manifest badge target`);
  assert(html.includes('Stable &middot; v1.2.0'), `${label} visible Stable label`);
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
  assertValidateWorkflow(snapshot.validateWorkflow);

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

  assert.match(snapshot.citation, new RegExp(`^version:\\s*${EXPECTED.citationVersion.replaceAll('.', '\\.') }\\s*$`, 'mu'), 'CITATION stable source version');
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

  assert.match(snapshot.networkSource, /export const VERSION = '1\.2\.0'/u, 'Network source version');
  assert.match(snapshot.opportunitySource, /export const VERSION = '1\.2\.0'/u, 'Opportunity renderer source version');
  assert.equal(snapshot.opportunityData.metadata.asOf, EXPECTED.opportunityAsOf, 'Opportunity review date remains distinct');
  assert.equal(snapshot.opportunityData.metadata.status, EXPECTED.opportunityStatus, 'Opportunity data status remains alpha');
  assert.equal(snapshot.opportunityData.metadata.importStatus.state, EXPECTED.opportunityImportStatus, 'Opportunity import remains unreviewed');
  assert.match(snapshot.opportunityData.metadata.importStatus.notes, /manual bibliography[\s\S]*review before publication-level promotion/iu, 'Opportunity disclosure');

  assert.equal(snapshot.presentationData.reviewStatus, 'owner_approved', 'presentation inventory owner approval');
  assert.equal(snapshot.presentationData.anchors.length, 24, 'approved anchor inventory count');
  assert.equal(snapshot.presentationData.backboneRelationshipIds.length, 72, 'approved orientation-spine count');
  assert.equal(snapshot.presentationData.tours.length, 6, 'approved tour count');
  for (const relationshipId of ['word2vec>bert:sup', 'gan>diffusion:sup']) {
    assert(snapshot.presentationData.backboneRelationshipIds.includes(relationshipId), `approved spine retains ${relationshipId}`);
    const relationship = snapshot.normalized.relationships.find((candidate) => candidate.id === relationshipId);
    assert(relationship, `canonical caveated relationship ${relationshipId}`);
    assert.equal(relationship.relationshipType, 'legacy_supersession_claim', `${relationshipId} relationship type`);
    assert.equal(relationship.legacyKind, 'sup', `${relationshipId} legacy kind`);
    assert.equal(relationship.evidenceGrade, 'contextual', `${relationshipId} evidence grade`);
    assert.equal(relationship.reviewed, false, `${relationshipId} review state`);
    assert.match(relationship.rationale, /not treated as established supersession/iu, `${relationshipId} rationale`);
  }

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
  assert.equal(snapshot.manifest.fileCount, 354, 'staged manifest payload count (339 node pages plus prior artifacts)');
  const citationFile = snapshot.manifest.files.find((file) => file.path === 'CITATION.cff');
  assert(citationFile, 'staged CITATION payload');
  assert.equal(citationFile.mediaType, 'text/yaml; charset=utf-8', 'staged CITATION payload media type');
  assert.match(citationFile.sha256, /^[0-9a-f]{64}$/u, 'staged CITATION payload digest');

  assert(snapshot.pagesWorkflow.includes('AI_TREE_AUTHORIZED_TAG: "v1.2.0"'), 'Pages workflow exact authorized v1.2.0 tag');
  assert(snapshot.pagesWorkflow.includes('ref: refs/tags/v1.2.0'), 'Pages workflow exact v1.2.0 checkout');
  assert(!/^\s+inputs:/mu.test(snapshot.pagesWorkflow), 'Pages workflow must not accept arbitrary tag inputs');
  assert(!/^\s+(?:push|pull_request):/mu.test(snapshot.pagesWorkflow), 'Pages workflow must remain manual-only');
  assertPagesWorkflow(snapshot.pagesWorkflow);

  for (const fragment of [
    'workflow_dispatch:',
    'ref: refs/tags/v1.2.0',
    'test "$GITHUB_REF" = "refs/heads/main"',
    'test "$GITHUB_WORKFLOW_SHA" = "$GITHUB_SHA"',
    'pages.yml@refs/heads/main',
    'test "$(git cat-file -t "$tag_ref")" = "tag"',
    'test "$tag_commit" = "$(git rev-parse HEAD)"',
    'test "$GITHUB_SHA" = "$main_commit"',
    'test "$tag_commit" = "$GITHUB_SHA"',
    'AI_TREE_EXPECT_RELEASE_TAG=$AI_TREE_AUTHORIZED_TAG'
  ]) assert(snapshot.pagesWorkflow.includes(fragment), `Pages release guard missing ${fragment}`);
}

test('v1.2.0 Stable candidate identity is synchronized without requiring a release tag', () => {
  assertIdentity(loadSnapshot());
});

test('identity contract fails closed on representative release-drift mutations', () => {
  const mutations = [
    ['stale lockfile', (copy) => { copy.packageLock.version = '0.1.0'; }],
    ['stale export', (copy) => { copy.normalized.dataset.edition = '2026-08-20-public-beta-2'; }],
    ['stale citation date', (copy) => { copy.citation = copy.citation.replace('date-released: "2026-08-21"', 'date-released: "2026-08-20"'); }],
    ['missing social identity', (copy) => { copy.indexHtml = copy.indexHtml.replace('AI Research Tech Tree - v1.2.0 Stable', 'AI Research Tech Tree'); }],
    ['misdirected badge', (copy) => { copy.canonicalHtml = copy.canonicalHtml.replace('id="editionBadge" href="./release-manifest.json"', 'id="editionBadge" href="./"'); }],
    ['unexpected tag', (copy) => { copy.manifest.tag = 'v1.0.0'; }],
    ['stale manifest release state', (copy) => { copy.manifest.releaseState = 'Development edition'; }],
    ['renamed public distribution', (copy) => { copy.normalized.dataset.distributions[0].filename = 'graph.jsonld'; }],
    ['redirected contribution guide', (copy) => { copy.catalog.project.contributionGuideUrl = 'https://example.test/contribute'; }],
    ['promoted Opportunity data', (copy) => { copy.opportunityData.metadata.importStatus.state = 'validated'; }],
    ['unapproved presentation inventory', (copy) => { copy.presentationData.reviewStatus = 'candidate_pending_owner_review'; }],
    ['removed caveated spine link', (copy) => { copy.presentationData.backboneRelationshipIds = copy.presentationData.backboneRelationshipIds.filter((id) => id !== 'gan>diffusion:sup'); }],
    ['stale Network source version', (copy) => { copy.networkSource = copy.networkSource.replace("VERSION = '1.2.0'", "VERSION = '0.1.1'"); }],
    ['missing citation payload', (copy) => { copy.manifest.files = copy.manifest.files.filter((file) => file.path !== 'CITATION.cff'); }],
    ['wrong authorized release tag', (copy) => { copy.pagesWorkflow = copy.pagesWorkflow.replace('AI_TREE_AUTHORIZED_TAG: "v1.2.0"', 'AI_TREE_AUTHORIZED_TAG: "v1.1.0"'); }],
    ['mismatched release checkout', (copy) => { copy.pagesWorkflow = copy.pagesWorkflow.replace('ref: refs/tags/v1.2.0', 'ref: refs/tags/v1.1.0'); }],
    ['tag not pinned to checked-out HEAD', (copy) => { copy.pagesWorkflow = copy.pagesWorkflow.replace('test "$tag_commit" = "$(git rev-parse HEAD)"', 'git merge-base --is-ancestor "$tag_commit" HEAD'); }],
    ['arbitrary release tag input', (copy) => { copy.pagesWorkflow = copy.pagesWorkflow.replace('  workflow_dispatch:', '  workflow_dispatch:\n    inputs:\n      tag:\n        required: true'); }],
    ['automatic release trigger', (copy) => { copy.pagesWorkflow += '\n  push:\n'; }],
    ['lightweight-tag release workflow', (copy) => { copy.pagesWorkflow = copy.pagesWorkflow.replace('git cat-file -t', 'git rev-parse'); }],
    ['unbounded recovery workflow', (copy) => { copy.pagesWorkflow = copy.pagesWorkflow.replace('test "$tag_commit" = "$GITHUB_SHA"', 'git merge-base --is-ancestor "$tag_commit" "$GITHUB_SHA"'); }],
    ['automatic main trigger', (copy) => { copy.validateWorkflow += '\n  push:\n    branches: [main]\n'; }],
    ['slow PR regression', (copy) => { copy.validateWorkflow = copy.validateWorkflow.replace('npm run test:fast', 'npm test'); }],
    ['missing manual browser gate', (copy) => { copy.validateWorkflow = copy.validateWorkflow.replace('npx playwright install --with-deps chromium', 'echo skip-browser-runtime'); }],
    ['Pages full-test regression', (copy) => { copy.pagesWorkflow = copy.pagesWorkflow.replace('npm run test:release-identity', 'npm test'); }],
    ['split Pages job regression', (copy) => { copy.pagesWorkflow += '\n  preview:\n    runs-on: ubuntu-24.04\n'; }],
    ['Pages hidden-file regression', (copy) => { copy.pagesWorkflow = copy.pagesWorkflow.replace('include-hidden-files: true', 'include-hidden-files: false'); }]
  ];
  const original = loadSnapshot();
  for (const [label, mutate] of mutations) {
    const copy = structuredClone(original);
    mutate(copy);
    assert.throws(() => assertIdentity(copy), undefined, label);
  }
});
