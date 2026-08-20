import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildPromotionLifecyclePlan,
  createFixtureLifecycleReceipt,
  decideFreshControlConsumption,
  loadPromotionLifecyclePolicy,
  promotionLifecycleConstants,
  runCli,
  validateLifecycleChain,
  validateLifecycleReceipt,
  validatePromotionLifecyclePolicy
} from '../scripts/promotion-lifecycle.mjs';
import { loadPromotionPolicy } from '../scripts/github-control-audit.mjs';
import { loadReleaseSpec } from '../scripts/release-spec.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POLICY_RECORD = await loadPromotionLifecyclePolicy();
const RELEASE_SPEC_RECORD = await loadReleaseSpec(
  REPOSITORY_ROOT,
  promotionLifecycleConstants.expectedPolicy.releaseSpecPath
);
const RELEASE_SPEC_SHA256 = digest(RELEASE_SPEC_RECORD.bytes);
const CONTROL_POLICY_RECORD = await loadPromotionPolicy(REPOSITORY_ROOT);
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

function sortedJsonData(value) {
  if (Array.isArray(value)) return value.map(sortedJsonData);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortedJsonData(value[key])]))
  }
  return value;
}

function canonicalControlBytes(value) {
  return canonicalBytes(sortedJsonData(value));
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

function controlEvidence(expectedCommit = BASE_SUBJECT.sourceCommit) {
  const phases = [
    ['/repos/neb6dav/ai_tech_tree', {}],
    ['/repos/neb6dav/ai_tech_tree/git/ref/heads/main', {}],
    ['/repos/neb6dav/ai_tech_tree/rulesets', { includes_parents: 'false', page: 1, per_page: 100 }],
    ['/repos/neb6dav/ai_tech_tree/rulesets/101', {}],
    ['/repos/neb6dav/ai_tech_tree/rulesets/202', {}],
    ['/repos/neb6dav/ai_tech_tree/rules/branches/main', {}],
    ['/repos/neb6dav/ai_tech_tree/environments/github-pages', {}],
    ['/repos/neb6dav/ai_tech_tree/environments/github-pages/deployment-branch-policies', { page: 1, per_page: 100 }],
    ['/repos/neb6dav/ai_tech_tree/pages', {}],
    ['/repos/neb6dav/ai_tech_tree/immutable-releases', {}],
    ['/repos/neb6dav/ai_tech_tree/actions/workflows/validate.yml', {}],
    ['/repos/neb6dav/ai_tech_tree/actions/workflows/303/runs', {
      branch: 'main', event: 'push', head_sha: expectedCommit, status: 'success', page: 1, per_page: 100
    }],
    ['/repos/neb6dav/ai_tech_tree/actions/runs/404/jobs', { filter: 'latest', page: 1, per_page: 100 }],
    ['/repos/neb6dav/ai_tech_tree/git/ref/heads/main', {}]
  ];
  return phases.map(([requestPath, query], index) => ({
    sequence: index + 1,
    method: 'GET',
    path: requestPath,
    query,
    status: 200,
    bytes: 16 + index,
    sha256: digest(Buffer.from(`control response ${index + 1}`, 'utf8'))
  }));
}

function currentControlReceipt({
  expectedCommit = BASE_SUBJECT.sourceCommit,
  observedAt = '2026-08-20T22:03:00.000Z',
  mutate = null
} = {}) {
  const evidence = controlEvidence(expectedCommit);
  const receipt = {
    schemaVersion: '1.0.0',
    toolVersion: '1.0.0',
    scope: 'injected-control-response-shape-test',
    evidenceSource: 'injected-test-only',
    promotionEligible: false,
    policy: {
      path: CONTROL_POLICY_RECORD.path,
      sha256: CONTROL_POLICY_RECORD.sha256,
      schemaVersion: CONTROL_POLICY_RECORD.policy.schemaVersion,
      status: CONTROL_POLICY_RECORD.policy.status
    },
    repository: CONTROL_POLICY_RECORD.policy.repository.fullName,
    release: {
      version: CONTROL_POLICY_RECORD.policy.release.version,
      tag: CONTROL_POLICY_RECORD.policy.release.tag,
      environment: CONTROL_POLICY_RECORD.policy.release.environment
    },
    expectedCommit,
    observedAt,
    expiresAt: new Date(
      new Date(observedAt).valueOf() + CONTROL_POLICY_RECORD.policy.limits.receiptFreshnessSeconds * 1000
    ).toISOString(),
    requestCount: evidence.length,
    responseBytes: evidence.reduce((total, item) => total + item.bytes, 0),
    attestations: {
      githubControlsObservedLive: false,
      releaseSpecVerified: false,
      tagTargetVerified: false,
      toolSourceVerifiedAtExpectedCommit: false,
      workflowBlobVerifiedAtExpectedCommit: false
    },
    checks: {
      repositoryIdentity: true,
      mainRefBookended: true,
      mainRuleset: true,
      tagRuleset: true,
      effectiveMainRules: true,
      protectedEnvironment: true,
      pages: true,
      immutableReleases: true,
      exactValidationRun: true,
      exactValidationJob: true
    },
    rulesetEvidence: { mainId: 101, tagId: 202 },
    validationEvidence: { workflowId: 303, runId: 404, jobId: 505, event: 'push', conclusion: 'success' },
    evidence,
    summary: {
      status: 'fixture-controls-match-policy',
      auditorRequestedOnlyGets: true,
      transportSideEffectsAttested: false,
      externalMutationAuthorized: false
    }
  };
  if (mutate) mutate(receipt);
  return receipt;
}

function controlCandidate(receiptBytes) {
  return { receiptSha256: digest(receiptBytes), receiptBytes };
}

function decisionFixture({
  chain = fullChain(),
  subject = BASE_SUBJECT,
  receipt = currentControlReceipt({ expectedCommit: subject.sourceCommit }),
  receiptBytes = canonicalControlBytes(receipt),
  completeness = 'complete',
  selectedSha256 = digest(receiptBytes),
  candidates = [controlCandidate(receiptBytes)],
  expectedControlReceiptSha256 = selectedSha256,
  evaluatedAt = '2026-08-20T22:04:00.000Z',
  expectedHeadSha256 = chain.bundle?.sha256 || chain.at(-1)?.sha256
} = {}) {
  return {
    policyRecord: POLICY_RECORD,
    receiptBytesList: chain.bytes || chain,
    expectedHeadSha256,
    expectedSubject: clone(subject),
    controlPolicyRecord: CONTROL_POLICY_RECORD,
    controlObservation: { completeness, selectedSha256, candidates },
    expectedControlReceiptSha256,
    evaluatedAt
  };
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
      fixtureControlConsumptionDecision: true,
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

  let nestedSpecReads = 0;
  const hostileSpec = {};
  for (const [key, value] of Object.entries(RELEASE_SPEC_RECORD.spec)) {
    Object.defineProperty(hostileSpec, key, key === 'status'
      ? {
          enumerable: true,
          get() {
            nestedSpecReads += 1;
            return value;
          }
        }
      : { enumerable: true, value });
  }
  assert.throws(
    () => buildPromotionLifecyclePlan({
      policyRecord: POLICY_RECORD,
      releaseSpecRecord: {
        path: RELEASE_SPEC_RECORD.path,
        bytes: RELEASE_SPEC_RECORD.bytes,
        spec: hostileSpec
      }
    }),
    /status must be an enumerable data property/iu
  );
  assert.equal(nestedSpecReads, 0);
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
  assert.deepEqual(builtins, ['node:crypto', 'node:fs/promises', 'node:path', 'node:url', 'node:util']);
  assert.equal(source.includes('import' + '('), false);
  assert.match(source, /import \{ readFile \} from 'node:fs\/promises'/u);
});

