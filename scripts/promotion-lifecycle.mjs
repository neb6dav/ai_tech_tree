#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

import { validateControlReceipt, validatePromotionPolicy } from './github-control-audit.mjs';
import { loadReleaseSpec, validateReleaseSpec } from './release-spec.mjs';
import { parseStrictJson } from './strict-json.mjs';

const SCRIPT_VERSION = '1.0.0';
const POLICY_PATH = 'config/promotion-lifecycle-policy.v1.json';
const RECEIPT_SCHEMA_VERSION = '1.0.0';
const RECEIPT_KIND = 'promotion-lifecycle-receipt';
const RECEIPT_SCOPE = 'fixture-only';
const REFERENCE_KIND = 'fixture-byte-reference';
const CHAIN_ID_DOMAIN = 'ai-research-tech-tree:promotion-lifecycle-chain:v1\0';
const RECEIPT_ID_DOMAIN = 'ai-research-tech-tree:promotion-lifecycle-receipt:v1\0';
const DECISION_ID_DOMAIN = 'ai-research-tech-tree:promotion-control-consumption-decision:v1\0';
const OBSERVATION_INVENTORY_DOMAIN = 'ai-research-tech-tree:promotion-control-observation-inventory:v1\0';
const DECISION_SCHEMA_VERSION = '1.0.0';
const DECISION_KIND = 'promotion-control-consumption-decision';
const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const IS_PROXY = utilTypes.isProxy;
const IS_SHARED_ARRAY_BUFFER = utilTypes.isSharedArrayBuffer;
const BUFFER_IS_BUFFER = Buffer.isBuffer;
const BUFFER_ALLOC = Buffer.alloc.bind(Buffer);
const BUFFER_PROTOTYPE = Buffer.prototype;
const UINT8_ARRAY = Uint8Array;
const UINT8_ARRAY_SET = Uint8Array.prototype.set;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, 'buffer').get;
const TYPED_ARRAY_BYTE_OFFSET_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, 'byteOffset').get;
const TYPED_ARRAY_LENGTH_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, 'length').get;
const BUFFER_SHADOW_KEYS = Object.freeze(['buffer', 'byteLength', 'byteOffset', 'length']);

const EXPECTED_POLICY = Object.freeze({
  schemaVersion: '1.0.0',
  status: 'planned',
  mode: 'fixture-only',
  releaseSpecPath: 'config/releases/v0.1.1.json',
  subject: Object.freeze({
    repositoryOwner: 'neb6dav',
    repositoryName: 'ai_tech_tree',
    repositoryFullName: 'neb6dav/ai_tech_tree',
    gitObjectFormat: 'sha1',
    version: '0.1.1',
    tag: 'v0.1.1'
  }),
  limits: Object.freeze({
    maxReceiptBytes: 8192,
    maxChainLength: 3,
    maxReferenceBytes: 536870912,
    notBefore: '2026-08-20T00:00:00.000Z',
    notAfter: '9999-12-31T23:59:59.999Z'
  }),
  controlDecision: Object.freeze({
    scope: 'fixture-only',
    controlPolicyPath: 'config/github-promotion-policy.v1.json',
    controlPolicySha256: 'a1dc1ec4b814f09e668b1b1d6669853240dcb732541e0d0b580ec3f5a959215c',
    requiredLifecycleState: 'stable-bundle-verified',
    maxControlReceiptCandidates: 4,
    maxControlReceiptBytes: 262_144,
    decisions: Object.freeze([
      'reconcile',
      'block',
      'proceed-to-b2.3-read-only-preflight'
    ]),
    reasonCodes: Object.freeze([
      'decision-input-invalid',
      'lifecycle-chain-invalid',
      'evaluated-at-invalid',
      'lifecycle-head-after-evaluation',
      'control-observation-missing',
      'control-observation-invalid',
      'control-observation-unknown',
      'control-observation-limit-exceeded',
      'control-observation-duplicate',
      'control-observation-ambiguous',
      'control-selection-missing',
      'control-selection-not-found',
      'control-selection-anchor-conflict',
      'control-receipt-anchor-invalid',
      'control-receipt-oversized',
      'control-receipt-sha-mismatch',
      'control-receipt-invalid',
      'control-receipt-noncanonical',
      'control-lifecycle-identity-conflict',
      'lifecycle-chain-incomplete',
      'lifecycle-state-not-ready',
      'control-policy-planned',
      'control-receipt-injected',
      'control-receipt-promotion-ineligible',
      'control-repository-ids-unbound',
      'control-release-spec-unbound',
      'control-receipt-attestations-incomplete',
      'control-receipt-not-yet-valid',
      'control-receipt-stale',
      'control-observed-before-lifecycle-head'
    ])
  }),
  states: Object.freeze([
    'unstarted',
    'source-finalized',
    'tag-verified',
    'stable-bundle-verified'
  ]),
  transitions: Object.freeze([
    Object.freeze({
      sequence: 1,
      eventType: 'source-finalized',
      fromState: 'unstarted',
      toState: 'source-finalized',
      evidenceRole: 'source-finalization-record',
      authorityRole: 'source-finalization-authorization'
    }),
    Object.freeze({
      sequence: 2,
      eventType: 'tag-verified',
      fromState: 'source-finalized',
      toState: 'tag-verified',
      evidenceRole: 'annotated-tag-verification-record',
      authorityRole: 'annotated-tag-authorization'
    }),
    Object.freeze({
      sequence: 3,
      eventType: 'stable-bundle-verified',
      fromState: 'tag-verified',
      toState: 'stable-bundle-verified',
      evidenceRole: 'stable-bundle-verification-record',
      authorityRole: 'stable-bundle-build-authorization'
    })
  ])
});
const EXPECTED_POLICY_BYTES = Buffer.from(`${JSON.stringify(EXPECTED_POLICY, null, 2)}\n`, 'utf8');

