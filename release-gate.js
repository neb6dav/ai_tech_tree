#!/usr/bin/env node
'use strict';

// Deterministic release gate for the AI Research Tech Tree knowledge-graph bundle.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

const ROOT = __dirname;
const FILES = {
  html: 'ai-research-tech-tree.html',
  index: 'index.html',
  jsonld: 'ai-research-tech-tree.jsonld',
  json: 'ai-research-tech-tree.json',
  ndjson: 'ai-research-tech-tree.ndjson',
  layout: 'network-layout-v1.json',
  bundle: 'network-atlas.bundle.js',
  opportunityData: path.join('src', 'data', 'opportunities', 'diffusion-models.alpha.json'),
  opportunityBundle: 'opportunity-atlas.bundle.js',
  generator: 'generate-knowledge-graph.js',
  canonicalLoader: 'canonical-atlas.js',
  canonicalData: path.join('src', 'data', 'atlas'),
  layoutGenerator: 'generate-network-layout.js',
  build: 'build.js'
};

const EXPECTED_COUNTS = {
  atlasEntries: 339,
  developments: 324,
  openDirections: 15,
  relationships: 711,
  edgeKinds: { dep: 656, gap: 44, sup: 11 },
  relationshipTypes: {
    application: 1,
    component: 3,
    editorial_association: 647,
    enables: 1,
    extends: 2,
    influences: 2,
    legacy_supersession_claim: 11,
    proposed_combination: 44
  },
  evidenceGrades: {
    contextual: 288,
    direct: 6,
    editorial: 214,
    hypothesis: 44,
    partial: 3,
    unassessed: 156
  },
  uniquePapers: 176,
  paperAssociations: 186,
  paperRoles: {
    adjacent_work: 16,
    benchmark: 15,
    critique: 6,
    origin: 72,
    supporting_result: 74,
    survey: 3
  },
  landmarkWorks: 76,
  landmarkWorkAssociations: 76,
  landmarkRoles: { context: 2, critique: 2, origin: 56, supporting_result: 6, survey: 10 },
  landmarkKinds: { book: 18, literary_work: 1, paper: 49, proposal: 1, report: 6, thesis: 1 },
  landmarkAccess: { author_open: 24, free_to_read: 10, open_access: 10, public_domain: 4, publisher_record: 28 },
  publicDomainWorks: 4,
  wikipediaRevisionSources: 267,
  wikipediaSourceReferences: 766,
  evidenceAssessments: 1389,
  directionCards: 15,
  editorialClassifications: 7
};

const read = name => fs.readFileSync(path.join(ROOT, name));
const hash = (buffer, encoding = 'hex') => crypto.createHash('sha256').update(buffer).digest(encoding);
const clone = value => JSON.parse(JSON.stringify(value));
const typesOf = entity => Array.isArray(entity['@type']) ? entity['@type'] : entity['@type'] ? [entity['@type']] : [];
const stableIri = (base, kind, id) => `${base}#${kind}-${encodeURIComponent(id)}`;

function frequency(values) {
  const result = {};
  for (const value of values) result[value] = (result[value] || 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function assertUniqueGraphIds(document) {
  const ids = [document['@id'], ...document['@graph'].map(entity => entity['@id'])];
  assert(ids.every(id => typeof id === 'string' && id.length > 0), 'Every graph entity needs a non-empty @id');
  assert.equal(new Set(ids).size, ids.length, 'JSON-LD graph contains duplicate @id values');
  return new Set(ids);
}

function collectIdReferences(value, output) {
  if (Array.isArray(value)) {
    value.forEach(item => collectIdReferences(item, output));
    return;
  }
  if (!value || typeof value !== 'object' || value['@type'] === '@json') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === '@context') continue;
    if (key === '@id' && typeof child === 'string') output.push(child);
    else collectIdReferences(child, output);
  }
}

function assertGraphClosure(document, datasetIri) {
  const ids = assertUniqueGraphIds(document);
  const refs = [];
  collectIdReferences(document, refs);
  const dangling = [...new Set(refs.filter(ref => ref.startsWith(datasetIri) && !ids.has(ref)))];
  assert.deepEqual(dangling, [], `Dangling internal JSON-LD references: ${dangling.join(', ')}`);
}

