import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';

import { parseStrictJson } from './strict-json.mjs';

const POLICY_PATH = 'config/promotion-preflight-policy.v1.json';
const LIFECYCLE_POLICY_PATH = 'config/promotion-lifecycle-policy.v1.json';
const LIFECYCLE_POLICY_SHA256 = '61f2a9c91fe24ec232af591385f3d3995c3c4412015e816fc27b9b0142777246';
const GITHUB_POLICY_SHA256 = 'a1dc1ec4b814f09e668b1b1d6669853240dcb732541e0d0b580ec3f5a959215c';
const REFERENCE_SET_DOMAIN = 'ai-research-tech-tree:preflight-reference-set:v1\0';
const CLOSURE_DOMAIN = 'ai-research-tech-tree:preflight-reference-closure:v1\0';
const RESOLVED_INVENTORY_DOMAIN = 'ai-research-tech-tree:preflight-resolved-inventory:v1\0';
const CHAIN_ID_DOMAIN = 'ai-research-tech-tree:promotion-lifecycle-chain:v1\0';
const RECEIPT_ID_DOMAIN = 'ai-research-tech-tree:promotion-lifecycle-receipt:v1\0';
const DOCUMENT_KIND = 'preflight-reference-document';
const RECEIPT_KIND = 'promotion-lifecycle-receipt';
const REFERENCE_KIND = 'fixture-byte-reference';
const DIGEST = /^[0-9a-f]{64}$/u;
const SHA1 = /^[0-9a-f]{40}$/u;
const ROLE = /^[a-z0-9][a-z0-9.-]{0,127}$/u;
const REFLECT_APPLY = Reflect.apply;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const OBJECT_GET_OWN_PROPERTY_NAMES = Object.getOwnPropertyNames;
const OBJECT_GET_OWN_PROPERTY_SYMBOLS = Object.getOwnPropertySymbols;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_IS = Object.is;
const IS_PROXY = utilTypes.isProxy;
const IS_SHARED_ARRAY_BUFFER = utilTypes.isSharedArrayBuffer;
const NATIVE_ERROR = Error;
const NATIVE_BUFFER = Buffer;
const BUFFER_IS_BUFFER = Buffer.isBuffer;
const BUFFER_ALLOC = Buffer.alloc.bind(Buffer);
const BUFFER_FROM = Buffer.from.bind(Buffer);
const BUFFER_COMPARE = Buffer.compare.bind(Buffer);
const BUFFER_BYTE_LENGTH = Buffer.byteLength.bind(Buffer);
const BUFFER_PROTOTYPE = Buffer.prototype;
const UINT8_ARRAY = Uint8Array;
const UINT8_ARRAY_SET = Uint8Array.prototype.set;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, 'buffer').get;
const TYPED_ARRAY_BYTE_OFFSET_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, 'byteOffset').get;
const TYPED_ARRAY_LENGTH_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, 'length').get;
const BUFFER_TO_STRING = Buffer.prototype.toString;
const BUFFER_EQUALS = Buffer.prototype.equals;
const BUFFER_INDEX_OF = Buffer.prototype.indexOf;
const BUFFER_SUBARRAY = Buffer.prototype.subarray;
const UINT8_ARRAY_EVERY = Uint8Array.prototype.every;
const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;
const HASH_PROTOTYPE = Object.getPrototypeOf(createHash('sha256'));
const HASH_UPDATE = HASH_PROTOTYPE.update;
const HASH_DIGEST = HASH_PROTOTYPE.digest;
const BUFFER_SHADOW_KEYS = Object.freeze(['buffer', 'byteLength', 'byteOffset', 'length']);
const RUNTIME_GLOBAL_GUARDS = [
  'Array', 'Buffer', 'Date', 'Error', 'JSON', 'Map', 'Math', 'Number', 'Object',
  'Reflect', 'RegExp', 'Set', 'String', 'Uint8Array'
].map(key => captureProperty(globalThis, key));
const RUNTIME_SURFACE_GUARDS = [
  ['Array', Array],
  ['Array.prototype', Array.prototype],
  ['Buffer', NATIVE_BUFFER],
  ['Buffer.prototype', BUFFER_PROTOTYPE],
  ['Date', Date],
  ['Date.prototype', Date.prototype],
  ['Error', NATIVE_ERROR],
  ['Error.prototype', NATIVE_ERROR.prototype],
  ['Function.prototype', Function.prototype],
  ['Hash.prototype', HASH_PROTOTYPE],
  ['JSON', JSON],
  ['Map', Map],
  ['Map.prototype', Map.prototype],
  ['Math', Math],
  ['Number', Number],
  ['Object', Object],
  ['Object.prototype', Object.prototype],
  ['Reflect', Reflect],
  ['RegExp', RegExp],
  ['RegExp.prototype', RegExp.prototype],
  ['Set', Set],
  ['Set.prototype', Set.prototype],
  ['String', String],
  ['String.prototype', String.prototype],
  ['Uint8Array', UINT8_ARRAY],
  ['Uint8Array.prototype', UINT8_ARRAY.prototype],
  ['TypedArray.prototype', TYPED_ARRAY_PROTOTYPE]
].map(([label, target]) => captureSurface(label, target));

const EXPECTED_POLICY_TEXT = `{
  "schemaVersion": "1.0.0",
  "status": "planned",
  "mode": "fixture-only",
  "lifecyclePolicyPath": "config/promotion-lifecycle-policy.v1.json",
  "subject": {
    "repositoryOwner": "neb6dav",
    "repositoryName": "ai_tech_tree",
    "repositoryFullName": "neb6dav/ai_tech_tree",
    "gitObjectFormat": "sha1",
    "version": "0.1.1",
    "tag": "v0.1.1",
    "releaseSpecPath": "config/releases/v0.1.1.json",
    "defaultBranch": "main",
    "protectedMainRef": "refs/remotes/origin/main"
  },
  "limits": {
    "maxPolicyBytes": 16384,
    "maxLifecycleReceiptBytes": 8192,
    "maxReferenceCandidates": 40,
    "maxReferenceBytes": 83886080,
    "maxReferenceJsonBytes": 4194304,
    "maxAggregateReferenceBytes": 100663296,
    "maxGitTreeEntries": 4096,
    "maxStableManifestFiles": 4096
  },
  "lifecycleReferenceRoles": [
    "source-finalization-record",
    "source-finalization-authorization",
    "annotated-tag-verification-record",
    "annotated-tag-authorization",
    "stable-bundle-verification-record",
    "stable-bundle-build-authorization"
  ],
  "requiredCommittedPaths": [
    {
      "path": "CHANGELOG.md",
      "role": "committed-changelog"
    },
    {
      "path": ".github/workflows/pages.yml",
      "role": "reviewed-workflow-pages"
    },
    {
      "path": ".github/workflows/validate.yml",
      "role": "committed-workflow-validate"
    },
    {
      "path": "config/github-promotion-policy.v1.json",
      "role": "committed-policy-github-promotion"
    },
    {
      "path": "config/pages-stage.v1.json",
      "role": "committed-policy-pages-stage"
    },
    {
      "path": "config/promotion-lifecycle-policy.v1.json",
      "role": "committed-policy-promotion-lifecycle"
    },
    {
      "path": "config/promotion-preflight-policy.v1.json",
      "role": "committed-policy-promotion-preflight"
    },
    {
      "path": "config/releases/v0.1.1.json",
      "role": "committed-release-spec"
    },
    {
      "path": "scripts/github-control-audit.mjs",
      "role": "committed-tool-github-control-audit"
    },
    {
      "path": "scripts/promotion-lifecycle.mjs",
      "role": "committed-tool-promotion-lifecycle"
    },
    {
      "path": "scripts/promotion-preflight.mjs",
      "role": "committed-tool-promotion-preflight"
    },
    {
      "path": "scripts/release-assets.mjs",
      "role": "committed-tool-release-assets"
    },
    {
      "path": "scripts/release-ref.mjs",
      "role": "committed-tool-release-ref"
    },
    {
      "path": "scripts/release-spec.mjs",
      "role": "committed-tool-release-spec"
    },
    {
      "path": "scripts/stage-site.mjs",
      "role": "committed-tool-stage-site"
    },
    {
      "path": "scripts/strict-json.mjs",
      "role": "committed-tool-strict-json"
    },
    {
      "path": "scripts/verify-stable-bundle.mjs",
      "role": "committed-tool-stable-bundle-verifier"
    }
  ],
  "requiredGitTrees": [
    {
      "directory": "",
      "role": "source-tree-root"
    },
    {
      "directory": ".github",
      "role": "source-tree-dot-github"
    },
    {
      "directory": ".github/workflows",
      "role": "source-tree-dot-github-workflows"
    },
    {
      "directory": "config",
      "role": "source-tree-config"
    },
    {
      "directory": "config/releases",
      "role": "source-tree-config-releases"
    },
    {
      "directory": "scripts",
      "role": "source-tree-scripts"
    }
  ],
  "reviewedWorkflowBytes": {
    "path": ".github/workflows/pages.yml",
    "role": "reviewed-workflow-pages",
    "sha256": "f694db57bce2edcbb916ee1c845f7d33b9245546f063421dadace235073fddfa"
  },
  "reviewedValidationWorkflowSha256": "8182b87623070f8260433fa9eb58909e75676705fee2511cd5efe8c874e9c31e",
  "stableAssetRoles": [
    {
      "suffix": ".SHA256SUMS",
      "role": "stable-asset-checksums"
    },
    {
      "suffix": ".notes.md",
      "role": "stable-asset-notes"
    },
    {
      "suffix": ".release-manifest.json",
      "role": "stable-asset-release-manifest"
    },
    {
      "suffix": ".tar",
      "role": "stable-asset-tar"
    }
  ],
  "outcomes": [
    "reconcile",
    "resolved-fixture-reference-closure"
  ]
}
`;

const EXPECTED_POLICY_BYTES = BUFFER_FROM(EXPECTED_POLICY_TEXT, 'utf8');
const EXPECTED_POLICY = JSON.parse(EXPECTED_POLICY_TEXT);
const EXPECTED_POLICY_SHA256 = sha256(EXPECTED_POLICY_BYTES);
const INPUT_KEYS = Object.freeze([
  'policyRecord',
  'lifecyclePolicyRecord',
  'receiptBytesList',
  'expectedHeadSha256',
  'expectedSubject',
  'referenceObservation',
  'expectedReferenceSetSha256'
]);
const POLICY_RECORD_KEYS = Object.freeze(['path', 'bytes', 'sha256', 'policy']);
const OBSERVATION_KEYS = Object.freeze(['completeness', 'candidates']);
const CANDIDATE_KEYS = Object.freeze(['role', 'sha256', 'byteLength', 'bytes']);
const REFERENCE_KEYS = Object.freeze(['kind', 'role', 'sha256', 'byteLength']);
const SUBJECT_KEYS = Object.freeze([
  'repositoryId',
  'repositoryOwnerId',
  'repositoryOwner',
  'repositoryName',
  'repositoryFullName',
  'gitObjectFormat',
  'releaseSpecPath',
  'releaseSpecSha256',
  'version',
  'tag',
  'sourceCommit'
]);
const RECEIPT_KEYS = Object.freeze([
  'schemaVersion', 'kind', 'scope', 'productionEligible', 'policySha256', 'chainId',
  'sequence', 'receiptId', 'eventType', 'fromState', 'toState', 'observedAt', 'subject',
  'parent', 'evidence', 'authority'
]);
const PARENT_KEYS = Object.freeze(['receiptId', 'sha256', 'byteLength']);
const ENVELOPE_KEYS = Object.freeze([
  'schemaVersion', 'kind', 'role', 'sequence', 'scope', 'productionEligible',
  'externalMutationAuthorized', 'authenticatedAuthority', 'policySha256', 'chainId',
  'subject', 'timestamp', 'payload'
]);
const AUTHORITY_BOUNDARY_KEYS = Object.freeze([
  'sourceMutationAuthorized', 'tagMutationAuthorized', 'releaseMutationAuthorized',
  'deploymentMutationAuthorized', 'environmentMutationAuthorized', 'refMutationAuthorized'
]);
const TRANSITIONS = Object.freeze([
  Object.freeze({ sequence: 1, eventType: 'source-finalized', fromState: 'unstarted', toState: 'source-finalized', evidenceRole: 'source-finalization-record', authorityRole: 'source-finalization-authorization' }),
  Object.freeze({ sequence: 2, eventType: 'tag-verified', fromState: 'source-finalized', toState: 'tag-verified', evidenceRole: 'annotated-tag-verification-record', authorityRole: 'annotated-tag-authorization' }),
  Object.freeze({ sequence: 3, eventType: 'stable-bundle-verified', fromState: 'tag-verified', toState: 'stable-bundle-verified', evidenceRole: 'stable-bundle-verification-record', authorityRole: 'stable-bundle-build-authorization' })
]);

