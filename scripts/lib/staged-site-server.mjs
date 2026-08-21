import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

export const STAGED_SITE_LOOPBACK = '127.0.0.1';
export const STAGED_SITE_MOUNT_PATH = '/ai_tech_tree/';

const mediaTypes = new Map([
  ['.cff', 'text/plain; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.jsonld', 'application/ld+json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.ndjson', 'application/x-ndjson; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8']
]);

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff',
    ...headers
  });
  response.end(body);
}

async function serveSite(siteRoot, request, response) {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(response, 405, 'Method not allowed', { allow: 'GET, HEAD' });
      return;
    }

    const requestUrl = new URL(request.url ?? '/', `http://${STAGED_SITE_LOOPBACK}`);
    if (requestUrl.pathname === STAGED_SITE_MOUNT_PATH.slice(0, -1)) {
      send(response, 308, '', { location: STAGED_SITE_MOUNT_PATH });
      return;
    }
    if (!requestUrl.pathname.startsWith(STAGED_SITE_MOUNT_PATH)) {
      send(response, 404, 'Not found');
      return;
    }

    let relativePath;
    try {
      relativePath = decodeURIComponent(requestUrl.pathname.slice(STAGED_SITE_MOUNT_PATH.length));
    } catch {
      send(response, 400, 'Malformed path');
      return;
    }
    relativePath ||= 'index.html';

    const segments = relativePath.split('/');
    if (
      relativePath.includes('\0') ||
      relativePath.includes('\\') ||
      segments.some(segment => segment === '..')
    ) {
      send(response, 400, 'Invalid path');
      return;
    }

    let target = path.resolve(siteRoot, ...segments);
    const relativeTarget = path.relative(siteRoot, target);
    if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
      send(response, 403, 'Forbidden');
      return;
    }

    const targetStat = await fs.stat(target);
    if (targetStat.isDirectory()) target = path.join(target, 'index.html');
    const payload = await fs.readFile(target);
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': payload.byteLength,
      'content-type': mediaTypes.get(path.extname(target).toLowerCase()) ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff'
    });
    response.end(request.method === 'HEAD' ? undefined : payload);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      send(response, 404, 'Not found');
      return;
    }
    send(response, 500, 'Internal server error');
  }
}

export async function startStagedSiteServer({ siteRoot }) {
  const resolvedSiteRoot = path.resolve(siteRoot);
  await fs.access(path.join(resolvedSiteRoot, 'index.html'));

  const server = http.createServer((request, response) => {
    void serveSite(resolvedSiteRoot, request, response);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, STAGED_SITE_LOOPBACK, resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object', 'loopback server did not expose an address');
  const origin = `http://${STAGED_SITE_LOOPBACK}:${address.port}`;
  let closed = false;

  return Object.freeze({
    origin,
    url: `${origin}${STAGED_SITE_MOUNT_PATH}`,
    async close() {
      if (closed || !server.listening) return;
      closed = true;
      await new Promise((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      });
    }
  });
}
