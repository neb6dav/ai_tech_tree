#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const DEFAULT_DATA_FILE = path.join(ROOT, 'src', 'data', 'opportunities', 'diffusion-models.alpha.json');
const DEFAULT_ATLAS_FILE = path.join(ROOT, 'ai-research-tech-tree.json');

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/;
const SCHEMA_VERSION = '1.0.0';

const ENUMS = Object.freeze({
  nodeTypes: Object.freeze([
    'precursor',
    'core_development',
    'capability',
    'refinement',
    'complement',
    'application',
    'demonstrated_outcome',
    'constraint',
    'failed_or_stalled_attempt',
    'competing_or_substitute_approach',
    'open_opportunity'
  ]),
  relationshipTypes: Object.freeze([
    'documented_historical_influence',
    'derives_from',
    'adapts_formalism_from',
    'later_mathematical_equivalence',
    'enables',
    'improves',
    'combines_with',
    'applied_to',
    'mitigates_constraint',
    'blocked_by',
    'competes_with',
    'displaced_in_context_by',
    'reopened_by',
    'retrospective_analogy',
    'candidate_application'
  ]),
  evidenceGrades: Object.freeze(['direct', 'partial', 'contextual', 'editorial', 'unassessed', 'hypothesis']),
  evidenceTypes: Object.freeze([
    'primary_source',
    'independent_confirmation',
    'systematic_review',
    'survey_or_review',
    'benchmark',
    'official_documentation',
    'historical_account',
    'editorial_analysis',
    'novelty_search',
    'no_source_found'
  ]),
  opportunityStatuses: Object.freeze([
    'rapidly_expanding',
    'actively_improving',
    'mature_but_useful',
    'locally_saturated',
    'constraint_bound',
    'displaced_in_this_context',
    'reopened_by_a_new_complement',
    'evidence_mixed',
    'not_yet_assessed'
  ]),
  relationshipStatuses: Object.freeze(['demonstrated', 'partially_supported', 'contested', 'unassessed', 'hypothesis']),
  atlasLinkRelations: Object.freeze([
    'same_as',
    'precursor_of',
    'descendant_of',
    'capability_of',
    'refinement_of',
    'complement_to',
    'application_of',
    'outcome_of',
    'constraint_on',
    'competitor_to',
    'opportunity_for',
    'related_to'
  ]),
  metadataStatuses: Object.freeze(['pending_research', 'alpha', 'in_review', 'published', 'archived']),
  importStatuses: Object.freeze(['not_started', 'in_progress', 'imported_unreviewed', 'validated', 'superseded']),
  yearPrecisions: Object.freeze(['exact', 'year', 'range', 'ongoing', 'undated']),
  sourceTypes: Object.freeze([
    'paper',
    'book',
    'report',
    'dataset',
    'benchmark',
    'documentation',
    'webpage',
    'repository',
    'patent',
    'thesis',
    'interview',
    'other'
  ]),
  constraintCategories: Object.freeze([
    'sampling_latency',
    'compute_energy',
    'data_licensing',
    'privacy_memorization',
    'evaluation',
    'controllability',
    'spatial_temporal_identity_consistency',
    'physical_causal_consistency',
    'out_of_distribution_robustness',
    'likelihood',
    'deployment_cost',
    'safety_misuse',
    'hard_constraints',
    'competition',
    'other'
  ]),
  constraintStatuses: Object.freeze(['active', 'partially_mitigated', 'mitigated_in_context', 'uncertain', 'not_yet_assessed']),
  noveltySearchStatuses: Object.freeze(['not_started', 'partial', 'completed']),
  openOpportunityStatuses: Object.freeze([
    'hypothesis',
    'prioritized_for_test',
    'testing',
    'supported_in_scope',
    'not_supported_in_scope',
    'deferred'
  ]),
  opportunityRatings: Object.freeze(['low', 'medium', 'high', 'unknown']),
  unresolvedReasons: Object.freeze([
    'missing_primary_source',
    'influence_not_verified',
    'priority_dispute',
    'replication_unclear',
    'benchmark_not_comparable',
    'scope_unclear',
    'novelty_unverified',
    'conflicting_evidence',
    'other'
  ]),
  unresolvedStatuses: Object.freeze(['open', 'partially_resolved', 'resolved', 'deferred'])
});

const SETS = Object.fromEntries(Object.entries(ENUMS).map(([name, values]) => [name, new Set(values)]));

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function collectAtlasNodeIds(atlasData) {
  if (!isObject(atlasData) || !Array.isArray(atlasData.nodes)) return new Set();
  return new Set(atlasData.nodes.map(node => node && node.id).filter(id => typeof id === 'string'));
}

function normalizeAtlasNodeIds(options) {
  if (options.atlasNodeIds instanceof Set) return new Set(options.atlasNodeIds);
  if (Array.isArray(options.atlasNodeIds)) return new Set(options.atlasNodeIds);
  return collectAtlasNodeIds(options.atlasData);
}