test('B2.2 policy binds the exact B1 policy and exposes the chain head observation time', () => {
  const controlDecision = POLICY_RECORD.policy.controlDecision;
  assert.equal(controlDecision.scope, 'fixture-only');
  assert.equal(controlDecision.controlPolicyPath, CONTROL_POLICY_RECORD.path);
  assert.equal(controlDecision.controlPolicySha256, CONTROL_POLICY_RECORD.sha256);
  assert.equal(controlDecision.requiredLifecycleState, 'stable-bundle-verified');
  assert.equal(controlDecision.maxControlReceiptCandidates, 4);
  assert.ok(controlDecision.maxControlReceiptBytes > 0);
  assert.deepEqual(controlDecision.decisions, [
    'reconcile',
    'block',
    'proceed-to-b2.3-read-only-preflight'
  ]);
  assert.equal(new Set(controlDecision.reasonCodes).size, controlDecision.reasonCodes.length);

  const fixture = fullChain();
  const chain = validateLifecycleChain(fixture.bytes, {
    policyRecord: POLICY_RECORD,
    expectedHeadSha256: fixture.bundle.sha256,
    expectedSubject: clone(BASE_SUBJECT)
  });
  assert.equal(chain.headObservedAt, fixture.bundle.receipt.observedAt);
});

