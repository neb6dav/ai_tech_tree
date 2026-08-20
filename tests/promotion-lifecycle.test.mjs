import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildPromotionLifecyclePlan,
  createFixtureLifecycleReceipt,
  loadPromotionLifecyclePolicy,
  promotionLifecycleConstants,
  runCli,
  validateLifecycleChain,
  validateLifecycleReceipt,
  validatePromotionLifecyclePolicy
} from '../scripts/promotion-lifecycle.mjs';
import { loadReleaseSpec } from '../scripts/release-spec.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POLICY_RECORD = await loadPromotionLifecyclePolicy();
const RELEASE_SPEC_RECORD = await loadReleaseSpec(
  REPOSITORY_ROOT,
  promotionLifecycleConstants.expectedPolicy.releaseSpecPath
);
const RELEASE_SPEC_SHA256 = digest(RELEASE_SPEC_RECORD.bytes);
const BASE_SUBJECT = Object.freeze({
  repositoryId: 987654321,
  repositoryOwnerId: 123456789,
  repositoryOwner: 'neb6dav',
  repositoryName: 'ai_tech_tree',
  repositoryFullName: 'neb6dav/ai_tech_tree',
  gitObjectFormat: 'sha1',
  releaseSpecPath: 'config/releases/v0.1.1.json',
  releaseSpecSha256: RELEASE_SPEC_SHA256,
  version: '0.1.1',
  tag: 'v0.1.1',
  sourceCommit: '0123456789abcdef0123456789abcdef01234567'
});

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
}

