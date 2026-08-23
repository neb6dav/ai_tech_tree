'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'ai-research-tech-tree.html'), 'utf8');

function graphBlock(source) {
  const start = source.indexOf('<script id="knowledge-graph"');
  assert.ok(start >= 0, 'knowledge graph script is present');
  const openEnd = source.indexOf('>', start) + 1;
  const end = source.indexOf('</script>', openEnd) + '</script>'.length;
  assert.ok(end > openEnd, 'knowledge graph script is closed');
  return source.slice(start, end);
}

test('orientation reveal uses the exact presentation spine and anchor inventory', () => {
  assert.match(html, /INTRO_REVEAL_PATH_COUNT=72/);
  assert.match(html, /INTRO_REVEAL_LABEL_COUNT=24/);
  assert.match(html, /gEdgesBackbone\.querySelectorAll\('path'\)/);
  assert.match(html, /gAnchorLabels\.querySelectorAll\('g\.anchorLabel'\)/);
  assert.match(html, /paths\.length!==INTRO_REVEAL_PATH_COUNT\|\|labels\.length!==INTRO_REVEAL_LABEL_COUNT/);
  assert.match(html, /buildOrientationSpine\(\);/);
  assert.equal((html.match(/id="edgesBackbone"/g) || []).length, 1);
  assert.equal((html.match(/id="anchorLabels"/g) || []).length, 1);
});

test('orientation reveal timing, skip, cancellation and bypass contracts are static', () => {
  assert.match(html, /INTRO_REVEAL_DURATION=1200/);
  assert.match(html, /duration:INTRO_REVEAL_DURATION/);
  assert.match(html, /finishIntroReveal\('complete'\)/);
  assert.match(html, /finishIntroReveal\('cancelled'\)/);
  assert.match(html, /finishIntroReveal\('skipped'\)/);
  assert.match(html, /className='introRevealSkip'/);
  assert.match(html, /target\?\.closest\?\.\('\.introRevealSkip'\)\)return/);
  assert.match(html, /textContent='Skip animation'/);
  for (const eventName of ['pointerdown', 'wheel', 'touchstart', 'keydown']) {
    assert.match(html, new RegExp(`'${eventName}'`));
  }
  assert.match(html, /embedMode/);
  assert.match(html, /!restored/);
  assert.match(html, /shouldShowWelcome\(\)/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /forced-colors: active/);
  assert.match(html, /Element\.prototype\.animate/);
  assert.match(html, /bypassIntroReveal\(\)/);
  assert.doesNotMatch(html, /aria-live=["'][^"']*["'][^>]*id=["']introRevealSkip/);
});

test('methodology identifies the current edition and links to the changelog', () => {
  assert.match(html, /PROJECT_META\.version/);
  assert.match(html, /PROJECT_META\.edition/);
  assert.match(html, /href='\.\/CHANGELOG\.md'/);
  assert.doesNotMatch(html, /PROJECT_META\.changelog\.forEach/);
});

test('generated graph block remains canonical and unique', () => {
  const block = graphBlock(html);
  assert.equal(Buffer.byteLength(block), 2593720);
  assert.equal(crypto.createHash('sha256').update(block).digest('hex'), '0171a0f5396c0c71ab31db39ab45420d395b6f5add2e5d3b5264de0df1f28e1a');
  const bodyStart = block.indexOf('>') + 1;
  const body = block.slice(bodyStart, -'</script>'.length);
  assert.doesNotThrow(() => JSON.parse(body));
  assert.equal((html.match(/id="knowledge-graph"/g) || []).length, 1);
});
