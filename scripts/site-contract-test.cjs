#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { decodeHTMLAttribute, decodeXML } = require('entities');

const DEFAULT_SITE_DIR = '_site';
const DEFAULT_BASE_PATH = '/ai_tech_tree/';
const DEFAULT_PUBLIC_ORIGIN = 'https://neb6dav.github.io';
const APPLICATION_STATE_COMPATIBILITY_PAIRS = Object.freeze([
  Object.freeze([
    'data/opportunities/diffusion-models.alpha.json',
    'src/data/opportunities/diffusion-models.alpha.json'
  ])
]);

const MIME_TYPES = Object.freeze({
  '.cff': 'text/yaml; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jsonld': 'application/ld+json; charset=utf-8',
  '.ndjson': 'application/x-ndjson; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8'
});

const EXPECTED_MIME_TYPES = Object.freeze({
  '.cff': Object.freeze(['text/yaml', 'application/yaml']),
  '.csv': Object.freeze(['text/csv']),
  '.css': Object.freeze(['text/css']),
  '.gif': Object.freeze(['image/gif']),
  '.htm': Object.freeze(['text/html']),
  '.html': Object.freeze(['text/html']),
  '.ico': Object.freeze(['image/x-icon', 'image/vnd.microsoft.icon']),
  '.jpeg': Object.freeze(['image/jpeg']),
  '.jpg': Object.freeze(['image/jpeg']),
  '.js': Object.freeze(['text/javascript', 'application/javascript']),
  '.json': Object.freeze(['application/json']),
  '.jsonld': Object.freeze(['application/ld+json']),
  '.ndjson': Object.freeze(['application/x-ndjson', 'application/ndjson']),
  '.mjs': Object.freeze(['text/javascript', 'application/javascript']),
  '.pdf': Object.freeze(['application/pdf']),
  '.png': Object.freeze(['image/png']),
  '.svg': Object.freeze(['image/svg+xml']),
  '.txt': Object.freeze(['text/plain']),
  '.wasm': Object.freeze(['application/wasm']),
  '.webp': Object.freeze(['image/webp']),
  '.xml': Object.freeze(['application/xml', 'text/xml'])
});

function normalizeBasePath(value) {
  const input = String(value || '').trim();
  if (!input || !input.startsWith('/')) throw new TypeError('Project base path must start with "/".');
  if (input.includes('\\') || hasTraversal(input)) throw new TypeError('Project base path must not contain traversal.');
  const normalized = input.replace(/\/{2,}/g, '/');
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function normalizePublicOrigin(value) {
  const url = new URL(String(value));
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('Public origin must use HTTP or HTTPS.');
  if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/')) {
    throw new TypeError('Public origin must contain only scheme, host, and optional port.');
  }
  return url.origin;
}

function decodeRepeated(value) {
  let current = String(value);
  for (let count = 0; count < 4; count += 1) {
    let decoded;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return current;
    }
    if (decoded === current) return current;
    current = decoded;
  }
  return current;
}

function hasTraversal(value) {
  const rawPath = String(value).split(/[?#]/, 1)[0];
  const decoded = decodeRepeated(rawPath).replaceAll('\\', '/');
  return decoded.includes('\0') || decoded.split('/').some(segment => segment === '..');
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function compareText(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function sendText(response, status, body, headers = {}) {
  const payload = Buffer.from(body, 'utf8');
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': payload.length,
    ...headers
  });
  response.end(payload);
}

function createSiteHandler({ siteDir, basePath = DEFAULT_BASE_PATH }) {
  const root = path.resolve(siteDir);
  const normalizedBase = normalizeBasePath(basePath);
  const baseWithoutSlash = normalizedBase.slice(0, -1);

  return async function siteHandler(request, response) {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        sendText(response, 405, 'Method Not Allowed\n', { allow: 'GET, HEAD' });
        return;
      }

      const requestTarget = request.url || '/';
      if (hasTraversal(requestTarget)) {
        sendText(response, 400, 'Path traversal rejected\n');
        return;
      }

      let parsed;
      try {
        parsed = new URL(requestTarget, 'http://site-contract.invalid');
      } catch {
        sendText(response, 400, 'Malformed URL\n');
        return;
      }

      if (parsed.pathname === baseWithoutSlash) {
        response.writeHead(308, { location: normalizedBase });
        response.end();
        return;
      }
      if (!parsed.pathname.startsWith(normalizedBase)) {
        sendText(response, 404, 'Outside project base\n');
        return;
      }

      const encodedRelative = parsed.pathname.slice(normalizedBase.length);
      let relative;
      try {
        relative = decodeURIComponent(encodedRelative);
      } catch {
        sendText(response, 400, 'Malformed path encoding\n');
        return;
      }
      if (relative.includes('\0') || relative.includes('\\') || hasTraversal(relative)) {
        sendText(response, 400, 'Path traversal rejected\n');
        return;
      }

      let target = path.resolve(root, relative || 'index.html');
      if (!isWithin(root, target)) {
        sendText(response, 400, 'Path traversal rejected\n');
        return;
      }

      let stat;
      try {
        stat = await fsp.stat(target);
      } catch (error) {
        if (error && error.code === 'ENOENT') {
          sendText(response, 404, 'Not Found\n');
          return;
        }
        throw error;
      }

      if (stat.isDirectory()) {
        target = path.join(target, 'index.html');
        try {
          stat = await fsp.stat(target);
        } catch (error) {
          if (error && error.code === 'ENOENT') {
            sendText(response, 404, 'Not Found\n');
            return;
          }
          throw error;
        }
      }
      if (!stat.isFile()) {
        sendText(response, 404, 'Not Found\n');
        return;
      }

      const [realRoot, realTarget] = await Promise.all([fsp.realpath(root), fsp.realpath(target)]);
      if (!isWithin(realRoot, realTarget)) {
        sendText(response, 400, 'Symlink escape rejected\n');
        return;
      }

      const contentType = MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream';
      response.writeHead(200, {
        'content-type': contentType,
        'content-length': stat.size,
        'cache-control': 'no-store'
      });
      if (request.method === 'HEAD') response.end();
      else fs.createReadStream(target).pipe(response);
    } catch (error) {
      sendText(response, 500, `Internal server error: ${error.message}\n`);
    }
  };
}

async function startSiteServer(options) {
  const server = http.createServer(createSiteHandler(options));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  };
}

function lineNumberAt(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) if (text.charCodeAt(index) === 10) line += 1;
  return line;
}

function decodeHtmlEntities(value) {
  return decodeHTMLAttribute(String(value));
}

function parseAttributes(fragment) {
  const attributes = new Map();
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of fragment.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    if (!attributes.has(name)) attributes.set(name, decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return attributes;
}

function addReference(
  references,
  source,
  kind,
  ref,
  policy = 'internal-if-project',
  declaredType = null,
  expectedApplicationState = null,
  contextType = null
) {
  references.push({
    source,
    kind,
    ref,
    policy,
    declaredType: declaredType || null,
    expectedApplicationState: expectedApplicationState || null,
    contextType: contextType || null
  });
}

function extractJsonStrings(value, output) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach(item => extractJsonStrings(item, output));
  else if (value && typeof value === 'object') {
    if (typeof value['@id'] === 'string') output.push(value['@id']);
  }
}

function escapePointerSegment(value) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

function collectSchemaAnchors(value, anchors = new Set()) {
  if (Array.isArray(value)) {
    value.forEach(item => collectSchemaAnchors(item, anchors));
    return anchors;
  }
  if (!value || typeof value !== 'object') return anchors;
  for (const key of ['$anchor', '$dynamicAnchor']) {
    if (typeof value[key] === 'string' && value[key] !== '') anchors.add(value[key]);
  }
  Object.values(value).forEach(item => collectSchemaAnchors(item, anchors));
  return anchors;
}