function hashCanonical(domain, value) {
  const hash = createHash('sha256');
  hash.update(domain, 'utf8');
  hash.update(JSON.stringify(value), 'utf8');
  return hash.digest('hex');
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

function resign(receipt, { recalculateChainId = false } = {}) {
  if (recalculateChainId) {
    receipt.chainId = hashCanonical(promotionLifecycleConstants.chainIdDomain, {
      policySha256: receipt.policySha256,
      subject: receipt.subject
    });
  }
  receipt.receiptId = hashCanonical(
    promotionLifecycleConstants.receiptIdDomain,
    receiptIdMaterial(receipt)
  );
  return canonicalBytes(receipt);
}

function reference(role, seed, byteLength = 128) {
  return {
    kind: 'fixture-byte-reference',
    role,
    sha256: digest(Buffer.from(seed, 'utf8')),
    byteLength
  };
}

function firstReceipt(overrides = {}) {
  return createFixtureLifecycleReceipt({
    policyRecord: POLICY_RECORD,
    eventType: 'source-finalized',
    observedAt: '2026-08-20T22:00:00.000Z',
    subject: clone(BASE_SUBJECT),
    evidence: reference('source-finalization-record', 'source evidence'),
    authority: reference('source-finalization-authorization', 'source authority'),
    ...overrides
  });
}

function fullChain(subject = BASE_SUBJECT) {
  const normalizedSubject = clone(subject);
  const source = firstReceipt({ subject: clone(normalizedSubject) });
  const tag = createFixtureLifecycleReceipt({
    policyRecord: POLICY_RECORD,
    eventType: 'tag-verified',
    observedAt: '2026-08-20T22:01:00.000Z',
    subject: clone(normalizedSubject),
    evidence: reference('annotated-tag-verification-record', 'tag evidence'),
    authority: reference('annotated-tag-authorization', 'tag authority'),
    parentReceiptBytes: source.bytes
  });
  const bundle = createFixtureLifecycleReceipt({
    policyRecord: POLICY_RECORD,
    eventType: 'stable-bundle-verified',
    observedAt: '2026-08-20T22:02:00.000Z',
    subject: clone(normalizedSubject),
    evidence: reference('stable-bundle-verification-record', 'bundle evidence', 4096),
    authority: reference('stable-bundle-build-authorization', 'bundle authority'),
    parentReceiptBytes: tag.bytes
  });
  return { source, tag, bundle, bytes: [source.bytes, tag.bytes, bundle.bytes] };
}

test('loads only the reviewed planned fixture policy', () => {
  assert.equal(POLICY_RECORD.path, 'config/promotion-lifecycle-policy.v1.json');
  assert.match(POLICY_RECORD.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(POLICY_RECORD.policy.status, 'planned');
  assert.equal(POLICY_RECORD.policy.mode, 'fixture-only');
  assert.deepEqual(POLICY_RECORD.policy.states, [
    'unstarted',
    'source-finalized',
    'tag-verified',
    'stable-bundle-verified'
  ]);
  assert.deepEqual(
    POLICY_RECORD.policy.transitions.map(item => item.eventType),
    ['source-finalized', 'tag-verified', 'stable-bundle-verified']
  );
});

test('policy loader rejects every caller-controlled root before reading', async () => {
  const remoteLikeRoot = String.raw`\\fixture-host\untrusted-share`;
  await assert.rejects(
    loadPromotionLifecyclePolicy(remoteLikeRoot),
    /does not accept a caller-controlled path/iu
  );
});

test('policy validation rejects extra, reordered, or changed trust anchors', () => {
  const extra = clone(promotionLifecycleConstants.expectedPolicy);
  extra.unreviewed = true;
  assert.throws(() => validatePromotionLifecyclePolicy(extra), /keys must be exactly/iu);

  const reviewed = clone(promotionLifecycleConstants.expectedPolicy);
  const reordered = { status: reviewed.status, schemaVersion: reviewed.schemaVersion };
  for (const [key, value] of Object.entries(reviewed)) {
    if (!(key in reordered)) reordered[key] = value;
  }
  assert.throws(() => validatePromotionLifecyclePolicy(reordered), /keys must be exactly/iu);

  const relabeled = clone(promotionLifecycleConstants.expectedPolicy);
  relabeled.mode = 'production';
  assert.throws(() => validatePromotionLifecyclePolicy(relabeled), /reviewed policy/iu);

  const alternateBytes = Buffer.from(JSON.stringify(clone(promotionLifecycleConstants.expectedPolicy)), 'utf8');
  const alternateRecord = {
    path: POLICY_RECORD.path,
    bytes: alternateBytes,
    sha256: digest(alternateBytes),
    policy: clone(promotionLifecycleConstants.expectedPolicy)
  };
  assert.throws(
    () => buildPromotionLifecyclePlan({
      policyRecord: alternateRecord,
      releaseSpecRecord: RELEASE_SPEC_RECORD
    }),
    /canonical reviewed policy/iu
  );

  const hostileBuffer = Buffer.from(alternateBytes);
  hostileBuffer.equals = () => true;
  assert.throws(
    () => buildPromotionLifecyclePlan({
      policyRecord: {
        ...alternateRecord,
        bytes: hostileBuffer,
        sha256: digest(hostileBuffer)
      },
      releaseSpecRecord: RELEASE_SPEC_RECORD
    }),
    /canonical reviewed policy/iu
  );
});

test('plan is deterministic, reports the real planned release, and grants no authority', () => {
  const first = buildPromotionLifecyclePlan({
    policyRecord: POLICY_RECORD,
    releaseSpecRecord: RELEASE_SPEC_RECORD
  });
  const second = buildPromotionLifecyclePlan({
    policyRecord: POLICY_RECORD,
    releaseSpecRecord: RELEASE_SPEC_RECORD
  });
  assert.deepEqual(first, second);
  assert.equal(first.mode, 'plan-only');
  assert.equal(first.policy.status, 'planned');
  assert.equal(first.releaseSpec.status, 'planned');
  assert.equal(first.releaseSpec.sha256, RELEASE_SPEC_SHA256);
  assert.equal(first.productionEligible, false);
  assert.deepEqual(first.capabilities, {
    fixedFileReads: true,
    inMemoryFixtureReceiptCreation: true,
    fixtureChainValidation: true,
    networkAccess: false,
    filesystemWrites: false,
    externalMutation: false,
    productionEvidenceValidation: false
  });
  assert.ok(Object.values(first.authorization).every(value => value === false));
  assert.match(first.blockers.join(' '), /planned, not ready/iu);
  assert.match(first.blockers.join(' '), /production-ineligible/iu);
  assert.match(first.blockers.join(' '), /promotion-ineligible/iu);
});

test('plan rejects extra or byte-inconsistent release-spec record metadata', () => {
  const extra = { ...RELEASE_SPEC_RECORD, productionEligible: true };
  assert.throws(
    () => buildPromotionLifecyclePlan({ policyRecord: POLICY_RECORD, releaseSpecRecord: extra }),
    /release specification record keys must be exactly/iu
  );

  const inconsistent = {
    path: RELEASE_SPEC_RECORD.path,
    bytes: RELEASE_SPEC_RECORD.bytes,
    spec: { ...RELEASE_SPEC_RECORD.spec, status: 'ready' }
  };
  assert.throws(
    () => buildPromotionLifecyclePlan({ policyRecord: POLICY_RECORD, releaseSpecRecord: inconsistent }),
    /record\.spec\.status/iu
  );
});

test('record envelopes reject accessors before reading caller-controlled bytes', () => {
  let policyByteReads = 0;
  const hostilePolicyRecord = {};
  for (const [key, value] of Object.entries(POLICY_RECORD)) {
    Object.defineProperty(hostilePolicyRecord, key, key === 'bytes'
      ? {
          enumerable: true,
          get() {
            policyByteReads += 1;
            return policyByteReads === 2
              ? Buffer.from(JSON.stringify(clone(promotionLifecycleConstants.expectedPolicy)), 'utf8')
              : value;
          }
        }
      : { enumerable: true, value });
  }
  assert.throws(
    () => buildPromotionLifecyclePlan({
      policyRecord: hostilePolicyRecord,
      releaseSpecRecord: RELEASE_SPEC_RECORD
    }),
    /bytes must be an enumerable data property/iu
  );
  assert.equal(policyByteReads, 0);

  let releaseByteReads = 0;
  const hostileReleaseRecord = {};
  for (const [key, value] of Object.entries(RELEASE_SPEC_RECORD)) {
    Object.defineProperty(hostileReleaseRecord, key, key === 'bytes'
      ? {
          enumerable: true,
          get() {
            releaseByteReads += 1;
            return value;
          }
        }
      : { enumerable: true, value });
  }
  assert.throws(
    () => buildPromotionLifecyclePlan({
      policyRecord: POLICY_RECORD,
      releaseSpecRecord: hostileReleaseRecord
    }),
    /bytes must be an enumerable data property/iu
  );
  assert.equal(releaseByteReads, 0);
});

test('CLI emits only the deterministic fixed-root plan and rejects every operand', async () => {
  const watched = [
    'config/promotion-lifecycle-policy.v1.json',
    'config/releases/v0.1.1.json',
    'scripts/promotion-lifecycle.mjs'
  ];
  const before = await Promise.all(watched.map(async relative => digest(await readFile(path.join(REPOSITORY_ROOT, relative)))));
  async function invoke(argv) {
    let standard = '';
    let diagnostic = '';
    const code = await runCli({
      argv,
      stdout: { write: value => { standard += value; } },
      stderr: { write: value => { diagnostic += value; } }
    });
    return { code, standard, diagnostic };
  }
  const first = await invoke([]);
  const second = await invoke([]);
  assert.deepEqual(first, second);
  assert.equal(first.code, 0);
  assert.equal(first.diagnostic, '');
  assert.equal(JSON.parse(first.standard).mode, 'plan-only');

  const rejected = await invoke(['unexpected-operand']);
  assert.equal(rejected.code, 2);
  assert.equal(rejected.standard, '');
  assert.match(rejected.diagnostic, /operands are not supported/iu);

  const after = await Promise.all(watched.map(async relative => digest(await readFile(path.join(REPOSITORY_ROOT, relative)))));
  assert.deepEqual(after, before);
});

test('source receipt creation is deterministic, canonical, and fixture-only', () => {
  const first = firstReceipt();
  const second = firstReceipt();
  assert.ok(first.bytes.equals(second.bytes));
  assert.equal(first.sha256, second.sha256);
  assert.equal(first.receipt.receiptId, second.receipt.receiptId);
  assert.equal(first.receipt.sequence, 1);
  assert.equal(first.receipt.parent, null);
  assert.equal(first.receipt.productionEligible, false);
  assert.equal(first.receipt.scope, 'fixture-only');
  assert.equal(first.receipt.policySha256, POLICY_RECORD.sha256);
  assert.ok(first.bytes.equals(canonicalBytes(first.receipt)));

  const differentFact = firstReceipt({
    observedAt: '2026-08-20T22:00:01.000Z',
    evidence: reference('source-finalization-record', 'different source evidence')
  });
  assert.equal(first.receipt.chainId, differentFact.receipt.chainId);
  assert.notEqual(first.receipt.receiptId, differentFact.receipt.receiptId);
});

test('validates each append and a complete exact-byte-closed chain', () => {
  const chain = fullChain();
  assert.equal(chain.source.receipt.toState, 'source-finalized');
  assert.equal(chain.tag.receipt.toState, 'tag-verified');
  assert.equal(chain.bundle.receipt.toState, 'stable-bundle-verified');
  assert.equal(chain.source.receipt.chainId, chain.bundle.receipt.chainId);
  assert.deepEqual(chain.tag.receipt.parent, {
    receiptId: chain.source.receipt.receiptId,
    sha256: chain.source.sha256,
    byteLength: chain.source.byteLength
  });

  const partial = validateLifecycleChain(chain.bytes.slice(0, 2), {
    policyRecord: POLICY_RECORD,
    expectedHeadSha256: chain.tag.sha256,
    expectedSubject: clone(BASE_SUBJECT)
  });
  assert.equal(partial.currentState, 'tag-verified');
  assert.equal(partial.nextEventType, 'stable-bundle-verified');
  assert.equal(partial.complete, false);

  const complete = validateLifecycleChain(chain.bytes, {
    policyRecord: POLICY_RECORD,
    expectedHeadSha256: chain.bundle.sha256,
    expectedSubject: clone(BASE_SUBJECT)
  });
  assert.equal(complete.receiptCount, 3);
  assert.equal(complete.currentState, 'stable-bundle-verified');
  assert.equal(complete.nextEventType, null);
  assert.equal(complete.complete, true);
  assert.equal(complete.productionEligible, false);
});

test('rejects duplicate keys, extra keys, key reordering, whitespace variants, CRLF, and BOM', () => {
  const valid = firstReceipt();
  const text = valid.bytes.toString('utf8');
  const duplicate = Buffer.from(text.replace(
    '{"schemaVersion":"1.0.0",',
    '{"schemaVersion":"1.0.0","schemaVersion":"1.0.0",'
  ), 'utf8');
  assert.throws(
    () => validateLifecycleReceipt(duplicate, { policyRecord: POLICY_RECORD }),
    /duplicate key/iu
  );

  const document = clone(valid.receipt);
  const extra = canonicalBytes({ ...document, unreviewed: true });
  assert.throws(
    () => validateLifecycleReceipt(extra, { policyRecord: POLICY_RECORD }),
    /keys must be exactly/iu
  );

  const { schemaVersion, kind, ...rest } = document;
  const reordered = canonicalBytes({ kind, schemaVersion, ...rest });
  assert.throws(
    () => validateLifecycleReceipt(reordered, { policyRecord: POLICY_RECORD }),
    /keys must be exactly/iu
  );

  const pretty = Buffer.from(`${JSON.stringify(document, null, 2)}\n`, 'utf8');
  assert.throws(
    () => validateLifecycleReceipt(pretty, { policyRecord: POLICY_RECORD }),
    /canonical UTF-8 serialization/iu
  );
  const crlf = Buffer.from(`${JSON.stringify(document, null, 2).replaceAll('\n', '\r\n')}\r\n`, 'utf8');
  assert.throws(
    () => validateLifecycleReceipt(crlf, { policyRecord: POLICY_RECORD }),
    /canonical UTF-8 serialization/iu
  );
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), valid.bytes]);
  assert.throws(
    () => validateLifecycleReceipt(bom, { policyRecord: POLICY_RECORD }),
    /must not contain a UTF-8 BOM/iu
  );
});

