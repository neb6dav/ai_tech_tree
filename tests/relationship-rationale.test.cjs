'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadCanonicalAtlas } = require('../canonical-atlas');

const html = fs.readFileSync(path.join(__dirname, '..', 'ai-research-tech-tree.html'), 'utf8');

test('relationship rationale preview uses the bounded pooled-path pointer contract', () => {
  assert.match(html, /const RELATIONSHIP_POINTER_TOLERANCE=12/);
  assert.match(html, /RELATIONSHIP_POINTER_CELL=24/);
  assert.match(html, /RELATIONSHIP_POINTER_LAYER_PRIORITY=Object\.freeze\(\{edgesBackbone:0,edgesAll:1,edgesHi:2\}\)/);
  assert.match(html, /svg\.mid\.trace-active #edgesHi,svg\.overview\.trace-active #edgesHi\{display:block!important\}/);
  assert.match(html, /layerPriority:relationshipPointerLayerPriority\(path\)/);
  assert.match(html, /entry\.layerPriority>bestLayerPriority/);
  assert.match(html, /Math\.abs\(distance-bestDistance\)<=RELATIONSHIP_POINTER_TIE_EPSILON/);
  assert.match(html, /if\(distance>RELATIONSHIP_POINTER_TOLERANCE\)return;/);
  assert.match(html, /requestAnimationFrame\(rebuildRelationshipPointerIndex\)/);
  assert.match(html, /gEdgesHi\.style\.strokeWidth = Math\.max\(1\.6, 2\/k\);\s*scheduleRelationshipPointerIndex\(\);/);
  assert.match(html, /relationshipPointerIndexPath\(entry\)/);
  assert.match(html, /relationshipPointerEnabled\(event\)/);
  assert.match(html, /window\.innerWidth>740/);
  assert.match(html, /event\?\.pointerType!==['"]touch['"]/);
  assert.match(html, /pointer: coarse/);
  assert.doesNotMatch(html, /relationshipHit(Path|Overlay)/);
  assert.match(html, /relationshipPathPool\.get\(relationshipId\)/);
  assert.match(html, /relationshipPointerPreviewId/);
  assert.match(html, /relationshipRowHoverId=null,relationshipRowFocusId=null/);
  assert.match(html, /path\.style\.display==='none'\)return/);
  assert.match(html, /refreshRelationshipFilters\(\)[\s\S]*?scheduleRelationshipPointerIndex\(\);/);
  assert.match(html, /function clearPreviewState\(\)\{[^}]*relationshipPointerPreviewId=null;[^}]*relationshipRowHoverId=null;[^}]*relationshipRowFocusId=null;/);
});

test('relationship preview exposes canonical titles, six-grade labels, review state, and rationale', () => {
  assert.match(html, /inspector\.dataset\.mode='relationship'/);
  assert.match(html, /source\.t\+' → '\+target\.t/);
  assert.match(html, /RELATION_TYPES\[meta\.type\]\.label/);
  assert.match(html, /EVIDENCE_GRADE_LABELS\[grade\]/);
  assert.match(html, /claim=edgeAuditByKey\.get\(edgeAuditKey\(edge\)\)/);
  assert.match(html, /AUDIT_STATES\[claim\.state\]\?\.label/);
  assert.match(html, /Review state:/);
  assert.match(html, /appendTextBlock\(inspector,'td',meta\.rationale\)/);
  assert.match(html, /wrap\.addEventListener\('pointerenter',\(\)=>\{[^}]*showRelationshipInspector\(edge\);?\}\)/);
  assert.match(html, /wrap\.addEventListener\('focusin',\(\)=>\{[^}]*showRelationshipInspector\(edge\);?\}\)/);
  assert.match(html, /const nextWrap=event\.relatedTarget\?\.closest\?\.\('\.relWrap'\);if\(nextWrap\)return/);
  assert.match(html, /announceContext\('Relationship preview:/);
  assert.match(html, /relationshipById\.get\(relationshipId\)!==edge/);
  assert.match(html, /relationshipRowFocusId=relationshipId;showRelationshipInspector\(edge\)/);
  assert.match(html, /relationshipRowFocusId=null;restoreRelationshipInspector\(\)/);
});

test('display grouping retains all six canonical grades and exact three-bucket counts', () => {
  assert.match(html, /const EVIDENCE_DISPLAY_BUCKETS=Object\.freeze/);
  assert.match(html, /evidenceDisplayBucket:bucket/);
  const atlas = loadCanonicalAtlas();
  const counts = Object.fromEntries(['Evidence-backed', 'Contextual, editorial, or unassessed', 'Hypothesis'].map(key => [key, 0]));
  atlas.relationships.forEach(relationship => {
    const grade = relationship.evidenceGrade;
    assert.ok(['direct', 'partial', 'contextual', 'editorial', 'unassessed', 'hypothesis'].includes(grade));
    const bucket = grade === 'direct' || grade === 'partial'
      ? 'Evidence-backed'
      : grade === 'hypothesis'
        ? 'Hypothesis'
        : 'Contextual, editorial, or unassessed';
    counts[bucket] += 1;
  });
  assert.deepEqual(counts, {
    'Evidence-backed': 9,
    'Contextual, editorial, or unassessed': 658,
    Hypothesis: 44
  });
  assert.match(html, /direct:'Evidence-backed',partial:'Evidence-backed'/);
  assert.match(html, /hypothesis:'Hypothesis'/);
});

test('relationship pool remains one canonical path per relationship with no duplicate hit layer', () => {
  assert.match(html, /relationshipPathPool\.size>=EDGES\.length/);
  assert.doesNotMatch(html, /relationshipPathPool\.delete\(/);
  assert.match(html, /relationshipPaths\(\)\.forEach\(path=>/);
  assert.match(html, /relationshipPointerIndexPath\(entry\)/);
  assert.doesNotMatch(html, /createElementNS\(NS,'(?:path|g)'\).*relationshipPointer/);
});
