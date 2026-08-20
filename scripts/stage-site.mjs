#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseAllDocuments } from 'yaml';

import { releaseRefConstants, verifyReleaseRef } from './release-ref.mjs';
import { loadReleaseSpec, releaseSpecConstants } from './release-spec.mjs';
import { parseStrictJson } from './strict-json.mjs';

const SCRIPT_VERSION = '1.4.0';
const RELEASE_MANIFEST_SCHEMA_VERSION = '1.4.0';
const CONFIG_SCHEMA_VERSION = '1.1.0';
const DEFAULT_CONFIG_PATH = 'config/pages-stage.v1.json';
const REQUIRED_OUTPUT_DIRECTORY = '_site';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');

const MEDIA_TYPES = new Map([
  ['.cff', 'text/yaml; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.csv', 'text/csv; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.htm', 'text/html; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.jsonld', 'application/ld+json'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.ndjson', 'application/x-ndjson'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.webp', 'image/webp'],
  ['.xml', 'application/xml; charset=utf-8']
]);

function stageError(message) {
  return new Error(`stage-site: ${message}`);
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw stageError(`${label} must be an object`);
  }
}

function assertOnlyKeys(value, allowedKeys, label) {
  assertObject(value, label);
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length > 0) {
    throw stageError(`${label} has unsupported keys: ${unknown.sort().join(', ')}`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw stageError(`${label} must be a non-empty, trimmed string without control characters`);
  }
  return value;
}

function assertIsoDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw stageError(`${label} must use YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw stageError(`${label} is not a valid calendar date`);
  }
  return value;
}

export function normalizeManifestPath(value, label = 'path') {
  assertNonEmptyString(value, label);
  if (value.includes('\\')) throw stageError(`${label} must use forward slashes`);
  if (path.posix.isAbsolute(value) || /^[A-Za-z]:/u.test(value)) {
    throw stageError(`${label} must be repository-relative`);
  }
  const normalized = path.posix.normalize(value);
  const segments = value.split('/');
  if (
    normalized !== value ||
    value === '.' ||
    value.endsWith('/') ||
    segments.some(segment => segment === '' || segment === '.' || segment === '..')
  ) {
    throw stageError(`${label} is not a canonical relative path: ${value}`);
  }
  for (const segment of segments) {
    if (!/^[A-Za-z0-9._~-]+$/u.test(segment)) {
      throw stageError(
        `${label} contains a non-portable path segment: ${segment}; ` +
        'published paths may use only ASCII letters, digits, dot, underscore, hyphen, and tilde'
      );
    }
    if (segment.endsWith('.') || segment.endsWith(' ')) {
      throw stageError(`${label} contains a segment with a trailing dot or space: ${segment}`);
    }
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment)) {
      throw stageError(`${label} contains a Windows-reserved device name: ${segment}`);
    }
  }
  return value;
}

function resolveInside(root, relativePath, label) {
  const absolute = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, absolute);
  if (relative === '' || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw stageError(`${label} escapes its allowed root: ${relativePath}`);
  }
  return absolute;
}

function caseFold(value) {
  return value.normalize('NFC').toLowerCase();
}

function isReservedOutputPath(value) {
  const firstSegment = String(value).split('/', 1)[0];
  return caseFold(firstSegment) === caseFold(REQUIRED_OUTPUT_DIRECTORY);
}

function isReservedTemporaryPath(value) {
  const firstSegment = caseFold(String(value).split('/', 1)[0]);
  return firstSegment.startsWith('.stage-site-');
}

function isGitAdministrativePath(value) {
  const firstSegment = String(value).split('/', 1)[0];
  return caseFold(firstSegment) === '.git';
}

function assertPermittedRepositoryInputPath(value, label) {
  if (isReservedOutputPath(value)) {
    throw stageError(`${label} cannot read from ${REQUIRED_OUTPUT_DIRECTORY}`);
  }
  if (isReservedTemporaryPath(value)) {
    throw stageError(`${label} cannot read from stage-site temporary directories`);
  }
  if (isGitAdministrativePath(value)) {
    throw stageError(`${label} cannot read from Git administrative data`);
  }
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function mediaTypeForPath(filePath) {
  if (path.posix.basename(filePath) === '.nojekyll') return 'application/octet-stream';
  return MEDIA_TYPES.get(path.posix.extname(filePath).toLowerCase()) || 'application/octet-stream';
}

async function readJsonFile(absolutePath, label) {
  let bytes;
  try {
    bytes = await readFile(absolutePath);
  } catch (error) {
    throw stageError(`cannot read ${label}: ${error.message}`);
  }
  return { bytes, document: parseStrictJson(bytes, label) };
}

async function readMetadataFile(absolutePath, label) {
  try {
    return await readFile(absolutePath);
  } catch (error) {
    throw stageError(`cannot read ${label}: ${error.message}`);
  }
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function decodeMetadataText(bytes, label) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw stageError(`${label} must be valid UTF-8`);
  if (text.startsWith('\ufeff')) throw stageError(`${label} must not contain a UTF-8 BOM`);
  if (text.includes('\u0000')) throw stageError(`${label} must not contain NUL bytes`);
  if (/\r(?!\n)/u.test(text)) throw stageError(`${label} must not contain lone carriage returns`);
  return text;
}

function parseCitationDocument(bytes) {
  const text = decodeMetadataText(bytes, 'CITATION metadata');
  let documents;
  try {
    documents = parseAllDocuments(text, {
      merge: false,
      prettyErrors: false,
      strict: true,
      uniqueKeys: true
    });
  } catch (error) {
    throw stageError(`CITATION is not valid strict YAML: ${error.message}`);
  }
  if (documents.length !== 1) throw stageError('CITATION must contain exactly one YAML document');
  const parsed = documents[0];
  const problems = [...parsed.errors, ...parsed.warnings];
  if (problems.length > 0) {
    throw stageError(`CITATION is not valid strict YAML: ${problems[0].message}`);
  }
  let document;
  try {
    document = parsed.toJS({ maxAliasCount: 0 });
  } catch (error) {
    throw stageError(`CITATION contains unsupported YAML aliases: ${error.message}`);
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw stageError('CITATION must contain one top-level mapping');
  }
  return { document, text };
}

function validateCitationProjectIdentity(citation, releaseSpec) {
  const document = citation.document;
  if (document['cff-version'] !== '1.2.0') {
    throw stageError('CITATION cff-version must be exactly 1.2.0');
  }
  if (document.title !== 'AI Research Tech Tree') {
    throw stageError('CITATION title must be exactly AI Research Tech Tree');
  }
  if (document.type !== 'dataset') throw stageError('CITATION type must be exactly dataset');
  if (
    !Array.isArray(document.authors) ||
    document.authors.length === 0 ||
    document.authors.some(author => (
      !author ||
      typeof author !== 'object' ||
      Array.isArray(author) ||
      !(
        (typeof author.name === 'string' && author.name.trim().length > 0) ||
        (typeof author['family-names'] === 'string' && author['family-names'].trim().length > 0)
      )
    ))
  ) {
    throw stageError('CITATION authors must identify each author with a non-empty name or family-names');
  }
  if (document['repository-code'] !== 'https://github.com/neb6dav/ai_tech_tree') {
    throw stageError('CITATION repository-code must identify the canonical repository');
  }
  if (document.url !== releaseSpec.productionBaseUrl) {
    throw stageError(`CITATION url must be exactly ${releaseSpec.productionBaseUrl}`);
  }
}

function occurrenceCount(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function markdownOutsideFences(text) {
  const visible = [];
  let fence = null;
  let inHtmlComment = false;
  for (const line of text.split(/\r?\n/u)) {
    if (fence !== null) {
      const closingPattern = new RegExp(
        `^[ ]{0,3}${fence.character === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`,
        'u'
      );
      if (closingPattern.test(line)) {
        fence = null;
      }
      continue;
    }
    let remainder = line;
    let visibleLine = '';
    while (remainder.length > 0) {
      if (inHtmlComment) {
        const end = remainder.indexOf('-->');
        if (end < 0) {
          remainder = '';
          continue;
        }
        inHtmlComment = false;
        remainder = remainder.slice(end + 3);
        continue;
      }
      const start = remainder.indexOf('<!--');
      if (start < 0) {
        visibleLine += remainder;
        remainder = '';
        continue;
      }
      visibleLine += remainder.slice(0, start);
      inHtmlComment = true;
      remainder = remainder.slice(start + 4);
    }
    if (/<(?:\/?[A-Za-z][A-Za-z0-9-]*(?=[ \t/>]|$)|[!?])/u.test(visibleLine)) {
      throw stageError('CHANGELOG contains an unsupported raw HTML block');
    }
    const opening = /^[ ]{0,3}(`{3,}|~{3,})(.*)$/u.exec(visibleLine);
    if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
      fence = { character: opening[1][0], length: opening[1].length };
      continue;
    }
    visible.push(visibleLine);
  }
  if (fence !== null) throw stageError('CHANGELOG contains an unterminated fenced code block');
  if (inHtmlComment) throw stageError('CHANGELOG contains an unterminated HTML comment');
  return visible.join('\n');
}