test('current canonical B1 fixture evidence deterministically blocks and grants no authority', () => {
  const first = decideFreshControlConsumption(decisionFixture());
  const second = decideFreshControlConsumption(decisionFixture());
  assert.ok(first.bytes.equals(second.bytes));
  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(first.decision, second.decision);
  assert.equal(first.decision.outcome, 'block');
  assert.equal(first.decision.scope, 'fixture-only');
  assert.equal(first.decision.productionEligible, false);
  assert.equal(first.decision.externalMutationAuthorized, false);
  assert.equal(first.decision.nextAction, 'resolve-blockers-before-b2.3');
  assert.deepEqual(first.decision.reasonCodes, [
    'control-policy-planned',
    'control-receipt-injected',
    'control-receipt-promotion-ineligible',
    'control-repository-ids-unbound',
    'control-release-spec-unbound',
    'control-receipt-attestations-incomplete'
  ]);
  assert.equal(
    first.decision.inputs.expectedControlReceiptSha256,
    first.decision.inputs.observationSelectedControlReceiptSha256
  );
  assert.equal(
    first.decision.inputs.observationSelectedControlReceiptSha256,
    first.decision.inputs.consumedControlReceiptSha256
  );
  assert.deepEqual(first.decision.context.subject, BASE_SUBJECT);
  assert.deepEqual(first.decision.context.lifecycle, {
    policyPath: POLICY_RECORD.path,
    policySha256: POLICY_RECORD.sha256,
    chainId: first.decision.inputs.lifecycleChainId,
    headSha256: first.decision.inputs.lifecycleHeadSha256,
    headObservedAt: '2026-08-20T22:02:00.000Z',
    receiptCount: 3,
    currentState: 'stable-bundle-verified',
    complete: true
  });
  assert.deepEqual(first.decision.context.controlPolicy, {
    path: CONTROL_POLICY_RECORD.path,
    sha256: CONTROL_POLICY_RECORD.sha256,
    status: 'planned',
    receiptFreshnessSeconds: 300,
    maxClockSkewSeconds: 30
  });
  assert.equal(first.decision.context.observation.completeness, 'complete');
  assert.equal(first.decision.context.observation.candidateCount, 1);
  assert.equal(first.decision.context.observation.distinctCandidateCount, 1);
  assert.match(first.decision.context.observation.inventorySha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(first.decision.context.selectedReceipt, {
    sha256: first.decision.inputs.consumedControlReceiptSha256,
    byteLength: first.decision.context.selectedReceipt.byteLength,
    observedAt: '2026-08-20T22:03:00.000Z',
    expiresAt: '2026-08-20T22:08:00.000Z',
    evidenceSource: 'injected-test-only',
    promotionEligible: false,
    validationWorkflowId: 303,
    validationRunId: 404,
    validationJobId: 505
  });
  assert.ok(first.decision.context.selectedReceipt.byteLength > 0);
  assert.equal(JSON.stringify(first.decision).includes('receiptBytes'), false);
  assert.ok(first.bytes.equals(canonicalBytes(first.decision)));
  const material = {
    schemaVersion: first.decision.schemaVersion,
    kind: first.decision.kind,
    scope: first.decision.scope,
    productionEligible: first.decision.productionEligible,
    externalMutationAuthorized: first.decision.externalMutationAuthorized,
    outcome: first.decision.outcome,
    evaluatedAt: first.decision.evaluatedAt,
    reasonCodes: first.decision.reasonCodes,
    nextAction: first.decision.nextAction,
    inputs: first.decision.inputs,
    context: first.decision.context
  };
  assert.equal(
    first.decision.decisionId,
    hashCanonical(promotionLifecycleConstants.decisionIdDomain, material)
  );
});

test('control observation selection reconciles unknown, missing, excessive, and ambiguous evidence', async t => {
  const primaryBytes = canonicalControlBytes(currentControlReceipt());
  const alternateBytes = canonicalControlBytes(currentControlReceipt({
    observedAt: '2026-08-20T22:03:01.000Z'
  }));
  const primary = controlCandidate(primaryBytes);
  const alternate = controlCandidate(alternateBytes);
  const cases = [
    {
      name: 'unknown completeness',
      overrides: { completeness: 'unknown' },
      reasons: ['control-observation-unknown']
    },
    {
      name: 'no selection',
      overrides: { selectedSha256: null },
      reasons: ['control-selection-missing']
    },
    {
      name: 'selection not found',
      overrides: { selectedSha256: 'f'.repeat(64) },
      reasons: ['control-selection-not-found']
    },
    {
      name: 'empty complete observation',
      overrides: { selectedSha256: null, candidates: [] },
      reasons: ['control-observation-missing', 'control-selection-missing']
    },
    {
      name: 'more candidates than the reviewed bound',
      overrides: { candidates: Array.from({ length: 5 }, () => ({
        receiptSha256: primary.receiptSha256,
        receiptBytes: Buffer.from(primary.receiptBytes)
      })) },
      reasons: ['control-observation-limit-exceeded']
    },
    {
      name: 'multiple distinct candidates',
      overrides: { candidates: [primary, alternate] },
      reasons: ['control-observation-ambiguous']
    }
  ];
  for (const item of cases) {
    await t.test(item.name, () => {
      const result = decideFreshControlConsumption(decisionFixture({
        receiptBytes: primaryBytes,
        ...item.overrides
      }));
      assert.equal(result.decision.outcome, 'reconcile');
      for (const reason of item.reasons) assert.ok(result.decision.reasonCodes.includes(reason));
      assert.equal(result.decision.productionEligible, false);
      assert.equal(result.decision.externalMutationAuthorized, false);
    });
  }

  const duplicate = decideFreshControlConsumption(decisionFixture({
    receiptBytes: primaryBytes,
    candidates: [
      { receiptSha256: primary.receiptSha256, receiptBytes: Buffer.from(primary.receiptBytes) },
      { receiptSha256: primary.receiptSha256, receiptBytes: Buffer.from(primary.receiptBytes) }
    ]
  }));
  assert.equal(duplicate.decision.outcome, 'reconcile');
  assert.ok(duplicate.decision.reasonCodes.includes('control-observation-duplicate'));
  assert.equal(duplicate.decision.reasonCodes.includes('control-observation-ambiguous'), false);
  assert.equal(duplicate.decision.context.observation.candidateCount, 2);
  assert.equal(duplicate.decision.context.observation.distinctCandidateCount, 1);
});

test('an independent out-of-band receipt anchor must agree with the observation selection', () => {
  const conflicting = decideFreshControlConsumption(decisionFixture({
    expectedControlReceiptSha256: 'f'.repeat(64)
  }));
  assert.equal(conflicting.decision.outcome, 'reconcile');
  assert.ok(conflicting.decision.reasonCodes.includes('control-selection-anchor-conflict'));
  assert.equal(conflicting.decision.inputs.expectedControlReceiptSha256, 'f'.repeat(64));
  assert.notEqual(
    conflicting.decision.inputs.expectedControlReceiptSha256,
    conflicting.decision.inputs.observationSelectedControlReceiptSha256
  );
  assert.equal(conflicting.decision.inputs.consumedControlReceiptSha256, null);
  assert.equal(conflicting.decision.context.selectedReceipt, null);

  const malformed = decideFreshControlConsumption(decisionFixture({
    expectedControlReceiptSha256: 'NOT-A-DIGEST'
  }));
  assert.equal(malformed.decision.outcome, 'reconcile');
  assert.ok(malformed.decision.reasonCodes.includes('control-receipt-anchor-invalid'));
  assert.equal(malformed.decision.inputs.expectedControlReceiptSha256, null);
});

test('control receipt admission rejects hash swaps, oversize bytes, and noncanonical serializations', async t => {
  const receipt = currentControlReceipt();
  const canonical = canonicalControlBytes(receipt);
  const noncanonicalCases = [
    ['minified without canonical key sorting', Buffer.from(JSON.stringify(receipt), 'utf8'), 'control-receipt-noncanonical'],
    ['pretty printed', Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8'), 'control-receipt-noncanonical'],
    ['CRLF', Buffer.from(`${JSON.stringify(receipt, null, 2).replaceAll('\n', '\r\n')}\r\n`, 'utf8'), 'control-receipt-noncanonical'],
    ['trailing whitespace', Buffer.concat([canonical, Buffer.from(' ', 'utf8')]), 'control-receipt-noncanonical'],
    ['UTF-8 BOM', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), canonical]), 'control-receipt-invalid'],
    ['duplicate JSON key', Buffer.from(`{"schemaVersion":"1.0.0",${canonical.toString('utf8').slice(1)}`, 'utf8'), 'control-receipt-invalid']
  ];
  for (const [name, bytes, reason] of noncanonicalCases) {
    await t.test(name, () => {
      const result = decideFreshControlConsumption(decisionFixture({ receiptBytes: bytes }));
      assert.equal(result.decision.outcome, 'reconcile');
      assert.ok(result.decision.reasonCodes.includes(reason));
      assert.equal(result.decision.inputs.consumedControlReceiptSha256, null);
      assert.equal(result.decision.context.selectedReceipt, null);
    });
  }

  const swapped = {
    receiptSha256: '0'.repeat(64),
    receiptBytes: Buffer.from(canonical)
  };
  const hashMismatch = decideFreshControlConsumption(decisionFixture({
    receiptBytes: canonical,
    selectedSha256: swapped.receiptSha256,
    candidates: [swapped]
  }));
  assert.equal(hashMismatch.decision.outcome, 'reconcile');
  assert.ok(hashMismatch.decision.reasonCodes.includes('control-receipt-sha-mismatch'));

  const oversizedBytes = Buffer.alloc(
    POLICY_RECORD.policy.controlDecision.maxControlReceiptBytes + 1,
    0x20
  );
  const oversized = decideFreshControlConsumption(decisionFixture({ receiptBytes: oversizedBytes }));
  assert.equal(oversized.decision.outcome, 'reconcile');
  assert.ok(oversized.decision.reasonCodes.includes('control-receipt-oversized'));
  assert.equal(oversized.decision.inputs.consumedControlReceiptSha256, null);
});

