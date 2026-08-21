import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  resolveLifecycleReferenceClosure
} from '../scripts/promotion-preflight.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POLICY_PATH = path.join(ROOT, 'config', 'promotion-preflight-policy.v1.json');
const LIFECYCLE_POLICY_PATH = path.join(ROOT, 'config', 'promotion-lifecycle-policy.v1.json');
const CHAIN_DOMAIN = 'ai-research-tech-tree:promotion-lifecycle-chain:v1\0';
const RECEIPT_DOMAIN = 'ai-research-tech-tree:promotion-lifecycle-receipt:v1\0';
const REFERENCE_SET_DOMAIN = 'ai-research-tech-tree:preflight-reference-set:v1\0';
const FIXTURE_TIME = Object.freeze([
  '2026-08-20T12:00:00.000Z',
  '2026-08-20T12:01:00.000Z',
  '2026-08-20T12:02:00.000Z'
]);
const TAG_EPOCH = Date.parse('2026-08-20T12:00:00.000Z') / 1000;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitId(type, bytes) {
  return createHash('sha1').update(`${type} ${bytes.length}\0`).update(bytes).digest('hex');
}

function canonical(value, pretty = false) {
  return Buffer.from(`${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
}

function hashCanonical(domain, value) {
  return createHash('sha256').update(domain).update(JSON.stringify(value)).digest('hex');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function byteReference(role, bytes) {
  return { kind: 'fixture-byte-reference', role, sha256: sha256(bytes), byteLength: bytes.length };
}

function candidate(role, bytes) {
  return { role, sha256: sha256(bytes), byteLength: bytes.length, bytes: Buffer.from(bytes) };
}

function addCandidate(map, role, bytes) {
  const next = candidate(role, bytes);
  const prior = map.get(role);
  if (prior) {
    assert.equal(prior.sha256, next.sha256);
    return byteReference(role, bytes);
  }
  map.set(role, next);
  return byteReference(role, bytes);
}

function gitSortKey(name, directory) {
  return Buffer.from(`${name}${directory ? '/' : ''}`);
}

function buildGitTrees(files) {
  const root = { directories: new Map(), files: new Map() };
  for (const [filePath, bytes] of files) {
    const segments = filePath.split('/');
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      if (!node.directories.has(segment)) node.directories.set(segment, { directories: new Map(), files: new Map() });
      node = node.directories.get(segment);
    }
    node.files.set(segments.at(-1), bytes);
  }
  const byDirectory = new Map();
  function build(node, directory) {
    const entries = [];
    for (const [name, child] of node.directories) {
      const childDirectory = directory ? `${directory}/${name}` : name;
      const built = build(child, childDirectory);
      entries.push({ name, directory: true, objectId: built.objectId });
    }
    for (const [name, bytes] of node.files) entries.push({ name, directory: false, objectId: gitId('blob', bytes) });
    entries.sort((left, right) => Buffer.compare(gitSortKey(left.name, left.directory), gitSortKey(right.name, right.directory)));
    const chunks = [];
    for (const entry of entries) {
      chunks.push(Buffer.from(`${entry.directory ? '40000' : '100644'} ${entry.name}\0`));
      chunks.push(Buffer.from(entry.objectId, 'hex'));
    }
    const bytes = Buffer.concat(chunks);
    const objectId = gitId('tree', bytes);
    byDirectory.set(directory, { bytes, objectId });
    return { bytes, objectId };
  }
  return { root: build(root, ''), byDirectory };
}

function writeAscii(target, offset, length, value) {
  const bytes = Buffer.from(value, 'ascii');
  assert.ok(bytes.length <= length);
  bytes.copy(target, offset);
}

function writeOctal(target, offset, length, value) {
  writeAscii(target, offset, length, `${value.toString(8).padStart(length - 1, '0')}\0`);
}

function ustarHeader(name, size) {
  const header = Buffer.alloc(512);
  writeAscii(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  writeAscii(header, 257, 6, 'ustar\0');
  writeAscii(header, 263, 2, '00');
  let checksum = 0;
  for (const byte of header) checksum += byte;
  writeAscii(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `);
  return header;
}

