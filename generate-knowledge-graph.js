'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML_NAME = 'ai-research-tech-tree.html';
const JSONLD_NAME = 'ai-research-tech-tree.jsonld';
const JSON_NAME = 'ai-research-tech-tree.json';
const NDJSON_NAME = 'ai-research-tech-tree.ndjson';
const APPLICATION_HUMAN_URL = './';
const GENERATOR_VERSION = '1.3.1';
const DATASET_UUID = uuidV5('ai-research-tech-tree.public-artifact', '6ba7b810-9dad-11d1-80b4-00c04fd430c8');
const DATASET_IRI = `urn:uuid:${DATASET_UUID}`;
const VOCAB_IRI = `${DATASET_IRI}#vocab-`;

const root = __dirname;
const htmlPath = path.join(root, HTML_NAME);
const jsonLdPath = path.join(root, JSONLD_NAME);
const jsonPath = path.join(root, JSON_NAME);
const ndjsonPath = path.join(root, NDJSON_NAME);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function uuidV5(name, namespace) {
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  assert(namespaceBytes.length === 16, 'UUID namespace must be 16 bytes');
  const bytes = crypto.createHash('sha1').update(namespaceBytes).update(name, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function unique(values) {
  return [...new Set(values)];
}

function countBy(values, keyFn = value => value) {
  const result = {};
  for (const value of values) {
    const key = keyFn(value);
    result[key] = (result[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => compareText(a, b)));
}

function scriptsIn(html) {
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
}

function iri(kind, identifier) {
  return `${DATASET_IRI}#${kind}-${encodeURIComponent(identifier)}`;
}

function idRef(identifier) {
  return { '@id': identifier };
}

function jsonLiteral(value) {
  return { '@value': value, '@type': '@json' };
}

function omitEmpty(object) {
  for (const key of Object.keys(object)) {
    const value = object[key];
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) delete object[key];
  }
  return object;
}

function extractModel(html) {
  const scripts = scriptsIn(html);
  assert(scripts.length === 10, `Expected 10 script elements, found ${scripts.length}`);
  const findScript = (description, predicate) => {
    const matches = scripts.filter(predicate);
    assert(matches.length === 1, `Expected exactly one ${description} script, found ${matches.length}`);
    return matches[0][1];
  };
  findScript('JSON-LD knowledge graph', script => /^<script\b[^>]*\btype="application\/ld\+json"[^>]*>/i.test(script[0]));
  const atlasData = findScript('atlas data', script => /const\s+NODES\s*=\s*\[\]/.test(script[1]));
  const wikipediaAudit = findScript('Wikipedia audit data', script => /^<script\b[^>]*\bid="wiki-audit-data"[^>]*>/i.test(script[0]));
  const researchGuide = findScript('research guide data', script => /^<script\b[^>]*\bid="research-guide-data"[^>]*>/i.test(script[0]));
  const opportunityData = findScript('opportunity data', script => /^<script\b[^>]*\bid="opportunity-data"[^>]*>/i.test(script[0]));
  findScript('opportunity view engine', script => /^<script\b[^>]*\bid="opportunity-view-engine"[^>]*>/i.test(script[0]));
  const networkLayout = findScript('network layout data', script => /^<script\b[^>]*\bid="network-layout-data"[^>]*>/i.test(script[0]));
  findScript('network view engine', script => /^<script\b[^>]*\bid="network-view-engine"[^>]*>/i.test(script[0]));
  assert(/^<script\b[^>]*\btype="application\/json"[^>]*>/i.test(scripts.find(script => script[1] === networkLayout)[0]), 'Network layout script must use application/json');
  assert(/^<script\b[^>]*\btype="application\/json"[^>]*>/i.test(scripts.find(script => script[1] === opportunityData)[0]), 'Opportunity data script must use application/json');
  const parsedOpportunityData = JSON.parse(opportunityData || '{}');
  assert(parsedOpportunityData.metadata?.id === 'diffusion-models-opportunity-map', 'Opportunity data is missing metadata.id=diffusion-models-opportunity-map');
  assert(parsedOpportunityData.metadata?.anchorAtlasNodeId === 'diffusion', 'Opportunity data is missing its diffusion atlas anchor');
  const parsedNetworkLayout = JSON.parse(networkLayout || '{}');
  assert(parsedNetworkLayout.layoutVersion === 'network-v1', 'Network layout data is missing layoutVersion=network-v1');
  const engine = findScript('atlas engine', script => script[1].includes('/* ---------- layout ---------- */'));

  const warnings = [];
  const safeConsole = {
    log() {},
    info() {},
    debug() {},
    warn(...args) { warnings.push(args.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ')); },
    error(...args) { warnings.push(args.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ')); }
  };
  const context = vm.createContext({ URL, console: safeConsole });
  vm.runInContext(atlasData, context, { filename: 'atlas-data.js' });
  vm.runInContext(wikipediaAudit, context, { filename: 'wikipedia-audit.js' });
  vm.runInContext(researchGuide, context, { filename: 'research-guide.js' });
  const layoutAt = engine.indexOf('/* ---------- layout ---------- */');
  assert(layoutAt >= 0, 'Engine layout marker not found');
  const opportunityAt = engine.indexOf('/* ---------- time-oriented capability and opportunity graph ---------- */');
  assert(opportunityAt >= 0, 'Opportunity engine marker not found');
  const networkAt = engine.indexOf('/* ---------- deterministic 2-D relationship network ---------- */');
  const extractionAt = Math.min(opportunityAt, networkAt >= 0 ? networkAt : Infinity, layoutAt);
  const exportCode = `
    ;globalThis.__KG_MODEL__={
      project:PROJECT_META,
      lanes:LANES,
      classifications:STATUS,
      nodes:NODES.map(nd=>({
        id:nd.id,title:nd.t,year:nd.y,laneId:nd.lane,classificationCode:nd.s,description:nd.d,
        dateOverride:DATE_OVERRIDES[nd.id]||null,
        statusProfile:statusProfileFor(nd),
        audit:nodeAuditById.get(nd.id),
        auditRecordPresent:{
          development:Object.prototype.hasOwnProperty.call(RAW_AUDIT_NODES[nd.id]||{},'development'),
          mapStatus:Object.prototype.hasOwnProperty.call(RAW_AUDIT_NODES[nd.id]||{},'mapStatus')
        },
        research:researchById.get(nd.id),
        questions:nodeQuestions(nd),
        direction:DIRECTION_GUIDE[nd.id]||null,
        claimFingerprint:AUDIT_NODE_FINGERPRINTS[nd.id]
      })),
      relationships:EDGES.map(edge=>{
        const key=edgeAuditKey(edge),meta=structuralEdgeMeta(edge),audit=edgeAuditByKey.get(key);
        return {key,sourceNodeId:edge.a,targetNodeId:edge.b,legacyKind:edge.t,relationshipType:meta.type,rationale:meta.rationale,reviewed:meta.reviewed,evidenceGrade:edgeEvidenceGrade(edge),audit,auditRecordPresent:Object.prototype.hasOwnProperty.call(RAW_AUDIT_EDGES,key),claimFingerprint:AUDIT_EDGE_FINGERPRINTS[key]};
      }),
      researchExtensionEdgeKeys:AUDIT_VALIDATION.researchExtensionEdgeKeys,
      auditSummary:AUDIT_SUMMARY,
      researchSummary:RESEARCH_SUMMARY,
      graphValidation:GRAPH_VALIDATION,
      auditHasWarnings,
      auditValidation:AUDIT_VALIDATION,
      researchValidation:RESEARCH_VALIDATION,
      researchReviewQueue:RESEARCH_REVIEW_QUEUE,
      compositeDateReviewIds:COMPOSITE_DATE_REVIEW_IDS
    };
  `;
  vm.runInContext(engine.slice(0, extractionAt) + exportCode, context, { filename: 'atlas-engine-prefix.js' });
  assert(warnings.length === 0, `Atlas emitted validation warnings: ${warnings.join(' | ')}`);
  return clone(context.__KG_MODEL__);
}

function buildExports(model) {
  assert(model.nodes.length === 339, `Expected 339 atlas entries, found ${model.nodes.length}`);
  assert(model.relationships.length === 711, `Expected 711 relationships, found ${model.relationships.length}`);
  assert(model.graphValidation.issues.length === 0 && model.graphValidation.warnings.length === 0, 'Graph validation is not clean');
  assert(model.auditHasWarnings === false, 'Evidence validation is not clean');
  assert(model.compositeDateReviewIds.length === 0, 'Composite chronology review queue is not empty');
  assert(model.researchReviewQueue.defaultedPaperRoles.length === 0, 'Defaulted paper roles remain');
  for (const [name, values] of Object.entries(model.researchValidation)) assert(values.length === 0, `Research validation queue ${name} is not empty`);
  for (const name of ['staleNodeFingerprintIds', 'staleEdgeFingerprintKeys', 'missingNodeFingerprintIds', 'missingEdgeFingerprintKeys']) {
    assert(model.auditValidation[name].length === 0, `Audit validation queue ${name} is not empty`);
  }

  const nodeIds = new Set(model.nodes.map(node => node.id));
  assert(nodeIds.size === model.nodes.length, 'Duplicate node identifiers in normalized model');
  const relationshipKeys = new Set(model.relationships.map(edge => edge.key));
  assert(relationshipKeys.size === model.relationships.length, 'Duplicate relationship keys in normalized model');

  const wikiRegistry = new Map();
  function registerWikiSource(source) {
    assert(source && /^https:\/\/en\.wikipedia\.org\/w\/index\.php\?/.test(source.revisionUrl || ''), `Wikipedia source lacks a stable revision URL: ${JSON.stringify(source)}`);
    assert(/^https:\/\/en\.wikipedia\.org\/wiki\//.test(source.canonicalUrl || ''), `Wikipedia source lacks a canonical article URL: ${JSON.stringify(source)}`);
    const key = source.revisionUrl;
    let record = wikiRegistry.get(key);
    if (!record) {
      record = { iri: key, titles: new Set(), canonicalUrls: new Set(), checkedAt: new Set(), sections: new Set() };
      wikiRegistry.set(key, record);
    }
    record.titles.add(source.title);
    record.canonicalUrls.add(source.canonicalUrl);
    if (source.checkedAt) record.checkedAt.add(source.checkedAt);
    if (source.section) record.sections.add(source.section);
    return key;
  }
  function normalizeAssessment(claim) {
    return {
      state: claim.state,
      confidence: claim.confidence,
      note: claim.note,
      sourceIds: unique((claim.sources || []).map(registerWikiSource))
    };
  }

  const paperRegistry = new Map();
  const paperLinks = [];
  const paperLinkKeys = new Set();
  function arxivId(url) {
    const match = /^https:\/\/arxiv\.org\/abs\/(.+)$/.exec(url || '');
    assert(match, `Invalid ArXiv abstract URL: ${url}`);
    return match[1];
  }
  for (const node of model.nodes) {
    for (const source of node.research.sources || []) {
      const identifier = arxivId(source.url);
      let paper = paperRegistry.get(source.url);
      if (!paper) {
        paper = { id: identifier, iri: iri('paper-arxiv', identifier), url: source.url, years: new Set(), titles: new Set() };
        paperRegistry.set(source.url, paper);
      }
      paper.years.add(source.year);
      paper.titles.add(source.title);
      const linkKey = `${node.id}>${identifier}`;
      assert(!paperLinkKeys.has(linkKey), `Duplicate node-paper association: ${linkKey}`);
      paperLinkKeys.add(linkKey);
      paperLinks.push({
        id: linkKey,
        iri: iri('paper-link', linkKey),
        nodeId: node.id,
        nodeIri: iri('node', node.id),
        paperId: identifier,
        paperIri: paper.iri,
        role: source.role,
        roleExplicit: source.roleExplicit,
        sourceTitle: source.title
      });
    }
  }

  const papers = [...paperRegistry.values()].map(record => {
    assert(record.years.size === 1, `Conflicting years for ${record.url}`);
    const titles = [...record.titles].sort((a, b) => b.length - a.length || compareText(a, b));
    return {
      id: record.id,
      iri: record.iri,
      title: titles[0],
      alternateTitles: titles.slice(1).sort(compareText),
      url: record.url,
      year: [...record.years][0]
    };
  }).sort((a, b) => compareText(a.id, b.id));

  const landmarkRegistry = new Map();
  const landmarkWorkLinks = [];
  const landmarkLinkKeys = new Set();
  for (const node of model.nodes) {
    for (const source of node.research.works || []) {
      const normalized = {
        id: source.id,
        iri: iri('work', source.id),
        title: source.title,
        url: source.url,
        year: source.year,
        kind: source.kind,
        access: source.access,
        authors: source.authors,
        note: source.note
      };
      const existing = landmarkRegistry.get(source.id);
      if (existing) assert(JSON.stringify(existing) === JSON.stringify(normalized), `Conflicting landmark metadata for ${source.id}`);
      else landmarkRegistry.set(source.id, normalized);
      const linkKey = `${node.id}>${source.id}`;
      assert(!landmarkLinkKeys.has(linkKey), `Duplicate node-landmark association: ${linkKey}`);
      landmarkLinkKeys.add(linkKey);
      landmarkWorkLinks.push({
        id: linkKey,
        iri: iri('work-link', linkKey),
        nodeId: node.id,
        nodeIri: iri('node', node.id),
        workId: source.id,
        workIri: normalized.iri,
        role: source.role
      });
    }
  }
  const landmarkWorks = [...landmarkRegistry.values()].sort((a, b) => compareText(a.id, b.id));

  const linksByNode = new Map(model.nodes.map(node => [node.id, []]));
  const landmarkLinksByNode = new Map(model.nodes.map(node => [node.id, []]));
  for (const link of paperLinks) linksByNode.get(link.nodeId).push(link.id);
  for (const link of landmarkWorkLinks) landmarkLinksByNode.get(link.nodeId).push(link.id);
  const researchExtensionKeys = new Set(model.researchExtensionEdgeKeys);

  const lanes = model.lanes.map(lane => ({ id: lane.id, iri: iri('lane', lane.id), label: lane.n }));
  const laneById = new Map(lanes.map(lane => [lane.id, lane]));
  const classifications = Object.fromEntries(Object.entries(model.classifications).map(([code, value]) => [code, { code, iri: iri('classification', code), label: value.n, shortLabel: value.short, description: value.ds }]));

  const nodes = model.nodes.map(node => {
    const startYear = node.dateOverride?.start ?? node.year;
    const endYear = node.dateOverride?.end ?? node.year;
    const paperLinkIds = linksByNode.get(node.id);
    const landmarkWorkLinkIds = landmarkLinksByNode.get(node.id);
    const research = {
      tier: node.research.tier,
      tags: node.research.tags,
      questions: node.research.questions,
      paperLinkIds,
      landmarkWorkLinkIds
    };
    return {
      id: node.id,
      iri: iri('node', node.id),
      humanUrl: `${APPLICATION_HUMAN_URL}#node=${encodeURIComponent(node.id)}`,
      type: node.statusProfile.kind,
      title: node.title,
      description: node.description,
      chronology: {
        year: node.year,
        startYear,
        endYear,
        dateLabel: node.dateOverride?.label || String(node.year),
        milestones: node.dateOverride?.milestones || []
      },
      laneId: node.laneId,
      laneIri: laneById.get(node.laneId).iri,
      legacyClassification: classifications[node.classificationCode],
      status: node.statusProfile,
      evidence: {
        development: normalizeAssessment(node.audit.development),
        mapStatus: normalizeAssessment(node.audit.mapStatus)
      },
      evidenceRecordPresent: node.auditRecordPresent,
      research,
      questions: node.questions,
      direction: node.direction ? { ...node.direction, paperLinkIds, landmarkWorkLinkIds } : null,
      claimFingerprint: node.claimFingerprint
    };
  });

  const relationships = model.relationships.map(edge => ({
    id: edge.key,
    iri: iri('relationship', edge.key),
    sourceNodeId: edge.sourceNodeId,
    sourceNodeIri: iri('node', edge.sourceNodeId),
    targetNodeId: edge.targetNodeId,
    targetNodeIri: iri('node', edge.targetNodeId),
    legacyKind: edge.legacyKind,
    relationshipType: edge.relationshipType,
    rationale: edge.rationale,
    reviewed: edge.reviewed,
    origin: researchExtensionKeys.has(edge.key) ? 'research_extension' : 'curated_map',
    evidence: { grade: edge.evidenceGrade, ...normalizeAssessment(edge.audit) },
    evidenceRecordPresent: edge.auditRecordPresent,
    claimFingerprint: edge.claimFingerprint
  }));

  for (const edge of relationships) {
    assert(nodeIds.has(edge.sourceNodeId), `Unknown relationship source ${edge.sourceNodeId}`);
    assert(nodeIds.has(edge.targetNodeId), `Unknown relationship target ${edge.targetNodeId}`);
  }

  const wikipediaSources = [...wikiRegistry.values()].map(record => {
    assert(record.canonicalUrls.size === 1, `Conflicting canonical URLs for ${record.iri}`);
    const titles = [...record.titles].sort((a, b) => b.length - a.length || compareText(a, b));
    return {
      id: record.iri,
      iri: record.iri,
      title: titles[0],
      alternateTitles: titles.slice(1).sort(compareText),
      canonicalUrl: [...record.canonicalUrls][0],
      revisionUrl: record.iri,
      checkedAt: [...record.checkedAt].sort(compareText),
      sections: [...record.sections].sort(compareText)
    };
  }).sort((a, b) => compareText(a.iri, b.iri));

  const wikipediaSourceById = new Map(wikipediaSources.map(source => [source.id, source]));
  const evidenceAssessments = [];
  function assessmentRecord({ id, subjectType, subjectId, subjectIri, aspect, assessment, rawRecordPresent }) {
    const checkedAt = unique(assessment.sourceIds.flatMap(sourceId => wikipediaSourceById.get(sourceId)?.checkedAt || [])).sort(compareText);
    return {
      id,
      iri: iri('assessment', id),
      subjectType,
      subjectId,
      subjectIri,
      aspect,
      state: assessment.state,
      confidence: assessment.confidence,
      note: assessment.note,
      rawRecordPresent,
      checkedAt,
      sourceIds: assessment.sourceIds
    };
  }
  for (const node of nodes) {
    const development = assessmentRecord({ id: 'node:' + node.id + ':development', subjectType: 'atlasEntry', subjectId: node.id, subjectIri: node.iri, aspect: 'development', assessment: node.evidence.development, rawRecordPresent: node.evidenceRecordPresent.development });
    const mapStatus = assessmentRecord({ id: 'node:' + node.id + ':mapStatus', subjectType: 'atlasEntry', subjectId: node.id, subjectIri: node.iri, aspect: 'mapStatus', assessment: node.evidence.mapStatus, rawRecordPresent: node.evidenceRecordPresent.mapStatus });
    evidenceAssessments.push(development, mapStatus);
    node.evidenceAssessmentIds = { development: development.id, mapStatus: mapStatus.id };
    node.evidenceAssessmentIris = { development: development.iri, mapStatus: mapStatus.iri };
    delete node.evidence;
    delete node.evidenceRecordPresent;
  }
  for (const edge of relationships) {
    const assessment = assessmentRecord({ id: 'relationship:' + edge.id, subjectType: 'relationship', subjectId: edge.id, subjectIri: edge.iri, aspect: 'relationship', assessment: edge.evidence, rawRecordPresent: edge.evidenceRecordPresent });
    evidenceAssessments.push(assessment);
    edge.evidenceGrade = edge.evidence.grade;
    edge.evidenceAssessmentId = assessment.id;
    edge.evidenceAssessmentIri = assessment.iri;
    delete edge.evidence;
    delete edge.evidenceRecordPresent;
  }
  const edgeKindCounts = countBy(relationships, edge => edge.legacyKind);
  const relationshipTypeCounts = countBy(relationships, edge => edge.relationshipType);
  const evidenceGradeCounts = countBy(relationships, edge => edge.evidenceGrade);
  const paperRoleCounts = countBy(paperLinks, link => link.role);
  const landmarkRoleCounts = countBy(landmarkWorkLinks, link => link.role);
  const landmarkKindCounts = countBy(landmarkWorks, work => work.kind);
  const landmarkAccessCounts = countBy(landmarkWorks, work => work.access);
  const wikipediaSourceReferences = evidenceAssessments.reduce((sum, assessment) => sum + assessment.sourceIds.length, 0);
  const counts = {
    atlasEntries: nodes.length,
    developments: nodes.filter(node => node.type === 'development').length,
    openDirections: nodes.filter(node => node.type === 'open_direction').length,
    relationships: relationships.length,
    edgeKinds: edgeKindCounts,
    relationshipTypes: relationshipTypeCounts,
    evidenceGrades: evidenceGradeCounts,
    uniquePapers: papers.length,
    paperAssociations: paperLinks.length,
    paperRoles: paperRoleCounts,
    landmarkWorks: landmarkWorks.length,
    landmarkWorkAssociations: landmarkWorkLinks.length,
    landmarkRoles: landmarkRoleCounts,
    landmarkKinds: landmarkKindCounts,
    landmarkAccess: landmarkAccessCounts,
    publicDomainWorks: landmarkWorks.filter(work => work.access === 'public_domain').length,
    wikipediaRevisionSources: wikipediaSources.length,
    wikipediaSourceReferences,
    evidenceAssessments: evidenceAssessments.length,
    directionCards: nodes.filter(node => node.direction).length,
    editorialClassifications: Object.keys(classifications).length
  };

  assert(JSON.stringify(edgeKindCounts) === JSON.stringify({ dep: 656, gap: 44, sup: 11 }), `Unexpected edge-kind counts: ${JSON.stringify(edgeKindCounts)}`);
  assert(JSON.stringify(relationshipTypeCounts) === JSON.stringify({ application: 1, component: 3, editorial_association: 647, enables: 1, extends: 2, influences: 2, legacy_supersession_claim: 11, proposed_combination: 44 }), `Unexpected relationship-type counts: ${JSON.stringify(relationshipTypeCounts)}`);
  assert(JSON.stringify(evidenceGradeCounts) === JSON.stringify({ contextual: 288, direct: 6, editorial: 214, hypothesis: 44, partial: 3, unassessed: 156 }), `Unexpected evidence-grade counts: ${JSON.stringify(evidenceGradeCounts)}`);
  assert(JSON.stringify(paperRoleCounts) === JSON.stringify({ adjacent_work: 16, benchmark: 15, critique: 6, origin: 72, supporting_result: 74, survey: 3 }), `Unexpected paper-role counts: ${JSON.stringify(paperRoleCounts)}`);
  assert(JSON.stringify(landmarkRoleCounts) === JSON.stringify({ context: 2, critique: 2, origin: 56, supporting_result: 6, survey: 10 }), `Unexpected landmark-role counts: ${JSON.stringify(landmarkRoleCounts)}`);
  assert(JSON.stringify(landmarkKindCounts) === JSON.stringify({ book: 18, literary_work: 1, paper: 49, proposal: 1, report: 6, thesis: 1 }), `Unexpected landmark-kind counts: ${JSON.stringify(landmarkKindCounts)}`);
  assert(JSON.stringify(landmarkAccessCounts) === JSON.stringify({ author_open: 24, free_to_read: 10, open_access: 10, public_domain: 4, publisher_record: 28 }), `Unexpected landmark-access counts: ${JSON.stringify(landmarkAccessCounts)}`);
  assert(counts.developments === 324 && counts.openDirections === 15, 'Unexpected development/direction counts');
  assert(counts.uniquePapers === 176 && counts.paperAssociations === 186 && counts.landmarkWorks === 76 && counts.landmarkWorkAssociations === 76 && counts.directionCards === 15, 'Unexpected research counts');
  assert(counts.wikipediaRevisionSources === 267 && counts.wikipediaSourceReferences === 766, 'Unexpected active Wikipedia provenance counts');
  assert(counts.evidenceAssessments === 1389, 'Unexpected evidence-assessment count');
  assert(counts.editorialClassifications === 7, 'Unexpected editorial-classification count');

  const dataset = {
    identifier: DATASET_IRI,
    name: 'AI Research Tech Tree',
    description: model.project.scope,
    edition: model.project.edition,
    releaseState: model.project.releaseState,
    asOf: model.project.asOf,
    temporalCoverage: '1879/2026',
    humanUrl: APPLICATION_HUMAN_URL,
    canonicalUrl: model.project.canonicalUrl,
    authors: model.project.authors,
    license: model.project.license,
    correctionsUrl: model.project.correctionsUrl,
    inclusionCriteria: model.project.inclusionCriteria,
    knownLimitations: model.project.knownLimitations,
    changelog: model.project.changelog,
    counts,
    evidenceCoverage: model.auditSummary,
    researchSummary: model.researchSummary,
    distributions: [
      { name: 'JSON-LD knowledge graph', filename: JSONLD_NAME, encodingFormat: 'application/ld+json' },
      { name: 'Normalized atlas data', filename: JSON_NAME, encodingFormat: 'application/json' },
      { name: 'Streaming graph records', filename: NDJSON_NAME, encodingFormat: 'application/x-ndjson' }
    ]
  };

  const plain = {
    schemaVersion: 2,
    generatorVersion: GENERATOR_VERSION,
    namespace: { datasetIri: DATASET_IRI, vocabularyIri: VOCAB_IRI },
    dataset,
    lanes,
    classifications,
    nodes,
    relationships,
    evidenceAssessments,
    papers,
    paperLinks,
    landmarkWorks,
    landmarkWorkLinks,
    wikipediaSources
  };
  dataset.dataDigest = sha256(JSON.stringify(plain));

  const graphEntities = [];
  for (const lane of lanes) {
    graphEntities.push({
      '@id': lane.iri,
      '@type': 'schema:DefinedTerm',
      'schema:identifier': lane.id,
      'schema:name': lane.label,
      'schema:inDefinedTermSet': idRef(DATASET_IRI),
      'tree:recordType': 'lane'
    });
  }

  for (const classification of Object.values(classifications)) {
    graphEntities.push({
      '@id': classification.iri,
      '@type': ['schema:DefinedTerm', 'tree:EditorialClassification'],
      'schema:identifier': classification.code,
      'schema:name': classification.label,
      'schema:alternateName': classification.shortLabel,
      'schema:description': classification.description,
      'schema:inDefinedTermSet': idRef(DATASET_IRI),
      'tree:recordType': 'editorialClassification'
    });
  }

  for (const node of nodes) {
    const nodeLinks = paperLinks.filter(link => link.nodeId === node.id);
    const nodeWorkLinks = landmarkWorkLinks.filter(link => link.nodeId === node.id);
    const entity = {
      '@id': node.iri,
      '@type': ['schema:DefinedTerm', 'prov:Entity', node.type === 'open_direction' ? 'tree:OpenResearchDirection' : 'tree:ResearchDevelopment'],
      'schema:identifier': node.id,
      'schema:name': node.title,
      'schema:description': node.description,
      'schema:inDefinedTermSet': idRef(DATASET_IRI),
      'schema:url': idRef(node.humanUrl),
      'schema:citation': unique([...nodeLinks.map(link => link.paperIri), ...nodeWorkLinks.map(link => link.workIri)]).map(idRef),
      'tree:recordType': 'atlasEntry',
      'tree:startYear': node.chronology.startYear,
      'tree:endYear': node.chronology.endYear,
      'tree:dateLabel': node.chronology.dateLabel,
      'tree:chronologyMilestone': node.chronology.milestones,
      'tree:lane': idRef(node.laneIri),
      'tree:legacyClassification': idRef(node.legacyClassification.iri),
      'tree:legacyClassificationCode': node.legacyClassification.code,
      'tree:legacyClassificationLabel': node.legacyClassification.label,
      'tree:kind': node.status.kind,
      'tree:significance': node.status.significance,
      'tree:activity': node.status.activity,
      'tree:trajectory': node.status.trajectory,
      'tree:statusAsOf': node.status.asOf,
      'tree:statusConfidence': node.status.confidence,
      'tree:statusRationale': node.status.rationale,
      'tree:evidenceAssessment': Object.values(node.evidenceAssessmentIris).map(idRef),
      'tree:researchTier': node.research.tier,
      'tree:tag': node.research.tags,
      'tree:researchQuestion': node.questions,
      'tree:paperAssociation': nodeLinks.map(link => idRef(link.iri)),
      'tree:landmarkWorkAssociation': nodeWorkLinks.map(link => idRef(link.iri)),
      'tree:claimFingerprint': node.claimFingerprint
    };
    if (node.direction) {
      entity['tree:directionClaimState'] = node.direction.claimState;
      entity['tree:directionAsOf'] = node.direction.asOf;
      entity['tree:directionConfidence'] = node.direction.confidence;
      entity['tree:closureCriteria'] = node.direction.closureCriteria;
      entity['tree:partialResult'] = node.direction.partialResults;
      entity['tree:starterProject'] = node.direction.starters;
      entity['tree:counterexample'] = node.direction.counterexamples;
      entity['tree:crowdedness'] = node.direction.crowdedness;
      entity['tree:tractability'] = node.direction.tractability;
      entity['tree:noveltyReview'] = jsonLiteral(node.direction.noveltyReview);
      entity['tree:researchResources'] = jsonLiteral(node.direction.resources);
    }
    graphEntities.push(omitEmpty(entity));
  }

  for (const edge of relationships) {
    graphEntities.push(omitEmpty({
      '@id': edge.iri,
      '@type': ['tree:RelationshipAssertion', 'prov:Entity'],
      'schema:identifier': edge.id,
      'tree:recordType': 'relationship',
      'tree:sourceNode': idRef(edge.sourceNodeIri),
      'tree:targetNode': idRef(edge.targetNodeIri),
      'tree:legacyKind': edge.legacyKind,
      'tree:relationshipType': edge.relationshipType,
      'tree:rationale': edge.rationale,
      'tree:reviewed': edge.reviewed,
      'tree:origin': edge.origin,
      'tree:evidenceGrade': edge.evidenceGrade,
      'tree:evidenceAssessment': idRef(edge.evidenceAssessmentIri),
      'tree:claimFingerprint': edge.claimFingerprint
    }));
  }

  for (const assessment of evidenceAssessments) {
    graphEntities.push(omitEmpty({
      '@id': assessment.iri,
      '@type': ['tree:EvidenceAssessment', 'prov:Entity'],
      'schema:identifier': assessment.id,
      'tree:recordType': 'evidenceAssessment',
      'tree:assessedSubject': idRef(assessment.subjectIri),
      'tree:subjectType': assessment.subjectType,
      'tree:claimDimension': assessment.aspect,
      'tree:evidenceState': assessment.state,
      'tree:confidence': assessment.confidence,
      'tree:evidenceNote': assessment.note,
      'tree:rawRecordPresent': assessment.rawRecordPresent,
      'tree:checkedAt': assessment.checkedAt,
      'prov:wasDerivedFrom': assessment.sourceIds.map(idRef)
    }));
  }

  for (const paper of papers) {
    graphEntities.push(omitEmpty({
      '@id': paper.iri,
      '@type': ['schema:ScholarlyArticle', 'prov:Entity'],
      'schema:identifier': `arXiv:${paper.id}`,
      'schema:name': paper.title,
      'schema:alternateName': paper.alternateTitles,
      'schema:url': idRef(paper.url),
      'schema:datePublished': String(paper.year),
      'tree:publicationYear': paper.year,
      'tree:recordType': 'paper'
    }));
  }

  for (const link of paperLinks) {
    graphEntities.push({
      '@id': link.iri,
      '@type': ['tree:PaperAssociation', 'prov:Entity'],
      'schema:identifier': link.id,
      'tree:recordType': 'paperAssociation',
      'tree:sourceNode': idRef(link.nodeIri),
      'tree:paper': idRef(link.paperIri),
      'tree:paperRole': link.role,
      'tree:sourceTitle': link.sourceTitle,
      'tree:roleExplicit': link.roleExplicit
    });
  }


  const schemaTypeForWork = kind => ({ paper: 'schema:ScholarlyArticle', book: 'schema:Book', literary_work: 'schema:Book', report: 'schema:Report', proposal: 'schema:CreativeWork', thesis: 'schema:CreativeWork' }[kind] || 'schema:CreativeWork');
  for (const work of landmarkWorks) {
    graphEntities.push(omitEmpty({
      '@id': work.iri,
      '@type': [schemaTypeForWork(work.kind), 'prov:Entity', 'tree:LandmarkWork'],
      'schema:identifier': work.id,
      'schema:name': work.title,
      'schema:url': idRef(work.url),
      'schema:datePublished': String(work.year),
      'schema:author': work.authors,
      'schema:isAccessibleForFree': work.access !== 'publisher_record',
      'tree:publicationYear': work.year,
      'tree:workKind': work.kind,
      'tree:accessStatus': work.access,
      'tree:accessNote': work.note,
      'tree:recordType': 'landmarkWork'
    }));
  }

  for (const link of landmarkWorkLinks) {
    graphEntities.push({
      '@id': link.iri,
      '@type': ['tree:LandmarkWorkAssociation', 'prov:Entity'],
      'schema:identifier': link.id,
      'tree:recordType': 'landmarkWorkAssociation',
      'tree:sourceNode': idRef(link.nodeIri),
      'tree:work': idRef(link.workIri),
      'tree:workRole': link.role
    });
  }

  for (const source of wikipediaSources) {
    graphEntities.push(omitEmpty({
      '@id': source.iri,
      '@type': ['schema:Article', 'prov:Entity'],
      'schema:name': source.title,
      'schema:alternateName': source.alternateTitles,
      'schema:url': idRef(source.revisionUrl),
      'prov:specializationOf': idRef(source.canonicalUrl),
      'tree:revisionUrl': idRef(source.revisionUrl),
      'tree:checkedAt': source.checkedAt,
      'tree:section': source.sections,
      'tree:recordType': 'wikipediaRevision'
    }));
  }

  const datasetGraph = omitEmpty({
    '@context': {
      '@version': 1.1,
      schema: 'https://schema.org/',
      prov: 'http://www.w3.org/ns/prov#',
      tree: { '@id': VOCAB_IRI, '@prefix': true }
    },
    '@id': DATASET_IRI,
    '@type': ['schema:Dataset', 'schema:DefinedTermSet', 'prov:Bundle'],
    'schema:identifier': DATASET_IRI,
    'schema:name': dataset.name,
    'schema:description': dataset.description,
    'schema:version': dataset.edition,
    'schema:dateModified': dataset.asOf,
    'schema:temporalCoverage': dataset.temporalCoverage,
    'schema:isAccessibleForFree': true,
    'schema:url': idRef(dataset.canonicalUrl || dataset.humanUrl),
    'schema:keywords': ['artificial intelligence', 'research history', 'technology tree', 'knowledge graph', 'machine learning'],
    'schema:hasDefinedTerm': [
      ...lanes.map(lane => idRef(lane.iri)),
      ...Object.values(classifications).map(classification => idRef(classification.iri)),
      ...nodes.map(node => idRef(node.iri))
    ],
    'schema:distribution': dataset.distributions.map(distribution => ({
      '@type': 'schema:DataDownload',
      'schema:name': distribution.name,
      'schema:encodingFormat': distribution.encodingFormat,
      'schema:contentUrl': idRef(`./${distribution.filename}`)
    })),
    'schema:creator': dataset.authors,
    'schema:license': dataset.license,
    'tree:correctionsUrl': dataset.correctionsUrl ? idRef(dataset.correctionsUrl) : null,
    'tree:releaseState': dataset.releaseState,
    'tree:canonicalStatus': dataset.canonicalUrl ? 'configured' : 'not_configured',
    'tree:dataDigest': dataset.dataDigest,
    'tree:generatorVersion': GENERATOR_VERSION,
    'tree:counts': jsonLiteral(dataset.counts),
    'tree:evidenceCoverage': jsonLiteral(dataset.evidenceCoverage),
    'tree:researchSummary': jsonLiteral(dataset.researchSummary),
    'tree:inclusionCriterion': dataset.inclusionCriteria,
    'tree:knownLimitation': dataset.knownLimitations,
    'tree:changeNote': dataset.changelog,
    '@graph': graphEntities
  });

  const allEntityIds = [DATASET_IRI, ...graphEntities.map(entity => entity['@id'])];
  assert(allEntityIds.every(Boolean), 'Every graph entity must have an @id');
  assert(new Set(allEntityIds).size === allEntityIds.length, 'Duplicate JSON-LD @id values');

  const graphIds = new Set(allEntityIds);
  for (const link of paperLinks) {
    assert(graphIds.has(link.nodeIri) && graphIds.has(link.paperIri) && graphIds.has(link.iri), `Unresolved paper association ${link.id}`);
  }
  for (const link of landmarkWorkLinks) {
    assert(graphIds.has(link.nodeIri) && graphIds.has(link.workIri) && graphIds.has(link.iri), `Unresolved landmark association ${link.id}`);
  }
  for (const edge of relationships) {
    assert(graphIds.has(edge.sourceNodeIri) && graphIds.has(edge.targetNodeIri) && graphIds.has(edge.iri), `Unresolved relationship ${edge.id}`);
  }

  const ndjsonRecords = [
    { recordType: 'dataset', schemaVersion: plain.schemaVersion, generatorVersion: plain.generatorVersion, namespace: plain.namespace, dataset: plain.dataset },
    ...lanes.map(record => ({ recordType: 'lane', ...record })),
    ...Object.values(classifications).map(record => ({ recordType: 'editorialClassification', ...record })),
    ...nodes.map(record => ({ recordType: 'atlasEntry', ...record })),
    ...relationships.map(record => ({ recordType: 'relationship', ...record })),
    ...evidenceAssessments.map(record => ({ recordType: 'evidenceAssessment', ...record })),
    ...papers.map(record => ({ recordType: 'paper', ...record })),
    ...paperLinks.map(record => ({ recordType: 'paperAssociation', ...record })),
    ...landmarkWorks.map(record => ({ recordType: 'landmarkWork', ...record })),
    ...landmarkWorkLinks.map(record => ({ recordType: 'landmarkWorkAssociation', ...record })),
    ...wikipediaSources.map(record => ({ recordType: 'wikipediaRevision', ...record }))
  ];

  return { plain, datasetGraph, ndjsonRecords };
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function applyKnowledgeGraph(html, datasetGraph) {
  const jsonLdBody = safeJson(datasetGraph);
  const jsonLdPattern = /<script(?:\s+id="knowledge-graph")?\s+type="application\/ld\+json">[\s\S]*?<\/script>/i;
  const matches = html.match(new RegExp(jsonLdPattern.source, 'gi')) || [];
  assert(matches.length === 1, `Expected one existing JSON-LD block, found ${matches.length}`);
  html = html.replace(jsonLdPattern, '');
  assert(/<\/body>\s*<\/html>\s*$/i.test(html), 'Expected a structural closing body and html tag at end of document');
  const closingBodyAt = html.toLowerCase().lastIndexOf('</body>');
  assert(closingBodyAt >= 0, 'Closing body tag not found');
  html = `${html.slice(0, closingBodyAt).trimEnd()}\n<script id="knowledge-graph" type="application/ld+json">${jsonLdBody}</script>\n${html.slice(closingBodyAt)}`;

  const requiredLinks = [
    `<link rel="alternate" type="application/ld+json" href="./${JSONLD_NAME}" title="AI Research Tech Tree knowledge graph (JSON-LD)">`,
    `<link rel="alternate" type="application/json" href="./${JSON_NAME}" title="AI Research Tech Tree data (JSON)">`,
    `<link rel="alternate" type="application/x-ndjson" href="./${NDJSON_NAME}" title="AI Research Tech Tree records (NDJSON)">`
  ];
  for (const link of requiredLinks) assert(html.includes(link), `Missing discovery link: ${link}`);

  const scripts = scriptsIn(html).map(match => match[1]);
  const styles = [...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)].map(match => match[1]);
  assert(scripts.length === 10 && styles.length === 2, `Unexpected inline body counts: ${scripts.length} scripts, ${styles.length} styles`);
  const cspHash = body => `'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`;
  const policy = [
    "default-src 'none'",
    `script-src ${scripts.map(cspHash).join(' ')}`,
    "script-src-attr 'none'",
    "style-src 'none'",
    `style-src-elem ${styles.map(cspHash).join(' ')}`,
    "style-src-attr 'unsafe-inline'",
    'img-src data:',
    "connect-src 'none'",
    "font-src 'none'",
    "media-src 'none'",
    "worker-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "manifest-src 'none'"
  ].join('; ');
  const cspPattern = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/;
  assert((html.match(new RegExp(cspPattern.source, 'g')) || []).length === 1, 'Expected exactly one CSP meta element');
  html = html.replace(cspPattern, `<meta http-equiv="Content-Security-Policy" content="${policy}">`);
  return { html, jsonLdBody };
}

let html = fs.readFileSync(htmlPath, 'utf8').replace(/\r\n/g, '\n');
const model = extractModel(html);
const { plain, datasetGraph, ndjsonRecords } = buildExports(model);
const applied = applyKnowledgeGraph(html, datasetGraph);
const plainBody = JSON.stringify(plain, null, 2) + '\n';
const ndjsonBody = ndjsonRecords.map(record => JSON.stringify(record)).join('\n') + '\n';

fs.writeFileSync(htmlPath, applied.html, 'utf8');
fs.writeFileSync(jsonLdPath, applied.jsonLdBody, 'utf8');
fs.writeFileSync(jsonPath, plainBody, 'utf8');
fs.writeFileSync(ndjsonPath, ndjsonBody, 'utf8');

console.log(JSON.stringify({
  datasetIri: DATASET_IRI,
  dataDigest: plain.dataset.dataDigest,
  counts: plain.dataset.counts,
  bytes: {
    html: Buffer.byteLength(applied.html),
    jsonld: Buffer.byteLength(applied.jsonLdBody),
    json: Buffer.byteLength(plainBody),
    ndjson: Buffer.byteLength(ndjsonBody)
  }
}, null, 2));