test('receipt relabeling reconciles and fixed policy relabeling throws before evidence use', () => {
  const relabeledReceipt = currentControlReceipt({
    mutate(receipt) {
      receipt.evidenceSource = 'github-api-live';
      receipt.promotionEligible = true;
    }
  });
  const relabeled = decideFreshControlConsumption(decisionFixture({
    receipt: relabeledReceipt,
    receiptBytes: canonicalControlBytes(relabeledReceipt)
  }));
  assert.equal(relabeled.decision.outcome, 'reconcile');
  assert.ok(relabeled.decision.reasonCodes.includes('control-receipt-invalid'));

  const readyPolicy = clone(CONTROL_POLICY_RECORD.policy);
  readyPolicy.status = 'ready';
  const readyBytes = Buffer.from(`${JSON.stringify(readyPolicy, null, 2)}\n`, 'utf8');
  const hostilePolicyRecord = {
    path: CONTROL_POLICY_RECORD.path,
    sha256: digest(readyBytes),
    bytes: readyBytes,
    policy: readyPolicy
  };
  const hostileInput = decisionFixture();
  hostileInput.controlPolicyRecord = hostilePolicyRecord;
  assert.throws(
    () => decideFreshControlConsumption(hostileInput),
    /reviewed B1 policy bytes/iu
  );
});

