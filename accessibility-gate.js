#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, 'ai-research-tech-tree.html'), 'utf8');
const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
assert(cssMatch, 'Inline stylesheet is missing');
const css = cssMatch[1];

function variablesFrom(block) {
  const variables = {};
  for (const match of block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-f]{3,8})/gi)) variables[match[1]] = match[2];
  return variables;
}

function numericVariablesFrom(block) {
  const variables = {};
  for (const match of block.matchAll(/--([a-z0-9-]+)\s*:\s*(-?(?:\d+\.?\d*|\.\d+))\s*(?:;|$)/gi)) {
    variables[match[1]] = Number(match[2]);
  }
  return variables;
}

const rootMatch = css.match(/:root\s*\{([^}]*)\}/i);
assert(rootMatch, 'Root theme variables are missing');
const dark = variablesFrom(rootMatch[1]);
const light = { ...dark };
for (const match of css.matchAll(/body\[data-theme="light"\]\s*\{([^}]*)\}/gi)) Object.assign(light, variablesFrom(match[1]));
const darkNumbers = numericVariablesFrom(rootMatch[1]);
const lightNumbers = { ...darkNumbers };
for (const match of css.matchAll(/body\[data-theme="light"\]\s*\{([^}]*)\}/gi)) Object.assign(lightNumbers, numericVariablesFrom(match[1]));

function rgb(hex) {
  let value = hex.replace('#', '');
  if (value.length === 3) value = value.split('').map(character => character + character).join('');
  assert.equal(value.length, 6, `Unsupported color ${hex}`);
  return [0, 2, 4].map(index => Number.parseInt(value.slice(index, index + 2), 16));
}