function preflightError(message) {
  return new NATIVE_ERROR(`promotion-preflight: ${message}`);
}

function captureProperty(target, key) {
  return { target, key, descriptor: OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(target, key) };
}

function captureSurface(label, target) {
  const names = OBJECT_GET_OWN_PROPERTY_NAMES(target);
  const symbols = OBJECT_GET_OWN_PROPERTY_SYMBOLS(target);
  const descriptors = [];
  for (let index = 0; index < names.length; index += 1) {
    descriptors[index] = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(target, names[index]);
  }
  for (let index = 0; index < symbols.length; index += 1) {
    descriptors[names.length + index] = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(target, symbols[index]);
  }
  return { label, target, names, symbols, descriptors };
}

function descriptorsEqual(actual, expected) {
  if (actual === undefined || expected === undefined) return actual === expected;
  if (actual.enumerable !== expected.enumerable || actual.configurable !== expected.configurable) return false;
  const actualIsData = OBJECT_HAS_OWN(actual, 'value');
  const expectedIsData = OBJECT_HAS_OWN(expected, 'value');
  if (actualIsData !== expectedIsData) return false;
  return actualIsData
    ? OBJECT_IS(actual.value, expected.value) && actual.writable === expected.writable
    : actual.get === expected.get && actual.set === expected.set;
}

function assertSurfaceIntact(surface) {
  const names = OBJECT_GET_OWN_PROPERTY_NAMES(surface.target);
  const symbols = OBJECT_GET_OWN_PROPERTY_SYMBOLS(surface.target);
  if (names.length !== surface.names.length || symbols.length !== surface.symbols.length) {
    throw preflightError(`native ${surface.label} intrinsics must remain intact`);
  }
  for (let index = 0; index < names.length; index += 1) {
    if (names[index] !== surface.names[index] || !descriptorsEqual(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(surface.target, names[index]),
      surface.descriptors[index]
    )) throw preflightError(`native ${surface.label} intrinsics must remain intact`);
  }
  for (let index = 0; index < symbols.length; index += 1) {
    if (symbols[index] !== surface.symbols[index] || !descriptorsEqual(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(surface.target, symbols[index]),
      surface.descriptors[surface.names.length + index]
    )) throw preflightError(`native ${surface.label} intrinsics must remain intact`);
  }
}

function assertRuntimeIntrinsics() {
  for (let index = 0; index < RUNTIME_GLOBAL_GUARDS.length; index += 1) {
    const guard = RUNTIME_GLOBAL_GUARDS[index];
    if (!descriptorsEqual(OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(guard.target, guard.key), guard.descriptor)) {
      throw preflightError(`native global ${guard.key} intrinsic must remain intact`);
    }
  }
  for (let index = 0; index < RUNTIME_SURFACE_GUARDS.length; index += 1) {
    assertSurfaceIntact(RUNTIME_SURFACE_GUARDS[index]);
  }
}

function assertNotProxy(value, label) {
  if (value && (typeof value === 'object' || typeof value === 'function') && IS_PROXY(value)) {
    throw preflightError(`${label} must not be a Proxy`);
  }
}

function inspectOrdinaryBuffer(value, label) {
  assertNotProxy(value, label);
  if (!BUFFER_IS_BUFFER(value)) throw preflightError(`${label} must be an ordinary Buffer`);
  if (Object.getPrototypeOf(value) !== BUFFER_PROTOTYPE) {
    throw preflightError(`${label} must use the exact native Buffer prototype`);
  }
  for (const key of BUFFER_SHADOW_KEYS) {
    if (Object.getOwnPropertyDescriptor(value, key) !== undefined) {
      throw preflightError(`${label} must not shadow ${key}`);
    }
    if (Object.getOwnPropertyDescriptor(BUFFER_PROTOTYPE, key) !== undefined) {
      throw preflightError(`native Buffer prototype must not shadow ${key}`);
    }
  }
  let arrayBuffer;
  let byteOffset;
  let length;
  try {
    arrayBuffer = TYPED_ARRAY_BUFFER_GETTER.call(value);
    byteOffset = TYPED_ARRAY_BYTE_OFFSET_GETTER.call(value);
    length = TYPED_ARRAY_LENGTH_GETTER.call(value);
  } catch {
    throw preflightError(`${label} must expose intact typed-array internals`);
  }
  if (IS_SHARED_ARRAY_BUFFER(arrayBuffer)) throw preflightError(`${label} must not use shared backing memory`);
  if (!Number.isSafeInteger(byteOffset) || byteOffset < 0 || !Number.isSafeInteger(length) || length < 0) {
    throw preflightError(`${label} has invalid typed-array bounds`);
  }
  return { arrayBuffer, byteOffset, length };
}

function copyInspectedBuffer(inspected) {
  const source = new UINT8_ARRAY(inspected.arrayBuffer, inspected.byteOffset, inspected.length);
  const copy = BUFFER_ALLOC(inspected.length);
  UINT8_ARRAY_SET.call(copy, source);
  return copy;
}

function snapshotOrdinaryBuffer(value, label, maximum) {
  const inspected = inspectOrdinaryBuffer(value, label);
  if (inspected.length > maximum) throw preflightError(`${label} exceeds ${maximum} bytes`);
  return copyInspectedBuffer(inspected);
}

function rangesOverlap(left, right) {
  return left.arrayBuffer === right.arrayBuffer &&
    left.byteOffset < right.byteOffset + right.length &&
    right.byteOffset < left.byteOffset + left.length;
}

function sha256(bytes) {
  const hash = createHash('sha256');
  REFLECT_APPLY(HASH_UPDATE, hash, [bytes]);
  return REFLECT_APPLY(HASH_DIGEST, hash, ['hex']);
}

function bufferLength(bytes) {
  return TYPED_ARRAY_LENGTH_GETTER.call(bytes);
}

function bufferEquals(left, right) {
  return bufferLength(left) === bufferLength(right) && BUFFER_COMPARE(left, right) === 0;
}

function bufferToString(bytes, encoding = 'utf8') {
  return BUFFER_TO_STRING.call(bytes, encoding);
}

function bufferIndexOf(bytes, value, offset = 0) {
  return BUFFER_INDEX_OF.call(bytes, value, offset);
}

function bufferSubarray(bytes, start, end) {
  return BUFFER_SUBARRAY.call(bytes, start, end);
}

function gitObjectId(type, bytes) {
  const hash = createHash('sha1');
  REFLECT_APPLY(HASH_UPDATE, hash, [`${type} ${bufferLength(bytes)}\0`, 'utf8']);
  REFLECT_APPLY(HASH_UPDATE, hash, [bytes]);
  return REFLECT_APPLY(HASH_DIGEST, hash, ['hex']);
}