test('explicit evaluation time enforces canonical timestamps and inclusive freshness edges', () => {
  for (const evaluatedAt of [
    '2026-08-20T22:04:00Z',
    '2026-08-20T18:04:00.000-04:00',
    '2026-02-30T00:00:00.000Z',
    '2026-08-19T23:59:59.999Z',
    'not-a-time'
  ]) {
    const invalid = decideFreshControlConsumption(decisionFixture({ evaluatedAt }));
    assert.equal(invalid.decision.outcome, 'reconcile');
    assert.ok(invalid.decision.reasonCodes.includes('evaluated-at-invalid'));
    assert.equal(invalid.decision.evaluatedAt, null);
  }

  const atEarlyBoundary = decideFreshControlConsumption(decisionFixture({
    evaluatedAt: '2026-08-20T22:02:30.000Z'
  }));
  assert.equal(atEarlyBoundary.decision.outcome, 'block');
  assert.equal(atEarlyBoundary.decision.reasonCodes.includes('control-receipt-not-yet-valid'), false);

  const beforeEarlyBoundary = decideFreshControlConsumption(decisionFixture({
    evaluatedAt: '2026-08-20T22:02:29.999Z'
  }));
  assert.equal(beforeEarlyBoundary.decision.outcome, 'reconcile');
  assert.ok(beforeEarlyBoundary.decision.reasonCodes.includes('control-receipt-not-yet-valid'));

  const atExpiry = decideFreshControlConsumption(decisionFixture({
    evaluatedAt: '2026-08-20T22:08:00.000Z'
  }));
  assert.equal(atExpiry.decision.reasonCodes.includes('control-receipt-stale'), false);

  const afterExpiry = decideFreshControlConsumption(decisionFixture({
    evaluatedAt: '2026-08-20T22:08:00.001Z'
  }));
  assert.ok(afterExpiry.decision.reasonCodes.includes('control-receipt-stale'));
});

