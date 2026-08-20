import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseStrictJson } from './strict-json.mjs';

const SCRIPT_VERSION = '1.0.0';
const REPORT_SCHEMA_VERSION = '1.0.0';
const PRODUCTION_BASE_URL = 'https://neb6dav.github.io/ai_tech_tree/';
const MANIFEST_PATH = 'release-manifest.json';
const DEPLOYMENT_CONTROL_PATH = '.nojekyll';
const DEFAULT_DEADLINE_MS = 12 * 60 * 1000;
const DEFAULT_RETRY_DELAY_MS = 15 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 20 * 1000;
const MAX_WAIT_MS = 60 * 1000;
const DEFAULT_CONCURRENCY = 4;
const MANIFEST_BYTE_CAP = 4 * 1024 * 1024;
const MAX_MANIFEST_FILES = 64;
const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_PAYLOAD_BYTES = 64 * 1024 * 1024;
const MAX_MANIFEST_PATH_BYTES = 512;
const MAX_PUBLIC_URL_BYTES = 2048;
const MAX_PLANNED_TRANSFER_BYTES = 32 * 1024 * 1024;
const NOT_FOUND_BYTE_CAP = 64 * 1024;
const SENTINEL_PATH = '__ai-tree-release-smoke__-must-not-exist-7f4c48f8';
const REQUIRED_PAYLOADS = Object.freeze([
  'CITATION.cff',
  'ai-research-tech-tree.html',
  'ai-research-tech-tree.json',
  'ai-research-tech-tree.jsonld',
  'ai-research-tech-tree.ndjson',
  'data/opportunities/diffusion-models.alpha.json',
  'data/opportunities/opportunity-map.schema.json',
  'index.html',
  'robots.txt',
  'sitemap.xml',
  'social-card.png'
]);
const REPRESENTATIVE_NODE_IDS = Object.freeze(['alexnet', 'diffusion']);
const REPRESENTATIVE_OPPORTUNITY_STATES = Object.freeze([
  'view=opportunity&opportunity=diffusion-models-opportunity-map&opp=a01&oppBand=branch-a01',
  'view=opportunity&opportunity=diffusion-models-opportunity-map&opp=opp01&oppPanel=1&oppBand=branch-a01'
]);
const KNOWN_MANIFEST_IDENTITY = Object.freeze({
  schemaVersion: '1.4.0',
  stageConfigVersion: '1.1.0',
  stageConfigPath: 'config/pages-stage.v1.json',
  generatorVersion: '1.3.1',
  releaseRefVersion: '1.0.0',
  stageSiteVersion: '1.4.0'
});
const HEX_256 = /^[0-9a-f]{64}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const TAG = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const PORTABLE_PATH = /^(?:\.?[A-Za-z0-9][A-Za-z0-9._-]*)(?:\/(?:\.?[A-Za-z0-9][A-Za-z0-9._-]*))*$/u;

class SmokeError extends Error {
  constructor(message, { retryable = false } = {}) {
    super(`post-deploy-smoke: ${message}`);
    this.name = 'PostDeploySmokeError';
    this.retryable = retryable;
  }
}

function fail(message, options) {
  throw new SmokeError(message, options);
}

export function classifyNetworkFailure(error) {
  const seen = new Set();
  let current = error;
  while (current != null && (typeof current === 'object' || typeof current === 'function') && !seen.has(current)) {
    seen.add(current);
    const code = typeof current.code === 'string' ? current.code.toUpperCase() : '';
    const message = typeof current.message === 'string' ? current.message : '';
    if (
      /^(?:ERR_TLS_|ERR_SSL_|CERT_|DEPTH_ZERO_SELF_SIGNED_CERT$|SELF_SIGNED_CERT_IN_CHAIN$|UNABLE_TO_(?:GET_ISSUER_CERT|GET_ISSUER_CERT_LOCALLY|VERIFY_LEAF_SIGNATURE)$|EPROTO$)/u.test(code) ||
      /(?:certificate (?:has expired|verify failed)|self[- ]signed certificate|unable to verify (?:the )?first certificate|hostname\/ip does not match certificate|wrong ssl version|wrong version number|tlsv1 alert protocol version|unsupported (?:ssl|tls) protocol|no protocols available)/iu.test(message)
    ) {
      return Object.freeze({ category: 'tls-certificate-or-protocol', retryable: false });
    }
    current = current.cause;
  }
  return Object.freeze({ category: 'transient-network', retryable: true });
}

function wrapNetworkFailure(error, url) {
  const classification = classifyNetworkFailure(error);
  return new SmokeError(
    `GET ${url} failed (${classification.category}): ${error?.message || String(error)}`,
    { retryable: classification.retryable }
  );
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertPlainObject(value, label) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    fail(`${label} must be a non-empty, trimmed string`);
  }
  return value;
}