function canonicalBytes(value, pretty = false) {
  return BUFFER_FROM(`${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, 'utf8');
}

function hashCanonical(domain, value) {
  const hash = createHash('sha256');
  REFLECT_APPLY(HASH_UPDATE, hash, [domain, 'utf8']);
  REFLECT_APPLY(HASH_UPDATE, hash, [JSON.stringify(value), 'utf8']);
  return REFLECT_APPLY(HASH_DIGEST, hash, ['hex']);
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw preflightError(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function assertSha1(value, label) {
  if (typeof value !== 'string' || !SHA1.test(value)) throw preflightError(`${label} must be a lowercase SHA-1 object ID`);
  return value;
}

function assertPositiveInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw preflightError(`${label} must be a positive safe integer no greater than ${maximum}`);
  }
  return value;
}

function assertObject(value, label) {
  assertNotProxy(value, label);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw preflightError(`${label} must be an object`);
}

function snapshotExactRecord(value, expectedKeys, label) {
  assertObject(value, label);
  if (Object.getPrototypeOf(value) !== Object.prototype) throw preflightError(`${label} must be a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Object.getOwnPropertyNames(descriptors);
  if (Object.getOwnPropertySymbols(descriptors).length !== 0 || names.length !== expectedKeys.length || names.some((name, index) => name !== expectedKeys[index])) {
    throw preflightError(`${label} keys must be exactly, and in order: ${expectedKeys.join(', ')}`);
  }
  const snapshot = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw preflightError(`${label}.${key} must be an enumerable data property`);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function snapshotDenseArray(value, label, maximum) {
  assertNotProxy(value, label);
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw preflightError(`${label} must be a plain array`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > maximum) throw preflightError(`${label} length is outside its reviewed bound`);
  const names = Object.getOwnPropertyNames(descriptors);
  const expected = Array.from({ length }, (_, index) => String(index)).concat('length');
  if (Object.getOwnPropertySymbols(descriptors).length !== 0 || names.length !== expected.length || names.some((name, index) => name !== expected[index])) {
    throw preflightError(`${label} must be dense with no extra properties`);
  }
  return expected.slice(0, -1).map((name, index) => {
    const descriptor = descriptors[name];
    if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw preflightError(`${label}[${index}] must be an enumerable data property`);
    }
    return descriptor.value;
  });
}

function snapshotJson(value, label, ancestors = new Set(), state = { nodes: 0 }, depth = 0) {
  state.nodes += 1;
  if (state.nodes > 10_000 || depth > 64) throw preflightError(`${label} exceeds the reviewed JSON graph bound`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw preflightError(`${label} must contain finite JSON numbers`);
    return value;
  }
  assertNotProxy(value, label);
  if (!value || typeof value !== 'object' || BUFFER_IS_BUFFER(value)) throw preflightError(`${label} must contain only JSON data`);
  if (ancestors.has(value)) throw preflightError(`${label} must not contain a cycle`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return snapshotDenseArray(value, label, 16384).map((item, index) => snapshotJson(item, `${label}[${index}]`, ancestors, state, depth + 1));
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) throw preflightError(`${label} must contain only plain objects`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(descriptors).length !== 0) throw preflightError(`${label} must not contain symbol properties`);
    const snapshot = Object.create(null);
    for (const name of Object.getOwnPropertyNames(descriptors)) {
      const descriptor = descriptors[name];
      if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw preflightError(`${label}.${name} must be an enumerable data property`);
      }
      Object.defineProperty(snapshot, name, {
        value: snapshotJson(descriptor.value, `${label}.${name}`, ancestors, state, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
    return snapshot;
  } finally {
    ancestors.delete(value);
  }
}

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw preflightError(`${label} does not match the reviewed value`);
}

function normalizedPolicyRecord(record) {
  const item = snapshotExactRecord(record, POLICY_RECORD_KEYS, 'preflight policy record');
  if (item.path !== POLICY_PATH) throw preflightError(`preflight policy path must be exactly ${POLICY_PATH}`);
  const bytes = snapshotOrdinaryBuffer(item.bytes, 'preflight policy bytes', EXPECTED_POLICY.limits.maxPolicyBytes);
  if (!bufferEquals(bytes, EXPECTED_POLICY_BYTES)) throw preflightError('preflight policy bytes must exactly match the reviewed trust anchor');
  const digest = sha256(bytes);
  if (item.sha256 !== digest) throw preflightError('preflight policy SHA-256 does not match its bytes');
  const parsed = parseStrictJson(bytes, POLICY_PATH);
  assertJsonEqual(snapshotJson(item.policy, 'preflight policy record.policy'), parsed, 'preflight policy record.policy');
  assertJsonEqual(parsed, EXPECTED_POLICY, 'preflight policy');
  return { path: POLICY_PATH, bytes, sha256: digest, policy: parsed };
}

function normalizedLifecyclePolicyRecord(record, limit) {
  const item = snapshotExactRecord(record, POLICY_RECORD_KEYS, 'lifecycle policy record');
  if (item.path !== LIFECYCLE_POLICY_PATH) throw preflightError(`lifecycle policy path must be exactly ${LIFECYCLE_POLICY_PATH}`);
  const bytes = snapshotOrdinaryBuffer(item.bytes, 'lifecycle policy bytes', limit);
  const digest = sha256(bytes);
  if (item.sha256 !== digest || digest !== LIFECYCLE_POLICY_SHA256) {
    throw preflightError('lifecycle policy bytes do not match the reviewed trust anchor');
  }
  const parsed = parseStrictJson(bytes, LIFECYCLE_POLICY_PATH);
  assertJsonEqual(snapshotJson(item.policy, 'lifecycle policy record.policy'), parsed, 'lifecycle policy record.policy');
  if (parsed.status !== 'planned' || parsed.mode !== 'fixture-only' || parsed.releaseSpecPath !== EXPECTED_POLICY.subject.releaseSpecPath) {
    throw preflightError('lifecycle policy has unsupported semantics');
  }
  return { path: LIFECYCLE_POLICY_PATH, bytes, sha256: digest, policy: parsed };
}

function normalizeSubject(value, policy) {
  const subject = snapshotExactRecord(value, SUBJECT_KEYS, 'expected subject');
  assertPositiveInteger(subject.repositoryId, 'expected subject.repositoryId');
  assertPositiveInteger(subject.repositoryOwnerId, 'expected subject.repositoryOwnerId');
  for (const key of ['repositoryOwner', 'repositoryName', 'repositoryFullName', 'gitObjectFormat', 'version', 'tag']) {
    if (subject[key] !== policy.subject[key]) throw preflightError(`expected subject.${key} does not match policy`);
  }
  if (subject.releaseSpecPath !== policy.subject.releaseSpecPath) throw preflightError('expected subject.releaseSpecPath does not match policy');
  assertDigest(subject.releaseSpecSha256, 'expected subject.releaseSpecSha256');
  assertSha1(subject.sourceCommit, 'expected subject.sourceCommit');
  return { ...subject };
}

function normalizeReference(value, expectedRole, maximum, label) {
  const reference = snapshotExactRecord(value, REFERENCE_KEYS, label);
  if (reference.kind !== REFERENCE_KIND) throw preflightError(`${label}.kind must be ${REFERENCE_KIND}`);
  if (reference.role !== expectedRole) throw preflightError(`${label}.role must be exactly ${expectedRole}`);
  assertDigest(reference.sha256, `${label}.sha256`);
  assertPositiveInteger(reference.byteLength, `${label}.byteLength`, maximum);
  return { ...reference };
}

function receiptIdMaterial(receipt) {
  return {
    schemaVersion: receipt.schemaVersion, kind: receipt.kind, scope: receipt.scope,
    productionEligible: receipt.productionEligible, policySha256: receipt.policySha256,
    chainId: receipt.chainId, sequence: receipt.sequence, eventType: receipt.eventType,
    fromState: receipt.fromState, toState: receipt.toState, observedAt: receipt.observedAt,
    subject: receipt.subject, parent: receipt.parent, evidence: receipt.evidence, authority: receipt.authority
  };
}

function normalizeReceipts(receiptBytesList, lifecyclePolicy, expectedHeadSha256, expectedSubject, policy) {
  const values = snapshotDenseArray(receiptBytesList, 'receiptBytesList', 3);
  if (values.length !== 3) throw preflightError('receiptBytesList must contain exactly three lifecycle receipts');
  const inspectedReceipts = values.map((value, index) => {
    const inspected = inspectOrdinaryBuffer(value, `receiptBytesList[${index}]`);
    if (inspected.length > policy.limits.maxLifecycleReceiptBytes) throw preflightError(`receiptBytesList[${index}] exceeds its reviewed byte bound`);
    return inspected;
  });
  for (let index = 0; index < inspectedReceipts.length; index += 1) {
    for (let prior = 0; prior < index; prior += 1) {
      if (rangesOverlap(inspectedReceipts[prior], inspectedReceipts[index])) throw preflightError('lifecycle receipt buffers must not overlap or alias');
    }
  }
  const bytesList = inspectedReceipts.map(copyInspectedBuffer);
  const receipts = [];
  for (let index = 0; index < bytesList.length; index += 1) {
    const bytes = bytesList[index];
    const receipt = parseStrictJson(bytes, `lifecycle receipt ${index + 1}`);
    if (!bufferEquals(bytes, canonicalBytes(receipt))) throw preflightError(`lifecycle receipt ${index + 1} is not canonical JSON`);
    const item = snapshotExactRecord(receipt, RECEIPT_KEYS, `lifecycle receipt ${index + 1}`);
    const transition = TRANSITIONS[index];
    if (item.schemaVersion !== '1.0.0' || item.kind !== RECEIPT_KIND || item.scope !== 'fixture-only' || item.productionEligible !== false) {
      throw preflightError(`lifecycle receipt ${index + 1} has unsupported identity or authority semantics`);
    }
    if (item.policySha256 !== lifecyclePolicy.sha256 || item.sequence !== transition.sequence || item.eventType !== transition.eventType || item.fromState !== transition.fromState || item.toState !== transition.toState) {
      throw preflightError(`lifecycle receipt ${index + 1} does not match the reviewed transition`);
    }
    if (JSON.stringify(item.subject) !== JSON.stringify(expectedSubject)) throw preflightError(`lifecycle receipt ${index + 1} subject drifted`);
    const expectedChainId = hashCanonical(CHAIN_ID_DOMAIN, { policySha256: lifecyclePolicy.sha256, subject: expectedSubject });
    if (item.chainId !== expectedChainId) throw preflightError(`lifecycle receipt ${index + 1} chainId is invalid`);
    if (typeof item.observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(item.observedAt) || new Date(item.observedAt).toISOString() !== item.observedAt) {
      throw preflightError(`lifecycle receipt ${index + 1} observedAt is invalid`);
    }
    if (index > 0 && item.observedAt <= receipts[index - 1].receipt.observedAt) throw preflightError('lifecycle receipt times must increase strictly');
    if (index === 0) {
      if (item.parent !== null) throw preflightError('first lifecycle receipt parent must be null');
    } else {
      const parent = snapshotExactRecord(item.parent, PARENT_KEYS, `lifecycle receipt ${index + 1} parent`);
      const prior = receipts[index - 1];
      if (parent.receiptId !== prior.receipt.receiptId || parent.sha256 !== prior.sha256 || parent.byteLength !== bufferLength(prior.bytes)) {
        throw preflightError(`lifecycle receipt ${index + 1} parent anchor is invalid`);
      }
    }
    const evidence = normalizeReference(item.evidence, transition.evidenceRole, policy.limits.maxReferenceJsonBytes, `lifecycle receipt ${index + 1} evidence`);
    const authority = normalizeReference(item.authority, transition.authorityRole, policy.limits.maxReferenceJsonBytes, `lifecycle receipt ${index + 1} authority`);
    const expectedReceiptId = hashCanonical(RECEIPT_ID_DOMAIN, receiptIdMaterial({ ...item, evidence, authority }));
    if (item.receiptId !== expectedReceiptId) throw preflightError(`lifecycle receipt ${index + 1} receiptId is invalid`);
    receipts.push({ bytes, sha256: sha256(bytes), receipt: { ...item, evidence, authority } });
  }
  assertDigest(expectedHeadSha256, 'expectedHeadSha256');
  if (expectedHeadSha256 !== receipts[2].sha256) throw preflightError('expectedHeadSha256 does not match the lifecycle head');
  return receipts;
}

function rootReferenceInventory(receipts, policy) {
  const byRole = new Map();
  for (const item of receipts) {
    for (const reference of [item.receipt.evidence, item.receipt.authority]) {
      if (byRole.has(reference.role)) throw preflightError(`duplicate lifecycle reference role ${reference.role}`);
      byRole.set(reference.role, reference);
    }
  }
  const inventory = policy.lifecycleReferenceRoles.map(role => {
    const reference = byRole.get(role);
    if (!reference) throw preflightError(`missing lifecycle reference role ${role}`);
    return { role, sha256: reference.sha256, byteLength: reference.byteLength };
  });
  if (byRole.size !== inventory.length) throw preflightError('lifecycle reference inventory has extra roles');
  return inventory;
}

function referenceSetSha256(inventory) {
  return hashCanonical(REFERENCE_SET_DOMAIN, inventory);
}

function roleMaximum(role, policy) {
  if (role === 'stable-asset-tar') return policy.limits.maxReferenceBytes;
  if (role === 'stable-asset-release-manifest' || role === 'stable-bundle-manifest') return policy.limits.maxReferenceJsonBytes;
  if (role === 'stable-asset-notes') return 1_048_576;
  if (role === 'stable-asset-checksums') return 65_536;
  if (role.startsWith('source-tree-')) return 4_194_304;
  if (role === 'source-commit-object' || role === 'annotated-tag-object') return 1_048_576;
  if (role.startsWith('committed-') || role === policy.reviewedWorkflowBytes.role) return 4_194_304;
  if (policy.lifecycleReferenceRoles.includes(role)) return policy.limits.maxReferenceJsonBytes;
  return 0;
}

function normalizeObservation(value, policy) {
  const observation = snapshotExactRecord(value, OBSERVATION_KEYS, 'referenceObservation');
  if (observation.completeness !== 'complete') throw preflightError('referenceObservation must declare a complete inventory');
  const rawCandidates = snapshotDenseArray(observation.candidates, 'referenceObservation.candidates', policy.limits.maxReferenceCandidates);
  const inspected = [];
  let aggregate = 0;
  for (let index = 0; index < rawCandidates.length; index += 1) {
    const candidate = snapshotExactRecord(rawCandidates[index], CANDIDATE_KEYS, `referenceObservation.candidates[${index}]`);
    if (typeof candidate.role !== 'string' || !ROLE.test(candidate.role)) throw preflightError(`candidate ${index} role is invalid`);
    const maximum = roleMaximum(candidate.role, policy);
    if (maximum === 0) throw preflightError(`candidate ${index} has an unsupported role`);
    assertDigest(candidate.sha256, `candidate ${index} sha256`);
    assertPositiveInteger(candidate.byteLength, `candidate ${index} byteLength`, maximum);
    const buffer = inspectOrdinaryBuffer(candidate.bytes, `candidate ${index} bytes`);
    if (buffer.length !== candidate.byteLength || buffer.length > maximum) throw preflightError(`candidate ${index} byte length anchor is invalid`);
    aggregate += buffer.length;
    if (!Number.isSafeInteger(aggregate) || aggregate > policy.limits.maxAggregateReferenceBytes) throw preflightError('reference observation exceeds its aggregate byte bound');
    for (const prior of inspected) {
      if (rangesOverlap(prior.buffer, buffer)) throw preflightError('reference candidate buffers must not overlap or alias');
    }
    inspected.push({ candidate, buffer });
  }
  const byRole = new Map();
  const byDigest = new Map();
  for (const { candidate, buffer } of inspected) {
    if (byRole.has(candidate.role)) throw preflightError(`duplicate reference candidate role ${candidate.role}`);
    const bytes = copyInspectedBuffer(buffer);
    const digest = sha256(bytes);
    if (digest !== candidate.sha256) throw preflightError(`reference candidate ${candidate.role} SHA-256 anchor is invalid`);
    if (byDigest.has(digest)) throw preflightError(`reference candidates ${byDigest.get(digest)} and ${candidate.role} reuse one digest across roles`);
    byDigest.set(digest, candidate.role);
    byRole.set(candidate.role, { role: candidate.role, sha256: digest, byteLength: bufferLength(bytes), bytes });
  }
  return byRole;
}

function assertExactKeys(value, keys, label) {
  assertObject(value, label);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
    throw preflightError(`${label} keys must be exactly, and in order: ${keys.join(', ')}`);
  }
}

function assertCanonicalTimestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    throw preflightError(`${label} must be a canonical UTC timestamp`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) throw preflightError(`${label} is not a real canonical timestamp`);
  return value;
}

function parseCanonicalJson(bytes, label, pretty = false) {
  const document = parseStrictJson(bytes, label);
  if (!bufferEquals(bytes, canonicalBytes(document, pretty))) throw preflightError(`${label} must use exact canonical JSON bytes`);
  return document;
}

function assertReferenceEquals(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw preflightError(`${label} does not match its lifecycle anchor`);
}

function priorReceiptAnchor(sequence, receipts) {
  if (sequence === 1) return null;
  const prior = receipts[sequence - 2];
  return { sha256: prior.sha256, byteLength: bufferLength(prior.bytes) };
}

function validatePriorReceipt(value, sequence, receipts, label) {
  const expected = priorReceiptAnchor(sequence, receipts);
  if (expected === null) {
    if (value !== null) throw preflightError(`${label} must be null for sequence one`);
    return null;
  }
  assertExactKeys(value, ['sha256', 'byteLength'], label);
  assertDigest(value.sha256, `${label}.sha256`);
  assertPositiveInteger(value.byteLength, `${label}.byteLength`);
  if (value.sha256 !== expected.sha256 || value.byteLength !== expected.byteLength) throw preflightError(`${label} does not bind the prior lifecycle receipt`);
  return { ...value };
}