test('rejects relabeled fixture receipts and references even when content hashes are recomputed', () => {
  const valid = firstReceipt();
  for (const mutate of [
    receipt => { receipt.scope = 'live'; },
    receipt => { receipt.kind = 'promotion-lifecycle-attestation'; },
    receipt => { receipt.productionEligible = true; },
    receipt => { receipt.evidence.kind = 'external-byte-reference'; },
    receipt => { receipt.authority.role = 'release-manager-approval'; }
  ]) {
    const hostile = clone(valid.receipt);
    mutate(hostile);
    const bytes = resign(hostile);
    assert.throws(
      () => validateLifecycleReceipt(bytes, { policyRecord: POLICY_RECORD }),
      /fixture|exactly|role/iu
    );
  }
});

test('rejects wrong fixed subjects and subject changes within a chain', () => {
  const valid = firstReceipt();
  const foreign = clone(valid.receipt);
  foreign.subject.repositoryFullName = 'attacker/other';
  const foreignBytes = resign(foreign, { recalculateChainId: true });
  assert.throws(
    () => validateLifecycleReceipt(foreignBytes, { policyRecord: POLICY_RECORD }),
    /subject\.repositoryFullName/iu
  );

  const chain = fullChain();
  const changed = clone(chain.tag.receipt);
  changed.subject.sourceCommit = 'abcdef0123456789abcdef0123456789abcdef01';
  const changedBytes = resign(changed, { recalculateChainId: true });
  validateLifecycleReceipt(changedBytes, { policyRecord: POLICY_RECORD });
  assert.throws(
    () => validateLifecycleChain([chain.source.bytes, changedBytes], {
      policyRecord: POLICY_RECORD,
      expectedHeadSha256: digest(changedBytes),
      expectedSubject: clone(BASE_SUBJECT)
    }),
    /subject changed/iu
  );

  const recreatedSubject = clone(BASE_SUBJECT);
  recreatedSubject.repositoryId += 1;
  recreatedSubject.repositoryOwnerId += 1;
  const recreated = fullChain(recreatedSubject);
  assert.throws(
    () => validateLifecycleChain(recreated.bytes, {
      policyRecord: POLICY_RECORD,
      expectedHeadSha256: recreated.bundle.sha256,
      expectedSubject: clone(BASE_SUBJECT)
    }),
    /out-of-band expectedSubject/iu
  );
});

