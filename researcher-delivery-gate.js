#!/usr/bin/env node
'use strict';

/*
 * v1.2.0 researcher-delivery release gate.
 *
 * This gate is intentionally fail-closed. It audits the maintained application
 * source and the completed `_site` staging tree together: a source-only feature
 * or an unmanifested generated artifact is not sufficient to pass.
 */

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  buildNodePageArtifacts,
  isBibTeXEligible
} = require('./scripts/generate-node-pages.cjs');
const { buildSitemap } = require('./scripts/generate-sitemap.cjs');
const {
  buildFingerprintIndex,
  diffFingerprintIndex,
  serializeFingerprintIndex
} = require('./scripts/generate-edition-fingerprints.cjs');

const ROOT = __dirname;
const STAGE_ROOT = path.join(ROOT, '_site');
const SOURCE_HTML_PATH = path.join(ROOT, 'ai-research-tech-tree.html');
const SOURCE_DATA_PATH = path.join(ROOT, 'ai-research-tech-tree.json');
const STAGED_DATA_PATH = path.join(STAGE_ROOT, 'ai-research-tech-tree.json');
const STAGED_HTML_PATH = path.join(STAGE_ROOT, 'index.html');
const SITEMAP_PATH = path.join(STAGE_ROOT, 'sitemap.xml');
const RELEASE_MANIFEST_PATH = path.join(STAGE_ROOT, 'release-manifest.json');
const SOURCE_FINGERPRINT_PATH = path.join(ROOT, 'src', 'data', 'editions', 'v1.0.0-fingerprints.json');
const STAGED_FINGERPRINT_TARGET = 'data/editions/v1.0.0-fingerprints.json';
const STAGED_FINGERPRINT_PATH = path.join(STAGE_ROOT, ...STAGED_FINGERPRINT_TARGET.split('/'));
const EXPECTED_NODE_COUNT = 339;
const EXPECTED_RELATIONSHIP_COUNT = 711;

function gateError(message) {
  return new Error(`researcher-delivery-gate: ${message}`);
}

function requireRegularFile(filePath, label) {
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch (error) {
    throw gateError(`${label} is missing: ${path.relative(ROOT, filePath)} (${error.code || error.message})`);
  }
  assert(!stat.isSymbolicLink(), `${label} must not be a symbolic link.`);
  assert(stat.isFile(), `${label} must be a regular file.`);
  return filePath;
}

function requireDirectory(directoryPath, label) {
  let stat;
  try {
    stat = fs.lstatSync(directoryPath);
  } catch (error) {
    throw gateError(`${label} is missing: ${path.relative(ROOT, directoryPath)} (${error.code || error.message})`);
  }
  assert(!stat.isSymbolicLink(), `${label} must not be a symbolic link.`);
  assert(stat.isDirectory(), `${label} must be a directory.`);
  return directoryPath;
}

function readText(filePath, label) {
  return fs.readFileSync(requireRegularFile(filePath, label), 'utf8').replace(/\r\n/gu, '\n');
}