function validateReleaseIdentity({
  packageDocument,
  packageLockDocument,
  datasetDocument,
  citationBytes,
  changelogBytes,
  releaseSpec
}) {
  const version = assertNonEmptyString(packageDocument.version, 'package version');
  const packageName = assertNonEmptyString(packageDocument.name, 'package name');
  if (packageLockDocument.name !== packageName) {
    throw stageError(`package-lock top-level name must be exactly ${packageName}`);
  }
  if (packageLockDocument.packages?.['']?.name !== packageName) {
    throw stageError(`package-lock root-package name must be exactly ${packageName}`);
  }
  if (packageLockDocument.version !== version) {
    throw stageError(`package-lock top-level version must be exactly ${version}`);
  }
  if (packageLockDocument.packages?.['']?.version !== version) {
    throw stageError(`package-lock root-package version must be exactly ${version}`);
  }
  if (packageLockDocument.lockfileVersion !== 3) {
    throw stageError('package-lock lockfileVersion must be exactly 3');
  }
  if (releaseSpec.version !== version) {
    throw stageError(`release specification version ${releaseSpec.version} does not match package version ${version}`);
  }
  if (releaseSpec.assetStem !== `${packageName}-v${version}`) {
    throw stageError(`release specification assetStem must be exactly ${packageName}-v${version}`);
  }

  const edition = assertNonEmptyString(datasetDocument.dataset?.edition, 'dataset edition');
  assertIsoDate(edition.slice(0, 10), 'dataset edition date prefix');
  if (edition[10] !== '-') throw stageError('dataset edition must begin with YYYY-MM-DD-');
  const releaseState = assertNonEmptyString(datasetDocument.dataset?.releaseState, 'dataset releaseState');
  if (releaseSpec.edition !== edition) {
    throw stageError(`release specification edition ${releaseSpec.edition} does not match dataset edition ${edition}`);
  }

  const changelog = decodeMetadataText(changelogBytes, 'CHANGELOG metadata');
  const visibleChangelog = markdownOutsideFences(changelog);
  const citation = parseCitationDocument(citationBytes);
  validateCitationProjectIdentity(citation, releaseSpec);
  const escapedVersion = escapeRegularExpression(version);
  const exactReleaseHeadingPattern = new RegExp(`^[ ]{0,3}## \\[${escapedVersion}\\][ \\t]+-[ \\t]+(\\d{4}-\\d{2}-\\d{2})[ \\t]*$`, 'gmu');
  const targetVersionHeadingPattern = new RegExp(`^[ ]{0,3}##[ \\t]+\\[${escapedVersion}\\].*$`, 'gmu');
  const developmentTargetPattern = new RegExp(`^\\*\\*Target:[ \\t]+v${escapedVersion}[ \\t]+development edition\\.\\*\\*`, 'gimu');
  const releaseHeadings = [...visibleChangelog.matchAll(exactReleaseHeadingPattern)];
  const targetVersionHeadings = [...visibleChangelog.matchAll(targetVersionHeadingPattern)];
  if (occurrenceCount(visibleChangelog, /^[ ]{0,3}## \[Unreleased\][ \t]*$/gmu) !== 1) {
    throw stageError('CHANGELOG must contain exactly one ## [Unreleased] heading');
  }

  const expectedCitationVersion = releaseSpec.status === 'planned' ? `${version}-dev` : version;
  if (citation.document.version !== expectedCitationVersion) {
    throw stageError(`CITATION top-level version must be exactly ${expectedCitationVersion}`);
  }
  if (typeof citation.document.message !== 'string' || citation.document.message.trim().length === 0) {
    throw stageError('CITATION top-level message must be a non-empty string');
  }
  if (releaseSpec.status === 'planned') {
    if (releaseState !== 'Development edition') {
      throw stageError('planned release dataset releaseState must be exactly Development edition');
    }
    if (Object.hasOwn(citation.document, 'date-released')) {
      throw stageError('CITATION must not contain a top-level date-released before release');
    }
    if (!/untagged/iu.test(citation.document.message) || !/development edition/iu.test(citation.document.message)) {
      throw stageError('planned release CITATION must retain its untagged development warning');
    }
    if (targetVersionHeadings.length !== 0) {
      throw stageError(`planned release CHANGELOG must not contain a ${version} release heading`);
    }
    if (occurrenceCount(visibleChangelog, developmentTargetPattern) !== 1) {
      throw stageError(`planned release CHANGELOG must contain exactly one v${version} development target`);
    }
  } else {
    if (releaseState !== releaseSpec.releaseState || /development/iu.test(releaseState)) {
      throw stageError(`ready release dataset releaseState must be exactly ${releaseSpec.releaseState}`);
    }
    if (citation.document['date-released'] !== releaseSpec.releaseDate) {
      throw stageError(`CITATION top-level date-released must be exactly ${releaseSpec.releaseDate}`);
    }
    if (/untagged|development edition/iu.test(citation.document.message)) {
      throw stageError('ready release CITATION must not retain development-edition wording');
    }
    if (
      targetVersionHeadings.length !== 1 ||
      releaseHeadings.length !== 1 ||
      releaseHeadings[0][1] !== releaseSpec.releaseDate
    ) {
      throw stageError(
        `ready release CHANGELOG must contain exactly one ## [${version}] - ${releaseSpec.releaseDate} heading`
      );
    }
    if (occurrenceCount(visibleChangelog, developmentTargetPattern) !== 0) {
      throw stageError(`ready release CHANGELOG must not retain the v${version} development target`);
    }
  }

  return { version, edition, releaseState };
}

function validateMediaType(value, label) {
  return assertNonEmptyString(value, label);
}

export function validateStageConfig(config) {
  assertOnlyKeys(
    config,
    ['schemaVersion', 'outputDirectory', 'releaseManifest', 'metadata', 'artifacts', 'generatedFiles'],
    'configuration'
  );
  if (config.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    throw stageError(`configuration schemaVersion must be ${CONFIG_SCHEMA_VERSION}`);
  }
  if (config.outputDirectory !== REQUIRED_OUTPUT_DIRECTORY) {
    throw stageError(`outputDirectory must be exactly ${REQUIRED_OUTPUT_DIRECTORY}`);
  }
  normalizeManifestPath(config.outputDirectory, 'outputDirectory');
  normalizeManifestPath(config.releaseManifest, 'releaseManifest');
  if (config.releaseManifest !== 'release-manifest.json') {
    throw stageError('releaseManifest must be exactly release-manifest.json');
  }

  assertOnlyKeys(
    config.metadata,
    ['packageFile', 'packageLockFile', 'datasetFile', 'citationFile', 'changelogFile', 'releaseFile'],
    'metadata'
  );
  normalizeManifestPath(config.metadata.packageFile, 'metadata.packageFile');
  normalizeManifestPath(config.metadata.packageLockFile, 'metadata.packageLockFile');
  normalizeManifestPath(config.metadata.datasetFile, 'metadata.datasetFile');
  normalizeManifestPath(config.metadata.citationFile, 'metadata.citationFile');
  normalizeManifestPath(config.metadata.changelogFile, 'metadata.changelogFile');
  normalizeManifestPath(config.metadata.releaseFile, 'metadata.releaseFile');
  assertPermittedRepositoryInputPath(config.metadata.packageFile, 'metadata.packageFile');
  assertPermittedRepositoryInputPath(config.metadata.packageLockFile, 'metadata.packageLockFile');
  assertPermittedRepositoryInputPath(config.metadata.datasetFile, 'metadata.datasetFile');
  assertPermittedRepositoryInputPath(config.metadata.citationFile, 'metadata.citationFile');
  assertPermittedRepositoryInputPath(config.metadata.changelogFile, 'metadata.changelogFile');
  assertPermittedRepositoryInputPath(config.metadata.releaseFile, 'metadata.releaseFile');

  if (!Array.isArray(config.artifacts) || config.artifacts.length === 0) {
    throw stageError('artifacts must be a non-empty array');
  }
  config.artifacts.forEach((artifact, index) => {
    const label = `artifacts[${index}]`;
    assertOnlyKeys(artifact, ['kind', 'source', 'target', 'mediaType'], label);
    if (artifact.kind !== 'file' && artifact.kind !== 'directory') {
      throw stageError(`${label}.kind must be file or directory`);
    }
    normalizeManifestPath(artifact.source, `${label}.source`);
    normalizeManifestPath(artifact.target, `${label}.target`);
    assertPermittedRepositoryInputPath(artifact.source, `${label}.source`);
    if (artifact.mediaType !== undefined) {
      validateMediaType(artifact.mediaType, `${label}.mediaType`);
      const expectedMediaType = mediaTypeForPath(artifact.target);
      if (artifact.kind === 'file' && artifact.mediaType !== expectedMediaType) {
        throw stageError(
          `${label}.mediaType must match the canonical type for ${artifact.target}: ${expectedMediaType}`
        );
      }
    }
    if (artifact.kind === 'directory' && artifact.mediaType !== undefined) {
      throw stageError(`${label}.mediaType is only valid for file artifacts`);
    }
  });

  if (!Array.isArray(config.generatedFiles)) throw stageError('generatedFiles must be an array');
  config.generatedFiles.forEach((generated, index) => {
    const label = `generatedFiles[${index}]`;
    assertOnlyKeys(generated, ['target', 'contents', 'mediaType'], label);
    normalizeManifestPath(generated.target, `${label}.target`);
    if (typeof generated.contents !== 'string') throw stageError(`${label}.contents must be a string`);
    validateMediaType(generated.mediaType, `${label}.mediaType`);
    const expectedMediaType = mediaTypeForPath(generated.target);
    if (generated.mediaType !== expectedMediaType) {
      throw stageError(
        `${label}.mediaType must match the canonical type for ${generated.target}: ${expectedMediaType}`
      );
    }
  });

  return config;
}

async function assertPathComponentsAreSafe(root, relativePath, label) {
  let current = root;
  let finalStat = null;
  for (const segment of relativePath.split('/')) {
    current = path.join(current, segment);
    try {
      finalStat = await lstat(current);
    } catch (error) {
      if (error.code === 'ENOENT') throw stageError(`${label} is missing: ${relativePath}`);
      throw stageError(`cannot inspect ${label} ${relativePath}: ${error.message}`);
    }
    if (finalStat.isSymbolicLink()) {
      throw stageError(`${label} contains a symbolic link or junction: ${relativePath}`);
    }
  }
  return finalStat;
}

async function addDirectoryFiles(plan, repositoryRoot, sourceRelative, targetRelative) {
  const sourceAbsolute = resolveInside(repositoryRoot, sourceRelative, 'directory source');
  const entries = await readdir(sourceAbsolute, { withFileTypes: true });
  entries.sort((left, right) => compareText(left.name, right.name));

  for (const entry of entries) {
    const childSource = `${sourceRelative}/${entry.name}`;
    const childTarget = `${targetRelative}/${entry.name}`;
    normalizeManifestPath(childSource, 'directory child source');
    normalizeManifestPath(childTarget, 'directory child target');
    if (entry.isSymbolicLink()) {
      throw stageError(`directory source contains a symbolic link or junction: ${childSource}`);
    }
    if (entry.isDirectory()) {
      await addDirectoryFiles(plan, repositoryRoot, childSource, childTarget);
    } else if (entry.isFile()) {
      plan.push({
        sourceAbsolute: resolveInside(repositoryRoot, childSource, 'file source'),
        sourceRelative: childSource,
        target: childTarget,
        mediaType: mediaTypeForPath(childTarget),
        generatedContents: null
      });
    } else {
      throw stageError(`directory source contains an unsupported filesystem entry: ${childSource}`);
    }
  }
}

function validatePlanTargets(plan, releaseManifestPath) {
  const byFoldedTarget = new Map();
  for (const item of plan) {
    if (caseFold(item.target) === caseFold(releaseManifestPath)) {
      throw stageError(`staged target is reserved for the release manifest: ${item.target}`);
    }
    const folded = caseFold(item.target);
    const existing = byFoldedTarget.get(folded);
    if (existing) {
      throw stageError(`staged target collision between ${existing.target} and ${item.target}`);
    }
    byFoldedTarget.set(folded, item);
  }

  for (const item of plan) {
    const segments = item.target.split('/');
    for (let length = 1; length < segments.length; length += 1) {
      const ancestor = caseFold(segments.slice(0, length).join('/'));
      const conflictingFile = byFoldedTarget.get(ancestor);
      if (conflictingFile) {
        throw stageError(`staged file/directory collision between ${conflictingFile.target} and ${item.target}`);
      }
    }
  }
}

async function collectCopyPlan(repositoryRoot, config) {
  const plan = [];
  const directoryRequirements = [];
  for (let index = 0; index < config.artifacts.length; index += 1) {
    const artifact = config.artifacts[index];
    const sourceStat = await assertPathComponentsAreSafe(repositoryRoot, artifact.source, `artifacts[${index}].source`);
    if (artifact.kind === 'file') {
      if (!sourceStat.isFile()) throw stageError(`artifacts[${index}].source must be a regular file`);
      plan.push({
        sourceAbsolute: resolveInside(repositoryRoot, artifact.source, 'file source'),
        sourceRelative: artifact.source,
        target: artifact.target,
        mediaType: artifact.mediaType || mediaTypeForPath(artifact.target),
        generatedContents: null
      });
    } else {
      if (!sourceStat.isDirectory()) throw stageError(`artifacts[${index}].source must be a directory`);
      const firstFileIndex = plan.length;
      await addDirectoryFiles(plan, repositoryRoot, artifact.source, artifact.target);
      directoryRequirements.push({
        path: artifact.source,
        filePaths: plan.slice(firstFileIndex).map(item => item.sourceRelative).sort(compareText)
      });
    }
  }

  for (const generated of config.generatedFiles) {
    plan.push({
      sourceAbsolute: null,
      sourceRelative: null,
      target: generated.target,
      mediaType: generated.mediaType,
      generatedContents: generated.contents
    });
  }

  validatePlanTargets(plan, config.releaseManifest);
  plan.sort((left, right) => compareText(left.target, right.target));
  directoryRequirements.sort((left, right) => compareText(left.path, right.path));
  return { plan, directoryRequirements };
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function hydratePlan(plan) {
  const hydrated = [];
  for (const item of plan) {
    let bytes;
    if (item.generatedContents !== null) {
      bytes = Buffer.from(item.generatedContents, 'utf8');
    } else {
      try {
        bytes = await readFile(item.sourceAbsolute);
      } catch (error) {
        throw stageError(`cannot read staged source ${item.sourceRelative}: ${error.message}`);
      }
    }
    hydrated.push({ ...item, bytes, sha256: sha256(bytes) });
  }
  return hydrated;
}

function gitOutput(repositoryRoot, args) {
  try {
    return execFileSync('git', args, {
      cwd: repositoryRoot,
      env: gitEnvironment(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    }).trim();
  } catch {
    return null;
  }
}

function gitBuffer(repositoryRoot, args, input = null) {
  try {
    return execFileSync('git', args, {
      cwd: repositoryRoot,
      env: gitEnvironment(),
      encoding: null,
      input: input == null ? undefined : Buffer.from(input),
      stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'ignore'],
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024
    });
  } catch {
    return null;
  }
}

function gitSucceeds(repositoryRoot, args) {
  try {
    execFileSync('git', args, {
      cwd: repositoryRoot,
      env: gitEnvironment(),
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true
    });
    return true;
  } catch {
    return false;
  }
}

function repositoryFsckConfigurationIsIsolated(repositoryRoot) {
  const result = spawnSync(
    'git',
    ['config', '--null', '--show-origin', '--get-regexp', '^[fF][sS][cC][kK]\\.'],
    {
      cwd: repositoryRoot,
      env: gitEnvironment(),
      encoding: null,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    }
  );
  if (result.error || result.signal || (result.status !== 0 && result.status !== 1)) return null;
  const output = Buffer.from(result.stdout || []);
  if (result.status === 1) return output.byteLength === 0 ? true : null;
  return output.byteLength === 0 ? null : false;
}

function gitEnvironment() {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_'))
  );
  const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
  environment.GIT_NO_REPLACE_OBJECTS = '1';
  environment.GIT_ATTR_NOSYSTEM = '1';
  environment.GIT_CONFIG_COUNT = '0';
  environment.GIT_CONFIG_GLOBAL = nullDevice;
  environment.GIT_CONFIG_NOSYSTEM = '1';
  environment.GIT_CONFIG_SYSTEM = nullDevice;
  environment.GIT_OPTIONAL_LOCKS = '0';
  environment.GIT_TERMINAL_PROMPT = '0';
  return environment;
}

function firstEnvironmentValue(environment, names) {
  for (const name of names) {
    const value = environment[name];
    if (typeof value === 'string' && value.trim() !== '') return { name, value: value.trim() };
  }
  return null;
}

function resolveCommit(repositoryRoot, environment) {
  const configured = firstEnvironmentValue(environment, ['AI_TREE_COMMIT_SHA', 'GITHUB_SHA', 'CI_COMMIT_SHA']);
  const commit = configured ? configured.value : gitOutput(repositoryRoot, ['rev-parse', 'HEAD']);
  if (!commit) throw stageError('commit is unavailable from the environment and git fallback');
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(commit)) {
    throw stageError(`commit must be a full 40- or 64-character hexadecimal git object ID: ${commit}`);
  }
  return commit.toLowerCase();
}

