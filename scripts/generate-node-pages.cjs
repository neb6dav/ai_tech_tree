#!/usr/bin/env node
'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_INPUT_PATH = path.resolve(__dirname, '..', 'ai-research-tech-tree.json');
const DEFAULT_OUTPUT_DIRECTORY = path.resolve(__dirname, '..', '_site');
const NODE_PAGE_MEDIA_TYPE = 'text/html; charset=utf-8';

function nodePageError(message) {
  return new Error(`generate-node-pages: ${message}`);
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw nodePageError(`${label} must be an object`);
  }
  return value;
}

function nonEmptyText(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/gu, ' ').trim();
  return normalized || null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function humanize(value) {
  const text = nonEmptyText(value);
  if (!text) return 'Not assessed';
  const result = text.replace(/[_-]+/gu, ' ');
  return result.charAt(0).toUpperCase() + result.slice(1);
}

function assertSafeNodeId(value, label = 'node.id') {
  const id = nonEmptyText(value);
  if (!id || id !== value) {
    throw nodePageError(`${label} must be a non-empty, trimmed string`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._~-]*$/u.test(id)) {
    throw nodePageError(`${label} is not a traversal-safe portable path segment: ${id}`);
  }
  if (id.endsWith('.') || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(id)) {
    throw nodePageError(`${label} is not portable on Windows: ${id}`);
  }
  return id;
}

function absoluteHttpUrl(value) {
  const text = nonEmptyText(value);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value) {
  const parsed = absoluteHttpUrl(value);
  if (!parsed) throw nodePageError('canonicalBaseUrl must be an absolute HTTP(S) URL');
  if (parsed.search || parsed.hash) {
    throw nodePageError('canonicalBaseUrl cannot contain a query string or fragment');
  }
  if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
  if (parsed.pathname.startsWith('//')) {
    throw nodePageError('canonicalBaseUrl pathname cannot begin with //');
  }
  return parsed;
}