function rejectForbiddenBindingKeys(value, label, ancestors = new Set()) {
  if (!value || typeof value !== 'object') return;
  if (ancestors.has(value)) throw preflightError(`${label} contains a cycle`);
  ancestors.add(value);
  try {
    for (const [key, child] of Object.entries(value)) {
      if (/^(?:currentReceipt|lifecycleHead|closure)(?:Id|Sha256|Digest|Bytes)?$/iu.test(key)) {
        throw preflightError(`${label} contains forbidden self-referential binding ${key}`);
      }
      rejectForbiddenBindingKeys(child, `${label}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function validateEnvelope(document, role, sequence, receipts, subject, policyRecord) {
  assertExactKeys(document, ENVELOPE_KEYS, `${role} document`);
  if (
    document.schemaVersion !== '1.0.0' || document.kind !== DOCUMENT_KIND || document.role !== role ||
    document.sequence !== sequence || document.scope !== 'fixture-only' ||
    document.productionEligible !== false || document.externalMutationAuthorized !== false ||
    document.authenticatedAuthority !== false || document.policySha256 !== policyRecord.sha256 ||
    document.chainId !== receipts[0].receipt.chainId || JSON.stringify(document.subject) !== JSON.stringify(subject) ||
    document.timestamp !== receipts[sequence - 1].receipt.observedAt
  ) {
    throw preflightError(`${role} document envelope does not match the fixture-only lifecycle identity`);
  }
  rejectForbiddenBindingKeys(document, `${role} document`);
  return document.payload;
}

function validateAuthorityPayload(payload, sequence, receipts, role) {
  assertExactKeys(payload, ['priorReceipt', 'authorityBoundary'], `${role} payload`);
  validatePriorReceipt(payload.priorReceipt, sequence, receipts, `${role} payload.priorReceipt`);
  assertExactKeys(payload.authorityBoundary, AUTHORITY_BOUNDARY_KEYS, `${role} authorityBoundary`);
  for (const key of AUTHORITY_BOUNDARY_KEYS) {
    if (payload.authorityBoundary[key] !== false) throw preflightError(`${role} authorityBoundary.${key} must remain false`);
  }
  return [];
}

function validateEvidencePayload(payload, sequence, receipts, role, authorityReference, policy) {
  assertExactKeys(payload, ['priorReceipt', 'authority', 'proof'], `${role} payload`);
  validatePriorReceipt(payload.priorReceipt, sequence, receipts, `${role} payload.priorReceipt`);
  const authority = normalizeReference(payload.authority, authorityReference.role, policy.limits.maxReferenceJsonBytes, `${role} payload.authority`);
  assertReferenceEquals(authority, authorityReference, `${role} authority reference`);
  return { authority, proof: payload.proof };
}

function validateSourceProof(proof, policy, subject) {
  assertExactKeys(proof, [
    'gitObjectFormat', 'sourceCommit', 'sourceTree', 'commitObject', 'treeObjects',
    'committedFiles', 'reviewedWorkflowBytes', 'releaseSpec'
  ], 'source proof');
  if (proof.gitObjectFormat !== 'sha1' || proof.sourceCommit !== subject.sourceCommit) throw preflightError('source proof commit identity is invalid');
  assertSha1(proof.sourceTree, 'source proof.sourceTree');
  const references = [];
  const commitObject = normalizeReference(proof.commitObject, 'source-commit-object', 1_048_576, 'source proof.commitObject');
  references.push(commitObject);
  const treeObjects = snapshotDenseArray(proof.treeObjects, 'source proof.treeObjects', policy.requiredGitTrees.length);
  if (treeObjects.length !== policy.requiredGitTrees.length) throw preflightError('source proof must contain the exact required Git tree inventory');
  const normalizedTrees = treeObjects.map((value, index) => {
    const expected = policy.requiredGitTrees[index];
    assertExactKeys(value, ['directory', 'objectId', 'reference'], `source proof.treeObjects[${index}]`);
    if (value.directory !== expected.directory) throw preflightError(`source proof tree directory ${index} drifted`);
    assertSha1(value.objectId, `source proof.treeObjects[${index}].objectId`);
    const reference = normalizeReference(value.reference, expected.role, 4_194_304, `source proof.treeObjects[${index}].reference`);
    references.push(reference);
    return { directory: value.directory, objectId: value.objectId, reference };
  });
  if (normalizedTrees[0].objectId !== proof.sourceTree) throw preflightError('source proof root tree object does not match sourceTree');
  const committedFiles = snapshotDenseArray(proof.committedFiles, 'source proof.committedFiles', policy.requiredCommittedPaths.length);
  if (committedFiles.length !== policy.requiredCommittedPaths.length) throw preflightError('source proof must contain the exact required committed-file inventory');
  const normalizedFiles = committedFiles.map((value, index) => {
    const expected = policy.requiredCommittedPaths[index];
    assertExactKeys(value, ['path', 'blobObjectId', 'reference'], `source proof.committedFiles[${index}]`);
    if (value.path !== expected.path) throw preflightError(`source proof committed path ${index} drifted`);
    assertSha1(value.blobObjectId, `source proof.committedFiles[${index}].blobObjectId`);
    const reference = normalizeReference(value.reference, expected.role, 4_194_304, `source proof.committedFiles[${index}].reference`);
    references.push(reference);
    return { path: value.path, blobObjectId: value.blobObjectId, reference };
  });
  assertExactKeys(proof.reviewedWorkflowBytes, ['path', 'reference'], 'source proof.reviewedWorkflowBytes');
  if (proof.reviewedWorkflowBytes.path !== policy.reviewedWorkflowBytes.path) throw preflightError('reviewed Pages workflow path drifted');
  const reviewedWorkflow = normalizeReference(
    proof.reviewedWorkflowBytes.reference,
    policy.reviewedWorkflowBytes.role,
    1_048_576,
    'source proof.reviewedWorkflowBytes.reference'
  );
  if (reviewedWorkflow.sha256 !== policy.reviewedWorkflowBytes.sha256) throw preflightError('reviewed Pages workflow bytes do not match the fixed byte lock');
  references.push(reviewedWorkflow);
  assertExactKeys(proof.releaseSpec, ['path', 'sha256', 'status', 'releaseDate'], 'source proof.releaseSpec');
  if (proof.releaseSpec.path !== subject.releaseSpecPath || proof.releaseSpec.sha256 !== subject.releaseSpecSha256 || proof.releaseSpec.status !== 'ready') {
    throw preflightError('source proof requires the exact ready release specification');
  }
  assertIsoDate(proof.releaseSpec.releaseDate, 'source proof.releaseSpec.releaseDate');
  return { references, sourceTree: proof.sourceTree, commitObject, treeObjects: normalizedTrees, committedFiles: normalizedFiles, reviewedWorkflow, releaseDate: proof.releaseSpec.releaseDate };
}

function assertIsoDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw preflightError(`${label} must be an ISO calendar date`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw preflightError(`${label} must be a real calendar date`);
  return value;
}

function normalizePortablePath(value, label) {
  if (
    typeof value !== 'string' || value.length === 0 || value.normalize('NFC') !== value ||
    value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/u.test(value) ||
    value.endsWith('/') || value.split('/').some(segment => segment === '' || segment === '.' || segment === '..')
  ) throw preflightError(`${label} is not a canonical portable relative path`);
  for (const segment of value.split('/')) {
    if (!/^[A-Za-z0-9._~-]+$/u.test(segment) || segment.endsWith('.') || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment)) {
      throw preflightError(`${label} contains a non-portable path segment`);
    }
  }
  return value;
}

function validateTagProof(proof, policy, subject) {
  assertExactKeys(proof, [
    'tagObjectId', 'tagObject', 'directTargetCommit', 'taggerEpochSeconds', 'taggerOffset',
    'taggerCalendarDate', 'protectedMain'
  ], 'annotated-tag proof');
  assertSha1(proof.tagObjectId, 'annotated-tag proof.tagObjectId');
  if (proof.directTargetCommit !== subject.sourceCommit) throw preflightError('annotated tag must directly target sourceCommit');
  if (!Number.isSafeInteger(proof.taggerEpochSeconds) || proof.taggerEpochSeconds < 0) throw preflightError('annotated-tag proof.taggerEpochSeconds is invalid');
  if (typeof proof.taggerOffset !== 'string' || !/^[+-](?:0\d|1[0-4])[0-5]\d$/u.test(proof.taggerOffset)) throw preflightError('annotated-tag proof.taggerOffset is invalid');
  assertIsoDate(proof.taggerCalendarDate, 'annotated-tag proof.taggerCalendarDate');
  const tagObject = normalizeReference(proof.tagObject, 'annotated-tag-object', 1_048_576, 'annotated-tag proof.tagObject');
  assertExactKeys(proof.protectedMain, ['ref', 'commit', 'directTargetContained', 'observationMode'], 'annotated-tag proof.protectedMain');
  if (
    proof.protectedMain.ref !== policy.subject.protectedMainRef || proof.protectedMain.commit !== subject.sourceCommit ||
    proof.protectedMain.directTargetContained !== true || proof.protectedMain.observationMode !== 'fixture-observed-not-authenticated'
  ) {
    throw preflightError('protected-main fact must remain an exact unauthenticated fixture observation');
  }
  return { references: [tagObject], tagObject, tagObjectId: proof.tagObjectId, taggerEpochSeconds: proof.taggerEpochSeconds, taggerOffset: proof.taggerOffset, taggerCalendarDate: proof.taggerCalendarDate };
}

function validateStableProof(proof, policy, subject) {
  assertExactKeys(proof, ['verificationTool', 'bundleManifest'], 'stable-bundle proof');
  assertExactKeys(proof.verificationTool, ['path', 'version', 'reference'], 'stable-bundle proof.verificationTool');
  if (proof.verificationTool.path !== 'scripts/verify-stable-bundle.mjs' || proof.verificationTool.version !== '1.0.0') throw preflightError('stable-bundle verifier identity is invalid');
  const tool = normalizeReference(proof.verificationTool.reference, 'committed-tool-stable-bundle-verifier', 4_194_304, 'stable-bundle proof.verificationTool.reference');
  const manifest = normalizeReference(proof.bundleManifest, 'stable-bundle-manifest', policy.limits.maxReferenceJsonBytes, 'stable-bundle proof.bundleManifest');
  return { references: [tool, manifest], tool, manifest, subject };
}

function validateBundleManifestPayload(payload, policy, subject, tagContext, sourceContext) {
  assertExactKeys(payload, ['assetStem', 'sourceCommit', 'releaseSpecPath', 'releaseSpecSha256', 'tagObjectId', 'assets'], 'stable bundle manifest payload');
  if (
    typeof payload.assetStem !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(payload.assetStem) || /candidate/iu.test(payload.assetStem) ||
    payload.sourceCommit !== subject.sourceCommit || payload.releaseSpecPath !== subject.releaseSpecPath ||
    payload.releaseSpecSha256 !== subject.releaseSpecSha256 || payload.tagObjectId !== tagContext.tagObjectId
  ) {
    throw preflightError('stable bundle manifest identity does not close over source, spec, and tag evidence');
  }
  const assets = snapshotDenseArray(payload.assets, 'stable bundle manifest assets', policy.stableAssetRoles.length);
  if (assets.length !== policy.stableAssetRoles.length) throw preflightError('stable bundle manifest must contain exactly four asset records');
  const references = [];
  const normalized = assets.map((asset, index) => {
    const expected = policy.stableAssetRoles[index];
    assertExactKeys(asset, ['name', 'sha256', 'byteLength', 'reference'], `stable bundle manifest assets[${index}]`);
    if (asset.name !== `${payload.assetStem}${expected.suffix}`) throw preflightError(`stable bundle asset ${index} name drifted`);
    assertDigest(asset.sha256, `stable bundle asset ${index} sha256`);
    assertPositiveInteger(asset.byteLength, `stable bundle asset ${index} byteLength`, roleMaximum(expected.role, policy));
    const reference = normalizeReference(asset.reference, expected.role, roleMaximum(expected.role, policy), `stable bundle asset ${index} reference`);
    if (reference.sha256 !== asset.sha256 || reference.byteLength !== asset.byteLength) throw preflightError(`stable bundle asset ${index} reference anchors drifted`);
    references.push(reference);
    return { name: asset.name, sha256: asset.sha256, byteLength: asset.byteLength, reference };
  });
  if (sourceContext.releaseDate !== tagContext.taggerCalendarDate) throw preflightError('source release date and annotated tagger date do not match');
  return { references, assetStem: payload.assetStem, assets: normalized };
}

function parseFixtureDocument(candidate, role, sequence, receipts, subject, policyRecord) {
  const document = parseCanonicalJson(candidate.bytes, role);
  const payload = validateEnvelope(document, role, sequence, receipts, subject, policyRecord);
  return { document, payload };
}

function validateRootDocument(candidate, context) {
  const { policy, policyRecord, receipts, subject, rootReferences } = context;
  const roleIndex = policy.lifecycleReferenceRoles.indexOf(candidate.role);
  if (roleIndex < 0) throw preflightError(`unsupported lifecycle root role ${candidate.role}`);
  const sequence = Math.floor(roleIndex / 2) + 1;
  const { payload } = parseFixtureDocument(candidate, candidate.role, sequence, receipts, subject, policyRecord);
  const isAuthority = roleIndex % 2 === 1;
  if (isAuthority) return { references: validateAuthorityPayload(payload, sequence, receipts, candidate.role), detail: null };
  const authorityReference = rootReferences.get(policy.lifecycleReferenceRoles[roleIndex + 1]);
  const evidence = validateEvidencePayload(payload, sequence, receipts, candidate.role, authorityReference, policy);
  if (sequence === 1) {
    const detail = validateSourceProof(evidence.proof, policy, subject);
    return { references: [evidence.authority, ...detail.references], detail };
  }
  if (sequence === 2) {
    const detail = validateTagProof(evidence.proof, policy, subject);
    return { references: [evidence.authority, ...detail.references], detail };
  }
  const detail = validateStableProof(evidence.proof, policy, subject);
  return { references: [evidence.authority, ...detail.references], detail };
}

function validateReadyReleaseSpec(candidate, subject, sourceContext) {
  const spec = parseCanonicalJson(candidate.bytes, 'committed release specification', true);
  const keys = [
    'schemaVersion', 'status', 'tag', 'version', 'edition', 'releaseDate', 'releaseState',
    'defaultBranch', 'protectedMainRef', 'productionEnvironment', 'productionBaseUrl',
    'prerelease', 'assetStem'
  ];
  assertExactKeys(spec, keys, 'committed release specification');
  if (
    spec.schemaVersion !== '1.0.0' || spec.status !== 'ready' || spec.tag !== subject.tag ||
    spec.version !== subject.version || spec.releaseDate !== sourceContext.releaseDate ||
    spec.releaseState !== 'Public beta' || spec.defaultBranch !== EXPECTED_POLICY.subject.defaultBranch ||
    spec.protectedMainRef !== EXPECTED_POLICY.subject.protectedMainRef ||
    spec.productionEnvironment !== 'github-pages' ||
    spec.productionBaseUrl !== 'https://neb6dav.github.io/ai_tech_tree/' ||
    spec.prerelease !== true || spec.assetStem !== `ai-research-tech-tree-v${subject.version}` ||
    typeof spec.edition !== 'string' || !/^\d{4}-\d{2}-\d{2}-[A-Za-z0-9._~-]+$/u.test(spec.edition)
  ) {
    throw preflightError('committed release specification is not the exact ready v0.1.1 identity');
  }
  assertIsoDate(spec.edition.slice(0, 10), 'committed release specification edition date');
  if (candidate.sha256 !== subject.releaseSpecSha256) throw preflightError('committed release specification digest does not match subject');
  return spec;
}

function validateCommittedJson(candidate, policy) {
  const document = parseCanonicalJson(candidate.bytes, candidate.role, true);
  if (candidate.role === 'committed-policy-promotion-preflight' && !bufferEquals(candidate.bytes, EXPECTED_POLICY_BYTES)) {
    throw preflightError('committed preflight policy bytes drifted from the executing trust anchor');
  }
  if (candidate.role === 'committed-policy-promotion-lifecycle' && candidate.sha256 !== LIFECYCLE_POLICY_SHA256) {
    throw preflightError('committed lifecycle policy bytes drifted from the executing trust anchor');
  }
  if (candidate.role === 'committed-policy-github-promotion' && candidate.sha256 !== GITHUB_POLICY_SHA256) {
    throw preflightError('committed GitHub control policy bytes drifted from the B1 trust anchor');
  }
  if (candidate.role === 'committed-policy-pages-stage') {
    if (document.schemaVersion !== '1.1.0') throw preflightError('committed Pages stage policy schema drifted');
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw preflightError(`${candidate.role} must contain a JSON object`);
  return document;
}

function parseGitCommit(bytes, expectedCommit, expectedTree) {
  if (gitObjectId('commit', bytes) !== expectedCommit) throw preflightError('raw source commit bytes do not recompute to sourceCommit');
  const text = bufferToString(bytes, 'utf8');
  if (!bufferEquals(BUFFER_FROM(text, 'utf8'), bytes) || text.includes('\0')) throw preflightError('raw source commit must be valid non-NUL UTF-8');
  const boundary = text.indexOf('\n\n');
  if (boundary < 0) throw preflightError('raw source commit lacks a header boundary');
  const headers = text.slice(0, boundary).split('\n');
  const trees = headers.filter(line => line.startsWith('tree '));
  if (trees.length !== 1 || !/^tree [0-9a-f]{40}$/u.test(trees[0])) throw preflightError('raw source commit must contain exactly one SHA-1 tree header');
  if (trees[0].slice(5) !== expectedTree) throw preflightError('raw source commit tree header does not match sourceTree');
}

function decodeTreeName(bytes, label) {
  const value = bufferToString(bytes, 'utf8');
  if (!bufferEquals(BUFFER_FROM(value, 'utf8'), bytes) || value.length === 0 || value === '.' || value === '..' || value.includes('/') || value.includes('\0')) {
    throw preflightError(`${label} has an invalid Git tree name`);
  }
  return value;
}

function parseGitTree(bytes, expectedObjectId, maximumEntries) {
  if (gitObjectId('tree', bytes) !== expectedObjectId) throw preflightError(`raw Git tree bytes do not recompute to ${expectedObjectId}`);
  const entries = [];
  const names = new Set();
  let offset = 0;
  let priorSortKey = null;
  while (offset < bufferLength(bytes)) {
    if (entries.length >= maximumEntries) throw preflightError('raw Git tree exceeds its entry bound');
    const space = bufferIndexOf(bytes, 0x20, offset);
    const nul = space < 0 ? -1 : bufferIndexOf(bytes, 0x00, space + 1);
    if (space <= offset || nul <= space + 1 || nul + 21 > bufferLength(bytes)) throw preflightError('raw Git tree has malformed or trailing bytes');
    const mode = bufferToString(bufferSubarray(bytes, offset, space), 'ascii');
    if (!['40000', '100644', '100755'].includes(mode)) throw preflightError(`raw Git tree rejects unsupported mode ${mode}`);
    const nameBytes = bufferSubarray(bytes, space + 1, nul);
    const name = decodeTreeName(nameBytes, 'raw Git tree entry');
    if (names.has(name)) throw preflightError(`raw Git tree contains duplicate entry ${name}`);
    names.add(name);
    const objectId = bufferToString(bufferSubarray(bytes, nul + 1, nul + 21), 'hex');
    const sortKey = BUFFER_FROM(`${name}${mode === '40000' ? '/' : ''}`, 'utf8');
    if (priorSortKey !== null && BUFFER_COMPARE(priorSortKey, sortKey) >= 0) throw preflightError('raw Git tree entries are not in canonical Git order');
    priorSortKey = sortKey;
    entries.push({ mode, name, objectId });
    offset = nul + 21;
  }
  if (offset !== bufferLength(bytes) || entries.length === 0) throw preflightError('raw Git tree is empty or has trailing bytes');
  return entries;
}

function validateGitProof(sourceContext, candidates, policy, subject) {
  const commitCandidate = candidates.get(sourceContext.commitObject.role);
  parseGitCommit(commitCandidate.bytes, subject.sourceCommit, sourceContext.sourceTree);
  const objectBytes = new Map();
  const trees = new Map();
  for (const tree of sourceContext.treeObjects) {
    const candidate = candidates.get(tree.reference.role);
    const priorDigest = objectBytes.get(tree.objectId);
    if (priorDigest !== undefined && priorDigest !== candidate.sha256) throw preflightError('one Git tree object ID was supplied with different bytes');
    objectBytes.set(tree.objectId, candidate.sha256);
    trees.set(tree.directory, { objectId: tree.objectId, entries: parseGitTree(candidate.bytes, tree.objectId, policy.limits.maxGitTreeEntries) });
  }
  for (const tree of sourceContext.treeObjects.slice(1)) {
    const slash = tree.directory.lastIndexOf('/');
    const parentDirectory = slash < 0 ? '' : tree.directory.slice(0, slash);
    const name = slash < 0 ? tree.directory : tree.directory.slice(slash + 1);
    const parent = trees.get(parentDirectory);
    const entry = parent?.entries.find(item => item.name === name);
    if (!entry || entry.mode !== '40000' || entry.objectId !== tree.objectId) throw preflightError(`Git tree proof does not traverse directory ${tree.directory}`);
  }
  const workflowEntries = trees.get('.github/workflows')?.entries || [];
  if (JSON.stringify(workflowEntries.map(entry => ({ mode: entry.mode, name: entry.name }))) !== JSON.stringify([
    { mode: '100644', name: 'pages.yml' },
    { mode: '100644', name: 'validate.yml' }
  ])) throw preflightError('proven workflow tree must contain exactly pages.yml and validate.yml as regular files');
  for (const file of sourceContext.committedFiles) {
    const candidate = candidates.get(file.reference.role);
    const actualBlobId = gitObjectId('blob', candidate.bytes);
    if (actualBlobId !== file.blobObjectId) throw preflightError(`committed file bytes do not recompute to blob ${file.path}`);
    const priorDigest = objectBytes.get(actualBlobId);
    if (priorDigest !== undefined && priorDigest !== candidate.sha256) throw preflightError('one Git object ID was supplied with different bytes');
    objectBytes.set(actualBlobId, candidate.sha256);
    const slash = file.path.lastIndexOf('/');
    const directory = slash < 0 ? '' : file.path.slice(0, slash);
    const name = slash < 0 ? file.path : file.path.slice(slash + 1);
    const parent = trees.get(directory);
    const entry = parent?.entries.find(item => item.name === name);
    if (!entry || !['100644', '100755'].includes(entry.mode) || entry.objectId !== actualBlobId) throw preflightError(`Git tree proof does not bind regular file ${file.path}`);
  }
  const validateWorkflow = candidates.get('committed-workflow-validate');
  if (validateWorkflow.sha256 !== policy.reviewedValidationWorkflowSha256) throw preflightError('validate.yml bytes drifted from the reviewed workflow byte lock');
  const pagesWorkflow = candidates.get(policy.reviewedWorkflowBytes.role);
  if (pagesWorkflow.sha256 !== policy.reviewedWorkflowBytes.sha256) throw preflightError('pages.yml bytes drifted from the reviewed workflow byte lock');
}

function offsetCalendarDate(epochSeconds, offset) {
  const sign = offset[0] === '+' ? 1 : -1;
  const minutes = Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3, 5));
  return new Date((epochSeconds + sign * minutes * 60) * 1000).toISOString().slice(0, 10);
}

function offsetIsoTimestamp(epochSeconds, offset) {
  const sign = offset[0] === '+' ? 1 : -1;
  const hours = Number(offset.slice(1, 3));
  const minutes = Number(offset.slice(3, 5));
  const local = new Date((epochSeconds + sign * (hours * 60 + minutes) * 60) * 1000).toISOString().slice(0, 19);
  return `${local}${offset[0]}${offset.slice(1, 3)}:${offset.slice(3, 5)}`;
}

function parseAnnotatedTag(bytes, context, subject) {
  if (gitObjectId('tag', bytes) !== context.tagObjectId) throw preflightError('raw annotated-tag bytes do not recompute to tagObjectId');
  const text = bufferToString(bytes, 'utf8');
  if (!bufferEquals(BUFFER_FROM(text, 'utf8'), bytes) || text.includes('\0')) throw preflightError('raw annotated tag must be valid non-NUL UTF-8');
  const boundary = text.indexOf('\n\n');
  if (boundary < 0) throw preflightError('raw annotated tag lacks a header boundary');
  const headers = text.slice(0, boundary).split('\n');
  const objects = headers.filter(line => line.startsWith('object '));
  const types = headers.filter(line => line.startsWith('type '));
  const tags = headers.filter(line => line.startsWith('tag '));
  const taggers = headers.filter(line => line.startsWith('tagger '));
  if (objects.length !== 1 || objects[0] !== `object ${subject.sourceCommit}`) throw preflightError('annotated tag must directly target sourceCommit');
  if (types.length !== 1 || types[0] !== 'type commit') throw preflightError('annotated tag must directly target a commit, not a tag or other object');
  if (tags.length !== 1 || tags[0] !== `tag ${subject.tag}`) throw preflightError('annotated tag header has the wrong tag name');
  if (taggers.length !== 1) throw preflightError('annotated tag must contain exactly one tagger header');
  const match = /^tagger .+ <[^<>\n]+> ([0-9]+) ([+-](?:0\d|1[0-4])[0-5]\d)$/u.exec(taggers[0]);
  if (!match) throw preflightError('annotated tag tagger header is malformed');
  const epoch = Number(match[1]);
  if (!Number.isSafeInteger(epoch) || epoch !== context.taggerEpochSeconds || match[2] !== context.taggerOffset) throw preflightError('annotated tag tagger time does not match its normalized wrapper');
  if (offsetCalendarDate(epoch, match[2]) !== context.taggerCalendarDate) throw preflightError('annotated tag tagger calendar date does not match its raw object');
}

function validateStableReleaseManifest(candidate, bundleContext, sourceContext, tagContext, subject, candidates) {
  const manifest = parseCanonicalJson(candidate.bytes, 'stable release manifest asset', true);
  const readySpec = parseCanonicalJson(candidates.get('committed-release-spec').bytes, 'committed release specification', true);
  const topKeys = [
    'schemaVersion', 'stageConfigVersion', 'stageConfig', 'edition', 'version', 'releaseState',
    'commit', 'publicationMode', 'releaseSpec', 'tag', 'promotion', 'sourceState',
    'generatorVersion', 'dataDigest', 'toolchain', 'manifest', 'fileCount', 'totalBytes', 'files'
  ];
  assertExactKeys(manifest, topKeys, 'stable release manifest');
  if (
    manifest.schemaVersion !== '1.4.0' || manifest.stageConfigVersion !== '1.1.0' ||
    manifest.version !== subject.version || manifest.commit !== subject.sourceCommit ||
    manifest.publicationMode !== 'release' || manifest.tag !== subject.tag ||
    manifest.releaseState !== 'Public beta' || manifest.edition !== readySpec.edition ||
    !DIGEST.test(manifest.dataDigest || '') || typeof manifest.generatorVersion !== 'string' ||
    manifest.generatorVersion.length < 1 || manifest.generatorVersion.length > 128 ||
    manifest.generatorVersion.trim() !== manifest.generatorVersion || /[\u0000-\u001f\u007f]/u.test(manifest.generatorVersion)
  ) throw preflightError('stable release manifest top-level identity is invalid');
  assertExactKeys(manifest.stageConfig, ['path', 'sha256'], 'stable release manifest.stageConfig');
  const stageConfig = candidates.get('committed-policy-pages-stage');
  if (manifest.stageConfig.path !== 'config/pages-stage.v1.json' || manifest.stageConfig.sha256 !== stageConfig.sha256) throw preflightError('stable manifest stageConfig is not the committed proven bytes');
  assertExactKeys(manifest.releaseSpec, [
    'path', 'sha256', 'schemaVersion', 'status', 'tag', 'version', 'edition', 'releaseDate',
    'releaseState', 'defaultBranch', 'protectedMainRef', 'productionEnvironment',
    'productionBaseUrl', 'prerelease', 'assetStem'
  ], 'stable release manifest.releaseSpec');
  const expectedManifestSpec = { path: subject.releaseSpecPath, sha256: subject.releaseSpecSha256, ...readySpec };
  if (JSON.stringify(manifest.releaseSpec) !== JSON.stringify(expectedManifestSpec) || manifest.releaseSpec.releaseDate !== sourceContext.releaseDate || manifest.releaseSpec.assetStem !== bundleContext.assetStem) throw preflightError('stable release manifest releaseSpec identity is invalid');
  assertExactKeys(manifest.promotion, ['releaseDate', 'tag', 'mode', 'tagObject', 'tagCommit', 'taggedAt', 'protectedMainRef', 'protectedMainCommit', 'reachableFromProtectedMain'], 'stable release manifest.promotion');
  if (
    manifest.promotion.releaseDate !== tagContext.taggerCalendarDate || manifest.promotion.tag !== subject.tag ||
    manifest.promotion.mode !== 'annotated-tag' || manifest.promotion.tagObject !== tagContext.tagObjectId ||
    manifest.promotion.tagCommit !== subject.sourceCommit || manifest.promotion.protectedMainRef !== EXPECTED_POLICY.subject.protectedMainRef ||
    manifest.promotion.protectedMainCommit !== subject.sourceCommit || manifest.promotion.reachableFromProtectedMain !== true
  ) throw preflightError('stable release manifest promotion facts do not match the raw tag fixture proof');
  if (
    typeof manifest.promotion.taggedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/u.test(manifest.promotion.taggedAt) ||
    manifest.promotion.taggedAt !== offsetIsoTimestamp(tagContext.taggerEpochSeconds, tagContext.taggerOffset) ||
    manifest.promotion.taggedAt.slice(0, 10) !== sourceContext.releaseDate
  ) throw preflightError('stable release manifest taggedAt does not match the canonical raw tag time');
  assertExactKeys(manifest.sourceState, [
    'kind', 'clean', 'requiredClean', 'repositoryTopLevel', 'repositoryRootMatchesTopLevel',
    'gitObjectFormat', 'objectDatabaseVerified', 'repositoryFsckConfigurationIsolated',
    'repositoryAttributesIsolated', 'trackedTreeEntryCount', 'trackedTreeFilterAttributeCount',
    'trackedTreeFiltersVerified', 'trackedTreeFilterAuditSha256', 'head', 'commitMatchesHead',
    'changedEntryCount', 'statusSha256', 'flaggedIndexEntryCount', 'indexFlagsSha256',
    'inputCount', 'matchedInputCount', 'directorySourceCount', 'matchedDirectorySourceCount',
    'inputsMatchCommit', 'inputVerificationSha256'
  ], 'stable release manifest.sourceState');
  const source = manifest.sourceState;
  if (
    source.kind !== 'git' || source.gitObjectFormat !== 'sha1' || source.head !== subject.sourceCommit ||
    source.commitMatchesHead !== true || source.clean !== true || source.requiredClean !== true ||
    source.repositoryTopLevel !== '.' || source.repositoryRootMatchesTopLevel !== true ||
    source.objectDatabaseVerified !== true || source.repositoryFsckConfigurationIsolated !== true ||
    source.repositoryAttributesIsolated !== true || source.trackedTreeFiltersVerified !== true ||
    source.trackedTreeFilterAttributeCount !== 0 || source.changedEntryCount !== 0 ||
    source.flaggedIndexEntryCount !== 0 || source.inputsMatchCommit !== true
  ) throw preflightError('stable release manifest does not carry strict clean committed source facts');
  for (const key of ['trackedTreeFilterAuditSha256', 'statusSha256', 'indexFlagsSha256', 'inputVerificationSha256']) assertDigest(source[key], `stable sourceState.${key}`);
  if (!Number.isSafeInteger(source.trackedTreeEntryCount) || source.trackedTreeEntryCount < 1) throw preflightError('stable source tree count is invalid');
  if (!Number.isSafeInteger(source.inputCount) || source.inputCount < 1 || source.inputCount !== source.matchedInputCount || !Number.isSafeInteger(source.directorySourceCount) || source.directorySourceCount < 0 || source.directorySourceCount !== source.matchedDirectorySourceCount) throw preflightError('stable source input inventory is invalid');
  assertExactKeys(manifest.toolchain, ['node', 'npm', 'packageLockVersion', 'releaseRef', 'stageSite'], 'stable release manifest.toolchain');
  if (!/^v24\.\d+\.\d+$/u.test(manifest.toolchain.node) || !/^11\.\d+\.\d+$/u.test(manifest.toolchain.npm) || manifest.toolchain.packageLockVersion !== 3 || manifest.toolchain.releaseRef !== '1.0.0' || manifest.toolchain.stageSite !== '1.4.0') throw preflightError('stable release manifest toolchain is unsupported');
  assertExactKeys(manifest.manifest, ['path', 'selfHashExcluded', 'filesCoverage', 'filesExcluded'], 'stable release manifest.manifest');
  if (manifest.manifest.path !== 'release-manifest.json' || manifest.manifest.selfHashExcluded !== true || manifest.manifest.filesCoverage !== 'all-payload-files' || JSON.stringify(manifest.manifest.filesExcluded) !== '["release-manifest.json"]') throw preflightError('stable release manifest self-coverage contract is invalid');
  const files = snapshotDenseArray(manifest.files, 'stable release manifest.files', EXPECTED_POLICY.limits.maxStableManifestFiles - 1);
  let totalBytes = 0;
  let priorPath = null;
  const foldedManifestPaths = new Set();
  for (const [index, file] of files.entries()) {
    assertExactKeys(file, ['path', 'mediaType', 'bytes', 'sha256'], `stable release manifest.files[${index}]`);
    normalizePortablePath(file.path, `stable manifest file ${index} path`);
    if (file.path === 'release-manifest.json') throw preflightError('stable manifest file inventory must exclude the manifest itself');
    const foldedPath = file.path.normalize('NFC').toLowerCase();
    if (foldedManifestPaths.has(foldedPath)) throw preflightError('stable manifest contains a duplicate or case-colliding path');
    foldedManifestPaths.add(foldedPath);
    if (priorPath !== null && BUFFER_COMPARE(BUFFER_FROM(priorPath), BUFFER_FROM(file.path)) >= 0) throw preflightError('stable manifest file inventory is not uniquely byte-sorted');
    if (typeof file.mediaType !== 'string' || file.mediaType.length === 0 || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > 16_777_216) throw preflightError('stable manifest file metadata is invalid');
    assertDigest(file.sha256, `stable manifest file ${index} sha256`);
    priorPath = file.path;
    totalBytes += file.bytes;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > 67_108_864) throw preflightError('stable manifest payload exceeds its reviewed bound');
  }
  if (manifest.fileCount !== files.length || manifest.totalBytes !== totalBytes) throw preflightError('stable release manifest aggregates do not close');
  return manifest;
}

function validateChecksums(bytes, bundleContext) {
  const text = bufferToString(bytes, 'utf8');
  if (!bufferEquals(BUFFER_FROM(text, 'utf8'), bytes) || !text.endsWith('\n') || text.includes('\r') || text.includes('\0')) throw preflightError('SHA256SUMS must be canonical UTF-8 LF text');
  const lines = text.slice(0, -1).split('\n');
  if (lines.length !== 3) throw preflightError('SHA256SUMS must cover exactly the three non-checksum stable assets');
  const expected = bundleContext.assets.filter(asset => !asset.name.endsWith('.SHA256SUMS')).sort((left, right) => BUFFER_COMPARE(BUFFER_FROM(left.name), BUFFER_FROM(right.name)));
  const actual = lines.map((line, index) => {
    const match = /^([0-9a-f]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)$/u.exec(line);
    if (!match) throw preflightError(`SHA256SUMS line ${index + 1} is malformed`);
    return { sha256: match[1], name: match[2] };
  });
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index].name !== expected[index].name || actual[index].sha256 !== expected[index].sha256) throw preflightError('SHA256SUMS does not close over the stable asset digests');
  }
}

function decodeChangelogUtf8(bytes) {
  const text = bufferToString(bytes, 'utf8');
  if (!bufferEquals(BUFFER_FROM(text, 'utf8'), bytes)) throw preflightError('committed CHANGELOG must be valid UTF-8');
  if (text.startsWith('\ufeff')) throw preflightError('committed CHANGELOG must not contain a UTF-8 BOM');
  if (text.includes('\0')) throw preflightError('committed CHANGELOG must not contain NUL bytes');
  if (/\r(?!\n)/u.test(text)) throw preflightError('committed CHANGELOG must not contain lone carriage returns');
  return text.replaceAll('\r\n', '\n');
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function readyChangelogSection(releaseSpec) {
  const tokenPattern = escapeRegularExpression(releaseSpec.version);
  return {
    heading: `## [${releaseSpec.version}] - ${releaseSpec.releaseDate}`,
    headingLabel: `[${releaseSpec.version}]`,
    sectionLabel: `frozen v${releaseSpec.version} changes`,
    tokenPattern
  };
}

function containsReadyHeading(line, section) {
  return new RegExp(
    `^[ ]{0,3}#{1,6}[ \\t]+\\[${section.tokenPattern}\\](?:[ \\t]+.*)?$`,
    'iu'
  ).test(line.trimStart());
}

function stripChangelogHtmlComments(line, state, section) {
  let remainder = line;
  let visible = '';
  while (remainder.length > 0) {
    if (state.inComment) {
      const end = remainder.indexOf('-->');
      const hidden = end < 0 ? remainder : remainder.slice(0, end);
      if (containsReadyHeading(hidden, section)) throw preflightError(`committed CHANGELOG hides a ${section.headingLabel} heading inside an HTML comment`);
      if (end < 0) return visible;
      state.inComment = false;
      const suffix = remainder.slice(end + 3);
      if (suffix.trim() !== '') throw preflightError('committed CHANGELOG HTML comments must occupy standalone physical lines');
      remainder = suffix;
      continue;
    }
    const start = remainder.indexOf('<!--');
    if (start < 0) return visible + remainder;
    const prefix = remainder.slice(0, start);
    if (prefix.trim() !== '') throw preflightError('committed CHANGELOG HTML comments must occupy standalone physical lines');
    visible += prefix;
    state.inComment = true;
    remainder = remainder.slice(start + 4);
  }
  return visible;
}

function extractReadyChangelogSection(changelogBytes, releaseSpec) {
  const text = decodeChangelogUtf8(changelogBytes);
  const section = readyChangelogSection(releaseSpec);
  const state = { inComment: false, fence: null };
  const visibleLines = [];
  const headings = [];
  for (const originalLine of text.split('\n')) {
    if (state.fence !== null) {
      const line = originalLine;
      if (containsReadyHeading(line, section)) throw preflightError(`committed CHANGELOG hides a ${section.headingLabel} heading inside a fenced block`);
      visibleLines.push(line);
      const close = new RegExp(`^[ ]{0,3}${state.fence.character}{${state.fence.length},}[ \\t]*$`, 'u');
      if (close.test(line)) state.fence = null;
      continue;
    }
    if (!state.inComment && /^(?: {4,}| {0,3}\t).*<!--/u.test(originalLine)) {
      throw preflightError('committed CHANGELOG contains an unsupported indented-code HTML comment opener');
    }
    const line = stripChangelogHtmlComments(originalLine, state, section);
    if (/^[ ]{0,3}(?:-+|=+)[ \t]*$/u.test(line) && (visibleLines.at(-1) || '').trim() !== '') {
      const previousIsTarget = new RegExp(
        `^[ ]{0,3}\\[${section.tokenPattern}\\][ \\t]+-[ \\t]+${escapeRegularExpression(releaseSpec.releaseDate)}[ \\t]*$`,
        'iu'
      ).test(visibleLines.at(-1));
      if (previousIsTarget) throw preflightError(`committed CHANGELOG contains an ambiguous Setext ${section.headingLabel} heading`);
      throw preflightError('committed CHANGELOG contains an unsupported Setext heading');
    }
    if (/<(?:\/?[A-Za-z][A-Za-z0-9-]*(?=[ \t/>]|$)|[!?])/u.test(line)) throw preflightError('committed CHANGELOG contains an unsupported raw HTML block');
    const opening = /^[ ]{0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
      state.fence = { character: opening[1][0], length: opening[1].length };
      visibleLines.push(line);
      continue;
    }
    if (containsReadyHeading(line, section) && line !== section.heading) throw preflightError(`committed CHANGELOG contains a malformed or ambiguous ${section.headingLabel} heading`);
    if (/^[ ]{1,3}#{1,2}(?:[ \t]+|$)/u.test(line)) throw preflightError('committed CHANGELOG contains an unsupported indented ATX H1 or H2 heading');
    const lineIndex = visibleLines.length;
    visibleLines.push(line);
    if (/^#{1,2}(?:[ \t]+|$)/u.test(line)) headings.push({ index: lineIndex, line });
  }
  if (state.inComment) throw preflightError('committed CHANGELOG contains an unterminated HTML comment');
  if (state.fence !== null) throw preflightError('committed CHANGELOG contains an unterminated fenced block');
  const matching = headings.filter(heading => heading.line === section.heading);
  if (matching.length !== 1) throw preflightError(`committed CHANGELOG must contain exactly one visible ${section.heading} heading`);
  const start = matching[0].index + 1;
  const nextHeading = headings.find(heading => heading.index >= start);
  const end = nextHeading?.index ?? visibleLines.length;
  const bodyLines = visibleLines.slice(start, end);
  while (bodyLines.length > 0 && bodyLines[0].trim() === '') bodyLines.shift();
  while (bodyLines.length > 0 && bodyLines.at(-1).trim() === '') bodyLines.pop();
  if (bodyLines.length === 0) throw preflightError(`committed CHANGELOG ${section.headingLabel} section must not be empty`);
  return { body: `${bodyLines.join('\n')}\n`, section };
}

function stableNotesBytes(manifest, changelogBytes) {
  const changes = extractReadyChangelogSection(changelogBytes, manifest.releaseSpec);
  const promotion = manifest.promotion;
  return BUFFER_FROM([
    `# ${manifest.releaseSpec.assetStem} stable release assets`,
    '',
    '> Locally verified artifact package. These files do not attest a GitHub Release, an environment approval, a deployment, or public post-deployment verification.',
    '',
    `- Version: \`${manifest.version}\``,
    `- Edition: \`${manifest.edition}\``,
    `- Release date: \`${manifest.releaseSpec.releaseDate}\``,
    `- Tag: \`${manifest.tag}\``,
    `- Tag object: \`${promotion.tagObject}\``,
    `- Tagged at: \`${promotion.taggedAt}\``,
    `- Commit: \`${manifest.commit}\``,
    `- Data digest: \`${manifest.dataDigest}\``,
    `- Protected-main ref: \`${promotion.protectedMainRef}\``,
    `- Protected-main commit: \`${promotion.protectedMainCommit}\``,
    `- Prerelease: \`${manifest.releaseSpec.prerelease}\``,
    '- Publication mode: `release`',
    '',
    changes.section.heading,
    '',
    changes.body.trimEnd(),
    ''
  ].join('\n'), 'utf8');
}

function validateStableNotes(bytes, manifest, changelogBytes) {
  const expected = stableNotesBytes(manifest, changelogBytes);
  if (!bufferEquals(bytes, expected)) throw preflightError('stable notes are not the exact committed-CHANGELOG builder projection');
}

function parseTarOctal(bytes, label, { checksum = false } = {}) {
  const length = bufferLength(bytes);
  const digitLength = checksum ? length - 2 : length - 1;
  const digitsBytes = bufferSubarray(bytes, 0, digitLength);
  const terminator = checksum
    ? bytes[length - 2] === 0 && bytes[length - 1] === 0x20
    : bytes[length - 1] === 0;
  if (!terminator || !UINT8_ARRAY_EVERY.call(digitsBytes, byte => byte >= 0x30 && byte <= 0x37)) throw preflightError(`${label} is not canonical USTAR octal`);
  const value = Number.parseInt(bufferToString(digitsBytes, 'ascii'), 8);
  if (!Number.isSafeInteger(value) || value < 0) throw preflightError(`${label} is outside safe bounds`);
  return value;
}

function tarString(bytes, label) {
  const end = bufferIndexOf(bytes, 0);
  const content = bufferSubarray(bytes, 0, end < 0 ? bufferLength(bytes) : end);
  if (!UINT8_ARRAY_EVERY.call(content, byte => byte >= 0x20 && byte <= 0x7e)) throw preflightError(`${label} is not printable ASCII`);
  if (end >= 0 && !UINT8_ARRAY_EVERY.call(bufferSubarray(bytes, end), byte => byte === 0)) throw preflightError(`${label} contains data after its NUL terminator`);
  return bufferToString(content, 'ascii');
}

function canonicalTarSplit(archivePath) {
  if (BUFFER_BYTE_LENGTH(archivePath, 'utf8') <= 100) return { name: archivePath, prefix: '' };
  for (let index = archivePath.length - 1; index >= 0; index -= 1) {
    if (archivePath[index] !== '/') continue;
    const prefix = archivePath.slice(0, index);
    const name = archivePath.slice(index + 1);
    if (BUFFER_BYTE_LENGTH(prefix, 'utf8') <= 155 && BUFFER_BYTE_LENGTH(name, 'utf8') <= 100) return { name, prefix };
  }
  throw preflightError('stable tar path cannot use a canonical USTAR split');
}

function validateStableTar(bytes, assetStem, releaseManifest, manifestBytes, maximumEntries) {
  if (bufferLength(bytes) < 1536 || bufferLength(bytes) % 512 !== 0) throw preflightError('stable tar has invalid block framing');
  const entries = new Map();
  const foldedTarPaths = new Set();
  let offset = 0;
  let priorRelative = null;
  let payloadBytes = 0;
  while (offset + 1024 <= bufferLength(bytes)) {
    const header = bufferSubarray(bytes, offset, offset + 512);
    const allZero = UINT8_ARRAY_EVERY.call(header, byte => byte === 0);
    if (allZero) {
      const second = bufferSubarray(bytes, offset + 512, offset + 1024);
      if (!UINT8_ARRAY_EVERY.call(second, byte => byte === 0) || offset + 1024 !== bufferLength(bytes)) throw preflightError('stable tar must end with exactly two zero blocks');
      break;
    }
    if (entries.size >= maximumEntries) throw preflightError('stable tar exceeds its reviewed entry bound');
    if (header[156] !== 0x30 || bufferToString(bufferSubarray(header, 257, 263), 'binary') !== 'ustar\0') throw preflightError('stable tar contains a non-regular or non-USTAR entry');
    for (const [start, end, label] of [[157, 257, 'linkname'], [265, 297, 'uname'], [297, 329, 'gname'], [329, 337, 'device major'], [337, 345, 'device minor'], [500, 512, 'reserved header']]) {
      if (!UINT8_ARRAY_EVERY.call(bufferSubarray(header, start, end), byte => byte === 0)) throw preflightError(`stable tar has unsupported nonzero ${label}`);
    }
    if (
      parseTarOctal(bufferSubarray(header, 100, 108), 'stable tar mode') !== 0o644 ||
      parseTarOctal(bufferSubarray(header, 108, 116), 'stable tar uid') !== 0 ||
      parseTarOctal(bufferSubarray(header, 116, 124), 'stable tar gid') !== 0 ||
      parseTarOctal(bufferSubarray(header, 136, 148), 'stable tar mtime') !== 0 ||
      tarString(bufferSubarray(header, 263, 265)) !== '00'
    ) throw preflightError('stable tar header metadata is not the canonical deterministic profile');
    const recordedChecksum = parseTarOctal(bufferSubarray(header, 148, 156), 'stable tar header checksum', { checksum: true });
    const checksumHeader = BUFFER_FROM(header);
    UINT8_ARRAY_FILL.call(checksumHeader, 0x20, 148, 156);
    let checksum = 0;
    for (let index = 0; index < bufferLength(checksumHeader); index += 1) checksum += checksumHeader[index];
    if (checksum !== recordedChecksum) throw preflightError('stable tar header checksum is invalid');
    const name = tarString(bufferSubarray(header, 0, 100), 'stable tar name');
    const prefix = tarString(bufferSubarray(header, 345, 500), 'stable tar prefix');
    const fullName = prefix ? `${prefix}/${name}` : name;
    normalizePortablePath(fullName, 'stable tar path');
    const canonicalSplit = canonicalTarSplit(fullName);
    if (canonicalSplit.name !== name || canonicalSplit.prefix !== prefix) throw preflightError('stable tar path does not use its canonical name/prefix split');
    const root = `${assetStem}/`;
    if (!fullName.startsWith(root)) throw preflightError('stable tar entry escapes its exact asset root');
    const relative = fullName.slice(root.length);
    normalizePortablePath(relative, 'stable tar relative path');
    const foldedRelative = relative.normalize('NFC').toLowerCase();
    if (foldedTarPaths.has(foldedRelative)) throw preflightError('stable tar contains a duplicate or case-colliding path');
    foldedTarPaths.add(foldedRelative);
    if (priorRelative !== null && BUFFER_COMPARE(BUFFER_FROM(priorRelative), BUFFER_FROM(relative)) >= 0) throw preflightError('stable tar paths must be uniquely byte-sorted');
    if (entries.has(relative)) throw preflightError(`stable tar contains duplicate path ${relative}`);
    const size = parseTarOctal(bufferSubarray(header, 124, 136), 'stable tar entry size');
    if (size > 16_777_216) throw preflightError('stable tar entry exceeds its reviewed per-file bound');
    payloadBytes += size;
    if (!Number.isSafeInteger(payloadBytes) || payloadBytes > 67_108_864) throw preflightError('stable tar payload exceeds its reviewed aggregate bound');
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > bufferLength(bytes) - 1024) throw preflightError('stable tar entry exceeds archive bounds');
    const entryBytes = BUFFER_FROM(bufferSubarray(bytes, dataStart, dataEnd));
    const paddedEnd = dataStart + Math.ceil(size / 512) * 512;
    if (!UINT8_ARRAY_EVERY.call(bufferSubarray(bytes, dataEnd, paddedEnd), byte => byte === 0)) throw preflightError('stable tar contains nonzero payload padding');
    entries.set(relative, { bytes: size, sha256: sha256(entryBytes), value: entryBytes });
    priorRelative = relative;
    offset = paddedEnd;
  }
  if (offset + 1024 !== bufferLength(bytes)) throw preflightError('stable tar lacks an exact end marker');
  const expectedPaths = [...releaseManifest.files.map(file => file.path), 'release-manifest.json'].sort((left, right) => BUFFER_COMPARE(BUFFER_FROM(left), BUFFER_FROM(right)));
  const actualPaths = [...entries.keys()];
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) throw preflightError('stable tar inventory does not close over the release manifest');
  for (const file of releaseManifest.files) {
    const entry = entries.get(file.path);
    if (entry.bytes !== file.bytes || entry.sha256 !== file.sha256) throw preflightError(`stable tar payload drifted from manifest: ${file.path}`);
  }
  if (!bufferEquals(entries.get('release-manifest.json').value, manifestBytes)) throw preflightError('stable tar archived manifest is not byte-identical');
}

function validateNestedCandidate(candidate, context) {
  const { policy, policyRecord, receipts, subject } = context;
  if (candidate.role === 'stable-bundle-manifest') {
    const { payload } = parseFixtureDocument(candidate, candidate.role, 3, receipts, subject, policyRecord);
    const sourceContext = context.details.get('source-finalization-record');
    const tagContext = context.details.get('annotated-tag-verification-record');
    if (!sourceContext || !tagContext) throw preflightError('stable bundle manifest was reached before source and tag proof');
    const detail = validateBundleManifestPayload(payload, policy, subject, tagContext, sourceContext);
    return { references: detail.references, detail };
  }
  if (candidate.role.startsWith('committed-policy-')) {
    validateCommittedJson(candidate, policy);
    return { references: [], detail: null };
  }
  if (candidate.role === 'committed-release-spec') {
    const sourceContext = context.details.get('source-finalization-record');
    if (!sourceContext) throw preflightError('release specification was reached before source proof');
    const detail = validateReadyReleaseSpec(candidate, subject, sourceContext);
    return { references: [], detail };
  }
  return { references: [], detail: null };
}

function resolveReferenceGraph(rootReferences, candidates, context) {
  const visiting = new Set();
  const resolved = new Map();
  function resolve(reference) {
    const candidate = candidates.get(reference.role);
    if (!candidate) throw preflightError(`reference role ${reference.role} is unresolved`);
    if (candidate.sha256 !== reference.sha256 || candidate.byteLength !== reference.byteLength) throw preflightError(`reference role ${reference.role} does not match its SHA-256 and length anchors`);
    if (resolved.has(reference.role)) return resolved.get(reference.role);
    if (visiting.has(reference.role)) throw preflightError(`reference graph contains a cycle at ${reference.role}`);
    visiting.add(reference.role);
    let validation;
    if (context.policy.lifecycleReferenceRoles.includes(reference.role)) validation = validateRootDocument(candidate, context);
    else validation = validateNestedCandidate(candidate, context);
    const detail = validation.detail;
    if (detail !== null) context.details.set(reference.role, detail);
    for (const nested of validation.references) resolve(nested);
    visiting.delete(reference.role);
    const record = { role: reference.role, sha256: candidate.sha256, byteLength: candidate.byteLength };
    resolved.set(reference.role, record);
    return record;
  }
  for (const reference of rootReferences.values()) resolve(reference);
  if (resolved.size !== candidates.size) {
    const extra = [...candidates.keys()].filter(role => !resolved.has(role)).sort();
    throw preflightError(`reference observation contains unreachable extra roles: ${extra.join(', ')}`);
  }
  return [...resolved.values()].sort((left, right) => BUFFER_COMPARE(BUFFER_FROM(left.role), BUFFER_FROM(right.role)));
}

function validatePostResolution(context, candidates) {
  const sourceContext = context.details.get('source-finalization-record');
  const tagContext = context.details.get('annotated-tag-verification-record');
  const stableContext = context.details.get('stable-bundle-verification-record');
  const bundleContext = context.details.get('stable-bundle-manifest');
  if (!sourceContext || !tagContext || !stableContext || !bundleContext) throw preflightError('reference graph did not yield all evidence contexts');
  validateGitProof(sourceContext, candidates, context.policy, context.subject);
  parseAnnotatedTag(candidates.get(tagContext.tagObject.role).bytes, tagContext, context.subject);
  const releaseSpec = validateReadyReleaseSpec(candidates.get('committed-release-spec'), context.subject, sourceContext);
  if (releaseSpec.releaseDate !== tagContext.taggerCalendarDate) throw preflightError('ready release date does not equal the raw tagger calendar date');
  const tool = candidates.get(stableContext.tool.role);
  if (tool.sha256 !== candidates.get('committed-tool-stable-bundle-verifier').sha256) throw preflightError('stable verification wrapper tool bytes drifted from committed proof');
  const assetByRole = new Map(bundleContext.assets.map(asset => [asset.reference.role, asset]));
  for (const asset of bundleContext.assets) {
    const candidate = candidates.get(asset.reference.role);
    if (candidate.sha256 !== asset.sha256 || candidate.byteLength !== asset.byteLength) throw preflightError(`stable asset ${asset.name} drifted`);
  }
  const manifestCandidate = candidates.get('stable-asset-release-manifest');
  const releaseManifest = validateStableReleaseManifest(manifestCandidate, bundleContext, sourceContext, tagContext, context.subject, candidates);
  validateChecksums(candidates.get('stable-asset-checksums').bytes, bundleContext);
  validateStableNotes(
    candidates.get('stable-asset-notes').bytes,
    releaseManifest,
    candidates.get('committed-changelog').bytes
  );
  validateStableTar(candidates.get('stable-asset-tar').bytes, bundleContext.assetStem, releaseManifest, manifestCandidate.bytes, context.policy.limits.maxStableManifestFiles);
  return {
    sourceTree: sourceContext.sourceTree,
    tagObjectId: tagContext.tagObjectId,
    taggerCalendarDate: tagContext.taggerCalendarDate,
    assetStem: bundleContext.assetStem,
    assets: context.policy.stableAssetRoles.map(item => {
      const asset = assetByRole.get(item.role);
      return { name: asset.name, sha256: asset.sha256, byteLength: asset.byteLength };
    })
  };
}

function resultFromReceipt(receipt) {
  const bytes = canonicalBytes(receipt);
  const frozenReceipt = deepFreezeJson(JSON.parse(JSON.stringify(receipt)));
  return Object.freeze({
    decision: receipt.decision,
    receipt: frozenReceipt,
    bytes,
    sha256: sha256(bytes),
    byteLength: bufferLength(bytes)
  });
}

function deepFreezeJson(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreezeJson(child);
  return Object.freeze(value);
}

function reconcileResult(policyRecord, lifecyclePolicyRecord) {
  return resultFromReceipt({
    schemaVersion: '1.0.0',
    kind: 'preflight-reference-closure',
    scope: 'fixture-only',
    decision: 'reconcile',
    productionEligible: false,
    externalMutationAuthorized: false,
    authenticatedAuthority: false,
    policySha256: policyRecord.sha256,
    lifecyclePolicySha256: lifecyclePolicyRecord.sha256,
    reasonCodes: ['reference-evidence-invalid']
  });
}

function resolvedResult(policyRecord, lifecyclePolicyRecord, receipts, subject, referenceSetDigest, resolvedInventory, proof) {
  const resolvedInventorySha256 = hashCanonical(RESOLVED_INVENTORY_DOMAIN, resolvedInventory);
  const material = {
    policySha256: policyRecord.sha256,
    lifecyclePolicySha256: lifecyclePolicyRecord.sha256,
    lifecycleChainId: receipts[0].receipt.chainId,
    lifecycleHeadSha256: receipts[2].sha256,
    referenceSetSha256: referenceSetDigest,
    subject,
    resolvedReferenceCount: resolvedInventory.length,
    resolvedInventorySha256,
    proof
  };
  const closureId = hashCanonical(CLOSURE_DOMAIN, material);
  return resultFromReceipt({
    schemaVersion: '1.0.0',
    kind: 'preflight-reference-closure',
    scope: 'fixture-only',
    decision: 'resolved-fixture-reference-closure',
    productionEligible: false,
    externalMutationAuthorized: false,
    authenticatedAuthority: false,
    nextAction: 'continue-to-b2.3-b-read-only-preflight',
    policySha256: policyRecord.sha256,
    lifecyclePolicySha256: lifecyclePolicyRecord.sha256,
    lifecycleChainId: receipts[0].receipt.chainId,
    lifecycleHeadSha256: receipts[2].sha256,
    referenceSetSha256: referenceSetDigest,
    closureId,
    subject,
    sourceProof: { sourceCommit: subject.sourceCommit, sourceTree: proof.sourceTree },
    tagProof: { tag: subject.tag, tagObjectId: proof.tagObjectId, taggerCalendarDate: proof.taggerCalendarDate, refMapping: 'fixture-observed-not-authenticated' },
    stableBundle: { assetStem: proof.assetStem, assets: proof.assets },
    resolvedReferenceCount: resolvedInventory.length,
    resolvedInventorySha256,
    limitations: [
      'fixture-only-no-live-ref-or-protected-main-authentication',
      'workflow-byte-locks-do-not-attest-external-action-implementations',
      'authority-documents-are-unauthenticated-fixture-declarations',
      'fixture-does-not-attest-verifier-execution',
      'fixture-does-not-prove-staged-payload-derivation-from-source-commit'
    ]
  });
}

export function resolveLifecycleReferenceClosure(input) {
  assertRuntimeIntrinsics();
  const snapshot = snapshotExactRecord(input, INPUT_KEYS, 'input');
  const policyRecord = normalizedPolicyRecord(snapshot.policyRecord);
  const lifecyclePolicyRecord = normalizedLifecyclePolicyRecord(snapshot.lifecyclePolicyRecord, policyRecord.policy.limits.maxPolicyBytes);
  try {
    const subject = normalizeSubject(snapshot.expectedSubject, policyRecord.policy);
    const receipts = normalizeReceipts(snapshot.receiptBytesList, lifecyclePolicyRecord, snapshot.expectedHeadSha256, subject, policyRecord.policy);
    const rootInventory = rootReferenceInventory(receipts, policyRecord.policy);
    assertDigest(snapshot.expectedReferenceSetSha256, 'expectedReferenceSetSha256');
    const referenceSetDigest = referenceSetSha256(rootInventory);
    if (snapshot.expectedReferenceSetSha256 !== referenceSetDigest) throw preflightError('expectedReferenceSetSha256 does not match the six lifecycle references');
    const candidates = normalizeObservation(snapshot.referenceObservation, policyRecord.policy);
    const rootReferences = new Map();
    for (const receipt of receipts) {
      rootReferences.set(receipt.receipt.evidence.role, receipt.receipt.evidence);
      rootReferences.set(receipt.receipt.authority.role, receipt.receipt.authority);
    }
    const context = {
      policy: policyRecord.policy,
      policyRecord,
      lifecyclePolicyRecord,
      receipts,
      subject,
      rootReferences,
      details: new Map()
    };
    const resolvedInventory = resolveReferenceGraph(rootReferences, candidates, context);
    const proof = validatePostResolution(context, candidates);
    return resolvedResult(policyRecord, lifecyclePolicyRecord, receipts, subject, referenceSetDigest, resolvedInventory, proof);
  } catch {
    return reconcileResult(policyRecord, lifecyclePolicyRecord);
  }
}

export const promotionPreflightConstants = Object.freeze({
  policyPath: POLICY_PATH,
  policySha256: EXPECTED_POLICY_SHA256,
  lifecyclePolicyPath: LIFECYCLE_POLICY_PATH,
  lifecyclePolicySha256: LIFECYCLE_POLICY_SHA256,
  referenceKind: REFERENCE_KIND,
  referenceSetDomain: REFERENCE_SET_DOMAIN,
  closureDomain: CLOSURE_DOMAIN
});