function validateOpportunityData(document, options = {}) {
  const errors = [];
  const warnings = [];
  const error = (location, message) => errors.push({ location, message });
  const warn = (location, message) => warnings.push({ location, message });

  if (!isObject(document)) {
    error('$', 'Opportunity data must be a JSON object.');
    return { valid: false, errors, warnings, counts: {} };
  }

  const requiredTopLevel = [
    '$schema',
    'schemaVersion',
    'metadata',
    'nodes',
    'relationships',
    'sources',
    'applicationBranches',
    'constraints',
    'openOpportunities',
    'unresolvedClaims'
  ];
  const topLevelKeys = new Set(requiredTopLevel);
  for (const key of requiredTopLevel) {
    if (!Object.hasOwn(document, key)) error('$', `Missing required top-level property ${key}.`);
  }
  for (const key of Object.keys(document)) {
    if (!topLevelKeys.has(key)) error(`$.${key}`, 'Unknown top-level property.');
  }
  if (typeof document.$schema !== 'string' || !document.$schema.trim()) error('$.$schema', 'Must be a non-empty schema reference.');
  if (document.schemaVersion !== SCHEMA_VERSION) error('$.schemaVersion', `Must equal ${SCHEMA_VERSION}.`);

  const arrayNames = ['nodes', 'relationships', 'sources', 'applicationBranches', 'constraints', 'openOpportunities', 'unresolvedClaims'];
  for (const name of arrayNames) {
    if (!Array.isArray(document[name])) error(`$.${name}`, 'Must be an array.');
  }
  const arraysReady = arrayNames.every(name => Array.isArray(document[name]));
  if (!arraysReady) return { valid: false, errors, warnings, counts: {} };

  const metadata = document.metadata;
  validateMetadata(metadata, error);

  const globalIds = new Map();
  collectGlobalIds(document, '$', globalIds, error);

  const nodeById = indexById(document.nodes);
  const relationshipById = indexById(document.relationships);
  const sourceById = indexById(document.sources);
  const constraintById = indexById(document.constraints);
  const bandById = indexById(isObject(metadata) && Array.isArray(metadata.visualBands) ? metadata.visualBands : []);
  const atlasNodeIds = normalizeAtlasNodeIds(options);
  if (atlasNodeIds.size === 0) {
    error('$.metadata.anchorAtlasNodeId', 'Atlas data or atlasNodeIds are required to validate cross-view links.');
  }

  validateBands(metadata, bandById, error);
  validateSources(document.sources, error);

  document.nodes.forEach((node, index) => {
    const location = `$.nodes[${index}]`;
    if (!isObject(node)) {
      error(location, 'Must be an object.');
      return;
    }
    requireKeys(node, ['id', 'type', 'title', 'summary', 'bandId', 'status', 'evidence', 'atlasLinks'], location, error);
    allowKeys(node, ['id', 'type', 'title', 'summary', 'year', 'yearEnd', 'yearPrecision', 'domain', 'tags', 'bandId', 'status', 'evidence', 'atlasLinks'], location, error);
    validateId(node.id, `${location}.id`, error);
    validateEnum(node.type, SETS.nodeTypes, `${location}.type`, error);
    validateText(node.title, `${location}.title`, error);
    validateText(node.summary, `${location}.summary`, error);
    validateYearFields(node, location, metadata, error);
    if (Object.hasOwn(node, 'domain')) validateText(node.domain, `${location}.domain`, error);
    if (Object.hasOwn(node, 'tags')) {
      validateTextArray(node.tags, `${location}.tags`, error);
      validateUniqueArray(node.tags, `${location}.tags`, error);
    }
    if (!bandById.has(node.bandId)) {
      error(`${location}.bandId`, `Unknown visual band ${JSON.stringify(node.bandId)}.`);
    } else if (!Array.isArray(bandById.get(node.bandId).nodeTypes) || !bandById.get(node.bandId).nodeTypes.includes(node.type)) {
      error(`${location}.bandId`, `Band ${node.bandId} does not admit node type ${node.type}.`);
    }
    validateStatusAssessment(node.status, `${location}.status`, sourceById, error);
    validateEvidenceArray(node.evidence, `${location}.evidence`, sourceById, error);
    validateAtlasLinks(node.atlasLinks, `${location}.atlasLinks`, atlasNodeIds, error);
  });

  const edgeSignatures = new Set();
  const forbiddenWidthFields = new Set(['width', 'pathWidth', 'strokeWidth', 'weight', 'value', 'flow', 'magnitude']);
  document.relationships.forEach((relationship, index) => {
    const location = `$.relationships[${index}]`;
    if (!isObject(relationship)) {
      error(location, 'Must be an object.');
      return;
    }
    requireKeys(relationship, ['id', 'type', 'sourceNodeId', 'targetNodeId', 'status', 'evidence', 'atlasLinks'], location, error);
    allowKeys(relationship, ['id', 'type', 'sourceNodeId', 'targetNodeId', 'summary', 'status', 'evidence', 'atlasLinks'], location, error);
    validateId(relationship.id, `${location}.id`, error);
    validateEnum(relationship.type, SETS.relationshipTypes, `${location}.type`, error);
    validateEnum(relationship.status, SETS.relationshipStatuses, `${location}.status`, error);
    if (Object.hasOwn(relationship, 'summary')) validateText(relationship.summary, `${location}.summary`, error);
    validateRef(relationship.sourceNodeId, nodeById, `${location}.sourceNodeId`, 'node', error);
    validateRef(relationship.targetNodeId, nodeById, `${location}.targetNodeId`, 'node', error);
    if (relationship.sourceNodeId === relationship.targetNodeId) error(location, 'Self-referential relationships are not allowed.');
    const signature = `${relationship.sourceNodeId}\u0000${relationship.targetNodeId}\u0000${relationship.type}`;
    if (edgeSignatures.has(signature)) error(location, 'Duplicate source, target, and relationship type.');
    edgeSignatures.add(signature);
    for (const field of Object.keys(relationship)) {
      if (forbiddenWidthFields.has(field)) error(`${location}.${field}`, 'Relationship paths use one fixed width; quantitative width fields are forbidden.');
    }
    validateEvidence(relationship.evidence, `${location}.evidence`, sourceById, error);
    validateRelationshipEvidenceConsistency(relationship, location, error);
    validateAtlasLinks(relationship.atlasLinks, `${location}.atlasLinks`, atlasNodeIds, error);
  });

  document.constraints.forEach((constraint, index) => {
    const location = `$.constraints[${index}]`;
    if (!isObject(constraint)) {
      error(location, 'Must be an object.');
      return;
    }
    requireKeys(constraint, ['id', 'title', 'summary', 'category', 'nodeId', 'affectsNodeIds', 'mitigatedByNodeIds', 'relationshipIds', 'status', 'evidence'], location, error);
    allowKeys(constraint, ['id', 'title', 'summary', 'category', 'nodeId', 'affectsNodeIds', 'mitigatedByNodeIds', 'relationshipIds', 'status', 'evidence'], location, error);
    validateId(constraint.id, `${location}.id`, error);
    validateText(constraint.title, `${location}.title`, error);
    validateText(constraint.summary, `${location}.summary`, error);
    validateEnum(constraint.category, SETS.constraintCategories, `${location}.category`, error);
    validateRef(constraint.nodeId, nodeById, `${location}.nodeId`, 'node', error);
    if (nodeById.has(constraint.nodeId) && nodeById.get(constraint.nodeId).type !== 'constraint') {
      error(`${location}.nodeId`, 'Constraint register records must reference a node of type constraint.');
    }
    validateRefArray(constraint.affectsNodeIds, nodeById, `${location}.affectsNodeIds`, 'node', error);
    validateRefArray(constraint.mitigatedByNodeIds, nodeById, `${location}.mitigatedByNodeIds`, 'node', error);
    validateRefArray(constraint.relationshipIds, relationshipById, `${location}.relationshipIds`, 'relationship', error);
    validateConstraintStatus(constraint.status, `${location}.status`, sourceById, error);
    validateEvidenceArray(constraint.evidence, `${location}.evidence`, sourceById, error);
    if (Array.isArray(constraint.relationshipIds)) {
      for (const relationshipId of constraint.relationshipIds) {
        const edge = relationshipById.get(relationshipId);
        if (edge && edge.sourceNodeId !== constraint.nodeId && edge.targetNodeId !== constraint.nodeId) {
          error(`${location}.relationshipIds`, `Relationship ${relationshipId} does not touch constraint node ${constraint.nodeId}.`);
        }
      }
    }
  });

  document.applicationBranches.forEach((branch, index) => {
    const location = `$.applicationBranches[${index}]`;
    if (!isObject(branch)) {
      error(location, 'Must be an object.');
      return;
    }
    requireKeys(branch, ['id', 'title', 'summary', 'anchorNodeId', 'nodeIds', 'relationshipIds', 'constraintIds', 'status', 'sourceIds'], location, error);
    allowKeys(branch, ['id', 'title', 'summary', 'anchorNodeId', 'nodeIds', 'relationshipIds', 'constraintIds', 'status', 'sourceIds'], location, error);
    validateId(branch.id, `${location}.id`, error);
    validateText(branch.title, `${location}.title`, error);
    validateText(branch.summary, `${location}.summary`, error);
    validateRef(branch.anchorNodeId, nodeById, `${location}.anchorNodeId`, 'node', error);
    validateRefArray(branch.nodeIds, nodeById, `${location}.nodeIds`, 'node', error);
    validateRefArray(branch.relationshipIds, relationshipById, `${location}.relationshipIds`, 'relationship', error);
    validateRefArray(branch.constraintIds, constraintById, `${location}.constraintIds`, 'constraint', error);
    validateStatusAssessment(branch.status, `${location}.status`, sourceById, error);
    validateRefArray(branch.sourceIds, sourceById, `${location}.sourceIds`, 'source', error);
    const branchNodeIds = new Set(Array.isArray(branch.nodeIds) ? branch.nodeIds : []);
    if (!branchNodeIds.has(branch.anchorNodeId)) error(`${location}.nodeIds`, 'Must include anchorNodeId.');
    if (Array.isArray(branch.relationshipIds)) {
      for (const relationshipId of branch.relationshipIds) {
        const edge = relationshipById.get(relationshipId);
        if (edge && (!branchNodeIds.has(edge.sourceNodeId) || !branchNodeIds.has(edge.targetNodeId))) {
          error(`${location}.relationshipIds`, `Both endpoints of ${relationshipId} must appear in nodeIds.`);
        }
      }
    }
  });

  document.openOpportunities.forEach((opportunity, index) => {
    const location = `$.openOpportunities[${index}]`;
    if (!isObject(opportunity)) {
      error(location, 'Must be an object.');
      return;
    }
    const required = [
      'id', 'nodeId', 'title', 'summary', 'falsifiableQuestion', 'proposedMechanism', 'unmetNeed',
      'adjacentWorkSummary', 'noveltySearch', 'blockerConstraintIds', 'requiredComplementNodeIds',
      'minimalExperiment', 'baselines', 'disconfirmingResult', 'resources', 'crowdedness', 'tractability',
      'failureReasons', 'evidenceGrade', 'status', 'sourceIds'
    ];
    requireKeys(opportunity, required, location, error);
    allowKeys(opportunity, required, location, error);
    validateId(opportunity.id, `${location}.id`, error);
    validateRef(opportunity.nodeId, nodeById, `${location}.nodeId`, 'node', error);
    if (nodeById.has(opportunity.nodeId) && nodeById.get(opportunity.nodeId).type !== 'open_opportunity') {
      error(`${location}.nodeId`, 'Open-opportunity cards must reference a node of type open_opportunity.');
    }
    for (const field of ['title', 'summary', 'falsifiableQuestion', 'proposedMechanism', 'unmetNeed', 'adjacentWorkSummary', 'minimalExperiment', 'disconfirmingResult']) {
      validateText(opportunity[field], `${location}.${field}`, error);
    }
    if (opportunity.evidenceGrade !== 'hypothesis') error(`${location}.evidenceGrade`, 'Open opportunities must remain hypothesis-grade.');
    validateEnum(opportunity.status, SETS.openOpportunityStatuses, `${location}.status`, error);
    validateEnum(opportunity.crowdedness, SETS.opportunityRatings, `${location}.crowdedness`, error);
    validateEnum(opportunity.tractability, SETS.opportunityRatings, `${location}.tractability`, error);
    validateRefArray(opportunity.blockerConstraintIds, constraintById, `${location}.blockerConstraintIds`, 'constraint', error);
    validateRefArray(opportunity.requiredComplementNodeIds, nodeById, `${location}.requiredComplementNodeIds`, 'node', error);
    validateRefArray(opportunity.sourceIds, sourceById, `${location}.sourceIds`, 'source', error);
    validateNoveltySearch(opportunity.noveltySearch, `${location}.noveltySearch`, sourceById, error);
    if (!Array.isArray(opportunity.baselines) || opportunity.baselines.length === 0) error(`${location}.baselines`, 'Must name at least one comparison baseline.');
    for (const field of ['baselines', 'resources', 'failureReasons']) {
      validateTextArray(opportunity[field], `${location}.${field}`, error);
      validateUniqueArray(opportunity[field], `${location}.${field}`, error);
    }
  });

  document.unresolvedClaims.forEach((claim, index) => {
    const location = `$.unresolvedClaims[${index}]`;
    if (!isObject(claim)) {
      error(location, 'Must be an object.');
      return;
    }
    requireKeys(claim, ['id', 'claim', 'reason', 'status', 'relatedNodeIds', 'relatedRelationshipIds', 'sourceIds'], location, error);
    allowKeys(claim, ['id', 'claim', 'reason', 'status', 'relatedNodeIds', 'relatedRelationshipIds', 'sourceIds', 'notes'], location, error);
    validateId(claim.id, `${location}.id`, error);
    validateText(claim.claim, `${location}.claim`, error);
    validateEnum(claim.reason, SETS.unresolvedReasons, `${location}.reason`, error);
    validateEnum(claim.status, SETS.unresolvedStatuses, `${location}.status`, error);
    if (Object.hasOwn(claim, 'notes')) validateText(claim.notes, `${location}.notes`, error);
    validateRefArray(claim.relatedNodeIds, nodeById, `${location}.relatedNodeIds`, 'node', error);
    validateRefArray(claim.relatedRelationshipIds, relationshipById, `${location}.relatedRelationshipIds`, 'relationship', error);
    validateRefArray(claim.sourceIds, sourceById, `${location}.sourceIds`, 'source', error);
    if ((!Array.isArray(claim.relatedNodeIds) || claim.relatedNodeIds.length === 0) &&
        (!Array.isArray(claim.relatedRelationshipIds) || claim.relatedRelationshipIds.length === 0)) {
      error(location, 'An unresolved claim must reference at least one node or relationship.');
    }
  });

  validateAnchor(metadata, document.nodes, atlasNodeIds, error);
  validateRegisterCoverage(document, error);
  validateModeBounds(document, error);

  if (metadata && metadata.status === 'alpha') validateAlphaConnectivity(document, error);
  if (metadata && metadata.status === 'pending_research' && warnings.length === 0) {
    warn('$.metadata.status', 'The data is a deliberately empty research scaffold, not a populated Opportunity View.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    counts: {
      nodes: document.nodes.length,
      relationships: document.relationships.length,
      sources: document.sources.length,
      applicationBranches: document.applicationBranches.length,
      constraints: document.constraints.length,
      openOpportunities: document.openOpportunities.length,
      unresolvedClaims: document.unresolvedClaims.length
    }
  };
}