function buildTar(assetStem, entries) {
  const chunks = [];
  for (const [name, bytes] of [...entries].sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))) {
    chunks.push(ustarHeader(`${assetStem}/${name}`, bytes.length), bytes);
    const remainder = bytes.length % 512;
    if (remainder) chunks.push(Buffer.alloc(512 - remainder));
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

function fixtureDocument({ role, sequence, policySha256, chainId, subject, payload }) {
  return canonical({
    schemaVersion: '1.0.0',
    kind: 'preflight-reference-document',
    role,
    sequence,
    scope: 'fixture-only',
    productionEligible: false,
    externalMutationAuthorized: false,
    authenticatedAuthority: false,
    policySha256,
    chainId,
    subject,
    timestamp: FIXTURE_TIME[sequence - 1],
    payload
  });
}

function authorityBoundary() {
  return {
    sourceMutationAuthorized: false,
    tagMutationAuthorized: false,
    releaseMutationAuthorized: false,
    deploymentMutationAuthorized: false,
    environmentMutationAuthorized: false,
    refMutationAuthorized: false
  };
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

function makeReceipt({ lifecyclePolicySha256, chainId, subject, transition, evidence, authority, parent }) {
  const receipt = {
    schemaVersion: '1.0.0',
    kind: 'promotion-lifecycle-receipt',
    scope: 'fixture-only',
    productionEligible: false,
    policySha256: lifecyclePolicySha256,
    chainId,
    sequence: transition.sequence,
    receiptId: '',
    eventType: transition.eventType,
    fromState: transition.fromState,
    toState: transition.toState,
    observedAt: FIXTURE_TIME[transition.sequence - 1],
    subject,
    parent,
    evidence,
    authority
  };
  receipt.receiptId = hashCanonical(RECEIPT_DOMAIN, receiptIdMaterial(receipt));
  const bytes = canonical(receipt);
  return { receipt, bytes, sha256: sha256(bytes) };
}

function parentOf(item) {
  return { receiptId: item.receipt.receiptId, sha256: item.sha256, byteLength: item.bytes.length };
}

function priorOf(item) {
  return { sha256: item.sha256, byteLength: item.bytes.length };
}

async function buildFixture(options = {}) {
  const mutateDocument = (role, bytes) => {
    const copy = Buffer.from(bytes);
    const replacement = options.mutateDocumentBytes?.(role, copy);
    return Buffer.isBuffer(replacement) ? replacement : copy;
  };
  const policyBytes = await readFile(POLICY_PATH);
  const lifecyclePolicyBytes = await readFile(LIFECYCLE_POLICY_PATH);
  const policy = JSON.parse(policyBytes);
  const lifecyclePolicy = JSON.parse(lifecyclePolicyBytes);
  const readySpec = {
    schemaVersion: '1.0.0',
    status: 'ready',
    tag: 'v0.1.1',
    version: '0.1.1',
    edition: '2026-08-20-public-beta-2',
    releaseDate: '2026-08-20',
    releaseState: 'Public beta',
    defaultBranch: 'main',
    protectedMainRef: 'refs/remotes/origin/main',
    productionEnvironment: 'github-pages',
    productionBaseUrl: 'https://neb6dav.github.io/ai_tech_tree/',
    prerelease: true,
    assetStem: 'ai-research-tech-tree-v0.1.1'
  };
  if (options.mutateReadySpec) options.mutateReadySpec(readySpec);
  const readySpecBytes = canonical(readySpec, true);
  const readyChangelogBytes = Buffer.from([
    '# Changelog',
    '',
    `## [${readySpec.version}] - ${readySpec.releaseDate}`,
    '',
    '- Fixture.',
    '',
    '## [0.1.0] - 2026-08-13',
    '',
    '- Prior fixture.',
    ''
  ].join('\n'));
  const committedFiles = new Map();
  for (const item of policy.requiredCommittedPaths) {
    let bytes = item.path === policy.subject.releaseSpecPath
      ? readySpecBytes
      : item.path === 'CHANGELOG.md'
        ? readyChangelogBytes
        : await readFile(path.join(ROOT, ...item.path.split('/')));
    if (options.fileOverrides?.has(item.path)) bytes = options.fileOverrides.get(item.path);
    committedFiles.set(item.path, Buffer.from(bytes));
  }
  if (options.extraWorkflow) committedFiles.set('.github/workflows/evil.yml', Buffer.from('name: Evil\n'));
  const trees = buildGitTrees(committedFiles);
  const rootTree = trees.byDirectory.get('');
  const commitBytes = Buffer.from([
    `tree ${rootTree.objectId}`,
    `author Fixture <fixture@example.invalid> ${TAG_EPOCH} +0000`,
    `committer Fixture <fixture@example.invalid> ${TAG_EPOCH} +0000`,
    '',
    'fixture source',
    ''
  ].join('\n'));
  const sourceCommit = gitId('commit', commitBytes);
  if (options.mutateCommitBytes) options.mutateCommitBytes(commitBytes);
  const subject = {
    repositoryId: 101,
    repositoryOwnerId: 202,
    repositoryOwner: policy.subject.repositoryOwner,
    repositoryName: policy.subject.repositoryName,
    repositoryFullName: policy.subject.repositoryFullName,
    gitObjectFormat: policy.subject.gitObjectFormat,
    releaseSpecPath: policy.subject.releaseSpecPath,
    releaseSpecSha256: sha256(readySpecBytes),
    version: policy.subject.version,
    tag: policy.subject.tag,
    sourceCommit
  };
  const lifecyclePolicySha256 = sha256(lifecyclePolicyBytes);
  const chainId = hashCanonical(CHAIN_DOMAIN, { policySha256: lifecyclePolicySha256, subject });
  const candidates = new Map();
  const commitRef = addCandidate(candidates, 'source-commit-object', commitBytes);
  const treeObjects = policy.requiredGitTrees.map(item => {
    const tree = trees.byDirectory.get(item.directory);
    assert.ok(tree, item.directory);
    const treeBytes = Buffer.from(tree.bytes);
    if (options.mutateTreeBytes) options.mutateTreeBytes(item.directory, treeBytes);
    return { directory: item.directory, objectId: tree.objectId, reference: addCandidate(candidates, item.role, treeBytes) };
  });
  const committedProof = policy.requiredCommittedPaths.map(item => {
    const committedBytes = committedFiles.get(item.path);
    const candidateBytes = options.candidateFileOverrides?.get(item.path) || committedBytes;
    return { path: item.path, blobObjectId: gitId('blob', committedBytes), reference: addCandidate(candidates, item.role, candidateBytes) };
  });
  const pagesProof = committedProof.find(item => item.path === policy.reviewedWorkflowBytes.path);
  const tagObjectBytes = Buffer.from([
    `object ${sourceCommit}`,
    'type commit',
    `tag ${subject.tag}`,
    `tagger Fixture <fixture@example.invalid> ${TAG_EPOCH} +0000`,
    '',
    'fixture annotated tag',
    ''
  ].join('\n'));
  if (options.mutateTagObject) options.mutateTagObject(tagObjectBytes);
  const tagObjectId = gitId('tag', tagObjectBytes);
  const tagObjectRef = addCandidate(candidates, 'annotated-tag-object', tagObjectBytes);
  const payloadBytes = Buffer.from('<!doctype html><title>fixture</title>\n');
  const pageRecord = { path: 'index.html', mediaType: 'text/html; charset=utf-8', bytes: payloadBytes.length, sha256: sha256(payloadBytes) };
  const pagesStageBytes = committedFiles.get('config/pages-stage.v1.json');
  const releaseManifest = {
    schemaVersion: '1.4.0',
    stageConfigVersion: '1.1.0',
    stageConfig: { path: 'config/pages-stage.v1.json', sha256: sha256(pagesStageBytes) },
    edition: readySpec.edition,
    version: readySpec.version,
    releaseState: readySpec.releaseState,
    commit: sourceCommit,
    publicationMode: 'release',
    releaseSpec: { path: subject.releaseSpecPath, sha256: subject.releaseSpecSha256, ...readySpec },
    tag: subject.tag,
    promotion: {
      releaseDate: readySpec.releaseDate,
      tag: subject.tag,
      mode: 'annotated-tag',
      tagObject: tagObjectId,
      tagCommit: sourceCommit,
      taggedAt: '2026-08-20T12:00:00+00:00',
      protectedMainRef: policy.subject.protectedMainRef,
      protectedMainCommit: sourceCommit,
      reachableFromProtectedMain: true
    },
    sourceState: {
      kind: 'git',
      clean: true,
      requiredClean: true,
      repositoryTopLevel: '.',
      repositoryRootMatchesTopLevel: true,
      gitObjectFormat: 'sha1',
      objectDatabaseVerified: true,
      repositoryFsckConfigurationIsolated: true,
      repositoryAttributesIsolated: true,
      trackedTreeEntryCount: committedFiles.size,
      trackedTreeFilterAttributeCount: 0,
      trackedTreeFiltersVerified: true,
      trackedTreeFilterAuditSha256: sha256(Buffer.from('filters')),
      head: sourceCommit,
      commitMatchesHead: true,
      changedEntryCount: 0,
      statusSha256: sha256(Buffer.from('status')),
      flaggedIndexEntryCount: 0,
      indexFlagsSha256: sha256(Buffer.from('flags')),
      inputCount: committedFiles.size,
      matchedInputCount: committedFiles.size,
      directorySourceCount: 0,
      matchedDirectorySourceCount: 0,
      inputsMatchCommit: true,
      inputVerificationSha256: sha256(Buffer.from('inputs'))
    },
    generatorVersion: '1.0.0-fixture',
    dataDigest: sha256(Buffer.from('data')),
    toolchain: { node: 'v24.14.1', npm: '11.11.0', packageLockVersion: 3, releaseRef: '1.0.0', stageSite: '1.4.0' },
    manifest: { path: 'release-manifest.json', selfHashExcluded: true, filesCoverage: 'all-payload-files', filesExcluded: ['release-manifest.json'] },
    fileCount: 1,
    totalBytes: payloadBytes.length,
    files: [pageRecord]
  };
  if (options.mutateManifest) options.mutateManifest(releaseManifest);
  const releaseManifestBytes = canonical(releaseManifest, true);
  let notesBytes = Buffer.from([
    `# ${readySpec.assetStem} stable release assets`, '',
    '> Locally verified artifact package. These files do not attest a GitHub Release, an environment approval, a deployment, or public post-deployment verification.', '',
    `- Version: \`${readySpec.version}\``, `- Edition: \`${readySpec.edition}\``,
    `- Release date: \`${readySpec.releaseDate}\``, `- Tag: \`${subject.tag}\``,
    `- Tag object: \`${tagObjectId}\``, '- Tagged at: `2026-08-20T12:00:00+00:00`',
    `- Commit: \`${sourceCommit}\``, `- Data digest: \`${releaseManifest.dataDigest}\``,
    `- Protected-main ref: \`${policy.subject.protectedMainRef}\``,
    `- Protected-main commit: \`${sourceCommit}\``, '- Prerelease: `true`',
    '- Publication mode: `release`', '', '## [0.1.1] - 2026-08-20', '', '- Fixture.', ''
  ].join('\n'));
  if (options.notesBytes) notesBytes = Buffer.from(options.notesBytes);
  if (options.mutateNotes) {
    const copy = Buffer.from(notesBytes);
    const replacement = options.mutateNotes(copy);
    notesBytes = Buffer.isBuffer(replacement) ? replacement : copy;
  }
  let tarBytes = buildTar(readySpec.assetStem, new Map([['index.html', payloadBytes], ['release-manifest.json', releaseManifestBytes]]));
  if (options.mutateTar) options.mutateTar(tarBytes);
  const distributable = new Map([
    [`${readySpec.assetStem}.notes.md`, notesBytes],
    [`${readySpec.assetStem}.release-manifest.json`, releaseManifestBytes],
    [`${readySpec.assetStem}.tar`, tarBytes]
  ]);
  const checksumBytes = Buffer.from([...distributable].sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right))).map(([name, bytes]) => `${sha256(bytes)}  ${name}\n`).join(''));
  const stableBytesByRole = new Map([
    ['stable-asset-checksums', checksumBytes],
    ['stable-asset-notes', notesBytes],
    ['stable-asset-release-manifest', releaseManifestBytes],
    ['stable-asset-tar', tarBytes]
  ]);
  const assetRecords = policy.stableAssetRoles.map(item => {
    const bytes = stableBytesByRole.get(item.role);
    const name = `${readySpec.assetStem}${item.suffix}`;
    return { name, sha256: sha256(bytes), byteLength: bytes.length, reference: addCandidate(candidates, item.role, bytes) };
  });
  const bundleManifestBytes = mutateDocument('stable-bundle-manifest', fixtureDocument({
    role: 'stable-bundle-manifest', sequence: 3, policySha256: sha256(policyBytes), chainId, subject,
    payload: { assetStem: readySpec.assetStem, sourceCommit, releaseSpecPath: subject.releaseSpecPath, releaseSpecSha256: subject.releaseSpecSha256, tagObjectId, assets: assetRecords }
  }));
  const bundleManifestRef = addCandidate(candidates, 'stable-bundle-manifest', bundleManifestBytes);
  const transitions = lifecyclePolicy.transitions;
  const authority1Bytes = mutateDocument(transitions[0].authorityRole, fixtureDocument({
    role: transitions[0].authorityRole, sequence: 1, policySha256: sha256(policyBytes), chainId, subject,
    payload: { priorReceipt: null, authorityBoundary: authorityBoundary() }
  }));
  const authority1 = addCandidate(candidates, transitions[0].authorityRole, authority1Bytes);
  const sourceEvidenceBytes = mutateDocument(transitions[0].evidenceRole, fixtureDocument({
    role: transitions[0].evidenceRole, sequence: 1, policySha256: sha256(policyBytes), chainId, subject,
    payload: {
      priorReceipt: null,
      authority: authority1,
      proof: {
        gitObjectFormat: 'sha1', sourceCommit, sourceTree: rootTree.objectId, commitObject: commitRef,
        treeObjects, committedFiles: committedProof,
        reviewedWorkflowBytes: { path: policy.reviewedWorkflowBytes.path, reference: pagesProof.reference },
        releaseSpec: { path: subject.releaseSpecPath, sha256: subject.releaseSpecSha256, status: readySpec.status, releaseDate: readySpec.releaseDate }
      }
    }
  }));
  const sourceEvidence = addCandidate(candidates, transitions[0].evidenceRole, sourceEvidenceBytes);
  const receipt1 = makeReceipt({ lifecyclePolicySha256, chainId, subject, transition: transitions[0], evidence: sourceEvidence, authority: authority1, parent: null });
  const authority2Bytes = mutateDocument(transitions[1].authorityRole, fixtureDocument({
    role: transitions[1].authorityRole, sequence: 2, policySha256: sha256(policyBytes), chainId, subject,
    payload: { priorReceipt: priorOf(receipt1), authorityBoundary: authorityBoundary() }
  }));
  const authority2 = addCandidate(candidates, transitions[1].authorityRole, authority2Bytes);
  const tagEvidenceBytes = mutateDocument(transitions[1].evidenceRole, fixtureDocument({
    role: transitions[1].evidenceRole, sequence: 2, policySha256: sha256(policyBytes), chainId, subject,
    payload: {
      priorReceipt: priorOf(receipt1), authority: authority2,
      proof: {
        tagObjectId, tagObject: tagObjectRef, directTargetCommit: sourceCommit,
        taggerEpochSeconds: TAG_EPOCH, taggerOffset: '+0000', taggerCalendarDate: readySpec.releaseDate,
        protectedMain: { ref: policy.subject.protectedMainRef, commit: sourceCommit, directTargetContained: true, observationMode: 'fixture-observed-not-authenticated' }
      }
    }
  }));
  const tagEvidence = addCandidate(candidates, transitions[1].evidenceRole, tagEvidenceBytes);
  const receipt2 = makeReceipt({ lifecyclePolicySha256, chainId, subject, transition: transitions[1], evidence: tagEvidence, authority: authority2, parent: parentOf(receipt1) });
  const authority3Bytes = mutateDocument(transitions[2].authorityRole, fixtureDocument({
    role: transitions[2].authorityRole, sequence: 3, policySha256: sha256(policyBytes), chainId, subject,
    payload: { priorReceipt: priorOf(receipt2), authorityBoundary: authorityBoundary() }
  }));
  const authority3 = addCandidate(candidates, transitions[2].authorityRole, authority3Bytes);
  const stableToolProof = committedProof.find(item => item.path === 'scripts/verify-stable-bundle.mjs');
  const stableEvidenceBytes = mutateDocument(transitions[2].evidenceRole, fixtureDocument({
    role: transitions[2].evidenceRole, sequence: 3, policySha256: sha256(policyBytes), chainId, subject,
    payload: {
      priorReceipt: priorOf(receipt2), authority: authority3,
      proof: { verificationTool: { path: 'scripts/verify-stable-bundle.mjs', version: '1.0.0', reference: stableToolProof.reference }, bundleManifest: bundleManifestRef }
    }
  }));
  const stableEvidence = addCandidate(candidates, transitions[2].evidenceRole, stableEvidenceBytes);
  const receipt3 = makeReceipt({ lifecyclePolicySha256, chainId, subject, transition: transitions[2], evidence: stableEvidence, authority: authority3, parent: parentOf(receipt2) });
  const rootByRole = new Map([
    [sourceEvidence.role, sourceEvidence], [authority1.role, authority1], [tagEvidence.role, tagEvidence],
    [authority2.role, authority2], [stableEvidence.role, stableEvidence], [authority3.role, authority3]
  ]);
  const referenceInventory = policy.lifecycleReferenceRoles.map(role => {
    const ref = rootByRole.get(role);
    return { role, sha256: ref.sha256, byteLength: ref.byteLength };
  });
  const input = {
    policyRecord: { path: 'config/promotion-preflight-policy.v1.json', bytes: Buffer.from(policyBytes), sha256: sha256(policyBytes), policy: cloneJson(policy) },
    lifecyclePolicyRecord: { path: 'config/promotion-lifecycle-policy.v1.json', bytes: Buffer.from(lifecyclePolicyBytes), sha256: lifecyclePolicySha256, policy: cloneJson(lifecyclePolicy) },
    receiptBytesList: [receipt1.bytes, receipt2.bytes, receipt3.bytes],
    expectedHeadSha256: receipt3.sha256,
    expectedSubject: cloneJson(subject),
    referenceObservation: { completeness: 'complete', candidates: [...candidates.values()] },
    expectedReferenceSetSha256: hashCanonical(REFERENCE_SET_DOMAIN, referenceInventory)
  };
  return { input, policy, candidates, receipt1, receipt2, receipt3 };
}