function validateLocalSchemaFragment(document, fragment, anchors) {
  let decoded;
  try {
    decoded = decodeURIComponent(fragment.slice(1));
  } catch (error) {
    return { ok: false, detail: `Schema fragment is not valid percent-encoding: ${error.message}` };
  }
  if (decoded === '') return { ok: true };
  if (!decoded.startsWith('/')) {
    return anchors.has(decoded)
      ? { ok: true }
      : { ok: false, detail: `Schema anchor does not exist: #${decoded}` };
  }

  let current = document;
  for (const encodedToken of decoded.slice(1).split('/')) {
    if (/~(?:[^01]|$)/u.test(encodedToken)) {
      return { ok: false, detail: `Schema JSON Pointer has an invalid escape: ${fragment}` };
    }
    const token = encodedToken.replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(token) || Number(token) >= current.length) {
        return { ok: false, detail: `Schema JSON Pointer does not resolve: ${fragment}` };
      }
      current = current[Number(token)];
    } else if (current && typeof current === 'object' && Object.hasOwn(current, token)) {
      current = current[token];
    } else {
      return { ok: false, detail: `Schema JSON Pointer does not resolve: ${fragment}` };
    }
  }
  return { ok: true };
}

function collectJsonReferences(value, source, references, issues, options = {}) {
  const jsonLd = Boolean(options.jsonLd);
  const collectJsonSchema = options.collectJsonSchema !== false;
  const schemaAnchors = collectJsonSchema ? collectSchemaAnchors(value) : new Set();
  const localSchemaFragments = [];
  const schemaNameMapKeywords = new Set([
    '$defs', 'definitions', 'properties', 'patternProperties', 'dependentSchemas'
  ]);

  function visit(item, pointer, keysAreSchemaKeywords = true) {
    if (Array.isArray(item)) {
      item.forEach((child, index) => visit(child, `${pointer}/${index}`, true));
      return;
    }
    if (!item || typeof item !== 'object') return;

    for (const [key, child] of Object.entries(item)) {
      const childPointer = `${pointer}/${escapePointerSegment(key)}`;
      if (key === 'humanUrl') {
        if (typeof child !== 'string') {
          issues.push({
            source: `${source}#${childPointer}`,
            kind: 'humanUrl',
            ref: JSON.stringify(child),
            status: null,
            code: 'INVALID_HUMAN_URL',
            detail: 'Exported humanUrl must be a string.'
          });
        } else {
          const expectedApplicationState = typeof item.id === 'string' && item.id !== ''
            ? { key: 'node', value: item.id }
            : null;
          addReference(
            references,
            `${source}#${childPointer}`,
            'humanUrl',
            child,
            'must-be-project',
            null,
            expectedApplicationState
          );
        }
      }

      if (collectJsonSchema && keysAreSchemaKeywords && (key === '$schema' || key === '$id')) {
        if (key === '$id' && pointer !== '' && typeof child === 'string') {
          issues.push({
            source: `${source}#${childPointer}`,
            kind: 'json-schema:$id',
            ref: typeof child === 'string' ? child : JSON.stringify(child),
            status: null,
            code: 'UNSUPPORTED_NESTED_JSON_SCHEMA_ID',
            detail: 'Nested JSON Schema $id scopes are prohibited by the staged-site contract.'
          });
        }
        if (typeof child === 'string') {
          addReference(
            references,
            `${source}#${childPointer}`,
            `json-schema:${key}`,
            child,
            key === '$id' ? 'must-be-project' : 'internal-if-project'
          );
        } else {
          issues.push({
            source: `${source}#${childPointer}`,
            kind: `json-schema:${key}`,
            ref: JSON.stringify(child),
            status: null,
            code: 'INVALID_JSON_SCHEMA_REFERENCE',
            detail: `${key} must be a string URL.`
          });
        }
      }

      if (collectJsonSchema && keysAreSchemaKeywords && (key === '$ref' || key === '$dynamicRef')) {
        if (typeof child !== 'string') {
          issues.push({
            source: `${source}#${childPointer}`,
            kind: `json-schema:${key}`,
            ref: JSON.stringify(child),
            status: null,
            code: 'INVALID_JSON_SCHEMA_REFERENCE',
            detail: `${key} must be a string URI-reference.`
          });
        } else {
          addReference(references, `${source}#${childPointer}`, `json-schema:${key}`, child);
          if (child.startsWith('#')) {
            localSchemaFragments.push({ source: `${source}#${childPointer}`, kind: key, ref: child });
          }
        }
      }

      const schemaKey = key === 'schema:url' || key === 'schema:contentUrl' ||
        key === 'https://schema.org/url' || key === 'https://schema.org/contentUrl' ||
        key === 'http://schema.org/url' || key === 'http://schema.org/contentUrl' ||
        (jsonLd && (key === 'url' || key === 'contentUrl'));
      if (schemaKey) {
        const values = [];
        extractJsonStrings(child, values);
        values.forEach(ref => addReference(references, `${source}#${childPointer}`, `schema:${key.split(/[:/]/).at(-1)}`, ref));
      }
      const childKeysAreSchemaKeywords = keysAreSchemaKeywords === false
        ? true
        : !schemaNameMapKeywords.has(key);
      visit(child, childPointer, childKeysAreSchemaKeywords);
    }
  }

  visit(value, '');
  for (const reference of localSchemaFragments) {
    const result = validateLocalSchemaFragment(value, reference.ref, schemaAnchors);
    if (!result.ok) {
      issues.push({
        source: reference.source,
        kind: `json-schema:${reference.kind}`,
        ref: reference.ref,
        status: null,
        code: 'BROKEN_JSON_SCHEMA_FRAGMENT',
        detail: result.detail
      });
    }
  }
}

function findHtmlTagEnd(text, start) {
  let quote = null;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }
  return -1;
}

function scanHtmlTags(text) {
  const tags = [];
  const lower = text.toLowerCase();
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf('<', cursor);
    if (start < 0) break;
    if (text.startsWith('<!--', start)) {
      const commentEnd = text.indexOf('-->', start + 4);
      cursor = commentEnd < 0 ? text.length : commentEnd + 3;
      continue;
    }

    let position = start + 1;
    let closing = false;
    if (text[position] === '/') {
      closing = true;
      position += 1;
    }
    while (/\s/u.test(text[position] || '')) position += 1;
    const nameMatch = /^[A-Za-z][A-Za-z0-9:-]*/u.exec(text.slice(position));
    if (!nameMatch) {
      cursor = start + 1;
      continue;
    }
    const tagName = nameMatch[0].toLowerCase();
    const nameEnd = position + nameMatch[0].length;
    const end = findHtmlTagEnd(text, nameEnd);
    if (end < 0) break;
    const tag = {
      tagName,
      closing,
      attributesText: closing ? '' : text.slice(nameEnd, end),
      start,
      end: end + 1,
      rawTextStart: null,
      rawTextEnd: null
    };
    tags.push(tag);
    cursor = end + 1;

    if (!closing && (tagName === 'script' || tagName === 'style')) {
      const closeStart = lower.indexOf(`</${tagName}`, cursor);
      tag.rawTextStart = cursor;
      tag.rawTextEnd = closeStart < 0 ? text.length : closeStart;
      cursor = tag.rawTextEnd;
    }
  }
  let templateDepth = 0;
  for (const tag of tags) {
    if (tag.closing && tag.tagName === 'template' && templateDepth > 0) templateDepth -= 1;
    tag.inTemplateContent = templateDepth > 0;
    if (!tag.closing && tag.tagName === 'template') templateDepth += 1;
  }
  return tags;
}

function decodeCssEscapes(value) {
  return String(value).replace(/\\(?:([0-9a-f]{1,6})\s?|\r\n|\r|\n|(.))/giu, (_, hex, escaped) => {
    if (hex) {
      const codePoint = Number.parseInt(hex, 16);
      return codePoint === 0 || codePoint > 0x10ffff ? '\uFFFD' : String.fromCodePoint(codePoint);
    }
    return escaped || '';
  });
}

function skipCssSpaceAndComments(text, start) {
  let cursor = start;
  while (cursor < text.length) {
    if (/\s/u.test(text[cursor])) {
      cursor += 1;
      continue;
    }
    if (text.startsWith('/*', cursor)) {
      const end = text.indexOf('*/', cursor + 2);
      return end < 0 ? text.length : skipCssSpaceAndComments(text, end + 2);
    }
    break;
  }
  return cursor;
}

