#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadCanonicalAtlas } = require('../canonical-atlas.js');
const { buildExports, safeJson } = require('../generate-knowledge-graph.js');

const ROOT = path.resolve(__dirname, '..');
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const TEMPLATE = path.join(ROOT, 'src', 'workspace', 'shell.html');
const INDEX = path.join(ROOT, 'index.html');
const COMPAT = path.join(ROOT, 'ai-research-tech-tree.html');
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function readRequired(file) {
  if (!fs.existsSync(file)) throw new Error(`workspace build input is missing: ${path.relative(ROOT, file)}`);
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function injectPayload(shell, payload) {
  const pattern = /<script\b(?=[^>]*\bid=["']atlas-data["'])([^>]*)>[\s\S]*?<\/script>/gi;
  const matches = [...shell.matchAll(pattern)];
  if (matches.length === 0) {
    return `${shell}\n<script id="atlas-data" type="application/json">${safeJson(payload)}</script>`;
  }
  if (matches.length !== 1) throw new Error(`workspace shell must contain exactly one #atlas-data script, found ${matches.length}`);
  const attrs = matches[0][1];
  if (!/\btype=["']application\/json["']/i.test(attrs)) throw new Error('#atlas-data must use type="application/json"');
  const start = matches[0].index;
  return `${shell.slice(0, start)}<script id="atlas-data" type="application/json">${safeJson(payload)}</script>${shell.slice(start + matches[0][0].length)}`;
}

function assembleDocument(shell, payload) {
  const css = readRequired(path.join(ROOT, 'src', 'workspace', 'workspace.css'));
  const logic = readRequired(path.join(ROOT, 'src', 'workspace', 'graph-state.js'));
  const app = readRequired(path.join(ROOT, 'src', 'workspace', 'workspace.js'));
  const dataset = payload.dataset;
  const namespace = payload.namespace || {};
  const catalog = payload.catalog || {};
  const project = catalog.project || {};
  const noScript = '<style>.workspace{display:none!important}body{overflow:auto!important;background:#fff!important;color:#111!important}noscript{display:block!important}noscript section{max-width:72rem;margin:1rem auto;padding:1rem;font:16px/1.5 system-ui,sans-serif}noscript ul{columns:18rem;column-gap:2rem}noscript li{break-inside:avoid;margin:.2rem 0}noscript a{color:#0645ad}</style><section><h2>AI Research Tech Tree</h2><p>JavaScript is disabled. Browse the canonical node pages:</p><ul>' +
    payload.nodes.map(node => `<li><a href="./nodes/${encodeURIComponent(node.id)}/">${escapeHtml(node.title || node.id)}</a></li>`).join('') +
    '</ul></section>';
  const jsonld = {
    '@context': { schema: 'https://schema.org/', tree: 'https://neb6dav.github.io/ai_tech_tree/vocab#' },
    '@id': dataset.identifier || dataset.canonicalUrl,
    '@type': 'schema:Dataset',
    'schema:name': project.title || 'AI Research Tech Tree',
    'schema:url': dataset.canonicalUrl,
    'tree:dataDigest': dataset.dataDigest,
    'tree:vocabulary': namespace.vocabularyIri,
    'schema:distribution': [
      { '@type': 'schema:DataDownload', 'schema:encodingFormat': 'application/ld+json', 'schema:contentUrl': './ai-research-tech-tree.jsonld' },
      { '@type': 'schema:DataDownload', 'schema:encodingFormat': 'application/json', 'schema:contentUrl': './ai-research-tech-tree.json' },
      { '@type': 'schema:DataDownload', 'schema:encodingFormat': 'application/x-ndjson', 'schema:contentUrl': './ai-research-tech-tree.ndjson' }
    ]
  };
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n' + `<meta name="ai-tree-version" content="${APP_VERSION}">\n<meta name="ai-tree-release-state" content="Preview">\n` +
    `<title>${String(project.title || 'AI Research Tech Tree').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>\n` +
    `<meta name="description" content="Curated AI research atlas with ${dataset.counts?.atlasEntries || payload.nodes.length} recorded entries and ${dataset.counts?.relationships || payload.relationships.length} relationships.">\n` +
    '<meta name="robots" content="index,follow,max-image-preview:large">\n' +
    '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Crect width=%2240%22 height=%2240%22 rx=%228%22 fill=%22%23b34319%22/%3E%3Cpath d=%22M10 10L20 20L30 10M20 20V31%22 fill=%22none%22 stroke=%22%23fffdf9%22 stroke-width=%224%22/%3E%3C/svg%3E">\n' +
    '<link rel="canonical" href="https://neb6dav.github.io/ai_tech_tree/">\n' +
    '<meta property="og:url" content="https://neb6dav.github.io/ai_tech_tree/">\n' +
    '<meta property="og:title" content="AI Research Tech Tree">\n' +
    `<meta property="og:description" content="Curated AI research atlas with ${payload.nodes.length} recorded entries and ${payload.relationships.length} relationships.">\n` +
    '<meta property="og:image" content="https://neb6dav.github.io/ai_tech_tree/social-card.png">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<link rel="alternate" type="application/ld+json" href="./ai-research-tech-tree.jsonld">\n' +
    '<link rel="alternate" type="application/json" href="./ai-research-tech-tree.json">\n' +
    '<link rel="alternate" type="application/x-ndjson" href="./ai-research-tech-tree.ndjson">\n' +
    '<link rel="alternate" type="application/json" href="./data/opportunities/diffusion-models.alpha.json">\n' +
    '<style>\n' + css + '\n</style>\n</head>\n<body>\n' +
    injectPayload(shell, payload) + '\n' +
    `<script id="knowledge-graph" type="application/ld+json">${safeJson(jsonld)}</script>\n` +
    `<script id="atlas-logic">${logic}</script>\n` +
    `<script id="atlas-app">${app}</script>\n` +
    `<noscript>${noScript}</noscript>\n` +
    '</body>\n</html>\n';
}

function validateEvidencePilot(pilot, canonical) {
  if (!pilot) return;
  if (pilot.reviewState !== 'pending_curator_review' || pilot.aiAssisted !== true) throw new Error('evidence pilot must remain explicitly pending curator review and AI-assisted');
  const keys = new Set(canonical.relationships.map(edge => edge.key));
  const transformerKeys = new Set(canonical.relationships.filter(edge => edge.sourceNodeId === 'transformer' || edge.targetNodeId === 'transformer').map(edge => edge.key));
  if (pilot.relationships?.length !== 22 || transformerKeys.size !== 22) throw new Error('evidence pilot must cover exactly 22 Transformer relationships');
  const seen = new Set();
  const sourceIds = new Set((pilot.sources || []).map(source => source.id));
  for (const record of pilot.relationships) {
    if (!transformerKeys.has(record.relationshipKey) || seen.has(record.relationshipKey)) throw new Error(`evidence pilot relationship key is not an exact Transformer edge: ${record.relationshipKey}`);
    seen.add(record.relationshipKey);
    if (record.reviewState !== 'pending_curator_review') throw new Error(`evidence pilot review state changed: ${record.relationshipKey}`);
    for (const id of record.sourceIds || []) if (!sourceIds.has(id)) throw new Error(`evidence pilot references unknown source: ${id}`);
  }
  if (seen.size !== 22) throw new Error('evidence pilot relationship coverage is incomplete');
  const nodeIds = new Set(canonical.nodes.map(node => node.id));
  for (const step of pilot.tour?.steps || []) {
    if (!nodeIds.has(step.nodeId)) throw new Error(`evidence pilot tour references unknown node: ${step.nodeId}`);
    if (step.relationshipKey && !keys.has(step.relationshipKey)) throw new Error(`evidence pilot tour references unknown edge: ${step.relationshipKey}`);
  }
}

function main() {
  const canonical = loadCanonicalAtlas();
  const { plain } = buildExports(canonical.legacyModel);
  const payload = {
    dataset: plain.dataset,
    namespace: plain.namespace,
    nodes: canonical.nodes,
    relationships: canonical.relationships,
    catalog: canonical.catalog,
    presentation: JSON.parse(readRequired(path.join(ROOT, 'src', 'ui', 'atlas-presentation.v1.json'))),
    opportunity: JSON.parse(readRequired(path.join(ROOT, 'src', 'data', 'opportunities', 'diffusion-models.alpha.json')))
  };
  const pilot = path.join(ROOT, 'src', 'research', 'transformer-evidence-pilot.json');
  if (fs.existsSync(pilot)) {
    payload.evidencePilot = JSON.parse(fs.readFileSync(pilot, 'utf8'));
    validateEvidencePilot(payload.evidencePilot, canonical);
  }
  const html = assembleDocument(readRequired(TEMPLATE), payload);
  fs.writeFileSync(INDEX, html, 'utf8');
  fs.copyFileSync(path.join(ROOT, 'src', 'compatibility', 'ai-research-tech-tree.html'), COMPAT);
  console.log(JSON.stringify({ status: 'WORKSPACE_BUILT', html: path.basename(COMPAT), index: path.basename(INDEX), nodes: payload.nodes.length, relationships: payload.relationships.length }, null, 2));
}

if (require.main === module) main();
module.exports = { injectPayload, assembleDocument, validateEvidencePilot };