const POLICY_RECORD_KEYS = Object.freeze(['path', 'bytes', 'sha256', 'policy']);
const RELEASE_SPEC_RECORD_KEYS = Object.freeze(['path', 'bytes', 'spec']);
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
const REFERENCE_KEYS = Object.freeze(['kind', 'role', 'sha256', 'byteLength']);
const PARENT_KEYS = Object.freeze(['receiptId', 'sha256', 'byteLength']);
const RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'scope',
  'productionEligible',
  'policySha256',
  'chainId',
  'sequence',
  'receiptId',
  'eventType',
  'fromState',
  'toState',
  'observedAt',
  'subject',
  'parent',
  'evidence',
  'authority'
]);
const CONTROL_POLICY_RECORD_KEYS = Object.freeze(['path', 'sha256', 'bytes', 'policy']);
const DECISION_INPUT_KEYS = Object.freeze([
  'policyRecord',
  'receiptBytesList',
  'expectedHeadSha256',
  'expectedSubject',
  'controlPolicyRecord',
  'controlObservation',
  'expectedControlReceiptSha256',
  'evaluatedAt'
]);
const CONTROL_OBSERVATION_ENVELOPE_KEYS = Object.freeze(['completeness', 'selectedSha256', 'candidates']);
const CONTROL_OBSERVATION_KEYS = Object.freeze(['receiptSha256', 'receiptBytes']);
const DECISION_INPUT_DIGEST_KEYS = Object.freeze([
  'lifecyclePolicySha256',
  'lifecycleChainId',
  'lifecycleHeadSha256',
  'controlPolicySha256',
  'expectedControlReceiptSha256',
  'observationSelectedControlReceiptSha256',
  'consumedControlReceiptSha256'
]);
const RECONCILE_REASON_CODES = Object.freeze(new Set([
  'decision-input-invalid',
  'lifecycle-chain-invalid',
  'evaluated-at-invalid',
  'lifecycle-head-after-evaluation',
  'control-observation-missing',
  'control-observation-invalid',
  'control-observation-unknown',
  'control-observation-limit-exceeded',
  'control-observation-duplicate',
  'control-observation-ambiguous',
  'control-selection-missing',
  'control-selection-not-found',
  'control-selection-anchor-conflict',
  'control-receipt-anchor-invalid',
  'control-receipt-oversized',
  'control-receipt-sha-mismatch',
  'control-receipt-invalid',
  'control-receipt-noncanonical',
  'control-lifecycle-identity-conflict',
  'control-receipt-not-yet-valid'
]));

function lifecycleError(message) {
  return new Error(`promotion-lifecycle: ${message}`);
}

function assertNotProxy(value, label) {
  if (value && (typeof value === 'object' || typeof value === 'function') && IS_PROXY(value)) {
    throw lifecycleError(`${label} must not be a Proxy`);
  }
}

function inspectOrdinaryBuffer(value, label) {
  assertNotProxy(value, label);
  if (!BUFFER_IS_BUFFER(value)) throw lifecycleError(`${label} must be an ordinary Buffer`);
  if (Object.getPrototypeOf(value) !== BUFFER_PROTOTYPE) {
    throw lifecycleError(`${label} must use the exact native Buffer prototype`);
  }
  for (const key of BUFFER_SHADOW_KEYS) {
    if (Object.getOwnPropertyDescriptor(value, key) !== undefined) {
      throw lifecycleError(`${label} must not shadow ${key}`);
    }
    if (Object.getOwnPropertyDescriptor(BUFFER_PROTOTYPE, key) !== undefined) {
      throw lifecycleError(`native Buffer prototype must not shadow ${key}`);
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
    throw lifecycleError(`${label} must expose intact typed-array internals`);
  }
  if (IS_SHARED_ARRAY_BUFFER(arrayBuffer)) {
    throw lifecycleError(`${label} must not use shared mutable backing memory`);
  }
  if (!Number.isSafeInteger(byteOffset) || byteOffset < 0 || !Number.isSafeInteger(length) || length < 0) {
    throw lifecycleError(`${label} typed-array bounds are invalid`);
  }
  return { arrayBuffer, byteOffset, length };
}

function copyInspectedBuffer(inspected) {
  const source = new UINT8_ARRAY(inspected.arrayBuffer, inspected.byteOffset, inspected.length);
  const copy = BUFFER_ALLOC(inspected.length);
  UINT8_ARRAY_SET.call(copy, source);
  return copy;
}

function snapshotOrdinaryBuffer(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  const inspected = inspectOrdinaryBuffer(value, label);
  if (inspected.length > maximum) {
    throw lifecycleError(`${label} exceeds its reviewed maximum of ${maximum} bytes`);
  }
  return copyInspectedBuffer(inspected);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertObject(value, label) {
  assertNotProxy(value, label);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw lifecycleError(`${label} must be an object`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  assertObject(value, label);
  const actual = Object.keys(value);
  if (actual.length !== expectedKeys.length || actual.some((key, index) => key !== expectedKeys[index])) {
    throw lifecycleError(`${label} keys must be exactly, and in order: ${expectedKeys.join(', ')}`);
  }
}

function snapshotExactDataRecord(value, expectedKeys, label) {
  assertObject(value, label);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Object.getOwnPropertyNames(descriptors);
  if (
    Object.getOwnPropertySymbols(descriptors).length !== 0 ||
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw lifecycleError(`${label} keys must be exactly, and in order: ${expectedKeys.join(', ')}`);
  }
  const snapshot = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw lifecycleError(`${label}.${key} must be an enumerable data property`);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function snapshotJsonData(value, label, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw lifecycleError(`${label} must contain only finite JSON numbers`);
    return value;
  }
  assertNotProxy(value, label);
  if (!value || typeof value !== 'object' || BUFFER_IS_BUFFER(value)) {
    throw lifecycleError(`${label} must contain only JSON data`);
  }
  if (ancestors.has(value)) throw lifecycleError(`${label} must not contain a cycle`);
  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(descriptors).length !== 0) {
      throw lifecycleError(`${label} must not contain symbol properties`);
    }
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw lifecycleError(`${label} must be a plain array`);
      }
      const names = Object.getOwnPropertyNames(descriptors);
      const lengthDescriptor = descriptors.length;
      const length = lengthDescriptor?.value;
      if (!Number.isSafeInteger(length) || length < 0) {
        throw lifecycleError(`${label}.length must be a safe non-negative integer`);
      }
      const expectedNames = Array.from({ length }, (_, index) => String(index)).concat('length');
      if (names.length !== expectedNames.length || names.some((name, index) => name !== expectedNames[index])) {
        throw lifecycleError(`${label} must be a dense array with no extra properties`);
      }
      if (
        !lengthDescriptor ||
        lengthDescriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
        lengthDescriptor.value !== length
      ) {
        throw lifecycleError(`${label}.length must be a non-enumerable data property`);
      }
      return expectedNames.slice(0, -1).map((name, index) => {
        const descriptor = descriptors[name];
        if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
          throw lifecycleError(`${label}[${index}] must be an enumerable data property`);
        }
        return snapshotJsonData(descriptor.value, `${label}[${index}]`, ancestors);
      });
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw lifecycleError(`${label} must contain only plain objects`);
    }
    const snapshot = {};
    for (const name of Object.getOwnPropertyNames(descriptors)) {
      const descriptor = descriptors[name];
      if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw lifecycleError(`${label}.${name} must be an enumerable data property`);
      }
      snapshot[name] = snapshotJsonData(descriptor.value, `${label}.${name}`, ancestors);
    }
    return snapshot;
  } finally {
    ancestors.delete(value);
  }
}

function snapshotBufferList(value, maximumItems, maximumBytes, label) {
  assertNotProxy(value, label);
  if (!Array.isArray(value)) throw lifecycleError(`${label} must be an array`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || length < 0) throw lifecycleError(`${label}.length is invalid`);
  if (length > maximumItems) throw lifecycleError(`${label} exceeds its reviewed maximum`);
  const names = Object.getOwnPropertyNames(descriptors);
  const expectedNames = Array.from({ length }, (_, index) => String(index)).concat('length');
  if (
    Object.getOwnPropertySymbols(descriptors).length !== 0 ||
    names.length !== expectedNames.length ||
    names.some((name, index) => name !== expectedNames[index])
  ) {
    throw lifecycleError(`${label} must be a dense array with no extra properties`);
  }
  return expectedNames.slice(0, -1).map((name, index) => {
    const descriptor = descriptors[name];
    if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw lifecycleError(`${label}[${index}] must be an enumerable data property`);
    }
    return snapshotOrdinaryBuffer(descriptor.value, `${label}[${index}]`, maximumBytes);
  });
}