function requiredCleanSource(environment) {
  const raw = environment.AI_TREE_REQUIRE_CLEAN;
  if (raw == null || String(raw).trim() === '' || /^(?:0|false|no)$/iu.test(String(raw).trim())) return false;
  if (/^(?:1|true|yes)$/iu.test(String(raw).trim())) return true;
  throw stageError('AI_TREE_REQUIRE_CLEAN must be true/false, yes/no, or 1/0 when set');
}

function normalizeInputSnapshots(inputSnapshots) {
  const byPath = new Map();
  for (const snapshot of inputSnapshots) {
    const relativePath = normalizeManifestPath(snapshot.path, 'release input path');
    const bytes = Buffer.from(snapshot.bytes);
    const digest = sha256(bytes);
    const previous = byPath.get(relativePath);
    if (previous && previous.sha256 !== digest) {
      throw stageError(`release input changed while staging: ${relativePath}`);
    }
    if (!previous) byPath.set(relativePath, { path: relativePath, bytes, sha256: digest });
  }
  return [...byPath.values()].sort((left, right) => compareText(left.path, right.path));
}

function isGitLfsPointer(bytes) {
  const text = Buffer.from(bytes).subarray(0, 1024).toString('utf8');
  return /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\n/mu.test(text) &&
    /^oid sha256:[0-9a-f]{64}\r?$/imu.test(text) &&
    /^size [0-9]+\r?$/mu.test(text);
}