function readCssQuotedString(text, start) {
  const quote = text[start];
  if (quote !== '"' && quote !== "'") return null;
  let value = '';
  for (let cursor = start + 1; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (character === quote) return { value: decodeCssEscapes(value), end: cursor + 1 };
    if (character === '\\' && cursor + 1 < text.length) {
      value += character + text[cursor + 1];
      cursor += 1;
    } else {
      value += character;
    }
  }
  return null;
}

function readCssUrlFunction(text, start) {
  if (text.slice(start, start + 3).toLowerCase() !== 'url') return null;
  const previous = text[start - 1] || '';
  const afterName = text[start + 3] || '';
  if (/[A-Za-z0-9_-]/u.test(previous) || /[A-Za-z0-9_-]/u.test(afterName)) return null;
  let cursor = skipCssSpaceAndComments(text, start + 3);
  if (text[cursor] !== '(') return null;
  cursor = skipCssSpaceAndComments(text, cursor + 1);
  const quoted = readCssQuotedString(text, cursor);
  if (quoted) {
    cursor = skipCssSpaceAndComments(text, quoted.end);
    if (text[cursor] !== ')') return null;
    return { value: quoted.value.trim(), end: cursor + 1 };
  }

  let raw = '';
  for (; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (character === ')') return { value: decodeCssEscapes(raw.trim()), end: cursor + 1 };
    if (character === '"' || character === "'" || character === '(') return null;
    if (character === '\\' && cursor + 1 < text.length) {
      raw += character + text[cursor + 1];
      cursor += 1;
    } else {
      raw += character;
    }
  }
  return null;
}

function readCssImageSetFunction(text, start) {
  const names = ['-webkit-image-set', 'image-set'];
  const name = names.find(candidate => text.slice(start, start + candidate.length).toLowerCase() === candidate);
  if (!name) return null;
  const previous = text[start - 1] || '';
  const afterName = text[start + name.length] || '';
  if (/[A-Za-z0-9_-]/u.test(previous) || /[A-Za-z0-9_-]/u.test(afterName)) return null;
  let cursor = skipCssSpaceAndComments(text, start + name.length);
  if (text[cursor] !== '(') return null;
  cursor += 1;
  let segmentStart = cursor;
  let depth = 1;
  let quote = null;
  const segments = [];
  while (cursor < text.length) {
    const character = text[cursor];
    if (quote) {
      if (character === '\\') cursor += 2;
      else {
        if (character === quote) quote = null;
        cursor += 1;
      }
      continue;
    }
    if (text.startsWith('/*', cursor)) {
      const commentEnd = text.indexOf('*/', cursor + 2);
      cursor = commentEnd < 0 ? text.length : commentEnd + 2;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      cursor += 1;
      continue;
    }
    if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        segments.push({ start: segmentStart, end: cursor });
        cursor += 1;
        break;
      }
    } else if (character === ',' && depth === 1) {
      segments.push({ start: segmentStart, end: cursor });
      segmentStart = cursor + 1;
    }
    cursor += 1;
  }
  if (depth !== 0) return null;

  const candidates = [];
  for (const segment of segments) {
    const candidateStart = skipCssSpaceAndComments(text, segment.start);
    const quoted = readCssQuotedString(text, candidateStart);
    if (quoted && quoted.end <= segment.end) {
      if (quoted.value.trim()) candidates.push({ value: quoted.value.trim(), offset: candidateStart });
      continue;
    }
    const url = readCssUrlFunction(text, candidateStart);
    if (url && url.end <= segment.end && url.value) candidates.push({ value: url.value, offset: candidateStart });
  }
  return { candidates, end: cursor };
}

function extractCssReferences(text, source, references, lineOffset = 0) {
  let cursor = 0;
  while (cursor < text.length) {
    if (text.startsWith('/*', cursor)) {
      const end = text.indexOf('*/', cursor + 2);
      cursor = end < 0 ? text.length : end + 2;
      continue;
    }
    const quoted = readCssQuotedString(text, cursor);
    if (quoted) {
      cursor = quoted.end;
      continue;
    }

    if (text.slice(cursor, cursor + 7).toLowerCase() === '@import' && !/[A-Za-z0-9_-]/u.test(text[cursor + 7] || '')) {
      const importStart = cursor;
      cursor = skipCssSpaceAndComments(text, cursor + 7);
      const importedString = readCssQuotedString(text, cursor);
      if (importedString) {
        if (importedString.value.trim()) {
          addReference(
            references,
            `${source}:${lineOffset + lineNumberAt(text, importStart)}`,
            'css:import',
            importedString.value.trim(),
            'must-be-project'
          );
        }
        cursor = importedString.end;
        continue;
      }
      const importedUrl = readCssUrlFunction(text, cursor);
      if (importedUrl) {
        if (importedUrl.value) {
          addReference(
            references,
            `${source}:${lineOffset + lineNumberAt(text, importStart)}`,
            'css:import',
            importedUrl.value,
            'must-be-project'
          );
        }
        cursor = importedUrl.end;
        continue;
      }
      continue;
    }

    const imageSet = readCssImageSetFunction(text, cursor);
    if (imageSet) {
      imageSet.candidates.forEach(candidate => addReference(
        references,
        `${source}:${lineOffset + lineNumberAt(text, candidate.offset)}`,
        'css:image-set',
        candidate.value,
        'must-be-project-or-data'
      ));
      cursor = imageSet.end;
      continue;
    }

    const url = readCssUrlFunction(text, cursor);
    if (url) {
      if (url.value) {
        addReference(
          references,
          `${source}:${lineOffset + lineNumberAt(text, cursor)}`,
          'css:url',
          url.value,
          'must-be-project-or-data'
        );
      }
      cursor = url.end;
      continue;
    }
    cursor += 1;
  }
}

function extractSrcset(value) {
  const input = String(value);
  const urls = [];
  let cursor = 0;
  while (cursor < input.length) {
    while (cursor < input.length && (input[cursor] === ',' || /\s/u.test(input[cursor]))) cursor += 1;
    if (cursor >= input.length) break;

    let url = '';
    while (cursor < input.length && !/\s/u.test(input[cursor])) {
      url += input[cursor];
      cursor += 1;
    }
    if (url.endsWith(',')) {
      url = url.replace(/,+$/u, '');
      if (url) urls.push(url);
      continue;
    }

    let parentheses = 0;
    while (cursor < input.length) {
      const character = input[cursor];
      if (character === '(') parentheses += 1;
      else if (character === ')' && parentheses > 0) parentheses -= 1;
      else if (character === ',' && parentheses === 0) {
        cursor += 1;
        break;
      }
      cursor += 1;
    }
    if (url) urls.push(url);
  }
  return urls;
}

function extractHtmlAnchors(text) {
  const anchors = new Set(['top']);
  for (const tag of scanHtmlTags(text)) {
    if (tag.closing) continue;
    const attributes = parseAttributes(tag.attributesText);
    if (!tag.inTemplateContent) {
      if (attributes.has('id') && attributes.get('id') !== '') anchors.add(attributes.get('id'));
      if (tag.tagName === 'a' && attributes.has('name') && attributes.get('name') !== '') {
        anchors.add(attributes.get('name'));
      }
    }
  }
  return anchors;
}

function extractHtmlRuntimeFragments(text, source, issues) {
  const fragments = new Set();
  for (const tag of scanHtmlTags(text).filter(item => (
    !item.closing && !item.inTemplateContent && item.tagName === 'script'
  ))) {
    const attributes = parseAttributes(tag.attributesText);
    if (!attributes.has('data-runtime-fragment-ids')) continue;
    const declared = attributes.get('data-runtime-fragment-ids').split(/\s+/u).filter(Boolean);
    const scriptBody = text.slice(tag.rawTextStart, tag.rawTextEnd);
    for (const fragment of declared) {
      if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/u.test(fragment)) {
        issues.push({
          source: `${source}:${lineNumberAt(text, tag.start)}`,
          kind: 'runtime fragment declaration',
          ref: fragment,
          status: null,
          code: 'INVALID_RUNTIME_FRAGMENT_DECLARATION',
          detail: 'Runtime fragment IDs must use a portable HTML identifier.'
        });
      } else if (!scriptBody.includes(fragment)) {
        issues.push({
          source: `${source}:${lineNumberAt(text, tag.start)}`,
          kind: 'runtime fragment declaration',
          ref: fragment,
          status: null,
          code: 'UNREFERENCED_RUNTIME_FRAGMENT_DECLARATION',
          detail: 'Declared runtime fragment ID does not appear in its script body.'
        });
      } else {
        fragments.add(fragment);
      }
    }
  }
  return fragments;
}