function validateMetadata(metadata, error) {
  const location = '$.metadata';
  if (!isObject(metadata)) {
    error(location, 'Must be an object.');
    return;
  }
  const required = ['id', 'title', 'anchorAtlasNodeId', 'asOf', 'status', 'summary', 'timeDomain', 'visualBands', 'importStatus', 'pathWidthMode'];
  requireKeys(metadata, required, location, error);
  allowKeys(metadata, required, location, error);
  validateId(metadata.id, `${location}.id`, error);
  validateId(metadata.anchorAtlasNodeId, `${location}.anchorAtlasNodeId`, error);
  validateText(metadata.title, `${location}.title`, error);
  validateText(metadata.summary, `${location}.summary`, error);
  validateDate(metadata.asOf, `${location}.asOf`, error);
  validateEnum(metadata.status, SETS.metadataStatuses, `${location}.status`, error);
  if (metadata.pathWidthMode !== 'fixed') error(`${location}.pathWidthMode`, 'Must equal fixed so line width never implies quantitative flow.');
  if (!isObject(metadata.timeDomain)) {
    error(`${location}.timeDomain`, 'Must be an object.');
  } else {
    const domain = metadata.timeDomain;
    requireKeys(domain, ['startYear', 'endYear'], `${location}.timeDomain`, error);
    allowKeys(domain, ['startYear', 'endYear', 'focusStartYear'], `${location}.timeDomain`, error);
    for (const field of ['startYear', 'endYear']) validateYear(domain[field], `${location}.timeDomain.${field}`, error);
    if (Number.isInteger(domain.startYear) && Number.isInteger(domain.endYear) && domain.startYear > domain.endYear) error(`${location}.timeDomain`, 'startYear must not follow endYear.');
    if (Object.hasOwn(domain, 'focusStartYear')) {
      validateYear(domain.focusStartYear, `${location}.timeDomain.focusStartYear`, error);
      if (Number.isInteger(domain.focusStartYear) && Number.isInteger(domain.startYear) && Number.isInteger(domain.endYear) &&
          (domain.focusStartYear < domain.startYear || domain.focusStartYear > domain.endYear)) {
        error(`${location}.timeDomain.focusStartYear`, 'Must fall inside the time domain.');
      }
    }
  }
  if (!Array.isArray(metadata.visualBands) || metadata.visualBands.length === 0) error(`${location}.visualBands`, 'Must contain at least one band.');
  if (!isObject(metadata.importStatus)) {
    error(`${location}.importStatus`, 'Must be an object.');
  } else {
    const importStatus = metadata.importStatus;
    requireKeys(importStatus, ['state', 'notes'], `${location}.importStatus`, error);
    allowKeys(importStatus, ['state', 'notes', 'reportId', 'reportAsOf', 'reportUrl', 'importedAt'], `${location}.importStatus`, error);
    validateEnum(importStatus.state, SETS.importStatuses, `${location}.importStatus.state`, error);
    validateText(importStatus.notes, `${location}.importStatus.notes`, error);
    if (Object.hasOwn(importStatus, 'reportId')) validateText(importStatus.reportId, `${location}.importStatus.reportId`, error);
    if (Object.hasOwn(importStatus, 'reportAsOf')) validateDate(importStatus.reportAsOf, `${location}.importStatus.reportAsOf`, error);
    if (Object.hasOwn(importStatus, 'reportUrl')) validateHttpsUrl(importStatus.reportUrl, `${location}.importStatus.reportUrl`, error);
    if (Object.hasOwn(importStatus, 'importedAt')) validateDateTime(importStatus.importedAt, `${location}.importStatus.importedAt`, error);
  }
}