function parseGitTreeEntries(bytes) {
  if (bytes == null) return null;
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) return null;
  const entries = text.split('\0').filter(Boolean).map(record => {
    const match = /^([0-7]{6})\s+([^\s]+)\s+([0-9a-f]+)\t(.+)$/u.exec(record);
    return match ? { mode: match[1], type: match[2], object: match[3], path: match[4] } : null;
  });
  return entries.every(Boolean) ? entries : null;
}

function gitObjectId(type, bytes, objectFormat) {
  if (objectFormat !== 'sha1' && objectFormat !== 'sha256') return null;
  const body = Buffer.from(bytes);
  const header = Buffer.from(`${type} ${body.byteLength}\0`, 'utf8');
  return createHash(objectFormat).update(header).update(body).digest('hex');
}

function parseGitAttributeRows(bytes) {
  if (bytes == null) return null;
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) return null;
  const fields = text.split('\0');
  if (fields.at(-1) === '') fields.pop();
  if (fields.length % 3 !== 0) return null;
  const rows = [];
  for (let index = 0; index < fields.length; index += 3) {
    const [pathName, attribute, value] = fields.slice(index, index + 3);
    if (!pathName || !attribute) return null;
    rows.push({ path: pathName, attribute, value });
  }
  return rows;
}

function repositoryAttributesAreIsolated(repositoryRoot) {
  const attributesPath = gitOutput(repositoryRoot, [
    'rev-parse',
    '--path-format=absolute',
    '--git-path',
    'info/attributes'
  ]);
  if (!attributesPath) return null;
  try {
    const attributes = lstatSync(attributesPath);
    return attributes.isFile() && attributes.size === 0;
  } catch (error) {
    return error?.code === 'ENOENT' ? true : false;
  }
}

function verifyTrackedTreeFilters(repositoryRoot, commit, repositoryAttributesIsolated) {
  const trackedEntries = parseGitTreeEntries(
    gitBuffer(repositoryRoot, ['ls-tree', '-r', '-z', commit])
  );
  if (trackedEntries == null) {
    return {
      trackedTreeEntryCount: null,
      trackedTreeFilterAttributeCount: null,
      trackedTreeFiltersVerified: false,
      trackedTreeFilterAuditSha256: null,
      filters: []
    };
  }
  const sortedEntries = [...trackedEntries].sort((left, right) => compareText(left.path, right.path));
  const paths = sortedEntries.map(entry => entry.path);
  const pathInput = Buffer.from(paths.length === 0 ? '' : `${paths.join('\0')}\0`, 'utf8');
  const committedAttributeRows = parseGitAttributeRows(gitBuffer(
    repositoryRoot,
    ['-c', 'core.attributesFile=', 'check-attr', '-z', '--all', `--source=${commit}`, '--stdin'],
    pathInput
  ));
  const workingAttributeRows = parseGitAttributeRows(gitBuffer(
    repositoryRoot,
    ['-c', 'core.attributesFile=', 'check-attr', '-z', '--all', '--stdin'],
    pathInput
  ));
  const pathSet = new Set(paths);
  const committedRowsAreBoundToTree = committedAttributeRows != null &&
    committedAttributeRows.every(row => pathSet.has(row.path));
  const workingRowsAreBoundToTree = workingAttributeRows != null &&
    workingAttributeRows.every(row => pathSet.has(row.path));
  const committedFilters = committedRowsAreBoundToTree
    ? committedAttributeRows.filter(row => row.attribute === 'filter')
    : [];
  const workingFilters = workingRowsAreBoundToTree
    ? workingAttributeRows.filter(row => row.attribute === 'filter')
    : [];
  const filtersByIdentity = new Map();
  for (const [scope, rows] of [['commit', committedFilters], ['worktree', workingFilters]]) {
    for (const row of rows) {
      const key = `${row.path}\0${row.value}`;
      const existing = filtersByIdentity.get(key);
      if (existing) existing.scopes.push(scope);
      else filtersByIdentity.set(key, { path: row.path, value: row.value, scopes: [scope] });
    }
  }
  const filters = [...filtersByIdentity.values()].sort((left, right) => (
    compareText(left.path, right.path) || compareText(left.value, right.value)
  ));
  const committedFilterByPath = new Map(committedFilters.map(row => [row.path, row.value]));
  const workingFilterByPath = new Map(workingFilters.map(row => [row.path, row.value]));
  const verified = repositoryAttributesIsolated === true &&
    committedRowsAreBoundToTree && workingRowsAreBoundToTree;
  const auditRows = sortedEntries.map(entry => (
    `${entry.mode}\t${entry.type}\t${entry.object}\t${entry.path}\t` +
    `commit:${committedFilterByPath.has(entry.path) ? committedFilterByPath.get(entry.path) : 'plain'}\t` +
    `worktree:${workingFilterByPath.has(entry.path) ? workingFilterByPath.get(entry.path) : 'plain'}`
  ));
  return {
    trackedTreeEntryCount: sortedEntries.length,
    trackedTreeFilterAttributeCount: verified ? filters.length : null,
    trackedTreeFiltersVerified: verified,
    trackedTreeFilterAuditSha256: verified
      ? sha256(Buffer.from(auditRows.join('\n'), 'utf8'))
      : null,
    filters
  };
}