function snapshotControlObservation(value, maximum, maxReceiptBytes) {
  const envelope = snapshotExactDataRecord(
    value,
    CONTROL_OBSERVATION_ENVELOPE_KEYS,
    'control observation'
  );
  if (!['complete', 'unknown'].includes(envelope.completeness)) {
    throw lifecycleError('control observation.completeness must be exactly complete or unknown');
  }
  if (
    envelope.selectedSha256 !== null &&
    (
      typeof envelope.selectedSha256 !== 'string' ||
      envelope.selectedSha256.length !== 64 ||
      !/^[0-9a-f]{64}$/u.test(envelope.selectedSha256)
    )
  ) {
    throw lifecycleError('control observation.selectedSha256 must be a full lowercase SHA-256 digest or null');
  }
  if (!Array.isArray(envelope.candidates)) {
    throw lifecycleError('control observation.candidates must be an array');
  }
  assertNotProxy(envelope.candidates, 'control observation.candidates');
  const descriptors = Object.getOwnPropertyDescriptors(envelope.candidates);
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || length < 0) {
    throw lifecycleError('control observation.candidates.length is invalid');
  }
  if (length > maximum) {
    return {
      completeness: envelope.completeness,
      selectedSha256: envelope.selectedSha256,
      candidateCount: length,
      overLimit: true,
      candidates: []
    };
  }
  const names = Object.getOwnPropertyNames(descriptors);
  const expectedNames = Array.from({ length }, (_, index) => String(index)).concat('length');
  if (
    Object.getOwnPropertySymbols(descriptors).length !== 0 ||
    names.length !== expectedNames.length ||
    names.some((name, index) => name !== expectedNames[index])
  ) {
    throw lifecycleError('control observation.candidates must be a dense array with no extra properties');
  }
  const candidates = expectedNames.slice(0, -1).map((name, index) => {
    const descriptor = descriptors[name];
    if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw lifecycleError(`control observation.candidates[${index}] must be an enumerable data property`);
    }
    const candidate = snapshotExactDataRecord(
      descriptor.value,
      CONTROL_OBSERVATION_KEYS,
      `control observation.candidates[${index}]`
    );
    if (
      typeof candidate.receiptSha256 !== 'string' ||
      candidate.receiptSha256.length !== 64 ||
      !/^[0-9a-f]{64}$/u.test(candidate.receiptSha256)
    ) {
      throw lifecycleError(
        `control observation.candidates[${index}].receiptSha256 must be a full lowercase SHA-256 digest`
      );
    }
    const inspected = inspectOrdinaryBuffer(
      candidate.receiptBytes,
      `control observation.candidates[${index}].receiptBytes`
    );
    const byteLength = inspected.length;
    if (byteLength > maxReceiptBytes) {
      return {
        receiptSha256: candidate.receiptSha256,
        receiptBytes: null,
        byteLength,
        oversized: true
      };
    }
    return {
      receiptSha256: candidate.receiptSha256,
      receiptBytes: copyInspectedBuffer(inspected),
      byteLength,
      oversized: false
    };
  });
  return {
    completeness: envelope.completeness,
    selectedSha256: envelope.selectedSha256,
    candidateCount: length,
    overLimit: false,
    candidates
  };
}

function assertReviewedValue(actual, expected, label) {
  assertNotProxy(actual, label);
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      throw lifecycleError(`${label} must exactly match the reviewed policy`);
    }
    expected.forEach((item, index) => assertReviewedValue(actual[index], item, `${label}[${index}]`));
    return;
  }
  if (expected && typeof expected === 'object') {
    assertExactKeys(actual, Object.keys(expected), label);
    for (const key of Object.keys(expected)) {
      assertReviewedValue(actual[key], expected[key], `${label}.${key}`);
    }
    return;
  }
  if (!Object.is(actual, expected)) {
    throw lifecycleError(`${label} must exactly match the reviewed policy`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Buffer.isBuffer(value) || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalJsonBytes(value, { newline = true } = {}) {
  return Buffer.from(`${JSON.stringify(value)}${newline ? '\n' : ''}`, 'utf8');
}

function hashCanonical(domain, value) {
  const hash = createHash('sha256');
  hash.update(domain, 'utf8');
  hash.update(canonicalJsonBytes(value, { newline: false }));
  return hash.digest('hex');
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || value.length !== 64 || !/^[0-9a-f]{64}$/u.test(value)) {
    throw lifecycleError(`${label} must be a full lowercase SHA-256 digest`);
  }
  return value;
}

function assertSafePositiveInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw lifecycleError(`${label} must be a positive safe integer no greater than ${maximum}`);
  }
  return value;
}

function assertCanonicalTimestamp(value, label, limits) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    throw lifecycleError(`${label} must be a canonical UTC timestamp with millisecond precision`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw lifecycleError(`${label} must be a real canonical UTC timestamp`);
  }
  if (value < limits.notBefore || value > limits.notAfter) {
    throw lifecycleError(`${label} is outside the reviewed lifecycle window`);
  }
  return value;
}

function canonicalSubject(subject, policy) {
  const normalized = snapshotExactDataRecord(subject, SUBJECT_KEYS, 'receipt subject');
  assertSafePositiveInteger(normalized.repositoryId, 'receipt subject.repositoryId');
  assertSafePositiveInteger(normalized.repositoryOwnerId, 'receipt subject.repositoryOwnerId');
  for (const key of [
    'repositoryOwner',
    'repositoryName',
    'repositoryFullName',
    'gitObjectFormat',
    'version',
    'tag'
  ]) {
    if (normalized[key] !== policy.subject[key]) {
      throw lifecycleError(`receipt subject.${key} must exactly match the reviewed policy`);
    }
  }
  if (normalized.releaseSpecPath !== policy.releaseSpecPath) {
    throw lifecycleError('receipt subject.releaseSpecPath must exactly match the reviewed policy');
  }
  assertSha256(normalized.releaseSpecSha256, 'receipt subject.releaseSpecSha256');
  if (!/^[0-9a-f]{40}$/u.test(normalized.sourceCommit)) {
    throw lifecycleError('receipt subject.sourceCommit must be a full lowercase sha1 object ID');
  }
  return cloneJson(normalized);
}

function canonicalReference(reference, expectedRole, label, policy) {
  const normalized = snapshotExactDataRecord(reference, REFERENCE_KEYS, label);
  if (normalized.kind !== REFERENCE_KIND) {
    throw lifecycleError(`${label}.kind must be exactly ${REFERENCE_KIND}`);
  }
  if (normalized.role !== expectedRole) {
    throw lifecycleError(`${label}.role must be exactly ${expectedRole}`);
  }
  assertSha256(normalized.sha256, `${label}.sha256`);
  assertSafePositiveInteger(normalized.byteLength, `${label}.byteLength`, policy.limits.maxReferenceBytes);
  return cloneJson(normalized);
}