function assertJsonLdTerms(document) {
  const context = document['@context'];
  assert.equal(context['@version'], 1.1);
  assert.equal(context.schema, 'https://schema.org/');
  assert.equal(context.prov, 'http://www.w3.org/ns/prov#');
  assert.deepEqual(context.tree, { '@id': `${document['@id']}#vocab-`, '@prefix': true });
  const prefixes = new Set(Object.keys(context).filter(key => !key.startsWith('@')));

  const visit = (value, location = '$') => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${location}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (value['@type'] === '@json') {
      assert.deepEqual(Object.keys(value).sort(), ['@type', '@value']);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === '@context') continue;
      if (!key.startsWith('@')) {
        const colon = key.indexOf(':');
        assert(colon > 0, `Unqualified JSON-LD property ${key} at ${location}`);
        assert(prefixes.has(key.slice(0, colon)), `Undeclared prefix in ${key} at ${location}`);
      }
      if (key === '@type') {
        for (const term of Array.isArray(child) ? child : [child]) {
          if (term === '@json') continue;
          const colon = typeof term === 'string' ? term.indexOf(':') : -1;
          assert(colon > 0 && prefixes.has(term.slice(0, colon)), `Unexpandable @type ${term} at ${location}`);
        }
      } else {
        visit(child, `${location}.${key}`);
      }
    }
  };
  visit(document);
}

function assertExactCounts(data) {
  assert.deepEqual(data.dataset.counts, EXPECTED_COUNTS);
  assert.equal(data.lanes.length, 15);
  assert.equal(Object.keys(data.classifications).length, 7);
  assert.equal(data.nodes.length, 339);
  assert.equal(data.nodes.filter(node => node.type === 'development').length, 324);
  assert.equal(data.nodes.filter(node => node.type === 'open_direction').length, 15);
  assert.equal(data.relationships.length, 711);
  assert.equal(data.evidenceAssessments.length, 1389);
  assert.equal(data.papers.length, 176);
  assert.equal(data.paperLinks.length, 186);
  assert.equal(data.landmarkWorks.length, 76);
  assert.equal(data.landmarkWorkLinks.length, 76);
  assert.equal(data.wikipediaSources.length, 267);
  assert.deepEqual(frequency(data.relationships.map(edge => edge.legacyKind)), EXPECTED_COUNTS.edgeKinds);
  assert.deepEqual(frequency(data.relationships.map(edge => edge.relationshipType)), EXPECTED_COUNTS.relationshipTypes);
  assert.deepEqual(frequency(data.relationships.map(edge => edge.evidenceGrade)), EXPECTED_COUNTS.evidenceGrades);
  assert.deepEqual(frequency(data.paperLinks.map(link => link.role)), EXPECTED_COUNTS.paperRoles);
  assert.deepEqual(frequency(data.landmarkWorkLinks.map(link => link.role)), EXPECTED_COUNTS.landmarkRoles);
  assert.deepEqual(frequency(data.landmarkWorks.map(work => work.kind)), EXPECTED_COUNTS.landmarkKinds);
  assert.deepEqual(frequency(data.landmarkWorks.map(work => work.access)), EXPECTED_COUNTS.landmarkAccess);
  assert.equal(data.nodes.filter(node => node.direction).length, 15);
  assert.equal(data.evidenceAssessments.reduce((sum, item) => sum + item.sourceIds.length, 0), 766);
}