function verifyInputsAtCommit(
  repositoryRoot,
  commit,
  inputSnapshots,
  directoryRequirements,
  objectFormat,
  repositoryAttributesIsolated
) {
  const fileResults = inputSnapshots.map(snapshot => {
    const treeEntries = parseGitTreeEntries(
      gitBuffer(repositoryRoot, ['ls-tree', '-z', commit, '--', snapshot.path])
    ) || [];
    const treeEntry = treeEntries.find(entry => entry.path === snapshot.path) || null;
    const treeMode = treeEntry?.mode || null;
    const expectedObjectId = treeEntry?.object?.toLowerCase() || null;
    const committedBytes = expectedObjectId == null
      ? null
      : gitBuffer(repositoryRoot, ['cat-file', 'blob', expectedObjectId]);
    const committedSha256 = committedBytes == null ? null : sha256(committedBytes);
    const computedObjectId = committedBytes == null ? null : gitObjectId('blob', committedBytes, objectFormat);
    const objectIdMatches = expectedObjectId != null && computedObjectId === expectedObjectId;
    const attributeRows = parseGitAttributeRows(gitBuffer(repositoryRoot, [
      '-c',
      'core.attributesFile=',
      'check-attr',
      '-z',
      '--all',
      `--source=${commit}`,
      '--',
      snapshot.path
    ]));
    const attributesVerified = repositoryAttributesIsolated === true && attributeRows != null;
    const filterAttribute = attributeRows?.find(row => (
      row.path === snapshot.path && row.attribute === 'filter'
    )) || null;
    const filterName = filterAttribute?.value ?? null;
    const usesGitLfs = /^lfs$/iu.test(filterName || '') ||
      (committedBytes != null && isGitLfsPointer(committedBytes));
    const usesUnsupportedFilter = filterName != null && !usesGitLfs;
    const publishableMode = treeMode === '100644' || treeMode === '100755';
    const contentMatches = committedSha256 === snapshot.sha256;
    const reason = !publishableMode
      ? `Git mode ${treeMode || 'missing'} is not a regular file`
      : !objectIdMatches
        ? `Git blob object ID mismatch: expected ${expectedObjectId || 'missing'}, computed ${computedObjectId || 'unavailable'}`
      : !attributesVerified
        ? 'Git attributes could not be verified from the advertised commit'
      : usesGitLfs
        ? 'Git LFS inputs are not supported by deterministic staging'
        : usesUnsupportedFilter
          ? `Git filter attribute ${filterName || '(empty)'} is not supported by deterministic staging`
        : !contentMatches
          ? 'working bytes differ from the committed blob'
          : null;
    return {
      path: snapshot.path,
      currentSha256: snapshot.sha256,
      committedSha256,
      treeMode,
      expectedObjectId,
      computedObjectId,
      objectIdMatches,
      attributesVerified,
      filterName,
      usesGitLfs,
      usesUnsupportedFilter,
      contentMatches,
      reason,
      matches: contentMatches && publishableMode && objectIdMatches && attributesVerified &&
        !usesGitLfs && !usesUnsupportedFilter
    };
  });

  const directoryResults = directoryRequirements.map(requirement => {
    const rootEntry = gitOutput(repositoryRoot, ['ls-tree', commit, '--', requirement.path]);
    const rootMode = rootEntry?.match(/^([0-7]{6})\s/u)?.[1] || null;
    const committedEntries = parseGitTreeEntries(
      gitBuffer(repositoryRoot, ['ls-tree', '-r', '-z', commit, '--', requirement.path])
    ) || [];
    const committedPaths = committedEntries.map(entry => entry.path).sort(compareText);
    const unsafeEntry = committedEntries.find(entry => entry.mode !== '100644' && entry.mode !== '100755');
    const entrySetMatches = JSON.stringify(committedPaths) === JSON.stringify(requirement.filePaths);
    const matches = rootMode === '040000' && !unsafeEntry && entrySetMatches;
    const reason = rootMode !== '040000'
      ? `Git mode ${rootMode || 'missing'} is not a committed directory`
      : unsafeEntry
        ? `directory contains non-regular Git mode ${unsafeEntry.mode} at ${unsafeEntry.path}`
        : !entrySetMatches
          ? 'working directory file set differs from the committed recursive tree'
          : null;
    return {
      path: requirement.path,
      rootMode,
      fileCount: requirement.filePaths.length,
      committedFileCount: committedPaths.length,
      matches,
      reason
    };
  });
  const verificationRows = [
    ...fileResults.map(result => (
      `file\t${result.path}\t${result.currentSha256}\t${result.committedSha256 || 'missing'}\t` +
      `${result.treeMode || 'missing'}\t${objectFormat || 'unknown'}\t${result.expectedObjectId || 'missing'}\t` +
      `${result.computedObjectId || 'unavailable'}\t${result.attributesVerified ? 'attributes-verified' : 'attributes-unavailable'}\t` +
      `${result.filterName == null ? 'plain' : `filter:${result.filterName}`}\t` +
      `${result.matches ? 'match' : 'mismatch'}`
    )),
    ...directoryResults.map(result => (
      `directory\t${result.path}\t${result.rootMode || 'missing'}\t${result.fileCount}\t` +
      `${result.committedFileCount}\t${result.matches ? 'match' : 'mismatch'}`
    ))
  ];
  const mismatches = [
    ...fileResults.filter(result => !result.matches),
    ...directoryResults.filter(result => !result.matches)
  ];
  return {
    inputCount: fileResults.length,
    matchedInputCount: fileResults.filter(result => result.matches).length,
    directorySourceCount: directoryResults.length,
    matchedDirectorySourceCount: directoryResults.filter(result => result.matches).length,
    inputsMatchCommit: mismatches.length === 0,
    inputVerificationSha256: sha256(Buffer.from(verificationRows.join('\n'), 'utf8')),
    mismatches
  };
}

function resolveIndexFlags(repositoryRoot) {
  const output = gitBuffer(repositoryRoot, ['ls-files', '-v', '-z']);
  if (output == null) return null;
  const records = output.toString('utf8').split('\0').filter(Boolean);
  const flagged = records.filter(record => {
    const tag = record[0] || '';
    return tag === 'S' || tag === 's' || /^[a-z]$/u.test(tag);
  });
  return {
    flagged,
    flaggedEntryCount: flagged.length,
    flagsSha256: sha256(Buffer.from(flagged.sort(compareText).join('\n'), 'utf8'))
  };
}

