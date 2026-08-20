'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'pages-stage.v1.json'), 'utf8'));
const ALIAS_SOURCE = path.join(ROOT, 'src', 'compatibility', 'ai-research-tech-tree.html');
const STABLE_OPPORTUNITY_ALTERNATE = './data/opportunities/diffusion-models.alpha.json';
const LEGACY_OPPORTUNITY_ALTERNATE = './src/data/opportunities/diffusion-models.alpha.json';

function artifactByTarget(target) {
  return CONFIG.artifacts.find(artifact => artifact.target === target);
}

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
