'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  auditSite,
  startSiteServer
} = require('../scripts/site-contract-test.cjs');

const BASE_PATH = '/ai_tech_tree/';
const PUBLIC_ORIGIN = 'https://neb6dav.github.io';

async function writeFile(root, relative, contents) {
  const target = path.join(root, ...relative.split('/'));
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, contents);
}

async function makeFixture(overrides = {}) {
  const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'ai-tree-site-contract-'));
  const siteDir = path.join(temporary, '_site');
  await fsp.mkdir(siteDir);

  const files = {
    'index.html': `<!doctype html>
<html><head>
  <link rel="canonical" href="https://neb6dav.github.io/ai_tech_tree/">
  <link rel="alternate" type="application/json" href="./atlas.json">
  <link rel="license" href="https://creativecommons.org/licenses/by-sa/4.0/">
  <meta property="og:image" content="https://neb6dav.github.io/ai_tech_tree/social.png">
  <script type="application/ld+json">{"@context":{"schema":"https://schema.org/"},"schema:contentUrl":{"@id":"./atlas.json"}}</script>
</head><body><main id="entry">
  <a href="#entry">Local fragment</a>
  <a href="./atlas.json" download>Download</a>
  <img src="./social.png" alt="">
  <a href="https://example.test/external">External reference</a>
</main></body></html>`,
    'ai-research-tech-tree.html': '<!doctype html><title>Legacy atlas alias</title>',
    'atlas.json': JSON.stringify({
      dataset: { humanUrl: './' },
      nodes: [{ id: 'one', humanUrl: './#node=one' }]
    }),
    'src/data/opportunities/opportunity.alpha.json': JSON.stringify({
      $schema: './opportunity-map.schema.json',
      schemaVersion: '1.0.0'
    }),
    'src/data/opportunities/opportunity-map.schema.json': JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://neb6dav.github.io/ai_tech_tree/src/data/opportunities/opportunity-map.schema.json',
      $defs: { record: { type: 'object' } },
      $ref: '#/$defs/record'
    }),
    'stream.ndjson': `${JSON.stringify({ humanUrl: './#node=one' })}\n`,
    'social.png': 'not-a-real-png',
    'robots.txt': 'User-agent: *\nSitemap: https://neb6dav.github.io/ai_tech_tree/sitemap.xml\n',
    'sitemap.xml': '<?xml version="1.0"?><urlset><url><loc>https://neb6dav.github.io/ai_tech_tree/</loc></url></urlset>'
  };
  Object.assign(files, overrides);
  if (!Object.hasOwn(overrides, 'release-manifest.json')) {
    const mediaType = relative => ({
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.jsonld': 'application/ld+json',
      '.ndjson': 'application/x-ndjson',
      '.png': 'image/png',
      '.txt': 'text/plain; charset=utf-8',
      '.xml': 'application/xml; charset=utf-8'
    }[path.posix.extname(relative)] || 'application/octet-stream');
    const payloads = Object.entries(files)
      .filter(([, contents]) => contents != null)
      .map(([relative, contents]) => {
        const bytes = Buffer.from(contents);
        return {
          path: relative,
          mediaType: mediaType(relative),
          bytes: bytes.byteLength,
          sha256: crypto.createHash('sha256').update(bytes).digest('hex')
        };
      })
      .sort((left, right) => left.path.localeCompare(right.path));
    files['release-manifest.json'] = `${JSON.stringify({
      manifest: { path: 'release-manifest.json', selfHashExcluded: true },
      fileCount: payloads.length,
      totalBytes: payloads.reduce((sum, file) => sum + file.bytes, 0),
      files: payloads
    }, null, 2)}\n`;
  }
  for (const [relative, contents] of Object.entries(files)) {
    if (contents != null) await writeFile(siteDir, relative, contents);
  }
  return { temporary, siteDir };
}

async function removeFixture(fixture) {
  await fsp.rm(fixture.temporary, { recursive: true, force: true });
}

function audit(fixture) {
  return auditSite({ siteDir: fixture.siteDir, basePath: BASE_PATH, publicOrigin: PUBLIC_ORIGIN });
}