function resolveSourceState(repositoryRoot, environment, commit, rawInputSnapshots, directoryRequirements) {
  const requireClean = requiredCleanSource(environment);
  const inputSnapshots = normalizeInputSnapshots(rawInputSnapshots);
  const topLevel = gitOutput(repositoryRoot, ['rev-parse', '--show-toplevel']);
  const head = gitOutput(repositoryRoot, ['rev-parse', 'HEAD']);
  const objectFormatValue = gitOutput(repositoryRoot, ['rev-parse', '--show-object-format']);
  const gitObjectFormat = /^(?:sha1|sha256)$/u.test(objectFormatValue || '') ? objectFormatValue : null;
  const fsckConfigurationBefore = topLevel == null
    ? null
    : repositoryFsckConfigurationIsIsolated(repositoryRoot);
  const fsckSucceeded = fsckConfigurationBefore === true && gitObjectFormat != null && gitSucceeds(repositoryRoot, [
      'fsck',
      '--strict',
      '--no-dangling',
      '--no-reflogs',
      commit
    ]);
  const fsckConfigurationAfter = fsckSucceeded
    ? repositoryFsckConfigurationIsIsolated(repositoryRoot)
    : fsckConfigurationBefore;
  const fsckConfigurationIsolated = fsckConfigurationBefore == null
    ? null
    : fsckConfigurationBefore === true && fsckConfigurationAfter === true;
  const objectDatabaseVerified = fsckSucceeded && fsckConfigurationIsolated;
  const attributesIsolatedBeforeVerification = repositoryAttributesAreIsolated(repositoryRoot);
  const trackedTreeFilterVerification = verifyTrackedTreeFilters(
    repositoryRoot,
    commit,
    attributesIsolatedBeforeVerification
  );
  const indexFlags = resolveIndexFlags(repositoryRoot);
  const status = gitOutput(repositoryRoot, [
    '-c',
    'core.fsmonitor=false',
    '-c',
    'core.ignoreStat=false',
    '-c',
    'core.attributesFile=',
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--ignore-submodules=none',
    '--',
    '.'
  ]);

  if (requireClean && gitObjectFormat == null) {
    throw stageError('Git object format is unavailable or unsupported; expected sha1 or sha256');
  }
  if (requireClean && !fsckConfigurationIsolated) {
    throw stageError('Git fsck configuration overrides are not allowed during clean staging');
  }
  if (requireClean && !objectDatabaseVerified) {
    throw stageError(`Git object database failed integrity validation for advertised commit ${commit}`);
  }
  if (requireClean && attributesIsolatedBeforeVerification !== true) {
    throw stageError('repository-local Git attribute overrides are not allowed during clean staging');
  }
  if (requireClean && !trackedTreeFilterVerification.trackedTreeFiltersVerified) {
    throw stageError('Git filter attributes could not be verified across the advertised tracked tree');
  }
  if (requireClean && trackedTreeFilterVerification.trackedTreeFilterAttributeCount !== 0) {
    const first = trackedTreeFilterVerification.filters[0];
    throw stageError(
      `Git filter attribute ${first?.value || '(empty)'} is not supported by deterministic staging ` +
      `anywhere in the tracked tree (${first?.path || 'unknown path'})`
    );
  }

  if (topLevel == null || head == null || indexFlags == null || status == null) {
    if (requireClean) {
      throw stageError('a clean git source tree is required, but repository state is unavailable');
    }
    return {
      kind: 'unavailable',
      clean: null,
      requiredClean: false,
      repositoryTopLevel: null,
      repositoryRootMatchesTopLevel: null,
      gitObjectFormat,
      objectDatabaseVerified,
      repositoryFsckConfigurationIsolated: fsckConfigurationIsolated,
      repositoryAttributesIsolated: attributesIsolatedBeforeVerification,
      trackedTreeEntryCount: trackedTreeFilterVerification.trackedTreeEntryCount,
      trackedTreeFilterAttributeCount: trackedTreeFilterVerification.trackedTreeFilterAttributeCount,
      trackedTreeFiltersVerified: trackedTreeFilterVerification.trackedTreeFiltersVerified,
      trackedTreeFilterAuditSha256: trackedTreeFilterVerification.trackedTreeFilterAuditSha256,
      head: null,
      commitMatchesHead: null,
      changedEntryCount: null,
      statusSha256: null,
      flaggedIndexEntryCount: null,
      indexFlagsSha256: null,
      inputCount: inputSnapshots.length,
      matchedInputCount: null,
      directorySourceCount: directoryRequirements.length,
      matchedDirectorySourceCount: null,
      inputsMatchCommit: null,
      inputVerificationSha256: null
    };
  }

  const resolvedTopLevel = path.resolve(topLevel);
  const rootMatchesTopLevel = process.platform === 'win32'
    ? caseFold(resolvedTopLevel) === caseFold(repositoryRoot)
    : resolvedTopLevel === repositoryRoot;
  if (!rootMatchesTopLevel) {
    throw stageError(
      `repository root must be the Git worktree top level; received ${repositoryRoot}, Git reports ${resolvedTopLevel}`
    );
  }

  const normalizedHead = head.toLowerCase();
  const expectedObjectIdLength = gitObjectFormat === 'sha256' ? 64 : 40;
  if (normalizedHead.length !== expectedObjectIdLength || commit.length !== expectedObjectIdLength) {
    throw stageError(
      `Git ${gitObjectFormat} object IDs must contain ${expectedObjectIdLength} hexadecimal characters`
    );
  }
  const entries = status === '' ? [] : status.split(/\r?\n/u);
  const clean = entries.length === 0 &&
    indexFlags.flaggedEntryCount === 0 &&
    trackedTreeFilterVerification.trackedTreeFiltersVerified &&
    trackedTreeFilterVerification.trackedTreeFilterAttributeCount === 0;
  const commitMatchesHead = normalizedHead === commit;
  if (requireClean && !clean) {
    throw stageError(
      'a clean git source tree is required; found ' +
      `${entries.length} changed entr${entries.length === 1 ? 'y' : 'ies'} and ` +
      `${indexFlags.flaggedEntryCount} assume-unchanged or skip-worktree index entr` +
      `${indexFlags.flaggedEntryCount === 1 ? 'y' : 'ies'}`
    );
  }
  if (requireClean && !commitMatchesHead) {
    throw stageError(`advertised commit ${commit} does not match checked-out HEAD ${normalizedHead}`);
  }
  const inputVerification = verifyInputsAtCommit(
    repositoryRoot,
    commit,
    inputSnapshots,
    directoryRequirements,
    gitObjectFormat,
    attributesIsolatedBeforeVerification
  );
  const attributesIsolatedAfterVerification = repositoryAttributesAreIsolated(repositoryRoot);
  const repositoryAttributesIsolated = attributesIsolatedBeforeVerification === true &&
    attributesIsolatedAfterVerification === true;
  if (requireClean && !repositoryAttributesIsolated) {
    throw stageError('repository-local Git attribute overrides changed during clean staging');
  }
  if (requireClean && !inputVerification.inputsMatchCommit) {
    const examples = inputVerification.mismatches
      .slice(0, 5)
      .map(item => `${item.path} (${item.reason})`)
      .join(', ');
    const remainder = inputVerification.mismatches.length > 5
      ? ` and ${inputVerification.mismatches.length - 5} more`
      : '';
    throw stageError(
      `${inputVerification.mismatches.length} release input${inputVerification.mismatches.length === 1 ? '' : 's'} ` +
      `${inputVerification.mismatches.length === 1 ? 'does' : 'do'} not match or cannot be published from ` +
      `advertised commit ${commit}: ` +
      `${examples}${remainder}`
    );
  }
  return {
    kind: 'git',
    clean,
    requiredClean: requireClean,
    repositoryTopLevel: '.',
    repositoryRootMatchesTopLevel: rootMatchesTopLevel,
    gitObjectFormat,
    objectDatabaseVerified,
    repositoryFsckConfigurationIsolated: fsckConfigurationIsolated,
    repositoryAttributesIsolated,
    trackedTreeEntryCount: trackedTreeFilterVerification.trackedTreeEntryCount,
    trackedTreeFilterAttributeCount: trackedTreeFilterVerification.trackedTreeFilterAttributeCount,
    trackedTreeFiltersVerified: trackedTreeFilterVerification.trackedTreeFiltersVerified,
    trackedTreeFilterAuditSha256: trackedTreeFilterVerification.trackedTreeFilterAuditSha256,
    head: normalizedHead,
    commitMatchesHead,
    changedEntryCount: entries.length,
    statusSha256: sha256(Buffer.from(status, 'utf8')),
    flaggedIndexEntryCount: indexFlags.flaggedEntryCount,
    indexFlagsSha256: indexFlags.flagsSha256,
    inputCount: inputVerification.inputCount,
    matchedInputCount: inputVerification.matchedInputCount,
    directorySourceCount: inputVerification.directorySourceCount,
    matchedDirectorySourceCount: inputVerification.matchedDirectorySourceCount,
    inputsMatchCommit: inputVerification.inputsMatchCommit && objectDatabaseVerified &&
      repositoryAttributesIsolated && trackedTreeFilterVerification.trackedTreeFiltersVerified &&
      trackedTreeFilterVerification.trackedTreeFilterAttributeCount === 0,
    inputVerificationSha256: inputVerification.inputVerificationSha256
  };
}