test('chain readiness blocks known incompleteness while chain ambiguity reconciles', () => {
  const complete = fullChain();
  const partial = { bytes: complete.bytes.slice(0, 2), bundle: complete.tag };
  const partialDecision = decideFreshControlConsumption(decisionFixture({ chain: partial }));
  assert.equal(partialDecision.decision.outcome, 'block');
  assert.ok(partialDecision.decision.reasonCodes.includes('lifecycle-chain-incomplete'));
  assert.ok(partialDecision.decision.reasonCodes.includes('lifecycle-state-not-ready'));

  for (const hostile of [
    { bytes: [complete.source.bytes, complete.bundle.bytes], bundle: complete.bundle },
    { bytes: [complete.tag.bytes, complete.source.bytes], bundle: complete.source },
    { bytes: [complete.source.bytes.subarray(0, complete.source.bytes.length - 1)], bundle: complete.source },
    { bytes: [...complete.bytes, complete.bundle.bytes], bundle: complete.bundle }
  ]) {
    const result = decideFreshControlConsumption(decisionFixture({ chain: hostile }));
    assert.equal(result.decision.outcome, 'reconcile');
    assert.ok(result.decision.reasonCodes.includes('lifecycle-chain-invalid'));
  }

  const wrongHead = decisionFixture();
  wrongHead.expectedHeadSha256 = 'f'.repeat(64);
  const wrongHeadResult = decideFreshControlConsumption(wrongHead);
  assert.equal(wrongHeadResult.decision.outcome, 'reconcile');
  assert.ok(wrongHeadResult.decision.reasonCodes.includes('lifecycle-chain-invalid'));
});

test('control identity conflicts and pre-chain observations cannot be consumed', () => {
  const alternateSubject = { ...clone(BASE_SUBJECT), sourceCommit: 'abcdef0123456789abcdef0123456789abcdef01' };
  const alternateChain = fullChain(alternateSubject);
  const originalReceipt = currentControlReceipt();
  const identityConflict = decideFreshControlConsumption(decisionFixture({
    chain: alternateChain,
    subject: alternateSubject,
    receipt: originalReceipt,
    receiptBytes: canonicalControlBytes(originalReceipt)
  }));
  assert.equal(identityConflict.decision.outcome, 'reconcile');
  assert.ok(identityConflict.decision.reasonCodes.includes('control-lifecycle-identity-conflict'));
  assert.ok(identityConflict.decision.reasonCodes.includes('control-receipt-invalid'));

  const preChainReceipt = currentControlReceipt({ observedAt: '2026-08-20T22:02:00.000Z' });
  const preChain = decideFreshControlConsumption(decisionFixture({
    receipt: preChainReceipt,
    receiptBytes: canonicalControlBytes(preChainReceipt),
    evaluatedAt: '2026-08-20T22:03:00.000Z'
  }));
  assert.equal(preChain.decision.outcome, 'block');
  assert.ok(preChain.decision.reasonCodes.includes('control-observed-before-lifecycle-head'));
});

test('decision evidence envelopes reject accessors and proxies without reading hostile values', () => {
  const topLevel = decisionFixture();
  let topReads = 0;
  const hostileTop = {};
  for (const [key, value] of Object.entries(topLevel)) {
    Object.defineProperty(hostileTop, key, key === 'controlObservation'
      ? {
          enumerable: true,
          get() {
            topReads += 1;
            return value;
          }
        }
      : { enumerable: true, value });
  }
  const rejectedTop = decideFreshControlConsumption(hostileTop);
  assert.equal(topReads, 0);
  assert.equal(rejectedTop.decision.outcome, 'reconcile');
  assert.deepEqual(rejectedTop.decision.reasonCodes, ['decision-input-invalid']);

  const base = decisionFixture();
  let observationReads = 0;
  const hostileObservation = {};
  Object.defineProperties(hostileObservation, {
    completeness: { enumerable: true, value: 'complete' },
    selectedSha256: { enumerable: true, value: base.expectedControlReceiptSha256 },
    candidates: {
      enumerable: true,
      get() {
        observationReads += 1;
        return base.controlObservation.candidates;
      }
    }
  });
  base.controlObservation = hostileObservation;
  const rejectedObservation = decideFreshControlConsumption(base);
  assert.equal(observationReads, 0);
  assert.equal(rejectedObservation.decision.outcome, 'reconcile');
  assert.ok(rejectedObservation.decision.reasonCodes.includes('control-observation-invalid'));

  const candidateInput = decisionFixture();
  let byteReads = 0;
  const validCandidate = candidateInput.controlObservation.candidates[0];
  const hostileCandidate = {};
  Object.defineProperties(hostileCandidate, {
    receiptSha256: { enumerable: true, value: validCandidate.receiptSha256 },
    receiptBytes: {
      enumerable: true,
      get() {
        byteReads += 1;
        return validCandidate.receiptBytes;
      }
    }
  });
  candidateInput.controlObservation = {
    completeness: 'complete',
    selectedSha256: candidateInput.expectedControlReceiptSha256,
    candidates: [hostileCandidate]
  };
  const rejectedCandidate = decideFreshControlConsumption(candidateInput);
  assert.equal(byteReads, 0);
  assert.equal(rejectedCandidate.decision.outcome, 'reconcile');
  assert.ok(rejectedCandidate.decision.reasonCodes.includes('control-observation-invalid'));

  let proxyTraps = 0;
  const proxyInput = decisionFixture();
  proxyInput.controlObservation = new Proxy(proxyInput.controlObservation, {
    ownKeys() {
      proxyTraps += 1;
      throw new Error('hostile ownKeys trap');
    }
  });
  const rejectedProxy = decideFreshControlConsumption(proxyInput);
  assert.equal(proxyTraps, 0);
  assert.equal(rejectedProxy.decision.outcome, 'reconcile');
  assert.ok(rejectedProxy.decision.reasonCodes.includes('control-observation-invalid'));
});

