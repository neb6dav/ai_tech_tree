#!/usr/bin/env node
'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_INPUT_PATH = path.resolve(__dirname, '..', 'ai-research-tech-tree.json');
const DEFAULT_OUTPUT_PATH = path.resolve(__dirname, '..', '_site', 'sitemap.xml');
const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';

function sitemapError(message) {
  return new Error(`generate-sitemap: ${message}`);
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw sitemapError(`${label} must be an object`);
  }
  return value;
}

function assertSafeNodeId(value, label = 'node.id') {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw sitemapError(`${label} must be a non-empty, trimmed string`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._~-]*$/u.test(value)) {
    throw sitemapError(`${label} is not a traversal-safe portable path segment: ${value}`);
  }
  if (value.endsWith('.') || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(value)) {
    throw sitemapError(`${label} is not portable on Windows: ${value}`);
  }
  return value;
}

function normalizeCanonicalBaseUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw sitemapError('canonicalUrl must be a non-empty, trimmed string');
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw sitemapError('canonicalUrl must be an absolute HTTP(S) URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw sitemapError('canonicalUrl must be an absolute HTTP(S) URL');
  }
  if (parsed.username || parsed.password) {
    throw sitemapError('canonicalUrl cannot contain credentials');
  }
  if (parsed.search || parsed.hash) {
    throw sitemapError('canonicalUrl cannot contain a query string or fragment');
  }
  if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
  return parsed;
}

function editionDate(value) {
  if (typeof value !== 'string' || value.length < 10) {
    throw sitemapError('dataset edition must begin with a valid YYYY-MM-DD date');
  }
  const candidate = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(candidate);
  if (!match) throw sitemapError('dataset edition must begin with a valid YYYY-MM-DD date');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    throw sitemapError('dataset edition must begin with a valid YYYY-MM-DD date');
  }
  return candidate;
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function collectNodeIds(nodes) {
  if (!Array.isArray(nodes)) throw sitemapError('atlas.nodes must be an array');
  const seen = new Map();
  const ids = nodes.map((node, index) => {
    assertObject(node, `atlas.nodes[${index}]`);
    const id = assertSafeNodeId(node.id, `atlas.nodes[${index}].id`);
    const folded = id.toLowerCase();
    if (seen.has(folded)) {
      throw sitemapError(`node IDs collide on case-insensitive filesystems: ${seen.get(folded)} and ${id}`);
    }
    seen.set(folded, id);
    return id;
  });
  return ids.sort(compareAscii);
}

function buildSitemapEntries(atlas, options = {}) {
  assertObject(atlas, 'atlas');
  const dataset = assertObject(atlas.dataset, 'atlas.dataset');
  const baseUrl = normalizeCanonicalBaseUrl(
    options.canonicalBaseUrl === undefined ? dataset.canonicalUrl : options.canonicalBaseUrl
  );
  const lastmod = editionDate(dataset.edition);
  const nodeIds = collectNodeIds(atlas.nodes);

  return [
    {
      kind: 'root',
      loc: baseUrl.href,
      lastmod,
      changefreq: 'monthly',
      priority: '1.0'
    },
    ...nodeIds.map(nodeId => ({
      kind: 'node',
      nodeId,
      loc: new URL(`nodes/${encodeURIComponent(nodeId)}/`, baseUrl).href,
      lastmod,
      changefreq: 'monthly',
      priority: '0.7'
    }))
  ];
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}

function serializeSitemap(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw sitemapError('entries must be a non-empty array');
  }
  const records = entries.map((entry, index) => {
    assertObject(entry, `entries[${index}]`);
    for (const field of ['loc', 'lastmod', 'changefreq', 'priority']) {
      if (typeof entry[field] !== 'string' || entry[field].length === 0) {
        throw sitemapError(`entries[${index}].${field} must be non-empty text`);
      }
    }
    return [
      '  <url>',
      `    <loc>${escapeXml(entry.loc)}</loc>`,
      `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`,
      `    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`,
      `    <priority>${escapeXml(entry.priority)}</priority>`,
      '  </url>'
    ].join('\n');
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SITEMAP_NAMESPACE}">\n${records.join('\n')}\n</urlset>\n`;
}

function buildSitemap(atlas, options = {}) {
  return serializeSitemap(buildSitemapEntries(atlas, options));
}

async function generateSitemap({
  inputPath = DEFAULT_INPUT_PATH,
  outputPath = DEFAULT_OUTPUT_PATH,
  canonicalBaseUrl
} = {}) {
  const resolvedInput = path.resolve(inputPath);
  const resolvedOutput = path.resolve(outputPath);
  const raw = await fsp.readFile(resolvedInput, 'utf8');
  let atlas;
  try {
    atlas = JSON.parse(raw);
  } catch (error) {
    throw sitemapError(`cannot parse ${resolvedInput}: ${error.message}`);
  }
  const entries = buildSitemapEntries(atlas, { canonicalBaseUrl });
  const contents = serializeSitemap(entries);
  await fsp.mkdir(path.dirname(resolvedOutput), { recursive: true });
  await fsp.writeFile(resolvedOutput, contents, 'utf8');
  return {
    outputPath: resolvedOutput,
    urlCount: entries.length,
    contents
  };
}

module.exports = {
  DEFAULT_INPUT_PATH,
  DEFAULT_OUTPUT_PATH,
  SITEMAP_NAMESPACE,
  assertSafeNodeId,
  buildSitemap,
  buildSitemapEntries,
  editionDate,
  escapeXml,
  generateSitemap,
  normalizeCanonicalBaseUrl,
  serializeSitemap
};

if (require.main === module) {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_INPUT_PATH;
  const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_OUTPUT_PATH;
  generateSitemap({ inputPath, outputPath })
    .then(result => process.stdout.write(`Generated ${result.urlCount} sitemap URLs at ${result.outputPath}\n`))
    .catch(error => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