function canonicalParent(parent, sequence, policy) {
  if (sequence === 1) {
    if (parent !== null) throw lifecycleError('the first receipt parent must be null');
    return null;
  }
  const normalized = snapshotExactDataRecord(parent, PARENT_KEYS, 'receipt parent');
  assertSha256(normalized.receiptId, 'receipt parent.receiptId');
  assertSha256(normalized.sha256, 'receipt parent.sha256');
  assertSafePositiveInteger(normalized.byteLength, 'receipt parent.byteLength', policy.limits.maxReceiptBytes);
  return cloneJson(normalized);
}

function chainIdFor(policySha256, subject) {
  return hashCanonical(CHAIN_ID_DOMAIN, { policySha256, subject });
}

function receiptIdMaterial(receipt) {
  return {
    schemaVersion: receipt.schemaVersion,
    kind: receipt.kind,
    scope: receipt.scope,
    productionEligible: receipt.productionEligible,
    policySha256: receipt.policySha256,
    chainId: receipt.chainId,
    sequence: receipt.sequence,
    eventType: receipt.eventType,
    fromState: receipt.fromState,
    toState: receipt.toState,
    observedAt: receipt.observedAt,
    subject: receipt.subject,
    parent: receipt.parent,
    evidence: receipt.evidence,
    authority: receipt.authority
  };
}

function receiptIdFor(receipt) {
  return hashCanonical(RECEIPT_ID_DOMAIN, receiptIdMaterial(receipt));
}

function canonicalReceiptDocument(fields) {
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    kind: RECEIPT_KIND,
    scope: RECEIPT_SCOPE,
    productionEligible: false,
    policySha256: fields.policySha256,
    chainId: fields.chainId,
    sequence: fields.sequence,
    receiptId: fields.receiptId,
    eventType: fields.eventType,
    fromState: fields.fromState,
    toState: fields.toState,
    observedAt: fields.observedAt,
    subject: fields.subject,
    parent: fields.parent,
    evidence: fields.evidence,
    authority: fields.authority
  };
}

export function validatePromotionLifecyclePolicy(document) {
  const snapshot = snapshotJsonData(document, 'lifecycle policy');
  assertReviewedValue(snapshot, EXPECTED_POLICY, 'lifecycle policy');
  return deepFreeze(cloneJson(snapshot));
}

function assertExactPolicyBytes(bytes) {
  if (Buffer.compare(bytes, EXPECTED_POLICY_BYTES) !== 0) {
    throw lifecycleError('lifecycle policy bytes must exactly match the canonical reviewed policy');
  }
}

function normalizedPolicyRecord(record) {
  const snapshot = snapshotExactDataRecord(record, POLICY_RECORD_KEYS, 'lifecycle policy record');
  if (snapshot.path !== POLICY_PATH) throw lifecycleError(`lifecycle policy path must be exactly ${POLICY_PATH}`);
  const bytes = snapshotOrdinaryBuffer(
    snapshot.bytes,
    'lifecycle policy record bytes',
    EXPECTED_POLICY_BYTES.length
  );
  const digest = sha256(bytes);
  if (snapshot.sha256 !== digest) throw lifecycleError('lifecycle policy record SHA-256 does not match its bytes');
  const policy = validatePromotionLifecyclePolicy(parseStrictJson(bytes, POLICY_PATH));
  assertExactPolicyBytes(bytes);
  assertReviewedValue(
    snapshotJsonData(snapshot.policy, 'lifecycle policy record.policy'),
    policy,
    'lifecycle policy record.policy'
  );
  return { path: POLICY_PATH, bytes, sha256: digest, policy };
}

function normalizedControlPolicyRecord(record, decisionPolicy) {
  const snapshot = snapshotExactDataRecord(record, CONTROL_POLICY_RECORD_KEYS, 'control policy record');
  if (snapshot.path !== decisionPolicy.controlPolicyPath) {
    throw lifecycleError(`control policy path must be exactly ${decisionPolicy.controlPolicyPath}`);
  }
  const bytes = snapshotOrdinaryBuffer(
    snapshot.bytes,
    'control policy record bytes',
    decisionPolicy.maxControlReceiptBytes
  );
  const digest = sha256(bytes);
  if (snapshot.sha256 !== digest || digest !== decisionPolicy.controlPolicySha256) {
    throw lifecycleError('control policy record SHA-256 does not match the reviewed B1 policy bytes');
  }
  const policy = validatePromotionPolicy(parseStrictJson(bytes, decisionPolicy.controlPolicyPath));
  const suppliedPolicy = snapshotJsonData(snapshot.policy, 'control policy record.policy');
  assertReviewedValue(suppliedPolicy, policy, 'control policy record.policy');
  return { path: decisionPolicy.controlPolicyPath, sha256: digest, bytes, policy };
}

export async function loadPromotionLifecyclePolicy(...argumentsList) {
  if (argumentsList.length !== 0) {
    throw lifecycleError('lifecycle policy loader does not accept a caller-controlled path');
  }
  const policyPath = path.join(REPOSITORY_ROOT, ...POLICY_PATH.split('/'));
  let bytes;
  try {
    bytes = await readFile(policyPath);
  } catch (error) {
    throw lifecycleError(`cannot read ${POLICY_PATH}: ${error.message}`);
  }
  const policy = validatePromotionLifecyclePolicy(parseStrictJson(bytes, POLICY_PATH));
  assertExactPolicyBytes(bytes);
  return { path: POLICY_PATH, bytes, sha256: sha256(bytes), policy };
}

function normalizedReleaseSpecRecord(record, policy) {
  const snapshot = snapshotExactDataRecord(record, RELEASE_SPEC_RECORD_KEYS, 'release specification record');
  if (snapshot.path !== policy.releaseSpecPath) {
    throw lifecycleError(`release specification path must be exactly ${policy.releaseSpecPath}`);
  }
  const bytes = snapshotOrdinaryBuffer(
    snapshot.bytes,
    'release specification record bytes',
    policy.controlDecision.maxControlReceiptBytes
  );
  const document = parseStrictJson(bytes, policy.releaseSpecPath);
  const spec = validateReleaseSpec(document);
  assertReviewedValue(
    snapshotJsonData(snapshot.spec, 'release specification record.spec'),
    spec,
    'release specification record.spec'
  );
  if (
    spec.version !== policy.subject.version ||
    spec.tag !== policy.subject.tag ||
    spec.defaultBranch !== 'main' ||
    spec.productionEnvironment !== 'github-pages'
  ) {
    throw lifecycleError('release specification does not match the reviewed lifecycle subject');
  }
  return { path: policy.releaseSpecPath, bytes, sha256: sha256(bytes), spec };
}