function extractHtmlReferences(text, source, references, issues) {
  const tags = scanHtmlTags(text);
  const addHtmlReference = (
    location,
    kind,
    ref,
    policy = 'internal-if-project',
    declaredType = null,
    expectedApplicationState = null,
    contextType = null
  ) => {
    addReference(
      references,
      location,
      kind,
      ref,
      policy,
      declaredType,
      expectedApplicationState,
      contextType
    );
  };
  for (const tag of tags.filter(item => !item.closing && item.tagName === 'script')) {
    const attributes = parseAttributes(tag.attributesText);
    const type = attributes.get('type')?.toLowerCase();
    if (type !== 'application/ld+json' && type !== 'application/json') continue;
    const scriptId = attributes.get('id');
    const scriptSource = `${source}:${lineNumberAt(text, tag.start)}${scriptId ? `#${scriptId}` : ''}`;
    try {
      const value = JSON.parse(text.slice(tag.rawTextStart, tag.rawTextEnd));
      collectJsonReferences(value, scriptSource, references, issues, {
        jsonLd: type === 'application/ld+json',
        // Relative JSON Schema identifiers are meaningful for addressable
        // documents, not data copied into an inline script without its own URL.
        collectJsonSchema: false
      });
    } catch (error) {
      issues.push({
        source: scriptSource,
        kind: type,
        ref: '(embedded data)',
        status: null,
        code: 'INVALID_EMBEDDED_JSON',
        detail: error.message
      });
    }
  }

  for (const tag of tags.filter(item => !item.closing)) {
    const tagName = tag.tagName;
    const attributes = parseAttributes(tag.attributesText);
    const line = lineNumberAt(text, tag.start);
    const location = `${source}:${line}`;

    if (tagName === 'iframe' && attributes.has('srcdoc')) {
      issues.push({
        source: location,
        kind: 'srcdoc',
        ref: '(inline browsing context)',
        status: null,
        code: 'UNSUPPORTED_HTML_SRCDOC',
        detail: 'Published HTML must not use iframe srcdoc; nested browsing contexts are outside the static contract.'
      });
    }

    const urlAttributes = ['href', 'src'];
    if (attributes.has('xlink:href')) urlAttributes.push('xlink:href');
    if (attributes.has('poster')) urlAttributes.push('poster');
    if (tagName === 'object' && attributes.has('data')) urlAttributes.push('data');
    if (tagName === 'form' && attributes.has('action')) urlAttributes.push('action');
    if ((tagName === 'button' || tagName === 'input') && attributes.has('formaction')) {
      urlAttributes.push('formaction');
    }
    for (const attributeName of urlAttributes) {
      if (!attributes.has(attributeName)) continue;
      const ref = attributes.get(attributeName);
      const rel = new Set((attributes.get('rel') || '').toLowerCase().split(/\s+/).filter(Boolean));
      let kind = attributeName;
      let policy = ['src', 'poster', 'data', 'xlink:href'].includes(attributeName)
        ? 'must-be-project-or-data'
        : ['action', 'formaction'].includes(attributeName)
          ? 'must-be-project'
          : 'internal-if-project';
      let contextType = null;
      if (attributeName === 'src' && ['script', 'iframe', 'embed'].includes(tagName)) {
        policy = 'must-be-project';
      }
      if (attributeName === 'src' && tagName === 'script') contextType = 'script';
      if (attributeName === 'data' && tagName === 'object') policy = 'must-be-project';
      if (attributeName === 'href' && rel.has('canonical')) {
        kind = 'canonical';
        policy = 'must-be-project';
      } else if (attributeName === 'href' && rel.has('alternate')) {
        kind = 'alternate';
        policy = 'must-be-project';
      } else if (attributeName === 'href' && tagName === 'a' && attributes.has('download')) {
        kind = 'download';
        policy = 'must-be-project';
      } else if (attributeName === 'href' && tagName === 'link') {
        kind = rel.size > 0 ? `link:${[...rel].sort().join(' ')}` : 'link';
        const loadBearingRelations = new Set([
          'stylesheet', 'icon', 'manifest', 'preload', 'modulepreload', 'prefetch',
          'preconnect', 'dns-prefetch', 'apple-touch-icon', 'mask-icon'
        ]);
        if ([...rel].some(value => loadBearingRelations.has(value))) {
          policy = 'must-be-project-or-data';
        }
        if (rel.has('stylesheet')) {
          policy = 'must-be-project';
          contextType = 'style';
        } else if (rel.has('modulepreload')) {
          policy = 'must-be-project';
          contextType = 'script';
        } else if (rel.has('manifest')) {
          policy = 'must-be-project';
        } else if (rel.has('preload')) {
          const as = (attributes.get('as') || '').toLowerCase();
          if (['script', 'style', 'document', 'worker'].includes(as)) policy = 'must-be-project';
          if (as === 'script' || as === 'worker') contextType = 'script';
          if (as === 'style') contextType = 'style';
        }
      } else if (
        (attributeName === 'href' || attributeName === 'xlink:href') &&
        ['image', 'use', 'feimage'].includes(tagName)
      ) {
        kind = `svg:${tagName}:href`;
        policy = 'must-be-project-or-data';
      } else if (
        (attributeName === 'href' || attributeName === 'xlink:href') &&
        tagName === 'script'
      ) {
        kind = 'svg:script:href';
        policy = 'must-be-project';
        contextType = 'script';
      } else if (attributes.has('itemprop')) {
        kind = `schema:${attributes.get('itemprop')}`;
      }
      const declaredType = attributes.get('type');
      addHtmlReference(
        location,
        kind,
        ref,
        policy,
        declaredType && declaredType.includes('/') ? declaredType : null,
        null,
        contextType
      );
    }

    if (tagName === 'base' && attributes.has('href')) {
      issues.push({
        source: location,
        kind: 'base',
        ref: attributes.get('href'),
        status: null,
        code: 'UNSUPPORTED_HTML_BASE',
        detail: 'Published HTML must not use <base>; contract references are resolved from their containing document.'
      });
    }

    for (const srcsetAttribute of ['srcset', 'imagesrcset']) {
      if (!attributes.has(srcsetAttribute)) continue;
      extractSrcset(attributes.get(srcsetAttribute)).forEach(ref => (
        addHtmlReference(location, srcsetAttribute, ref, 'must-be-project-or-data')
      ));
    }
    if (attributes.has('style')) extractCssReferences(attributes.get('style'), source, references, line - 1);

    if (tagName === 'meta' && attributes.has('content')) {
      const property = (attributes.get('property') || attributes.get('name') || '').toLowerCase();
      if (['og:url', 'og:image', 'twitter:url', 'twitter:image', 'msapplication-tileimage'].includes(property)) {
        addHtmlReference(location, `meta:${property}`, attributes.get('content'), 'must-be-project');
      }
      if ((attributes.get('http-equiv') || '').toLowerCase() === 'refresh') {
        const refresh = /^\s*[0-9]+(?:\.[0-9]+)?\s*;\s*url\s*=\s*(?:"([^"]*)"|'([^']*)'|(.+))\s*$/iu.exec(attributes.get('content'));
        const destination = refresh ? (refresh[1] ?? refresh[2] ?? refresh[3]).trim() : '';
        if (destination) {
          addHtmlReference(
            location,
            'meta:refresh',
            destination,
            'must-be-project'
          );
        } else {
          issues.push({
            source: location,
            kind: 'meta:refresh',
            ref: attributes.get('content'),
            status: null,
            code: 'INVALID_META_REFRESH',
            detail: 'Meta refresh must use "delay; url=destination" with a non-empty destination.'
          });
        }
      }
    }
  }

  for (const tag of tags.filter(item => !item.closing && item.tagName === 'style')) {
    extractCssReferences(
      text.slice(tag.rawTextStart, tag.rawTextEnd),
      source,
      references,
      lineNumberAt(text, tag.rawTextStart) - 1
    );
  }
}

