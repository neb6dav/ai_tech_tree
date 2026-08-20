#!/usr/bin/env node

import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseDocument } from 'yaml';

import { validateReleaseSpec } from './release-spec.mjs';
import { parseStrictJson } from './strict-json.mjs';

const EXPECTED = Object.freeze({
  version: '0.1.1',
  tag: 'v0.1.1',
  packageName: 'ai-research-tech-tree',
  edition: '2026-08-20-public-beta-2',
  releaseState: 'Development edition',
  targetReleaseState: 'Public beta',
  asOf: '2026-08-04',
  sitemapLastmod: '2026-08-20',
  citationVersion: '0.1.1-dev',
  citationMessage: 'This is an untagged v0.1.1 development edition. For a stable citation, cite a tagged release. The exact development-build commit and checksums are in release-manifest.json.',
  citationAbstract: 'An untagged development edition of a public-beta, evidence-linked research atlas of artificial-intelligence developments, open research directions, landmark works, and explicitly typed relationships, presented through Timeline, Network, Opportunity, and List views with machine-readable knowledge-graph exports.',
  readyCitationMessage: 'This v0.1.1 public-beta release identity is ready for controlled tag verification. The exact source commit and checksums are in release-manifest.json; this citation metadata does not attest a tag, deployment, or publication.',
  readyCitationAbstract: 'A versioned public-beta release of an evidence-linked research atlas of artificial-intelligence developments, open research directions, landmark works, and explicitly typed relationships, presented through Timeline, Network, Opportunity, and List views with machine-readable knowledge-graph exports.',
  readyReadmeMarker: 'This source snapshot finalizes the `v0.1.1` public-beta release identity; it does not by itself prove that a tag, GitHub Release, approval, deployment, or public verification exists.',
  releaseSpecPath: 'config/releases/v0.1.1.json'
});

const DATE_REFERENCE = Object.freeze({
  state: 'unresolved',
  source: 'authorized intended v0.1.1 annotated-tag tagger calendar date',
  selector: 'tagger.calendarDate',
  derivation: 'chosen for the controlled finalization, then verified against the annotated tag header in its recorded timezone',
  format: 'YYYY-MM-DD'
});

const PAGE_MODIFICATION_DATE_REFERENCE = Object.freeze({
  state: 'unresolved',
  source: 'actual modification date of the canonical public page content',
  selector: 'pageModification.calendarDate',
  derivation: 'independently reviewed page-content modification date',
  format: 'YYYY-MM-DD',
  constraint: 'must not be copied from releaseDate unless the dates independently coincide'
});