function luminance(hexOrRgb) {
  return (Array.isArray(hexOrRgb) ? hexOrRgb : rgb(hexOrRgb))
    .map(channel => channel / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(left, right) {
  const a = luminance(left), b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function mix(foreground, background, amount) {
  const fg = rgb(foreground), bg = rgb(background);
  return fg.map((channel, index) => Math.round(channel * amount + bg[index] * (1 - amount)));
}

function composite(foreground, background, opacity) {
  assert(Number.isFinite(opacity) && opacity >= 0 && opacity <= 1, `Invalid alpha ${opacity}`);
  const fg = rgb(foreground), bg = rgb(background);
  return fg.map((channel, index) => channel * opacity + bg[index] * (1 - opacity));
}

function check(name, foreground, background, minimum, results) {
  const ratio = contrast(foreground, background);
  assert(ratio + 1e-9 >= minimum, `${name}: ${ratio.toFixed(2)}:1 is below ${minimum}:1`);
  results[name] = Number(ratio.toFixed(2));
}

function checkComposited(name, foreground, background, opacity, minimum, results) {
  const ratio = contrast(composite(foreground, background, opacity), background);
  assert(ratio + 1e-9 >= minimum, `${name} at alpha ${opacity}: ${ratio.toFixed(2)}:1 is below ${minimum}:1`);
  results[name] = Number(ratio.toFixed(2));
}

const report = {};
for (const [themeName, theme, numericTheme] of [['dark', dark, darkNumbers], ['light', light, lightNumbers]]) {
  const results = {};
  for (const token of ['ink', 'ink2', 'ink3', 'subtle-text']) {
    for (const surface of ['surface', 'panel', 'panel2']) check(`${themeName}.${token}/${surface}`, theme[token], theme[surface], 4.5, results);
  }
  check(`${themeName}.node-label/surface`, theme['node-label'], theme.surface, 4.5, results);
  for (const surface of ['surface', 'panel', 'panel2']) check(`${themeName}.control-line/${surface}`, theme['control-line'], theme[surface], 3, results);
  for (const surface of ['surface', 'panel']) check(`${themeName}.focus/${surface}`, theme.focus, theme[surface], 3, results);
  assert(theme['e-backbone'], `${themeName} theme is missing --e-backbone`);
  assert(Number.isFinite(numericTheme['e-backbone-opacity']), `${themeName} theme is missing --e-backbone-opacity`);
  assert(Number.isFinite(numericTheme['e-active-opacity']), `${themeName} theme is missing --e-active-opacity`);
  checkComposited(`${themeName}.e-backbone@alpha/surface`, theme['e-backbone'], theme.surface, numericTheme['e-backbone-opacity'], 3, results);
  for (const edge of ['e-in', 'e-out', 'e-sup', 'e-gap']) {
    checkComposited(`${themeName}.${edge}@active-alpha/surface`, theme[edge], theme.surface, numericTheme['e-active-opacity'], 3, results);
  }
  results[`${themeName}.e-ctx@passive-alpha/surface`] = Number(contrast(
    composite(theme['e-ctx'], theme.surface, 0.35),
    theme.surface
  ).toFixed(2));
  for (const status of ['c-f', 'c-a', 'c-h', 'c-d', 'c-x', 'c-r', 'c-g']) {
    const tintedNode = mix(theme[status], theme.surface, 0.13);
    check(`${themeName}.${status}/node`, theme[status], tintedNode, 4.5, results);
    check(`${themeName}.${status}/panel`, theme[status], theme.panel, 4.5, results);
    check(`${themeName}.swatch-ink/${status}`, theme['swatch-ink'], theme[status], 4.5, results);
    check(`${themeName}.cluster-count/${status}`, theme.bg, theme[status], 4.5, results);
  }
  report[themeName] = results;
}

const backboneRule = css.match(/#edgesBackbone\s+path\s*\{([^}]*)\}/i);
assert(backboneRule, 'Persistent spine paths are missing their audited style rule');
assert(/stroke\s*:\s*var\(--e-backbone\)/i.test(backboneRule[1]), 'Persistent spine paths must consume --e-backbone');
assert(/opacity\s*:\s*var\(--e-backbone-opacity\)/i.test(backboneRule[1]), 'Persistent spine paths must consume --e-backbone-opacity');

const activeRule = css.match(/#edgesHi\s+path\s*\{([^}]*)\}/i);
assert(activeRule, 'Active relationship paths are missing their audited style rule');
assert(/opacity\s*:\s*var\(--e-active-opacity\)/i.test(activeRule[1]), 'Active relationship paths must consume --e-active-opacity');
for (const match of css.matchAll(/#edgesHi\s+path\.evidence-[^{]+\{([^}]*)\}/gi)) {
assert(!/\bopacity\s*:\s*(?!var\(--e-active-opacity\))[^;}]+/i.test(match[1]), 'Evidence-grade rules must not reduce active relationship contrast with a numeric opacity override');
}

assert(css.includes('.chip.off{opacity:1; color:var(--ink3); background:transparent; border-style:dashed}'), 'Inactive filters must remain readable without whole-control opacity');
assert(!css.includes('.chip.off{opacity:.38}'), 'Low-contrast inactive filter styling remains');
const semanticCardRule = css.match(/g\.semanticCluster\s+\.clusterCard\s*\{([^}]*)\}/i);
assert(semanticCardRule, 'Semantic lane-by-era cards are missing their audited style rule');
assert(/fill\s*:\s*color-mix\(in\s+srgb\s*,?\s*var\(--node-color\)\s+10%\s*,\s*var\(--panel\)\)/i.test(semanticCardRule[1]), 'Semantic cards must blend their status color with the panel surface');
assert(/stroke\s*:\s*var\(--node-color\)/i.test(semanticCardRule[1]), 'Semantic cards must retain their status-colored boundary');
const semanticFocusRule = css.match(/g\.semanticCluster:hover\s+\.clusterCard\s*,\s*g\.semanticCluster:focus\s+\.clusterCard\s*\{([^}]*)\}/i);
assert(semanticFocusRule && /stroke\s*:\s*var\(--focus\)/i.test(semanticFocusRule[1]) && /stroke-width\s*:\s*2\.5/i.test(semanticFocusRule[1]), 'Semantic cards must expose a high-contrast pointer and keyboard focus state');
const anchorTextRule = css.match(/g\.anchorLabel\s+text\s*\{([^}]*)\}/i);
assert(anchorTextRule && /fill\s*:\s*var\(--ink\)/i.test(anchorTextRule[1]) && /stroke\s*:\s*var\(--surface\)/i.test(anchorTextRule[1]), 'Curated overview anchor labels must retain audited text contrast');
const anchorGlyphRule = css.match(/g\.anchorLabel\s+circle\s*\{([^}]*)\}/i);
assert(anchorGlyphRule && /fill\s*:\s*var\(--e-backbone\)/i.test(anchorGlyphRule[1]) && /stroke\s*:\s*var\(--surface\)/i.test(anchorGlyphRule[1]), 'Curated overview anchor glyphs must use the audited spine contrast');
const anchorFocusRule = css.match(/g\.anchorLabel:focus\s+text\s*,\s*g\.anchorLabel:hover\s+text\s*\{([^}]*)\}/i);
assert(anchorFocusRule && /fill\s*:\s*var\(--focus\)/i.test(anchorFocusRule[1]), 'Curated overview anchors must expose a high-contrast pointer and keyboard focus state');
assert(css.includes('color:var(--swatch-ink)'), 'Legend bubble glyphs must use a theme-specific contrasting color');
assert(css.includes('button:disabled{opacity:1;'), 'Disabled controls must remain readable');
assert(!css.includes('border-color:#33405c') && !css.includes('border-color:#3c4c6e'), 'Theme-invariant control borders remain');
assert(!css.includes('border-bottom:1px solid rgba(255,255,255,.06)'), 'Dark-only panel divider remains');
assert(!css.includes('border-top:1px solid rgba(255,255,255,.07)'), 'Dark-only guide divider remains');
assert((css.match(/border:1px solid var\(--control-line\)/g) || []).length >= 12, 'Interactive and popup boundaries are not consistently using the audited control color');

