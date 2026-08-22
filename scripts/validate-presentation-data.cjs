'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PRESENTATION_PATH = path.join(ROOT, 'src', 'ui', 'atlas-presentation.v1.json');
const CANONICAL_PATH = path.join(ROOT, 'ai-research-tech-tree.json');

const EXPECTED_TOURS = new Map([
  [
    'foundations-to-transformers',
    ['turing36', 'dartmouth', 'perceptron', 'backprop', 'imagenet', 'alexnet', 'transformer']
  ],
  [
    'two-winters-and-revivals',
    ['dartmouth', 'perceptronsbook', 'lighthill', 'expertshells', 'aiwinter2', 'backprop', 'alexnet']
  ],
  [
    'scaling-era',
    ['moore', 'gpgpu', 'imagenet', 'alexnet', 'transformer', 'scalinglaws', 'gpt3', 'frontier26']
  ],
  [
    'reinforcement-keeps-returning',
    ['mdp', 'qlearning', 'policygrad', 'tdgammon', 'dqn', 'alphago', 'rlhf', 'agentsllm']
  ],
  [
    'diffusion-decade',
    ['vae', 'gan', 'diffusion', 'txt2img', 'dit', 'diffusionllm']
  ],
  [
    'agents-and-alignment',
    ['friendlyai', 'rlhf', 'constitutional', 'agentsllm', 'agentbench', 'aicontrol', 'selfgenagents', 'gap_agents']
  ]
]);

const FORBIDDEN_CANONICAL_KEYS = new Set([
  'chronology',
  'claimFingerprint',
  'description',
  'direction',
  'evidenceAssessmentId',
  'evidenceAssessmentIds',
  'evidenceGrade',
  'legacyKind',
  'origin',
  'rationale',
  'relationshipType',
  'research',
  'reviewed',
  'sourceNodeId',
  'status',
  'targetNodeId'
]);

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not parse ${path.relative(ROOT, filePath)}: ${error.message}`);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value, allowedKeys, label) {
  invariant(isPlainObject(value), `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...allowedKeys].sort();
  invariant(
    actual.length === expected.length && actual.every((key, index) => key === expected[index]),
    `${label} must contain exactly: ${expected.join(', ')}; found: ${actual.join(', ')}.`
  );
}

function assertText(value, label, minimumLength, maximumLength) {
  invariant(typeof value === 'string', `${label} must be a string.`);
  invariant(value === value.trim(), `${label} must not have leading or trailing whitespace.`);
  invariant(value.length >= minimumLength, `${label} must be at least ${minimumLength} characters.`);
  invariant(value.length <= maximumLength, `${label} must be at most ${maximumLength} characters.`);
  invariant(!/[<>]/u.test(value), `${label} must be plain text, not markup.`);
}