const TRANSITIONS = Object.freeze([
  Object.freeze({
    order: 1,
    kind: 'source',
    path: EXPECTED.releaseSpecPath,
    responsibility: 'Make the reviewed release specification ready only after the intended annotated-tag date is authorized.',
    changes: Object.freeze([
      Object.freeze({ field: '/status', from: 'planned', to: 'ready' }),
      Object.freeze({ field: '/releaseDate', from: null, to: DATE_REFERENCE }),
      Object.freeze({ field: '/edition', from: EXPECTED.edition, to: EXPECTED.edition, operation: 'preserve' })
    ])
  }),
  Object.freeze({
    order: 2,
    kind: 'source',
    path: 'ai-research-tech-tree.html',
    responsibility: 'Synchronize canonical application metadata and visible publication language.',
    changes: Object.freeze([
      Object.freeze({ field: 'PROJECT_META.edition and ai-tree-edition', from: EXPECTED.edition, to: EXPECTED.edition, operation: 'preserve' }),
      Object.freeze({ field: 'PROJECT_META.releaseState and ai-tree-release-state', from: EXPECTED.releaseState, to: EXPECTED.targetReleaseState }),
      Object.freeze({ field: 'PROJECT_META.asOf', from: EXPECTED.asOf, to: EXPECTED.asOf, operation: 'preserve' }),
      Object.freeze({ field: 'title, social metadata, noscript identity, and edition badge', from: 'development-edition wording', to: 'v0.1.1 public-beta release wording with no deployment claim' })
    ])
  }),
  Object.freeze({
    order: 3,
    kind: 'source',
    path: 'CITATION.cff',
    responsibility: 'Prepare release citation metadata without claiming tag or deployment completion.',
    changes: Object.freeze([
      Object.freeze({ field: 'version', from: EXPECTED.citationVersion, to: EXPECTED.version }),
      Object.freeze({ field: 'date-released', from: 'absent', to: DATE_REFERENCE }),
      Object.freeze({ field: 'message and abstract', from: 'untagged development wording', to: 'v0.1.1 ready citation wording with no tag or deployment claim' })
    ])
  }),
  Object.freeze({
    order: 4,
    kind: 'source',
    path: 'CHANGELOG.md',
    responsibility: 'Freeze the candidate notes under the dated v0.1.1 release and reopen Unreleased.',
    changes: Object.freeze([
      Object.freeze({ field: 'v0.1.1 development target', from: 'under [Unreleased]', to: 'removed' }),
      Object.freeze({ field: 'release heading', from: 'absent', to: '## [0.1.1] - <tagger.calendarDate>' }),
      Object.freeze({ field: 'comparison links', from: 'v0.1.0...HEAD', to: 'v0.1.1...HEAD plus v0.1.0...v0.1.1' })
    ])
  }),
  Object.freeze({
    order: 5,
    kind: 'source',
    path: 'README.md',
    responsibility: 'Describe the v0.1.1 release identity without weakening caveats or claiming deployment.',
    changes: Object.freeze([
      Object.freeze({ field: 'release-channel statement', from: 'untagged v0.1.1 development edition; latest tag v0.1.0', to: 'v0.1.1 public-beta release identity; no deployment claim' })
    ])
  }),
  Object.freeze({
    order: 6,
    kind: 'source',
    path: 'sitemap.xml',
    responsibility: 'Record actual page modification independently from release identity dates.',
    changes: Object.freeze([
      Object.freeze({ field: '/urlset/url/lastmod', from: EXPECTED.sitemapLastmod, to: PAGE_MODIFICATION_DATE_REFERENCE })
    ])
  }),
  Object.freeze({
    order: 7,
    kind: 'source',
    path: '.github/ISSUE_TEMPLATE/correction.yml',
    responsibility: 'Replace the development-version contribution hint with the release version identifier.',
    changes: Object.freeze([
      Object.freeze({ field: 'edition description and placeholder', from: 'v0.1.1-dev', to: 'v0.1.1' })
    ])
  }),
  Object.freeze({
    order: 8,
    kind: 'source',
    path: '.github/ISSUE_TEMPLATE/relationship.yml',
    responsibility: 'Replace the development-version contribution hint with the release version identifier.',
    changes: Object.freeze([
      Object.freeze({ field: 'edition placeholder', from: 'v0.1.1-dev', to: 'v0.1.1' })
    ])
  }),
  Object.freeze({
    order: 9,
    kind: 'source',
    path: 'release-gate.js',
    responsibility: 'Make the release gate assert the finalized dataset identity while preserving the review cutoff.',
    changes: Object.freeze([
      Object.freeze({ field: 'dataset edition expectation', from: EXPECTED.edition, to: EXPECTED.edition, operation: 'preserve' }),
      Object.freeze({ field: 'dataset releaseState expectation', from: EXPECTED.releaseState, to: EXPECTED.targetReleaseState }),
      Object.freeze({ field: 'dataset asOf expectation', from: EXPECTED.asOf, to: EXPECTED.asOf, operation: 'preserve' })
    ])
  }),
  Object.freeze({
    order: 10,
    kind: 'source',
    path: 'ui-layout-gate.js',
    responsibility: 'Make UI identity assertions match the finalized canonical surface.',
    changes: Object.freeze([
      Object.freeze({ field: 'PROJECT_META and dataset edition expectations', from: EXPECTED.edition, to: EXPECTED.edition, operation: 'preserve' }),
      Object.freeze({ field: 'PROJECT_META and dataset releaseState expectations', from: EXPECTED.releaseState, to: EXPECTED.targetReleaseState })
    ])
  }),
  Object.freeze({
    order: 11,
    kind: 'source',
    path: 'tests/release-identity.test.cjs',
    responsibility: 'Keep the identity test valid across the exact planned-to-ready transition and premature-release protections.',
    changes: Object.freeze([
      Object.freeze({ field: 'identity fixture', from: 'planned development identity', to: 'ready release identity using the authorized intended tagger date, pending exact tag verification' })
    ])
  }),
  Object.freeze({
    order: 12,
    kind: 'source',
    path: 'scripts/release-finalization-plan.mjs',
    responsibility: 'Preserve the read-only verifier across both planned and ready identities.',
    changes: Object.freeze([
      Object.freeze({
        field: 'accepted identity states',
        from: Object.freeze(['planned', 'ready']),
        to: Object.freeze(['planned', 'ready']),
        operation: 'preserve-state-aware-verifier'
      })
    ])
  }),
  Object.freeze({
    order: 13,
    kind: 'source',
    path: 'tests/release-finalization-plan.test.mjs',
    responsibility: 'Preserve the real-root, complete-ready, no-write, canonical-path, and hostile-drift verification matrix.',
    changes: Object.freeze([
      Object.freeze({
        field: 'verification matrix',
        from: 'planned and ready state closure with hostile filesystem and identity cases',
        to: 'planned and ready state closure with hostile filesystem and identity cases',
        operation: 'preserve-verification-closure'
      })
    ])
  }),
  Object.freeze({
    order: 14,
    kind: 'generated',
    path: 'index.html',
    generatedBy: 'npm run build',
    commitPolicy: 'committed generated application artifact',
    changes: Object.freeze([
      Object.freeze({ field: 'application publication identity', from: 'development', to: 'public beta copied from ai-research-tech-tree.html' })
    ])
  }),
  Object.freeze({
    order: 15,
    kind: 'generated',
    path: 'ai-research-tech-tree.json',
    generatedBy: 'npm run build',
    commitPolicy: 'committed generated machine export',
    changes: Object.freeze([
      Object.freeze({ field: 'dataset.edition', from: EXPECTED.edition, to: EXPECTED.edition, operation: 'preserve' }),
      Object.freeze({ field: 'dataset.releaseState', from: EXPECTED.releaseState, to: EXPECTED.targetReleaseState }),
      Object.freeze({ field: 'dataset.asOf', from: EXPECTED.asOf, to: EXPECTED.asOf, operation: 'preserve' })
    ])
  }),
  Object.freeze({
    order: 16,
    kind: 'generated',
    path: 'ai-research-tech-tree.jsonld',
    generatedBy: 'npm run build',
    commitPolicy: 'committed generated machine export',
    changes: Object.freeze([
      Object.freeze({ field: 'schema:version', from: EXPECTED.edition, to: EXPECTED.edition, operation: 'preserve' }),
      Object.freeze({ field: 'tree:releaseState', from: EXPECTED.releaseState, to: EXPECTED.targetReleaseState }),
      Object.freeze({ field: 'schema:dateModified', from: EXPECTED.asOf, to: EXPECTED.asOf, operation: 'preserve' })
    ])
  }),
  Object.freeze({
    order: 17,
    kind: 'generated',
    path: 'ai-research-tech-tree.ndjson',
    generatedBy: 'npm run build',
    commitPolicy: 'committed generated machine export',
    changes: Object.freeze([
      Object.freeze({ field: 'dataset.edition', from: EXPECTED.edition, to: EXPECTED.edition, operation: 'preserve' }),
      Object.freeze({ field: 'dataset.releaseState', from: EXPECTED.releaseState, to: EXPECTED.targetReleaseState }),
      Object.freeze({ field: 'dataset.asOf', from: EXPECTED.asOf, to: EXPECTED.asOf, operation: 'preserve' })
    ])
  }),
  Object.freeze({
    order: 18,
    kind: 'generated-runtime',
    path: '_site/release-manifest.json',
    generatedBy: 'npm run stage:site',
    commitPolicy: 'generated verification output; do not commit',
    changes: Object.freeze([
      Object.freeze({ field: 'version, edition, releaseState, and releaseSpec', from: 'planned development identity', to: 'ready identity with exact source digests' }),
      Object.freeze({ field: 'publicationMode, tag, and promotion', from: 'preview, null, null', to: 'remain preview, null, null until separately authorized promotion', operation: 'preserve-safety-boundary' })
    ])
  })
]);