test('rejects skipped, reversed, forked, and duplicate receipt sequences', () => {
  const chain = fullChain();
  assert.throws(
    () => validateLifecycleChain([chain.source.bytes, chain.bundle.bytes], {
      policyRecord: POLICY_RECORD,
      expectedHeadSha256: chain.bundle.sha256,
      expectedSubject: clone(BASE_SUBJECT)
    }),
    /non-linear/iu
  );
  assert.throws(
    () => validateLifecycleChain([chain.tag.bytes, chain.source.bytes], {
      policyRecord: POLICY_RECORD,
      expectedHeadSha256: chain.source.sha256,
      expectedSubject: clone(BASE_SUBJECT)
    }),
    /non-linear/iu
  );

  const fork = createFixtureLifecycleReceipt({
    policyRecord: POLICY_RECORD,
    eventType: 'tag-verified',
    observedAt: '2026-08-20T22:01:30.000Z',
    subject: clone(BASE_SUBJECT),
    evidence: reference('annotated-tag-verification-record', 'forked tag evidence'),
    authority: reference('annotated-tag-authorization', 'forked tag authority'),
    parentReceiptBytes: chain.source.bytes
  });
  assert.throws(
    () => validateLifecycleChain([chain.source.bytes, chain.tag.bytes, fork.bytes], {
      policyRecord: POLICY_RECORD,
      expectedHeadSha256: fork.sha256,
      expectedSubject: clone(BASE_SUBJECT)
    }),
    /non-linear/iu
  );
  assert.throws(
    () => validateLifecycleChain([chain.source.bytes, chain.source.bytes], {
      policyRecord: POLICY_RECORD,
      expectedHeadSha256: chain.source.sha256,
      expectedSubject: clone(BASE_SUBJECT)
    }),
    /duplicate receiptId/iu
  );
});