function extractXmlReferences(text, source, references) {
  for (const match of text.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/gi)) {
    addReference(references, `${source}:${lineNumberAt(text, match.index)}`, 'sitemap:loc', decodeXML(match[1].trim()), 'must-be-project');
  }
  for (const match of text.matchAll(/<[^>]+\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi)) {
    addReference(references, `${source}:${lineNumberAt(text, match.index)}`, 'sitemap:href', decodeXML(match[1] ?? match[2]), 'must-be-project');
  }
}

function extractRobotsReferences(text, source, references) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = line.match(/^\s*Sitemap\s*:\s*(\S+)\s*$/i);
    if (match) addReference(references, `${source}:${index + 1}`, 'robots:sitemap', match[1], 'must-be-project');
  });
}

async function walkFiles(root) {
  const files = [];
  const symlinks = [];

  async function visit(directory, prefix) {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) symlinks.push(relative);
      else if (entry.isDirectory()) await visit(absolute, relative);
      else if (entry.isFile()) files.push(relative);
    }
  }

  await visit(root, '');
  return { files, symlinks };
}

function mediaEssence(value) {
  return typeof value === 'string' ? value.split(';', 1)[0].trim().toLowerCase() : '';
}

function expectedManifestMediaType(relative) {
  if (path.posix.basename(relative) === '.nojekyll') return 'application/octet-stream';
  return MIME_TYPES[path.posix.extname(relative).toLowerCase()] || 'application/octet-stream';
}

async function validateReleaseManifest(siteDir, files, issues) {
  const manifestRelative = 'release-manifest.json';
  if (!files.includes(manifestRelative)) {
    issues.push({
      source: manifestRelative,
      kind: 'release manifest',
      ref: manifestRelative,
      status: null,
      code: 'RELEASE_MANIFEST_MISSING',
      detail: 'Staged site does not contain release-manifest.json.'
    });
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(await fsp.readFile(path.join(siteDir, manifestRelative), 'utf8'));
  } catch (error) {
    issues.push({
      source: manifestRelative,
      kind: 'release manifest',
      ref: manifestRelative,
      status: null,
      code: 'INVALID_RELEASE_MANIFEST',
      detail: error.message
    });
    return;
  }
  if (!Array.isArray(manifest.files)) {
    issues.push({
      source: manifestRelative,
      kind: 'release manifest',
      ref: '/files',
      status: null,
      code: 'INVALID_RELEASE_MANIFEST',
      detail: 'Release manifest files must be an array.'
    });
    return;
  }

  const expectedPaths = files.filter(file => file !== manifestRelative).sort(compareText);
  const entries = new Map();
  for (const [index, entry] of manifest.files.entries()) {
    const entryPath = entry?.path;
    if (typeof entryPath !== 'string' || entries.has(entryPath)) {
      issues.push({
        source: `${manifestRelative}#/files/${index}`,
        kind: 'release manifest payload',
        ref: String(entryPath),
        status: null,
        code: 'INVALID_RELEASE_MANIFEST_ENTRY',
        detail: 'Each manifest payload path must be a unique string.'
      });
      continue;
    }
    entries.set(entryPath, entry);
  }

  const manifestPaths = [...entries.keys()].sort(compareText);
  if (JSON.stringify(manifestPaths) !== JSON.stringify(expectedPaths)) {
    issues.push({
      source: `${manifestRelative}#/files`,
      kind: 'release manifest coverage',
      ref: '(payload set)',
      status: null,
      code: 'RELEASE_MANIFEST_COVERAGE',
      detail: `Manifest payload paths differ from staged files; expected ${expectedPaths.length}, found ${manifestPaths.length}.`
    });
  }

  let measuredTotal = 0;
  for (const relative of expectedPaths) {
    const bytes = await fsp.readFile(path.join(siteDir, ...relative.split('/')));
    measuredTotal += bytes.byteLength;
    const entry = entries.get(relative);
    if (!entry) continue;
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    const expectedMediaType = expectedManifestMediaType(relative);
    if (
      entry.bytes !== bytes.byteLength ||
      entry.sha256 !== digest ||
      mediaEssence(entry.mediaType) !== mediaEssence(expectedMediaType)
    ) {
      issues.push({
        source: `${manifestRelative}#/files/${manifest.files.indexOf(entry)}`,
        kind: 'release manifest payload',
        ref: relative,
        status: null,
        code: 'RELEASE_MANIFEST_MISMATCH',
        detail: `Manifest metadata does not match staged bytes or media type for ${relative}.`
      });
    }
  }
  if (manifest.fileCount !== expectedPaths.length || manifest.totalBytes !== measuredTotal) {
    issues.push({
      source: manifestRelative,
      kind: 'release manifest totals',
      ref: '(totals)',
      status: null,
      code: 'RELEASE_MANIFEST_TOTALS',
      detail: `Manifest totals do not match ${expectedPaths.length} payload files and ${measuredTotal} bytes.`
    });
  }
  if (manifest.manifest?.selfHashExcluded !== true || manifest.manifest?.path !== manifestRelative) {
    issues.push({
      source: `${manifestRelative}#/manifest`,
      kind: 'release manifest self-reference policy',
      ref: manifestRelative,
      status: null,
      code: 'RELEASE_MANIFEST_SELF_POLICY',
      detail: 'Manifest must explicitly identify and exclude its own cryptographic self-reference.'
    });
  }
}

function publicUrlForFile(relative, publicOrigin, basePath) {
  const encoded = relative.split('/').map(encodeURIComponent).join('/');
  if (relative === 'index.html') return new URL(basePath, publicOrigin);
  if (relative.endsWith('/index.html')) return new URL(`${basePath}${encoded.slice(0, -'index.html'.length)}`, publicOrigin);
  return new URL(`${basePath}${encoded}`, publicOrigin);
}

