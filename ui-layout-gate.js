#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'ai-research-tech-tree.json'), 'utf8'));
const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
assert(cssMatch, 'Inline stylesheet is missing');
const css = cssMatch[1];

if (/data-atlas-workspace/.test(html)) {
  for (const fragment of ['.workspace-grid', '@media', '.map-panel', '.detail-panel', '.view-tabs', '#atlas-map', '.list-panel']) assert(css.includes(fragment), `Missing workspace layout contract: ${fragment}`);
  assert(/\.workspace-grid\s*\{[^}]*display:\s*grid/i.test(css), 'Workspace grid is missing');
  assert(/grid-template-columns:\s*minmax\(0,\s*2fr\)\s+minmax\(320px,\s*1fr\)/i.test(css), 'Workspace desktop map/detail split is missing');
  assert(/grid-template-columns:\s*1fr/.test(css), 'Workspace mobile single-column layout is missing');
  assert(/data-view="explore"/.test(html) && /data-view="list"/.test(html) && /data-view="opportunity"/.test(html), 'Workspace view switcher is incomplete');
  assert(/id="atlas-map"[^>]*role="group"/.test(html), 'Interactive map must expose its child controls as a group');
  console.log(JSON.stringify({ status: 'PASS', workspace: true, responsiveGrid: true, viewSwitcher: true }, null, 2));
  process.exit(0);
}
throw new Error('Expected the generated desktop workspace.');