test('decision snapshots mutable buffers once and does not trust Buffer instance methods', () => {
  const receiptBytes = canonicalControlBytes(currentControlReceipt());
  const originalDigest = digest(receiptBytes);
  receiptBytes.equals = () => false;
  receiptBytes.compare = () => 1;
  const input = decisionFixture({
    receiptBytes,
    selectedSha256: originalDigest,
    expectedControlReceiptSha256: originalDigest,
    candidates: [{ receiptSha256: originalDigest, receiptBytes }]
  });
  const result = decideFreshControlConsumption(input);
  const decisionBytes = Buffer.from(result.bytes);
  assert.equal(result.decision.outcome, 'block');
  assert.equal(result.decision.inputs.consumedControlReceiptSha256, originalDigest);
  receiptBytes.fill(0x20);
  assert.ok(result.bytes.equals(decisionBytes));
  assert.equal(result.sha256, digest(decisionBytes));

  const afterMutation = decideFreshControlConsumption(input);
  assert.equal(afterMutation.decision.outcome, 'reconcile');
  assert.ok(afterMutation.decision.reasonCodes.includes('control-receipt-sha-mismatch'));
});

test('reconcile dominates known blockers and reason ordering is policy-stable', () => {
  const malformedBytes = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    canonicalControlBytes(currentControlReceipt())
  ]);
  const result = decideFreshControlConsumption(decisionFixture({ receiptBytes: malformedBytes }));
  assert.equal(result.decision.outcome, 'reconcile');
  assert.ok(result.decision.reasonCodes.includes('control-receipt-invalid'));
  assert.ok(result.decision.reasonCodes.includes('control-policy-planned'));
  const policyOrder = new Map(
    POLICY_RECORD.policy.controlDecision.reasonCodes.map((reason, index) => [reason, index])
  );
  const indexes = result.decision.reasonCodes.map(reason => policyOrder.get(reason));
  assert.deepEqual(indexes, [...indexes].sort((left, right) => left - right));
});

test('benign object and Buffer proxies are rejected before any proxy trap', () => {
  const forwardingInput = decisionFixture();
  forwardingInput.controlObservation = new Proxy(forwardingInput.controlObservation, {});
  const forwarding = decideFreshControlConsumption(forwardingInput);
  assert.equal(forwarding.decision.outcome, 'reconcile');
  assert.ok(forwarding.decision.reasonCodes.includes('control-observation-invalid'));

  const bytes = canonicalControlBytes(currentControlReceipt());
  const anchor = digest(bytes);
  let bufferTrapCount = 0;
  const proxyBytes = new Proxy(bytes, {
    getPrototypeOf(target) {
      bufferTrapCount += 1;
      return Object.getPrototypeOf(target);
    },
    getOwnPropertyDescriptor(target, property) {
      bufferTrapCount += 1;
      return Object.getOwnPropertyDescriptor(target, property);
    },
    get(target, property, receiver) {
      bufferTrapCount += 1;
      return receiver === proxyBytes ? target[property] : undefined;
    }
  });
  const proxyBufferInput = decisionFixture();
  proxyBufferInput.controlObservation = {
    completeness: 'complete',
    selectedSha256: anchor,
    candidates: [{ receiptSha256: anchor, receiptBytes: proxyBytes }]
  };
  proxyBufferInput.expectedControlReceiptSha256 = anchor;
  const proxyBuffer = decideFreshControlConsumption(proxyBufferInput);
  assert.equal(bufferTrapCount, 0);
  assert.equal(proxyBuffer.decision.outcome, 'reconcile');
  assert.ok(proxyBuffer.decision.reasonCodes.includes('control-observation-invalid'));
});