test('rejects exact-parent drift and requires an out-of-band head anchor', () => {
  const chain = fullChain();
  const drifted = clone(chain.tag.receipt);
  drifted.parent.sha256 = 'f'.repeat(64);
  const driftedBytes = resign(drifted);
  validateLifecycleReceipt(driftedBytes, { policyRecord: POLICY_RECORD });
  assert.throws(
    () => validateLifecycleChain([chain.source.bytes, driftedBytes], {
      policyRecord: POLICY_RECORD,
      expectedHeadSha256: digest(driftedBytes),
      expectedSubject: clone(BASE_SUBJECT)
    }),
    /exact preceding receipt bytes/iu
  );

  assert.throws(
    () => validateLifecycleChain(chain.bytes, {
      policyRecord: POLICY_RECORD,
      expectedSubject: clone(BASE_SUBJECT)
    }),
    /out-of-band expectedHeadSha256/iu
  );
  assert.throws(
    () => validateLifecycleChain(chain.bytes, {
      policyRecord: POLICY_RECORD,
      expectedHeadSha256: '0'.repeat(64),
      expectedSubject: clone(BASE_SUBJECT)
    }),
    /head does not match/iu
  );
  assert.throws(
    () => validateLifecycleChain(chain.bytes, {
      policyRecord: POLICY_RECORD,
      expectedHeadSha256: chain.bundle.sha256
    }),
    /receipt subject must be an object/iu
  );
});

