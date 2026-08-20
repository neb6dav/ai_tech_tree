import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseStrictJson } from './strict-json.mjs';

const SCHEMA_VERSION = '1.0.0';
const RELEASE_POLICY = Object.freeze({
  defaultBranch: 'main',
  productionBaseUrl: 'https://neb6dav.github.io/ai_tech_tree/',
  productionEnvironment: 'github-pages',
  protectedMainRef: 'refs/remotes/origin/main',
  releaseState: 'Public beta'
});
const RELEASE_SPEC_KEYS = Object.freeze([
  'assetStem',
  'defaultBranch',
  'edition',
  'prerelease',
  'productionBaseUrl',
  'productionEnvironment',
  'protectedMainRef',
  'releaseDate',
  'releaseState',
  'schemaVersion',
  'status',
  'tag',
  'version'
]);

function specError(message) {
  return new Error(`release-spec: ${message}`);
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw specError(`${label} must be an object`);
  }
}

function assertOnlyKeys(value, allowedKeys, label) {
  assertObject(value, label);
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).filter(key => !allowed.has(key)).sort();
  if (unknown.length > 0) throw specError(`${label} has unsupported keys: ${unknown.join(', ')}`);
}

function assertString(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw specError(`${label} must be a non-empty, trimmed string without control characters`);
  }
  return value;
}

function assertIsoDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw specError(`${label} must use YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw specError(`${label} is not a valid calendar date`);
  }
  return value;
}

function normalizeRelativePath(value, label) {
  assertString(value, label);
  if (value.includes('\\') || path.posix.isAbsolute(value) || /^[A-Za-z]:/u.test(value)) {
    throw specError(`${label} must be a repository-relative path using forward slashes`);
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    value === '.' ||
    value.endsWith('/') ||
    value.split('/').some(segment => segment === '' || segment === '.' || segment === '..')
  ) {
    throw specError(`${label} must be a canonical repository-relative path`);
  }
  for (const segment of value.split('/')) {
    if (!/^[A-Za-z0-9._~-]+$/u.test(segment) || segment.endsWith('.')) {
      throw specError(`${label} contains a non-portable path segment: ${segment}`);
    }
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment)) {
      throw specError(`${label} contains a Windows-reserved device name: ${segment}`);
    }
  }
  return value;
}

export function validateReleaseSpec(document, { requireReady = false } = {}) {
  assertOnlyKeys(document, RELEASE_SPEC_KEYS, 'release specification');
  if (document.schemaVersion !== SCHEMA_VERSION) {
    throw specError(`schemaVersion must be ${SCHEMA_VERSION}`);
  }
  if (document.status !== 'planned' && document.status !== 'ready') {
    throw specError('status must be planned or ready');
  }
  const version = assertString(document.version, 'version');
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(version)) {
    throw specError('version must be a stable three-part semantic version');
  }
  const tag = assertString(document.tag, 'tag');
  if (tag !== `v${version}`) throw specError(`tag must be exactly v${version}`);
  const edition = assertString(document.edition, 'edition');
  const editionDate = edition.slice(0, 10);
  assertIsoDate(editionDate, 'edition date prefix');
  if (edition[10] !== '-') throw specError('edition must begin with YYYY-MM-DD-');
  const releaseState = assertString(document.releaseState, 'releaseState');
  if (/development/iu.test(releaseState)) {
    throw specError('releaseState describes the intended stable release and cannot be developmental');
  }
  if (releaseState !== RELEASE_POLICY.releaseState) {
    throw specError(`releaseState must be exactly ${RELEASE_POLICY.releaseState}`);
  }
  const defaultBranch = assertString(document.defaultBranch, 'defaultBranch');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9._-])?$/u.test(defaultBranch) || defaultBranch.includes('..')) {
    throw specError('defaultBranch contains unsupported characters');
  }
  if (defaultBranch !== RELEASE_POLICY.defaultBranch) {
    throw specError(`defaultBranch must be exactly ${RELEASE_POLICY.defaultBranch}`);
  }
  const protectedMainRef = assertString(document.protectedMainRef, 'protectedMainRef');
  if (protectedMainRef !== `refs/remotes/origin/${defaultBranch}`) {
    throw specError('protectedMainRef must identify origin/<defaultBranch>');
  }
  if (protectedMainRef !== RELEASE_POLICY.protectedMainRef) {
    throw specError(`protectedMainRef must be exactly ${RELEASE_POLICY.protectedMainRef}`);
  }
  const productionEnvironment = assertString(document.productionEnvironment, 'productionEnvironment');
  if (!/^[A-Za-z0-9._-]+$/u.test(productionEnvironment)) {
    throw specError('productionEnvironment contains unsupported characters');
  }
  if (productionEnvironment !== RELEASE_POLICY.productionEnvironment) {
    throw specError(`productionEnvironment must be exactly ${RELEASE_POLICY.productionEnvironment}`);
  }
  const assetStem = assertString(document.assetStem, 'assetStem');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(assetStem)) {
    throw specError('assetStem must be a portable filename stem');
  }
  if (document.prerelease !== true) throw specError('prerelease must be exactly true for v0.1.1');

  let productionBaseUrl;
  try {
    productionBaseUrl = new URL(assertString(document.productionBaseUrl, 'productionBaseUrl'));
  } catch (error) {
    throw specError(`productionBaseUrl must be an absolute URL: ${error.message}`);
  }
  if (
    productionBaseUrl.protocol !== 'https:' ||
    productionBaseUrl.username !== '' ||
    productionBaseUrl.password !== '' ||
    productionBaseUrl.search !== '' ||
    productionBaseUrl.hash !== '' ||
    !productionBaseUrl.pathname.endsWith('/')
  ) {
    throw specError('productionBaseUrl must be a credential-free HTTPS directory URL without query or fragment');
  }
  if (productionBaseUrl.href !== RELEASE_POLICY.productionBaseUrl) {
    throw specError(`productionBaseUrl must be exactly ${RELEASE_POLICY.productionBaseUrl}`);
  }

  if (document.status === 'planned') {
    if (document.releaseDate !== null) throw specError('planned releases must have releaseDate null');
  } else {
    assertIsoDate(document.releaseDate, 'releaseDate');
  }
  if (requireReady && document.status !== 'ready') {
    throw specError('release specification is planned, not ready');
  }

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    status: document.status,
    tag,
    version,
    edition,
    releaseDate: document.releaseDate,
    releaseState,
    defaultBranch,
    protectedMainRef,
    productionEnvironment,
    productionBaseUrl: productionBaseUrl.href,
    prerelease: document.prerelease,
    assetStem
  });
}

export async function loadReleaseSpec(repositoryRoot, relativePath, options = {}) {
  const normalizedPath = normalizeRelativePath(relativePath, 'release specification path');
  const absoluteRoot = path.resolve(repositoryRoot);
  const absolutePath = path.resolve(absoluteRoot, ...normalizedPath.split('/'));
  const relative = path.relative(absoluteRoot, absolutePath);
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw specError('release specification path escapes the repository root');
  }
  let bytes;
  try {
    bytes = await readFile(absolutePath);
  } catch (error) {
    throw specError(`cannot read ${normalizedPath}: ${error.message}`);
  }
  const document = parseStrictJson(bytes, normalizedPath);
  return {
    path: normalizedPath,
    bytes,
    spec: validateReleaseSpec(document, options)
  };
}

export const releaseSpecConstants = Object.freeze({
  policy: RELEASE_POLICY,
  schemaVersion: SCHEMA_VERSION
});