function assertSafeInteger(value, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${label} must be a safe integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function assertOnlyKeys(document, keys, label) {
  const expected = [...keys].sort(compareText);
  const actual = Object.keys(document).sort(compareText);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} keys must be exactly: ${expected.join(', ')}`);
  }
}

function assertIsoDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) fail(`${label} must be an ISO calendar date`);
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    fail(`${label} must be a valid ISO calendar date`);
  }
  return value;
}

function assertExpectedInputs({ expectedManifestBytes, expectedManifestSha256, expectedTag, expectedCommit }) {
  if (!Buffer.isBuffer(expectedManifestBytes)) {
    fail('expectedManifestBytes must be supplied as a Buffer');
  }
  if (expectedManifestBytes.byteLength > MANIFEST_BYTE_CAP) {
    fail(`expectedManifestBytes exceeds the ${MANIFEST_BYTE_CAP}-byte release-manifest cap`);
  }
  if (!HEX_256.test(expectedManifestSha256 || '')) {
    fail('expectedManifestSha256 must be an explicitly supplied lowercase SHA-256 digest');
  }
  const actual = sha256(expectedManifestBytes);
  if (actual !== expectedManifestSha256) {
    fail(`local release manifest SHA-256 ${actual} does not match explicitly supplied ${expectedManifestSha256}`);
  }
  if (!TAG.test(expectedTag || '')) fail('expectedTag must be a canonical vMAJOR.MINOR.PATCH tag');
  if (!OID.test(expectedCommit || '')) fail('expectedCommit must be a full lowercase Git object ID');
}

function validateManifestPath(rawPath, index) {
  const label = `release manifest files[${index}].path`;
  const value = assertNonEmptyString(rawPath, label);
  if (
    !PORTABLE_PATH.test(value) ||
    value.includes('\\') ||
    value.includes('//') ||
    value.includes('/./') ||
    value.includes('/../') ||
    value.startsWith('../') ||
    value.endsWith('/.') ||
    value.endsWith('/..') ||
    value.includes('%') ||
    value.includes('?') ||
    value.includes('#') ||
    value.normalize('NFC') !== value ||
    !/^[\x20-\x7e]+$/u.test(value)
  ) {
    fail(`${label} is not a canonical portable relative URL path`);
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_MANIFEST_PATH_BYTES) {
    fail(`${label} exceeds the ${MAX_MANIFEST_PATH_BYTES}-byte path budget`);
  }
  return value;
}

function mimePolicyForPath(filePath) {
  if (filePath === 'CITATION.cff') {
    return {
      machine: true,
      allowed: ['application/octet-stream', 'application/x-yaml', 'application/yaml', 'text/plain', 'text/x-yaml', 'text/yaml']
    };
  }
  if (filePath === 'robots.txt') return { machine: false, allowed: ['text/plain'] };
  if (filePath === 'sitemap.xml') return { machine: true, allowed: ['application/xml', 'text/xml'] };
  if (filePath.endsWith('.html')) return { machine: false, allowed: ['text/html'] };
  if (filePath.endsWith('.jsonld')) return { machine: true, allowed: ['application/ld+json'] };
  if (filePath.endsWith('.ndjson')) {
    return { machine: true, allowed: ['application/octet-stream', 'application/x-ndjson', 'application/ndjson'] };
  }
  if (filePath.endsWith('.json')) return { machine: true, allowed: ['application/json'] };
  if (filePath.endsWith('.png')) return { machine: false, allowed: ['image/png'] };
  fail(`release manifest path ${filePath} has no fixed public MIME policy`);
}

function validateReleaseIdentity(manifest, expectedTag, expectedCommit) {
  assertOnlyKeys(manifest, [
    'schemaVersion',
    'stageConfigVersion',
    'stageConfig',
    'edition',
    'version',
    'releaseState',
    'commit',
    'publicationMode',
    'releaseSpec',
    'tag',
    'promotion',
    'sourceState',
    'generatorVersion',
    'dataDigest',
    'toolchain',
    'manifest',
    'fileCount',
    'totalBytes',
    'files'
  ], 'release manifest top-level');
  if (manifest.schemaVersion !== KNOWN_MANIFEST_IDENTITY.schemaVersion) {
    fail(`release manifest schemaVersion must be exactly ${KNOWN_MANIFEST_IDENTITY.schemaVersion}`);
  }
  if (manifest.stageConfigVersion !== KNOWN_MANIFEST_IDENTITY.stageConfigVersion) {
    fail(`release manifest stageConfigVersion must be exactly ${KNOWN_MANIFEST_IDENTITY.stageConfigVersion}`);
  }
  const stageConfig = assertPlainObject(manifest.stageConfig, 'release manifest stageConfig');
  assertOnlyKeys(stageConfig, ['path', 'sha256'], 'release manifest stageConfig');
  if (stageConfig.path !== KNOWN_MANIFEST_IDENTITY.stageConfigPath || !HEX_256.test(stageConfig.sha256 || '')) {
    fail('release manifest stageConfig must bind the known configuration path and a lowercase SHA-256 digest');
  }
  if (manifest.generatorVersion !== KNOWN_MANIFEST_IDENTITY.generatorVersion) {
    fail(`release manifest generatorVersion must be exactly ${KNOWN_MANIFEST_IDENTITY.generatorVersion}`);
  }
  const toolchain = assertPlainObject(manifest.toolchain, 'release manifest toolchain');
  assertOnlyKeys(toolchain, ['node', 'npm', 'packageLockVersion', 'releaseRef', 'stageSite'], 'release manifest toolchain');
  if (toolchain.releaseRef !== KNOWN_MANIFEST_IDENTITY.releaseRefVersion) {
    fail(`release manifest toolchain.releaseRef must be exactly ${KNOWN_MANIFEST_IDENTITY.releaseRefVersion}`);
  }
  if (toolchain.stageSite !== KNOWN_MANIFEST_IDENTITY.stageSiteVersion) {
    fail(`release manifest toolchain.stageSite must be exactly ${KNOWN_MANIFEST_IDENTITY.stageSiteVersion}`);
  }
  if (toolchain.packageLockVersion !== 3 || !/^v24\.\d+\.\d+$/u.test(toolchain.node || '') || !/^11\.\d+\.\d+$/u.test(toolchain.npm || '')) {
    fail('release manifest toolchain must identify Node 24, npm 11, and package-lock v3');
  }
  if (manifest.publicationMode !== 'release') fail('release manifest publicationMode must be exactly release');
  if (manifest.tag !== expectedTag) fail(`release manifest tag must be exactly ${expectedTag}`);
  if (manifest.commit !== expectedCommit) fail(`release manifest commit must be exactly ${expectedCommit}`);
  const expectedVersion = expectedTag.slice(1);
  if (manifest.version !== expectedVersion) fail(`release manifest version must be exactly ${expectedVersion}`);
  const edition = assertNonEmptyString(manifest.edition, 'release manifest edition');
  const releaseState = assertNonEmptyString(manifest.releaseState, 'release manifest releaseState');
  assertIsoDate(edition.slice(0, 10), 'release manifest edition date prefix');
  if (edition[10] !== '-') fail('release manifest edition must begin with YYYY-MM-DD-');
  if (releaseState !== 'Public beta') fail('release manifest releaseState must be exactly Public beta');
  if (!HEX_256.test(manifest.dataDigest || '')) fail('release manifest dataDigest must be a lowercase SHA-256 digest');

  const spec = assertPlainObject(manifest.releaseSpec, 'release manifest releaseSpec');
  assertOnlyKeys(spec, [
    'path',
    'sha256',
    'schemaVersion',
    'status',
    'tag',
    'version',
    'edition',
    'releaseDate',
    'releaseState',
    'defaultBranch',
    'protectedMainRef',
    'productionEnvironment',
    'productionBaseUrl',
    'prerelease',
    'assetStem'
  ], 'release manifest releaseSpec');
  if (spec.path !== `config/releases/${expectedTag}.json` || !HEX_256.test(spec.sha256 || '')) {
    fail('release manifest releaseSpec must bind the expected release file path and a lowercase SHA-256 digest');
  }
  if (spec.schemaVersion !== '1.0.0') fail('release manifest releaseSpec.schemaVersion must be exactly 1.0.0');
  if (spec.status !== 'ready') fail('release manifest releaseSpec.status must be exactly ready');
  if (spec.tag !== expectedTag) fail(`release specification tag must be exactly ${expectedTag}`);
  if (spec.version !== expectedVersion || spec.version !== manifest.version) {
    fail('release specification version must match the expected tag and top-level manifest version');
  }
  if (spec.edition !== edition) fail('release specification edition must match the top-level manifest edition');
  assertIsoDate(spec.releaseDate, 'release manifest releaseSpec.releaseDate');
  if (spec.releaseState !== releaseState) {
    fail('release specification releaseState must match the top-level manifest releaseState');
  }
  if (spec.defaultBranch !== 'main') fail('release specification defaultBranch must be exactly main');
  if (spec.productionBaseUrl !== PRODUCTION_BASE_URL) {
    fail(`release specification productionBaseUrl must be exactly ${PRODUCTION_BASE_URL}`);
  }
  if (spec.protectedMainRef !== 'refs/remotes/origin/main') {
    fail('release specification protectedMainRef must be exactly refs/remotes/origin/main');
  }
  if (spec.productionEnvironment !== 'github-pages') {
    fail('release specification productionEnvironment must be exactly github-pages');
  }
  if (spec.prerelease !== true) fail('release specification prerelease must be exactly true');
  if (spec.assetStem !== `ai-research-tech-tree-${expectedTag}`) {
    fail(`release specification assetStem must be exactly ai-research-tech-tree-${expectedTag}`);
  }

  const source = assertPlainObject(manifest.sourceState, 'release manifest sourceState');
  const requiredTrue = [
    'clean',
    'requiredClean',
    'repositoryRootMatchesTopLevel',
    'objectDatabaseVerified',
    'repositoryFsckConfigurationIsolated',
    'repositoryAttributesIsolated',
    'trackedTreeFiltersVerified',
    'commitMatchesHead',
    'inputsMatchCommit'
  ];
  if (source.kind !== 'git') fail('release manifest sourceState.kind must be exactly git');
  if (source.repositoryTopLevel !== '.') fail('release manifest sourceState.repositoryTopLevel must be exactly .');
  if (source.gitObjectFormat !== 'sha1' && source.gitObjectFormat !== 'sha256') {
    fail('release manifest sourceState.gitObjectFormat must be sha1 or sha256');
  }
  for (const key of requiredTrue) {
    if (source[key] !== true) fail(`release manifest sourceState.${key} must be exactly true`);
  }
  if (source.head !== expectedCommit) fail(`release manifest sourceState.head must be exactly ${expectedCommit}`);
  if ((source.gitObjectFormat === 'sha1' && expectedCommit.length !== 40) ||
      (source.gitObjectFormat === 'sha256' && expectedCommit.length !== 64)) {
    fail('release manifest expected commit length does not match sourceState.gitObjectFormat');
  }
  for (const key of ['changedEntryCount', 'flaggedIndexEntryCount', 'trackedTreeFilterAttributeCount']) {
    if (source[key] !== 0) fail(`release manifest sourceState.${key} must be exactly zero`);
  }
  for (const [count, matched] of [
    ['inputCount', 'matchedInputCount'],
    ['directorySourceCount', 'matchedDirectorySourceCount']
  ]) {
    assertSafeInteger(source[count], `release manifest sourceState.${count}`);
    assertSafeInteger(source[matched], `release manifest sourceState.${matched}`);
    if (source[count] !== source[matched]) {
      fail(`release manifest sourceState.${matched} must close the complete ${count} inventory`);
    }
  }
  if (source.inputCount < 1) fail('release manifest sourceState.inputCount must be positive');
  assertSafeInteger(source.trackedTreeEntryCount, 'release manifest sourceState.trackedTreeEntryCount', { minimum: 1 });
  for (const key of [
    'trackedTreeFilterAuditSha256',
    'statusSha256',
    'indexFlagsSha256',
    'inputVerificationSha256'
  ]) {
    if (!HEX_256.test(source[key] || '')) {
      fail(`release manifest sourceState.${key} must be a lowercase SHA-256 digest`);
    }
  }

  const promotion = assertPlainObject(manifest.promotion, 'release manifest promotion');
  if (promotion.mode !== 'annotated-tag') fail('release manifest promotion.mode must be exactly annotated-tag');
  if (promotion.releaseDate !== spec.releaseDate) {
    fail('release manifest promotion.releaseDate must match the ready release specification');
  }
  if (promotion.tag !== expectedTag || promotion.tagCommit !== expectedCommit) {
    fail('release manifest promotion must bind the expected annotated tag directly to the expected commit');
  }
  if (!OID.test(promotion.tagObject || '')) fail('release manifest promotion.tagObject must be a full Git object ID');
  if (promotion.protectedMainRef !== spec.protectedMainRef) {
    fail('release manifest promotion.protectedMainRef must match the release specification');
  }
  if (!OID.test(promotion.protectedMainCommit || '')) {
    fail('release manifest promotion.protectedMainCommit must be a full Git object ID');
  }
  if (promotion.reachableFromProtectedMain !== true) {
    fail('release manifest promotion.reachableFromProtectedMain must be exactly true');
  }
}

function validateInventory(manifest) {
  const descriptor = assertPlainObject(manifest.manifest, 'release manifest manifest descriptor');
  if (
    descriptor.path !== MANIFEST_PATH ||
    descriptor.selfHashExcluded !== true ||
    descriptor.filesCoverage !== 'all-payload-files' ||
    !Array.isArray(descriptor.filesExcluded) ||
    descriptor.filesExcluded.length !== 1 ||
    descriptor.filesExcluded[0] !== MANIFEST_PATH
  ) {
    fail('release manifest must declare exact all-payload coverage with only its own file excluded');
  }
  if (!Array.isArray(manifest.files)) fail('release manifest files must be an array');
  assertSafeInteger(manifest.fileCount, 'release manifest fileCount', { maximum: MAX_MANIFEST_FILES });
  assertSafeInteger(manifest.totalBytes, 'release manifest totalBytes', { maximum: MAX_TOTAL_PAYLOAD_BYTES });
  if (manifest.fileCount !== manifest.files.length) fail('release manifest fileCount does not match files length');

  const files = [];
  const exact = new Set();
  const folded = new Map();
  let totalBytes = 0;
  for (const [index, raw] of manifest.files.entries()) {
    const file = assertPlainObject(raw, `release manifest files[${index}]`);
    const filePath = validateManifestPath(file.path, index);
    if (filePath === MANIFEST_PATH) fail('release manifest cannot include itself in its payload files');
    if (exact.has(filePath)) fail(`release manifest repeats payload path ${filePath}`);
    const foldedPath = filePath.toLowerCase();
    if (folded.has(foldedPath)) {
      fail(`release manifest contains case-colliding paths ${folded.get(foldedPath)} and ${filePath}`);
    }
    for (const existing of exact) {
      if (existing.startsWith(`${filePath}/`) || filePath.startsWith(`${existing}/`)) {
        fail(`release manifest contains a file/directory path collision between ${existing} and ${filePath}`);
      }
    }
    exact.add(filePath);
    folded.set(foldedPath, filePath);
    const bytes = assertSafeInteger(file.bytes, `release manifest files[${index}].bytes`, { maximum: MAX_PAYLOAD_BYTES });
    if (!HEX_256.test(file.sha256 || '')) fail(`release manifest files[${index}].sha256 is invalid`);
    assertNonEmptyString(file.mediaType, `release manifest files[${index}].mediaType`);
    files.push({ path: filePath, bytes, sha256: file.sha256, mediaType: file.mediaType });
    totalBytes += bytes;
    if (!Number.isSafeInteger(totalBytes)) fail('release manifest total byte inventory exceeds the safe integer range');
  }
  const sortedPaths = [...exact].sort(compareText);
  if (manifest.files.some((file, index) => file.path !== sortedPaths[index])) {
    fail('release manifest payload paths must be strictly sorted');
  }
  if (totalBytes !== manifest.totalBytes) fail('release manifest totalBytes does not close the payload inventory');
  if (!exact.has(DEPLOYMENT_CONTROL_PATH)) fail('release manifest must classify .nojekyll as deployment control');
  for (const required of REQUIRED_PAYLOADS) {
    if (!exact.has(required)) fail(`release manifest is missing required public payload ${required}`);
  }
  return Object.freeze(files.map(file => {
    const policy = file.path === DEPLOYMENT_CONTROL_PATH ? null : mimePolicyForPath(file.path);
    if (policy != null) {
      const declared = parseContentType(file.mediaType, `release manifest mediaType for ${file.path}`);
      if (!policy.allowed.includes(declared.mediaType)) {
        fail(`release manifest mediaType for ${file.path} is outside its fixed MIME policy`);
      }
      validateTextualCharset(declared, { id: `manifest:${file.path}`, machine: policy.machine });
    }
    return Object.freeze({ ...file, policy });
  }));
}

function buildUrl(filePath) {
  const url = new URL(filePath, PRODUCTION_BASE_URL);
  if (url.origin !== new URL(PRODUCTION_BASE_URL).origin || !url.pathname.startsWith(new URL(PRODUCTION_BASE_URL).pathname)) {
    fail(`target path ${filePath} escapes the production publication root`);
  }
  if (Buffer.byteLength(url.href, 'utf8') > MAX_PUBLIC_URL_BYTES) {
    fail(`public URL for ${filePath} exceeds the ${MAX_PUBLIC_URL_BYTES}-byte URL budget`);
  }
  return url.href;
}

function assertPublicUrlBudget(url, label) {
  if (Buffer.byteLength(url, 'utf8') > MAX_PUBLIC_URL_BYTES) {
    fail(`${label} exceeds the ${MAX_PUBLIC_URL_BYTES}-byte URL budget`);
  }
  return url;
}

function publicTarget(file, { id = `payload:${file.path}`, kind = 'payload', url = buildUrl(file.path), requestUrl = url } = {}) {
  return Object.freeze({
    id,
    kind,
    path: file.path,
    url,
    requestUrl,
    expectedStatus: 200,
    expectedBytes: file.bytes,
    expectedSha256: file.sha256,
    allowedContentTypes: Object.freeze([...file.policy.allowed].sort(compareText)),
    machine: file.policy.machine
  });
}

export function planPostDeploySmoke(options = {}) {
  assertExpectedInputs(options);
  const manifest = parseStrictJson(options.expectedManifestBytes, 'local release-manifest.json');
  assertPlainObject(manifest, 'local release manifest');
  validateReleaseIdentity(manifest, options.expectedTag, options.expectedCommit);
  const files = validateInventory(manifest);
  const index = files.find(file => file.path === 'index.html');
  const compatibilityAlias = files.find(file => file.path === 'ai-research-tech-tree.html');
  const deploymentControl = files.find(file => file.path === DEPLOYMENT_CONTROL_PATH);
  const publicFiles = files.filter(file => file.path !== DEPLOYMENT_CONTROL_PATH);

  const manifestTarget = Object.freeze({
    id: 'manifest',
    kind: 'manifest',
    path: MANIFEST_PATH,
    url: buildUrl(MANIFEST_PATH),
    requestUrl: buildUrl(MANIFEST_PATH),
    expectedStatus: 200,
    expectedBytes: options.expectedManifestBytes.byteLength,
    expectedSha256: options.expectedManifestSha256,
    maxBytes: MANIFEST_BYTE_CAP,
    allowedContentTypes: Object.freeze(['application/json']),
    machine: true
  });
  const publicTargets = publicFiles.map(file => publicTarget(file));
  publicTargets.push(publicTarget(index, {
    id: 'root',
    kind: 'root',
    url: PRODUCTION_BASE_URL,
    requestUrl: PRODUCTION_BASE_URL
  }));
  publicTargets.sort((left, right) => compareText(left.id, right.id));
  const clientStateUrls = [
    ...REPRESENTATIVE_NODE_IDS.map(id => ({ id: `node:${id}`, kind: 'atlas-node', url: `${PRODUCTION_BASE_URL}#node=${id}` })),
    ...REPRESENTATIVE_OPPORTUNITY_STATES.map((state, indexValue) => ({
      id: `opportunity:${indexValue + 1}`,
      kind: 'opportunity-state',
      url: `${PRODUCTION_BASE_URL}#${state}`
    }))
  ].map(item => Object.freeze({
    ...item,
    url: assertPublicUrlBudget(item.url, `client-state URL ${item.id}`),
    requestUrl: PRODUCTION_BASE_URL,
    artifactPath: index.path,
    artifactSha256: index.sha256,
    artifactBound: true,
    clientStateVerified: false,
    networkRequest: false
  })).sort((left, right) => compareText(left.id, right.id));
  const representativeAlias = Object.freeze({
    id: 'compatibility-entry',
    kind: 'compatibility-alias',
    url: buildUrl(compatibilityAlias.path),
    requestUrl: buildUrl(compatibilityAlias.path),
    artifactPath: compatibilityAlias.path,
    artifactSha256: compatibilityAlias.sha256,
    artifactBound: true,
    serverArtifactVerified: false,
    networkTargetId: `payload:${compatibilityAlias.path}`
  });

  const probes = Object.freeze([
    Object.freeze({
      id: 'canonicalization:slashless-root',
      kind: 'canonicalization',
      url: PRODUCTION_BASE_URL.slice(0, -1),
      requestUrl: PRODUCTION_BASE_URL.slice(0, -1),
      expectedStatus: Object.freeze([301, 308]),
      expectedLocation: PRODUCTION_BASE_URL
    }),
    Object.freeze({
      id: 'sentinel:not-found',
      kind: 'not-found',
      url: buildUrl(SENTINEL_PATH),
      requestUrl: buildUrl(SENTINEL_PATH),
      expectedStatus: 404
    })
  ]);
  const plannedTransferBytes = (2 * options.expectedManifestBytes.byteLength) +
    publicTargets.reduce((total, target) => total + target.expectedBytes, 0) +
    (probes.length * NOT_FOUND_BYTE_CAP);
  if (plannedTransferBytes > MAX_PLANNED_TRANSFER_BYTES) {
    fail(`planned successful transfer ${plannedTransferBytes} exceeds the ${MAX_PLANNED_TRANSFER_BYTES}-byte budget`);
  }

  return Object.freeze({
    schemaVersion: REPORT_SCHEMA_VERSION,
    scriptVersion: SCRIPT_VERSION,
    mode: 'plan',
    baseUrl: PRODUCTION_BASE_URL,
    expectedManifestSha256: options.expectedManifestSha256,
    expectedTag: options.expectedTag,
    expectedCommit: options.expectedCommit,
    version: manifest.version,
    edition: manifest.edition,
    releaseState: manifest.releaseState,
    dataDigest: manifest.dataDigest,
    manifestTarget,
    deploymentControl: Object.freeze({
      path: deploymentControl.path,
      classification: 'deployment-control',
      publicRequest: false,
      expectedBytes: deploymentControl.bytes,
      expectedSha256: deploymentControl.sha256,
      rationale: 'GitHub Pages build-selection sentinel; not required to be publicly retrievable'
    }),
    targets: Object.freeze(publicTargets),
    probes,
    clientStateUrls: Object.freeze(clientStateUrls),
    representativeAlias,
    networkRequestCountPerAttempt: 2 + publicTargets.length + probes.length,
    plannedTransferBytes,
    plannedTransferBudgetBytes: MAX_PLANNED_TRANSFER_BYTES
  });
}