function validateBands(metadata, bandById, error) {
  if (!isObject(metadata) || !Array.isArray(metadata.visualBands)) return;
  const orders = new Set();
  const typeCounts = new Map(ENUMS.nodeTypes.map(type => [type, 0]));
  metadata.visualBands.forEach((band, index) => {
    const location = `$.metadata.visualBands[${index}]`;
    if (!isObject(band)) {
      error(location, 'Must be an object.');
      return;
    }
    requireKeys(band, ['id', 'label', 'order', 'nodeTypes'], location, error);
    allowKeys(band, ['id', 'label', 'description', 'order', 'nodeTypes'], location, error);
    validateId(band.id, `${location}.id`, error);
    validateText(band.label, `${location}.label`, error);
    if (Object.hasOwn(band, 'description')) validateText(band.description, `${location}.description`, error);
    if (!Number.isInteger(band.order) || band.order < 0) error(`${location}.order`, 'Must be a non-negative integer.');
    if (orders.has(band.order)) error(`${location}.order`, `Duplicate band order ${band.order}.`);
    orders.add(band.order);
    if (!Array.isArray(band.nodeTypes) || band.nodeTypes.length === 0) {
      error(`${location}.nodeTypes`, 'Must contain at least one node type.');
    } else {
      for (const type of band.nodeTypes) {
        validateEnum(type, SETS.nodeTypes, `${location}.nodeTypes`, error);
        if (typeCounts.has(type)) typeCounts.set(type, typeCounts.get(type) + 1);
      }
      validateUniqueArray(band.nodeTypes, `${location}.nodeTypes`, error);
    }
  });
  for (const [type, count] of typeCounts) {
    if (count !== 1) error('$.metadata.visualBands', `Node type ${type} must occur in exactly one visual band; found ${count}.`);
  }
  if (bandById.size !== metadata.visualBands.length) error('$.metadata.visualBands', 'Visual band identifiers must be unique.');
}