assert(!html.includes('id="allStatusBtn"') && !html.includes("getElementById('allStatusBtn')"), 'All-classifications control was not fully removed');
assert(html.includes("label:'Dark mode',ariaLabel:'Switch to dark mode'"), 'Light theme does not advertise the dark-mode action');
assert(html.includes("label:'Light mode',ariaLabel:'Switch to light mode'"), 'Dark theme does not advertise the light-mode action');
assert(html.includes("themeLabel.textContent=action.label") && html.includes("themeIcon.textContent=action.icon"), 'Theme action presentation is not refreshed on every theme change');
assert(html.includes("setLegendOpen(true,false,'welcome')"), 'First-load guide is not opened');
assert(html.includes("setLegendPresentation('docked')"), 'Guide cannot transition to its left dock');
assert(html.includes("const WELCOME_REVISION='3'"), 'v1.1.0 first-load guide state is not versioned');
assert(/<button\b(?=[^>]*\bdata-view="network")(?=[^>]*\baria-pressed="false")[^>]*>\s*Network\s*<\/button>/i.test(html), 'Network selector must expose its pressed state');
assert(/<[^>]+\bid="networkView"(?=[^>]*\baria-label=)[^>]*>/i.test(html), 'Network view must be an explicitly labelled region');
assert(/<[^>]+\bid="networkStatus"(?=[^>]*\brole="status")(?=[^>]*\baria-live="polite")[^>]*>/i.test(html), 'Network status must be announced politely');
assert(/<[^>]+\bid="networkNote"(?=[^>]*\brole="note")[^>]*>/i.test(html), 'Network interpretation warning must use note semantics');
assert(html.includes('Proximity does not establish'), 'Network view must warn against interpreting proximity as evidence');
assert(html.includes('Network view is unavailable'), 'Network rendering failure must expose a readable fallback');
assert(/<button\b(?=[^>]*\bdata-view="opportunity")(?=[^>]*\baria-pressed="false")[^>]*>\s*Opportunity\s*<\/button>/i.test(html), 'Opportunity selector must expose its pressed state');
assert(/<[^>]+\bid="opportunityView"(?=[^>]*\baria-labelledby="opportunityTitle")(?=[^>]*\baria-describedby="opportunityIntro opportunityNote")[^>]*>/i.test(html), 'Opportunity view must be labelled and described by visible copy');
assert(/<[^>]+\bid="opportunityStatus"(?=[^>]*\brole="status")(?=[^>]*\baria-live="polite")[^>]*>/i.test(html), 'Opportunity status must be announced politely');
assert(/<[^>]+\bid="opportunityNote"(?=[^>]*\brole="note")[^>]*>/i.test(html), 'Opportunity interpretation warning must use note semantics');
assert(html.includes('Position and width do not imply importance, certainty, value, or rank.'), 'Opportunity view must state that position and path width are non-quantitative');
assert(/<[^>]+\bid="opportunityCanvas"(?=[^>]*\brole="group")(?=[^>]*\baria-label=)[^>]*>/i.test(html), 'Opportunity canvas must expose a readable group label');
assert(/<details\b[^>]*\bid="opportunityOutlineDetails"[^>]*>[\s\S]*?<summary>Opportunity outline<\/summary>[\s\S]*?\bid="opportunityOutline"/i.test(html), 'Opportunity view must include a structured non-canvas outline');
assert(html.includes('The Opportunity View is unavailable.'), 'Opportunity rendering failure must expose a readable fallback');

console.log(JSON.stringify({
  status: 'PASS',
  edition: '2026-08-21-stable-1',
  wcagTargets: { normalText: 4.5, controlsAndGraphics: 3 },
  contrast: report,
  staticContracts: 'PASS',
  networkAccessibility: 'PASS',
  opportunityAccessibility: 'PASS'
}, null, 2));