function normalizedHeaders(raw) {
  const values = new Map();
  if (raw == null) return values;
  if (typeof raw.entries === 'function') {
    for (const [name, value] of raw.entries()) values.set(String(name).toLowerCase(), String(value));
    return values;
  }
  for (const [name, value] of Object.entries(raw)) values.set(name.toLowerCase(), String(value));
  return values;
}

function parseContentType(raw, label) {
  const parts = String(raw || '').split(';');
  const mediaType = parts.shift().trim().toLowerCase();
  const parameters = new Map();
  for (const rawParameter of parts) {
    const parameter = rawParameter.trim();
    const separator = parameter.indexOf('=');
    if (separator <= 0) fail(`${label} has a malformed Content-Type parameter`);
    const name = parameter.slice(0, separator).trim().toLowerCase();
    let value = parameter.slice(separator + 1).trim();
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/u.test(name) || value === '') {
      fail(`${label} has a malformed Content-Type parameter`);
    }
    if (value.startsWith('"') || value.endsWith('"')) {
      if (!/^"[^"\\]*"$/u.test(value)) fail(`${label} has a malformed quoted Content-Type parameter`);
      value = value.slice(1, -1);
    }
    if (parameters.has(name)) fail(`${label} repeats Content-Type parameter ${name}`);
    parameters.set(name, value);
  }
  return { mediaType, parameters };
}