const EXPECTED_TRANSITION_PATHS = Object.freeze([
  EXPECTED.releaseSpecPath,
  'ai-research-tech-tree.html',
  'CITATION.cff',
  'CHANGELOG.md',
  'README.md',
  'sitemap.xml',
  '.github/ISSUE_TEMPLATE/correction.yml',
  '.github/ISSUE_TEMPLATE/relationship.yml',
  'release-gate.js',
  'ui-layout-gate.js',
  'tests/release-identity.test.cjs',
  'scripts/release-finalization-plan.mjs',
  'tests/release-finalization-plan.test.mjs',
  'index.html',
  'ai-research-tech-tree.json',
  'ai-research-tech-tree.jsonld',
  'ai-research-tech-tree.ndjson',
  '_site/release-manifest.json'
]);

const INSPECTED_INPUT_PATHS = Object.freeze([
  '.github/ISSUE_TEMPLATE/correction.yml',
  '.github/ISSUE_TEMPLATE/relationship.yml',
  'CHANGELOG.md',
  'CITATION.cff',
  'README.md',
  'ai-research-tech-tree.html',
  'ai-research-tech-tree.json',
  'ai-research-tech-tree.jsonld',
  'ai-research-tech-tree.ndjson',
  EXPECTED.releaseSpecPath,
  'index.html',
  'package-lock.json',
  'package.json',
  'release-gate.js',
  'scripts/release-assets.mjs',
  'scripts/release-finalization-plan.mjs',
  'sitemap.xml',
  'tests/release-finalization-plan.test.mjs',
  'tests/release-identity.test.cjs',
  'ui-layout-gate.js'
]);

function planError(message) {
  return new Error(`release-finalization-plan: ${message}`);
}

function assert(condition, message) {
  if (!condition) throw planError(message);
}

function assertExact(value, expected, label) {
  assert(value === expected, `${label} must be exactly ${JSON.stringify(expected)}; received ${JSON.stringify(value)}`);
}

function occurrenceCount(text, fragment) {
  return text.split(fragment).length - 1;
}

