/**
 * Browser-safe edition fingerprint helpers.
 *
 * This module has no import-time network work. A caller should invoke
 * loadFingerprintIndex only when the Diff view opens; the resource is a
 * same-origin static artifact and is therefore absent from the initial shell
 * request path.
 */

export const FINGERPRINT_SCHEMA_VERSION = '1.0.0';
// `src/data/editions` is the repository source; the stage manifest publishes
// it at `data/editions`, which is the same-origin URL used by the browser.
export const BASELINE_FINGERPRINT_URL = './data/editions/v1.0.0-fingerprints.json';
const FINGERPRINT_PATTERN = /^[0-9a-f]{8}$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const ID_COLLATOR = new Intl.Collator('en-US', { numeric: false, sensitivity: 'variant' });

function compareIds(left, right) {
  return ID_COLLATOR.compare(left, right);
}

function fail(message) {
  throw new Error(`edition-diff: ${message}`);
}

function sortedEntries(map) {
  return Object.entries(map).sort(([left], [right]) => compareIds(left, right));
}

function assertMap(map, label) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) fail(`${label} must be an object`);
  const normalized = {};
  for (const [id, fingerprint] of Object.entries(map)) {
    if (!id) fail(`${label} contains an empty stable id`);
    if (!FINGERPRINT_PATTERN.test(fingerprint || '')) {
      fail(`${label} ${id} lacks a canonical claim fingerprint`);
    }
    normalized[id] = fingerprint;
  }
  return Object.fromEntries(sortedEntries(normalized));
}

function recordsToMap(records, label) {
  if (!Array.isArray(records)) return assertMap(records, label);
  const map = {};
  for (const record of records) {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id) {
      fail(`${label} contains a record without a stable id`);
    }
    if (Object.hasOwn(map, record.id)) fail(`${label} contains duplicate id ${record.id}`);
    if (!FINGERPRINT_PATTERN.test(record.claimFingerprint || '')) {
      fail(`${label} ${record.id} lacks a canonical claim fingerprint`);
    }
    map[record.id] = record.claimFingerprint;
  }
  return assertMap(map, label);
}

/** Convert canonical dataset records or a fingerprint index to a normalized index. */
export function fingerprintIndexFromData(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) fail('source must be an object');
  const nodes = recordsToMap(source.nodes, 'nodes');
  const relationships = recordsToMap(source.relationships, 'relationships');
  return Object.freeze({ nodes, relationships });
}

/** Validate the fetched static index before it is used by a Diff view. */
export function validateFingerprintIndex(index) {
  if (!index || typeof index !== 'object' || Array.isArray(index)) fail('fingerprint index must be an object');
  if (index.schemaVersion !== undefined && index.schemaVersion !== FINGERPRINT_SCHEMA_VERSION) {
    fail(`fingerprint index schemaVersion must be ${FINGERPRINT_SCHEMA_VERSION}`);
  }
  const normalized = fingerprintIndexFromData(index);
  if (index.counts && (index.counts.nodes !== Object.keys(normalized.nodes).length ||
      index.counts.relationships !== Object.keys(normalized.relationships).length)) {
    fail('fingerprint index counts do not match fingerprint maps');
  }
  if (index.semanticDigest !== undefined && !DIGEST_PATTERN.test(index.semanticDigest)) {
    fail('fingerprint index semanticDigest must be a SHA-256 hexadecimal digest');
  }
  return index;
}

function sameOriginUrl(resourceUrl, baseUrl) {
  let resolved;
  try {
    resolved = new URL(resourceUrl, baseUrl);
  } catch (error) {
    fail(`invalid fingerprint URL: ${error.message}`);
  }
  if (baseUrl) {
    const base = new URL(baseUrl);
    if (resolved.origin !== base.origin) fail('fingerprint URL must be same-origin');
  }
  return resolved.href;
}

/**
 * Lazily fetch the baseline index. No request is made until this function is
 * called. `fetchImpl` and `baseUrl` are injectable for tests and embeds.
 */
export async function loadFingerprintIndex(options = {}) {
  const config = typeof options === 'string' ? { url: options } : options;
  const baseUrl = config.baseUrl || globalThis.location?.href;
  const url = sameOriginUrl(config.url || BASELINE_FINGERPRINT_URL, baseUrl);
  const fetchImpl = config.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') fail('fetch is unavailable');
  const response = await fetchImpl(url, { credentials: 'same-origin' });
  if (!response || !response.ok) {
    fail(`fingerprint request failed${response?.status ? ` (${response.status})` : ''}`);
  }
  let index;
  try {
    index = await response.json();
  } catch (error) {
    fail(`fingerprint response is not valid JSON: ${error.message}`);
  }
  return validateFingerprintIndex(index);
}

/** Return added, removed, and changed IDs for nodes and relationships. */
export function diffFingerprintIndexes(currentSource, baselineSource) {
  const current = fingerprintIndexFromData(currentSource);
  const baseline = fingerprintIndexFromData(baselineSource);
  const compare = (left, right) => {
    const leftIds = new Set(Object.keys(left));
    const rightIds = new Set(Object.keys(right));
    return {
      added: [...leftIds].filter(id => !rightIds.has(id)).sort(compareIds),
      removed: [...rightIds].filter(id => !leftIds.has(id)).sort(compareIds),
      changed: [...leftIds].filter(id => rightIds.has(id) && left[id] !== right[id]).sort(compareIds)
    };
  };
  return {
    nodes: compare(current.nodes, baseline.nodes),
    relationships: compare(current.relationships, baseline.relationships)
  };
}
