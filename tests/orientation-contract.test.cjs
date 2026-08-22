'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadCanonicalAtlas } = require('../canonical-atlas');

const html = fs.readFileSync(path.join(__dirname, '..', 'ai-research-tech-tree.html'), 'utf8');

test('orientation shell has one movable fit group and compact mobile orientation', () => {
  assert.equal((html.match(/id="fitGroup"/g) || []).length, 1);
  assert.equal((html.match(/id="mobileOrientation"/g) || []).length, 1);
  assert.match(html, /--ruler-height:48px/);
  assert.match(html, /MAP_RULER_HEIGHT=48/);
  assert.match(html, /dateRulerCandidates/);
  assert.match(html, /placed\.length>=32/);
  assert.match(html, /id='eraSelect'/);
  assert.match(html, /#laneHud\{display:none\}/);
  assert.match(html, /#mobileOrientation\{display:flex;top:var\(--bar-height\);height:44px;min-height:44px/);
  assert.match(html, /MOBILE_ORIENTATION_HEIGHT=44/);
  assert.match(html, /syncEraSelectorPlacement\(\)/);
});

test('ruler and era selector remain bounded and deterministic', () => {
  const eraBlock = html.match(/const ERAS = \[([\s\S]*?)\];/);
  assert.ok(eraBlock, 'ERAS literal is present');
  assert.equal((eraBlock[1].match(/\{n:/g) || []).length, 13, 'the canonical era selector has 13 options');
  assert.match(html, /ERAS\.forEach\(\(era,index\)=>\{const option/);
  assert.match(html, /eraSelect\.appendChild\(option\)/);
  assert.match(html, /if\(placed\.length>=32\)break/);
  assert.match(html, /if\(prior===undefined\|\|priority<prior\)/);
  assert.match(html, /let previousEraRight=-1e9/);
  assert.match(html, /if\(L<=previousEraRight\+10\)\{d\.style\.display='none';return;\}/);
  assert.match(html, /previousEraRight=L\+width/);
});

test('mobile uses one compact orientation row while the desktop rails are hidden', () => {
  assert.match(html, /#laneHud\{display:none\}/);
  assert.match(html, /#eraHud\{display:none\}/);
  assert.match(html, /#mobileOrientation\{display:flex;top:var\(--bar-height\);height:44px;min-height:44px/);
  assert.match(html, /const host=window\.innerWidth<=740\?mobileOrientation:eraHud/);
  assert.match(html, /if\(window\.innerWidth<=740\)\{dateRulerTags\.forEach\(tag=>\{tag\.style\.display='none'/);
  assert.equal((html.match(/id="mobileEraOrientation"/g) || []).length, 1);
  assert.equal((html.match(/id="mobileLaneOrientation"/g) || []).length, 1);
  assert.match(html, /eraSelect\.appendChild\(option\)/);
});

test('lane packing reserves the pinned ruler and visible bottom shell', () => {
  assert.match(html, /const \{top:insetTop,bottom:insetBottom\}=viewInsets\(\)/);
  assert.match(html, /inspector\.getBoundingClientRect\(\)/);
  assert.match(html, /available=Math\.max\(1,vh-insetTop-insetBottom-8\)/);
  assert.match(html, /sy1<insetTop\|\|sy0>vh-insetBottom/);
  assert.match(html, /vh-insetBottom-2/);
});

test('URL camera restoration requires a complete finite cx/cy/z tuple', () => {
  assert.match(html, /function parseRestoreCamera\(params\)/);
  assert.match(html, /present\.every\(Boolean\)/);
  assert.match(html, /values\.every\(value=>Number\.isFinite\(value\)\)/);
  assert.match(html, /camera\.valid/);
  assert.match(html, /hasFilter=params\.has\('status'\)\|\|params\.has\('audit'\)\|\|params\.has\('research'\)/);
  assert.match(html, /else fitAll\(\)/);
  assert.match(html, /const RESTORE_HASH_KEYS=new Set/);
  assert.match(html, /'trace'/);
  assert.match(html, /recognizedIntent=\[\.\.\.params\.keys\(\)\]\.some/);
  assert.match(html, /recognizedIntent,camera:Object\.freeze\(camera\),focusedTarget,restored/);
  assert.match(html, /shouldShowFirstRun\(recognizedIntent\)/);
  assert.match(html, /let restoredCamera=null/);
  assert.match(html, /function reapplyRestoredCamera\(\)/);
  assert.match(html, /applyT\(true\)/);
  assert.match(html, /requestAnimationFrame\(\(\)=>\{syncControlsForViewport\(\);syncDockLayout\(\);requestAnimationFrame/);
});

test('fit and serialized camera centers use shell-aware vertical insets', () => {
  assert.match(html, /function viewCenterY\(\)/);
  assert.match(html, /const \{left,right,top,bottom\}=viewInsets\(\),aw=/);
  assert.match(html, /ty=top\+\(ah-/);
  assert.match(html, /\(viewCenterY\(\)-ty\)\/k/);
});

test('responsive action policy moves existing controls without cloning IDs', () => {
  assert.match(html, /const quickButtons=\[\.\.\.quickPrimary\.querySelectorAll/);
  assert.match(html, /protectedIds=width>=1280/);
  assert.match(html, /width>=1024/);
  assert.match(html, /width>=741/);
  assert.match(html, /primaryControls\.scrollWidth>primaryControls\.clientWidth\+2/);
});

test('trace uses one shared cycle-safe neighborhood and preserves Transformer lineage counts', () => {
  assert.equal((html.match(/function relationshipNeighborhood\(/g) || []).length, 1);
  assert.doesNotMatch(html, /function networkLineage\(/);
  assert.match(html, /relationshipNeighborhood\(id,Boolean\(transitive\)\)/);
  assert.match(html, /const neighborhood=relationshipNeighborhood\(id,Boolean\(transitive\)\)/);
  const atlas = loadCanonicalAtlas();
  const incoming = new Map(atlas.nodes.map(node => [node.id, []]));
  const outgoing = new Map(atlas.nodes.map(node => [node.id, []]));
  atlas.relationships.forEach(edge => {
    const value = { key: edge.key, a: edge.sourceNodeId, b: edge.targetNodeId };
    incoming.get(value.b).push(value);
    outgoing.get(value.a).push(value);
  });
  const nodes = new Set(['transformer']);
  const relationships = new Set();
  for (const [adjacency, direction] of [[incoming, 'in'], [outgoing, 'out']]) {
    const queue = ['transformer'];
    const visited = new Set(queue);
    while (queue.length) {
      const current = queue.shift();
      adjacency.get(current).sort((a, b) => a.key.localeCompare(b.key)).forEach(edge => {
        relationships.add(edge.key);
        const next = direction === 'in' ? edge.a : edge.b;
        nodes.add(next);
        if (!visited.has(next)) { visited.add(next); queue.push(next); }
      });
    }
  }
  assert.equal(nodes.size, 117);
  assert.equal(relationships.size, 196);
});

test('trace hash precedence, pooled paths, filter chip, and transient era lens are explicit', () => {
  for (const name of ['buildInspector', 'showInspector', 'hideInspector', 'select', 'deselect', 'currentParams', 'syncTraceNetworkLabels', 'renderEraLens']) {
    assert.equal((html.match(new RegExp(`^function ${name}\\(`, 'gm')) || []).length, 1, `${name} must have one application definition`);
  }
  assert.match(html, /const trace=params\.get\('trace'\),validTrace=trace&&byId\.has\(trace\)/);
  assert.match(html, /if\(validTrace\)\{focusedTarget=trace;activateTrace\(trace\)/);
  assert.match(html, /if\(traced&&traceRootId\)\{/);
  assert.match(html, /relationshipPathPool.size>=EDGES.length/);
  assert.doesNotMatch(html, /relationshipPathPool\.delete\(/);
  assert.match(html, /if\(path\.parentNode!==gEdgesHi\)path.remove\(\)/);
  assert.match(html, /id="filterChip"/);
  assert.match(html, /visible\.length\+' of '\+NODES\.length\+' shown · Reset'/);
  assert.match(html, /slice\(page\*24,page\*24\+24\)/);
  assert.match(html, /id="contextAnnouncement"/);
  assert.equal((html.match(/ERAS\.forEach\(\(era,index\)=>\{const option/g) || []).length, 1);
  assert.match(html, /const rank=nd=>nd\.id===trace\.rootId\?0:trace\.distance\.get\(nd\.id\)===1\?1:anchorIds\.has\(nd\.id\)\?2:nd\.s==='g'\?3:4/);
  assert.match(html, /gTraceLabels\.querySelectorAll\('\.traceLabel'\)\.forEach\(group=>\{group\.addEventListener\('pointerleave',\(\)=>hideInspector\(\)\)/);
  assert.match(html, /group\.addEventListener\('click',event=>\{event\.stopPropagation\(\)/);
  assert.match(html, /group\.addEventListener\('pointerup',event=>event\.stopPropagation\(\)/);
  assert.match(html, /function showInspector\(item\)\{if\(!item\)return;buildInspector\(item\)/);
  assert.match(html, /function focusTraceSummary\(\)/);
  assert.match(html, /traceSummaryPinned=true/);
  assert.match(html, /event\.stopImmediatePropagation\(\)/);
  assert.match(html, /if\(\(normalized==='list'\|\|normalized==='opportunity'\)&&traced\)clearTrace/);
  assert.match(html, /function hideInspector\(\)\{if\(traced&&traceRootId\)\{renderTraceSummary\(\);return;\}/);
});