function comparablePath(value) {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function pathsEqual(left, right) {
  return comparablePath(left) === comparablePath(right);
}

async function resolveCanonicalRepositoryRoot(repositoryRoot) {
  const resolved = path.resolve(repositoryRoot);
  let metadata;
  let canonical;
  try {
    metadata = await lstat(resolved);
    canonical = await realpath(resolved);
  } catch (error) {
    throw planError(`cannot inspect repositoryRoot: ${error.message}`);
  }
  assert(!metadata.isSymbolicLink(), 'repositoryRoot must not be a symbolic link or junction');
  assert(metadata.isDirectory(), 'repositoryRoot must be a directory');
  assert(
    pathsEqual(resolved, canonical),
    `repositoryRoot must be canonical and contain no symbolic-link, junction, or path-alias segment; received ${JSON.stringify(resolved)}`
  );
  return canonical;
}

async function assertRegularInput(root, relative) {
  const absolute = path.join(root, ...relative.split('/'));
  let metadata;
  let canonical;
  try {
    metadata = await lstat(absolute);
    canonical = await realpath(absolute);
  } catch (error) {
    throw planError(`cannot inspect ${relative}: ${error.message}`);
  }
  assert(!metadata.isSymbolicLink(), `${relative} must not be a symbolic link or junction`);
  assert(metadata.isFile(), `${relative} must be a regular file`);
  assert(
    pathsEqual(absolute, canonical),
    `${relative} must have a canonical path with no symbolic-link, junction, or path-alias segment`
  );
}

async function readBytes(root, relative) {
  await assertRegularInput(root, relative);
  try {
    return await readFile(path.join(root, ...relative.split('/')));
  } catch (error) {
    throw planError(`cannot read ${relative}: ${error.message}`);
  }
}

async function readText(root, relative) {
  const bytes = await readBytes(root, relative);
  const text = bytes.toString('utf8');
  assert(Buffer.from(text, 'utf8').equals(bytes), `${relative} must be valid UTF-8`);
  return text;
}

async function readJson(root, relative) {
  return parseStrictJson(await readBytes(root, relative), relative);
}

function assertReleaseSpecIdentity(spec) {
  const expected = {
    schemaVersion: '1.0.0',
    status: spec.status,
    tag: EXPECTED.tag,
    version: EXPECTED.version,
    edition: EXPECTED.edition,
    releaseDate: spec.releaseDate,
    releaseState: EXPECTED.targetReleaseState,
    defaultBranch: 'main',
    protectedMainRef: 'refs/remotes/origin/main',
    productionEnvironment: 'github-pages',
    productionBaseUrl: 'https://neb6dav.github.io/ai_tech_tree/',
    prerelease: true,
    assetStem: 'ai-research-tech-tree-v0.1.1'
  };
  assert(
    JSON.stringify(spec) === JSON.stringify(expected),
    `release specification must match the reviewed v0.1.1 identity; received ${JSON.stringify(spec)}`
  );
  return spec.status;
}

function assertDatasetIdentity(dataset, label, releaseState) {
  assert(dataset && typeof dataset === 'object' && !Array.isArray(dataset), `${label} must be an object`);
  assertExact(dataset.edition, EXPECTED.edition, `${label}.edition`);
  assertExact(dataset.releaseState, releaseState, `${label}.releaseState`);
  assertExact(dataset.asOf, EXPECTED.asOf, `${label}.asOf`);
}

function assertCanonicalHtmlIdentity(html, label, status) {
  const common = [
    '<meta name="ai-tree-version" content="0.1.1">',
    '<meta name="ai-tree-edition" content="2026-08-20-public-beta-2">',
  ];
  const planned = [
    '<title>AI Research Tech Tree - v0.1.1 Development Edition</title>',
    '<meta name="description" content="The v0.1.1 development edition of a curated public-beta atlas of 324 AI research developments, 15 open directions, evidence-coded relationships and selected papers through 2026.">',
    '<meta name="ai-tree-release-state" content="Development edition">',
    '<meta property="og:title" content="AI Research Tech Tree - v0.1.1 Development Edition">',
    '<meta property="og:description" content="Explore the v0.1.1 development edition of a curated public-beta map of AI history, evidence-coded relationships, related research papers and open questions.">',
    '<meta name="twitter:title" content="AI Research Tech Tree - v0.1.1 Development Edition">',
    '<meta name="twitter:description" content="The v0.1.1 development edition of a curated public-beta AI research atlas with explicit evidence limits and research-direction cards.">',
    '<strong>Development edition &middot; v0.1.1</strong><span>Dataset edition 2026-08-20-public-beta-2; historical review cutoff 2026-08-04.</span>',
    'id="editionBadge" href="./release-manifest.json" aria-label="Development edition v0.1.1. View exact build commit and checksums" title="Dataset edition 2026-08-20-public-beta-2; open the exact build manifest"',
    '<span class="editionLong">Development edition &middot; v0.1.1</span><span class="editionShort" aria-hidden="true">Dev</span>',
    "version:'0.1.1',edition:'2026-08-20-public-beta-2',releaseState:'Development edition',asOf:'2026-08-04'"
  ];
  const ready = [
    '<title>AI Research Tech Tree - v0.1.1 Public Beta</title>',
    '<meta name="description" content="The v0.1.1 public-beta release of a curated atlas of 324 AI research developments, 15 open directions, evidence-coded relationships and selected papers through 2026.">',
    '<meta name="ai-tree-release-state" content="Public beta">',
    '<meta property="og:title" content="AI Research Tech Tree - v0.1.1 Public Beta">',
    '<meta property="og:description" content="Explore the v0.1.1 public-beta release of a curated map of AI history, evidence-coded relationships, related research papers and open questions.">',
    '<meta name="twitter:title" content="AI Research Tech Tree - v0.1.1 Public Beta">',
    '<meta name="twitter:description" content="The v0.1.1 public-beta release of a curated AI research atlas with explicit evidence limits and research-direction cards.">',
    '<strong>Public beta &middot; v0.1.1</strong><span>Dataset edition 2026-08-20-public-beta-2; historical review cutoff 2026-08-04.</span>',
    'id="editionBadge" href="./release-manifest.json" aria-label="Public beta v0.1.1. View exact build commit and checksums" title="Dataset edition 2026-08-20-public-beta-2; open the exact build manifest"',
    '<span class="editionLong">Public beta &middot; v0.1.1</span><span class="editionShort" aria-hidden="true">Beta</span>',
    "version:'0.1.1',edition:'2026-08-20-public-beta-2',releaseState:'Public beta',asOf:'2026-08-04'"
  ];
  const fragments = common.concat(status === 'planned' ? planned : ready);
  for (const fragment of fragments) {
    assert(occurrenceCount(html, fragment) >= 1, `${label} is missing exact ${status} identity fragment ${JSON.stringify(fragment)}`);
  }
  if (status === 'ready') {
    for (const forbidden of [
      '<title>AI Research Tech Tree - v0.1.1 Development Edition</title>',
      '<meta name="ai-tree-release-state" content="Development edition">',
      'Development edition &middot; v0.1.1',
      "releaseState:'Development edition'"
    ]) {
      assert(!html.includes(forbidden), `${label} ready identity retains ${JSON.stringify(forbidden)}`);
    }
  }
}

function assertIsoDate(value, label) {
  assert(/^\d{4}-\d{2}-\d{2}$/u.test(value), `${label} must use YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  assert(!Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value, `${label} must be a real calendar date`);
  return value;
}

function parseCitation(text) {
  const document = parseDocument(text, { merge: false, schema: 'core', uniqueKeys: true });
  assert(document.errors.length === 0, `CITATION must be strict valid YAML: ${document.errors[0]?.message || 'unknown error'}`);
  let value;
  try {
    value = document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    throw planError(`CITATION contains unsupported aliases: ${error.message}`);
  }
  assert(value && typeof value === 'object' && !Array.isArray(value), 'CITATION must contain one mapping');
  return value;
}

function assertTransitionInventory() {
  assertExact(TRANSITIONS.length, EXPECTED_TRANSITION_PATHS.length, 'transition count');
  const paths = TRANSITIONS.map(item => item.path);
  assert(JSON.stringify(paths) === JSON.stringify(EXPECTED_TRANSITION_PATHS), 'transition paths or ordering changed');
  assertExact(new Set(paths).size, paths.length, 'unique transition path count');
  TRANSITIONS.forEach((transition, index) => {
    assertExact(transition.order, index + 1, `${transition.path} order`);
    assert(['source', 'generated', 'generated-runtime'].includes(transition.kind), `${transition.path} has unsupported kind`);
    assert(Array.isArray(transition.changes) && transition.changes.length > 0, `${transition.path} must enumerate changes`);
    if (transition.kind !== 'source') {
      assert(typeof transition.generatedBy === 'string', `${transition.path} must name its generator`);
      assert(typeof transition.commitPolicy === 'string', `${transition.path} must name its commit policy`);
    }
  });
  const runtime = TRANSITIONS.at(-1);
  assertExact(runtime.path, '_site/release-manifest.json', 'runtime manifest path');
  assertExact(runtime.commitPolicy, 'generated verification output; do not commit', 'runtime manifest commit policy');
}

function assertOptions(options) {
  assert(options && typeof options === 'object' && !Array.isArray(options), 'options must be an object');
  const unknown = Object.keys(options).filter(key => key !== 'repositoryRoot').sort();
  assert(unknown.length === 0, `unsupported options: ${unknown.join(', ')}; releaseDate cannot be supplied hypothetically`);
  assert(typeof options.repositoryRoot === 'string' && options.repositoryRoot.length > 0, 'repositoryRoot must be a non-empty string');
}

export async function createReleaseFinalizationPlan(options = { repositoryRoot: process.cwd() }) {
  assertOptions(options);
  const root = await resolveCanonicalRepositoryRoot(options.repositoryRoot);
  assertTransitionInventory();
  await Promise.all(INSPECTED_INPUT_PATHS.map(relative => assertRegularInput(root, relative)));

  const [
    releaseSpecDocument,
    packageDocument,
    packageLockDocument,
    canonicalHtml,
    indexHtml,
    normalized,
    jsonLd,
    ndjson,
    citation,
    changelog,
    readme,
    sitemap,
    releaseGate,
    uiLayoutGate,
    releaseIdentityTest,
    correctionIssue,
    relationshipIssue,
    releaseAssetsSource,
    plannerSource,
    plannerTestSource
  ] = await Promise.all([
    readJson(root, EXPECTED.releaseSpecPath),
    readJson(root, 'package.json'),
    readJson(root, 'package-lock.json'),
    readText(root, 'ai-research-tech-tree.html'),
    readText(root, 'index.html'),
    readJson(root, 'ai-research-tech-tree.json'),
    readJson(root, 'ai-research-tech-tree.jsonld'),
    readText(root, 'ai-research-tech-tree.ndjson'),
    readText(root, 'CITATION.cff'),
    readText(root, 'CHANGELOG.md'),
    readText(root, 'README.md'),
    readText(root, 'sitemap.xml'),
    readText(root, 'release-gate.js'),
    readText(root, 'ui-layout-gate.js'),
    readText(root, 'tests/release-identity.test.cjs'),
    readText(root, '.github/ISSUE_TEMPLATE/correction.yml'),
    readText(root, '.github/ISSUE_TEMPLATE/relationship.yml'),
    readText(root, 'scripts/release-assets.mjs'),
    readText(root, 'scripts/release-finalization-plan.mjs'),
    readText(root, 'tests/release-finalization-plan.test.mjs')
  ]);

  const releaseSpec = validateReleaseSpec(releaseSpecDocument);
  const status = assertReleaseSpecIdentity(releaseSpec);
  const expectedReleaseState = status === 'planned' ? EXPECTED.releaseState : EXPECTED.targetReleaseState;
  const expectedCitationVersion = status === 'planned' ? EXPECTED.citationVersion : EXPECTED.version;
  const releaseDate = status === 'planned' ? null : assertIsoDate(releaseSpec.releaseDate, 'ready releaseDate');
  assertExact(packageDocument.name, EXPECTED.packageName, 'package name');
  assertExact(packageDocument.version, EXPECTED.version, 'package version');
  assertExact(packageLockDocument.name, EXPECTED.packageName, 'package-lock name');
  assertExact(packageLockDocument.version, EXPECTED.version, 'package-lock top-level version');
  assertExact(packageLockDocument.packages?.['']?.name, EXPECTED.packageName, 'package-lock root package name');
  assertExact(packageLockDocument.packages?.['']?.version, EXPECTED.version, 'package-lock root package version');
  assertExact(packageLockDocument.lockfileVersion, 3, 'package-lock lockfileVersion');
  assertExact(
    packageDocument.scripts?.['plan:release-finalization'],
    'node scripts/release-finalization-plan.mjs',
    'package finalization-plan command'
  );
  assertExact(
    packageDocument.scripts?.['test:release-finalization-plan'],
    'node --test tests/release-finalization-plan.test.mjs',
    'package finalization-plan test command'
  );
  assertExact(
    occurrenceCount(packageDocument.scripts?.['test:publication'] || '', 'npm run test:release-finalization-plan'),
    1,
    'test:publication finalization-plan closure count'
  );

  assertCanonicalHtmlIdentity(canonicalHtml, 'ai-research-tech-tree.html', status);
  assert(indexHtml === canonicalHtml, 'index.html must be the exact generated copy of ai-research-tech-tree.html');
  assertDatasetIdentity(normalized.dataset, 'ai-research-tech-tree.json dataset', expectedReleaseState);
  assertExact(jsonLd['schema:version'], EXPECTED.edition, 'ai-research-tech-tree.jsonld schema:version');
  assertExact(jsonLd['tree:releaseState'], expectedReleaseState, 'ai-research-tech-tree.jsonld tree:releaseState');
  assertExact(jsonLd['schema:dateModified'], EXPECTED.asOf, 'ai-research-tech-tree.jsonld schema:dateModified');
  const firstNdjsonLine = ndjson.split(/\r?\n/u).find(line => line.length > 0);
  assert(typeof firstNdjsonLine === 'string', 'ai-research-tech-tree.ndjson must contain a dataset record');
  const ndjsonDatasetRecord = parseStrictJson(Buffer.from(firstNdjsonLine, 'utf8'), 'ai-research-tech-tree.ndjson line 1');
  assertExact(ndjsonDatasetRecord.recordType, 'dataset', 'ai-research-tech-tree.ndjson first record type');
  assertDatasetIdentity(ndjsonDatasetRecord.dataset, 'ai-research-tech-tree.ndjson dataset', expectedReleaseState);

  const citationDocument = parseCitation(citation);
  assertExact(citationDocument.version, expectedCitationVersion, 'CITATION version');
  if (status === 'planned') {
    assertExact(citationDocument.message, EXPECTED.citationMessage, 'CITATION message');
    assertExact(citationDocument.abstract, EXPECTED.citationAbstract, 'CITATION abstract');
    assert(!Object.hasOwn(citationDocument, 'date-released'), 'CITATION must not contain date-released while v0.1.1 is planned');
  } else {
    assertExact(citationDocument.message, EXPECTED.readyCitationMessage, 'ready CITATION message');
    assertExact(citationDocument.abstract, EXPECTED.readyCitationAbstract, 'ready CITATION abstract');
    assertExact(citationDocument['date-released'], releaseDate, 'ready CITATION date-released');
    assert(!/deploy(?:ed|ment is complete|ment succeeded)/iu.test(citationDocument.message), 'ready CITATION must not claim deployment');
  }

  assert(occurrenceCount(changelog, '## [Unreleased]') === 1, 'CHANGELOG must contain exactly one Unreleased heading');
  if (status === 'planned') {
    assert(occurrenceCount(changelog, 'Target: v0.1.1 development edition') === 1, 'CHANGELOG must contain exactly one v0.1.1 development target');
    assert(!/^## \[0\.1\.1\]/mu.test(changelog), 'CHANGELOG must not contain a v0.1.1 release heading while planned');
    assert(changelog.includes('[Unreleased]: https://github.com/neb6dav/ai_tech_tree/compare/v0.1.0...HEAD'), 'CHANGELOG Unreleased comparison must still begin at v0.1.0');
    assert(!/^\[0\.1\.1\]:/mu.test(changelog), 'CHANGELOG must not publish a dead v0.1.1 comparison link while planned');
    assert(readme.includes('untagged `v0.1.1` development edition'), 'README must describe v0.1.1 as untagged development');
    assert(readme.includes('latest tagged release remains `v0.1.0`'), 'README must identify v0.1.0 as the latest tag');
  } else {
    assert(occurrenceCount(changelog, 'Target: v0.1.1 development edition') === 0, 'ready CHANGELOG must remove the development target');
    assertExact(
      occurrenceCount(changelog, `## [0.1.1] - ${releaseDate}`),
      1,
      'ready CHANGELOG release heading count'
    );
    assert(changelog.includes('[Unreleased]: https://github.com/neb6dav/ai_tech_tree/compare/v0.1.1...HEAD'), 'ready CHANGELOG Unreleased comparison must begin at v0.1.1');
    assert(changelog.includes('[0.1.1]: https://github.com/neb6dav/ai_tech_tree/compare/v0.1.0...v0.1.1'), 'ready CHANGELOG must contain the v0.1.1 comparison link');
    assert(readme.includes(EXPECTED.readyReadmeMarker), 'ready README must state the finalized identity without claiming tag or deployment completion');
    assert(!readme.includes('latest tagged release remains `v0.1.0`'), 'ready README must remove the stale latest-tag statement');
  }

  const sitemapDates = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/gu)].map(match => match[1]);
  assertExact(sitemapDates.length, 1, 'sitemap lastmod count');
  const sitemapLastmod = status === 'planned'
    ? (assertExact(sitemapDates[0], EXPECTED.sitemapLastmod, 'sitemap lastmod'), sitemapDates[0])
    : assertIsoDate(sitemapDates[0], 'ready sitemap lastmod');

  for (const [label, text, fragments] of [
    ['release-gate.js', releaseGate, [
      `assert.equal(data.dataset.edition, '${EXPECTED.edition}')`,
      `assert.equal(data.dataset.releaseState, '${expectedReleaseState}')`,
      `assert.equal(data.dataset.asOf, '${EXPECTED.asOf}')`
    ]],
    ['ui-layout-gate.js', uiLayoutGate, [
      `version:'${EXPECTED.version}',edition:'${EXPECTED.edition}',releaseState:'${expectedReleaseState}'`,
      `assert.equal(data.dataset.edition, '${EXPECTED.edition}')`,
      `assert.equal(data.dataset.releaseState, '${expectedReleaseState}')`
    ]],
    ['tests/release-identity.test.cjs', releaseIdentityTest, [
      `citationVersion: '${expectedCitationVersion}'`,
      `edition: '${EXPECTED.edition}'`,
      `releaseState: '${expectedReleaseState}'`,
      `asOf: '${EXPECTED.asOf}'`
    ]]
  ]) {
    for (const fragment of fragments) assert(text.includes(fragment), `${label} is missing exact planned assertion ${fragment}`);
  }

  if (status === 'planned') {
    assert(occurrenceCount(correctionIssue, 'v0.1.1-dev') === 2, 'correction issue form must contain two v0.1.1-dev hints');
    assert(occurrenceCount(relationshipIssue, 'v0.1.1-dev') === 1, 'relationship issue form must contain one v0.1.1-dev hint');
  } else {
    assertExact(occurrenceCount(correctionIssue, 'v0.1.1-dev'), 0, 'ready correction issue development hint count');
    assertExact(occurrenceCount(relationshipIssue, 'v0.1.1-dev'), 0, 'ready relationship issue development hint count');
    assert(occurrenceCount(correctionIssue, 'v0.1.1') >= 2, 'ready correction issue form must identify v0.1.1');
    assert(occurrenceCount(relationshipIssue, 'v0.1.1') >= 1, 'ready relationship issue form must identify v0.1.1');
    assert(releaseIdentityTest.includes(`releaseDate: '${releaseDate}'`), 'ready release-identity test must assert releaseDate independently');
    assert(releaseIdentityTest.includes(`sitemapLastmod: '${sitemapLastmod}'`), 'ready release-identity test must assert sitemap lastmod independently');
  }

  for (const fragment of [
    "if (manifest.publicationMode !== 'preview')",
    'if (manifest.tag !== null || manifest.promotion !== null)'
  ]) {
    assert(releaseAssetsSource.includes(fragment), `release-assets preview boundary is missing ${fragment}`);
  }
  const stateDispatchFragment = ['const status = assertRelease', 'SpecIdentity(releaseSpec);'].join('');
  const readyClosureFragment = ["test('complete ready identity fixture", ' verifies final surfaces'].join('');
  assert(plannerSource.includes(stateDispatchFragment), 'planner implementation must retain planned/ready state dispatch');
  assert(plannerTestSource.includes(readyClosureFragment), 'planner test must retain complete ready-state closure');

  const releaseDateResolution = status === 'planned' ? DATE_REFERENCE : Object.freeze({
    state: 'authorized-intended-date-recorded',
    value: releaseDate,
    source: `${EXPECTED.releaseSpecPath} /releaseDate`,
    requiredTagVerification: 'refs/tags/v0.1.1 tagger.calendarDate must equal this value before release-mode assets or promotion'
  });
  const sitemapLastmodResolution = status === 'planned' ? PAGE_MODIFICATION_DATE_REFERENCE : Object.freeze({
    state: 'recorded',
    value: sitemapLastmod,
    source: PAGE_MODIFICATION_DATE_REFERENCE.source,
    constraint: PAGE_MODIFICATION_DATE_REFERENCE.constraint
  });

  return {
    schemaVersion: '1.0.0',
    kind: 'release-finalization-preflight',
    mode: 'read-only',
    writesPerformed: false,
    result: `${status}-identity-verified`,
    release: {
      version: EXPECTED.version,
      tag: EXPECTED.tag,
      currentStatus: status,
      targetStatus: 'ready',
      currentEdition: EXPECTED.edition,
      releaseDate,
      releaseDateResolution,
      targetEdition: EXPECTED.edition,
      sitemapLastmodResolution,
      dateSafetyBoundary: 'Release date comes only from the authorized intended annotated-tag tagger calendar date. Edition and dataset asOf remain unchanged; sitemap lastmod comes only from an independent page-modification review.'
    },
    verifiedIdentity: {
      packageVersion: EXPECTED.version,
      packageLockVersion: EXPECTED.version,
      releaseSpec: {
        path: EXPECTED.releaseSpecPath,
        status,
        releaseDate
      },
      dataset: {
        edition: EXPECTED.edition,
        releaseState: expectedReleaseState,
        asOf: EXPECTED.asOf
      },
      citationVersion: expectedCitationVersion,
      changelogState: status === 'planned'
        ? 'v0.1.1 development target under Unreleased'
        : `v0.1.1 frozen under the ${releaseDate} release heading`,
      sitemapLastmod,
      generatedExportsMatchCanonicalIdentity: true,
      candidatePreviewBoundary: {
        publicationMode: 'preview',
        tag: null,
        promotion: null,
        enforcedBy: 'scripts/release-assets.mjs'
      }
    },
    transitionInventory: TRANSITIONS,
    verificationClosure: {
      locked: true,
      acceptedIdentityStates: Object.freeze(['planned', 'ready']),
      implementation: 'scripts/release-finalization-plan.mjs',
      test: 'tests/release-finalization-plan.test.mjs',
      focusedCommand: 'npm run test:release-finalization-plan',
      fullCommand: 'npm test',
      requirement: 'Both the current real-root identity and complete planned and ready fixtures must pass before a transition is accepted.'
    },
    executionBoundary: {
      blockedUntil: status === 'planned'
        ? 'an authorized intended tagger calendar date is chosen for the controlled finalization'
        : 'the subsequently created refs/tags/v0.1.1 annotated-tag object verifies the recorded releaseDate',
      verificationRequiredBeforeReleaseModeAssetsOrPromotion: 'the subsequently created refs/tags/v0.1.1 annotated-tag object must pass the release-ref verifier and carry that exact tagger calendar date',
      operationScope: 'read-only repository identity inspection and transition planning',
      authorityBoundary: 'This output grants no authority to mutate source or external state.',
      prohibitedOperations: Object.freeze(['file mutation', 'commit', 'tag', 'GitHub Release', 'deployment', 'GitHub settings change'])
    }
  };
}

export function serializeReleaseFinalizationPlan(plan) {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

function parseArguments(argv) {
  if (argv.length === 0) return { repositoryRoot: process.cwd() };
  if (argv.length === 2 && argv[0] === '--repository-root' && argv[1].length > 0) {
    return { repositoryRoot: argv[1] };
  }
  throw planError('usage: node scripts/release-finalization-plan.mjs [--repository-root <path>]; releaseDate is intentionally not accepted');
}

async function main() {
  const plan = await createReleaseFinalizationPlan(parseArguments(process.argv.slice(2)));
  process.stdout.write(serializeReleaseFinalizationPlan(plan));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