function validateTextualCharset(parsed, target) {
  const textual = target.machine || parsed.mediaType.startsWith('text/') ||
    /(?:\+json|\/json|\+xml|\/xml|yaml)$/u.test(parsed.mediaType);
  const charset = parsed.parameters.get('charset');
  if (textual && charset != null && charset.toLowerCase() !== 'utf-8') {
    fail(`response for ${target.id} declares non-UTF-8 charset ${charset}`);
  }
}

function validateResponseEnvelope(response, target) {
  assertPlainObject(response, `response for ${target.id}`);
  if (!Number.isInteger(response.status)) fail(`response for ${target.id} has no integer status`);
  if (response.url !== target.requestUrl) {
    fail(`response for ${target.id} changed origin or URL from ${target.requestUrl} to ${response.url || '(missing)'}`);
  }
  if (!Buffer.isBuffer(response.body)) fail(`response for ${target.id} must expose body as a Buffer`);
  return normalizedHeaders(response.headers);
}

function validateNoCompression(headers, target) {
  const contentEncoding = (headers.get('content-encoding') || '').trim().toLowerCase();
  if (contentEncoding !== '' && contentEncoding !== 'identity') {
    fail(`response for ${target.id} used forbidden content-encoding ${contentEncoding}`);
  }
}

function isRetryableHttpStatus(status) {
  return status === 404 || status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

function validateContentLength(headers, actualBytes, target, expectedBytes = null, retryableMismatch = false) {
  const raw = headers.get('content-length');
  if (raw == null) return;
  if (!/^(?:0|[1-9]\d*)$/u.test(raw)) fail(`response for ${target.id} has invalid Content-Length ${raw}`);
  const declared = Number(raw);
  if (!Number.isSafeInteger(declared)) fail(`response for ${target.id} has unsafe Content-Length ${raw}`);
  if (declared !== actualBytes) {
    fail(`response for ${target.id} Content-Length ${declared} does not match received ${actualBytes}`, {
      retryable: retryableMismatch
    });
  }
  if (expectedBytes != null && declared !== expectedBytes) {
    fail(`response for ${target.id} Content-Length ${declared} does not match expected ${expectedBytes}`, {
      retryable: retryableMismatch
    });
  }
}

function validateExactTargetResponse(response, target) {
  const headers = validateResponseEnvelope(response, target);
  if (response.status >= 300 && response.status < 400) fail(`response for ${target.id} attempted an HTTP redirect (${response.status})`);
  if (response.status === 401 || response.status === 403) {
    fail(`response for ${target.id} returned non-retryable authorization failure HTTP ${response.status}`);
  }
  if (response.status !== target.expectedStatus) {
    fail(`response for ${target.id} returned HTTP ${response.status}; expected ${target.expectedStatus}`, {
      retryable: isRetryableHttpStatus(response.status)
    });
  }
  validateNoCompression(headers, target);
  const byteCap = target.maxBytes ?? target.expectedBytes;
  if (response.body.byteLength > byteCap) {
    fail(`response for ${target.id} exceeded its ${byteCap}-byte cap`);
  }
  const propagationMismatch = target.kind === 'manifest';
  validateContentLength(headers, response.body.byteLength, target, target.expectedBytes, propagationMismatch);
  const parsedContentType = parseContentType(headers.get('content-type'), `response for ${target.id}`);
  const contentType = parsedContentType.mediaType;
  validateTextualCharset(parsedContentType, target);
  if (target.machine && contentType === 'text/html') fail(`machine payload ${target.id} was served as HTML`);
  if (!target.allowedContentTypes.includes(contentType)) {
    fail(`response for ${target.id} has disallowed Content-Type ${contentType || '(missing)'}`);
  }
  if (response.body.byteLength !== target.expectedBytes) {
    fail(`response for ${target.id} has ${response.body.byteLength} bytes; expected ${target.expectedBytes}`, {
      retryable: propagationMismatch
    });
  }
  const digest = sha256(response.body);
  if (digest !== target.expectedSha256) {
    fail(`response for ${target.id} has SHA-256 ${digest}; expected ${target.expectedSha256}`, {
      retryable: propagationMismatch
    });
  }
  return Object.freeze({
    id: target.id,
    kind: target.kind,
    url: target.url,
    requestUrl: target.requestUrl,
    status: response.status,
    bytes: response.body.byteLength,
    sha256: digest,
    contentType
  });
}

function validateProbeResponse(response, probe) {
  const headers = validateResponseEnvelope(response, probe);
  validateNoCompression(headers, probe);
  if (response.status === 401 || response.status === 403) {
    fail(`response for ${probe.id} returned non-retryable authorization failure HTTP ${response.status}`);
  }
  if (isRetryableHttpStatus(response.status) && !(probe.kind === 'not-found' && response.status === 404)) {
    fail(`response for ${probe.id} returned transient HTTP ${response.status}`, { retryable: true });
  }
  if (probe.kind === 'canonicalization') {
    if (!probe.expectedStatus.includes(response.status)) {
      fail(`slashless canonicalization returned HTTP ${response.status}; expected 301 or 308`);
    }
    const location = headers.get('location');
    let resolved;
    try {
      resolved = new URL(location || '', probe.requestUrl).href;
    } catch {
      fail('slashless canonicalization returned an invalid Location header');
    }
    if (resolved !== probe.expectedLocation) {
      fail(`slashless canonicalization escaped the fixed production URL: ${resolved}`);
    }
    if (response.body.byteLength > NOT_FOUND_BYTE_CAP) fail('slashless canonicalization response exceeded its byte cap');
    validateContentLength(headers, response.body.byteLength, probe);
    return Object.freeze({
      id: probe.id,
      kind: probe.kind,
      url: probe.url,
      requestUrl: probe.requestUrl,
      status: response.status,
      location: resolved
    });
  }
  if (response.status !== 404) fail(`nonexistent sentinel returned HTTP ${response.status}; expected 404`);
  if (response.body.byteLength > NOT_FOUND_BYTE_CAP) fail('nonexistent sentinel response exceeded its byte cap');
  validateContentLength(headers, response.body.byteLength, probe);
  return Object.freeze({
    id: probe.id,
    kind: probe.kind,
    url: probe.url,
    requestUrl: probe.requestUrl,
    status: 404,
    bytes: response.body.byteLength
  });
}

async function readCappedBody(response, cap, label) {
  if (response.body == null) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > cap) {
      try { await response.body.cancel?.(); } catch { /* best effort */ }
      fail(`response for ${label} exceeded its ${cap}-byte cap`);
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

async function defaultRequest({ url, method, headers, redirect, credentials, timeoutMs, maxBytes, signal }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('request timeout')), timeoutMs);
  const forwardAbort = () => controller.abort(signal.reason || new Error('attempt cancelled'));
  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener('abort', forwardAbort, { once: true });
  try {
    const response = await fetch(url, {
      method,
      headers,
      redirect,
      credentials,
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal
    });
    const responseHeaders = normalizedHeaders(response.headers);
    const contentLength = responseHeaders.get('content-length');
    if (contentLength != null && /^(?:0|[1-9]\d*)$/u.test(contentLength) && Number(contentLength) > maxBytes) {
      try { await response.body?.cancel(); } catch { /* best effort */ }
      fail(`response for ${url} advertised ${contentLength} bytes above its ${maxBytes}-byte cap`);
    }
    const body = await readCappedBody(response, maxBytes, url);
    return { status: response.status, url: response.url, headers: response.headers, body };
  } catch (error) {
    if (error instanceof SmokeError) throw error;
    throw wrapNetworkFailure(error, url);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

function requestDescriptor(target, timeoutMs, maxBytes, signal) {
  return Object.freeze({
    url: target.requestUrl,
    method: 'GET',
    headers: Object.freeze({
      Accept: '*/*',
      'Accept-Encoding': 'identity',
      'Cache-Control': 'no-cache, no-store, max-age=0',
      Pragma: 'no-cache'
    }),
    redirect: 'manual',
    credentials: 'omit',
    timeoutMs,
    maxBytes,
    signal
  });
}

async function requestExact(request, target, context) {
  let response;
  context.assertWithinDeadline(`before ${target.id}`);
  const timeoutMs = context.timeoutForRequest(target.id);
  try {
    response = await request(requestDescriptor(
      target,
      timeoutMs,
      target.maxBytes ?? target.expectedBytes,
      context.signal
    ));
  } catch (error) {
    if (error instanceof SmokeError) throw error;
    throw wrapNetworkFailure(error, target.requestUrl);
  }
  context.assertWithinDeadline(`after ${target.id}`);
  return validateExactTargetResponse(response, target);
}

async function requestProbe(request, target, context) {
  let response;
  context.assertWithinDeadline(`before ${target.id}`);
  const timeoutMs = context.timeoutForRequest(target.id);
  try {
    response = await request(requestDescriptor(target, timeoutMs, NOT_FOUND_BYTE_CAP, context.signal));
  } catch (error) {
    if (error instanceof SmokeError) throw error;
    throw wrapNetworkFailure(error, target.requestUrl);
  }
  context.assertWithinDeadline(`after ${target.id}`);
  return validateProbeResponse(response, target);
}

async function mapConcurrent(values, concurrency, worker, controller) {
  const results = new Array(values.length);
  let cursor = 0;
  let stopped = false;
  let firstError = null;
  async function runWorker() {
    while (!stopped && cursor < values.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(values[index], index);
      } catch (error) {
        if (!stopped) {
          stopped = true;
          firstError = error;
          controller.abort(error);
        }
        return;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => runWorker()));
  if (firstError != null) throw firstError;
  return results;
}

async function executeAttempt(plan, { request, concurrency, deadline }) {
  const controller = new AbortController();
  const context = {
    signal: controller.signal,
    timeoutForRequest: deadline.timeoutForRequest,
    assertWithinDeadline: deadline.assertWithinDeadline
  };
  try {
    deadline.assertWithinDeadline('before attempt');
    const manifestStart = await requestExact(request, { ...plan.manifestTarget, id: 'manifest:start' }, context);
    const targets = await mapConcurrent(
      plan.targets,
      concurrency,
      target => requestExact(request, target, context),
      controller
    );
    const probes = await mapConcurrent(
      plan.probes,
      concurrency,
      probe => requestProbe(request, probe, context),
      controller
    );
    const manifestEnd = await requestExact(request, { ...plan.manifestTarget, id: 'manifest:end' }, context);
    deadline.assertWithinDeadline('after attempt');
    return { manifestStart, targets, probes, manifestEnd };
  } catch (error) {
    controller.abort(error);
    throw error;
  }
}

function dependencyInteger(dependencies, key, fallback, range) {
  const value = dependencies[key] == null ? fallback : dependencies[key];
  return assertSafeInteger(value, `dependency ${key}`, range);
}

export async function runPostDeploySmoke(options = {}, dependencies = {}) {
  const plan = planPostDeploySmoke(options);
  if (options.execute !== true) return plan;

  const request = dependencies.request || defaultRequest;
  const now = dependencies.now || (() => Date.now());
  const sleep = dependencies.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  if (typeof request !== 'function' || typeof now !== 'function' || typeof sleep !== 'function') {
    fail('request, now, and sleep dependencies must be functions');
  }
  const deadlineMs = dependencyInteger(dependencies, 'deadlineMs', DEFAULT_DEADLINE_MS, { minimum: 1, maximum: DEFAULT_DEADLINE_MS });
  const retryDelayMs = dependencyInteger(dependencies, 'retryDelayMs', DEFAULT_RETRY_DELAY_MS, { minimum: 0, maximum: MAX_WAIT_MS });
  const timeoutMs = dependencyInteger(dependencies, 'timeoutMs', DEFAULT_REQUEST_TIMEOUT_MS, { minimum: 1, maximum: MAX_WAIT_MS });
  const concurrency = dependencyInteger(dependencies, 'concurrency', DEFAULT_CONCURRENCY, { minimum: 1, maximum: 4 });
  const started = now();
  if (!Number.isFinite(started)) fail('now dependency must return a finite millisecond timestamp');
  const deadlineAt = started + deadlineMs;
  if (!Number.isSafeInteger(deadlineAt)) fail('absolute deadline is outside the safe millisecond range');
  let accountedDelay = 0;
  const currentTime = label => {
    const value = now();
    if (!Number.isFinite(value)) fail('now dependency must return a finite millisecond timestamp');
    if (value < started) fail(`now dependency moved backwards while checking ${label}`);
    return value;
  };
  const remainingBudget = label => {
    const elapsed = Math.max(currentTime(label) - started, accountedDelay);
    const remaining = Math.floor(deadlineMs - elapsed);
    if (remaining <= 0) {
      throw new SmokeError(`absolute ${deadlineMs}ms deadline expired ${label}`);
    }
    return remaining;
  };
  const deadline = Object.freeze({
    assertWithinDeadline: label => { remainingBudget(label); },
    timeoutForRequest: label => Math.min(timeoutMs, remainingBudget(`before request timeout for ${label}`))
  });
  let attempts = 0;
  let lastError;

  while (true) {
    deadline.assertWithinDeadline('before starting an attempt');
    attempts += 1;
    try {
      const result = await executeAttempt(plan, { request, concurrency, deadline });
      const finished = currentTime('while recording success');
      if (Math.max(finished - started, accountedDelay) >= deadlineMs) {
        throw new SmokeError(`absolute ${deadlineMs}ms deadline expired before reporting success`);
      }
      return Object.freeze({
        schemaVersion: REPORT_SCHEMA_VERSION,
        scriptVersion: SCRIPT_VERSION,
        mode: 'execute',
        status: 'verified',
        baseUrl: plan.baseUrl,
        expectedManifestSha256: plan.expectedManifestSha256,
        expectedTag: plan.expectedTag,
        expectedCommit: plan.expectedCommit,
        version: plan.version,
        edition: plan.edition,
        releaseState: plan.releaseState,
        dataDigest: plan.dataDigest,
        attempts,
        durationMs: Math.max(0, Math.round(finished - started)),
        deploymentControl: plan.deploymentControl,
        clientStateUrls: plan.clientStateUrls,
        representativeAlias: Object.freeze({ ...plan.representativeAlias, serverArtifactVerified: true }),
        plannedTransferBytes: plan.plannedTransferBytes,
        plannedTransferBudgetBytes: plan.plannedTransferBudgetBytes,
        manifestStart: result.manifestStart,
        targets: Object.freeze(result.targets),
        probes: Object.freeze(result.probes),
        manifestEnd: result.manifestEnd
      });
    } catch (error) {
      lastError = error instanceof SmokeError ? error : new SmokeError(error.message || String(error));
      if (!lastError.retryable) throw lastError;
      const remaining = remainingBudget('after a retryable attempt failure');
      if (retryDelayMs === 0 || retryDelayMs >= remaining) {
        throw new SmokeError(
          `remote publication did not converge before the absolute ${deadlineMs}ms deadline after ${attempts} attempt(s): ${lastError.message}`
        );
      }
      const wait = Math.min(retryDelayMs, remaining - 1, MAX_WAIT_MS);
      await sleep(wait);
      accountedDelay += wait;
      deadline.assertWithinDeadline('after retry delay');
    }
  }
}

function usage() {
  return [
    'Usage: node scripts/post-deploy-smoke.mjs [--execute] [options]',
    '',
    'Default behavior is plan-only and makes zero network requests.',
    '',
    'Options:',
    '  --manifest <path>          Local release-manifest.json (default: _site/release-manifest.json)',
    '  --manifest-sha256 <digest> Explicit expected SHA-256 of the exact local manifest bytes',
    '  --expected-tag <tag>       Exact annotated release tag expected in the manifest',
    '  --expected-commit <oid>    Exact full Git commit expected in the manifest',
    '  --execute                  Perform bounded GET-only production verification',
    '  --help                     Show this help',
    '',
    `The production base URL is fixed in code to ${PRODUCTION_BASE_URL}`
  ].join('\n');
}

function parseCliArguments(argv) {
  const parsed = { manifest: '_site/release-manifest.json', execute: false };
  const valueOptions = new Map([
    ['--manifest', 'manifest'],
    ['--manifest-sha256', 'expectedManifestSha256'],
    ['--expected-tag', 'expectedTag'],
    ['--expected-commit', 'expectedCommit']
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') return { help: true };
    if (argument === '--execute') {
      if (parsed.execute) fail('--execute may be supplied only once');
      parsed.execute = true;
      continue;
    }
    const key = valueOptions.get(argument);
    if (!key) fail(`unknown argument ${argument}`);
    if (Object.prototype.hasOwnProperty.call(parsed, key) && key !== 'manifest') fail(`${argument} may be supplied only once`);
    const value = argv[index + 1];
    if (value == null || value.startsWith('--')) fail(`${argument} requires a value`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

async function main(argv) {
  const cli = parseCliArguments(argv);
  if (cli.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const manifestPath = path.resolve(cli.manifest);
  const expectedManifestBytes = await readFile(manifestPath);
  const report = await runPostDeploySmoke({
    expectedManifestBytes,
    expectedManifestSha256: cli.expectedManifestSha256,
    expectedTag: cli.expectedTag,
    expectedCommit: cli.expectedCommit,
    execute: cli.execute
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const isDirect = process.argv[1] != null && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.message || error}\n`);
    process.exitCode = 1;
  });
}

export const postDeploySmokeConstants = Object.freeze({
  scriptVersion: SCRIPT_VERSION,
  reportSchemaVersion: REPORT_SCHEMA_VERSION,
  productionBaseUrl: PRODUCTION_BASE_URL,
  defaultDeadlineMs: DEFAULT_DEADLINE_MS,
  defaultRetryDelayMs: DEFAULT_RETRY_DELAY_MS,
  defaultRequestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
  maxManifestFiles: MAX_MANIFEST_FILES,
  maxPayloadBytes: MAX_PAYLOAD_BYTES,
  maxTotalPayloadBytes: MAX_TOTAL_PAYLOAD_BYTES,
  maxManifestPathBytes: MAX_MANIFEST_PATH_BYTES,
  maxPublicUrlBytes: MAX_PUBLIC_URL_BYTES,
  maxPlannedTransferBytes: MAX_PLANNED_TRANSFER_BYTES,
  maxWaitMs: MAX_WAIT_MS,
  maxConcurrency: 4
});