export function buildPromotionLifecyclePlan({ policyRecord, releaseSpecRecord }) {
  const normalizedPolicy = normalizedPolicyRecord(policyRecord);
  const normalizedSpec = normalizedReleaseSpecRecord(releaseSpecRecord, normalizedPolicy.policy);
  const blockers = [
    'The lifecycle policy is planned.',
    'Lifecycle receipts are fixture-only, promotion-ineligible, and categorically production-ineligible.',
    'C4.4-B2.1 has no live evidence, privileged action, or external mutation capability.'
  ];
  if (normalizedSpec.spec.status !== 'ready') {
    blockers.splice(1, 0, 'The v0.1.1 release specification is planned, not ready.');
  }
  return deepFreeze({
    schemaVersion: '1.0.0',
    scriptVersion: SCRIPT_VERSION,
    mode: 'plan-only',
    policy: {
      path: normalizedPolicy.path,
      sha256: normalizedPolicy.sha256,
      status: normalizedPolicy.policy.status,
      mode: normalizedPolicy.policy.mode
    },
    releaseSpec: {
      path: normalizedSpec.path,
      sha256: normalizedSpec.sha256,
      status: normalizedSpec.spec.status,
      version: normalizedSpec.spec.version,
      tag: normalizedSpec.spec.tag
    },
    states: [...normalizedPolicy.policy.states],
    transitions: normalizedPolicy.policy.transitions.map(transition => ({
      sequence: transition.sequence,
      eventType: transition.eventType,
      fromState: transition.fromState,
      toState: transition.toState
    })),
    capabilities: {
      fixedFileReads: true,
      inMemoryFixtureReceiptCreation: true,
      fixtureChainValidation: true,
      fixtureControlConsumptionDecision: true,
      networkAccess: false,
      filesystemWrites: false,
      externalMutation: false,
      productionEvidenceValidation: false
    },
    authorization: {
      sourceFinalization: false,
      tagCreation: false,
      stableBundleCreation: false,
      releasePromotion: false,
      deployment: false
    },
    productionEligible: false,
    blockers
  });
}

export function validateLifecycleReceipt(receiptBytes, { policyRecord }) {
  const normalizedPolicy = normalizedPolicyRecord(policyRecord);
  const policy = normalizedPolicy.policy;
  const exactReceiptBytes = snapshotOrdinaryBuffer(
    receiptBytes,
    'receipt byte length',
    policy.limits.maxReceiptBytes
  );
  if (exactReceiptBytes.length < 1) {
    throw lifecycleError(`receipt byte length must be between 1 and ${policy.limits.maxReceiptBytes}`);
  }
  const receipt = parseStrictJson(exactReceiptBytes, 'lifecycle receipt');
  assertExactKeys(receipt, RECEIPT_KEYS, 'lifecycle receipt');
  if (receipt.schemaVersion !== RECEIPT_SCHEMA_VERSION) {
    throw lifecycleError(`receipt schemaVersion must be exactly ${RECEIPT_SCHEMA_VERSION}`);
  }
  if (receipt.kind !== RECEIPT_KIND) throw lifecycleError(`receipt kind must be exactly ${RECEIPT_KIND}`);
  if (receipt.scope !== RECEIPT_SCOPE) throw lifecycleError(`receipt scope must be exactly ${RECEIPT_SCOPE}`);
  if (receipt.productionEligible !== false) throw lifecycleError('fixture receipt productionEligible must be false');
  if (receipt.policySha256 !== normalizedPolicy.sha256) {
    throw lifecycleError('receipt policySha256 does not match the exact reviewed policy bytes');
  }
  assertSafePositiveInteger(receipt.sequence, 'receipt sequence', policy.limits.maxChainLength);
  const transition = policy.transitions[receipt.sequence - 1];
  if (!transition) throw lifecycleError('receipt sequence has no reviewed transition');
  if (
    receipt.eventType !== transition.eventType ||
    receipt.fromState !== transition.fromState ||
    receipt.toState !== transition.toState
  ) {
    throw lifecycleError(`receipt transition ${receipt.sequence} must be exactly ${transition.eventType}: ${transition.fromState} -> ${transition.toState}`);
  }
  const subject = canonicalSubject(receipt.subject, policy);
  const expectedChainId = chainIdFor(normalizedPolicy.sha256, subject);
  if (receipt.chainId !== expectedChainId) {
    throw lifecycleError('receipt chainId does not match the fixed subject identity');
  }
  assertCanonicalTimestamp(receipt.observedAt, 'receipt observedAt', policy.limits);
  const parent = canonicalParent(receipt.parent, receipt.sequence, policy);
  const evidence = canonicalReference(receipt.evidence, transition.evidenceRole, 'receipt evidence', policy);
  const authority = canonicalReference(receipt.authority, transition.authorityRole, 'receipt authority', policy);
  assertSha256(receipt.receiptId, 'receipt receiptId');
  const normalizedReceipt = canonicalReceiptDocument({
    policySha256: normalizedPolicy.sha256,
    chainId: expectedChainId,
    sequence: transition.sequence,
    receiptId: receipt.receiptId,
    eventType: transition.eventType,
    fromState: transition.fromState,
    toState: transition.toState,
    observedAt: receipt.observedAt,
    subject,
    parent,
    evidence,
    authority
  });
  const expectedReceiptId = receiptIdFor(normalizedReceipt);
  if (receipt.receiptId !== expectedReceiptId) {
    throw lifecycleError('receipt receiptId does not match its canonical content');
  }
  const expectedBytes = canonicalJsonBytes(normalizedReceipt);
  if (Buffer.compare(expectedBytes, exactReceiptBytes) !== 0) {
    throw lifecycleError('receipt bytes must use the exact canonical UTF-8 serialization');
  }
  return {
    receipt: deepFreeze(normalizedReceipt),
    bytes: exactReceiptBytes,
    sha256: sha256(exactReceiptBytes),
    byteLength: exactReceiptBytes.length
  };
}