function sourceFileFromReference(source) {
  return source.split(/[:#]/, 1)[0];
}

function referenceBaseUrl(reference, publicOrigin, basePath) {
  const sourceFile = sourceFileFromReference(reference.source);
  return publicUrlForFile(sourceFile, publicOrigin, basePath);
}

function classifyReference(reference, options) {
  const raw = String(reference.ref).trim();
  if (hasTraversal(raw)) {
    return { ok: false, code: 'TRAVERSAL_REFERENCE', detail: 'Reference contains a parent-directory traversal segment.' };
  }

  let resolved;
  try {
    resolved = new URL(raw, referenceBaseUrl(reference, options.publicOrigin, options.basePath));
  } catch (error) {
    return { ok: false, code: 'MALFORMED_REFERENCE', detail: error.message };
  }

  if (resolved.username || resolved.password) {
    return {
      ok: false,
      code: 'URL_CREDENTIALS',
      resolved: resolved.href,
      detail: 'Published references must not contain URL user information.'
    };
  }

  if (!['http:', 'https:'].includes(resolved.protocol)) {
    if (reference.policy === 'must-be-project-or-data' && resolved.protocol === 'data:') {
      return { ignored: true, resolved: resolved.href, detail: 'Self-contained data URL' };
    }
    if (reference.policy === 'must-be-project' || reference.policy === 'must-be-project-or-data') {
      return { ok: false, code: 'NON_HTTP_PROJECT_REFERENCE', detail: `${reference.kind} must resolve to the staged project.` };
    }
    return { ignored: true, resolved: resolved.href, detail: `Non-fetch URL scheme ${resolved.protocol}` };
  }

  const publicUrl = new URL(options.publicOrigin);
  const sameHost = resolved.hostname.toLowerCase() === publicUrl.hostname.toLowerCase() && resolved.port === publicUrl.port;
  if (sameHost && resolved.protocol !== publicUrl.protocol) {
    return { ok: false, code: 'PROJECT_ORIGIN_MISMATCH', resolved: resolved.href, detail: `Expected ${publicUrl.protocol} for the project origin.` };
  }
  if (resolved.origin !== publicUrl.origin) {
    if (reference.policy === 'must-be-project' || reference.policy === 'must-be-project-or-data') {
      return { ok: false, code: 'EXTERNAL_PROJECT_REFERENCE', resolved: resolved.href, detail: `${reference.kind} must stay on the configured project origin.` };
    }
    return { ignored: true, resolved: resolved.href, detail: 'External URL' };
  }

  const baseWithoutSlash = options.basePath.slice(0, -1);
  if (resolved.pathname !== baseWithoutSlash && !resolved.pathname.startsWith(options.basePath)) {
    return {
      ok: false,
      code: 'OUTSIDE_PROJECT_BASE',
      resolved: resolved.href,
      detail: `Project reference must remain under ${options.basePath}.`
    };
  }

  if (reference.kind === 'json-schema:$id') {
    const sourceUrl = referenceBaseUrl(reference, options.publicOrigin, options.basePath);
    const resolvedIdentity = `${resolved.origin}${resolved.pathname}${resolved.search}`;
    const sourceIdentity = `${sourceUrl.origin}${sourceUrl.pathname}${sourceUrl.search}`;
    if (resolved.hash || resolvedIdentity !== sourceIdentity) {
      return {
        ok: false,
        code: 'JSON_SCHEMA_IDENTITY_MISMATCH',
        resolved: resolved.href,
        detail: 'Root JSON Schema $id must identify its own staged document without a fragment.'
      };
    }
  }

  return { internal: true, resolved };
}

async function readJsonDocument(
  absolute,
  relative,
  references,
  issues,
  jsonLd,
  jsonDocuments,
  jsonDocumentDigests
) {
  let value;
  let bytes;
  try {
    bytes = await fsp.readFile(absolute);
    value = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    issues.push({
      source: relative,
      kind: jsonLd ? 'JSON-LD export' : 'JSON export',
      ref: '(document)',
      status: null,
      code: 'INVALID_JSON_EXPORT',
      detail: error.message
    });
    return;
  }
  jsonDocuments.set(relative, value);
  jsonDocumentDigests.set(relative, crypto.createHash('sha256').update(bytes).digest('hex'));
  collectJsonReferences(value, relative, references, issues, { jsonLd });
}

async function readNdjsonDocument(absolute, relative, references, issues) {
  const lines = (await fsp.readFile(absolute, 'utf8')).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    try {
      const value = JSON.parse(line);
      collectJsonReferences(value, `${relative}:${index + 1}`, references, issues);
    } catch (error) {
      issues.push({
        source: `${relative}:${index + 1}`,
        kind: 'NDJSON export',
        ref: '(record)',
        status: null,
        code: 'INVALID_NDJSON_EXPORT',
        detail: error.message
      });
    }
  });
}

function stableCompare(left, right) {
  return compareText(left.source, right.source) ||
    compareText(left.kind, right.kind) ||
    compareText(left.ref, right.ref) ||
    compareText(left.code || '', right.code || '');
}

function normalizeMime(value) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase();
}

function expectedMimeTypes(url, declaredType, contextType) {
  const extension = path.posix.extname(url.pathname).toLowerCase();
  const fromExtension = url.pathname.endsWith('/') ? ['text/html'] : [...(EXPECTED_MIME_TYPES[extension] || [])];
  const declared = normalizeMime(declaredType);
  const fromContext = contextType === 'script'
    ? ['text/javascript', 'application/javascript']
    : contextType === 'style'
      ? ['text/css']
      : [];
  return {
    fromExtension,
    declared: declared && declared.includes('/') ? declared : null,
    fromContext
  };
}

function validateMime(url, declaredType, contextType, actualType) {
  const expected = expectedMimeTypes(url, declaredType, contextType);
  const actual = normalizeMime(actualType);
  const expectedLabels = [];
  if (expected.fromExtension.length) expectedLabels.push(`extension: ${expected.fromExtension.join(' or ')}`);
  if (expected.declared) expectedLabels.push(`declared: ${expected.declared}`);
  if (expected.fromContext.length) expectedLabels.push(`context: ${expected.fromContext.join(' or ')}`);
  const extensionMatches = !expected.fromExtension.length || expected.fromExtension.includes(actual);
  const declarationMatches = !expected.declared || expected.declared === actual;
  const contextMatches = !expected.fromContext.length || expected.fromContext.includes(actual);
  return {
    ok: extensionMatches && declarationMatches && contextMatches,
    expectedMime: expectedLabels.join('; ') || null,
    actualMime: actual || null,
    detail: extensionMatches && declarationMatches && contextMatches
      ? null
      : `Expected MIME ${expectedLabels.join('; ') || '(unspecified)'}; received ${actual || '(missing Content-Type)'}.`
  };
}

function relativeFileFromProjectUrl(url, options) {
  const baseWithoutSlash = options.basePath.slice(0, -1);
  let encodedRelative;
  if (url.pathname === baseWithoutSlash || url.pathname === options.basePath) {
    encodedRelative = '';
  } else if (url.pathname.startsWith(options.basePath)) {
    encodedRelative = url.pathname.slice(options.basePath.length);
  } else {
    return null;
  }
  let relative;
  try {
    relative = decodeURIComponent(encodedRelative);
  } catch {
    return null;
  }
  if (relative.includes('\0') || relative.includes('\\') || hasTraversal(relative)) return null;
  if (relative === '' || relative.endsWith('/')) relative += 'index.html';
  return relative;
}

const APPLICATION_STATE_KEYS = new Set([
  'status', 'audit', 'research', 'mode', 'view', 'opportunity', 'opp', 'oppPanel',
  'oppBand', 'node', 'cx', 'cy', 'z', 'theme'
]);

function isApplicationStateFragment(fragment) {
  if (!fragment.includes('=')) return false;
  const params = new URLSearchParams(fragment);
  const keys = [...params.keys()];
  return keys.length > 0 && keys.every(key => APPLICATION_STATE_KEYS.has(key));
}

function buildApplicationStateIndex(jsonDocuments, jsonDocumentDigests, issues) {
  const index = {
    atlasNodeIds: new Set(),
    atlasSourceCount: 0,
    opportunityMapIds: new Set(),
    opportunityNodeIds: new Set(),
    opportunitySourceCount: 0
  };
  const atlasCandidates = [];
  const opportunityCandidates = [];
  for (const [source, document] of jsonDocuments.entries()) {
    if (!document || typeof document !== 'object') continue;
    if (document.dataset && Array.isArray(document.nodes)) {
      atlasCandidates.push({ source, document });
    }
    if (document.metadata?.anchorAtlasNodeId && Array.isArray(document.nodes)) {
      opportunityCandidates.push({ source, document });
    }
  }
  const collapseApprovedOpportunityCopies = candidates => {
    const remaining = new Map(candidates.map(candidate => [candidate.source, candidate]));
    for (const [canonical, compatibility] of APPLICATION_STATE_COMPATIBILITY_PAIRS) {
      if (!remaining.has(canonical) || !remaining.has(compatibility)) continue;
      const canonicalDigest = jsonDocumentDigests.get(canonical);
      const compatibilityDigest = jsonDocumentDigests.get(compatibility);
      if (canonicalDigest && canonicalDigest === compatibilityDigest) {
        remaining.delete(compatibility);
        continue;
      }
      issues.push({
        source: compatibility,
        kind: 'Opportunity compatibility payload',
        ref: canonical,
        status: null,
        code: 'APPLICATION_STATE_COMPATIBILITY_MISMATCH',
        detail: `Approved compatibility copy must be byte-identical to ${canonical}.`
      });
    }
    return [...remaining.values()];
  };
  const uniqueAtlasCandidates = atlasCandidates;
  const uniqueOpportunityCandidates = collapseApprovedOpportunityCopies(opportunityCandidates);
  index.atlasSourceCount = uniqueAtlasCandidates.length;
  index.opportunitySourceCount = uniqueOpportunityCandidates.length;

  const recordDuplicateIds = (candidate, label) => {
    const firstIndexById = new Map();
    candidate.document.nodes.forEach((node, nodeIndex) => {
      if (typeof node?.id !== 'string' || node.id === '') return;
      if (firstIndexById.has(node.id)) {
        issues.push({
          source: `${candidate.source}#/nodes/${nodeIndex}/id`,
          kind: `${label} ID`,
          ref: node.id,
          status: null,
          code: 'DUPLICATE_APPLICATION_STATE_ID',
          detail: `${label} ID duplicates /nodes/${firstIndexById.get(node.id)}/id: ${node.id}`
        });
      } else {
        firstIndexById.set(node.id, nodeIndex);
      }
    });
  };
  uniqueAtlasCandidates.forEach(candidate => recordDuplicateIds(candidate, 'atlas node'));
  uniqueOpportunityCandidates.forEach(candidate => recordDuplicateIds(candidate, 'Opportunity node'));

  const firstOpportunityMapById = new Map();
  uniqueOpportunityCandidates.forEach(candidate => {
    const id = candidate.document.metadata?.id;
    if (typeof id !== 'string' || id === '') return;
    if (firstOpportunityMapById.has(id)) {
      issues.push({
        source: `${candidate.source}#/metadata/id`,
        kind: 'Opportunity map ID',
        ref: id,
        status: null,
        code: 'DUPLICATE_APPLICATION_STATE_ID',
        detail: `Opportunity map ID also appears in ${firstOpportunityMapById.get(id)}: ${id}`
      });
    } else {
      firstOpportunityMapById.set(id, `${candidate.source}#/metadata/id`);
    }
  });

  if (uniqueAtlasCandidates.length === 1) {
    uniqueAtlasCandidates[0].document.nodes.forEach(node => {
      if (typeof node?.id === 'string' && node.id !== '') index.atlasNodeIds.add(node.id);
    });
  }
  if (uniqueOpportunityCandidates.length === 1) {
    const document = uniqueOpportunityCandidates[0].document;
    if (typeof document.metadata.id === 'string' && document.metadata.id !== '') {
      index.opportunityMapIds.add(document.metadata.id);
    }
    document.nodes.forEach(node => {
      if (typeof node?.id === 'string' && node.id !== '') index.opportunityNodeIds.add(node.id);
    });
  }
  return index;
}