function resolvePublicationMode(environment) {
  const raw = environment.AI_TREE_STAGE_MODE;
  if (raw == null || String(raw).trim() === '' || String(raw).trim() === 'preview') return 'preview';
  if (String(raw).trim() === 'release') return 'release';
  throw stageError('AI_TREE_STAGE_MODE must be preview or release when set');
}

function requiredReleaseEnvironmentValue(environment, name) {
  const value = environment[name];
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw stageError(`${name} is required in release mode and must be an exact trimmed value`);
  }
  return value;
}

function npmVersionFromEnvironment(environment) {
  const userAgent = typeof environment.npm_config_user_agent === 'string' ? environment.npm_config_user_agent : '';
  const match = /(?:^|\s)npm\/([^\s]+)/u.exec(userAgent);
  return match ? match[1] : null;
}

async function buildReleaseMetadata(
  repositoryRoot,
  config,
  environment,
  configPath,
  configBytes,
  hydratedPlan,
  directoryRequirements
) {
  const packageAbsolute = resolveInside(repositoryRoot, config.metadata.packageFile, 'package metadata path');
  const lockAbsolute = resolveInside(repositoryRoot, config.metadata.packageLockFile, 'package-lock metadata path');
  const datasetAbsolute = resolveInside(repositoryRoot, config.metadata.datasetFile, 'dataset metadata path');
  const citationAbsolute = resolveInside(repositoryRoot, config.metadata.citationFile, 'citation metadata path');
  const changelogAbsolute = resolveInside(repositoryRoot, config.metadata.changelogFile, 'changelog metadata path');
  await assertPathComponentsAreSafe(repositoryRoot, config.metadata.packageFile, 'metadata.packageFile');
  await assertPathComponentsAreSafe(repositoryRoot, config.metadata.packageLockFile, 'metadata.packageLockFile');
  await assertPathComponentsAreSafe(repositoryRoot, config.metadata.datasetFile, 'metadata.datasetFile');
  await assertPathComponentsAreSafe(repositoryRoot, config.metadata.citationFile, 'metadata.citationFile');
  await assertPathComponentsAreSafe(repositoryRoot, config.metadata.changelogFile, 'metadata.changelogFile');
  await assertPathComponentsAreSafe(repositoryRoot, config.metadata.releaseFile, 'metadata.releaseFile');

  const packageFile = await readJsonFile(packageAbsolute, 'package metadata');
  const packageLockFile = await readJsonFile(lockAbsolute, 'package-lock metadata');
  const datasetFile = await readJsonFile(datasetAbsolute, 'dataset metadata');
  const citationBytes = await readMetadataFile(citationAbsolute, 'citation metadata');
  const changelogBytes = await readMetadataFile(changelogAbsolute, 'changelog metadata');
  const publicationMode = resolvePublicationMode(environment);
  const releaseFile = await loadReleaseSpec(repositoryRoot, config.metadata.releaseFile, {
    requireReady: publicationMode === 'release'
  });
  const packageDocument = packageFile.document;
  const packageLockDocument = packageLockFile.document;
  const datasetDocument = datasetFile.document;
  const { version, edition, releaseState } = validateReleaseIdentity({
    packageDocument,
    packageLockDocument,
    datasetDocument,
    citationBytes,
    changelogBytes,
    releaseSpec: releaseFile.spec
  });
  const generatorVersion = assertNonEmptyString(datasetDocument.generatorVersion, 'dataset generatorVersion');
  const dataDigest = datasetDocument.dataset?.dataDigest ?? null;
  if (dataDigest !== null && !/^[0-9a-f]{64}$/iu.test(dataDigest)) {
    throw stageError('dataset dataDigest must be a SHA-256 hexadecimal digest when present');
  }
  const commit = resolveCommit(repositoryRoot, environment);
  const inputSnapshots = [
    { path: configPath, bytes: configBytes },
    { path: config.metadata.packageFile, bytes: packageFile.bytes },
    { path: config.metadata.packageLockFile, bytes: packageLockFile.bytes },
    { path: config.metadata.datasetFile, bytes: datasetFile.bytes },
    { path: config.metadata.citationFile, bytes: citationBytes },
    { path: config.metadata.changelogFile, bytes: changelogBytes },
    { path: config.metadata.releaseFile, bytes: releaseFile.bytes },
    ...hydratedPlan
      .filter(item => item.sourceRelative !== null)
      .map(item => ({ path: item.sourceRelative, bytes: item.bytes }))
  ];
  const sourceState = resolveSourceState(
    repositoryRoot,
    environment,
    commit,
    inputSnapshots,
    directoryRequirements
  );
  let tag = null;
  let promotion = null;
  if (publicationMode === 'release') {
    if (!requiredCleanSource(environment)) {
      throw stageError('release mode requires AI_TREE_REQUIRE_CLEAN=true');
    }
    if (releaseFile.spec.releaseState !== releaseState) {
      throw stageError(
        `release specification state ${releaseFile.spec.releaseState} does not match dataset state ${releaseState}`
      );
    }
    const requestedCommit = requiredReleaseEnvironmentValue(environment, 'AI_TREE_COMMIT_SHA');
    const requestedSpecPath = requiredReleaseEnvironmentValue(environment, 'AI_TREE_RELEASE_SPEC_PATH');
    const requestedTag = requiredReleaseEnvironmentValue(environment, 'AI_TREE_RELEASE_TAG');
    const protectedMainRef = requiredReleaseEnvironmentValue(environment, 'AI_TREE_PROTECTED_MAIN_REF');
    if (requestedCommit !== commit) {
      throw stageError('AI_TREE_COMMIT_SHA must equal the resolved release commit');
    }
    if (requestedSpecPath !== config.metadata.releaseFile) {
      throw stageError(`AI_TREE_RELEASE_SPEC_PATH must be exactly ${config.metadata.releaseFile}`);
    }
    if (requestedTag !== releaseFile.spec.tag) {
      throw stageError(`AI_TREE_RELEASE_TAG must be exactly ${releaseFile.spec.tag}`);
    }
    if (protectedMainRef !== releaseSpecConstants.policy.protectedMainRef) {
      throw stageError(
        `AI_TREE_PROTECTED_MAIN_REF must be exactly ${releaseSpecConstants.policy.protectedMainRef}`
      );
    }
    const verifiedRef = await verifyReleaseRef({
      repositoryRoot,
      tag: requestedTag,
      protectedMainRef,
      expectedVersion: version,
      expectedReleaseDate: releaseFile.spec.releaseDate,
      expectedCommit: commit
    });
    promotion = Object.freeze({ releaseDate: releaseFile.spec.releaseDate, tag: requestedTag, ...verifiedRef });
    tag = requestedTag;
  }
  return {
    edition,
    version,
    releaseState,
    commit,
    publicationMode,
    releaseSpec: Object.freeze({
      path: releaseFile.path,
      sha256: sha256(releaseFile.bytes),
      ...releaseFile.spec
    }),
    tag,
    promotion,
    sourceState,
    generatorVersion,
    dataDigest: dataDigest?.toLowerCase() || null,
    toolchain: {
      node: process.version,
      npm: npmVersionFromEnvironment(environment),
      packageLockVersion: packageLockDocument.lockfileVersion ?? null,
      releaseRef: releaseRefConstants.scriptVersion,
      stageSite: SCRIPT_VERSION
    }
  };
}