test('resolves one exact fixture-only reference closure deterministically', async () => {
  const fixture = await buildFixture();
  assert.equal(fixture.input.referenceObservation.candidates.length, 36);
  const first = resolveLifecycleReferenceClosure(fixture.input);
  const second = resolveLifecycleReferenceClosure(fixture.input);
  assert.equal(first.decision, 'resolved-fixture-reference-closure');
  assert.equal(first.receipt.productionEligible, false);
  assert.equal(first.receipt.externalMutationAuthorized, false);
  assert.equal(first.receipt.authenticatedAuthority, false);
  assert.equal(first.receipt.nextAction, 'continue-to-b2.3-b-read-only-preflight');
  assert.equal(first.receipt.resolvedReferenceCount, 36);
  assert.match(first.receipt.resolvedInventorySha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(first.receipt.limitations, [
    'fixture-only-no-live-ref-or-protected-main-authentication',
    'workflow-byte-locks-do-not-attest-external-action-implementations',
    'authority-documents-are-unauthenticated-fixture-declarations',
    'fixture-does-not-attest-verifier-execution',
    'fixture-does-not-prove-staged-payload-derivation-from-source-commit'
  ]);
  assert.doesNotMatch(first.bytes.toString('utf8'), /\b(?:proceed|promotion|rollback)\b/iu);
  assert.doesNotMatch(first.bytes.toString('utf8'), /"[^"\n]*Authorized":true/iu);
  assert.deepEqual(second, first);
  assert.equal(sha256(first.bytes), first.sha256);
  assert.equal(first.bytes.length, first.byteLength);
});

function copyInput(input) {
  return {
    policyRecord: {
      path: input.policyRecord.path,
      bytes: Buffer.from(input.policyRecord.bytes),
      sha256: input.policyRecord.sha256,
      policy: cloneJson(input.policyRecord.policy)
    },
    lifecyclePolicyRecord: {
      path: input.lifecyclePolicyRecord.path,
      bytes: Buffer.from(input.lifecyclePolicyRecord.bytes),
      sha256: input.lifecyclePolicyRecord.sha256,
      policy: cloneJson(input.lifecyclePolicyRecord.policy)
    },
    receiptBytesList: input.receiptBytesList.map(bytes => Buffer.from(bytes)),
    expectedHeadSha256: input.expectedHeadSha256,
    expectedSubject: cloneJson(input.expectedSubject),
    referenceObservation: {
      completeness: input.referenceObservation.completeness,
      candidates: input.referenceObservation.candidates.map(item => ({
        role: item.role,
        sha256: item.sha256,
        byteLength: item.byteLength,
        bytes: Buffer.from(item.bytes)
      }))
    },
    expectedReferenceSetSha256: input.expectedReferenceSetSha256
  };
}

function assertReconcile(input) {
  const first = resolveLifecycleReferenceClosure(input);
  const second = resolveLifecycleReferenceClosure(input);
  assert.equal(first.decision, 'reconcile');
  assert.equal(first.receipt.productionEligible, false);
  assert.equal(first.receipt.externalMutationAuthorized, false);
  assert.equal(first.receipt.authenticatedAuthority, false);
  assert.deepEqual(second, first);
  assert.deepEqual(first.receipt.reasonCodes, ['reference-evidence-invalid']);
  return first;
}

function replaceFirst(bytes, search, replacement) {
  const text = bytes.toString('utf8');
  const index = text.indexOf(search);
  assert.ok(index >= 0, search);
  return Buffer.from(`${text.slice(0, index)}${replacement}${text.slice(index + search.length)}`);
}

function tarEntrySpan(bytes, offset) {
  const sizeText = bytes.subarray(offset + 124, offset + 135).toString('ascii');
  const size = Number.parseInt(sizeText, 8);
  return 512 + Math.ceil(size / 512) * 512;
}

test('fixed preflight and lifecycle trust-anchor drift throws', async t => {
  const fixture = await buildFixture();
  await t.test('preflight policy bytes', () => {
    const hostile = copyInput(fixture.input);
    hostile.policyRecord.bytes[0] ^= 1;
    hostile.policyRecord.sha256 = sha256(hostile.policyRecord.bytes);
    assert.throws(() => resolveLifecycleReferenceClosure(hostile), /trust anchor/iu);
  });
  await t.test('lifecycle policy bytes', () => {
    const hostile = copyInput(fixture.input);
    hostile.lifecyclePolicyRecord.bytes[0] ^= 1;
    hostile.lifecyclePolicyRecord.sha256 = sha256(hostile.lifecyclePolicyRecord.bytes);
    assert.throws(() => resolveLifecycleReferenceClosure(hostile), /trust anchor/iu);
  });
  await t.test('policy accessor', () => {
    const hostile = copyInput(fixture.input);
    let invoked = 0;
    Object.defineProperty(hostile.policyRecord, 'policy', { enumerable: true, get() { invoked += 1; return {}; } });
    assert.throws(() => resolveLifecycleReferenceClosure(hostile), /data property/iu);
    assert.equal(invoked, 0);
  });
  for (const recordName of ['policyRecord', 'lifecyclePolicyRecord']) {
    await t.test(`${recordName} __proto__ own key`, () => {
      const hostile = copyInput(fixture.input);
      Object.defineProperty(hostile[recordName].policy, '__proto__', {
        value: null,
        enumerable: true,
        writable: true,
        configurable: true
      });
      assert.throws(() => resolveLifecycleReferenceClosure(hostile), /reviewed value|record\.policy/iu);
    });
  }
});

test('current planned release specification cannot substantiate source-finalized', async () => {
  const fixture = await buildFixture({ mutateReadySpec(spec) { spec.status = 'planned'; spec.releaseDate = null; } });
  assertReconcile(fixture.input);
});

test('observation inventory rejects incomplete, missing, extra, duplicate, case, anchor, and cap defects', async t => {
  const fixture = await buildFixture();
  await t.test('incomplete', () => {
    const hostile = copyInput(fixture.input);
    hostile.referenceObservation.completeness = 'unknown';
    assertReconcile(hostile);
  });
  await t.test('observation __proto__ own key', () => {
    const hostile = copyInput(fixture.input);
    Object.defineProperty(hostile.referenceObservation, '__proto__', {
      value: null,
      enumerable: true,
      writable: true,
      configurable: true
    });
    assertReconcile(hostile);
  });
  await t.test('candidate __proto__ own key', () => {
    const hostile = copyInput(fixture.input);
    Object.defineProperty(hostile.referenceObservation.candidates[0], '__proto__', {
      value: null,
      enumerable: true,
      writable: true,
      configurable: true
    });
    assertReconcile(hostile);
  });
  await t.test('missing', () => {
    const hostile = copyInput(fixture.input);
    hostile.referenceObservation.candidates.pop();
    assertReconcile(hostile);
  });
  await t.test('extra unsupported', () => {
    const hostile = copyInput(fixture.input);
    hostile.referenceObservation.candidates.push(candidate('unexpected-role', Buffer.from('x')));
    assertReconcile(hostile);
  });
  await t.test('duplicate role', () => {
    const hostile = copyInput(fixture.input);
    hostile.referenceObservation.candidates.push({ ...hostile.referenceObservation.candidates[0], bytes: Buffer.from(hostile.referenceObservation.candidates[0].bytes) });
    assertReconcile(hostile);
  });
  await t.test('case-swapped role', () => {
    const hostile = copyInput(fixture.input);
    hostile.referenceObservation.candidates[0].role = hostile.referenceObservation.candidates[0].role.toUpperCase();
    assertReconcile(hostile);
  });
  await t.test('independent reference-set anchor', () => {
    const hostile = copyInput(fixture.input);
    hostile.expectedReferenceSetSha256 = 'a'.repeat(64);
    assertReconcile(hostile);
  });
  await t.test('candidate digest anchor', () => {
    const hostile = copyInput(fixture.input);
    hostile.referenceObservation.candidates[0].sha256 = 'b'.repeat(64);
    assertReconcile(hostile);
  });
  await t.test('max plus one candidates', () => {
    const hostile = copyInput(fixture.input);
    while (hostile.referenceObservation.candidates.length <= fixture.policy.limits.maxReferenceCandidates) {
      hostile.referenceObservation.candidates.push({ ...hostile.referenceObservation.candidates[0], bytes: Buffer.from(hostile.referenceObservation.candidates[0].bytes) });
    }
    assert.equal(hostile.referenceObservation.candidates.length, 41);
    assertReconcile(hostile);
  });
});

test('nested closure rejects unresolved, cross-role cycle, digest reuse, and role-specific oversize', async t => {
  const fixture = await buildFixture();
  await t.test('unresolved nested tree', () => {
    const hostile = copyInput(fixture.input);
    hostile.referenceObservation.candidates = hostile.referenceObservation.candidates.filter(item => item.role !== 'source-tree-scripts');
    assertReconcile(hostile);
  });
  await t.test('cross-role cycle attempt', async () => {
    const hostileFixture = await buildFixture({
      mutateDocumentBytes(role, bytes) {
        if (role !== 'source-finalization-record') return bytes;
        const document = JSON.parse(bytes);
        document.payload.authority.role = 'source-finalization-record';
        return canonical(document);
      }
    });
    assertReconcile(hostileFixture.input);
  });
  await t.test('same digest across roles', () => {
    const hostile = copyInput(fixture.input);
    const first = hostile.referenceObservation.candidates[0];
    const second = hostile.referenceObservation.candidates[1];
    second.bytes = Buffer.from(first.bytes);
    second.sha256 = first.sha256;
    second.byteLength = first.byteLength;
    assertReconcile(hostile);
  });
  await t.test('oversized JSON role before copy', () => {
    const hostile = copyInput(fixture.input);
    const item = hostile.referenceObservation.candidates.find(value => value.role === 'source-finalization-authorization');
    item.bytes = Buffer.alloc(fixture.policy.limits.maxReferenceJsonBytes + 1, 0x20);
    item.byteLength = item.bytes.length;
    item.sha256 = sha256(item.bytes);
    assertReconcile(hostile);
  });
});

test('canonical fixture JSON rejects BOM, CRLF, trailing data, duplicate keys, and true authority', async t => {
  const cases = [
    ['BOM', bytes => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes])],
    ['CRLF', bytes => Buffer.from(bytes.toString('utf8').replaceAll('\n', '\r\n'))],
    ['trailing data', bytes => Buffer.concat([bytes, Buffer.from(' ')] )],
    ['duplicate key', bytes => replaceFirst(bytes, '{"schemaVersion":', '{"schemaVersion":"9.9.9","schemaVersion":')],
    ['authority true', bytes => {
      const value = JSON.parse(bytes);
      value.payload.authorityBoundary.tagMutationAuthorized = true;
      return canonical(value);
    }]
  ];
  for (const [label, mutate] of cases) {
    await t.test(label, async () => {
      const fixture = await buildFixture({
        mutateDocumentBytes(role, bytes) {
          return role === 'source-finalization-authorization' ? mutate(bytes) : bytes;
        }
      });
      assertReconcile(fixture.input);
    });
  }
  await t.test('evidence proof __proto__ own key', async () => {
    const fixture = await buildFixture({
      mutateDocumentBytes(role, bytes) {
        if (role !== 'source-finalization-record') return bytes;
        const document = JSON.parse(bytes);
        Object.defineProperty(document.payload.proof, '__proto__', {
          value: null,
          enumerable: true,
          writable: true,
          configurable: true
        });
        return canonical(document);
      }
    });
    assertReconcile(fixture.input);
  });
});