export function createFixtureLifecycleReceipt({
  policyRecord,
  eventType,
  observedAt,
  subject,
  evidence,
  authority,
  parentReceiptBytes = null
}) {
  const normalizedPolicy = normalizedPolicyRecord(policyRecord);
  const policy = normalizedPolicy.policy;
  let transition;
  let parent = null;
  if (parentReceiptBytes === null) {
    transition = policy.transitions[0];
  } else {
    const parentRecord = validateLifecycleReceipt(parentReceiptBytes, { policyRecord: normalizedPolicy });
    transition = policy.transitions[parentRecord.receipt.sequence];
    if (!transition) throw lifecycleError('the fixture lifecycle chain is already complete');
    parent = {
      receiptId: parentRecord.receipt.receiptId,
      sha256: parentRecord.sha256,
      byteLength: parentRecord.byteLength
    };
    if (JSON.stringify(parentRecord.receipt.subject) !== JSON.stringify(subject)) {
      throw lifecycleError('appended receipt subject must exactly match its parent subject');
    }
    if (typeof observedAt === 'string' && observedAt <= parentRecord.receipt.observedAt) {
      throw lifecycleError('appended receipt observedAt must be later than its parent');
    }
  }
  if (eventType !== transition.eventType) {
    throw lifecycleError(`next eventType must be exactly ${transition.eventType}`);
  }
  const normalizedSubject = canonicalSubject(subject, policy);
  const normalizedObservedAt = assertCanonicalTimestamp(observedAt, 'receipt observedAt', policy.limits);
  const normalizedEvidence = canonicalReference(evidence, transition.evidenceRole, 'receipt evidence', policy);
  const normalizedAuthority = canonicalReference(authority, transition.authorityRole, 'receipt authority', policy);
  const fields = {
    policySha256: normalizedPolicy.sha256,
    chainId: chainIdFor(normalizedPolicy.sha256, normalizedSubject),
    sequence: transition.sequence,
    receiptId: '',
    eventType: transition.eventType,
    fromState: transition.fromState,
    toState: transition.toState,
    observedAt: normalizedObservedAt,
    subject: normalizedSubject,
    parent,
    evidence: normalizedEvidence,
    authority: normalizedAuthority
  };
  const draft = canonicalReceiptDocument(fields);
  fields.receiptId = receiptIdFor(draft);
  const bytes = canonicalJsonBytes(canonicalReceiptDocument(fields));
  return validateLifecycleReceipt(bytes, { policyRecord: normalizedPolicy });
}

export function validateLifecycleChain(receiptBytesList, {
  policyRecord,
  expectedHeadSha256,
  expectedSubject
}) {
  const normalizedPolicy = normalizedPolicyRecord(policyRecord);
  const policy = normalizedPolicy.policy;
  if (!Array.isArray(receiptBytesList) || receiptBytesList.length < 1) {
    throw lifecycleError('receipt chain must contain at least one receipt');
  }
  if (receiptBytesList.length > policy.limits.maxChainLength) {
    throw lifecycleError(`receipt chain cannot exceed ${policy.limits.maxChainLength} receipts`);
  }
  assertSha256(expectedHeadSha256, 'out-of-band expectedHeadSha256');
  const anchoredSubject = canonicalSubject(expectedSubject, policy);
  const records = receiptBytesList.map(bytes => validateLifecycleReceipt(bytes, { policyRecord: normalizedPolicy }));
  const receiptIds = new Set();
  for (const record of records) {
    if (receiptIds.has(record.receipt.receiptId)) throw lifecycleError('receipt chain contains a duplicate receiptId');
    receiptIds.add(record.receipt.receiptId);
  }
  const firstSubject = JSON.stringify(records[0].receipt.subject);
  if (firstSubject !== JSON.stringify(anchoredSubject)) {
    throw lifecycleError('receipt chain subject does not match the out-of-band expectedSubject');
  }
  for (let index = 0; index < records.length; index += 1) {
    const current = records[index];
    const expectedSequence = index + 1;
    if (current.receipt.sequence !== expectedSequence) {
      throw lifecycleError(`receipt chain is non-linear at position ${expectedSequence}`);
    }
    if (JSON.stringify(current.receipt.subject) !== firstSubject) {
      throw lifecycleError('receipt chain subject changed');
    }
    if (current.receipt.chainId !== records[0].receipt.chainId) {
      throw lifecycleError('receipt chainId changed');
    }
    if (index === 0) {
      if (current.receipt.parent !== null) throw lifecycleError('receipt chain root parent must be null');
      continue;
    }
    const previous = records[index - 1];
    const expectedParent = {
      receiptId: previous.receipt.receiptId,
      sha256: previous.sha256,
      byteLength: previous.byteLength
    };
    if (JSON.stringify(current.receipt.parent) !== JSON.stringify(expectedParent)) {
      throw lifecycleError('receipt parent does not close over the exact preceding receipt bytes');
    }
    if (current.receipt.observedAt <= previous.receipt.observedAt) {
      throw lifecycleError('receipt observedAt values must increase strictly');
    }
  }
  const head = records.at(-1);
  if (head.sha256 !== expectedHeadSha256) {
    throw lifecycleError('receipt chain head does not match the out-of-band expectedHeadSha256');
  }
  const nextTransition = policy.transitions[records.length] || null;
  return deepFreeze({
    schemaVersion: '1.0.0',
    chainId: head.receipt.chainId,
    headSha256: head.sha256,
    headReceiptId: head.receipt.receiptId,
    headObservedAt: head.receipt.observedAt,
    receiptCount: records.length,
    currentState: head.receipt.toState,
    nextEventType: nextTransition?.eventType || null,
    complete: nextTransition === null,
    productionEligible: false,
    receiptIds: records.map(record => record.receipt.receiptId)
  });
}

function sortedJsonData(value) {
  if (Array.isArray(value)) return value.map(sortedJsonData);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, sortedJsonData(value[key])])
    );
  }
  return value;
}

function canonicalControlReceiptBytes(receipt) {
  return canonicalJsonBytes(sortedJsonData(receipt));
}

function decisionIdMaterial(decision) {
  return {
    schemaVersion: decision.schemaVersion,
    kind: decision.kind,
    scope: decision.scope,
    productionEligible: decision.productionEligible,
    externalMutationAuthorized: decision.externalMutationAuthorized,
    outcome: decision.outcome,
    evaluatedAt: decision.evaluatedAt,
    reasonCodes: decision.reasonCodes,
    nextAction: decision.nextAction,
    inputs: decision.inputs,
    context: decision.context
  };
}

function finalizeControlDecision({ evaluatedAt, reasons, inputs, context }) {
  const decisionPolicy = EXPECTED_POLICY.controlDecision;
  const orderedReasons = decisionPolicy.reasonCodes.filter(code => reasons.has(code));
  const outcome = orderedReasons.some(code => RECONCILE_REASON_CODES.has(code))
    ? 'reconcile'
    : orderedReasons.length > 0
      ? 'block'
      : 'proceed-to-b2.3-read-only-preflight';
  const nextAction = {
    reconcile: 'reconcile-fixture-evidence',
    block: 'resolve-blockers-before-b2.3',
    'proceed-to-b2.3-read-only-preflight': 'continue-to-b2.3-read-only-preflight'
  }[outcome];
  assertExactKeys(inputs, DECISION_INPUT_DIGEST_KEYS, 'decision input digests');
  const fields = {
    schemaVersion: DECISION_SCHEMA_VERSION,
    kind: DECISION_KIND,
    scope: decisionPolicy.scope,
    productionEligible: false,
    externalMutationAuthorized: false,
    decisionId: '',
    outcome,
    evaluatedAt,
    reasonCodes: orderedReasons,
    nextAction,
    inputs,
    context
  };
  fields.decisionId = hashCanonical(DECISION_ID_DOMAIN, decisionIdMaterial(fields));
  const bytes = canonicalJsonBytes(fields);
  return {
    decision: deepFreeze(fields),
    bytes,
    sha256: sha256(bytes),
    byteLength: bytes.length
  };
}

