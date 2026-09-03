const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'ai-research-tech-tree.html'), 'utf8');

test('Unfinished Business keeps the existing research hash and canonical segments', () => {
  assert.match(html, /id="unfinishedBtn"[^>]*>Unfinished Business/);
  assert.match(html, /data-question-segment="all"[^>]*>All 74/);
  assert.match(html, /data-question-segment="open"[^>]*>Open directions 15/);
  assert.match(html, /data-question-segment="other"[^>]*>Other recorded questions 59/);
  assert.match(html, /const QUESTION_RECORDS=Object\.freeze\(/);
  assert.match(html, /questionIndex/);
  assert.match(html, /slice\(start,start\+12\)/);
  assert.match(html, /activeResearchFilter='questions'/);
  assert.match(html, /value="questions">Unfinished Business/);
  assert.match(html, /Dormant \/ ended \/ open/);
  assert.match(html, /id:'unfinished-business',label:'Unfinished Business'/);
});

test('question deck search and cards use only canonical question surfaces', () => {
  assert.match(html, /function questionDeckSearchable\(record\)\{const nd=byId\.get\(record\.nodeId\),guide=researchById\.get\(record\.nodeId\);return \[nd\.t,record\.question,\.\.\.guide\.tags\]/);
  assert.match(html, /evidence\.dataset\.questionAction='evidence'/);
  assert.match(html, /timeline\.dataset\.questionAction='timeline'/);
  assert.match(html, /evidence\.textContent='Open evidence'/);
  assert.match(html, /timeline\.textContent='Show on Timeline'/);
  assert.match(html, /\.questionCardActions \.btn\{min-height:44px;min-width:44px\}/);
  assert.match(html, /body\.question-deck-active #listTitle,body\.question-deck-active #listCount\{display:none\}/);
  assert.match(html, /body\.question-deck-active #filterChip\{top:calc\(var\(--bar-height\) \+ 8px\);left:18px\}/);
  assert.match(html, /function openQuestionDeck\(\)/);
  assert.match(html, /function syncQuestionDeckTabs\(\)/);
  assert.match(html, /event\.key==='ArrowRight'/);
  assert.match(html, /event\.key==='ArrowLeft'/);
  assert.match(html, /event\.key==='Home'/);
  assert.match(html, /event\.key==='End'/);
  assert.match(html, /listView\.setAttribute\('aria-labelledby',deckActive\?'questionDeckTitle':'listTitle'\)/);
  assert.match(html, /questionDeckPager button/);
  assert.match(html, /buttons\[index\]\?\.disabled\?buttons\.find/);
  assert.match(html, /questionDeckState\.page=0/);
  assert.doesNotMatch(html, /params\.set\(['"]question(?:Segment|Search|Page)['"]/);
});