test('Git object proof rejects commit, tree, blob, workflow inventory, and byte-lock drift', async t => {
  await t.test('commit bytes after object ID', async () => {
    const fixture = await buildFixture({ mutateCommitBytes(bytes) { bytes[bytes.length - 2] ^= 1; } });
    assertReconcile(fixture.input);
  });
  await t.test('tree bytes after object ID', async () => {
    const fixture = await buildFixture({ mutateTreeBytes(directory, bytes) { if (directory === 'scripts') bytes[bytes.length - 1] ^= 1; } });
    assertReconcile(fixture.input);
  });
  await t.test('blob bytes after tree proof', async () => {
    const fixture = await buildFixture({ candidateFileOverrides: new Map([['scripts/release-ref.mjs', Buffer.from('// swapped\n')]]) });
    assertReconcile(fixture.input);
  });
  await t.test('pages workflow bytes after tree proof', async () => {
    const fixture = await buildFixture({ candidateFileOverrides: new Map([['.github/workflows/pages.yml', Buffer.from('name: swapped\n')]]) });
    assertReconcile(fixture.input);
  });
  await t.test('validate workflow byte lock', async () => {
    const fixture = await buildFixture({ fileOverrides: new Map([['.github/workflows/validate.yml', Buffer.from('name: coherent but unreviewed\n')]]) });
    assertReconcile(fixture.input);
  });
  await t.test('extra workflow in proven tree', async () => {
    const fixture = await buildFixture({ extraWorkflow: true });
    assertReconcile(fixture.input);
  });
  await t.test('unsupported tree mode', async () => {
    const fixture = await buildFixture({ mutateTreeBytes(directory, bytes) { if (directory === '.github/workflows') bytes.write('120000', 0, 'ascii'); } });
    assertReconcile(fixture.input);
  });
});