test('passes a complete staged project and checks all contract classes', async t => {
  const fixture = await makeFixture();
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert.equal(report.ok, true, report.failures.map(failure => failure.detail).join('\n'));
  assert(report.checkedReferences >= 10);
  assert(report.ignoredReferences >= 1);
  assert(report.results.some(result => result.kind === 'canonical' && result.status === 200));
  assert(report.results.some(result => result.kind === 'alternate' && result.status === 200));
  assert(report.results.some(result => result.kind === 'download' && result.status === 200));
  assert(report.results.some(result => result.ref === '#entry' && result.fragmentStatus === 'verified'));
  assert(report.results.some(result => result.kind === 'humanUrl' && result.status === 200));
  assert(report.results.some(result => result.ref.endsWith('#node=one') && result.fragmentStatus === 'application-state-verified'));
  assert(report.results.some(result => result.kind === 'schema:contentUrl' && result.status === 200));
  assert(report.results.some(result => result.kind === 'json-schema:$schema' && result.ref === './opportunity-map.schema.json' && result.status === 200));
  assert(report.results.some(result => result.kind === 'json-schema:$id' && result.status === 200));
  assert(report.results.some(result => result.kind === 'json-schema:$ref' && result.ref === '#/$defs/record' && result.status === 200));
  assert(report.results.some(result => result.kind === 'sitemap:loc' && result.status === 200));
  assert(report.results.every(result => result.actualMime));
});