function assertNoCanonicalOverrides(value, location = 'presentation') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoCanonicalOverrides(entry, `${location}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;

  for (const [key, child] of Object.entries(value)) {
    invariant(
      !FORBIDDEN_CANONICAL_KEYS.has(key),
      `${location}.${key} is canonical evidence or node metadata and is forbidden in presentation data.`
    );
    assertNoCanonicalOverrides(child, `${location}.${key}`);
  }
}

function resolveOneBasedStep(tour, stepNumber) {
  if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > tour.steps.length) {
    return null;
  }
  return tour.steps[stepNumber - 1];
}

function validate() {
  const presentation = readJson(PRESENTATION_PATH);
  const canonical = readJson(CANONICAL_PATH);

  assertExactKeys(
    presentation,
    ['schemaVersion', 'reviewStatus', 'anchors', 'backboneRelationshipIds', 'tours'],
    'presentation'
  );
  assertNoCanonicalOverrides(presentation);
  invariant(presentation.schemaVersion === '1.0.0', 'schemaVersion must be exactly "1.0.0".');
  invariant(
    presentation.reviewStatus === 'candidate_pending_owner_review',
    'reviewStatus must remain "candidate_pending_owner_review" until the repository owner approves the inventory.'
  );

  invariant(Array.isArray(canonical.nodes), 'Canonical export must contain a nodes array.');
  invariant(Array.isArray(canonical.relationships), 'Canonical export must contain a relationships array.');
  invariant(Array.isArray(canonical.lanes), 'Canonical export must contain a lanes array.');

  const nodesById = new Map(canonical.nodes.map((node) => [node.id, node]));
  const relationshipsById = new Map(
    canonical.relationships.map((relationship) => [relationship.id, relationship])
  );
  invariant(nodesById.size === canonical.nodes.length, 'Canonical node IDs must be unique.');
  invariant(
    relationshipsById.size === canonical.relationships.length,
    'Canonical relationship IDs must be unique.'
  );

  invariant(Array.isArray(presentation.anchors), 'anchors must be an array.');
  invariant(presentation.anchors.length === 24, 'anchors must contain exactly 24 entries.');
  const anchorIds = new Set();
  presentation.anchors.forEach((anchor, index) => {
    const label = `anchors[${index}]`;
    assertExactKeys(anchor, ['nodeId', 'labelPriority'], label);
    invariant(typeof anchor.nodeId === 'string' && anchor.nodeId.length > 0, `${label}.nodeId is required.`);
    invariant(nodesById.has(anchor.nodeId), `${label}.nodeId "${anchor.nodeId}" is not canonical.`);
    invariant(!anchorIds.has(anchor.nodeId), `${label}.nodeId "${anchor.nodeId}" is duplicated.`);
    invariant(
      Number.isInteger(anchor.labelPriority) && anchor.labelPriority === index + 1,
      `${label}.labelPriority must equal its 1-based array position (${index + 1}).`
    );
    anchorIds.add(anchor.nodeId);
  });

  const canonicalLaneIds = new Set(canonical.lanes.map((lane) => lane.id));
  const anchoredLaneIds = new Set(
    presentation.anchors.map((anchor) => nodesById.get(anchor.nodeId).laneId)
  );
  const uncoveredLanes = [...canonicalLaneIds].filter((laneId) => !anchoredLaneIds.has(laneId));
  invariant(
    uncoveredLanes.length === 0,
    `The anchor inventory must represent every canonical lane; missing: ${uncoveredLanes.join(', ')}.`
  );

  invariant(
    Array.isArray(presentation.backboneRelationshipIds),
    'backboneRelationshipIds must be an array.'
  );
  invariant(
    presentation.backboneRelationshipIds.length === 72,
    'backboneRelationshipIds must contain exactly 72 entries.'
  );
  const backboneIds = new Set();
  const backboneRelationships = presentation.backboneRelationshipIds.map((relationshipId, index) => {
    invariant(
      typeof relationshipId === 'string' && relationshipId.length > 0,
      `backboneRelationshipIds[${index}] must be a non-empty string.`
    );
    invariant(
      !backboneIds.has(relationshipId),
      `backboneRelationshipIds[${index}] duplicates "${relationshipId}".`
    );
    invariant(
      relationshipsById.has(relationshipId),
      `backboneRelationshipIds[${index}] "${relationshipId}" is not canonical.`
    );
    backboneIds.add(relationshipId);
    const relationship = relationshipsById.get(relationshipId);
    invariant(
      relationship.relationshipType !== 'proposed_combination' && relationship.evidenceGrade !== 'hypothesis',
      `Backbone relationship "${relationshipId}" is speculative and cannot be promoted into the orientation spine.`
    );
    invariant(
      relationship.evidenceGrade !== 'unassessed',
      `Backbone relationship "${relationshipId}" is unassessed and requires evidence review before persistent display.`
    );
    return relationship;
  });

  const uncoveredAnchors = [...anchorIds].filter(
    (nodeId) =>
      !backboneRelationships.some(
        (relationship) =>
          relationship.sourceNodeId === nodeId || relationship.targetNodeId === nodeId
      )
  );
  invariant(
    uncoveredAnchors.length === 0,
    `Every anchor must be incident to the orientation spine; missing: ${uncoveredAnchors.join(', ')}.`
  );

  invariant(Array.isArray(presentation.tours), 'tours must be an array.');
  invariant(
    presentation.tours.length === EXPECTED_TOURS.size,
    `tours must contain exactly ${EXPECTED_TOURS.size} entries.`
  );
  const tourSlugs = new Set();
  let tourStepCount = 0;
  presentation.tours.forEach((tour, tourIndex) => {
    const label = `tours[${tourIndex}]`;
    assertExactKeys(tour, ['slug', 'title', 'summary', 'steps'], label);
    invariant(
      typeof tour.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(tour.slug),
      `${label}.slug must be a lowercase kebab-case slug.`
    );
    invariant(EXPECTED_TOURS.has(tour.slug), `${label}.slug "${tour.slug}" is not an approved tour.`);
    invariant(!tourSlugs.has(tour.slug), `${label}.slug "${tour.slug}" is duplicated.`);
    assertText(tour.title, `${label}.title`, 3, 80);
    assertText(tour.summary, `${label}.summary`, 20, 220);
    invariant(Array.isArray(tour.steps), `${label}.steps must be an array.`);

    const expectedNodeIds = EXPECTED_TOURS.get(tour.slug);
    invariant(
      tour.steps.length === expectedNodeIds.length,
      `${label}.steps must contain ${expectedNodeIds.length} approved steps.`
    );
    const tourNodeIds = new Set();
    tour.steps.forEach((step, stepIndex) => {
      const stepLabel = `${label}.steps[${stepIndex}]`;
      assertExactKeys(step, ['stepNumber', 'nodeId', 'narration'], stepLabel);
      invariant(
        step.stepNumber === stepIndex + 1,
        `${stepLabel}.stepNumber must be the 1-based index ${stepIndex + 1}.`
      );
      invariant(
        step.nodeId === expectedNodeIds[stepIndex],
        `${stepLabel}.nodeId must be approved node "${expectedNodeIds[stepIndex]}".`
      );
      invariant(nodesById.has(step.nodeId), `${stepLabel}.nodeId "${step.nodeId}" is not canonical.`);
      invariant(!tourNodeIds.has(step.nodeId), `${stepLabel}.nodeId "${step.nodeId}" is duplicated in its tour.`);
      assertText(step.narration, `${stepLabel}.narration`, 40, 360);
      tourNodeIds.add(step.nodeId);
      invariant(
        resolveOneBasedStep(tour, step.stepNumber) === step,
        `${stepLabel} cannot be resolved using its 1-based URL step.`
      );
    });
    invariant(resolveOneBasedStep(tour, 0) === null, `${label} must reject URL step 0.`);
    invariant(
      resolveOneBasedStep(tour, tour.steps.length + 1) === null,
      `${label} must reject URL steps beyond its final step.`
    );
    tourSlugs.add(tour.slug);
    tourStepCount += tour.steps.length;
  });

  const missingTours = [...EXPECTED_TOURS.keys()].filter((slug) => !tourSlugs.has(slug));
  invariant(missingTours.length === 0, `Missing approved tours: ${missingTours.join(', ')}.`);

  const evidenceGradeCounts = backboneRelationships.reduce((counts, relationship) => {
    counts[relationship.evidenceGrade] = (counts[relationship.evidenceGrade] || 0) + 1;
    return counts;
  }, {});

  console.log(`Validated ${path.relative(ROOT, PRESENTATION_PATH)}`);
  console.log(`- canonical export: ${canonical.nodes.length} nodes, ${canonical.relationships.length} relationships`);
  console.log(`- anchors: ${presentation.anchors.length} across ${anchoredLaneIds.size} lanes`);
  console.log(
    `- orientation spine: ${backboneRelationships.length} relationships (${Object.entries(evidenceGradeCounts)
      .map(([grade, count]) => `${count} ${grade}`)
      .join(', ')})`
  );
  console.log(`- tours: ${presentation.tours.length}, with ${tourStepCount} valid 1-based steps`);
  console.log(`- review status: ${presentation.reviewStatus}`);
}

try {
  validate();
} catch (error) {
  console.error(`Presentation data validation failed: ${error.message}`);
  process.exitCode = 1;
}