function validateApplicationState(fragment, index, expectedApplicationState) {
  const params = new URLSearchParams(fragment);
  const checks = [
    ['node', index.atlasNodeIds, 'atlas node', index.atlasSourceCount],
    ['opportunity', index.opportunityMapIds, 'Opportunity map', index.opportunitySourceCount],
    ['opp', index.opportunityNodeIds, 'Opportunity node', index.opportunitySourceCount]
  ];
  for (const [key, knownIds, label, sourceCount] of checks) {
    if (!params.has(key)) continue;
    if (sourceCount !== 1) {
      return {
        ok: false,
        fragmentStatus: 'application-state-source-ambiguous',
        code: 'APPLICATION_STATE_INDEX_AMBIGUOUS',
        detail: `Expected exactly one staged ID source for ${label}; found ${sourceCount}.`
      };
    }
    const value = params.get(key);
    if (!value || !knownIds.has(value)) {
      return {
        ok: false,
        fragmentStatus: 'application-state-invalid',
        code: 'BROKEN_APPLICATION_STATE',
        detail: `${label} referenced by #${key}= does not exist: ${value || '(empty)'}`
      };
    }
  }
  if (expectedApplicationState) {
    const actual = params.get(expectedApplicationState.key);
    if (actual !== expectedApplicationState.value) {
      return {
        ok: false,
        fragmentStatus: 'application-state-misdirected',
        code: 'BROKEN_APPLICATION_STATE',
        detail: `Record ${expectedApplicationState.value} points to ` +
          `#${expectedApplicationState.key}=${actual || '(missing)'}.`
      };
    }
  }
  return { ok: true, fragmentStatus: 'application-state-verified' };
}

function validateHtmlFragment(
  reference,
  publicUrl,
  options,
  htmlAnchors,
  htmlRuntimeFragments,
  applicationStateIndex
) {
  if (!publicUrl.hash || reference.kind.startsWith('json-schema:')) {
    return { ok: true, fragmentStatus: null };
  }
  const relative = relativeFileFromProjectUrl(publicUrl, options);
  const anchors = relative == null ? null : htmlAnchors.get(relative);
  if (!anchors) return { ok: true, fragmentStatus: null };

  let fragment;
  try {
    fragment = decodeURIComponent(publicUrl.hash.slice(1));
  } catch (error) {
    return {
      ok: false,
      fragmentStatus: 'invalid',
      code: 'MALFORMED_FRAGMENT',
      detail: `HTML fragment is not valid percent-encoding: ${error.message}`
    };
  }
  if (fragment === '' || fragment.startsWith(':~:text=')) return { ok: true, fragmentStatus: 'browser-directive' };
  if (isApplicationStateFragment(fragment)) {
    return validateApplicationState(fragment, applicationStateIndex, reference.expectedApplicationState);
  }
  if (!anchors.has(fragment)) {
    if (htmlRuntimeFragments.get(relative)?.has(fragment)) {
      return { ok: true, fragmentStatus: 'runtime-declared-pending-browser' };
    }
    return {
      ok: false,
      fragmentStatus: 'missing',
      code: 'BROKEN_HTML_FRAGMENT',
      detail: `HTML fragment target does not exist in ${relative}: #${fragment}`
    };
  }
  return { ok: true, fragmentStatus: 'verified' };
}

function validateCrossDocumentSchemaFragment(reference, publicUrl, options, jsonDocuments) {
  if (
    !['json-schema:$ref', 'json-schema:$dynamicRef'].includes(reference.kind) ||
    String(reference.ref).startsWith('#') ||
    !publicUrl.hash
  ) {
    return { ok: true };
  }
  const relative = relativeFileFromProjectUrl(publicUrl, options);
  const document = relative == null ? null : jsonDocuments.get(relative);
  if (!document) {
    return {
      ok: false,
      code: 'BROKEN_JSON_SCHEMA_FRAGMENT',
      detail: `Schema fragment target is not a valid staged JSON document: ${relative || publicUrl.pathname}`
    };
  }
  const result = validateLocalSchemaFragment(document, publicUrl.hash, collectSchemaAnchors(document));
  return result.ok ? result : { ...result, code: 'BROKEN_JSON_SCHEMA_FRAGMENT' };
}

