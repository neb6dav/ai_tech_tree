'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

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
});

test('lane packing reserves the pinned ruler and visible bottom shell', () => {
  assert.match(html, /const \{top:insetTop,bottom:insetBottom\}=viewInsets\(\)/);
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