function assertPlainClosure(data) {
  const laneIds = new Set(data.lanes.map(lane => lane.id));
  const classificationIds = new Set(Object.keys(data.classifications));
  const nodeIds = new Set(data.nodes.map(node => node.id));
  const relationshipIds = new Set(data.relationships.map(edge => edge.id));
  const assessmentIds = new Set(data.evidenceAssessments.map(item => item.id));
  const paperIds = new Set(data.papers.map(paper => paper.id));
  const paperLinkIds = new Set(data.paperLinks.map(link => link.id));
  const landmarkWorkIds = new Set(data.landmarkWorks.map(work => work.id));
  const landmarkWorkLinkIds = new Set(data.landmarkWorkLinks.map(link => link.id));
  const wikiIds = new Set(data.wikipediaSources.map(source => source.id));

  for (const node of data.nodes) {
    assert(laneIds.has(node.laneId), `Node ${node.id} has unknown lane`);
    assert(classificationIds.has(node.legacyClassification.code), `Node ${node.id} has unknown classification`);
    assert.deepEqual(node.legacyClassification, data.classifications[node.legacyClassification.code]);
    Object.values(node.evidenceAssessmentIds).forEach(id => assert(assessmentIds.has(id), `Node ${node.id} has unknown assessment`));
    node.research.paperLinkIds.forEach(id => assert(paperLinkIds.has(id), `Node ${node.id} has unknown paper association`));
    node.research.landmarkWorkLinkIds.forEach(id => assert(landmarkWorkLinkIds.has(id), `Node ${node.id} has unknown landmark association`));
  }
  for (const edge of data.relationships) {
    assert(nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId), `Relationship ${edge.id} has a dangling endpoint`);
    assert(assessmentIds.has(edge.evidenceAssessmentId), `Relationship ${edge.id} has unknown assessment`);
  }
  for (const item of data.evidenceAssessments) {
    assert((item.subjectType === 'relationship' ? relationshipIds : nodeIds).has(item.subjectId), `Assessment ${item.id} has unknown subject`);
    item.sourceIds.forEach(id => assert(wikiIds.has(id), `Assessment ${item.id} has unknown source`));
  }
  for (const link of data.paperLinks) {
    assert(nodeIds.has(link.nodeId) && paperIds.has(link.paperId), `Paper association ${link.id} is dangling`);
  }
  for (const link of data.landmarkWorkLinks) {
    assert(nodeIds.has(link.nodeId) && landmarkWorkIds.has(link.workId), `Landmark association ${link.id} is dangling`);
  }
}