async function auditSite(input = {}) {
  const options = {
    siteDir: path.resolve(input.siteDir || DEFAULT_SITE_DIR),
    basePath: normalizeBasePath(input.basePath || DEFAULT_BASE_PATH),
    publicOrigin: normalizePublicOrigin(input.publicOrigin || DEFAULT_PUBLIC_ORIGIN)
  };

  const references = [];
  const issues = [];
  const counts = { html: 0, css: 0, json: 0, jsonld: 0, ndjson: 0, sitemap: 0 };
  const htmlAnchors = new Map();
  const htmlRuntimeFragments = new Map();
  const jsonDocuments = new Map();
  const jsonDocumentDigests = new Map();

  let siteStat;
  try {
    siteStat = await fsp.stat(options.siteDir);
  } catch (error) {
    return {
      ok: false,
      options,
      counts,
      checkedReferences: 0,
      uniqueResources: 0,
      ignoredReferences: 0,
      results: [],
      failures: [{
        source: path.basename(options.siteDir),
        kind: 'site root',
        ref: options.siteDir,
        status: null,
        code: 'SITE_ROOT_MISSING',
        detail: error.message
      }]
    };
  }
  if (!siteStat.isDirectory()) throw new TypeError(`Site root is not a directory: ${options.siteDir}`);

  const { files, symlinks } = await walkFiles(options.siteDir);
  symlinks.forEach(relative => issues.push({
    source: relative,
    kind: 'staged file',
    ref: relative,
    status: null,
    code: 'UNSAFE_SYMLINK',
    detail: 'Staged site must not contain symbolic links.'
  }));
  if (!files.includes('index.html')) issues.push({
    source: 'index.html',
    kind: 'entry point',
    ref: './index.html',
    status: null,
    code: 'ENTRY_POINT_MISSING',
    detail: 'Staged site does not contain index.html.'
  });
  await validateReleaseManifest(options.siteDir, files, issues);

  for (const relative of files) {
    const absolute = path.join(options.siteDir, ...relative.split('/'));
    const extension = path.extname(relative).toLowerCase();
    if (extension === '.html') {
      counts.html += 1;
      const text = await fsp.readFile(absolute, 'utf8');
      htmlAnchors.set(relative, extractHtmlAnchors(text));
      htmlRuntimeFragments.set(relative, extractHtmlRuntimeFragments(text, relative, issues));
      extractHtmlReferences(text, relative, references, issues);
    } else if (extension === '.css') {
      counts.css += 1;
      extractCssReferences(await fsp.readFile(absolute, 'utf8'), relative, references);
    } else if (extension === '.json') {
      counts.json += 1;
      await readJsonDocument(
        absolute,
        relative,
        references,
        issues,
        false,
        jsonDocuments,
        jsonDocumentDigests
      );
    } else if (extension === '.jsonld') {
      counts.jsonld += 1;
      await readJsonDocument(
        absolute,
        relative,
        references,
        issues,
        true,
        jsonDocuments,
        jsonDocumentDigests
      );
    } else if (extension === '.ndjson') {
      counts.ndjson += 1;
      await readNdjsonDocument(absolute, relative, references, issues);
    } else if (extension === '.xml' && /(^|\/)sitemap[^/]*\.xml$/i.test(relative)) {
      counts.sitemap += 1;
      extractXmlReferences(await fsp.readFile(absolute, 'utf8'), relative, references);
    } else if (/(^|\/)robots\.txt$/i.test(relative)) {
      extractRobotsReferences(await fsp.readFile(absolute, 'utf8'), relative, references);
    }
  }

  references.sort(stableCompare);
  const applicationStateIndex = buildApplicationStateIndex(jsonDocuments, jsonDocumentDigests, issues);
  issues.sort(stableCompare);

  const server = await startSiteServer({ siteDir: options.siteDir, basePath: options.basePath });
  const statusCache = new Map();
  const results = [];
  let ignoredReferences = 0;

  try {
    for (const reference of references) {
      const classification = classifyReference(reference, options);
      if (classification.ignored) {
        ignoredReferences += 1;
        continue;
      }
      if (!classification.internal) {
        results.push({ ...reference, status: null, ...classification, ok: false });
        continue;
      }

      const publicUrl = classification.resolved;
      const cacheKey = `${publicUrl.pathname}${publicUrl.search}`;
      let responseContract = statusCache.get(cacheKey);
      if (responseContract == null) {
        const localUrl = new URL(`${publicUrl.pathname}${publicUrl.search}`, server.origin);
        try {
          const response = await fetch(localUrl, { method: 'HEAD', redirect: 'manual' });
          responseContract = {
            status: response.status,
            contentType: response.headers.get('content-type')
          };
        } catch {
          responseContract = { status: 0, contentType: null };
        }
        statusCache.set(cacheKey, responseContract);
      }
      const { status, contentType } = responseContract;
      const statusOk = status >= 200 && status < 300;
      const mime = validateMime(publicUrl, reference.declaredType, reference.contextType, contentType);
      const schemaFragment = statusOk
        ? validateCrossDocumentSchemaFragment(reference, publicUrl, options, jsonDocuments)
        : { ok: true };
      const htmlFragment = statusOk && mime.ok
        ? validateHtmlFragment(
          reference,
          publicUrl,
          options,
          htmlAnchors,
          htmlRuntimeFragments,
          applicationStateIndex
        )
        : { ok: true, fragmentStatus: null };
      const ok = statusOk && mime.ok && schemaFragment.ok && htmlFragment.ok;
      results.push({
        ...reference,
        resolved: publicUrl.href,
        status,
        expectedMime: mime.expectedMime,
        actualMime: mime.actualMime,
        fragmentStatus: htmlFragment.fragmentStatus,
        ok,
        code: ok
          ? null
          : !statusOk
            ? 'HTTP_STATUS'
            : !mime.ok
              ? 'CONTENT_TYPE_MISMATCH'
              : schemaFragment.ok
                ? htmlFragment.code
                : schemaFragment.code,
        detail: ok
          ? null
          : !statusOk
            ? `Staged resource returned HTTP ${status || 'network error'}.`
            : !mime.ok
              ? mime.detail
              : schemaFragment.ok
                ? htmlFragment.detail
                : schemaFragment.detail
      });
    }
  } finally {
    await server.close();
  }

  const failures = [...issues, ...results.filter(result => !result.ok)].sort(stableCompare);
  return {
    ok: failures.length === 0,
    options,
    counts,
    checkedReferences: results.length,
    uniqueResources: statusCache.size,
    ignoredReferences,
    results,
    failures
  };
}

function parseCliArguments(argv) {
  const options = {
    siteDir: DEFAULT_SITE_DIR,
    basePath: DEFAULT_BASE_PATH,
    publicOrigin: DEFAULT_PUBLIC_ORIGIN,
    verbose: false,
    json: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--site') options.siteDir = argv[++index];
    else if (argument === '--base') options.basePath = argv[++index];
    else if (argument === '--origin') options.publicOrigin = argv[++index];
    else if (argument === '--verbose') options.verbose = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new TypeError(`Unknown argument: ${argument}`);
    if (['--site', '--base', '--origin'].includes(argument) && options[{
      '--site': 'siteDir', '--base': 'basePath', '--origin': 'publicOrigin'
    }[argument]] == null) throw new TypeError(`Missing value for ${argument}`);
  }
  return options;
}

function usage() {
  return [
    'Usage: node scripts/site-contract-test.cjs [options]',
    '',
    'Options:',
    '  --site <directory>  Staged site root (default: _site)',
    '  --base <pathname>   GitHub Pages project base (default: /ai_tech_tree/)',
    '  --origin <origin>   Public project origin (default: https://neb6dav.github.io)',
    '  --verbose           Print every checked internal reference',
    '  --json              Emit the deterministic report as JSON',
    '  -h, --help          Show this help'
  ].join('\n');
}

function printableResult(result) {
  const status = result.status == null ? '-' : result.status;
  const destination = result.resolved || result.ref;
  const mime = result.expectedMime || result.actualMime
    ? ` mime=${JSON.stringify(result.actualMime || '(missing)')} expected=${JSON.stringify(result.expectedMime || '(unspecified)')}`
    : '';
  return `${result.ok ? 'OK  ' : 'FAIL'} ${result.source} [${result.kind}] ${JSON.stringify(result.ref)} -> ${destination} status=${status}${mime}${result.code ? ` ${result.code}` : ''}${result.detail ? `: ${result.detail}` : ''}`;
}

async function main(argv = process.argv.slice(2)) {
  let cli;
  try {
    cli = parseCliArguments(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage()}\n`);
    return 2;
  }
  if (cli.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  let report;
  try {
    report = await auditSite(cli);
  } catch (error) {
    process.stderr.write(`Site contract test could not run: ${error.stack || error.message}\n`);
    return 2;
  }

  if (cli.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    if (cli.verbose) report.results.forEach(result => process.stdout.write(`${printableResult(result)}\n`));
    report.failures.forEach(failure => process.stderr.write(`${printableResult({ ...failure, ok: false })}\n`));
    const summary = `${report.ok ? 'SITE CONTRACT PASS' : 'SITE CONTRACT FAIL'}: ${report.checkedReferences} internal references, ${report.uniqueResources} unique staged resources, ${report.ignoredReferences} external/non-fetch references ignored; ${report.counts.html} HTML, ${report.counts.css} CSS, ${report.counts.json} JSON, ${report.counts.jsonld} JSON-LD, ${report.counts.ndjson} NDJSON, ${report.counts.sitemap} sitemap files.`;
    (report.ok ? process.stdout : process.stderr).write(`${summary}\n`);
  }
  return report.ok ? 0 : 1;
}

if (require.main === module) {
  main().then(code => {
    process.exitCode = code;
  });
}

module.exports = {
  DEFAULT_BASE_PATH,
  DEFAULT_PUBLIC_ORIGIN,
  auditSite,
  classifyReference,
  createSiteHandler,
  extractHtmlReferences,
  hasTraversal,
  main,
  normalizeBasePath,
  normalizePublicOrigin,
  normalizeMime,
  parseCliArguments,
  startSiteServer,
  validateMime
};