function normalizeSocialImageUrl(value, baseUrl) {
  let parsed;
  try {
    parsed = new URL(value, baseUrl);
  } catch {
    throw nodePageError('socialImageUrl must resolve to an absolute HTTP(S) URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw nodePageError('socialImageUrl must resolve to an absolute HTTP(S) URL');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw nodePageError('socialImageUrl cannot contain credentials, a query string, or a fragment');
  }
  return parsed;
}

function safeSourceUrl(value) {
  const parsed = absoluteHttpUrl(value);
  return parsed ? parsed.href : null;
}

function citationContributors(record) {
  const authors = Array.isArray(record?.authors)
    ? record.authors.map(nonEmptyText).filter(Boolean)
    : [];
  const organization = nonEmptyText(record?.issuingOrganization);
  return { authors, organization };
}

function normalizeDoi(value) {
  const doi = nonEmptyText(value);
  if (!doi) return null;
  const normalized = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '').replace(/^doi:\s*/iu, '');
  if (!/^10\.\d{4,9}\/[!-~]+$/u.test(normalized) || /[<>"{}\\]/u.test(normalized)) return null;
  return normalized;
}

function doiFromRecord(record) {
  const explicit = normalizeDoi(record?.doi);
  if (explicit) return explicit;
  const url = absoluteHttpUrl(record?.url);
  if (!url || !/^(?:dx\.)?doi\.org$/iu.test(url.hostname)) return null;
  try {
    return normalizeDoi(decodeURIComponent(url.pathname.replace(/^\//u, '')));
  } catch {
    return null;
  }
}

function isBibTeXEligible(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  const title = nonEmptyText(record.title);
  const year = Number(record.year);
  const contributors = citationContributors(record);
  const hasLocation = Boolean(safeSourceUrl(record.url) || doiFromRecord(record));
  return Boolean(
    title &&
    Number.isInteger(year) &&
    year >= 1 &&
    (contributors.authors.length > 0 || contributors.organization) &&
    hasLocation
  );
}

function escapeBibTeX(value) {
  const substitutions = {
    '\\': '\\textbackslash{}',
    '{': '\\{',
    '}': '\\}',
    '%': '\\%',
    '#': '\\#',
    '$': '\\$',
    '&': '\\&',
    '_': '\\_',
    '^': '\\^{}',
    '~': '\\~{}'
  };
  return String(value ?? '')
    .replace(/\s+/gu, ' ')
    .trim()
    .split('')
    .map(character => substitutions[character] || character)
    .join('');
}

function citationKey(record) {
  const raw = nonEmptyText(record.id) || `${record.title}-${record.year}`;
  const key = raw.normalize('NFKD').replace(/[^A-Za-z0-9]+/gu, '_').replace(/^_+|_+$/gu, '');
  return key || `work_${Number(record.year)}`;
}

function renderBibTeX(record) {
  if (!isBibTeXEligible(record)) {
    throw nodePageError('BibTeX requires existing title, year, contributor, and stable URL or DOI metadata');
  }
  const contributors = citationContributors(record);
  const fields = [
    `  title = {${escapeBibTeX(record.title)}}`,
    `  year = {${Number(record.year)}}`
  ];
  if (contributors.authors.length > 0) {
    const authors = contributors.authors.map(author => `{${escapeBibTeX(author)}}`).join(' and ');
    fields.splice(1, 0, `  author = {${authors}}`);
  }
  if (contributors.organization) {
    fields.splice(contributors.authors.length > 0 ? 2 : 1, 0, `  organization = {${escapeBibTeX(contributors.organization)}}`);
  }
  const doi = doiFromRecord(record);
  if (doi) fields.push(`  doi = {${escapeBibTeX(doi)}}`);
  const url = safeSourceUrl(record.url);
  if (url) fields.push(`  url = {${escapeBibTeX(url)}}`);
  return `@misc{${citationKey(record)},\n${fields.join(',\n')}\n}`;
}

function formatDate(node) {
  const chronology = node?.chronology || {};
  const label = nonEmptyText(chronology.dateLabel);
  if (label) return label;
  const year = Number(chronology.year);
  return Number.isFinite(year) ? String(year) : 'Undated';
}

function formatStatus(node) {
  const status = node?.status || {};
  const values = [status.kind || node?.type, status.significance, status.activity, status.trajectory]
    .map(nonEmptyText)
    .filter(value => value && value !== 'not_assessed');
  const unique = [...new Set(values.map(humanize))];
  return unique.length > 0 ? unique.join(' · ') : 'Not assessed';
}

function renderExternalTitle(record, fallback) {
  return escapeHtml(nonEmptyText(record?.title) || nonEmptyText(fallback) || 'Untitled source');
}

function renderSourceLink(url, label) {
  const href = safeSourceUrl(url);
  if (!href) return label;
  return `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${label}</a>`;
}

function renderLandmarkWork(item) {
  const { work, link } = item;
  const title = renderSourceLink(work.url, renderExternalTitle(work));
  const contributors = citationContributors(work);
  const details = [
    Number.isInteger(Number(work.year)) ? String(Number(work.year)) : null,
    contributors.authors.length > 0 ? contributors.authors.join('; ') : contributors.organization,
    humanize(link.role),
    humanize(work.access)
  ].filter(Boolean).map(escapeHtml).join(' · ');
  const note = nonEmptyText(work.note);
  return `<li><strong>${title}</strong>${details ? `<span class="source-meta">${details}</span>` : ''}${note ? `<p>${escapeHtml(note)}</p>` : ''}</li>`;
}

function renderPaper(item) {
  const { paper, link } = item;
  const title = renderSourceLink(paper.url, renderExternalTitle(paper, link.sourceTitle));
  const details = [
    Number.isInteger(Number(paper.year)) ? String(Number(paper.year)) : null,
    humanize(link.role)
  ].filter(Boolean).map(escapeHtml).join(' · ');
  return `<li><strong>${title}</strong>${details ? `<span class="source-meta">${details}</span>` : ''}</li>`;
}

function renderWikipediaSource(source) {
  const href = safeSourceUrl(source.revisionUrl) || safeSourceUrl(source.canonicalUrl);
  const title = renderSourceLink(href, renderExternalTitle(source, 'Wikipedia evidence source'));
  const checked = Array.isArray(source.checkedAt) ? source.checkedAt.map(nonEmptyText).filter(Boolean).join(', ') : '';
  return `<li><strong>${title}</strong>${checked ? `<span class="source-meta">Reviewed ${escapeHtml(checked)}</span>` : ''}</li>`;
}

function renderEvidenceAssessment(assessment) {
  const label = [humanize(assessment.aspect), humanize(assessment.state)].join(': ');
  const details = [assessment.confidence ? `${humanize(assessment.confidence)} confidence` : null]
    .filter(Boolean).map(escapeHtml).join(' · ');
  const note = nonEmptyText(assessment.note);
  return `<li><strong>${escapeHtml(label)}</strong>${details ? `<span class="source-meta">${details}</span>` : ''}${note ? `<p>${escapeHtml(note)}</p>` : ''}</li>`;
}

function buildIndexes(atlas) {
  const makeMap = (records, label) => {
    if (!Array.isArray(records)) throw nodePageError(`${label} must be an array`);
    const result = new Map();
    for (const record of records || []) {
      if (!record || typeof record !== 'object') throw nodePageError(`${label} contains a non-object record`);
      const id = nonEmptyText(record.id);
      if (!id) throw nodePageError(`${label} contains a record without an ID`);
      if (result.has(id)) throw nodePageError(`${label} contains duplicate ID ${id}`);
      result.set(id, record);
    }
    return result;
  };
  return {
    laneById: makeMap(atlas.lanes, 'lanes'),
    paperById: makeMap(atlas.papers, 'papers'),
    workById: makeMap(atlas.landmarkWorks, 'landmarkWorks'),
    wikipediaById: makeMap(atlas.wikipediaSources, 'wikipediaSources')
  };
}

function contextForNode(atlas, indexes, node) {
  const paperLinks = atlas.paperLinks.filter(link => link?.nodeId === node.id);
  const workLinks = atlas.landmarkWorkLinks.filter(link => link?.nodeId === node.id);
  const assessments = atlas.evidenceAssessments.filter(
    assessment => assessment?.subjectType === 'atlasEntry' && assessment?.subjectId === node.id
  );
  const papers = paperLinks.map(link => {
    const paper = indexes.paperById.get(link.paperId);
    if (!paper) throw nodePageError(`paper link ${link.id || '(unknown)'} references missing paper ${link.paperId}`);
    return { link, paper };
  });
  const works = workLinks.map(link => {
    const work = indexes.workById.get(link.workId);
    if (!work) throw nodePageError(`landmark link ${link.id || '(unknown)'} references missing work ${link.workId}`);
    return { link, work };
  });
  const sourceIds = [...new Set(assessments.flatMap(assessment => Array.isArray(assessment.sourceIds) ? assessment.sourceIds : []))];
  const wikipediaSources = sourceIds.map(id => indexes.wikipediaById.get(id)).filter(Boolean);
  return {
    atlas,
    node,
    lane: indexes.laneById.get(node.laneId) || null,
    papers,
    works,
    assessments,
    wikipediaSources,
    citationWorks: works.map(item => item.work).filter(isBibTeXEligible)
  };
}

function renderNodePage(context, options = {}) {
  assertObject(context, 'node page context');
  const atlas = assertObject(context.atlas, 'atlas');
  const node = assertObject(context.node, 'node');
  const id = assertSafeNodeId(node.id);
  const title = nonEmptyText(node.title);
  const summary = nonEmptyText(node.description);
  if (!title) throw nodePageError(`node ${id} is missing a title`);
  if (!summary) throw nodePageError(`node ${id} is missing a summary`);

  const baseUrl = normalizeBaseUrl(
    options.canonicalBaseUrl === undefined ? atlas.dataset?.canonicalUrl : options.canonicalBaseUrl
  );
  const canonicalUrl = new URL(`nodes/${encodeURIComponent(id)}/`, baseUrl).href;
  const socialImageUrl = normalizeSocialImageUrl(
    options.socialImageUrl === undefined ? 'social-card.png' : options.socialImageUrl,
    baseUrl
  ).href;
  // Static node pages live below `nodes/<id>/`, but project-root links must
  // remain rooted at the canonical GitHub Pages project mount.  A relative
  // `../../` link is rejected by the published-site contract and breaks when
  // the site is mounted below a repository pathname.  Derive both links from
  // the canonical URL so the checked-in `/ai_tech_tree/` mount and local
  // staged server use the same deterministic paths.
  const projectBasePath = baseUrl.pathname;
  const backlink = `${projectBasePath}#node=${encodeURIComponent(id)}`;
  const canonicalDataPath = new URL('ai-research-tech-tree.json', baseUrl).pathname;
  const lane = nonEmptyText(context.lane?.label) || nonEmptyText(node.laneId) || 'Unassigned';
  const date = formatDate(node);
  const status = formatStatus(node);
  const limitations = Array.isArray(atlas.dataset?.knownLimitations)
    ? atlas.dataset.knownLimitations.map(nonEmptyText).filter(Boolean)
    : [];
  const caveat = limitations[0] || 'Evidence coverage is not assessed for this record.';
  const works = context.works || [];
  const papers = context.papers || [];
  const wikipediaSources = context.wikipediaSources || [];
  const assessments = context.assessments || [];
  const citationWorks = context.citationWorks || [];

  const worksSection = works.length > 0
    ? `<h3>Landmark works</h3><ol class="sources">${works.map(renderLandmarkWork).join('')}</ol>`
    : '';
  const papersSection = papers.length > 0
    ? `<h3>Research papers</h3><ol class="sources">${papers.map(renderPaper).join('')}</ol>`
    : '';
  const wikipediaSection = wikipediaSources.length > 0
    ? `<h3>Evidence sources</h3><ol class="sources">${wikipediaSources.map(renderWikipediaSource).join('')}</ol>`
    : '';
  const noSources = works.length + papers.length + wikipediaSources.length === 0
    ? '<p>No directly linked work or evidence source is recorded for this node in this edition.</p>'
    : '';
  const assessmentSection = assessments.length > 0
    ? `<ol class="assessments">${assessments.map(renderEvidenceAssessment).join('')}</ol>`
    : '<p>No node-level evidence assessment is recorded for this entry.</p>';
  const bibtexSection = citationWorks.length > 0
    ? `<section id="bibtex" aria-labelledby="bibtex-title"><h2 id="bibtex-title">BibTeX for eligible linked works</h2><p>These entries use only bibliographic fields already present in the atlas.</p>${citationWorks.map(work => `<h3>${escapeHtml(work.title)}</h3><pre><code>${escapeHtml(renderBibTeX(work))}</code></pre>`).join('')}</section>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="index,follow">
<title>${escapeHtml(title)} — AI Research Tech Tree</title>
<meta name="description" content="${escapeHtml(summary)}">
<link rel="canonical" href="${escapeHtml(canonicalUrl)}">
<link rel="alternate" type="application/json" href="${escapeHtml(canonicalDataPath)}" title="AI Research Tech Tree canonical data">
<meta property="og:type" content="article">
<meta property="og:site_name" content="AI Research Tech Tree">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(summary)}">
<meta property="og:url" content="${escapeHtml(canonicalUrl)}">
<meta property="og:image" content="${escapeHtml(socialImageUrl)}">
<meta property="og:image:alt" content="AI Research Tech Tree timeline and research network">
<style>
:root{color-scheme:light dark;--bg:#f6f4ef;--panel:#fffdfa;--ink:#17202a;--muted:#58616b;--line:#c7c1b7;--accent:#075985;--code:#eee9df}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:1rem/1.58 system-ui,-apple-system,"Segoe UI",sans-serif}a{color:var(--accent);text-underline-offset:.18em}header,main,footer{width:min(52rem,calc(100% - 2rem));margin-inline:auto}header{padding:1.25rem 0}.site-name{color:var(--muted);margin:.6rem 0 0}article{background:var(--panel);border:1px solid var(--line);border-radius:.75rem;padding:clamp(1.25rem,4vw,2.5rem);box-shadow:0 .25rem 1.25rem #0000000d}h1{font-size:clamp(2rem,6vw,3.35rem);line-height:1.08;margin:.25rem 0 1.25rem}h2{margin-top:2.25rem;border-top:1px solid var(--line);padding-top:1.5rem}h3{margin-top:1.5rem}dl{display:grid;grid-template-columns:max-content 1fr;gap:.35rem 1.25rem;margin:0 0 1.5rem}dt{color:var(--muted);font-weight:650}dd{margin:0}.summary{font-size:1.16rem}.sources,.assessments{padding-left:1.35rem}.sources li,.assessments li{margin:.9rem 0}.source-meta{display:block;color:var(--muted);font-size:.9rem}.sources p,.assessments p{margin:.25rem 0}pre{overflow:auto;background:var(--code);border:1px solid var(--line);border-radius:.4rem;padding:1rem;white-space:pre-wrap;overflow-wrap:anywhere}footer{color:var(--muted);padding:1.5rem 0 3rem}@media(prefers-color-scheme:dark){:root{--bg:#101418;--panel:#181e23;--ink:#f2eee7;--muted:#b5bdc5;--line:#46515b;--accent:#7dd3fc;--code:#0d1216}}@media(forced-colors:active){article,pre{border:1px solid CanvasText;box-shadow:none}}@media(max-width:34rem){dl{grid-template-columns:1fr;gap:.05rem}dd{margin-bottom:.6rem}}
</style>
</head>
<body>
<header><a href="${escapeHtml(backlink)}">← Explore this node in the interactive atlas</a><p class="site-name">AI Research Tech Tree · static node record</p></header>
<main>
<article>
<h1>${escapeHtml(title)}</h1>
<dl><dt>Year</dt><dd>${escapeHtml(date)}</dd><dt>Lane</dt><dd>${escapeHtml(lane)}</dd><dt>Status</dt><dd>${escapeHtml(status)}</dd><dt>Stable ID</dt><dd><code>${escapeHtml(id)}</code></dd></dl>
<section aria-labelledby="summary-title"><h2 id="summary-title">Summary</h2><p class="summary">${escapeHtml(summary)}</p></section>
<section aria-labelledby="works-title"><h2 id="works-title">Works and sources</h2>${worksSection}${papersSection}${wikipediaSection}${noSources}</section>
<section aria-labelledby="evidence-title"><h2 id="evidence-title">Evidence caveat</h2><p>${escapeHtml(caveat)}</p>${assessmentSection}</section>
${bibtexSection}
</article>
</main>
<footer><a href="${escapeHtml(canonicalDataPath)}">Download the canonical JSON dataset</a></footer>
</body>
</html>
`;
}

function buildNodePageArtifacts(atlas, options = {}) {
  assertObject(atlas, 'atlas');
  assertObject(atlas.dataset, 'atlas.dataset');
  if (!Array.isArray(atlas.nodes)) throw nodePageError('atlas.nodes must be an array');
  for (const label of ['lanes', 'papers', 'landmarkWorks', 'wikipediaSources', 'paperLinks', 'landmarkWorkLinks', 'evidenceAssessments']) {
    if (!Array.isArray(atlas[label])) throw nodePageError(`atlas.${label} must be an array`);
  }
  const indexes = buildIndexes(atlas);
  const seen = new Map();
  const contexts = atlas.nodes.map((node, index) => {
    assertObject(node, `atlas.nodes[${index}]`);
    const id = assertSafeNodeId(node.id, `atlas.nodes[${index}].id`);
    const folded = id.toLowerCase();
    if (seen.has(folded)) {
      throw nodePageError(`node IDs collide on case-insensitive filesystems: ${seen.get(folded)} and ${id}`);
    }
    seen.set(folded, id);
    return contextForNode(atlas, indexes, node);
  });
  return contexts.map(context => ({
    nodeId: context.node.id,
    target: `nodes/${context.node.id}/index.html`,
    mediaType: NODE_PAGE_MEDIA_TYPE,
    contents: renderNodePage(context, options)
  }));
}

function resolveOutputTarget(outputDirectory, target) {
  const root = path.resolve(outputDirectory);
  const absolute = path.resolve(root, ...target.split('/'));
  const relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw nodePageError(`output target escapes outputDirectory: ${target}`);
  }
  return absolute;
}

async function writeNodePageArtifacts(artifacts, outputDirectory) {
  if (!Array.isArray(artifacts)) throw nodePageError('artifacts must be an array');
  const targets = new Set();
  const resolved = artifacts.map((artifact, index) => {
    assertObject(artifact, `artifacts[${index}]`);
    const id = assertSafeNodeId(artifact.nodeId, `artifacts[${index}].nodeId`);
    const expectedTarget = `nodes/${id}/index.html`;
    if (artifact.target !== expectedTarget) {
      throw nodePageError(`artifacts[${index}].target must be ${expectedTarget}`);
    }
    if (targets.has(artifact.target)) throw nodePageError(`artifacts contains duplicate target ${artifact.target}`);
    targets.add(artifact.target);
    if (artifact.mediaType !== NODE_PAGE_MEDIA_TYPE) {
      throw nodePageError(`artifacts[${index}].mediaType must be ${NODE_PAGE_MEDIA_TYPE}`);
    }
    if (typeof artifact.contents !== 'string') throw nodePageError(`artifacts[${index}].contents must be text`);
    return { ...artifact, absolute: resolveOutputTarget(outputDirectory, artifact.target) };
  });
  await Promise.all(resolved.map(async artifact => {
    await fsp.mkdir(path.dirname(artifact.absolute), { recursive: true });
    await fsp.writeFile(artifact.absolute, artifact.contents, 'utf8');
  }));
  return resolved.map(({ absolute, ...artifact }) => artifact);
}

async function generateNodePages({
  inputPath = DEFAULT_INPUT_PATH,
  outputDirectory = DEFAULT_OUTPUT_DIRECTORY,
  canonicalBaseUrl,
  socialImageUrl
} = {}) {
  const raw = await fsp.readFile(path.resolve(inputPath), 'utf8');
  let atlas;
  try {
    atlas = JSON.parse(raw);
  } catch (error) {
    throw nodePageError(`cannot parse ${inputPath}: ${error.message}`);
  }
  const artifacts = buildNodePageArtifacts(atlas, { canonicalBaseUrl, socialImageUrl });
  await writeNodePageArtifacts(artifacts, outputDirectory);
  return artifacts;
}

module.exports = {
  DEFAULT_INPUT_PATH,
  DEFAULT_OUTPUT_DIRECTORY,
  NODE_PAGE_MEDIA_TYPE,
  assertSafeNodeId,
  buildNodePageArtifacts,
  generateNodePages,
  isBibTeXEligible,
  renderBibTeX,
  renderNodePage,
  writeNodePageArtifacts
};

if (require.main === module) {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_INPUT_PATH;
  const outputDirectory = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_OUTPUT_DIRECTORY;
  generateNodePages({ inputPath, outputDirectory })
    .then(artifacts => process.stdout.write(`Generated ${artifacts.length} static node pages in ${outputDirectory}\n`))
    .catch(error => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