test('shadowed and derived Buffer structures reject without invoking length accessors', () => {
  const original = canonicalControlBytes(currentControlReceipt());
  const anchor = digest(original);
  let ownLengthReads = 0;
  const ownLength = Buffer.from(original);
  Object.defineProperty(ownLength, 'length', {
    configurable: true,
    get() {
      ownLengthReads += 1;
      return Number.MAX_SAFE_INTEGER;
    }
  });
  const ownInput = decisionFixture();
  ownInput.controlObservation = {
    completeness: 'complete',
    selectedSha256: anchor,
    candidates: [{ receiptSha256: anchor, receiptBytes: ownLength }]
  };
  ownInput.expectedControlReceiptSha256 = anchor;
  const ownResult = decideFreshControlConsumption(ownInput);
  assert.equal(ownLengthReads, 0);
  assert.equal(ownResult.decision.outcome, 'reconcile');
  assert.ok(ownResult.decision.reasonCodes.includes('control-observation-invalid'));

  let prototypeLengthReads = 0;
  const derived = Buffer.from(original);
  const derivedPrototype = Object.create(Buffer.prototype);
  Object.defineProperty(derivedPrototype, 'length', {
    configurable: true,
    get() {
      prototypeLengthReads += 1;
      return original.length;
    }
  });
  Object.setPrototypeOf(derived, derivedPrototype);
  const derivedInput = decisionFixture();
  derivedInput.controlObservation = {
    completeness: 'complete',
    selectedSha256: anchor,
    candidates: [{ receiptSha256: anchor, receiptBytes: derived }]
  };
  derivedInput.expectedControlReceiptSha256 = anchor;
  const derivedResult = decideFreshControlConsumption(derivedInput);
  assert.equal(prototypeLengthReads, 0);
  assert.equal(derivedResult.decision.outcome, 'reconcile');
  assert.ok(derivedResult.decision.reasonCodes.includes('control-observation-invalid'));
});

test('oversized lifecycle bytes and unbounded observation digests reconcile with bounded output', () => {
  const oversizedInput = decisionFixture();
  oversizedInput.receiptBytesList = [Buffer.alloc(POLICY_RECORD.policy.limits.maxReceiptBytes + 1, 0x20)];
  const oversized = decideFreshControlConsumption(oversizedInput);
  assert.equal(oversized.decision.outcome, 'reconcile');
  assert.ok(oversized.decision.reasonCodes.includes('lifecycle-chain-invalid'));
  assert.ok(oversized.byteLength < 10_000);

  const huge = 'a'.repeat(1_000_000);
  const selectedInput = decisionFixture();
  selectedInput.controlObservation.selectedSha256 = huge;
  const selected = decideFreshControlConsumption(selectedInput);
  assert.equal(selected.decision.outcome, 'reconcile');
  assert.ok(selected.decision.reasonCodes.includes('control-observation-invalid'));
  assert.equal(selected.decision.context.observation.selectedSha256, null);
  assert.ok(selected.byteLength < 10_000);

  const candidateInput = decisionFixture();
  candidateInput.controlObservation.candidates[0].receiptSha256 = huge;
  const candidate = decideFreshControlConsumption(candidateInput);
  assert.equal(candidate.decision.outcome, 'reconcile');
  assert.ok(candidate.decision.reasonCodes.includes('control-observation-invalid'));
  assert.equal(candidate.decision.context.observation.inventorySha256, null);
  assert.ok(candidate.byteLength < 10_000);
  assert.ok(selected.bytes.equals(candidate.bytes));
});

test('evaluation may equal the lifecycle head but cannot precede it', () => {
  const receipt = currentControlReceipt({ observedAt: '2026-08-20T22:02:30.000Z' });
  const bytes = canonicalControlBytes(receipt);
  const equality = decideFreshControlConsumption(decisionFixture({
    receipt,
    receiptBytes: bytes,
    evaluatedAt: '2026-08-20T22:02:00.000Z'
  }));
  assert.equal(equality.decision.reasonCodes.includes('lifecycle-head-after-evaluation'), false);
  assert.equal(equality.decision.reasonCodes.includes('control-receipt-not-yet-valid'), false);

  const before = decideFreshControlConsumption(decisionFixture({
    receipt,
    receiptBytes: bytes,
    evaluatedAt: '2026-08-20T22:01:59.999Z'
  }));
  assert.equal(before.decision.outcome, 'reconcile');
  assert.ok(before.decision.reasonCodes.includes('lifecycle-head-after-evaluation'));
});
