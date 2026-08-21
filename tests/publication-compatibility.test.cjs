'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'pages-stage.v1.json'), 'utf8'));
const ALIAS_SOURCE = path.join(ROOT, 'src', 'compatibility', 'ai-research-tech-tree.html');
const STABLE_OPPORTUNITY_ALTERNATE = './data/opportunities/diffusion-models.alpha.json';
const LEGACY_OPPORTUNITY_ALTERNATE = './src/data/opportunities/diffusion-models.alpha.json';
const CANONICAL_URL = 'https://neb6dav.github.io/ai_tech_tree/';
const DATASET_IRI = 'urn:uuid:7d0547f2-6239-5a56-82a3-1c846701c866';
const LANE_ORDER = Object.freeze([
  'roots',
  'symbolic',
  'search',
  'rl',
  'neural',
  'training',
  'language',
  'vision',
  'generative',
  'prob',
  'alt',
  'robotics',
  'safety',
  'systems',
  'science'
]);
const PUBLIC_TARGETS = Object.freeze([
  'index.html',
  'ai-research-tech-tree.html',
  'ai-research-tech-tree.json',
  'ai-research-tech-tree.jsonld',
  'ai-research-tech-tree.ndjson',
  'social-card.png',
  'robots.txt',
  'sitemap.xml',
  'CITATION.cff',
  'data/opportunities/diffusion-models.alpha.json',
  'data/opportunities/opportunity-map.schema.json',
  'src/data/opportunities/diffusion-models.alpha.json',
  'src/data/opportunities/opportunity-map.schema.json'
]);
const HISTORICAL_ID_COLLECTIONS = Object.freeze([
  'lanes',
  'nodes',
  'relationships',
  'evidenceAssessments',
  'papers',
  'paperLinks',
  'landmarkWorks',
  'landmarkWorkLinks',
  'wikipediaSources'
]);
const OPPORTUNITY_ID_COLLECTIONS = Object.freeze([
  'nodes',
  'relationships',
  'sources',
  'applicationBranches',
  'constraints',
  'openOpportunities',
  'unresolvedClaims'
]);
const HISTORICAL_ID_INVENTORY_SHA256 = 'f5cff253d7a70641cf1f9a9058561f6d69bbae2d365166a7883694b3ef90241a';
const OPPORTUNITY_ID_INVENTORY_SHA256 = '65afb35bc56b6d771312cc59a2ab3d4a7b48828b54a2262b7efb18d845702b33';

function artifactByTarget(target) {
  return CONFIG.artifacts.find(artifact => artifact.target === target);
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
}

function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