test('raw annotated-tag proof rejects tag-of-tag, wrong direct target, and date drift', async t => {
  await t.test('tag-of-tag', async () => {
    const fixture = await buildFixture({ mutateTagObject(bytes) {
      const replaced = replaceFirst(bytes, 'type commit', 'type tag   ');
      replaced.copy(bytes);
    } });
    assertReconcile(fixture.input);
  });
  await t.test('wrong direct target', async () => {
    const fixture = await buildFixture({ mutateTagObject(bytes) {
      const replaced = replaceFirst(bytes, /^object [0-9a-f]{40}/u.exec(bytes.toString())[0], `object ${'a'.repeat(40)}`);
      replaced.copy(bytes);
    } });
    assertReconcile(fixture.input);
  });
  await t.test('tagger calendar date', async () => {
    const fixture = await buildFixture({ mutateReadySpec(spec) { spec.releaseDate = '2026-08-21'; } });
    assertReconcile(fixture.input);
  });
});

test('stable bundle closes exact manifest, notes, timestamp, checksums, tar order, padding, and portable paths', async t => {
  await t.test('manifest ready-spec field drift', async () => {
    const fixture = await buildFixture({ mutateManifest(manifest) { manifest.releaseSpec.defaultBranch = 'develop'; } });
    assertReconcile(fixture.input);
  });
  await t.test('manifest generator control', async () => {
    const fixture = await buildFixture({ mutateManifest(manifest) { manifest.generatorVersion = ' bad '; } });
    assertReconcile(fixture.input);
  });
  await t.test('noncanonical taggedAt', async () => {
    const fixture = await buildFixture({ mutateManifest(manifest) { manifest.promotion.taggedAt = '2026-08-20T12:00:00Z'; } });
    assertReconcile(fixture.input);
  });
  await t.test('arbitrary notes', async () => {
    const fixture = await buildFixture({ notesBytes: Buffer.from('# arbitrary\n') });
    assertReconcile(fixture.input);
  });
  await t.test('benign text appended to exact generated notes', async () => {
    const fixture = await buildFixture({ mutateNotes(bytes) {
      return Buffer.concat([bytes, Buffer.from('Additional fixture text.\n')]);
    } });
    assertReconcile(fixture.input);
  });
  await t.test('contradictory authority claim appended to notes', async () => {
    const fixture = await buildFixture({ mutateNotes(bytes) {
      return Buffer.concat([bytes, Buffer.from('Deployment is authorized and live.\n')]);
    } });
    assertReconcile(fixture.input);
  });
  await t.test('nonzero tar padding with self-consistent outer hashes', async () => {
    const fixture = await buildFixture({ mutateTar(bytes) {
      const size = Number.parseInt(bytes.subarray(124, 135).toString('ascii'), 8);
      bytes[512 + size] = 1;
    } });
    assertReconcile(fixture.input);
  });
  await t.test('noncanonical tar entry order', async () => {
    const fixture = await buildFixture({ mutateTar(bytes) {
      const firstSpan = tarEntrySpan(bytes, 0);
      const secondSpan = tarEntrySpan(bytes, firstSpan);
      const first = Buffer.from(bytes.subarray(0, firstSpan));
      const second = Buffer.from(bytes.subarray(firstSpan, firstSpan + secondSpan));
      second.copy(bytes, 0);
      first.copy(bytes, secondSpan);
    } });
    assertReconcile(fixture.input);
  });
  await t.test('manifest drive-prefixed path', async () => {
    const fixture = await buildFixture({ mutateManifest(manifest) { manifest.files[0].path = 'C:/x'; } });
    assertReconcile(fixture.input);
  });
});

