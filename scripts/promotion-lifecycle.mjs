#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), '..');

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

function lifecycleError(message) {
  return new Error(`promotion-lifecycle: ${message}`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertObject(value, label) {
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

function assertReviewedValue(actual, expected, label) {
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
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
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
  assertExactKeys(subject, SUBJECT_KEYS, 'receipt subject');
  assertSafePositiveInteger(subject.repositoryId, 'receipt subject.repositoryId');
  assertSafePositiveInteger(subject.repositoryOwnerId, 'receipt subject.repositoryOwnerId');
  for (const key of [
    'repositoryOwner',
    'repositoryName',
    'repositoryFullName',
    'gitObjectFormat',
    'version',
    'tag'
  ]) {
    if (subject[key] !== policy.subject[key]) {
      throw lifecycleError(`receipt subject.${key} must exactly match the reviewed policy`);
    }
  }
  if (subject.releaseSpecPath !== policy.releaseSpecPath) {
    throw lifecycleError('receipt subject.releaseSpecPath must exactly match the reviewed policy');
  }
  assertSha256(subject.releaseSpecSha256, 'receipt subject.releaseSpecSha256');
  if (!/^[0-9a-f]{40}$/u.test(subject.sourceCommit)) {
    throw lifecycleError('receipt subject.sourceCommit must be a full lowercase sha1 object ID');
  }
  return cloneJson(subject);
}

function canonicalReference(reference, expectedRole, label, policy) {
  assertExactKeys(reference, REFERENCE_KEYS, label);
  if (reference.kind !== REFERENCE_KIND) {
    throw lifecycleError(`${label}.kind must be exactly ${REFERENCE_KIND}`);
  }
  if (reference.role !== expectedRole) {
    throw lifecycleError(`${label}.role must be exactly ${expectedRole}`);
  }
  assertSha256(reference.sha256, `${label}.sha256`);
  assertSafePositiveInteger(reference.byteLength, `${label}.byteLength`, policy.limits.maxReferenceBytes);
  return cloneJson(reference);
}

function canonicalParent(parent, sequence, policy) {
  if (sequence === 1) {
    if (parent !== null) throw lifecycleError('the first receipt parent must be null');
    return null;
  }
  assertExactKeys(parent, PARENT_KEYS, 'receipt parent');
  assertSha256(parent.receiptId, 'receipt parent.receiptId');
  assertSha256(parent.sha256, 'receipt parent.sha256');
  assertSafePositiveInteger(parent.byteLength, 'receipt parent.byteLength', policy.limits.maxReceiptBytes);
  return cloneJson(parent);
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
  assertReviewedValue(document, EXPECTED_POLICY, 'lifecycle policy');
  return deepFreeze(cloneJson(document));
}

function assertExactPolicyBytes(bytes) {
  if (Buffer.compare(bytes, EXPECTED_POLICY_BYTES) !== 0) {
    throw lifecycleError('lifecycle policy bytes must exactly match the canonical reviewed policy');
  }
}

function normalizedPolicyRecord(record) {
  const snapshot = snapshotExactDataRecord(record, POLICY_RECORD_KEYS, 'lifecycle policy record');
  if (snapshot.path !== POLICY_PATH) throw lifecycleError(`lifecycle policy path must be exactly ${POLICY_PATH}`);
  if (!Buffer.isBuffer(snapshot.bytes)) throw lifecycleError('lifecycle policy record bytes must be a Buffer');
  const bytes = Buffer.from(snapshot.bytes);
  const digest = sha256(bytes);
  if (snapshot.sha256 !== digest) throw lifecycleError('lifecycle policy record SHA-256 does not match its bytes');
  const policy = validatePromotionLifecyclePolicy(parseStrictJson(bytes, POLICY_PATH));
  assertExactPolicyBytes(bytes);
  assertReviewedValue(cloneJson(snapshot.policy), policy, 'lifecycle policy record.policy');
  return { path: POLICY_PATH, bytes, sha256: digest, policy };
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
  if (!Buffer.isBuffer(snapshot.bytes)) throw lifecycleError('release specification record bytes must be a Buffer');
  const bytes = Buffer.from(snapshot.bytes);
  const document = parseStrictJson(bytes, policy.releaseSpecPath);
  const spec = validateReleaseSpec(document);
  assertReviewedValue(cloneJson(snapshot.spec), spec, 'release specification record.spec');
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
  if (!Buffer.isBuffer(receiptBytes)) throw lifecycleError('receipt must be supplied as exact bytes');
  if (receiptBytes.length < 1 || receiptBytes.length > policy.limits.maxReceiptBytes) {
    throw lifecycleError(`receipt byte length must be between 1 and ${policy.limits.maxReceiptBytes}`);
  }
  const receipt = parseStrictJson(receiptBytes, 'lifecycle receipt');
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
  if (!expectedBytes.equals(receiptBytes)) {
    throw lifecycleError('receipt bytes must use the exact canonical UTF-8 serialization');
  }
  return {
    receipt: deepFreeze(normalizedReceipt),
    bytes: Buffer.from(receiptBytes),
    sha256: sha256(receiptBytes),
    byteLength: receiptBytes.length
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
    receiptCount: records.length,
    currentState: head.receipt.toState,
    nextEventType: nextTransition?.eventType || null,
    complete: nextTransition === null,
    productionEligible: false,
    receiptIds: records.map(record => record.receipt.receiptId)
  });
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
  repositoryRoot: REPOSITORY_ROOT,
  expectedPolicy: EXPECTED_POLICY
});

if (process.argv[1] && path.resolve(process.argv[1]) === MODULE_PATH) {
  process.exitCode = await runCli();
}