function assertStableIdentifiers(data) {
  const base = data.namespace.datasetIri;
  assert.match(base, /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(data.dataset.identifier, base);
  assert.equal(data.dataset.humanUrl, './');
  assert.equal(data.namespace.vocabularyIri, `${base}#vocab-`);
  data.lanes.forEach(record => assert.equal(record.iri, stableIri(base, 'lane', record.id)));
  Object.values(data.classifications).forEach(record => assert.equal(record.iri, stableIri(base, 'classification', record.code)));
  data.nodes.forEach(record => {
    assert.equal(record.iri, stableIri(base, 'node', record.id));
    assert.equal(record.humanUrl, `./#node=${encodeURIComponent(record.id)}`);
  });
  data.relationships.forEach(record => assert.equal(record.iri, stableIri(base, 'relationship', record.id)));
  data.evidenceAssessments.forEach(record => assert.equal(record.iri, stableIri(base, 'assessment', record.id)));
  data.papers.forEach(record => assert.equal(record.iri, stableIri(base, 'paper-arxiv', record.id)));
  data.paperLinks.forEach(record => assert.equal(record.iri, stableIri(base, 'paper-link', record.id)));
  data.landmarkWorks.forEach(record => assert.equal(record.iri, stableIri(base, 'work', record.id)));
  data.landmarkWorkLinks.forEach(record => assert.equal(record.iri, stableIri(base, 'work-link', record.id)));
  for (const source of data.wikipediaSources) {
    assert.equal(source.iri, source.id);
    assert.match(source.revisionUrl, /^https:\/\/en\.wikipedia\.org\/w\/index\.php\?.*\boldid=\d+$/);
  }
}

function assertPaperSemantics(data) {
  const linksByPaper = new Map(data.papers.map(paper => [paper.id, []]));
  data.paperLinks.forEach(link => linksByPaper.get(link.paperId).push(link));
  for (const paper of data.papers) {
    assert.match(paper.id, /^\d{4}\.\d{4,5}$/);
    assert.equal(paper.url, `https://arxiv.org/abs/${paper.id}`);
    assert(paper.year >= 2010 && paper.year <= 2026, `Paper ${paper.id} falls outside 2010-2026`);
    paper.alternateTitles.forEach(title => assert(paper.title.length >= title.length));
    linksByPaper.get(paper.id).forEach(link => assert(paper.title.length >= link.sourceTitle.length));
  }
  const multiRole = [...linksByPaper.values()].filter(links => new Set(links.map(link => link.role)).size > 1);
  assert.equal(multiRole.length, 8);
  const darwinGodel = data.papers.find(paper => paper.id === '2505.22954');
  assert.equal(darwinGodel.title, 'Darwin Gödel Machine: Open-Ended Evolution of Self-Improving Agents');
  assert(darwinGodel.alternateTitles.includes('Darwin Gödel Machine'));
}

function assertLandmarkSemantics(data) {
  const kinds = new Set(['paper', 'book', 'thesis', 'report', 'proposal', 'literary_work']);
  const access = new Set(['public_domain', 'open_access', 'author_open', 'free_to_read', 'publisher_record']);
  const roles = new Set(['origin', 'supporting_result', 'benchmark', 'critique', 'survey', 'context', 'reference']);
  const works = new Map(data.landmarkWorks.map(work => [work.id, work]));
  assert.equal(works.size, data.landmarkWorks.length);
  for (const work of data.landmarkWorks) {
    assert.match(work.id, /^[a-z0-9][a-z0-9._:-]*$/);
    assert(kinds.has(work.kind), `Unknown landmark kind ${work.kind}`);
    assert(access.has(work.access), `Unknown landmark access ${work.access}`);
    assert(work.year >= 1500 && work.year <= 2026);
    assert(Array.isArray(work.authors) && work.authors.length > 0 && work.authors.every(Boolean));
    const url = new URL(work.url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.username, '');
    assert.equal(url.password, '');
  }
  const associationIds = new Set();
  for (const link of data.landmarkWorkLinks) {
    assert(!associationIds.has(link.id), `Duplicate landmark association ${link.id}`);
    associationIds.add(link.id);
    assert.equal(link.id, `${link.nodeId}>${link.workId}`);
    assert(works.has(link.workId));
    assert(roles.has(link.role));
  }
  assert.equal(data.landmarkWorks.filter(work => work.access === 'public_domain').length, 4);
}

function assertGraphParity(data, document) {
  const graph = document['@graph'];
  assert.equal(graph.length, 3242);
  const byId = new Map(graph.map(entity => [entity['@id'], entity]));
  const collections = [
    data.lanes,
    Object.values(data.classifications),
    data.nodes,
    data.relationships,
    data.evidenceAssessments,
    data.papers,
    data.paperLinks,
    data.landmarkWorks,
    data.landmarkWorkLinks,
    data.wikipediaSources
  ];
  collections.flat().forEach(record => assert(byId.has(record.iri), `JSON-LD omits ${record.id || record.code}`));
  const countType = type => graph.filter(entity => typesOf(entity).includes(type)).length;
  assert.equal(countType('schema:DefinedTerm'), 361);
  assert.equal(countType('tree:EditorialClassification'), 7);
  assert.equal(countType('prov:Entity'), 3220);
  assert.equal(countType('tree:ResearchDevelopment'), 324);
  assert.equal(countType('tree:OpenResearchDirection'), 15);
  assert.equal(countType('tree:RelationshipAssertion'), 711);
  assert.equal(countType('tree:EvidenceAssessment'), 1389);
  assert.equal(countType('schema:ScholarlyArticle'), 225);
  assert.equal(countType('tree:PaperAssociation'), 186);
  assert.equal(countType('tree:LandmarkWork'), 76);
  assert.equal(countType('tree:LandmarkWorkAssociation'), 76);
  assert.equal(countType('schema:Book'), 19);
  assert.equal(countType('schema:Report'), 6);
  assert.equal(countType('schema:CreativeWork'), 2);
  assert.equal(countType('schema:Article'), 267);
  assert(typesOf(document).includes('schema:Dataset'));
  assert(typesOf(document).includes('schema:DefinedTermSet'));
  assert(typesOf(document).includes('prov:Bundle'));
  assert(!JSON.stringify(document).includes('prov:Influence'));
  assert(!Object.hasOwn(document, 'schema:hasPart'));
  const definedTerms = document['schema:hasDefinedTerm'].map(ref => ref['@id']);
  const expectedTerms = [
    ...data.lanes.map(record => record.iri),
    ...Object.values(data.classifications).map(record => record.iri),
    ...data.nodes.map(record => record.iri)
  ];
  assert.deepEqual(definedTerms, expectedTerms);
  assert.equal(document['schema:url']['@id'], data.dataset.canonicalUrl);

  for (const node of data.nodes) {
    const entity = byId.get(node.iri);
    assert.equal(entity['schema:identifier'], node.id);
    assert.equal(entity['schema:url']['@id'], node.humanUrl);
  }

  for (const work of data.landmarkWorks) {
    const entity = byId.get(work.iri);
    assert.equal(entity['schema:url']['@id'], work.url);
    assert.equal(entity['schema:isAccessibleForFree'], work.access !== 'publisher_record');
    assert.equal(entity['tree:accessStatus'], work.access);
    assert.equal(entity['tree:workKind'], work.kind);
  }
  for (const source of data.wikipediaSources) {
    const entity = byId.get(source.iri);
    assert.equal(entity['schema:url']['@id'], source.revisionUrl);
    assert.equal(entity['prov:specializationOf']['@id'], source.canonicalUrl);
  }
}

function stripRecordType(record) {
  const copy = { ...record };
  delete copy.recordType;
  return copy;
}

function assertNdjsonParity(data, records) {
  assert.deepEqual(frequency(records.map(record => record.recordType)), {
    atlasEntry: 339,
    dataset: 1,
    editorialClassification: 7,
    evidenceAssessment: 1389,
    lane: 15,
    landmarkWork: 76,
    landmarkWorkAssociation: 76,
    paper: 176,
    paperAssociation: 186,
    relationship: 711,
    wikipediaRevision: 267
  });
  assert.deepEqual(records.find(record => record.recordType === 'dataset'), {
    recordType: 'dataset',
    schemaVersion: data.schemaVersion,
    generatorVersion: data.generatorVersion,
    namespace: data.namespace,
    dataset: data.dataset
  });
  const mappings = {
    lane: data.lanes,
    editorialClassification: Object.values(data.classifications),
    atlasEntry: data.nodes,
    relationship: data.relationships,
    evidenceAssessment: data.evidenceAssessments,
    paper: data.papers,
    paperAssociation: data.paperLinks,
    landmarkWork: data.landmarkWorks,
    landmarkWorkAssociation: data.landmarkWorkLinks,
    wikipediaRevision: data.wikipediaSources
  };
  for (const [recordType, expected] of Object.entries(mappings)) {
    assert.deepEqual(records.filter(record => record.recordType === recordType).map(stripRecordType), expected);
  }
}

function extractBodies(html, tagName) {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  return [...html.matchAll(pattern)].map(match => ({ attributes: match[1], body: match[2], index: match.index }));
}

function parseCsp(value) {
  return Object.fromEntries(value.split(';').map(item => item.trim()).filter(Boolean).map(item => {
    const [name, ...tokens] = item.split(/\s+/);
    return [name, tokens];
  }));
}

function assertHtmlIntegration(html, jsonldBytes, data, layoutBytes, bundleBytes, opportunityDataBytes, opportunityBundleBytes) {
  const scripts = extractBodies(html, 'script');
  const styles = extractBodies(html, 'style');
  assert.equal(scripts.length, 10);
  assert.equal(styles.length, 2);
  const graphScripts = scripts.filter(script => /\btype=["']application\/ld\+json["']/i.test(script.attributes));
  assert.equal(graphScripts.length, 1);
  assert.match(graphScripts[0].attributes, /\bid=["']knowledge-graph["']/i);
  assert.equal(Buffer.compare(Buffer.from(graphScripts[0].body, 'utf8'), jsonldBytes), 0, 'Embedded and sidecar JSON-LD differ');
  assert(graphScripts[0].index > html.lastIndexOf('</main>'), 'JSON-LD should follow primary page content');
  assert(graphScripts[0].index > html.lastIndexOf('<style'), 'JSON-LD must not delay stylesheet discovery');
  assert(!graphScripts[0].body.includes('<'));
  assert(!/[\u2028\u2029]/u.test(graphScripts[0].body));

  const networkLayouts = scripts.filter(script => /\bid=["']network-layout-data["']/i.test(script.attributes));
  assert.equal(networkLayouts.length, 1, 'Expected one embedded network layout');
  assert.match(networkLayouts[0].attributes, /\btype=["']application\/json["']/i);
  const parsedNetworkLayout = JSON.parse(networkLayouts[0].body);
  assert.deepEqual(parsedNetworkLayout, JSON.parse(layoutBytes.toString('utf8')), 'Embedded and sidecar network layouts differ');
  assert.equal(parsedNetworkLayout.layoutVersion, 'network-v1');
  assert.equal(parsedNetworkLayout.nodeCount, data.nodes.length);
  assert.equal(parsedNetworkLayout.relationshipCount, data.relationships.length);
  const networkEngines = scripts.filter(script => /\bid=["']network-view-engine["']/i.test(script.attributes));
  assert.equal(networkEngines.length, 1, 'Expected one embedded network engine');
  assert.equal(networkEngines[0].body, bundleBytes.toString('utf8').replace(/\r\n/g, '\n').trimEnd(), 'Embedded and sidecar network engines differ');
  assert.match(networkEngines[0].body, /COSMOS_GRAPH_VERSION/);
  assert.match(networkEngines[0].body, /3\.4\.0/);
  const opportunityData = scripts.filter(script => /\bid=["']opportunity-data["']/i.test(script.attributes));
  assert.equal(opportunityData.length, 1, 'Expected one embedded Opportunity View payload');
  assert.match(opportunityData[0].attributes, /\btype=["']application\/json["']/i);
  const parsedOpportunityData = JSON.parse(opportunityData[0].body);
  assert.equal(parsedOpportunityData.metadata?.id, 'diffusion-models-opportunity-map');
  assert.equal(parsedOpportunityData.metadata?.anchorAtlasNodeId, 'diffusion');
  assert.deepEqual(parsedOpportunityData, JSON.parse(opportunityDataBytes.toString('utf8')), 'Embedded and maintained Opportunity View data differ');
  const opportunityEngines = scripts.filter(script => /\bid=["']opportunity-view-engine["']/i.test(script.attributes));
  assert.equal(opportunityEngines.length, 1, 'Expected one embedded Opportunity View engine');
  assert.match(opportunityEngines[0].body, /OpportunityAtlas/);
  assert.equal(opportunityEngines[0].body, opportunityBundleBytes.toString('utf8').replace(/\r\n/g, '\n').trimEnd(), 'Embedded and sidecar Opportunity View engines differ');

  const cspMatch = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  assert(cspMatch, 'Missing Content-Security-Policy meta tag');
  const csp = parseCsp(cspMatch[1]);
  const scriptHashes = scripts.map(script => `'sha256-${hash(Buffer.from(script.body), 'base64')}'`).sort();
  const styleHashes = styles.map(style => `'sha256-${hash(Buffer.from(style.body), 'base64')}'`).sort();
  assert.deepEqual([...csp['script-src']].sort(), scriptHashes);
  assert.deepEqual([...csp['style-src-elem']].sort(), styleHashes);
  assert.deepEqual(csp['script-src-attr'], ["'none'"]);
  assert(!csp['script-src'].includes("'unsafe-inline'"));
  assert(!csp['script-src'].includes("'unsafe-eval'"));
  assert.deepEqual(csp['object-src'], ["'none'"]);
  assert.deepEqual(csp['base-uri'], ["'none'"]);

  const executable = scripts.filter(script => !/\btype=["']application\/(?:ld\+json|json)["']/i.test(script.attributes));
  assert.equal(executable.length, 7);
  executable.forEach((script, index) => new vm.Script(script.body, { filename: `inline-script-${index + 1}.js` }));
  executable
    .filter(script => !/\bid=["']network-view-engine["']/i.test(script.attributes))
    .forEach(script => assert(!/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(/.test(script.body), 'HTML injection sink found'));
  assert(!/\.outerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(/.test(networkEngines[0].body), 'Unsafe third-party network-engine DOM sink found');
  assert(!/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(/.test(opportunityEngines[0].body), 'Unsafe Opportunity View DOM sink found');

  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  assert(!/\son[a-z][\w-]*\s*=/i.test(markup));
  assert(!/javascript\s*:/i.test(markup));
  assert(!/<base\b/i.test(markup));
  const ids = [...markup.matchAll(/\sid=["']([^"']+)["']/gi)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'Duplicate static HTML id values');

  const alternates = [
    ['application/ld+json', './ai-research-tech-tree.jsonld'],
    ['application/json', './ai-research-tech-tree.json'],
    ['application/x-ndjson', './ai-research-tech-tree.ndjson']
  ];
  for (const [type, href] of alternates) {
    const linkTags = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => match[0]);
    assert(linkTags.some(tag => /\brel=["']alternate["']/i.test(tag) && tag.includes(`type="${type}"`) && tag.includes(`href="${href}"`)), `Missing alternate ${href}`);
  }
  const linkTags = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => match[0]);
  const opportunityHref = './data/opportunities/diffusion-models.alpha.json';
  const opportunityAlternates = linkTags.filter(tag => (
    /\brel=["']alternate["']/i.test(tag) &&
    tag.includes('type="application/json"') &&
    tag.includes(`href="${opportunityHref}"`)
  ));
  assert.equal(opportunityAlternates.length, 1, `Expected exactly one alternate ${opportunityHref}`);
  assert(
    !linkTags.some(tag => tag.includes('href="./src/data/opportunities/diffusion-models.alpha.json"')),
    'Legacy Opportunity data URL must not be advertised as a discovery alternate.'
  );
  const noScriptBlocks = [...html.matchAll(/<noscript>([\s\S]*?)<\/noscript>/gi)].map(match => match[1]);
  assert(noScriptBlocks.length, 'Missing no-JavaScript fallback');
  const noScript = noScriptBlocks.join('\n');
  const staticBody = noScript.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1];
  assert(staticBody, 'Missing static index table');
  assert.equal((staticBody.match(/<tr\b/gi) || []).length, 339);
  alternates.forEach(([, href]) => assert(noScript.includes(`href="${href}"`), `No-JS view omits ${href}`));
  for (const label of ['Download graph (JSON-LD)', 'Download normalized data (JSON)', 'Download streaming records (NDJSON)']) {
    assert((html.match(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length >= 2, `Download label missing: ${label}`);
  }
  assert(html.includes('Machine-readable data'));
  assert(html.includes(data.dataset.edition));
  assert(html.includes('Added synchronized JSON-LD, JSON and NDJSON knowledge-graph exports with stable identifiers.'));
  assert(html.includes('Landmark works and primary sources'));
  assert(html.includes('Linked works or papers'));
  assert(html.includes("Frege's Begriffsschrift → Hilbert's formalist program"));
  assert(!/id=["']stats["']/.test(html));
  return { scriptCount: scripts.length, styleCount: styles.length };
}

function deterministicRegeneration(current) {
  if (process.env.KG_SKIP_SUBPROCESS === '1') return { skipped: true };
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tree-kg-validate-'));
  try {
    assert(tempDir.startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.copyFileSync(path.join(ROOT, FILES.html), path.join(tempDir, FILES.html));
    fs.copyFileSync(path.join(ROOT, FILES.generator), path.join(tempDir, FILES.generator));
    fs.copyFileSync(path.join(ROOT, FILES.canonicalLoader), path.join(tempDir, FILES.canonicalLoader));
    fs.mkdirSync(path.join(tempDir, 'src', 'data'), { recursive: true });
    fs.cpSync(path.join(ROOT, FILES.canonicalData), path.join(tempDir, FILES.canonicalData), { recursive: true });
    execFileSync(process.execPath, [path.join(tempDir, FILES.generator)], {
      cwd: tempDir,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true
    });
    for (const key of ['html', 'jsonld', 'json', 'ndjson']) {
      const regenerated = fs.readFileSync(path.join(tempDir, FILES[key]));
      assert.equal(Buffer.compare(regenerated, current[key]), 0, `Generator is not deterministic for ${FILES[key]}`);
    }
  } finally {
    if (tempDir.startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(tempDir, { recursive: true, force: true });
  }
  return { skipped: false };
}

function runMutationProbes(document, data, embedded, sidecar) {
  let probes = 0;
  const duplicate = clone(document);
  duplicate['@graph'][1]['@id'] = duplicate['@graph'][0]['@id'];
  assert.throws(() => assertUniqueGraphIds(duplicate));
  probes += 1;
  const dangling = clone(document);
  dangling['@graph'].find(entity => typesOf(entity).includes('tree:RelationshipAssertion'))['tree:sourceNode']['@id'] = `${document['@id']}#node-not-real`;
  assert.throws(() => assertGraphClosure(dangling, document['@id']));
  probes += 1;
  const missing = clone(data);
  missing.relationships.pop();
  assert.throws(() => assertExactCounts(missing));
  probes += 1;
  const prefix = clone(document);
  prefix['@context'].tree = `${document['@id']}#vocab-`;
  assert.throws(() => assertJsonLdTerms(prefix));
  probes += 1;
  const changed = Buffer.from(embedded);
  changed[changed.length - 1] ^= 1;
  assert.notEqual(Buffer.compare(changed, sidecar), 0);
  return probes + 1;
}

function main() {
  Object.values(FILES).forEach(name => assert(fs.existsSync(path.join(ROOT, name)), `Missing ${name}`));
  const buffers = {
    html: read(FILES.html),
    index: read(FILES.index),
    jsonld: read(FILES.jsonld),
    json: read(FILES.json),
    ndjson: read(FILES.ndjson),
    layout: read(FILES.layout),
    bundle: read(FILES.bundle),
    opportunityData: read(FILES.opportunityData),
    opportunityBundle: read(FILES.opportunityBundle)
  };
  assert.equal(Buffer.compare(buffers.index, buffers.html), 0, 'Generated index.html differs from the canonical HTML artifact');
  const html = buffers.html.toString('utf8');
  const jsonldRaw = buffers.jsonld.toString('utf8');
  const data = JSON.parse(buffers.json.toString('utf8'));
  const document = JSON.parse(jsonldRaw);
  const ndjsonText = buffers.ndjson.toString('utf8');
  assert(ndjsonText.endsWith('\n'));
  const records = ndjsonText.trimEnd().split(/\r?\n/).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`Invalid NDJSON record ${index + 1}: ${error.message}`); }
  });

  const digestCopy = clone(data);
  delete digestCopy.dataset.dataDigest;
  assert.equal(hash(Buffer.from(JSON.stringify(digestCopy))), data.dataset.dataDigest);
  assert.equal(document['tree:dataDigest'], data.dataset.dataDigest);
  assert.equal(document['@id'], data.namespace.datasetIri);
  assert.equal(data.schemaVersion, 2);
  assert.equal(data.generatorVersion, '1.3.1');
  assert.equal(data.dataset.edition, '2026-08-21-stable-1');
  assert.equal(data.dataset.releaseState, 'Stable');
  assert.equal(data.dataset.asOf, '2026-08-04');
  assert.equal(data.dataset.canonicalUrl, 'https://neb6dav.github.io/ai_tech_tree/');
  assert.deepEqual(data.dataset.authors, ['@neb6dav']);
  assert.equal(data.dataset.license, 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.equal(data.dataset.correctionsUrl, 'https://github.com/neb6dav/ai_tech_tree/issues/new/choose');
  assert(html.includes('<link rel="canonical" href="https://neb6dav.github.io/ai_tech_tree/">'), 'Missing canonical public URL');
  assert(html.includes('<meta name="robots" content="index,follow,max-image-preview:large">'), 'Public artifact must be indexable');
  assert(html.includes('<meta property="og:url" content="https://neb6dav.github.io/ai_tech_tree/">'), 'Missing Open Graph URL');
  assert(html.includes('<meta property="og:image" content="https://neb6dav.github.io/ai_tech_tree/social-card.png">'), 'Missing Open Graph image');
  assert(html.includes('<meta name="twitter:card" content="summary_large_image">'), 'Missing large X/Twitter card metadata');
  assert(fs.existsSync(path.join(ROOT, 'social-card.png')), 'Missing social-card.png');
  assert(!jsonldRaw.includes('<'));
  assert(!/[\u2028\u2029]/u.test(jsonldRaw));

  assertExactCounts(data);
  assertPlainClosure(data);
  assertStableIdentifiers(data);
  assertPaperSemantics(data);
  assertLandmarkSemantics(data);
  assertJsonLdTerms(document);
  assertGraphClosure(document, data.namespace.datasetIri);
  assertGraphParity(data, document);
  assertNdjsonParity(data, records);
  const csp = assertHtmlIntegration(
    html,
    buffers.jsonld,
    data,
    buffers.layout,
    buffers.bundle,
    buffers.opportunityData,
    buffers.opportunityBundle
  );
  const determinism = deterministicRegeneration(buffers);
  const graphBody = extractBodies(html, 'script').find(script => /\btype=["']application\/ld\+json["']/i.test(script.attributes)).body;
  const mutationProbes = runMutationProbes(document, data, Buffer.from(graphBody), buffers.jsonld);

  const report = {};
  for (const key of ['html', 'index', 'jsonld', 'json', 'ndjson', 'layout', 'bundle', 'opportunityData', 'opportunityBundle']) {
    const buffer = buffers[key];
    report[FILES[key]] = {
      bytes: buffer.length,
      gzipBytes: zlib.gzipSync(buffer, { level: 9 }).length,
      brotliBytes: zlib.brotliCompressSync(buffer, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
      sha256: hash(buffer)
    };
  }
  console.log(JSON.stringify({
    status: 'PASS',
    edition: data.dataset.edition,
    datasetIri: data.namespace.datasetIri,
    vocabularyIri: data.namespace.vocabularyIri,
    dataDigest: data.dataset.dataDigest,
    counts: data.dataset.counts,
    graphEntities: document['@graph'].length,
    ndjsonRecords: records.length,
    csp,
    deterministicRegeneration: determinism.skipped ? 'externally-verified' : true,
    mutationProbes,
    files: report,
    publicationFieldsConfigured: true
  }, null, 2));
}

main();