function validateSources(sources, error) {
  sources.forEach((source, index) => {
    const location = `$.sources[${index}]`;
    if (!isObject(source)) {
      error(location, 'Must be an object.');
      return;
    }
    requireKeys(source, ['id', 'type', 'title', 'url'], location, error);
    allowKeys(source, ['id', 'type', 'title', 'authors', 'year', 'url', 'doi', 'arxivId', 'citation', 'accessedAt', 'notes'], location, error);
    validateId(source.id, `${location}.id`, error);
    validateEnum(source.type, SETS.sourceTypes, `${location}.type`, error);
    validateText(source.title, `${location}.title`, error);
    validateHttpsUrl(source.url, `${location}.url`, error);
    if (Object.hasOwn(source, 'year')) validateYear(source.year, `${location}.year`, error);
    if (Object.hasOwn(source, 'authors')) validateTextArray(source.authors, `${location}.authors`, error);
    if (Object.hasOwn(source, 'doi') && (typeof source.doi !== 'string' || !/^10\.[0-9]{4,9}\/\S+$/.test(source.doi))) {
      error(`${location}.doi`, 'Must be a DOI beginning with 10., a 4–9 digit registrant code, and a non-space suffix.');
    }
    if (Object.hasOwn(source, 'arxivId') && (typeof source.arxivId !== 'string' || !/^(?:[a-z-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?$/.test(source.arxivId))) {
      error(`${location}.arxivId`, 'Must be a canonical legacy or modern arXiv identifier, optionally with a version suffix.');
    }
    if (Object.hasOwn(source, 'citation')) validateText(source.citation, `${location}.citation`, error);
    if (Object.hasOwn(source, 'accessedAt')) validateDate(source.accessedAt, `${location}.accessedAt`, error);
    if (Object.hasOwn(source, 'notes')) validateText(source.notes, `${location}.notes`, error);
  });
}

function validateYearFields(node, location, metadata, error) {
  for (const field of ['year', 'yearEnd']) {
    if (Object.hasOwn(node, field)) validateYear(node[field], `${location}.${field}`, error);
  }
  if (Number.isInteger(node.year) && Number.isInteger(node.yearEnd) && node.yearEnd < node.year) error(`${location}.yearEnd`, 'Must not precede year.');
  if (isObject(metadata) && isObject(metadata.timeDomain)) {
    for (const field of ['year', 'yearEnd']) {
      if (Number.isInteger(node[field]) && Number.isInteger(metadata.timeDomain.startYear) && Number.isInteger(metadata.timeDomain.endYear) &&
          (node[field] < metadata.timeDomain.startYear || node[field] > metadata.timeDomain.endYear)) {
        error(`${location}.${field}`, 'Falls outside metadata.timeDomain; expand the domain before importing this node.');
      }
    }
  }
  if (Object.hasOwn(node, 'yearPrecision')) {
    validateEnum(node.yearPrecision, SETS.yearPrecisions, `${location}.yearPrecision`, error);
    if (node.yearPrecision === 'undated' && (Object.hasOwn(node, 'year') || Object.hasOwn(node, 'yearEnd'))) {
      error(`${location}.yearPrecision`, 'undated nodes must not declare year or yearEnd.');
    }
    if (node.yearPrecision === 'range' && (!Number.isInteger(node.year) || !Number.isInteger(node.yearEnd))) {
      error(`${location}.yearPrecision`, 'range precision requires both year and yearEnd.');
    }
    if (['exact', 'year', 'ongoing'].includes(node.yearPrecision) && !Number.isInteger(node.year)) {
      error(`${location}.yearPrecision`, `${node.yearPrecision} precision requires year.`);
    }
    if (['exact', 'year', 'ongoing'].includes(node.yearPrecision) && Object.hasOwn(node, 'yearEnd')) {
      error(`${location}.yearEnd`, `${node.yearPrecision} precision must not declare yearEnd.`);
    }
  }
}

function validateStatusAssessment(status, location, sourceById, error) {
  if (!isObject(status)) {
    error(location, 'Must be an object.');
    return;
  }
  requireKeys(status, ['state', 'scope', 'evidenceGrade', 'sourceIds'], location, error);
  allowKeys(status, ['state', 'scope', 'evidenceGrade', 'sourceIds', 'note'], location, error);
  validateEnum(status.state, SETS.opportunityStatuses, `${location}.state`, error);
  validateText(status.scope, `${location}.scope`, error);
  validateEnum(status.evidenceGrade, SETS.evidenceGrades, `${location}.evidenceGrade`, error);
  validateRefArray(status.sourceIds, sourceById, `${location}.sourceIds`, 'source', error);
  if (Object.hasOwn(status, 'note')) validateText(status.note, `${location}.note`, error);
  if (status.state === 'not_yet_assessed' && status.evidenceGrade !== 'unassessed') error(location, 'not_yet_assessed requires unassessed evidenceGrade.');
  if (status.evidenceGrade === 'unassessed' && status.state !== 'not_yet_assessed') error(location, 'unassessed evidenceGrade may not support a substantive opportunity status.');
  if (['direct', 'partial', 'contextual'].includes(status.evidenceGrade) && (!Array.isArray(status.sourceIds) || status.sourceIds.length === 0)) error(`${location}.sourceIds`, `${status.evidenceGrade} status evidence requires at least one source.`);
}

function validateConstraintStatus(status, location, sourceById, error) {
  if (!isObject(status)) {
    error(location, 'Must be an object.');
    return;
  }
  requireKeys(status, ['state', 'scope', 'evidenceGrade', 'sourceIds'], location, error);
  allowKeys(status, ['state', 'scope', 'evidenceGrade', 'sourceIds'], location, error);
  validateEnum(status.state, SETS.constraintStatuses, `${location}.state`, error);
  validateText(status.scope, `${location}.scope`, error);
  validateEnum(status.evidenceGrade, SETS.evidenceGrades, `${location}.evidenceGrade`, error);
  validateRefArray(status.sourceIds, sourceById, `${location}.sourceIds`, 'source', error);
  if (status.state === 'not_yet_assessed' && status.evidenceGrade !== 'unassessed') error(location, 'not_yet_assessed requires unassessed evidenceGrade.');
  if (status.evidenceGrade === 'unassessed' && status.state !== 'not_yet_assessed') error(location, 'unassessed evidenceGrade may not support a substantive constraint status.');
  if (['direct', 'partial', 'contextual'].includes(status.evidenceGrade) && (!Array.isArray(status.sourceIds) || status.sourceIds.length === 0)) error(`${location}.sourceIds`, `${status.evidenceGrade} constraint status evidence requires at least one source.`);
}

function validateEvidenceArray(evidence, location, sourceById, error) {
  if (!Array.isArray(evidence)) {
    error(location, 'Must be an array.');
    return;
  }
  evidence.forEach((item, index) => validateEvidence(item, `${location}[${index}]`, sourceById, error));
}

function validateEvidence(evidence, location, sourceById, error) {
  if (!isObject(evidence)) {
    error(location, 'Must be an object.');
    return;
  }
  requireKeys(evidence, ['type', 'grade', 'claim', 'sourceIds'], location, error);
  allowKeys(evidence, ['type', 'grade', 'claim', 'sourceIds', 'note'], location, error);
  validateEnum(evidence.type, SETS.evidenceTypes, `${location}.type`, error);
  validateEnum(evidence.grade, SETS.evidenceGrades, `${location}.grade`, error);
  validateText(evidence.claim, `${location}.claim`, error);
  validateRefArray(evidence.sourceIds, sourceById, `${location}.sourceIds`, 'source', error);
  if (Object.hasOwn(evidence, 'note')) validateText(evidence.note, `${location}.note`, error);
  if (['direct', 'partial', 'contextual'].includes(evidence.grade) && (!Array.isArray(evidence.sourceIds) || evidence.sourceIds.length === 0)) error(`${location}.sourceIds`, `${evidence.grade} evidence requires at least one source.`);
  if (evidence.type === 'primary_source' && (!Array.isArray(evidence.sourceIds) || evidence.sourceIds.length === 0)) error(`${location}.sourceIds`, 'primary_source evidence requires at least one source.');
  if (evidence.type === 'no_source_found' && ['direct', 'partial'].includes(evidence.grade)) error(location, 'no_source_found cannot be direct or partial evidence.');
}

function validateRelationshipEvidenceConsistency(relationship, location, error) {
  if (!isObject(relationship.evidence)) return;
  const grade = relationship.evidence.grade;
  if (relationship.status === 'hypothesis' && grade !== 'hypothesis') error(location, 'A hypothesis relationship requires hypothesis evidence grade.');
  if (grade === 'hypothesis' && relationship.status !== 'hypothesis') error(location, 'Hypothesis evidence grade requires hypothesis relationship status.');
  if (relationship.status === 'unassessed' && grade !== 'unassessed') error(location, 'An unassessed relationship requires unassessed evidence grade.');
  if (grade === 'unassessed' && relationship.status !== 'unassessed') error(location, 'Unassessed evidence grade requires unassessed relationship status.');
  if (relationship.type === 'candidate_application' && (relationship.status !== 'hypothesis' || grade !== 'hypothesis')) error(location, 'candidate_application must remain explicitly hypothesis-grade.');
  if (relationship.type === 'documented_historical_influence' && grade === 'hypothesis') error(location, 'A hypothetical edge cannot be labeled documented_historical_influence.');
}

function validateAtlasLinks(links, location, atlasNodeIds, error) {
  if (!Array.isArray(links)) {
    error(location, 'Must be an array of typed atlas links.');
    return;
  }
  const signatures = new Set();
  links.forEach((link, index) => {
    const itemLocation = `${location}[${index}]`;
    if (!isObject(link)) {
      error(itemLocation, 'Must be an object with atlasNodeId and relation.');
      return;
    }
    requireKeys(link, ['atlasNodeId', 'relation'], itemLocation, error);
    allowKeys(link, ['atlasNodeId', 'relation', 'note'], itemLocation, error);
    validateId(link.atlasNodeId, `${itemLocation}.atlasNodeId`, error);
    validateEnum(link.relation, SETS.atlasLinkRelations, `${itemLocation}.relation`, error);
    if (Object.hasOwn(link, 'note')) validateText(link.note, `${itemLocation}.note`, error);
    if (atlasNodeIds.size > 0 && !atlasNodeIds.has(link.atlasNodeId)) error(`${itemLocation}.atlasNodeId`, `Unknown atlas node ${link.atlasNodeId}.`);
    const signature = `${link.atlasNodeId}\u0000${link.relation}`;
    if (signatures.has(signature)) error(itemLocation, 'Duplicate typed atlas link.');
    signatures.add(signature);
  });
}

function validateNoveltySearch(search, location, sourceById, error) {
  if (!isObject(search)) {
    error(location, 'Must be an object.');
    return;
  }
  requireKeys(search, ['status', 'scope', 'result', 'sourceIds'], location, error);
  allowKeys(search, ['status', 'scope', 'asOf', 'result', 'sourceIds'], location, error);
  validateEnum(search.status, SETS.noveltySearchStatuses, `${location}.status`, error);
  validateText(search.scope, `${location}.scope`, error);
  validateText(search.result, `${location}.result`, error);
  if (Object.hasOwn(search, 'asOf')) validateDate(search.asOf, `${location}.asOf`, error);
  validateRefArray(search.sourceIds, sourceById, `${location}.sourceIds`, 'source', error);
  if (search.status === 'completed') {
    if (!Object.hasOwn(search, 'asOf')) error(`${location}.asOf`, 'A completed novelty search must record its as-of date.');
    if (!Array.isArray(search.sourceIds) || search.sourceIds.length === 0) error(`${location}.sourceIds`, 'A completed novelty search must record at least one source.');
  }
}

function validateAnchor(metadata, nodes, atlasNodeIds, error) {
  if (!isObject(metadata)) return;
  if (atlasNodeIds.size > 0 && !atlasNodeIds.has(metadata.anchorAtlasNodeId)) error('$.metadata.anchorAtlasNodeId', `Unknown atlas node ${metadata.anchorAtlasNodeId}.`);
  const anchorNodes = nodes.filter(node => isObject(node) && Array.isArray(node.atlasLinks) && node.atlasLinks.some(link => link && link.atlasNodeId === metadata.anchorAtlasNodeId && link.relation === 'same_as'));
  if (anchorNodes.length !== 1) error('$.nodes', `Exactly one opportunity node must have a same_as atlas link to ${metadata.anchorAtlasNodeId}; found ${anchorNodes.length}.`);
  if (anchorNodes.length === 1 && anchorNodes[0].type !== 'core_development') error('$.nodes', 'The cross-view anchor must be a core_development node.');
}

function validateRegisterCoverage(document, error) {
  if (isObject(document.metadata) && document.metadata.status === 'pending_research') return;
  const constraintNodeIds = new Set(document.nodes.filter(node => node && node.type === 'constraint').map(node => node.id));
  const registeredConstraintNodeIds = new Set(document.constraints.map(record => record && record.nodeId));
  for (const id of constraintNodeIds) if (!registeredConstraintNodeIds.has(id)) error('$.constraints', `Constraint node ${id} lacks a constraint register record.`);
  for (const id of registeredConstraintNodeIds) if (!constraintNodeIds.has(id)) error('$.constraints', `Constraint register node ${id} is not typed constraint.`);
  const opportunityNodeIds = new Set(document.nodes.filter(node => node && node.type === 'open_opportunity').map(node => node.id));
  const cardNodeIds = new Set(document.openOpportunities.map(card => card && card.nodeId));
  for (const id of opportunityNodeIds) if (!cardNodeIds.has(id)) error('$.openOpportunities', `Open-opportunity node ${id} lacks an opportunity card.`);
  for (const id of cardNodeIds) if (!opportunityNodeIds.has(id)) error('$.openOpportunities', `Opportunity card node ${id} is not typed open_opportunity.`);
}

function validateModeBounds(document, error) {
  const status = document.metadata && document.metadata.status;
  const importState = document.metadata && document.metadata.importStatus && document.metadata.importStatus.state;
  if (document.applicationBranches.length > 8) error('$.applicationBranches', 'At most eight application branches are allowed in this bounded view.');
  if (document.openOpportunities.length > 10) error('$.openOpportunities', 'At most ten open opportunities are allowed; do not pad the map.');
  if (status === 'pending_research') {
    if (document.nodes.length !== 1) error('$.nodes', 'A pending scaffold must contain exactly one core anchor node.');
    if (document.nodes.length === 1 && (!isObject(document.nodes[0]) || document.nodes[0].type !== 'core_development')) error('$.nodes[0].type', 'The sole pending node must be core_development.');
    for (const name of ['relationships', 'sources', 'applicationBranches', 'constraints', 'openOpportunities', 'unresolvedClaims']) {
      if (document[name].length !== 0) error(`$.${name}`, 'Must be empty while metadata.status is pending_research.');
    }
    if (!['not_started', 'in_progress'].includes(importState)) error('$.metadata.importStatus.state', 'Pending research requires not_started or in_progress import state.');
    const node = document.nodes[0];
    if (isObject(node) && (!isObject(node.status) || node.status.state !== 'not_yet_assessed' || node.status.evidenceGrade !== 'unassessed')) error('$.nodes[0].status', 'The pending anchor must remain explicitly not_yet_assessed and unassessed.');
    if (node && Array.isArray(node.evidence) && node.evidence.length !== 0) error('$.nodes[0].evidence', 'The pending anchor must not carry research claims.');
  }
  if (status === 'alpha') {
    if (document.nodes.length < 35 || document.nodes.length > 60) error('$.nodes', 'A populated alpha must contain 35–60 curated nodes.');
    if (document.relationships.length < 60 || document.relationships.length > 100) error('$.relationships', 'A populated alpha must contain 60–100 relationships.');
    if (document.sources.length < 1) error('$.sources', 'A populated alpha must cite sources.');
    if (document.applicationBranches.length < 1) error('$.applicationBranches', 'A populated alpha must contain at least one application branch.');
    if (!['imported_unreviewed', 'validated'].includes(importState)) error('$.metadata.importStatus.state', 'Alpha data requires imported_unreviewed or validated import state.');
  }
}

function validateAlphaConnectivity(document, error) {
  const nodeIds = new Set(document.nodes.filter(isObject).map(node => node.id).filter(id => typeof id === 'string'));
  const adjacency = new Map([...nodeIds].map(id => [id, new Set()]));
  for (const edge of document.relationships) {
    if (!isObject(edge)) continue;
    if (!adjacency.has(edge.sourceNodeId) || !adjacency.has(edge.targetNodeId)) continue;
    adjacency.get(edge.sourceNodeId).add(edge.targetNodeId);
    adjacency.get(edge.targetNodeId).add(edge.sourceNodeId);
  }
  const anchor = document.nodes.find(node => isObject(node) && Array.isArray(node.atlasLinks) && node.atlasLinks.some(link => link && link.relation === 'same_as' && link.atlasNodeId === document.metadata.anchorAtlasNodeId));
  if (!anchor) return;
  const visited = new Set([anchor.id]);
  const queue = [anchor.id];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of adjacency.get(current) || []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  const unreachable = [...nodeIds].filter(id => !visited.has(id));
  if (unreachable.length > 0) error('$.relationships', `Every alpha node must connect to the anchor; unreachable: ${unreachable.join(', ')}.`);
}

function isSafeHttpsUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname) && !parsed.username && !parsed.password && !/[\u0000-\u001f\u007f]/.test(value);
  } catch {
    return false;
  }
}