test('exotic, accessor, proxy, shared, overlapping, and poisoned Buffer evidence is rejected trap-free', async t => {
  const fixture = await buildFixture();
  await t.test('candidate accessor', () => {
    const hostile = copyInput(fixture.input);
    let invoked = 0;
    Object.defineProperty(hostile.referenceObservation.candidates[0], 'bytes', { enumerable: true, get() { invoked += 1; return Buffer.alloc(1); } });
    assertReconcile(hostile);
    assert.equal(invoked, 0);
  });
  await t.test('candidate Proxy', () => {
    const hostile = copyInput(fixture.input);
    let invoked = 0;
    hostile.referenceObservation.candidates[0] = new Proxy(hostile.referenceObservation.candidates[0], { ownKeys() { invoked += 1; return []; } });
    assertReconcile(hostile);
    assert.equal(invoked, 0);
  });
  await t.test('Buffer subclass prototype', () => {
    const hostile = copyInput(fixture.input);
    Object.setPrototypeOf(hostile.referenceObservation.candidates[0].bytes, Object.create(Buffer.prototype));
    assertReconcile(hostile);
  });
  await t.test('SharedArrayBuffer backing', () => {
    const hostile = copyInput(fixture.input);
    const shared = Buffer.from(new SharedArrayBuffer(hostile.referenceObservation.candidates[0].byteLength));
    hostile.referenceObservation.candidates[0].bytes.copy(shared);
    hostile.referenceObservation.candidates[0].bytes = shared;
    assertReconcile(hostile);
  });
  await t.test('overlapping Buffer aliases', () => {
    const hostile = copyInput(fixture.input);
    const left = hostile.referenceObservation.candidates[0];
    const right = hostile.referenceObservation.candidates[1];
    const backing = Buffer.alloc(left.byteLength + right.byteLength);
    left.bytes.copy(backing, 0);
    right.bytes.copy(backing, Math.max(0, left.byteLength - 1));
    left.bytes = backing.subarray(0, left.byteLength);
    right.bytes = backing.subarray(Math.max(0, left.byteLength - 1), Math.max(0, left.byteLength - 1) + right.byteLength);
    assertReconcile(hostile);
  });
  await t.test('Buffer prototype poison never executes', () => {
    let invoked = 0;
    const original = Object.getOwnPropertyDescriptor(Buffer.prototype, 'toString');
    Object.defineProperty(Buffer.prototype, 'toString', { configurable: true, get() { invoked += 1; return original.value; } });
    try {
      assert.throws(() => resolveLifecycleReferenceClosure(copyInput(fixture.input)), /intrinsics/iu);
      assert.equal(invoked, 0);
    } finally {
      Object.defineProperty(Buffer.prototype, 'toString', original);
    }
  });
  await t.test('Buffer iterator poison never executes', () => {
    let invoked = 0;
    const original = Buffer.prototype[Symbol.iterator];
    Buffer.prototype[Symbol.iterator] = function iteratorPoison() {
      invoked += 1;
      return original.call(this);
    };
    try {
      assert.throws(() => resolveLifecycleReferenceClosure(copyInput(fixture.input)), /intrinsics/iu);
      assert.equal(invoked, 0);
    } finally {
      Buffer.prototype[Symbol.iterator] = original;
    }
  });
  for (const property of ['from', 'isBuffer', 'byteLength']) {
    await t.test(`Buffer.${property} accessor poison never executes`, () => {
      const input = copyInput(fixture.input);
      const bufferConstructor = Buffer;
      const original = Object.getOwnPropertyDescriptor(bufferConstructor, property);
      let invoked = 0;
      Object.defineProperty(bufferConstructor, property, {
        configurable: true,
        enumerable: original.enumerable,
        get() { invoked += 1; return original.value; }
      });
      try {
        assert.throws(() => resolveLifecycleReferenceClosure(input), /intrinsics/iu);
        assert.equal(invoked, 0);
      } finally {
        Object.defineProperty(bufferConstructor, property, original);
      }
    });
  }
  await t.test('global Buffer accessor poison never executes', () => {
    const input = copyInput(fixture.input);
    const original = Object.getOwnPropertyDescriptor(globalThis, 'Buffer');
    let invoked = 0;
    Object.defineProperty(globalThis, 'Buffer', {
      configurable: true,
      enumerable: original.enumerable,
      get() { invoked += 1; return original.get.call(globalThis); },
      set: original.set
    });
    try {
      assert.throws(() => resolveLifecycleReferenceClosure(input), /intrinsic/iu);
      assert.equal(invoked, 0);
    } finally {
      Object.defineProperty(globalThis, 'Buffer', original);
    }
  });
  await t.test('JSON.stringify accessor poison never executes', () => {
    const input = copyInput(fixture.input);
    const jsonObject = JSON;
    const original = Object.getOwnPropertyDescriptor(jsonObject, 'stringify');
    let invoked = 0;
    Object.defineProperty(jsonObject, 'stringify', {
      configurable: true,
      enumerable: original.enumerable,
      get() { invoked += 1; return original.value; }
    });
    try {
      assert.throws(() => resolveLifecycleReferenceClosure(input), /intrinsics/iu);
      assert.equal(invoked, 0);
    } finally {
      Object.defineProperty(jsonObject, 'stringify', original);
    }
  });
  await t.test('Object reflection accessor poison never executes', () => {
    const input = copyInput(fixture.input);
    const objectConstructor = Object;
    const original = Object.getOwnPropertyDescriptor(objectConstructor, 'getOwnPropertyDescriptors');
    let invoked = 0;
    Object.defineProperty(objectConstructor, 'getOwnPropertyDescriptors', {
      configurable: true,
      enumerable: original.enumerable,
      get() { invoked += 1; return original.value; }
    });
    try {
      assert.throws(() => resolveLifecycleReferenceClosure(input), /intrinsics/iu);
      assert.equal(invoked, 0);
    } finally {
      Object.defineProperty(objectConstructor, 'getOwnPropertyDescriptors', original);
    }
  });
  await t.test('crypto Hash.update accessor poison never executes', () => {
    const input = copyInput(fixture.input);
    const hashPrototype = Object.getPrototypeOf(createHash('sha256'));
    const original = Object.getOwnPropertyDescriptor(hashPrototype, 'update');
    let invoked = 0;
    Object.defineProperty(hashPrototype, 'update', {
      configurable: true,
      enumerable: original.enumerable,
      get() { invoked += 1; return original.value; }
    });
    try {
      assert.throws(() => resolveLifecycleReferenceClosure(input), /intrinsics/iu);
      assert.equal(invoked, 0);
    } finally {
      Object.defineProperty(hashPrototype, 'update', original);
    }
  });
});

test('source contains no operational capability or CLI surface', async () => {
  const source = await readFile(path.join(ROOT, 'scripts', 'promotion-preflight.mjs'), 'utf8');
  const imports = [...source.matchAll(/^import .* from '([^']+)'/gmu)].map(match => match[1]);
  assert.deepEqual(imports, ['node:crypto', 'node:util', './strict-json.mjs']);
  assert.doesNotMatch(source, /node:(?:fs|path|child_process|http|https|net|tls|dns|dgram|process)\b/u);
  assert.doesNotMatch(source, /\b(?:fetch|WebSocket|XMLHttpRequest|execFile|spawn|writeFile|readFile|process\.env|process\.argv)\b/u);
  assert.equal(source.includes('import' + '('), false);
});