function readJson(filePath, label) {
  const text = readText(filePath, label);
  try {
    return { text, value: JSON.parse(text) };
  } catch (error) {
    throw gateError(`${label} is not valid JSON: ${error.message}`);
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function requirePattern(pattern, label, source) {
  assert(pattern.test(source), `Missing v1.2 researcher-delivery contract: ${label}.`);
}

function forbidPattern(pattern, label, source) {
  assert(!pattern.test(source), `Forbidden v1.2 researcher-delivery behavior remains: ${label}.`);
}

function executableScripts(html) {
  return [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/giu)]
    .filter(match => !/\btype=["']application\/(?:ld\+json|json)["']/iu.test(match[1]))
    .map(match => match[2]);
}

function functionSource(source, name) {
  const signature = new RegExp(`\\bfunction\\s+${escapeRegExp(name)}\\s*\\(`, 'u');
  const match = signature.exec(source);
  assert(match, `Missing v1.2 researcher-delivery contract: ${name}() is defined.`);
  const open = source.indexOf('{', match.index + match[0].length);
  assert(open >= 0, `${name}() has no body.`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}' && --depth === 0) return source.slice(match.index, index + 1);
  }
  assert.fail(`${name}() has an unbalanced body.`);
}

function namedFunctions(source) {
  const names = [...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/gu)].map(match => match[1]);
  return [...new Set(names)].map(name => ({ name, source: functionSource(source, name) }));
}

function semanticProjection(dataset) {
  function project(records, label) {
    assert(Array.isArray(records), `${label} must be an array.`);
    const result = records.map(record => {
      assert.equal(typeof record?.id, 'string', `${label} record is missing an ID.`);
      assert.match(record.claimFingerprint || '', /^[0-9a-f]{8}$/u, `${label} ${record.id} is missing a claim fingerprint.`);
      return [record.id, record.claimFingerprint];
    });
    assert.equal(new Set(result.map(([id]) => id)).size, result.length, `${label} IDs must be unique.`);
    return result;
  }
  return {
    nodes: project(dataset.nodes, 'nodes'),
    relationships: project(dataset.relationships, 'relationships')
  };
}

function walkFiles(directory) {
  const result = [];
  function visit(current, relative) {
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const stat = fs.lstatSync(absolute);
      assert(!stat.isSymbolicLink(), `Staged node path must not be a symbolic link: ${childRelative}`);
      if (stat.isDirectory()) visit(absolute, childRelative);
      else {
        assert(stat.isFile(), `Staged node path must be a regular file: ${childRelative}`);
        result.push(childRelative);
      }
    }
  }
  visit(directory, '');
  return result;
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function decodeXmlText(value) {
  return value
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'");
}

function verifyManifestFile(manifestByPath, relativePath) {
  const record = manifestByPath.get(relativePath);
  assert(record, `Release manifest is missing ${relativePath}.`);
  const absolute = path.join(STAGE_ROOT, ...relativePath.split('/'));
  const bytes = fs.readFileSync(requireRegularFile(absolute, `staged ${relativePath}`));
  assert.equal(record.bytes, bytes.byteLength, `Release manifest byte count drifted for ${relativePath}.`);
  assert.equal(record.sha256, sha256(bytes), `Release manifest digest drifted for ${relativePath}.`);
  return record;
}

function verifyNodePages(stagedDataset, manifestByPath) {
  const expectedArtifacts = buildNodePageArtifacts(stagedDataset);
  const projectBasePath = new URL(stagedDataset.dataset.canonicalUrl).pathname;
  assert(projectBasePath.startsWith('/') && projectBasePath.endsWith('/'), 'Canonical dataset URL must expose a rooted project pathname.');
  assert.equal(expectedArtifacts.length, EXPECTED_NODE_COUNT, 'Node-page generator must return exactly 339 artifacts.');
  const expectedTargets = expectedArtifacts.map(artifact => artifact.target).sort();
  assert.equal(new Set(expectedTargets).size, EXPECTED_NODE_COUNT, 'Node-page targets must be unique.');

  const nodesRoot = requireDirectory(path.join(STAGE_ROOT, 'nodes'), 'staged nodes directory');
  const actualTargets = walkFiles(nodesRoot).map(relative => `nodes/${relative}`).sort();
  assert.deepEqual(actualTargets, expectedTargets, 'Staged nodes directory must contain exactly the 339 canonical index pages and no extras.');

  const workById = new Map(stagedDataset.landmarkWorks.map(work => [work.id, work]));
  const eligibleByNode = new Map(stagedDataset.nodes.map(node => [node.id, []]));
  for (const link of stagedDataset.landmarkWorkLinks) {
    const work = workById.get(link.workId);
    assert(work, `Landmark link ${link.id} references missing work ${link.workId}.`);
    if (isBibTeXEligible(work)) eligibleByNode.get(link.nodeId)?.push(work.id);
  }
  assert(
    stagedDataset.papers.every(paper => !isBibTeXEligible(paper)),
    'A paper now satisfies BibTeX eligibility; update the node-page generator and gate before release.'
  );

  for (const artifact of expectedArtifacts) {
    const absolute = path.join(STAGE_ROOT, ...artifact.target.split('/'));
    const actual = readText(absolute, `node page ${artifact.nodeId}`);
    assert.equal(actual, artifact.contents, `Staged node page is not the deterministic generator output: ${artifact.nodeId}.`);

    const canonicalUrl = new URL(`nodes/${encodeURIComponent(artifact.nodeId)}/`, stagedDataset.dataset.canonicalUrl).href;
    assert(actual.includes(`<link rel="canonical" href="${canonicalUrl}">`), `${artifact.nodeId} canonical metadata is missing.`);
    assert(actual.includes('<meta name="description" content="'), `${artifact.nodeId} description metadata is missing.`);
    assert(actual.includes('<meta property="og:title" content="'), `${artifact.nodeId} Open Graph title is missing.`);
    assert(actual.includes('<meta property="og:description" content="'), `${artifact.nodeId} Open Graph description is missing.`);
    assert(actual.includes(`<meta property="og:url" content="${canonicalUrl}">`), `${artifact.nodeId} Open Graph URL is missing.`);
    assert(actual.includes(`<meta property="og:image" content="${new URL('social-card.png', stagedDataset.dataset.canonicalUrl).href}">`), `${artifact.nodeId} shared Open Graph image is missing.`);
    assert(!/<script\b/iu.test(actual), `${artifact.nodeId} static page must not require or embed JavaScript.`);
    assert(actual.includes(`href="${projectBasePath}#node=${encodeURIComponent(artifact.nodeId)}"`), `${artifact.nodeId} interactive return link is missing.`);
    assert(actual.includes('<h2 id="works-title">Works and sources</h2>'), `${artifact.nodeId} works and sources section is missing.`);
    assert(actual.includes('<h2 id="evidence-title">Evidence caveat</h2>'), `${artifact.nodeId} evidence caveat is missing.`);

    const eligibleCount = eligibleByNode.get(artifact.nodeId)?.length || 0;
    const hasBibTeX = actual.includes('<section id="bibtex"');
    assert.equal(hasBibTeX, eligibleCount > 0, `${artifact.nodeId} BibTeX visibility violates the metadata eligibility rule.`);
    assert.equal(countMatches(actual, /<pre><code>@misc\{/gu), eligibleCount, `${artifact.nodeId} BibTeX record count drifted.`);
    assert.equal(verifyManifestFile(manifestByPath, artifact.target).mediaType, 'text/html; charset=utf-8', `${artifact.nodeId} manifest media type drifted.`);
  }
  return expectedArtifacts;
}

function verifySitemap(stagedDataset, manifestByPath) {
  const sitemap = readText(SITEMAP_PATH, 'staged sitemap');
  assert.equal(sitemap, buildSitemap(stagedDataset), 'Staged sitemap is not the deterministic generator output.');
  requirePattern(/<urlset\b[^>]*xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']/u, 'valid sitemap URL-set root', sitemap);
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(match => decodeXmlText(match[1]));
  assert.equal(new Set(locations).size, locations.length, 'Sitemap locations must not be duplicated.');
  const expectedNodeUrls = stagedDataset.nodes
    .map(node => new URL(`nodes/${encodeURIComponent(node.id)}/`, stagedDataset.dataset.canonicalUrl).href)
    .sort();
  const base = new URL(stagedDataset.dataset.canonicalUrl);
  const nodePrefix = new URL('nodes/', base).href;
  const actualNodeUrls = locations.filter(location => location.startsWith(nodePrefix)).sort();
  assert.deepEqual(actualNodeUrls, expectedNodeUrls, 'Sitemap must cover exactly all 339 canonical node-page URLs.');
  assert(locations.includes(base.href), 'Sitemap must retain the interactive atlas root URL.');
  assert.equal(verifyManifestFile(manifestByPath, 'sitemap.xml').mediaType, 'application/xml; charset=utf-8', 'Sitemap manifest media type drifted.');
  assert.equal(verifyManifestFile(manifestByPath, 'social-card.png').mediaType, 'image/png', 'Shared social image manifest media type drifted.');
}

function verifyFingerprintDelivery(sourceDataset, stagedDataset, manifestByPath) {
  const sourceFingerprint = readJson(SOURCE_FINGERPRINT_PATH, 'source v1.0.0 fingerprint index');
  const stagedFingerprint = readJson(STAGED_FINGERPRINT_PATH, 'staged v1.0.0 fingerprint index');
  assert.equal(stagedFingerprint.text, sourceFingerprint.text, 'Staged fingerprint index must be byte-identical to its source artifact.');
  const baseline = sourceFingerprint.value;
  assert.equal(baseline.schemaVersion, '1.0.0', 'Fingerprint index schema version must remain 1.0.0.');
  assert.equal(baseline.releaseVersion, '1.0.0', 'Fingerprint baseline must identify release v1.0.0.');
  assert.deepEqual(baseline.counts, { nodes: EXPECTED_NODE_COUNT, relationships: EXPECTED_RELATIONSHIP_COUNT });
  assert.match(baseline.semanticDigest || '', /^[0-9a-f]{64}$/u, 'Fingerprint semantic digest is invalid.');

  const rebuilt = buildFingerprintIndex(stagedDataset, { releaseVersion: '1.0.0' });
  assert.equal(serializeFingerprintIndex(rebuilt), sourceFingerprint.text, 'Checked-in v1.0.0 fingerprint index is stale or non-deterministic.');
  const emptyDiff = {
    nodes: { added: [], removed: [], changed: [] },
    relationships: { added: [], removed: [], changed: [] }
  };
  assert.deepEqual(diffFingerprintIndex(sourceDataset, baseline), emptyDiff, 'Source UI-only release contains semantic changes from v1.0.0.');
  assert.deepEqual(diffFingerprintIndex(stagedDataset, baseline), emptyDiff, 'Staged UI-only release contains semantic changes from v1.0.0.');
  assert.equal(rebuilt.semanticDigest, baseline.semanticDigest, 'Current semantic digest differs from the v1.0.0 baseline.');
  assert.equal(
    verifyManifestFile(manifestByPath, STAGED_FINGERPRINT_TARGET).mediaType,
    'application/json; charset=utf-8',
    'Fingerprint manifest media type drifted.'
  );
}

function verifyDiffSourceContract(html, applicationScript, functions) {
  requirePattern(/<button\b[^>]*(?:id|data-[\w-]+)=["'][^"']*diff[^"']*["'][^>]*>[\s\S]{0,120}\bDiff\b[\s\S]{0,80}<\/button>/iu, 'visible Diff control', html);
  requirePattern(/<(?:section|aside|dialog)\b(?=[^>]*\bid=["'][^"']*diff[^"']*["'])(?=[^>]*(?:aria-label|aria-labelledby)=["'][^"']+["'])[^>]*>/iu, 'accessible edition-diff view', html);
  requirePattern(/(?:id=["'][^"']*diff[^"']*["'][^>]*aria-live=["']polite["']|aria-live=["']polite["'][^>]*id=["'][^"']*diff[^"']*["'])/iu, 'polite Diff status region', html);
  requirePattern(/["']\.\/data\/editions\/v1\.0\.0-fingerprints\.json["']/u, 'same-origin fingerprint artifact path', applicationScript);
  for (const label of ['Added', 'Removed', 'Changed']) {
    requirePattern(new RegExp(`\\b${label}\\b`, 'u'), `${label} diff result label`, html);
  }

  const fetchCount = countMatches(applicationScript, /\bfetch\s*\(/gu);
  assert.equal(fetchCount, 1, 'The main application must contain exactly one fetch, the lazy fingerprint-index request.');
  const fetchFunctions = functions.filter(candidate => /\bfetch\s*\(/u.test(candidate.source));
  assert.equal(fetchFunctions.length, 1, 'The fingerprint request must be contained in one named loader function.');
  const loader = fetchFunctions[0];
  requirePattern(/new\s+URL\s*\(/u, 'fingerprint loader resolves an explicit URL', loader.source);
  requirePattern(/\.origin\s*!==?\s*(?:window\.)?location\.origin|(?:window\.)?location\.origin\s*!==?\s*\w+\.origin/u, 'fingerprint loader rejects a different origin', loader.source);
  requirePattern(/credentials\s*:\s*["']same-origin["']/u, 'fingerprint request uses same-origin credentials', loader.source);
  requirePattern(/\.ok\b/u, 'fingerprint response status is checked', loader.source);
  requirePattern(/\.json\s*\(/u, 'fingerprint response is parsed as JSON', loader.source);
  forbidPattern(/https?:\/\/[^"']*fingerprint/iu, 'absolute or cross-origin fingerprint endpoint', loader.source);

  const loaderCall = new RegExp(`\\b${escapeRegExp(loader.name)}\\s*\\(`, 'u');
  const callers = functions.filter(candidate => candidate.name !== loader.name && loaderCall.test(candidate.source));
  assert.equal(callers.length, 1, `${loader.name}() must be called only from the Diff-opening function.`);
  const opener = callers[0];
  requirePattern(/(?:hidden\s*=\s*false|removeAttribute\s*\(\s*["']hidden["']|showModal\s*\()/u, 'Diff opener reveals its view', opener.source);
  requirePattern(/diff/iu, 'lazy loader caller is the edition-diff opener', opener.source);
  assert.equal(countMatches(applicationScript, new RegExp(`\\b${escapeRegExp(loader.name)}\\s*\\(`, 'gu')), 2, 'Fingerprint loader must have exactly one call site after its declaration.');
  requirePattern(
    new RegExp(`(?:diff[\\w$]*\\.)?(?:onclick\\s*=|addEventListener\\s*\\(\\s*["']click["'][^;]{0,160})[^;]{0,240}\\b${escapeRegExp(opener.name)}\\b`, 'iu'),
    'Diff control activates the lazy opener',
    applicationScript
  );

  const diffFunctions = functions.filter(candidate => {
    if (candidate.name === loader.name || candidate.name === opener.name) return false;
    return ['added', 'removed', 'changed', 'nodes', 'relationships'].every(token => new RegExp(`\\b${token}\\b`, 'u').test(candidate.source));
  });
  assert(diffFunctions.length >= 1, 'A named node/relationship fingerprint diff function is required.');
  const calledDiff = diffFunctions.find(candidate => new RegExp(`\\b${escapeRegExp(candidate.name)}\\s*\\(`, 'u').test(opener.source));
  assert(calledDiff, 'Diff opener must compare the loaded baseline with current node and relationship fingerprints.');
}

function verifyEmbedSourceContract(html, css, applicationScript) {
  requirePattern(/new\s+URLSearchParams\s*\(\s*(?:window\.)?location\.search\s*\)/u, 'embed is read from the URL query string', applicationScript);
  requirePattern(/\.get\s*\(\s*["']embed["']\s*\)\s*={2,3}\s*["']1["']/u, 'only embed=1 enables embed mode', applicationScript);
  requirePattern(/(?:classList\.toggle\s*\(\s*["']embed-mode["']|dataset\.embed\s*=)/u, 'embed mode is exposed as a body style state', applicationScript);

  const cssRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)]
    .map(match => ({ selector: match[1], body: match[2] }));
  const embedRules = cssRules.filter(rule => /embed/iu.test(rule.selector));
  assert(embedRules.length > 0, 'Embed mode must have dedicated CSS rules.');
  const hides = token => embedRules.some(rule =>
    rule.selector.includes(token) && /(?:display\s*:\s*none|visibility\s*:\s*hidden)/iu.test(rule.body)
  );
  assert(hides('#bar'), 'Embed mode must hide application header chrome.');
  assert(hides('#legend'), 'Embed mode must hide onboarding and Help chrome.');
  requirePattern(/--bar-height\s*:\s*0(?:px)?|#stage[^{}]*\{[^{}]*(?:inset|top)\s*:\s*0/iu, 'embed content reclaims the hidden header space', css);
  for (const contentSurface of ['#stage', '#listView', '#networkView', '#opportunityView', '#panel', '.skip-link']) {
    assert(!hides(contentSurface), `Embed mode must not hide accessible content surface ${contentSurface}.`);
  }

  const welcome = functionSource(applicationScript, 'shouldShowFirstRun');
  requirePattern(/embed/iu, 'embed bypasses first-run onboarding', welcome);
  requirePattern(/(?:!\s*embed|embed[^;{}]{0,80}(?:return\s+false|\?\s*false))/iu, 'embed mode explicitly suppresses first-run onboarding', welcome);

  const currentParams = functionSource(applicationScript, 'currentParams');
  const restoreState = functionSource(applicationScript, 'restoreState');
  for (const key of ['status', 'audit', 'research', 'mode', 'view', 'opportunity', 'opp', 'oppPanel', 'oppBand', 'node', 'cx', 'cy', 'z', 'theme', 'scale', 'tour', 'step']) {
    requirePattern(new RegExp(`["']${key}["']`, 'u'), `${key} remains in hash serialization`, currentParams);
    requirePattern(new RegExp(`\\.(?:get|has)\\s*\\(\\s*["']${key}["']\\s*\\)`, 'u'), `${key} remains in hash restoration`, restoreState);
  }
  requirePattern(/location\.hash|hash\.slice/u, 'state restoration remains hash-based', restoreState);
  forbidPattern(/\.set\s*\(\s*["']embed["']/u, 'embed is incorrectly serialized into the state hash', currentParams);
  requirePattern(/history\.replaceState\s*\([^)]*,\s*["']#["']\s*\+|history\.replaceState\s*\([^)]*,\s*`#/u, 'state serialization preserves the embed query while replacing only the fragment', applicationScript);

  requirePattern(/localStorage\.getItem\s*\(\s*["']ai-tech-tree-theme["']/u, 'saved theme still initializes before the app', html);
  requirePattern(/id=["']skipList["'][^>]*href=["']#listView["']|href=["']#listView["'][^>]*id=["']skipList["']/iu, 'keyboard skip link remains available', html);
  requirePattern(/<main\b[^>]*id=["']stage["'][^>]*aria-label=/iu, 'interactive content retains an accessible main landmark', html);

  const executable = executableScripts(html).join('\n');
  forbidPattern(/\bpostMessage\b/u, 'postMessage bridge', executable);
  forbidPattern(/addEventListener\s*\(\s*["']message["']|\.onmessage\s*=/u, 'cross-document message listener', executable);
  forbidPattern(/(?:window|self|globalThis)\.(?:parent|opener)\b/u, 'parent/opener control channel', executable);
  forbidPattern(/Object\.(?:assign|defineProperty)\s*\(\s*(?:window|globalThis)\b/u, 'indirect global control API export', applicationScript);
  forbidPattern(/(?:window|globalThis)\s*\[[^\]]+\]\s*=/u, 'computed global control API export', applicationScript);
  forbidPattern(/\b(?:BroadcastChannel|WebSocket|EventSource|XMLHttpRequest)\b/u, 'external embed control transport', applicationScript);
  forbidPattern(/method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/iu, 'mutating network request', applicationScript);

  const exposedGlobals = [...applicationScript.matchAll(/\b(?:window|globalThis)\.([A-Za-z_$][\w$]*)\s*=/gu)]
    .map(match => match[1])
    .filter(name => name !== '__AI_TREE_DIAGNOSTICS__');
  assert.deepEqual(exposedGlobals, [], 'Embed must not expose a new global control API.');
  requirePattern(/window\.__AI_TREE_DIAGNOSTICS__\s*=\s*Object\.freeze\s*\(/u, 'the only allowed global remains frozen diagnostics', applicationScript);
}

function runResearcherDeliveryGate() {
  requireDirectory(STAGE_ROOT, 'staged site');
  const sourceHtml = readText(SOURCE_HTML_PATH, 'maintained application source');
  const stagedHtml = readText(STAGED_HTML_PATH, 'staged application entrypoint');
  assert.equal(stagedHtml, sourceHtml, 'Staged index.html must be byte-identical to the maintained UI source.');

  const sourceData = readJson(SOURCE_DATA_PATH, 'source canonical dataset').value;
  const stagedData = readJson(STAGED_DATA_PATH, 'staged canonical dataset').value;
  assert.equal(sourceData.nodes.length, EXPECTED_NODE_COUNT, 'Source dataset must retain exactly 339 nodes.');
  assert.equal(sourceData.relationships.length, EXPECTED_RELATIONSHIP_COUNT, 'Source dataset must retain exactly 711 relationships.');
  assert.equal(stagedData.nodes.length, EXPECTED_NODE_COUNT, 'Staged dataset must contain exactly 339 nodes.');
  assert.equal(stagedData.relationships.length, EXPECTED_RELATIONSHIP_COUNT, 'Staged dataset must contain exactly 711 relationships.');
  assert.deepEqual(semanticProjection(stagedData), semanticProjection(sourceData), 'Staged stable IDs or semantic fingerprints differ from source.');

  const releaseManifest = readJson(RELEASE_MANIFEST_PATH, 'staged release manifest').value;
  assert(Array.isArray(releaseManifest.files), 'Release manifest files inventory is missing.');
  const manifestByPath = new Map();
  for (const record of releaseManifest.files) {
    assert.equal(typeof record?.path, 'string', 'Release manifest contains a file without a path.');
    assert(!manifestByPath.has(record.path), `Release manifest contains duplicate path ${record.path}.`);
    manifestByPath.set(record.path, record);
  }

  const cssMatch = sourceHtml.match(/<style>([\s\S]*?)<\/style>/iu);
  assert(cssMatch, 'Inline application stylesheet is missing.');
  const scripts = executableScripts(sourceHtml);
  scripts.forEach((script, index) => new vm.Script(script, { filename: `researcher-delivery-inline-${index + 1}.js` }));
  const applicationScript = scripts.find(script => script.includes('function openPanel('));
  assert(applicationScript, 'Main application script is missing.');
  const functions = namedFunctions(applicationScript);

  const pages = verifyNodePages(stagedData, manifestByPath);
  verifySitemap(stagedData, manifestByPath);
  verifyFingerprintDelivery(sourceData, stagedData, manifestByPath);
  verifyDiffSourceContract(sourceHtml, applicationScript, functions);
  verifyEmbedSourceContract(sourceHtml, cssMatch[1], applicationScript);

  const result = {
    status: 'PASS',
    gate: 'researcher-delivery-v1.2.0',
    nodes: pages.length,
    relationships: stagedData.relationships.length,
    sitemapNodeUrls: stagedData.nodes.length,
    fingerprintBaseline: 'v1.0.0',
    semanticChanges: 0,
    embed: 'read-only'
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

module.exports = { runResearcherDeliveryGate };

if (require.main === module) {
  try {
    runResearcherDeliveryGate();
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