function collectGlobalIds(value, location, ids, error) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectGlobalIds(item, `${location}[${index}]`, ids, error));
    return;
  }
  if (!isObject(value)) return;
  if (Object.hasOwn(value, 'id')) {
    validateId(value.id, `${location}.id`, error);
    if (typeof value.id === 'string') {
      if (ids.has(value.id)) error(`${location}.id`, `Duplicate record id ${value.id}; first used at ${ids.get(value.id)}.`);
      else ids.set(value.id, `${location}.id`);
    }
  }
  for (const [key, child] of Object.entries(value)) collectGlobalIds(child, `${location}.${key}`, ids, error);
}

function indexById(records) {
  const result = new Map();
  for (const record of records) if (isObject(record) && typeof record.id === 'string' && !result.has(record.id)) result.set(record.id, record);
  return result;
}

function requireKeys(value, keys, location, error) {
  if (!isObject(value)) return;
  for (const key of keys) if (!Object.hasOwn(value, key)) error(location, `Missing required property ${key}.`);
}

function allowKeys(value, keys, location, error) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) error(`${location}.${key}`, 'Unknown property.');
}

function validateId(value, location, error) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) error(location, 'Must be a stable lowercase record id using letters, numbers, periods, underscores, colons, or hyphens.');
}

function validateText(value, location, error) {
  if (typeof value !== 'string' || !value.trim()) error(location, 'Must be a non-empty string.');
}

