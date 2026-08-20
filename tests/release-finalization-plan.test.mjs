import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  createReleaseFinalizationPlan,
  serializeReleaseFinalizationPlan
} from '../scripts/release-finalization-plan.mjs';

const execFileAsync = promisify(execFile);
const ROOT = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const SCRIPT = path.join(ROOT, 'scripts', 'release-finalization-plan.mjs');
const FIXTURE_FILES = Object.freeze([
  '.github/ISSUE_TEMPLATE/correction.yml',
  '.github/ISSUE_TEMPLATE/relationship.yml',
  'CHANGELOG.md',
  'CITATION.cff',
  'README.md',
  'ai-research-tech-tree.html',
  'ai-research-tech-tree.json',
  'ai-research-tech-tree.jsonld',
  'ai-research-tech-tree.ndjson',
  'config/releases/v0.1.1.json',
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
const EXPECTED_INVENTORY = Object.freeze([
  ['source', 'config/releases/v0.1.1.json'],
  ['source', 'ai-research-tech-tree.html'],
  ['source', 'CITATION.cff'],
  ['source', 'CHANGELOG.md'],
  ['source', 'README.md'],
  ['source', 'sitemap.xml'],
  ['source', '.github/ISSUE_TEMPLATE/correction.yml'],
  ['source', '.github/ISSUE_TEMPLATE/relationship.yml'],
  ['source', 'release-gate.js'],
  ['source', 'ui-layout-gate.js'],
  ['source', 'tests/release-identity.test.cjs'],
  ['source', 'scripts/release-finalization-plan.mjs'],
  ['source', 'tests/release-finalization-plan.test.mjs'],
  ['generated', 'index.html'],
  ['generated', 'ai-research-tech-tree.json'],
  ['generated', 'ai-research-tech-tree.jsonld'],
  ['generated', 'ai-research-tech-tree.ndjson'],
  ['generated-runtime', '_site/release-manifest.json']
]);
const INVENTORY_SHA256 = '7894d769b8672db5881a21dbe2dbf415a4f8c7f2b92f76b0813095cd7bb51319';

async function copyFixture(t) {
  const canonicalTemporaryParent = await realpath(os.tmpdir());
  const root = await realpath(await mkdtemp(path.join(canonicalTemporaryParent, 'ai-tree-finalization-plan-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const relative of FIXTURE_FILES) {
    const destination = path.join(root, ...relative.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(ROOT, ...relative.split('/')), destination);
  }
  return root;
}

async function snapshotTree(root) {
  const entries = [];
  async function visit(relative) {
    const directory = path.join(root, ...relative.split('/').filter(Boolean));
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const child of children) {
      const childRelative = relative ? `${relative}/${child.name}` : child.name;
      if (child.isDirectory()) {
        entries.push(`directory:${childRelative}`);
        await visit(childRelative);
      } else if (child.isFile()) {
        const bytes = await readFile(path.join(root, ...childRelative.split('/')));
        entries.push(`file:${childRelative}:${bytes.length}:${createHash('sha256').update(bytes).digest('hex')}`);
      } else {
        entries.push(`other:${childRelative}`);
      }
    }
  }
  await visit('');
  return entries;
}

async function replaceInFiles(root, relatives, from, to) {
  for (const relative of relatives) {
    const absolute = path.join(root, ...relative.split('/'));
    const original = await readFile(absolute, 'utf8');
    assert(original.includes(from), `${relative} must contain mutation source ${from}`);
    await writeFile(absolute, original.split(from).join(to), 'utf8');
  }
}

async function writeJson(root, relative, document) {
  await writeFile(path.join(root, ...relative.split('/')), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

async function makeReadyFixture(root) {
  const releaseSpecPath = path.join(root, 'config', 'releases', 'v0.1.1.json');
  const releaseSpec = JSON.parse(await readFile(releaseSpecPath, 'utf8'));
  if (releaseSpec.status === 'ready') {
    return { releaseDate: releaseSpec.releaseDate };
  }
  assert.equal(releaseSpec.status, 'planned');
  const releaseDate = '2026-08-21';
  const sitemapLastmod = '2026-08-22';
  releaseSpec.status = 'ready';
  releaseSpec.releaseDate = releaseDate;
  await writeJson(root, 'config/releases/v0.1.1.json', releaseSpec);

  const htmlReplacements = [
    ['AI Research Tech Tree - v0.1.1 Development Edition', 'AI Research Tech Tree - v0.1.1 Public Beta'],
    ['The v0.1.1 development edition of a curated public-beta atlas', 'The v0.1.1 public-beta release of a curated atlas'],
    ['Explore the v0.1.1 development edition of a curated public-beta map', 'Explore the v0.1.1 public-beta release of a curated map'],
    ['The v0.1.1 development edition of a curated public-beta AI research atlas', 'The v0.1.1 public-beta release of a curated AI research atlas'],
    ['aria-label="Development edition v0.1.1. View exact build commit and checksums"', 'aria-label="Public beta v0.1.1. View exact build commit and checksums"'],
    ['<span class="editionShort" aria-hidden="true">Dev</span>', '<span class="editionShort" aria-hidden="true">Beta</span>'],
    ['Development edition', 'Public beta']
  ];
  for (const relative of ['ai-research-tech-tree.html', 'index.html']) {
    const absolute = path.join(root, relative);
    let html = await readFile(absolute, 'utf8');
    for (const [from, to] of htmlReplacements) {
      assert(html.includes(from), `${relative} must contain ready-fixture source ${from}`);
      html = html.split(from).join(to);
    }
    await writeFile(absolute, html, 'utf8');
  }

  const normalized = JSON.parse(await readFile(path.join(root, 'ai-research-tech-tree.json'), 'utf8'));
  normalized.dataset.releaseState = 'Public beta';
  await writeJson(root, 'ai-research-tech-tree.json', normalized);
  const jsonLd = JSON.parse(await readFile(path.join(root, 'ai-research-tech-tree.jsonld'), 'utf8'));
  jsonLd['tree:releaseState'] = 'Public beta';
  await writeJson(root, 'ai-research-tech-tree.jsonld', jsonLd);
  const ndjsonPath = path.join(root, 'ai-research-tech-tree.ndjson');
  const ndjsonLines = (await readFile(ndjsonPath, 'utf8')).trimEnd().split(/\r?\n/u);
  const datasetRecord = JSON.parse(ndjsonLines[0]);
  datasetRecord.dataset.releaseState = 'Public beta';
  ndjsonLines[0] = JSON.stringify(datasetRecord);
  await writeFile(ndjsonPath, `${ndjsonLines.join('\n')}\n`, 'utf8');

  const citation = [
    'cff-version: 1.2.0',
    'message: >-',
    '  This v0.1.1 public-beta release identity is ready for controlled tag',
    '  verification. The exact source commit and checksums are in',
    '  release-manifest.json; this citation metadata does not attest a tag,',
    '  deployment, or publication.',
    'title: "AI Research Tech Tree"',
    'type: dataset',
    'authors:',
    '  - name: "@neb6dav"',
    '    website: "https://github.com/neb6dav"',
    'version: 0.1.1',
    `date-released: "${releaseDate}"`,
    'repository-code: "https://github.com/neb6dav/ai_tech_tree"',
    'url: "https://neb6dav.github.io/ai_tech_tree/"',
    'license: CC-BY-SA-4.0',
    'abstract: >-',
    '  A versioned public-beta release of an evidence-linked research atlas of',
    '  artificial-intelligence developments, open research directions, landmark',
    '  works, and explicitly typed relationships, presented through Timeline,',
    '  Network, Opportunity, and List views with machine-readable knowledge-graph',
    '  exports.',
    'keywords:',
    '  - artificial intelligence',
    '  - research atlas',
    ''
  ].join('\n');
  await writeFile(path.join(root, 'CITATION.cff'), citation, 'utf8');

  const changelogPath = path.join(root, 'CHANGELOG.md');
  let changelog = await readFile(changelogPath, 'utf8');
  const target = '**Target: v0.1.1 development edition.** This section describes an untagged release candidate. It does not claim that `v0.1.1` has been tagged, released, or deployed.\n\n';
  assert(changelog.includes(target));
  changelog = changelog.replace(target, `## [0.1.1] - ${releaseDate}\n\n**Public beta release identity. This source state does not claim deployment.**\n\n`);
  changelog = changelog.replace(
    '[Unreleased]: https://github.com/neb6dav/ai_tech_tree/compare/v0.1.0...HEAD',
    '[Unreleased]: https://github.com/neb6dav/ai_tech_tree/compare/v0.1.1...HEAD\n[0.1.1]: https://github.com/neb6dav/ai_tech_tree/compare/v0.1.0...v0.1.1'
  );
  await writeFile(changelogPath, changelog, 'utf8');

  const readmePath = path.join(root, 'README.md');
  let readme = await readFile(readmePath, 'utf8');
  const releaseLine = readme.split(/\r?\n/u).find(line => line.startsWith('**Release channel: public beta.**'));
  assert(releaseLine);
  readme = readme.replace(
    releaseLine,
    '**Release channel: public beta.** This source snapshot finalizes the `v0.1.1` public-beta release identity; it does not by itself prove that a tag, GitHub Release, approval, deployment, or public verification exists. The atlas remains a curated research aid rather than a complete or peer-reviewed literature account.'
  );
  await writeFile(readmePath, readme, 'utf8');

  await replaceInFiles(root, ['sitemap.xml'], '<lastmod>2026-08-20</lastmod>', `<lastmod>${sitemapLastmod}</lastmod>`);
  await replaceInFiles(root, ['release-gate.js'], "data.dataset.releaseState, 'Development edition'", "data.dataset.releaseState, 'Public beta'");
  await replaceInFiles(root, ['ui-layout-gate.js'], "releaseState:'Development edition'", "releaseState:'Public beta'");
  await replaceInFiles(root, ['ui-layout-gate.js'], "data.dataset.releaseState, 'Development edition'", "data.dataset.releaseState, 'Public beta'");
  await replaceInFiles(root, ['.github/ISSUE_TEMPLATE/correction.yml', '.github/ISSUE_TEMPLATE/relationship.yml'], 'v0.1.1-dev', 'v0.1.1');
  const releaseIdentityFixture = [
    "'use strict';",
    "const assert = require('node:assert/strict');",
    "const test = require('node:test');",
    'const EXPECTED = Object.freeze({',
    "  citationVersion: '0.1.1',",
    "  edition: '2026-08-20-public-beta-2',",
    "  releaseState: 'Public beta',",
    "  asOf: '2026-08-04',",
    `  releaseDate: '${releaseDate}',`,
    `  sitemapLastmod: '${sitemapLastmod}'`,
    '});',
    "test('ready release dates remain independent', () => {",
    '  assert.notEqual(EXPECTED.releaseDate, EXPECTED.sitemapLastmod);',
    "  assert.equal(EXPECTED.edition, '2026-08-20-public-beta-2');",
    "  assert.equal(EXPECTED.asOf, '2026-08-04');",
    '});',
    ''
  ].join('\n');
  await writeFile(path.join(root, 'tests', 'release-identity.test.cjs'), releaseIdentityFixture, 'utf8');
  return { releaseDate, sitemapLastmod };
}

test('real v0.1.1 root produces the exact stable read-only transition plan in either accepted state', async () => {
  const first = await createReleaseFinalizationPlan({ repositoryRoot: ROOT });
  const second = await createReleaseFinalizationPlan({ repositoryRoot: ROOT });
  const realSpec = JSON.parse(await readFile(path.join(ROOT, 'config', 'releases', 'v0.1.1.json'), 'utf8'));

  assert.deepEqual(second, first, 'repeated inspection must be idempotent');
  assert.equal(first.mode, 'read-only');
  assert.equal(first.writesPerformed, false);
  assert.equal(first.result, `${realSpec.status}-identity-verified`);
  assert.equal(first.release.currentStatus, realSpec.status);
  assert.equal(first.release.releaseDate, realSpec.releaseDate);
  if (realSpec.status === 'planned') {
    assert.deepEqual(first.release.releaseDateResolution, {
      state: 'unresolved',
      source: 'authorized intended v0.1.1 annotated-tag tagger calendar date',
      selector: 'tagger.calendarDate',
      derivation: 'chosen for the controlled finalization, then verified against the annotated tag header in its recorded timezone',
      format: 'YYYY-MM-DD'
    });
  } else {
    assert.equal(first.release.releaseDateResolution.state, 'authorized-intended-date-recorded');
    assert.equal(first.release.releaseDateResolution.value, realSpec.releaseDate);
  }
  assert.equal(first.release.targetEdition, '2026-08-20-public-beta-2');
  assert.equal(first.release.sitemapLastmodResolution.source, 'actual modification date of the canonical public page content');
  assert.match(first.release.dateSafetyBoundary, /Edition and dataset asOf remain unchanged/u);
  assert.deepEqual(
    first.transitionInventory.map(({ kind, path: relative }) => [kind, relative]),
    EXPECTED_INVENTORY
  );
  assert.equal(
    createHash('sha256').update(JSON.stringify(first.transitionInventory)).digest('hex'),
    INVENTORY_SHA256,
    'the complete ordered transition inventory is review-locked'
  );
  assert.equal(first.transitionInventory.at(-1).commitPolicy, 'generated verification output; do not commit');
  assert.equal(first.transitionInventory.at(-1).changes.at(-1).operation, 'preserve-safety-boundary');
  const releaseSpecEdition = first.transitionInventory[0].changes.find(change => change.field === '/edition');
  assert.deepEqual(releaseSpecEdition, {
    field: '/edition',
    from: '2026-08-20-public-beta-2',
    to: '2026-08-20-public-beta-2',
    operation: 'preserve'
  });
  const sitemapLastmod = first.transitionInventory.find(item => item.path === 'sitemap.xml').changes[0];
  assert.equal(sitemapLastmod.to.source, 'actual modification date of the canonical public page content');
  assert.notDeepEqual(sitemapLastmod.to, first.release.releaseDateResolution, 'sitemap date must not derive from release date');
  for (const transition of first.transitionInventory.slice(0, 6)) {
    for (const change of transition.changes) {
      if (typeof change.to === 'string' && /public-beta release|ready citation/u.test(change.to)) {
        assert.match(change.to, /no (?:tag or )?deployment claim/u, `${transition.path} public wording boundary`);
      }
    }
  }
  assert.equal(
    first.transitionInventory.find(item => item.path === 'scripts/release-finalization-plan.mjs').changes[0].operation,
    'preserve-state-aware-verifier'
  );
  assert.equal(
    first.transitionInventory.find(item => item.path === 'tests/release-finalization-plan.test.mjs').changes[0].operation,
    'preserve-verification-closure'
  );
  assert.equal(first.executionBoundary.operationScope, 'read-only repository identity inspection and transition planning');
  assert(!Object.hasOwn(first.executionBoundary, 'thisPlanAuthorizes'));
  assert.match(first.executionBoundary.verificationRequiredBeforeReleaseModeAssetsOrPromotion, /subsequently created/u);
  assert.deepEqual(first.verificationClosure.acceptedIdentityStates, ['planned', 'ready']);
  assert.equal(first.verificationClosure.implementation, 'scripts/release-finalization-plan.mjs');
  assert.equal(first.verificationClosure.test, 'tests/release-finalization-plan.test.mjs');
  assert.equal(first.verificationClosure.fullCommand, 'npm test');
  assert(!serializeReleaseFinalizationPlan(first).includes(ROOT), 'stable output must not disclose or bind to an absolute checkout path');
});

test('complete ready identity fixture verifies final surfaces and retains the preview null-tag boundary', async t => {
  const root = await copyFixture(t);
  await makeReadyFixture(root);
  const before = await snapshotTree(root);
  const plan = await createReleaseFinalizationPlan({ repositoryRoot: root });

  assert.equal(plan.result, 'ready-identity-verified');
  assert.equal(plan.release.currentStatus, 'ready');
  assert.match(plan.release.releaseDate, /^\d{4}-\d{2}-\d{2}$/u);
  assert.equal(plan.release.targetEdition, '2026-08-20-public-beta-2');
  assert.equal(plan.verifiedIdentity.dataset.edition, '2026-08-20-public-beta-2');
  assert.equal(plan.verifiedIdentity.dataset.asOf, '2026-08-04');
  assert.equal(plan.verifiedIdentity.dataset.releaseState, 'Public beta');
  assert.equal(plan.release.releaseDateResolution.state, 'authorized-intended-date-recorded');
  assert.equal(plan.release.sitemapLastmodResolution.source, 'actual modification date of the canonical public page content');
  assert.deepEqual(plan.verifiedIdentity.candidatePreviewBoundary, {
    publicationMode: 'preview',
    tag: null,
    promotion: null,
    enforcedBy: 'scripts/release-assets.mjs'
  });
  assert.equal(plan.executionBoundary.operationScope, 'read-only repository identity inspection and transition planning');
  assert.match(plan.executionBoundary.blockedUntil, /annotated-tag object verifies/u);
  assert.deepEqual(await snapshotTree(root), before, 'ready inspection must perform zero writes');
});

test('library and CLI inspection are idempotent and perform no filesystem writes', async t => {
  const root = await copyFixture(t);
  const before = await snapshotTree(root);
  const first = await createReleaseFinalizationPlan({ repositoryRoot: root });
  const middle = await snapshotTree(root);
  const second = await createReleaseFinalizationPlan({ repositoryRoot: root });
  const afterLibrary = await snapshotTree(root);
  assert.deepEqual(middle, before, 'first library inspection must not alter files or directories');
  assert.deepEqual(afterLibrary, before, 'second library inspection must not alter files or directories');
  assert.equal(serializeReleaseFinalizationPlan(first), serializeReleaseFinalizationPlan(second));

  const result = await execFileAsync(process.execPath, [SCRIPT, '--repository-root', root], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, serializeReleaseFinalizationPlan(first));
  assert.deepEqual(await snapshotTree(root), before, 'CLI inspection must not alter files or directories');
});

test('repository root and every inspected input must be canonical regular paths', async t => {
  await t.test('rejects a junction or directory-symlink repository root', async t => {
    const root = await copyFixture(t);
    const canonicalTemporaryParent = await realpath(os.tmpdir());
    const aliasParent = await realpath(await mkdtemp(path.join(canonicalTemporaryParent, 'ai-tree-finalization-alias-')));
    const alias = path.join(aliasParent, 'repository-junction');
    await symlink(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
    t.after(async () => {
      await unlink(alias).catch(() => {});
      await rm(aliasParent, { recursive: true, force: true });
    });
    await assert.rejects(
      createReleaseFinalizationPlan({ repositoryRoot: alias }),
      /repositoryRoot must not be a symbolic link or junction|repositoryRoot must be canonical/u
    );
  });

  await t.test('rejects a symbolic-link or junction input instead of a regular file', async t => {
    const root = await copyFixture(t);
    const citationPath = path.join(root, 'CITATION.cff');
    await unlink(citationPath);
    if (process.platform === 'win32') {
      const junctionTarget = path.join(root, 'citation-junction-target');
      await mkdir(junctionTarget);
      await symlink(junctionTarget, citationPath, 'junction');
    } else {
      await symlink(path.join(ROOT, 'CITATION.cff'), citationPath, 'file');
    }
    await assert.rejects(
      createReleaseFinalizationPlan({ repositoryRoot: root }),
      /CITATION\.cff must not be a symbolic link or junction/u
    );
  });
});

test('release date cannot be injected through API options or CLI arguments', async () => {
  await assert.rejects(
    createReleaseFinalizationPlan({ repositoryRoot: ROOT, releaseDate: '2026-08-20' }),
    /unsupported options: releaseDate; releaseDate cannot be supplied hypothetically/u
  );
  await assert.rejects(
    execFileAsync(process.execPath, [SCRIPT, '--repository-root', ROOT, '--release-date', '2026-08-20'], {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true
    }),
    error => {
      assert.match(error.stderr, /releaseDate is intentionally not accepted/u);
      return true;
    }
  );
});

test('preflight fails closed when edition date, review cutoff, sitemap date, or release date varies independently', async t => {
  await t.test('edition date differs while asOf and sitemap remain unchanged', async t => {
    const root = await copyFixture(t);
    const files = [
      'config/releases/v0.1.1.json',
      'ai-research-tech-tree.html',
      'index.html',
      'ai-research-tech-tree.json',
      'ai-research-tech-tree.jsonld',
      'ai-research-tech-tree.ndjson',
      'release-gate.js',
      'ui-layout-gate.js',
      'tests/release-identity.test.cjs'
    ];
    await replaceInFiles(root, files, '2026-08-20-public-beta-2', '2026-08-21-public-beta-2');
    await assert.rejects(
      createReleaseFinalizationPlan({ repositoryRoot: root }),
      /release specification must match the reviewed v0\.1\.1 identity/u
    );
    assert((await readFile(path.join(root, 'sitemap.xml'), 'utf8')).includes('<lastmod>2026-08-20</lastmod>'));
  });

  await t.test('historical asOf differs while edition and sitemap remain unchanged', async t => {
    const root = await copyFixture(t);
    const files = [
      'ai-research-tech-tree.html',
      'index.html',
      'ai-research-tech-tree.json',
      'ai-research-tech-tree.jsonld',
      'ai-research-tech-tree.ndjson',
      'release-gate.js',
      'tests/release-identity.test.cjs'
    ];
    await replaceInFiles(root, files, '2026-08-04', '2026-08-05');
    await assert.rejects(
      createReleaseFinalizationPlan({ repositoryRoot: root }),
      /missing exact planned identity fragment|\.asOf must be exactly/u
    );
    assert((await readFile(path.join(root, 'config/releases/v0.1.1.json'), 'utf8')).includes('2026-08-20-public-beta-2'));
  });

  await t.test('sitemap lastmod differs while edition and asOf remain unchanged', async t => {
    const root = await copyFixture(t);
    await replaceInFiles(root, ['sitemap.xml'], '<lastmod>2026-08-20</lastmod>', '<lastmod>2026-08-21</lastmod>');
    await assert.rejects(
      createReleaseFinalizationPlan({ repositoryRoot: root }),
      /sitemap lastmod must be exactly "2026-08-20"/u
    );
  });

  await t.test('hypothetical release date appears in a still-planned specification', async t => {
    const root = await copyFixture(t);
    const relative = 'config/releases/v0.1.1.json';
    const absolute = path.join(root, ...relative.split('/'));
    const document = JSON.parse(await readFile(absolute, 'utf8'));
    document.releaseDate = '2026-08-20';
    await writeFile(absolute, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    const beforeFailure = await snapshotTree(root);
    await assert.rejects(
      createReleaseFinalizationPlan({ repositoryRoot: root }),
      /planned releases must have releaseDate null/u
    );
    assert.deepEqual(await snapshotTree(root), beforeFailure, 'failed inspection must also remain read-only');
  });
});

test('preflight rejects source, generated, citation, and contribution-hint drift', async t => {
  const mutations = [
    {
      name: 'package lock version',
      files: ['package-lock.json'],
      from: '"version": "0.1.1"',
      to: '"version": "0.1.0"',
      error: /package-lock top-level version must be exactly/u
    },
    {
      name: 'package test closure detached',
      files: ['package.json'],
      from: 'npm run test:release-finalization-plan && ',
      to: '',
      error: /test:publication finalization-plan closure count/u
    },
    {
      name: 'generated index divergence',
      files: ['index.html'],
      from: '<title>AI Research Tech Tree - v0.1.1 Development Edition</title>',
      to: '<title>AI Research Tech Tree</title>',
      error: /index\.html must be the exact generated copy/u
    },
    {
      name: 'social description drift across canonical and generated HTML',
      files: ['ai-research-tech-tree.html', 'index.html'],
      from: 'Explore the v0.1.1 development edition of a curated public-beta map',
      to: 'Explore an unlabeled map',
      error: /missing exact planned identity fragment/u
    },
    {
      name: 'edition badge accessible-name drift across canonical and generated HTML',
      files: ['ai-research-tech-tree.html', 'index.html'],
      from: 'aria-label="Development edition v0.1.1. View exact build commit and checksums"',
      to: 'aria-label="Public beta"',
      error: /missing exact planned identity fragment/u
    },
    {
      name: 'premature citation date',
      files: ['CITATION.cff'],
      from: 'title: "AI Research Tech Tree"',
      to: 'date-released: "2026-08-20"\ntitle: "AI Research Tech Tree"',
      error: /must not contain date-released/u
    },
    {
      name: 'citation message drift',
      files: ['CITATION.cff'],
      from: 'For a stable citation, cite',
      to: 'For citation, use',
      error: /CITATION message must be exactly/u
    },
    {
      name: 'citation abstract drift',
      files: ['CITATION.cff'],
      from: 'An untagged development edition',
      to: 'A released edition',
      error: /CITATION abstract must be exactly/u
    },
    {
      name: 'changelog comparison drift',
      files: ['CHANGELOG.md'],
      from: 'compare/v0.1.0...HEAD',
      to: 'compare/main...HEAD',
      error: /Unreleased comparison must still begin at v0\.1\.0/u
    },
    {
      name: 'normalized JSON release-state drift',
      files: ['ai-research-tech-tree.json'],
      from: '"releaseState": "Development edition"',
      to: '"releaseState": "Public beta"',
      error: /dataset\.releaseState must be exactly/u
    },
    {
      name: 'JSON-LD release-state drift',
      files: ['ai-research-tech-tree.jsonld'],
      from: '"tree:releaseState":"Development edition"',
      to: '"tree:releaseState":"Public beta"',
      error: /tree:releaseState must be exactly/u
    },
    {
      name: 'README latest-tag drift',
      files: ['README.md'],
      from: 'latest tagged release remains `v0.1.0`',
      to: 'latest tagged release is `v0.1.1`',
      error: /README must identify v0\.1\.0 as the latest tag/u
    },
    {
      name: 'stale correction issue placeholder',
      files: ['.github/ISSUE_TEMPLATE/correction.yml'],
      from: 'v0.1.1-dev',
      to: 'v0.1.0',
      error: /correction issue form must contain two/u
    },
    {
      name: 'candidate preview null-tag guard removed',
      files: ['scripts/release-assets.mjs'],
      from: 'if (manifest.tag !== null || manifest.promotion !== null)',
      to: 'if (false)',
      error: /release-assets preview boundary is missing/u
    },
    {
      name: 'complete ready-state test closure removed',
      files: ['tests/release-finalization-plan.test.mjs'],
      from: 'complete ready identity fixture',
      to: 'ready identity scenario',
      error: /planner test must retain complete ready-state closure/u
    },
    {
      name: 'planner state dispatch removed',
      files: ['scripts/release-finalization-plan.mjs'],
      from: 'const status = assertReleaseSpecIdentity(releaseSpec);',
      to: "const status = 'planned';",
      error: /planner implementation must retain planned\/ready state dispatch/u
    }
  ];

  for (const mutation of mutations) {
    await t.test(mutation.name, async t => {
      const root = await copyFixture(t);
      await replaceInFiles(root, mutation.files, mutation.from, mutation.to);
      await assert.rejects(createReleaseFinalizationPlan({ repositoryRoot: root }), mutation.error);
    });
  }
});
