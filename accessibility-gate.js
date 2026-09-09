#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
assert(cssMatch, 'Inline stylesheet is missing');
const css = cssMatch[1];

// Workspace accessibility contract: verify the semantic regions and keyboard
// controls that replaced the legacy map-specific color/token surface.
if (/data-atlas-workspace/.test(html)) {
  assert(/<main[^>]*data-atlas-workspace/.test(html), 'Workspace main region is missing');
  for (const id of ['node-search', 'atlas-map', 'detail-panel', 'list-panel', 'help-dialog']) {
    assert(new RegExp(`\\bid=["']${id}["']`).test(html), `Workspace accessibility target is missing: ${id}`);
  }
  assert(/role="toolbar"/.test(html), 'Workspace controls must expose a toolbar');
  assert(/aria-live="polite"/.test(html), 'Workspace detail/status updates must be announced politely');
  assert(/:focus-visible/.test(css), 'Workspace focus-visible styling is required');
  assert(!/(?:^|})\s*(?:button|input|a)[^{]*\{[^}]*outline\s*:\s*none/i.test(css), 'Workspace must not suppress control focus outlines');
  console.log(JSON.stringify({ status: 'PASS', workspace: true, semanticRegions: 5, keyboardFocus: true }, null, 2));
  process.exit(0);
}
throw new Error('Expected the generated desktop workspace.');