function initialDecisionInputs() {
  return {
    lifecyclePolicySha256: sha256(EXPECTED_POLICY_BYTES),
    lifecycleChainId: null,
    lifecycleHeadSha256: null,
    controlPolicySha256: EXPECTED_POLICY.controlDecision.controlPolicySha256,
    expectedControlReceiptSha256: null,
    observationSelectedControlReceiptSha256: null,
    consumedControlReceiptSha256: null
  };
}

function initialDecisionContext() {
  return {
    subject: null,
    lifecycle: {
      policyPath: POLICY_PATH,
      policySha256: sha256(EXPECTED_POLICY_BYTES),
      chainId: null,
      headSha256: null,
      headObservedAt: null,
      receiptCount: null,
      currentState: null,
      complete: null
    },
    controlPolicy: {
      path: EXPECTED_POLICY.controlDecision.controlPolicyPath,
      sha256: EXPECTED_POLICY.controlDecision.controlPolicySha256,
      status: null,
      receiptFreshnessSeconds: null,
      maxClockSkewSeconds: null
    },
    observation: {
      completeness: null,
      candidateCount: null,
      distinctCandidateCount: null,
      selectedSha256: null,
      inventorySha256: null
    },
    selectedReceipt: null
  };
}

export function decideFreshControlConsumption(input) {
  const reasons = new Set();
  const inputs = initialDecisionInputs();
  const context = initialDecisionContext();
  let supplied;
  try {
    supplied = snapshotExactDataRecord(input, DECISION_INPUT_KEYS, 'control decision input');
  } catch {
    reasons.add('decision-input-invalid');
    return finalizeControlDecision({ evaluatedAt: null, reasons, inputs, context });
  }

  // These two records are fixed repository trust anchors, not caller evidence.
  // Invalid bytes or metadata are programming/configuration errors and fail by
  // throwing rather than being downgraded into an evidence reconciliation.
  const normalizedPolicy = normalizedPolicyRecord(supplied.policyRecord);
  const decisionPolicy = normalizedPolicy.policy.controlDecision;
  const normalizedControlPolicy = normalizedControlPolicyRecord(
    supplied.controlPolicyRecord,
    decisionPolicy
  );
  inputs.lifecyclePolicySha256 = normalizedPolicy.sha256;
  inputs.controlPolicySha256 = normalizedControlPolicy.sha256;
  context.lifecycle.policySha256 = normalizedPolicy.sha256;
  context.controlPolicy = {
    path: normalizedControlPolicy.path,
    sha256: normalizedControlPolicy.sha256,
    status: normalizedControlPolicy.policy.status,
    receiptFreshnessSeconds: normalizedControlPolicy.policy.limits.receiptFreshnessSeconds,
    maxClockSkewSeconds: normalizedControlPolicy.policy.limits.maxClockSkewSeconds
  };

  let evaluatedAt = null;
  try {
    evaluatedAt = assertCanonicalTimestamp(
      supplied.evaluatedAt,
      'control decision evaluatedAt',
      normalizedPolicy.policy.limits
    );
  } catch {
    reasons.add('evaluated-at-invalid');
  }

  let expectedControlReceiptSha256 = null;
  try {
    expectedControlReceiptSha256 = assertSha256(
      supplied.expectedControlReceiptSha256,
      'out-of-band expectedControlReceiptSha256'
    );
    inputs.expectedControlReceiptSha256 = expectedControlReceiptSha256;
  } catch {
    reasons.add('control-receipt-anchor-invalid');
  }

  let expectedSubject = null;
  let chain = null;
  try {
    expectedSubject = canonicalSubject(
      snapshotJsonData(supplied.expectedSubject, 'out-of-band expectedSubject'),
      normalizedPolicy.policy
    );
    context.subject = cloneJson(expectedSubject);
    const receiptBytesList = snapshotBufferList(
      supplied.receiptBytesList,
      normalizedPolicy.policy.limits.maxChainLength,
      normalizedPolicy.policy.limits.maxReceiptBytes,
      'lifecycle receipt bytes'
    );
    chain = validateLifecycleChain(receiptBytesList, {
      policyRecord: normalizedPolicy,
      expectedHeadSha256: supplied.expectedHeadSha256,
      expectedSubject
    });
    inputs.lifecycleChainId = chain.chainId;
    inputs.lifecycleHeadSha256 = chain.headSha256;
    context.lifecycle = {
      policyPath: normalizedPolicy.path,
      policySha256: normalizedPolicy.sha256,
      chainId: chain.chainId,
      headSha256: chain.headSha256,
      headObservedAt: chain.headObservedAt,
      receiptCount: chain.receiptCount,
      currentState: chain.currentState,
      complete: chain.complete
    };
    if (!chain.complete) reasons.add('lifecycle-chain-incomplete');
    if (chain.currentState !== decisionPolicy.requiredLifecycleState) {
      reasons.add('lifecycle-state-not-ready');
    }
  } catch {
    reasons.add('lifecycle-chain-invalid');
  }

  if (normalizedControlPolicy.policy.status === 'planned') {
    reasons.add('control-policy-planned');
  }

  let observation = null;
  try {
    observation = snapshotControlObservation(
      supplied.controlObservation,
      decisionPolicy.maxControlReceiptCandidates,
      decisionPolicy.maxControlReceiptBytes
    );
  } catch {
    reasons.add('control-observation-invalid');
  }

  let selectedCandidate = null;
  if (observation) {
    context.observation.completeness = observation.completeness;
    context.observation.candidateCount = observation.candidateCount;
    context.observation.selectedSha256 = observation.selectedSha256;
    if (observation.completeness === 'unknown') reasons.add('control-observation-unknown');
    if (observation.overLimit) reasons.add('control-observation-limit-exceeded');
    if (observation.candidates.length === 0 && !observation.overLimit) {
      reasons.add('control-observation-missing');
    }
    if (observation.selectedSha256 === null) {
      reasons.add('control-selection-missing');
    } else if (!/^[0-9a-f]{64}$/u.test(observation.selectedSha256)) {
      reasons.add('control-receipt-anchor-invalid');
    } else {
      inputs.observationSelectedControlReceiptSha256 = observation.selectedSha256;
      if (
        expectedControlReceiptSha256 !== null &&
        observation.selectedSha256 !== expectedControlReceiptSha256
      ) {
        reasons.add('control-selection-anchor-conflict');
      }
    }

    const uniqueCandidates = [];
    for (const candidate of observation.candidates) {
      const matching = uniqueCandidates.find(existing =>
        existing.receiptSha256 === candidate.receiptSha256 &&
        existing.receiptBytes !== null &&
        candidate.receiptBytes !== null &&
        Buffer.compare(existing.receiptBytes, candidate.receiptBytes) === 0
      );
      if (!matching) uniqueCandidates.push(candidate);
    }
    context.observation.distinctCandidateCount = observation.overLimit ? null : uniqueCandidates.length;
    context.observation.inventorySha256 = hashCanonical(OBSERVATION_INVENTORY_DOMAIN, {
      completeness: observation.completeness,
      selectedSha256: observation.selectedSha256,
      candidateCount: observation.candidateCount,
      overLimit: observation.overLimit,
      candidates: observation.candidates.map(candidate => ({
        receiptSha256: candidate.receiptSha256,
        byteLength: candidate.byteLength,
        contentSha256: candidate.receiptBytes === null ? null : sha256(candidate.receiptBytes)
      }))
    });
    if (!observation.overLimit && observation.candidateCount !== uniqueCandidates.length) {
      reasons.add('control-observation-duplicate');
    }
    if (uniqueCandidates.length > 1) reasons.add('control-observation-ambiguous');
    if (uniqueCandidates.length === 1 && observation.selectedSha256 !== null) {
      if (uniqueCandidates[0].receiptSha256 !== observation.selectedSha256) {
        reasons.add('control-selection-not-found');
      } else if (
        expectedControlReceiptSha256 !== null &&
        observation.selectedSha256 === expectedControlReceiptSha256
      ) {
        selectedCandidate = uniqueCandidates[0];
      }
    } else if (uniqueCandidates.length !== 0 && observation.selectedSha256 !== null) {
      const matches = uniqueCandidates.filter(candidate => candidate.receiptSha256 === observation.selectedSha256);
      if (matches.length !== 1) reasons.add('control-selection-not-found');
    } else if (uniqueCandidates.length === 0 && observation.selectedSha256 !== null) {
      reasons.add('control-selection-not-found');
    }
  }

  let controlReceipt = null;
  if (selectedCandidate) {
    if (selectedCandidate.oversized) {
      reasons.add('control-receipt-oversized');
    } else if (!/^[0-9a-f]{64}$/u.test(selectedCandidate.receiptSha256)) {
      reasons.add('control-receipt-anchor-invalid');
    } else {
      const actualDigest = sha256(selectedCandidate.receiptBytes);
      if (actualDigest !== selectedCandidate.receiptSha256) {
        reasons.add('control-receipt-sha-mismatch');
      } else if (chain && expectedSubject) {
        let rawReceipt = null;
        try {
          rawReceipt = snapshotJsonData(
            parseStrictJson(selectedCandidate.receiptBytes, 'selected control receipt'),
            'selected control receipt'
          );
        } catch {
          reasons.add('control-receipt-invalid');
        }
        if (rawReceipt) {
          if (
            rawReceipt.repository !== expectedSubject.repositoryFullName ||
            rawReceipt.expectedCommit !== expectedSubject.sourceCommit ||
            rawReceipt.release?.version !== expectedSubject.version ||
            rawReceipt.release?.tag !== expectedSubject.tag ||
            normalizedControlPolicy.policy.release.releaseSpecPath !== expectedSubject.releaseSpecPath
          ) {
            reasons.add('control-lifecycle-identity-conflict');
          }
          try {
            const validatedControlReceipt = validateControlReceipt(selectedCandidate.receiptBytes, {
              policyRecord: normalizedControlPolicy,
              expectedCommit: expectedSubject.sourceCommit
            });
            if (Buffer.compare(
              selectedCandidate.receiptBytes,
              canonicalControlReceiptBytes(validatedControlReceipt)
            ) !== 0) {
              reasons.add('control-receipt-noncanonical');
            } else {
              controlReceipt = validatedControlReceipt;
              inputs.consumedControlReceiptSha256 = actualDigest;
            }
          } catch {
            reasons.add('control-receipt-invalid');
          }
        }
      }
    }
  }

  if (controlReceipt) {
    context.selectedReceipt = {
      sha256: inputs.consumedControlReceiptSha256,
      byteLength: selectedCandidate.byteLength,
      observedAt: controlReceipt.observedAt,
      expiresAt: controlReceipt.expiresAt,
      evidenceSource: controlReceipt.evidenceSource,
      promotionEligible: controlReceipt.promotionEligible,
      validationWorkflowId: controlReceipt.validationEvidence.workflowId,
      validationRunId: controlReceipt.validationEvidence.runId,
      validationJobId: controlReceipt.validationEvidence.jobId
    };
    if (controlReceipt.evidenceSource !== 'github-api-live') {
      reasons.add('control-receipt-injected');
    }
    if (controlReceipt.promotionEligible !== true) {
      reasons.add('control-receipt-promotion-ineligible');
    }
    if (!('repositoryId' in controlReceipt) || !('repositoryOwnerId' in controlReceipt)) {
      reasons.add('control-repository-ids-unbound');
    }
    if (!('releaseSpecSha256' in controlReceipt)) {
      reasons.add('control-release-spec-unbound');
    }
    if (!Object.values(controlReceipt.attestations).every(value => value === true)) {
      reasons.add('control-receipt-attestations-incomplete');
    }
    if (evaluatedAt !== null) {
      const evaluated = new Date(evaluatedAt).valueOf();
      const observed = new Date(controlReceipt.observedAt).valueOf();
      const expires = new Date(controlReceipt.expiresAt).valueOf();
      const skew = normalizedControlPolicy.policy.limits.maxClockSkewSeconds * 1000;
      if (evaluated < observed - skew) reasons.add('control-receipt-not-yet-valid');
      if (evaluated > expires) reasons.add('control-receipt-stale');
    }
    if (chain && controlReceipt.observedAt <= chain.headObservedAt) {
      reasons.add('control-observed-before-lifecycle-head');
    }
  }

  if (chain && evaluatedAt !== null && evaluatedAt < chain.headObservedAt) {
    reasons.add('lifecycle-head-after-evaluation');
  }

  return finalizeControlDecision({ evaluatedAt, reasons, inputs, context });
}