function buildReleaseManifest(config, metadata, hydratedPlan, configPath, configSha256) {
  const files = hydratedPlan.map(item => ({
    path: item.target,
    mediaType: item.mediaType,
    bytes: item.bytes.byteLength,
    sha256: item.sha256
  }));
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  return {
    schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION,
    stageConfigVersion: config.schemaVersion,
    stageConfig: {
      path: configPath,
      sha256: configSha256
    },
    edition: metadata.edition,
    version: metadata.version,
    releaseState: metadata.releaseState,
    commit: metadata.commit,
    publicationMode: metadata.publicationMode,
    releaseSpec: metadata.releaseSpec,
    tag: metadata.tag,
    promotion: metadata.promotion,
    sourceState: metadata.sourceState,
    generatorVersion: metadata.generatorVersion,
    dataDigest: metadata.dataDigest,
    toolchain: metadata.toolchain,
    manifest: {
      path: config.releaseManifest,
      selfHashExcluded: true,
      filesCoverage: 'all-payload-files',
      filesExcluded: [config.releaseManifest]
    },
    fileCount: files.length,
    totalBytes,
    files
  };
}

async function inspectOutputForSafeReplacement(outputAbsolute) {
  let outputStat;
  try {
    outputStat = await lstat(outputAbsolute);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw stageError(`cannot inspect existing ${REQUIRED_OUTPUT_DIRECTORY}: ${error.message}`);
  }
  if (outputStat.isSymbolicLink()) {
    throw stageError(`${REQUIRED_OUTPUT_DIRECTORY} is a symbolic link or junction and will not be replaced`);
  }
  if (!outputStat.isDirectory()) {
    throw stageError(`${REQUIRED_OUTPUT_DIRECTORY} exists but is not a directory`);
  }

  async function rejectLinks(directoryAbsolute, relative = REQUIRED_OUTPUT_DIRECTORY) {
    const entries = await readdir(directoryAbsolute, { withFileTypes: true });
    for (const entry of entries) {
      const childRelative = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        throw stageError(`${REQUIRED_OUTPUT_DIRECTORY} contains a symbolic link or junction: ${childRelative}`);
      }
      if (entry.isDirectory()) await rejectLinks(path.join(directoryAbsolute, entry.name), childRelative);
    }
  }
  await rejectLinks(outputAbsolute);
  return true;
}

async function writeStagedTree(repositoryRoot, config, hydratedPlan, manifest) {
  const outputAbsolute = resolveInside(repositoryRoot, config.outputDirectory, 'output directory');
  const outputExists = await inspectOutputForSafeReplacement(outputAbsolute);

  const temporaryParent = await mkdtemp(path.join(repositoryRoot, '.stage-site-'));
  const temporaryOutput = path.join(temporaryParent, REQUIRED_OUTPUT_DIRECTORY);
  const backupOutput = path.join(temporaryParent, 'previous-site');
  let preserveTemporaryParent = false;
  try {
    await mkdir(temporaryOutput, { recursive: false });
    for (const item of hydratedPlan) {
      const destination = resolveInside(temporaryOutput, item.target, 'staged target');
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, item.bytes, { flag: 'wx' });
    }
    const manifestDestination = resolveInside(temporaryOutput, config.releaseManifest, 'release manifest target');
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeFile(manifestDestination, manifestText, { encoding: 'utf8', flag: 'wx' });

    if (outputExists) await rename(outputAbsolute, backupOutput);
    try {
      await rename(temporaryOutput, outputAbsolute);
    } catch (publishError) {
      if (outputExists) {
        try {
          await rename(backupOutput, outputAbsolute);
        } catch (restoreError) {
          preserveTemporaryParent = true;
          throw stageError(
            `cannot publish the new staged tree (${publishError.message}) or restore the previous tree ` +
            `(${restoreError.message}); recovery copy retained at ${path.relative(repositoryRoot, backupOutput).replaceAll(path.sep, '/')}`
          );
        }
      }
      throw stageError(`cannot publish the new staged tree: ${publishError.message}`);
    }
    if (outputExists) await rm(backupOutput, { recursive: true, force: true });
  } finally {
    if (!preserveTemporaryParent) await rm(temporaryParent, { recursive: true, force: true });
  }
  return outputAbsolute;
}

export async function stageSite({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  configPath = DEFAULT_CONFIG_PATH,
  environment = process.env,
  checkOnly = false
} = {}) {
  const requestedRoot = path.resolve(repositoryRoot);
  let resolvedRoot;
  try {
    resolvedRoot = await realpath(requestedRoot);
  } catch (error) {
    throw stageError(`repository root is unavailable: ${error.message}`);
  }
  normalizeManifestPath(configPath, 'config path');
  assertPermittedRepositoryInputPath(configPath, 'config path');
  await assertPathComponentsAreSafe(resolvedRoot, configPath, 'config path');
  const configAbsolute = resolveInside(resolvedRoot, configPath, 'config path');
  const configFile = await readJsonFile(configAbsolute, 'stage configuration');
  const config = validateStageConfig(configFile.document);
  const { plan, directoryRequirements } = await collectCopyPlan(resolvedRoot, config);
  const hydratedPlan = await hydratePlan(plan);
  const metadata = await buildReleaseMetadata(
    resolvedRoot,
    config,
    environment,
    configPath,
    configFile.bytes,
    hydratedPlan,
    directoryRequirements
  );
  const manifest = buildReleaseManifest(config, metadata, hydratedPlan, configPath, sha256(configFile.bytes));

  const outputAbsolute = checkOnly
    ? resolveInside(resolvedRoot, config.outputDirectory, 'output directory')
    : await writeStagedTree(resolvedRoot, config, hydratedPlan, manifest);

  return {
    status: checkOnly ? 'VALID' : 'STAGED',
    repositoryRoot: resolvedRoot,
    config: configPath,
    outputDirectory: outputAbsolute,
    releaseManifest: path.join(outputAbsolute, config.releaseManifest),
    fileCount: manifest.fileCount,
    totalBytes: manifest.totalBytes,
    manifest
  };
}

function usage() {
  return [
    'Usage: node scripts/stage-site.mjs [--config <repo-relative-path>] [--check]',
    '',
    `Default config: ${DEFAULT_CONFIG_PATH}`,
    `Output: ${REQUIRED_OUTPUT_DIRECTORY}/ (always repository-local)`,
    '',
    '--check validates and hashes all inputs without changing the output directory.'
  ].join('\n');
}

function parseArguments(argumentsList) {
  let configPath = DEFAULT_CONFIG_PATH;
  let checkOnly = false;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--help' || argument === '-h') return { help: true, configPath, checkOnly };
    if (argument === '--check') {
      checkOnly = true;
      continue;
    }
    if (argument === '--config') {
      index += 1;
      if (index >= argumentsList.length) throw stageError('--config requires a path');
      configPath = argumentsList[index];
      continue;
    }
    throw stageError(`unknown argument: ${argument}`);
  }
  return { help: false, configPath, checkOnly };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await stageSite({ configPath: options.configPath, checkOnly: options.checkOnly });
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    config: result.config,
    outputDirectory: path.relative(result.repositoryRoot, result.outputDirectory).replaceAll(path.sep, '/'),
    releaseManifest: path.relative(result.repositoryRoot, result.releaseManifest).replaceAll(path.sep, '/'),
    fileCount: result.fileCount,
    totalBytes: result.totalBytes,
    commit: result.manifest.commit,
    publicationMode: result.manifest.publicationMode,
    tag: result.manifest.tag,
    promotion: result.manifest.promotion,
    sourceState: result.manifest.sourceState,
    dataDigest: result.manifest.dataDigest
  }, null, 2)}\n`);
}

const executedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (executedPath === import.meta.url) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export const stageSiteConstants = Object.freeze({
  configSchemaVersion: CONFIG_SCHEMA_VERSION,
  defaultConfigPath: DEFAULT_CONFIG_PATH,
  outputDirectory: REQUIRED_OUTPUT_DIRECTORY,
  releaseManifestSchemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION,
  scriptVersion: SCRIPT_VERSION
});