test('freezes the v1 public endpoints, schemas, layout, and canonical authoring identities', () => {
  const historical = readJson('ai-research-tech-tree.json');
  const jsonLd = readJson('ai-research-tech-tree.jsonld');
  const opportunity = readJson('src/data/opportunities/diffusion-models.alpha.json');
  const atlasManifest = readJson('src/data/atlas/manifest.json');
  const atlasCatalog = readJson('src/data/atlas/catalog.json');
  const networkLayout = readJson('network-layout-v1.json');

  assert.equal(CONFIG.schemaVersion, '1.0.0');
  assert.equal(CONFIG.outputDirectory, '_site');
  assert.equal(CONFIG.releaseManifest, 'release-manifest.json');
  assert.deepEqual(
    CONFIG.artifacts.map(artifact => artifact.target).sort(),
    [...PUBLIC_TARGETS].sort()
  );
  assert.deepEqual(CONFIG.generatedFiles.map(file => file.target), ['.nojekyll']);

  assert.equal(atlasCatalog.project.canonicalUrl, CANONICAL_URL);
  assert.equal(atlasCatalog.project.repositoryUrl, 'https://github.com/neb6dav/ai_tech_tree');
  assert.equal(
    atlasCatalog.project.contributionGuideUrl,
    'https://github.com/neb6dav/ai_tech_tree/blob/main/CONTRIBUTING.md'
  );
  assert.equal(atlasCatalog.project.license, 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.equal(atlasCatalog.project.citationUrl, './CITATION.cff');
  assert.equal(atlasCatalog.project.manifestUrl, './release-manifest.json');
  assert.equal(atlasCatalog.project.correctionsUrl, 'https://github.com/neb6dav/ai_tech_tree/issues/new/choose');

  assert.equal(historical.schemaVersion, 2);
  assert.equal(historical.generatorVersion, '1.3.1');
  assert.equal(historical.namespace.datasetIri, DATASET_IRI);
  assert.equal(historical.namespace.vocabularyIri, `${DATASET_IRI}#vocab-`);
  assert.equal(historical.dataset.identifier, DATASET_IRI);
  assert.equal(historical.dataset.canonicalUrl, CANONICAL_URL);
  assert.equal(historical.dataset.humanUrl, './');
  assert.equal(jsonLd['@context']['@version'], 1.1);
  assert.equal(jsonLd['@context'].schema, 'https://schema.org/');
  assert.equal(jsonLd['@context'].prov, 'http://www.w3.org/ns/prov#');
  assert.equal(jsonLd['@context'].tree['@id'], `${DATASET_IRI}#vocab-`);
  assert.equal(jsonLd['@context'].tree['@prefix'], true);
  assert.equal(jsonLd['@id'], DATASET_IRI);

  assert.equal(opportunity.$schema, './opportunity-map.schema.json');
  assert.equal(opportunity.schemaVersion, '1.0.0');
  assert.equal(opportunity.metadata.id, 'diffusion-models-opportunity-map');
  assert.equal(opportunity.metadata.status, 'alpha');
  assert.equal(opportunity.metadata.importStatus.state, 'imported_unreviewed');
  assert.deepEqual(
    opportunity.metadata.visualBands.map(band => band.id),
    ['band-precursors', 'band-core', 'band-capabilities', 'band-applications', 'band-outcomes', 'band-constraints', 'band-frontier']
  );

  assert.equal(networkLayout.schemaVersion, '1.0.0');
  assert.equal(networkLayout.layoutVersion, 'network-v1');
  assert.equal(networkLayout.algorithm, 'deterministic-lane-force-v1');
  assert.equal(networkLayout.seed, 'ai-research-tech-tree-network-v1');

  assert.equal(atlasManifest.schemaVersion, '1.0.0');
  assert.deepEqual(atlasManifest.laneOrder, LANE_ORDER);
  assert.deepEqual(atlasCatalog.lanes.map(lane => lane.id), LANE_ORDER);
  assert.deepEqual(
    atlasManifest.nodeShards.map(shard => shard.file),
    LANE_ORDER.map(laneId => `nodes/${laneId}.json`)
  );
  assert.deepEqual(
    atlasManifest.relationshipShards.map(shard => shard.file),
    LANE_ORDER.map(laneId => `relationships/${laneId}.json`)
  );
  assert.deepEqual(atlasManifest.sidecars, {
    catalog: 'catalog.json',
    directions: 'directions.json',
    researchGuide: 'research-guide.json',
    wikipediaAudit: 'wikipedia-audit.json',
    reviewFingerprints: 'review-fingerprints.json',
    noScript: 'no-script.json'
  });
});

test('locks every ordered v1 exported record identity', () => {
  const historical = readJson('ai-research-tech-tree.json');
  const opportunity = readJson('src/data/opportunities/diffusion-models.alpha.json');
  const historicalInventory = Object.fromEntries(
    HISTORICAL_ID_COLLECTIONS.map(collection => [collection, historical[collection].map(record => record.id)])
  );
  historicalInventory.classifications = Object.keys(historical.classifications);
  const opportunityInventory = Object.fromEntries(
    OPPORTUNITY_ID_COLLECTIONS.map(collection => [collection, opportunity[collection].map(record => record.id)])
  );

  assert.equal(sha256Json(historicalInventory), HISTORICAL_ID_INVENTORY_SHA256);
  assert.equal(sha256Json(opportunityInventory), OPPORTUNITY_ID_INVENTORY_SHA256);
});

test('stages stable Opportunity paths and legacy compatibility endpoints', () => {
  const stableData = artifactByTarget('data/opportunities/diffusion-models.alpha.json');
  const legacyData = artifactByTarget('src/data/opportunities/diffusion-models.alpha.json');
  const stableSchema = artifactByTarget('data/opportunities/opportunity-map.schema.json');
  const legacySchema = artifactByTarget('src/data/opportunities/opportunity-map.schema.json');

  assert(stableData);
  assert(legacyData);
  assert(stableSchema);
  assert(legacySchema);
  assert.equal(stableData.source, legacyData.source);
  assert.equal(stableSchema.source, 'src/data/opportunities/opportunity-map.schema.json');
  assert.equal(legacySchema.source, 'src/compatibility/opportunity-map.schema.json');
  assert.equal(stableData.mediaType, 'application/json; charset=utf-8');
  assert.equal(stableSchema.mediaType, 'application/json; charset=utf-8');

  const targets = CONFIG.artifacts.map(artifact => artifact.target);
  assert.equal(new Set(targets).size, targets.length, 'Staged publication targets must remain unique.');

  const canonicalSchema = JSON.parse(fs.readFileSync(path.join(ROOT, stableSchema.source), 'utf8'));
  const compatibilitySchema = JSON.parse(fs.readFileSync(path.join(ROOT, legacySchema.source), 'utf8'));
  assert.equal(
    canonicalSchema.$id,
    'https://neb6dav.github.io/ai_tech_tree/data/opportunities/opportunity-map.schema.json'
  );
  assert.equal(
    compatibilitySchema.$id,
    'https://neb6dav.github.io/ai_tech_tree/src/data/opportunities/opportunity-map.schema.json'
  );
  assert.equal(
    compatibilitySchema.$ref,
    'https://neb6dav.github.io/ai_tech_tree/data/opportunities/opportunity-map.schema.json'
  );
});

test('advertises only the stable Opportunity discovery endpoint', () => {
  for (const relative of ['ai-research-tech-tree.html', 'index.html']) {
    const html = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    const linkTags = [...html.matchAll(/<link\b[^>]*>/giu)].map(match => match[0]);
    const stableAlternates = linkTags.filter(tag => (
      /\brel=["']alternate["']/iu.test(tag) &&
      tag.includes('type="application/json"') &&
      tag.includes(`href="${STABLE_OPPORTUNITY_ALTERNATE}"`)
    ));
    assert.equal(stableAlternates.length, 1, `${relative} must advertise the stable endpoint exactly once.`);
    assert(
      !linkTags.some(tag => tag.includes(`href="${LEGACY_OPPORTUNITY_ALTERNATE}"`)),
      `${relative} must not advertise the legacy endpoint.`
    );
  }
});

test('stages a lightweight alias instead of republishing the legacy monolith', () => {
  const alias = artifactByTarget('ai-research-tech-tree.html');
  assert(alias);
  assert.equal(alias.source, 'src/compatibility/ai-research-tech-tree.html');
  assert.notEqual(alias.source, 'ai-research-tech-tree.html');

  const html = fs.readFileSync(ALIAS_SOURCE, 'utf8');
  assert(Buffer.byteLength(html) < 2048, 'Compatibility alias must remain below 2 KiB.');
  assert.match(
    html,
    /<noscript>\s*<meta\s+http-equiv="refresh"\s+content="0; url=\.\/">\s*<\/noscript>/iu
  );
  assert(!html.replace(/<noscript>[\s\S]*?<\/noscript>/giu, '').includes('http-equiv="refresh"'));
  assert.match(html, /<link\s+rel="canonical"\s+href="\.\/">/iu);
  assert.match(html, /<a\s+id="atlas-link"\s+href="\.\/">/iu);
  assert(!html.includes('network-view-engine'));
  assert(!html.includes('opportunity-view-engine'));
});

test('compatibility alias preserves query and hash state with replacement navigation', () => {
  const html = fs.readFileSync(ALIAS_SOURCE, 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/giu)];
  assert.equal(scripts.length, 1);

  const cases = [
    ['https://neb6dav.github.io/ai_tech_tree/ai-research-tech-tree.html', 'https://neb6dav.github.io/ai_tech_tree/'],
    ['https://neb6dav.github.io/ai_tech_tree/ai-research-tech-tree.html?view=network', 'https://neb6dav.github.io/ai_tech_tree/?view=network'],
    ['https://neb6dav.github.io/ai_tech_tree/ai-research-tech-tree.html#node=alexnet', 'https://neb6dav.github.io/ai_tech_tree/#node=alexnet'],
    [
      'https://neb6dav.github.io/ai_tech_tree/ai-research-tech-tree.html?view=network&mode=all#node=alexnet',
      'https://neb6dav.github.io/ai_tech_tree/?view=network&mode=all#node=alexnet'
    ],
    [
      'https://neb6dav.github.io/ai_tech_tree/ai-research-tech-tree.html?q=a%20b#node=encoded%2Fid',
      'https://neb6dav.github.io/ai_tech_tree/?q=a%20b#node=encoded%2Fid'
    ],
    [
      'https://neb6dav.github.io/ai_tech_tree/ai-research-tech-tree.html?view=opportunity&opportunity=diffusion-models-opportunity-map&opp=od-005&oppPanel=evidence#opp=od-005',
      'https://neb6dav.github.io/ai_tech_tree/?view=opportunity&opportunity=diffusion-models-opportunity-map&opp=od-005&oppPanel=evidence#opp=od-005'
    ],
    [
      'https://neb6dav.github.io/ai_tech_tree/ai-research-tech-tree.html?next=https%3A%2F%2Fevil.example%2Fx#https://evil.example/fragment',
      'https://neb6dav.github.io/ai_tech_tree/?next=https%3A%2F%2Fevil.example%2Fx#https://evil.example/fragment'
    ]
  ];

  for (const [input, expected] of cases) {
    const parsed = new URL(input);
    const replacements = [];
    const link = { href: './' };
    const location = {
      href: parsed.href,
      search: parsed.search,
      hash: parsed.hash,
      replace(value) { replacements.push(value); }
    };
    vm.runInNewContext(scripts[0][1], {
      URL,
      window: { location },
      document: {
        getElementById(id) {
          assert.equal(id, 'atlas-link');
          return link;
        }
      }
    });
    assert.deepEqual(replacements, [expected], input);
    assert.equal(link.href, expected, input);
  }
});
