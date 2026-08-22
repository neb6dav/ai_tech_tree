'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { LANE_ORDER, loadCanonicalAtlas } = require('../canonical-atlas.js');

const PAGE_SIZE = 12;
const EXPECTED_EVIDENCE_GRADES = Object.freeze({
  direct: 6,
  partial: 3,
  contextual: 288,
  editorial: 214,
  unassessed: 156,
  hypothesis: 44
});
function questionRecords(atlas) {
  return atlas.nodes.flatMap(node => node.questions.map((question, questionIndex) => ({
    node,
    question,
    questionIndex,
    segment: node.direction?.question === question ? 'open' : 'other'
  })));
}

function sortQuestionRecords(records) {
  const laneIndex = new Map(LANE_ORDER.map((lane, index) => [lane, index]));
  const key = record => [
    record.segment === 'open' ? 0 : 1,
    record.node.year,
    laneIndex.get(record.node.laneId),
    record.node.id,
    record.questionIndex
  ];
  const compare = (left, right) => {
    const leftKey = key(left);
    const rightKey = key(right);
    return leftKey[0] - rightKey[0] ||
      leftKey[1] - rightKey[1] ||
      leftKey[2] - rightKey[2] ||
      leftKey[3].localeCompare(rightKey[3]) ||
      leftKey[4] - rightKey[4];
  };
  return [...records].sort(compare);
}

function pageCount(total, pageSize = PAGE_SIZE) {
  return Math.ceil(total / pageSize);
}

function deckSearchFields(node) {
  return Object.freeze({
    title: node.title,
    questions: [...node.questions],
    tags: [...(node.research?.tags || [])]
  });
}

test('research deck derives canonical counts and the 15/59 segment split', () => {
  const atlas = loadCanonicalAtlas();
  const records = questionRecords(atlas);
  const open = records.filter(record => record.segment === 'open');
  const other = records.filter(record => record.segment === 'other');
  const questionNodeIds = new Set(records.map(record => record.node.id));

  assert.equal(atlas.nodes.length, 339);
  assert.equal(atlas.relationships.length, 711);
  assert.equal(records.length, 74);
  assert.equal(questionNodeIds.size, 71);
  assert.equal(open.length, 15);
  assert.equal(other.length, 59);
  assert.deepEqual(
    new Set(open.map(record => record.node.id)),
    new Set(atlas.nodes.filter(node => node.direction).map(node => node.id))
  );

  const expectedExtraGuideQuestions = new Set(['gap_openended', 'gap_interp', 'gap_scilab']);
  assert.deepEqual(
    new Set(other.filter(record => record.node.direction).map(record => record.node.id)),
    expectedExtraGuideQuestions
  );
  for (const nodeId of expectedExtraGuideQuestions) {
    const nodeRecords = other.filter(record => record.node.id === nodeId);
    assert.equal(nodeRecords.length, 1, `${nodeId} should retain one other recorded question`);
    assert.notEqual(nodeRecords[0].question, nodeRecords[0].node.direction.question);
  }
});

test('research deck ordering is open-first, then year, lane, node, and question index', () => {
  const atlas = loadCanonicalAtlas();
  const ordered = sortQuestionRecords(questionRecords(atlas));
  const laneIndex = new Map(LANE_ORDER.map((lane, index) => [lane, index]));

  assert.equal(ordered[15].segment, 'other');
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const previousKey = [
      previous.segment === 'open' ? 0 : 1,
      previous.node.year,
      laneIndex.get(previous.node.laneId),
      previous.node.id,
      previous.questionIndex
    ];
    const currentKey = [
      current.segment === 'open' ? 0 : 1,
      current.node.year,
      laneIndex.get(current.node.laneId),
      current.node.id,
      current.questionIndex
    ];
    const comparison = previousKey[0] - currentKey[0] ||
      previousKey[1] - currentKey[1] ||
      previousKey[2] - currentKey[2] ||
      previousKey[3].localeCompare(currentKey[3]) ||
      previousKey[4] - currentKey[4];
    assert.ok(comparison <= 0, `question order regressed at index ${index}`);
  }

  const sortedAgain = sortQuestionRecords(questionRecords(atlas)).map(record =>
    `${record.segment}:${record.node.year}:${record.node.laneId}:${record.node.id}:${record.questionIndex}`
  );
  assert.deepEqual(sortedAgain, ordered.map(record =>
    `${record.segment}:${record.node.year}:${record.node.laneId}:${record.node.id}:${record.questionIndex}`
  ));
});

test('research deck page-count math is twelve records per page', () => {
  assert.equal(pageCount(74), 7);
  assert.equal(pageCount(15), 2);
  assert.equal(pageCount(59), 5);
  assert.equal(pageCount(0), 0);
  assert.equal(pageCount(12), 1);
  assert.equal(pageCount(13), 2);
});

test('canonical relationship evidence grades retain six grades and presentation groups', () => {
  const atlas = loadCanonicalAtlas();
  const counts = Object.fromEntries(Object.keys(EXPECTED_EVIDENCE_GRADES).map(grade => [grade, 0]));
  for (const relationship of atlas.relationships) {
    assert.ok(Object.hasOwn(counts, relationship.evidenceGrade), `unexpected evidence grade: ${relationship.evidenceGrade}`);
    counts[relationship.evidenceGrade] += 1;
  }
  assert.deepEqual(counts, EXPECTED_EVIDENCE_GRADES);
  assert.equal(counts.direct + counts.partial, 9);
  assert.equal(counts.contextual + counts.editorial + counts.unassessed, 658);
  assert.equal(counts.hypothesis, 44);
});

test('deck search projection is limited to canonical titles, questions, and tags', () => {
  const atlas = loadCanonicalAtlas();
  const records = questionRecords(atlas);
  const allowedKeys = ['questions', 'tags', 'title'];

  for (const record of records) {
    const fields = deckSearchFields(record.node);
    assert.deepEqual(Object.keys(fields).sort(), allowedKeys);
    assert.equal(fields.title, record.node.title);
    assert.ok(fields.questions.includes(record.question));
    assert.deepEqual(fields.tags, record.node.research?.tags || []);
    assert.equal(Object.hasOwn(fields, 'description'), false);
    assert.equal(Object.hasOwn(fields, 'sources'), false);
    assert.equal(Object.hasOwn(fields, 'works'), false);
  }
});