export async function runCli({ argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr } = {}) {
  if (!Array.isArray(argv) || argv.length !== 0) {
    stderr.write('promotion-lifecycle: command-line operands are not supported\n');
    return 2;
  }
  try {
    const policyRecord = await loadPromotionLifecyclePolicy();
    const releaseSpecRecord = await loadReleaseSpec(REPOSITORY_ROOT, policyRecord.policy.releaseSpecPath);
    const plan = buildPromotionLifecyclePlan({ policyRecord, releaseSpecRecord });
    stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}

export const promotionLifecycleConstants = Object.freeze({
  scriptVersion: SCRIPT_VERSION,
  policyPath: POLICY_PATH,
  receiptSchemaVersion: RECEIPT_SCHEMA_VERSION,
  receiptKind: RECEIPT_KIND,
  receiptScope: RECEIPT_SCOPE,
  referenceKind: REFERENCE_KIND,
  chainIdDomain: CHAIN_ID_DOMAIN,
  receiptIdDomain: RECEIPT_ID_DOMAIN,
  decisionIdDomain: DECISION_ID_DOMAIN,
  observationInventoryDomain: OBSERVATION_INVENTORY_DOMAIN,
  decisionSchemaVersion: DECISION_SCHEMA_VERSION,
  decisionKind: DECISION_KIND,
  repositoryRoot: REPOSITORY_ROOT,
  expectedPolicy: EXPECTED_POLICY
});

if (process.argv[1] && path.resolve(process.argv[1]) === MODULE_PATH) {
  process.exitCode = await runCli();
}