function validateTextArray(value, location, error) {
  if (!Array.isArray(value)) {
    error(location, 'Must be an array.');
    return;
  }
  value.forEach((item, index) => validateText(item, `${location}[${index}]`, error));
}

function validateYear(value, location, error) {
  if (!Number.isInteger(value) || value < 1800 || value > 2100) error(location, 'Must be an integer from 1800 through 2100.');
}

function validateHttpsUrl(value, location, error) {
  if (typeof value !== 'string' || !isSafeHttpsUrl(value)) error(location, 'Must be an absolute HTTPS URL without embedded credentials.');
}

function validateEnum(value, allowed, location, error) {
  if (!allowed.has(value)) error(location, `Unsupported value ${JSON.stringify(value)}.`);
}

function validateDate(value, location, error) {
  if (!isCalendarDate(value)) error(location, 'Must be an ISO 8601 calendar date (YYYY-MM-DD).');
}

function validateDateTime(value, location, error) {
  const dateTimePattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  const datePart = typeof value === 'string' ? value.slice(0, 10) : '';
  if (typeof value !== 'string' || !dateTimePattern.test(value) || !isCalendarDate(datePart) || Number.isNaN(Date.parse(value))) {
    error(location, 'Must be an RFC 3339 date-time with a UTC or numeric offset.');
  }
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateUniqueArray(values, location, error) {
  if (!Array.isArray(values)) return;
  if (new Set(values).size !== values.length) error(location, 'Must not contain duplicate values.');
}

function validateRef(value, index, location, kind, error) {
  validateId(value, location, error);
  if (typeof value === 'string' && !index.has(value)) error(location, `Unknown ${kind} id ${value}.`);
}

function validateRefArray(values, index, location, kind, error) {
  if (!Array.isArray(values)) {
    error(location, 'Must be an array.');
    return;
  }
  validateUniqueArray(values, location, error);
  values.forEach((value, itemIndex) => validateRef(value, index, `${location}[${itemIndex}]`, kind, error));
}

function assertOpportunityData(document, options = {}) {
  const result = validateOpportunityData(document, options);
  if (!result.valid) {
    const details = result.errors.map(item => `${item.location}: ${item.message}`).join('\n');
    const validationError = new Error(`Opportunity data validation failed with ${result.errors.length} error(s):\n${details}`);
    validationError.code = 'ERR_OPPORTUNITY_DATA';
    validationError.validation = result;
    throw validationError;
  }
  return result;
}

function main(argv = process.argv.slice(2)) {
  const dataFile = path.resolve(argv[0] || DEFAULT_DATA_FILE);
  const atlasFile = path.resolve(argv[1] || DEFAULT_ATLAS_FILE);
  try {
    const data = readJson(dataFile);
    const atlasData = readJson(atlasFile);
    const result = assertOpportunityData(data, { atlasData });
    console.log(JSON.stringify({
      status: 'PASS',
      file: path.relative(ROOT, dataFile).replace(/\\/g, '/'),
      atlas: path.relative(ROOT, atlasFile).replace(/\\/g, '/'),
      schemaVersion: data.schemaVersion,
      dataStatus: data.metadata.status,
      importStatus: data.metadata.importStatus.state,
      pathWidthMode: data.metadata.pathWidthMode,
      counts: result.counts,
      warnings: result.warnings.map(item => `${item.location}: ${item.message}`)
    }, null, 2));
  } catch (validationError) {
    console.error(validationError && validationError.stack ? validationError.stack : String(validationError));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  DEFAULT_ATLAS_FILE,
  DEFAULT_DATA_FILE,
  ENUMS,
  ID_PATTERN,
  SCHEMA_VERSION,
  assertOpportunityData,
  collectAtlasNodeIds,
  isSafeHttpsUrl,
  readJson,
  validateOpportunityData
};
