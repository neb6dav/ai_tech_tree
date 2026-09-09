#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function hash(body) { return `'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`; }
function bodies(html, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  return [...html.matchAll(re)].map(m => m[1]);
}
function finalize(html) {
  const scripts = bodies(html, 'script');
  const styles = bodies(html, 'style');
  if (!scripts.length || !styles.length) throw new Error('finalize-html requires at least one inline script and stylesheet');
  const policy = [
    'default-src \'none\'', `script-src ${scripts.map(hash).join(' ')}`, "script-src-attr 'none'",
    "style-src 'none'", `style-src-elem ${styles.map(hash).join(' ')}`, "style-src-attr 'none'",
    'img-src data:', "connect-src 'self'", "font-src 'none'", "media-src 'none'", "worker-src 'none'",
    "frame-src 'none'", "child-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "manifest-src 'none'"
  ].join('; ');
  const re = /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=["'][^"]*["']\s*\/?>(?=\s*)/i;
  if (!re.test(html)) throw new Error('Missing Content-Security-Policy meta element');
  return html.replace(re, `<meta http-equiv="Content-Security-Policy" content="${policy}">`);
}
function main() {
  const file = path.resolve(process.argv[2] || 'index.html');
  const html = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  fs.writeFileSync(file, finalize(html), 'utf8');
  console.log(JSON.stringify({ status: 'HTML_FINALIZED', file: path.basename(file) }, null, 2));
}
if (require.main === module) main();
module.exports = { finalize, hash };