test('reports the source, reference, and HTTP status for a missing asset', async t => {
  const fixture = await makeFixture({
    'index.html': [
      '<!doctype html>',
      '<script>',
      'const markup = "<img src=\\"./not-a-real-tag.png\\">";',
      '</script>',
      '<style>body { color: black; }</style>',
      '<img src="./missing.png" alt="">'
    ].join('\n')
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert.equal(report.ok, false);
  const failure = report.failures.find(item => item.ref === './missing.png');
  assert(failure);
  assert.equal(failure.source, 'index.html:6');
  assert(!report.failures.some(item => item.ref === './not-a-real-tag.png'));
  assert.equal(failure.status, 404);
  assert.equal(failure.code, 'HTTP_STATUS');
});

test('rejects project references that escape the GitHub Pages subpath', async t => {
  const fixture = await makeFixture({
    'index.html': '<!doctype html><a href="/atlas.json">Wrong root-relative URL</a>'
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  const failure = report.failures.find(item => item.ref === '/atlas.json');
  assert(failure);
  assert.equal(failure.code, 'OUTSIDE_PROJECT_BASE');
  assert.equal(failure.status, null);
});

test('rejects literal and encoded traversal references before fetching', async t => {
  const fixture = await makeFixture({
    'index.html': '<!doctype html><a href="../secret.txt">Literal</a><img src="%2e%2e/secret.png" alt="Encoded">'
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  const traversal = report.failures.filter(item => item.code === 'TRAVERSAL_REFERENCE');
  assert.equal(traversal.length, 2);
  assert.deepEqual(traversal.map(item => item.ref).sort(), ['%2e%2e/secret.png', '../secret.txt']);
});

test('requires every exported humanUrl to remain on the project deployment', async t => {
  const fixture = await makeFixture({
    'atlas.json': JSON.stringify({ nodes: [{ humanUrl: 'https://example.test/atlas' }] })
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  const failure = report.failures.find(item => item.kind === 'humanUrl');
  assert(failure);
  assert.equal(failure.code, 'EXTERNAL_PROJECT_REFERENCE');
  assert.match(failure.source, /^atlas\.json#\/nodes\/0\/humanUrl$/);
});

test('reports expected and actual MIME when a declared link type is wrong', async t => {
  const fixture = await makeFixture({
    'index.html': '<!doctype html><link rel="alternate" type="text/plain" href="./atlas.json">'
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  const failure = report.failures.find(item => item.ref === './atlas.json');
  assert(failure);
  assert.equal(failure.code, 'CONTENT_TYPE_MISMATCH');
  assert.equal(failure.actualMime, 'application/json');
  assert.match(failure.expectedMime, /extension: application\/json/);
  assert.match(failure.expectedMime, /declared: text\/plain/);
  assert.match(failure.detail, /received application\/json/);
});

test('rejects missing schema documents and unresolved local pointers or anchors', async t => {
  const fixture = await makeFixture({
    'src/data/opportunities/opportunity-map.schema.json': JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://neb6dav.github.io/ai_tech_tree/src/data/opportunities/opportunity-map.schema.json',
      $defs: { present: { type: 'string' } },
      allOf: [
        { $ref: '#/$defs/missing' },
        { $dynamicRef: '#missing-anchor' },
        { $ref: './target.schema.json#/$defs/present' },
        { $dynamicRef: './target.schema.json#present-anchor' },
        { $ref: './target.schema.json#/$defs/missing' },
        { $dynamicRef: './target.schema.json#missing-anchor' },
        { $ref: './target.schema.json#%ZZ' },
        { $ref: './missing.schema.json#/$defs/record' }
      ]
    }),
    'src/data/opportunities/target.schema.json': JSON.stringify({
      $defs: {
        present: { $anchor: 'present-anchor', type: 'string' }
      }
    })
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert.equal(report.ok, false);
  const fragmentFailures = report.failures.filter(item => item.code === 'BROKEN_JSON_SCHEMA_FRAGMENT');
  assert.deepEqual(fragmentFailures.map(item => item.ref).sort(), [
    '#/$defs/missing',
    '#missing-anchor',
    './target.schema.json#%ZZ',
    './target.schema.json#/$defs/missing',
    './target.schema.json#missing-anchor'
  ]);
  assert(report.results.some(item => item.ref === './target.schema.json#/$defs/present' && item.ok));
  assert(report.results.some(item => item.ref === './target.schema.json#present-anchor' && item.ok));
  const missingDocument = report.failures.find(item => item.ref === './missing.schema.json#/$defs/record');
  assert(missingDocument);
  assert.equal(missingDocument.kind, 'json-schema:$ref');
  assert.equal(missingDocument.status, 404);
});

test('the staged server rejects encoded path traversal', async t => {
  const fixture = await makeFixture();
  t.after(() => removeFixture(fixture));
  const server = await startSiteServer({ siteDir: fixture.siteDir, basePath: BASE_PATH });
  t.after(() => server.close());

  const status = await new Promise((resolve, reject) => {
    const url = new URL(server.origin);
    const request = http.request({
      hostname: url.hostname,
      port: url.port,
      method: 'HEAD',
      path: '/ai_tech_tree/%252e%252e/secret.txt'
    }, response => {
      response.resume();
      resolve(response.statusCode);
    });
    request.once('error', reject);
    request.end();
  });
  assert.equal(status, 400);
});

test('rejects release-manifest payload drift and missing self-reference policy', async t => {
  const fixture = await makeFixture({
    'release-manifest.json': JSON.stringify({
      manifest: { path: 'wrong.json', selfHashExcluded: false },
      fileCount: 1,
      totalBytes: 1,
      files: [{ path: 'index.html', mediaType: 'application/json', bytes: 1, sha256: '0'.repeat(64) }]
    })
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert.equal(report.ok, false);
  assert(report.failures.some(item => item.code === 'RELEASE_MANIFEST_COVERAGE'));
  assert(report.failures.some(item => item.code === 'RELEASE_MANIFEST_MISMATCH'));
  assert(report.failures.some(item => item.code === 'RELEASE_MANIFEST_TOTALS'));
  assert(report.failures.some(item => item.code === 'RELEASE_MANIFEST_SELF_POLICY'));
});

test('validates static HTML fragments and supported application-state record IDs', async t => {
  const fixture = await makeFixture({
    'index.html': `<!doctype html><main id="entry"><a name="legacy"></a>
      <a href="#entry">same</a>
      <a href="#legacy">legacy</a>
      <a href="#hello%20world">encoded</a>
      <a href="./page.html#target">cross</a>
      <a href="#missing">missing same</a>
      <a href="./page.html#missing">missing cross</a>
      <a href="./ai-research-tech-tree.html#node=one">valid record</a>
      <a href="./ai-research-tech-tree.html#node=absent">missing record</a>
      <span id="hello world"></span>
    </main>`,
    'page.html': '<!doctype html><a name="target"></a>'
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert.equal(report.ok, false);
  assert(report.results.some(item => item.ref === '#entry' && item.fragmentStatus === 'verified'));
  assert(report.results.some(item => item.ref === '#legacy' && item.fragmentStatus === 'verified'));
  assert(report.results.some(item => item.ref === '#hello%20world' && item.fragmentStatus === 'verified'));
  assert(report.results.some(item => item.ref === './page.html#target' && item.fragmentStatus === 'verified'));
  assert.deepEqual(
    report.failures.filter(item => item.code === 'BROKEN_HTML_FRAGMENT').map(item => item.ref).sort(),
    ['#missing', './page.html#missing']
  );
  const missingRecord = report.failures.find(item => item.ref.endsWith('#node=absent'));
  assert(missingRecord);
  assert.equal(missingRecord.code, 'BROKEN_APPLICATION_STATE');
  assert(report.results.some(item => item.ref.endsWith('#node=one') && item.fragmentStatus === 'application-state-verified'));
});

test('requires each exported humanUrl to target its own record ID', async t => {
  const fixture = await makeFixture({
    'atlas.json': JSON.stringify({
      dataset: { humanUrl: './ai-research-tech-tree.html' },
      nodes: [
        { id: 'one', humanUrl: './ai-research-tech-tree.html#node=two' },
        { id: 'two', humanUrl: './ai-research-tech-tree.html#node=two' }
      ]
    })
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  const failure = report.failures.find(item => item.source === 'atlas.json#/nodes/0/humanUrl');
  assert(failure);
  assert.equal(failure.code, 'BROKEN_APPLICATION_STATE');
  assert.equal(failure.fragmentStatus, 'application-state-misdirected');
});

test('preserves humanUrl ownership checks for NDJSON records', async t => {
  const fixture = await makeFixture({
    'atlas.json': JSON.stringify({
      dataset: { humanUrl: './ai-research-tech-tree.html' },
      nodes: [
        { id: 'one', humanUrl: './ai-research-tech-tree.html#node=one' },
        { id: 'two', humanUrl: './ai-research-tech-tree.html#node=two' }
      ]
    }),
    'stream.ndjson': `${JSON.stringify({
      id: 'one',
      humanUrl: './ai-research-tech-tree.html#node=two'
    })}\n`
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  const failure = report.failures.find(item => item.source === 'stream.ndjson:1#/humanUrl');
  assert(failure);
  assert.equal(failure.code, 'BROKEN_APPLICATION_STATE');
});

test('fails closed when multiple staged JSON documents claim to be the atlas ID source', async t => {
  const fixture = await makeFixture({
    'shadow-atlas.json': JSON.stringify({
      dataset: { title: 'Shadow' },
      nodes: [{ id: 'shadow', humanUrl: './ai-research-tech-tree.html#node=shadow' }]
    })
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert(report.failures.some(item => item.code === 'APPLICATION_STATE_INDEX_AMBIGUOUS'));
});

test('treats the approved byte-equivalent Opportunity paths as one logical source', async t => {
  const opportunity = {
    metadata: { id: 'map-one', anchorAtlasNodeId: 'one' },
    nodes: [{ id: 'opportunity-one' }]
  };
  const fixture = await makeFixture({
    'index.html': `<!doctype html>
      <a href="./ai-research-tech-tree.html#node=one">atlas</a>
      <a href="./ai-research-tech-tree.html#opportunity=map-one&opp=opportunity-one">opportunity</a>`,
    'data/opportunities/diffusion-models.alpha.json': JSON.stringify(opportunity),
    'src/data/opportunities/diffusion-models.alpha.json': JSON.stringify(opportunity)
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert.equal(
    report.ok,
    true,
    report.failures.map(item => `${item.source} ${item.code}: ${item.detail}`).join('\n')
  );
  assert(report.results.some(item => (
    item.ref.endsWith('#opportunity=map-one&opp=opportunity-one') &&
    item.fragmentStatus === 'application-state-verified'
  )));
});

test('does not collapse arbitrary byte-equivalent atlas documents', async t => {
  const atlas = {
    dataset: { humanUrl: './ai-research-tech-tree.html' },
    nodes: [{ id: 'one', humanUrl: './ai-research-tech-tree.html#node=one' }]
  };
  const fixture = await makeFixture({
    'atlas.json': JSON.stringify(atlas),
    'atlas-copy.json': JSON.stringify(atlas)
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert(report.failures.some(item => item.code === 'APPLICATION_STATE_INDEX_AMBIGUOUS'));
});

test('fails closed when approved Opportunity compatibility paths diverge', async t => {
  const canonical = {
    metadata: { id: 'map-one', anchorAtlasNodeId: 'one' },
    nodes: [{ id: 'opportunity-one' }]
  };
  const compatibility = {
    ...canonical,
    metadata: { ...canonical.metadata, summary: 'divergent compatibility payload' }
  };
  const fixture = await makeFixture({
    'index.html': '<!doctype html><p>No application-state reference is required to detect divergence.</p>',
    'data/opportunities/diffusion-models.alpha.json': JSON.stringify(canonical),
    'src/data/opportunities/diffusion-models.alpha.json': JSON.stringify(compatibility)
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert(report.failures.some(item => item.code === 'APPLICATION_STATE_COMPATIBILITY_MISMATCH'));
});

test('scans quoted greater-than attributes and resource-bearing HTML surfaces', async t => {
  const fixture = await makeFixture({
    'index.html': `<!doctype html>
      <a title="greater > sign" href="./missing-link.json">quoted link</a>
      <img title='greater > sign' src="./social.png" alt="">
      <video poster="./missing-poster.png"></video>
      <object data="./missing-object.json" type="application/json"></object>
      <link rel="preload" imagesrcset="./missing-responsive.png 1x">
      <form action="./missing-submit"><button formaction="./missing-button">Send</button></form>
      <meta http-equiv="refresh" content="0; url='./missing>refresh.html'">`
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  const refs = new Set(report.failures.map(item => item.ref));
  for (const expected of [
    './missing-link.json',
    './missing-poster.png',
    './missing-object.json',
    './missing-responsive.png',
    './missing-submit',
    './missing-button',
    './missing>refresh.html'
  ]) {
    assert(refs.has(expected), expected);
  }
  assert(!refs.has('./social.png'));
});

test('rejects external publication metadata, redirects, bases, resources, and URL credentials', async t => {
  const fixture = await makeFixture({
    'index.html': `<!doctype html>
      <base href="https://evil.example/assets/">
      <link rel="stylesheet" href="https://evil.example/site.css">
      <link rel="canonical" href="https://user:secret@neb6dav.github.io/ai_tech_tree/">
      <link rel="alternate" href="https://evil.example/atlas.json" type="application/json">
      <meta property="og:image" content="https://evil.example/social.png">
      <meta http-equiv="refresh" content="0; url=https://evil.example/redirect">
      <a href="https://evil.example/export.json" download>Download</a>
      <video poster="https://evil.example/poster.png"></video>
      <object data="https://evil.example/object.json"></object>
      <svg><image href="https://evil.example/image.png"></image></svg>`
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert(report.failures.some(item => item.code === 'UNSUPPORTED_HTML_BASE'));
  assert(report.failures.some(item => item.kind === 'canonical' && item.code === 'URL_CREDENTIALS'));
  for (const kind of [
    'link:stylesheet',
    'alternate',
    'meta:og:image',
    'meta:refresh',
    'download',
    'poster',
    'data',
    'svg:image:href'
  ]) {
    assert(
      report.failures.some(item => item.kind === kind && item.code === 'EXTERNAL_PROJECT_REFERENCE'),
      kind
    );
  }
});

test('rejects every credentialed same-origin URL spelling', async t => {
  const fixture = await makeFixture({
    'index.html': `<!doctype html>
      <link rel="canonical" href="https://user@neb6dav.github.io/ai_tech_tree/">
      <link rel="canonical" href="https://user:password@neb6dav.github.io/ai_tech_tree/">
      <link rel="canonical" href="//user@neb6dav.github.io/ai_tech_tree/">
      <link rel="canonical" href="https://u%73er@neb6dav.github.io/ai_tech_tree/">`
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  const credentialFailures = report.failures.filter(item => item.code === 'URL_CREDENTIALS');
  assert.equal(credentialFailures.length, 4);
  assert(credentialFailures.every(item => item.kind === 'canonical'));
});

test('enforces origin protocol, port, project subpath, sitemap, and robots boundaries', async t => {
  const fixture = await makeFixture({
    'index.html': `<!doctype html>
      <link rel="canonical" href="http://neb6dav.github.io/ai_tech_tree/">
      <link rel="alternate" href="https://neb6dav.github.io:444/ai_tech_tree/atlas.json">
      <a href="https://neb6dav.github.io/outside.json" download>Outside</a>`,
    'robots.txt': 'User-agent: *\nSitemap: https://evil.example/sitemap.xml\n',
    'sitemap.xml': '<?xml version="1.0"?><urlset><url><loc>https://evil.example/</loc></url></urlset>'
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert(report.failures.some(item => item.kind === 'canonical' && item.code === 'PROJECT_ORIGIN_MISMATCH'));
  assert(report.failures.some(item => item.kind === 'alternate' && item.code === 'EXTERNAL_PROJECT_REFERENCE'));
  assert(report.failures.some(item => item.kind === 'download' && item.code === 'OUTSIDE_PROJECT_BASE'));
  assert(report.failures.some(item => item.kind === 'robots:sitemap' && item.code === 'EXTERNAL_PROJECT_REFERENCE'));
  assert(report.failures.some(item => item.kind === 'sitemap:loc' && item.code === 'EXTERNAL_PROJECT_REFERENCE'));
});

test('rejects malformed meta refresh instead of silently ignoring it', async t => {
  const fixture = await makeFixture({
    'index.html': '<!doctype html><meta http-equiv="refresh" content="redirect eventually">'
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  const failure = report.failures.find(item => item.code === 'INVALID_META_REFRESH');
  assert(failure);
  assert.equal(failure.ref, 'redirect eventually');
});

test('parses srcset candidates without splitting data URLs or literal URL commas', async t => {
  const fixture = await makeFixture({
    'index.html': `<!doctype html><img alt="" srcset="data:image/svg+xml,%3Csvg%3E 1x, ./a,b.png 2x, ./second.png 3x">`,
    'a,b.png': 'comma asset',
    'second.png': 'second asset'
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert.equal(report.ok, true, report.failures.map(item => `${item.ref}: ${item.detail}`).join('\n'));
  assert(report.results.some(item => item.kind === 'srcset' && item.ref === './a,b.png' && item.status === 200));
  assert(report.results.some(item => item.kind === 'srcset' && item.ref === './second.png' && item.status === 200));
  assert(!report.results.some(item => item.ref === '%3Csvg%3E'));
  assert(report.ignoredReferences >= 1);
});

test('scans live inline and standalone CSS while ignoring comments and quoted content', async t => {
  const fixture = await makeFixture({
    'index.html': `<!doctype html><link rel="stylesheet" href="./styles/site.css">
      <div style="background: url('./inline.png'); --example: 'url(./not-live-inline.png)'"></div>`,
    'styles/site.css': `
      /* url('./not-live-comment.png') */
      .example::before { content: "url('./not-live-string.png')"; }
      @import "./theme.css";
      main { background-image: url('./background.png'); }
    `,
    'styles/theme.css': 'body { mask-image: url("./mask.png"); }',
    'inline.png': 'inline',
    'styles/background.png': 'background',
    'styles/mask.png': 'mask'
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert.equal(report.ok, true, report.failures.map(item => `${item.ref}: ${item.detail}`).join('\n'));
  for (const expected of ['./inline.png', './theme.css', './background.png', './mask.png']) {
    assert(report.results.some(item => item.ref === expected && item.status === 200), expected);
  }
  assert(!report.results.some(item => /not-live/u.test(item.ref)));
  assert.equal(report.counts.css, 2);
});

test('validates fragment-only URLs in inline CSS against document IDs', async t => {
  const fixture = await makeFixture({
    'index.html': `<!doctype html><svg>
      <linearGradient id="present-paint"></linearGradient>
      <rect style="fill: url(#present-paint)"></rect>
      <rect style="fill: url(#missing-paint)"></rect>
    </svg>`
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert(report.results.some(item => item.ref === '#present-paint' && item.fragmentStatus === 'verified'));
  const failure = report.failures.find(item => item.ref === '#missing-paint');
  assert(failure);
  assert.equal(failure.code, 'BROKEN_HTML_FRAGMENT');
});

test('labels explicit runtime fragment declarations as browser-deferred', async t => {
  const fixture = await makeFixture({
    'index.html': `<!doctype html><style>path { marker-end: url(#dynamicArrow); }</style>
      <script data-runtime-fragment-ids="dynamicArrow">
        document.body.dataset.example = "dynamicArrow";
      </script>`
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert.equal(report.ok, true, report.failures.map(item => item.detail).join('\n'));
  const result = report.results.find(item => item.ref === '#dynamicArrow');
  assert(result);
  assert.equal(result.fragmentStatus, 'runtime-declared-pending-browser');
});

test('rejects malformed or stale runtime fragment declarations', async t => {
  const fixture = await makeFixture({
    'index.html': `<!doctype html>
      <script data-runtime-fragment-ids="bad/id absentArrow">const value = "unrelated";</script>`
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert(report.failures.some(item => item.code === 'INVALID_RUNTIME_FRAGMENT_DECLARATION'));
  assert(report.failures.some(item => item.code === 'UNREFERENCED_RUNTIME_FRAGMENT_DECLARATION'));
});

test('extracts quoted and url candidates from CSS image-set functions', async t => {
  const fixture = await makeFixture({
    'index.html': `<!doctype html><style>
      main { background-image: image-set("./present.png" 1x, url('./missing.png') 2x); }
    </style><main></main>`,
    'present.png': 'present'
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert(report.results.some(item => item.kind === 'css:image-set' && item.ref === './present.png' && item.ok));
  const missing = report.failures.find(item => item.kind === 'css:image-set' && item.ref === './missing.png');
  assert(missing);
  assert.equal(missing.status, 404);
});

test('enforces browser MIME contexts for extensionless scripts and stylesheets', async t => {
  const fixture = await makeFixture({
    'index.html': `<!doctype html>
      <script type="module" src="./app"></script>
      <script src="./classic"></script>
      <link rel="stylesheet" href="./style">`,
    app: 'export default 1;',
    classic: 'window.example = true;',
    style: 'body { color: black; }'
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  for (const ref of ['./app', './classic', './style']) {
    const failure = report.failures.find(item => item.ref === ref);
    assert(failure, ref);
    assert.equal(failure.code, 'CONTENT_TYPE_MISMATCH');
    assert.match(failure.expectedMime, /context:/u);
    assert.equal(failure.actualMime, 'application/octet-stream');
  }
});

test('allows data URLs only for passive leaf assets, not active documents or imports', async t => {
  const fixture = await makeFixture({
    'index.html': `<!doctype html>
      <img alt="" src="data:image/png;base64,AAAA">
      <script src="data:text/javascript,alert(1)"></script>
      <iframe src="data:text/html,frame"></iframe>
      <object data="data:text/html,object"></object>
      <style>@import "data:text/css,body{}";</style>`
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert(report.ignoredReferences >= 1);
  for (const kind of ['src', 'data', 'css:import']) {
    assert(
      report.failures.some(item => item.kind === kind && item.code === 'NON_HTTP_PROJECT_REFERENCE'),
      kind
    );
  }
});

test('decodes syntax-bearing named HTML entities before enforcing URL origin policy', async t => {
  const fixture = await makeFixture({
    'index.html': `<!doctype html>
      <script src="https&colon;&sol;&sol;evil.example/x.js"></script>
      <link rel="stylesheet" href="https&colon;&sol;&sol;evil.example/site.css">`,
    'https&colon;&sol;&sol;evil.example/x.js': 'window.decoy = true;',
    'https&colon;&sol;&sol;evil.example/site.css': 'body { color: red; }'
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  for (const ref of ['https://evil.example/x.js', 'https://evil.example/site.css']) {
    const failure = report.failures.find(item => item.ref === ref);
    assert(failure, ref);
    assert.equal(failure.code, 'EXTERNAL_PROJECT_REFERENCE');
  }
});

test('fails closed on iframe srcdoc nested browsing contexts', async t => {
  const fixture = await makeFixture({
    'index.html': `<!doctype html><iframe
      srcdoc="&lt;script src=&quot;https://evil.example/x.js&quot;&gt;&lt;/script&gt;">
    </iframe>`
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  const failure = report.failures.find(item => item.code === 'UNSUPPORTED_HTML_SRCDOC');
  assert(failure);
  assert.equal(failure.kind, 'srcdoc');
});

test('treats modern SVG href loaders as publication resources', async t => {
  const fixture = await makeFixture({
    'index.html': `<!doctype html><svg>
      <filter><feImage href="https://evil.example/p.svg"></feImage></filter>
      <script href="https://evil.example/x.js"></script>
    </svg>`
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  for (const kind of ['svg:feimage:href', 'svg:script:href']) {
    const failure = report.failures.find(item => item.kind === kind);
    assert(failure, kind);
    assert.equal(failure.code, 'EXTERNAL_PROJECT_REFERENCE');
  }
});

test('rejects non-string nested JSON Schema identifiers', async t => {
  const fixture = await makeFixture({
    'src/data/opportunities/opportunity-map.schema.json': JSON.stringify({
      $id: 'https://neb6dav.github.io/ai_tech_tree/src/data/opportunities/opportunity-map.schema.json',
      $defs: { bad: { $id: 123, type: 'string' } }
    })
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  const invalid = report.failures.find(item => (
    item.source === 'src/data/opportunities/opportunity-map.schema.json#/$defs/bad/$id' &&
    item.code === 'INVALID_JSON_SCHEMA_REFERENCE'
  ));
  assert(invalid);
  assert(!report.failures.some(item => (
    item.source === invalid.source && item.code === 'UNSUPPORTED_NESTED_JSON_SCHEMA_ID'
  )));
});

test('does not confuse instance property names with JSON Schema keywords', async t => {
  const fixture = await makeFixture({
    'src/data/opportunities/opportunity-map.schema.json': JSON.stringify({
      $id: 'https://neb6dav.github.io/ai_tech_tree/src/data/opportunities/opportunity-map.schema.json',
      type: 'object',
      properties: {
        $schema: { type: 'string', minLength: 1 },
        $id: { type: 'string' },
        properties: {
          type: 'object',
          properties: { value: { type: 'string' } }
        }
      }
    })
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert.equal(
    report.ok,
    true,
    report.failures.map(item => `${item.source} ${item.code}: ${item.detail}`).join('\n')
  );
});

test('rejects duplicate atlas and Opportunity application-state IDs', async t => {
  const fixture = await makeFixture({
    'atlas.json': JSON.stringify({
      dataset: { humanUrl: './ai-research-tech-tree.html' },
      nodes: [
        { id: 'one', humanUrl: './ai-research-tech-tree.html#node=one' },
        { id: 'one', humanUrl: './ai-research-tech-tree.html#node=one' }
      ]
    }),
    'src/data/opportunities/opportunity.alpha.json': JSON.stringify({
      metadata: { id: 'map-one', anchorAtlasNodeId: 'one' },
      nodes: [{ id: 'duplicate' }, { id: 'duplicate' }]
    }),
    'src/data/opportunities/shadow-opportunity.json': JSON.stringify({
      metadata: { id: 'map-one', anchorAtlasNodeId: 'one' },
      nodes: [{ id: 'shadow' }]
    })
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  const duplicates = report.failures.filter(item => item.code === 'DUPLICATE_APPLICATION_STATE_ID');
  assert(duplicates.some(item => item.kind === 'atlas node ID' && item.ref === 'one'));
  assert(duplicates.some(item => item.kind === 'Opportunity node ID' && item.ref === 'duplicate'));
  assert(duplicates.some(item => item.kind === 'Opportunity map ID' && item.ref === 'map-one'));
});

test('does not treat IDs inside template contents as live fragment targets', async t => {
  const fixture = await makeFixture({
    'index.html': `<!doctype html>
      <style>.example { marker-end: url(#template-runtime); }</style>
      <template id="template-element">
        <span id="not-in-document"></span>
        <template><span id="nested-template-target"></span></template>
        <script data-runtime-fragment-ids="template-runtime">const id = "template-runtime";</script>
      </template>
      <span id="live-target"></span>
      <a href="#template-element">template element</a>
      <a href="#live-target">live target</a>
      <a href="#not-in-document">inert target</a>
      <a href="#nested-template-target">nested inert target</a>`
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert(report.results.some(item => item.ref === '#template-element' && item.fragmentStatus === 'verified'));
  assert(report.results.some(item => item.ref === '#live-target' && item.fragmentStatus === 'verified'));
  const failure = report.failures.find(item => item.ref === '#not-in-document');
  assert(failure);
  assert.equal(failure.code, 'BROKEN_HTML_FRAGMENT');
  assert(report.failures.some(item => (
    item.ref === '#nested-template-target' && item.code === 'BROKEN_HTML_FRAGMENT'
  )));
  assert(report.failures.some(item => (
    item.ref === '#template-runtime' && item.code === 'BROKEN_HTML_FRAGMENT'
  )));
});

test('rejects nested JSON Schema identities and root IDs that do not identify their staged file', async t => {
  const fixture = await makeFixture({
    'src/data/opportunities/opportunity-map.schema.json': JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://neb6dav.github.io/ai_tech_tree/src/data/opportunities/target.schema.json',
      $defs: {
        scoped: {
          $id: 'nested/',
          $anchor: 'inside',
          type: 'string'
        }
      }
    }),
    'src/data/opportunities/target.schema.json': JSON.stringify({ type: 'object' })
  });
  t.after(() => removeFixture(fixture));

  const report = await audit(fixture);
  assert(report.failures.some(item => item.code === 'JSON_SCHEMA_IDENTITY_MISMATCH'));
  assert(report.failures.some(item => item.code === 'UNSUPPORTED_NESTED_JSON_SCHEMA_ID'));
});