test('rejects unreviewed transition types and reversed creation', () => {
  assert.throws(
    () => firstReceipt({ eventType: 'tag-verified' }),
    /next eventType must be exactly source-finalized/iu
  );
  const chain = fullChain();
  assert.throws(
    () => createFixtureLifecycleReceipt({
      policyRecord: POLICY_RECORD,
      eventType: 'source-finalized',
      observedAt: '2026-08-20T22:03:00.000Z',
      subject: clone(BASE_SUBJECT),
      evidence: reference('source-finalization-record', 'reversed evidence'),
      authority: reference('source-finalization-authorization', 'reversed authority'),
      parentReceiptBytes: chain.tag.bytes
    }),
    /next eventType must be exactly stable-bundle-verified/iu
  );
  assert.throws(
    () => createFixtureLifecycleReceipt({
      policyRecord: POLICY_RECORD,
      eventType: 'stable-bundle-verified',
      observedAt: '2026-08-20T22:03:00.000Z',
      subject: clone(BASE_SUBJECT),
      evidence: reference('stable-bundle-verification-record', 'extra evidence'),
      authority: reference('stable-bundle-build-authorization', 'extra authority'),
      parentReceiptBytes: chain.bundle.bytes
    }),
    /already complete/iu
  );
});

test('rejects unsafe byte sizes, identifiers, receipt sizes, and timestamps', () => {
  for (const byteLength of [0, Number.MAX_SAFE_INTEGER + 1, POLICY_RECORD.policy.limits.maxReferenceBytes + 1]) {
    assert.throws(
      () => firstReceipt({ evidence: reference('source-finalization-record', 'unsafe size', byteLength) }),
      /positive safe integer/iu
    );
  }
  for (const observedAt of [
    '2026-08-20T22:00:00Z',
    '2026-08-20T18:00:00.000-04:00',
    '2026-02-30T00:00:00.000Z',
    '2026-08-19T23:59:59.999Z',
    '10000-01-01T00:00:00.000Z'
  ]) {
    assert.throws(() => firstReceipt({ observedAt }), /timestamp|lifecycle window/iu);
  }
  const unsafeSubject = clone(BASE_SUBJECT);
  unsafeSubject.repositoryId = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => firstReceipt({ subject: unsafeSubject }), /positive safe integer/iu);

  const oversized = Buffer.alloc(POLICY_RECORD.policy.limits.maxReceiptBytes + 1, 0x20);
  assert.throws(
    () => validateLifecycleReceipt(oversized, { policyRecord: POLICY_RECORD }),
    /receipt byte length/iu
  );

  const chain = fullChain();
  assert.throws(
    () => createFixtureLifecycleReceipt({
      policyRecord: POLICY_RECORD,
      eventType: 'tag-verified',
      observedAt: chain.source.receipt.observedAt,
      subject: clone(BASE_SUBJECT),
      evidence: reference('annotated-tag-verification-record', 'same-time evidence'),
      authority: reference('annotated-tag-authorization', 'same-time authority'),
      parentReceiptBytes: chain.source.bytes
    }),
    /later than its parent/iu
  );

  const nonMonotonic = clone(chain.tag.receipt);
  nonMonotonic.observedAt = chain.source.receipt.observedAt;
  const nonMonotonicBytes = resign(nonMonotonic);
  validateLifecycleReceipt(nonMonotonicBytes, { policyRecord: POLICY_RECORD });
  assert.throws(
    () => validateLifecycleChain([chain.source.bytes, nonMonotonicBytes], {
      policyRecord: POLICY_RECORD,
      expectedHeadSha256: digest(nonMonotonicBytes),
      expectedSubject: clone(BASE_SUBJECT)
    }),
    /increase strictly/iu
  );
});

test('source is limited to fixed reads and in-memory hashing', async () => {
  const source = await readFile(path.join(REPOSITORY_ROOT, 'scripts/promotion-lifecycle.mjs'), 'utf8');
  const builtins = [...source.matchAll(/^import .* from '(node:[^']+)'/gmu)].map(match => match[1]);
  assert.deepEqual(builtins, ['node:crypto', 'node:fs/promises', 'node:path', 'node:url']);
  assert.equal(source.includes('import' + '('), false);
  assert.match(source, /import \{ readFile \} from 'node:fs\/promises'/u);
});
