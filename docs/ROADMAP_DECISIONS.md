# Roadmap decisions

These decisions are locked for their specified roadmap horizons unless a later,
explicit decision record supersedes them. They are constraints on implementation
and release planning, not claims that deferred work is complete.

## RD-001 — Repair publication first

Ship the broken publication-contract repair as `v0.1.1` before broader UI or
content work. The repair remains a narrow release and must not absorb unrelated
feature or corpus changes.

## RD-002 — Keep relationship dimensions orthogonal

Model relationship semantic type, evidence grade, review state,
lifecycle/origin, and direction/display scope as independent dimensions. Do not
persist a synthetic layer that collapses those dimensions into one field.

## RD-003 — Use the 15-lane-sharded hybrid

Canonical historical-atlas data will use the approved 15-lane-sharded hybrid,
not one file per record. Nodes are sharded by their lane; relationships are
sharded by target-node lane; compact registries and independently reviewed rich
records use their approved coarser or finer granularity.

## RD-004 — Shadow, prove parity, then flip atomically

Migrate canonical historical data through shadow files and full legacy-versus-
canonical parity checks. Flip authoring authority atomically only after parity
passes. Production must never use mixed per-lane authority.

## RD-005 — Keep generated artifacts committed

Keep generated publication artifacts committed through the `v0.2.0` proof.
Reconsider and, if approved, change that policy only in `v0.2.2`; do not change
it opportunistically during the publication repair or canonical-data migration.

## RD-006 — Promote releases from approved annotated tags

Promote the public root only from approved annotated tags reachable from
protected `main`. Pull requests receive downloadable preview artifacts and
there is no public `/dev` lane. Automated preview screenshots begin with the
`WP-012-A` browser harness; until then, the exact staged site is the review
artifact.

## RD-007 — Keep publication dates and claims independent

Treat the dataset-edition date, historical review cutoff, sitemap page-
modification date, and annotated-tag release date as separate facts. C4.3-A
preflight keeps the real specification `planned`, the release date null, and
all public identity surfaces developmental. A later authorized controlled
finalization may select the intended annotated-tag tagger calendar date, but
the subsequently created annotated tag must verify that exact date before
release-mode assets or promotion are allowed. A `ready` source snapshot is not by
itself evidence of a tag, GitHub Release, approval, deployment, or successful
public verification.

## RD-008 — Keep stable artifacts and promotion as separate capabilities

C4.4 is a locked sequence rather than one privileged change. C4.4-A1 adds only
a local, network-free stable-asset builder that requires a ready source snapshot
and a pre-existing, exactly verified annotated tag; the real `v0.1.1`
specification remains `planned` while A1 is tested with synthetic fixtures.
The stable builder pins the canonical stage configuration, supported recorded
toolchain, non-null dataset digest, executing release-tool bytes, and local Git
no-lazy-fetch policy, then repeats ref verification immediately before atomic
publication and removes temporary output on drift.
C4.4-A2 proves the same synthetic four-file bundle byte-for-byte on Windows and
Ubuntu. C4.4-B adds only read-only promotion-control, lifecycle-receipt, and
durable-rollback preflight. Through B, the active workflow inventory remains the
read-only validation workflow and reusable build-only Pages hold. Neither may
enter stable or release mode against the real checkout or release identity,
contact production, mutate GitHub, or deploy. The sole hermetic exception is
A2's reviewed pull-request-only, credential-free, remote-less fixture, which
invokes stable mode only inside a disposable synthetic repository to prove
cross-platform byte parity and has no promotion authority.

Source finalization, annotated-tag creation and push, and GitHub Release/Pages
promotion remain later, distinct actions requiring their own authorization and
fresh preconditions. Completing A1, A2, or B is not evidence that any of those
actions occurred. A stable bundle records verified local Git and source facts;
it does not attest GitHub environment approval, tag protection, immutable
Release settings, deployment, rollback readiness, or successful public smoke.

C4.4-B1 expresses the intended GitHub control state in the versioned
`config/github-promotion-policy.v1.json` policy and exposes only a default-no-
network planning command. The repository test suite may assess response logic
through an injected GET transport, but an injected or test-only receipt is
categorically ineligible to satisfy the real policy. The active workflows must
not invoke the audit CLI or a live transport, receive a token or secret, target
an environment, request write permission, deploy, or promote. Any live GET-only
audit and every resulting external mutation require separate authorization.

The real policy remains planned while the `github-pages` environment lacks a
required reviewer and permits administrator bypass, immutable GitHub Releases
are disabled, and no active no-bypass tag ruleset protects `v0.1.1`.
Repository-side fixtures and the B3 historical recovery baseline cannot clear
those external blockers.

The future required-status context is corroborating evidence only. The audit
must also bind the active `validate.yml` workflow, its successful `push` run at
the independently supplied commit, and the exact required job. Environment
eligibility is designed for a manual promotion dispatch from protected `main`;
the annotated tag is verified independently, and no tag-triggered deployment
is assumed.

C4.4-B2.1 defines a strict, append-only lifecycle receipt vocabulary and a
deterministic plan-only CLI. It has no network transport, filesystem writer,
external adapter, token, execution mode, or mutation operation. All receipts
constructed at this checkpoint are explicitly fixture-only and
promotion-ineligible. In particular, a B1 injected control receipt is not live
GitHub control evidence and cannot satisfy or elevate a B2.1 event. The active
workflow inventory remains exactly `pages.yml` and `validate.yml`. Neither may
invoke the lifecycle plan CLI, persist or consume a lifecycle receipt, or use
lifecycle output as operational evidence. The ordinary validation suite does
exercise the pure fixture-only implementation in memory, with no adapter,
output, network, mutation, or production-evidence capability.

B2.1 is a data-integrity boundary, not an operational state machine. B2.2 adds
only a pure, deterministic, in-memory fixture decision over bounded copied
control-receipt and lifecycle-chain bytes with explicit evaluation anchors. Its
complete outcome vocabulary is `reconcile`, `block`, and
`proceed-to-b2.3-read-only-preflight`. Malformed, conflicting, missing, swapped,
or ambiguous caller-supplied evidence reconciles, while well-formed known-
ineligible evidence blocks. Drift or malformed bytes in the fixed repository
policy trust anchors throw and fail closed before a decision is emitted.
Because the real control policy remains planned and the available B1 receipt
remains injected-test-only and promotion-ineligible, current repository
evidence cannot proceed and no live audit has run.

The proceed outcome is not a promotion outcome. It says only that one pinned,
subject-matched, fresh fixture observation is suitable for the next read-only
B2.3 preflight. Every decision remains fixture-only, production-ineligible, and
external-mutation-unauthorized. The decision logic has no network transport,
filesystem writer, subprocess, ambient environment or token, adapter,
execution flag, output path, or new operational package/workflow entry point.
The fixed-root `plan:promotion-lifecycle` command remains plan-only. Existing
`test:promotion-lifecycle`, and therefore workflows that run ordinary
`npm test`, exercise only pure in-memory fixtures and cannot supply operational
receipts, persist a decision, authorize an action, or elevate a test result to
evidence. The active workflow inventory remains exactly `pages.yml` and
`validate.yml`, byte-for-byte unchanged.

C4.4-B2.3-A resolves only fixture reference closure. It requires exact,
independently anchored, bounded bytes for all six lifecycle evidence and
authority roles, then closes those bytes over raw committed Git-object proof,
the reviewed workflows and tools, a ready release specification, an annotated
tag object, and the exact stable-bundle inventory. Its complete outcome
vocabulary is `reconcile` and `resolved-fixture-reference-closure`; the latter
describes internal fixture integrity only. Every result remains fixture-only,
production-ineligible, and external-mutation-unauthorized.

B2.3-A validates self-consistent fixture bytes and raw Git-object relationships
only. A fixture reference to `scripts/verify-stable-bundle.mjs` is not evidence
that the verifier executed, and committed tool-byte membership plus internally
consistent archive/manifest bytes do not prove that the staged payload was
derived by executing those committed tools against the claimed source commit.
This checkpoint leaves both execution and derivation unproven.

B2.3-A adds only the pure in-memory `test:promotion-preflight` suite to ordinary
`npm test`. It adds no plan or operational CLI, transport, filesystem adapter,
ambient environment or token, subprocess, writer, output, execution mode, or
direct workflow invocation. The active workflow inventory remains exactly
`pages.yml` and `validate.yml`, byte-for-byte unchanged. Current planned
repository evidence cannot produce the resolved outcome: the real release
specification is not ready, the current lifecycle/control evidence remains
fixture-only and promotion-ineligible, and no live audit has run.

C4.4-B2.3-B is another pure, deterministic fixture decision under the existing
`test:promotion-preflight` entry point. At one explicit fixture use time it
recomputes the B2.3-A reference closure and B2.2 freshness decision from their
raw, independently anchored inputs instead of trusting serialized results. It
also binds a complete bounded operation-state receipt covering prior-attempt,
Release, asset, deployment, and public-target state. Within that operation
observation and receipt, malformed, incomplete, duplicate, ambiguous, unknown,
stale, hash-mismatched, cross-bound, or impossible evidence reconciles. Any
known prior attempt, Release, asset, deployment, or non-prior public target
blocks. The
only positive vocabulary is `proceed-to-b3-read-only-preflight`, which hands
the fixture to the next read-only checkpoint and authorizes no operation.

All B2.3-B results keep production eligibility, operation authority, external-
mutation authority, retry authority, rollback authority, operational reuse,
and authenticated authority false; no observed state grants retry. Planned,
injected-test-only, or stale B2.2 control evidence blocks whenever the reference
closure is otherwise resolved; current real evidence can only reconcile or
block. The
resolver adds no package script, plan or operational CLI, transport,
credential, writer, subprocess, output, workflow entry point, or mutation
capability, and `pages.yml` plus `validate.yml` remain byte-identical.
Importing the B2.2 decision cannot trigger the existing
`plan:promotion-lifecycle` CLI, which remains direct-entry-only. One source-
locked hostile test uses a fixed local Node process only to prove that crafted
ambient `argv` cannot turn that dependency into an entry point; it has no
network, credential, writer, or mutation capability.

C4.4-B3 resolves only the repository-preservation and bounded-rehearsal part of
the rollback preflight. It commits the exact previously captured production
archive as a regular Git blob, binds its bytes and fixed seven-file inventory
through a strict versioned descriptor, and exercises that same committed blob
through ordinary validation plus the unchanged Windows and Ubuntu synthetic
jobs. Its zero-argument verifier reads only the fixed repository paths, uses
only tool-owned temporary extraction writes, rereads and hashes extracted
bytes, runs the historical-baseline smoke profile, and always cleans up. It
accepts no network, token, subprocess, execute, output, destination, deploy,
rollback, or tool-specific/operational environment input. Platform temporary-
directory selection is the sole ambient: its canonical parent and randomized
tool-owned child are checked fail-closed, and no caller can select an extraction
root.

The historical archive has no `release-manifest.json`, compatibility
endpoints, or `.nojekyll`. B3 therefore does not claim current publication
conformance, and the committed capture is not an attestation that those bytes
were actually serving at the claimed prior time. Its sole positive result is
`rollback-bundle-rehearsed`, which leads only to
`continue-to-final-read-only-preflight`. `productionEligible`,
`operationAuthorized`, `externalMutationAuthorized`, `retryAuthorized`,
`rollbackAuthorized`, `operationalReuseAuthorized`,
`authenticatedAuthority`, `releaseAuthorized`, and `deploymentAuthorized`
all remain false. B3 performs and authorizes no rollback. Nothing in B2.1,
B2.2, B2.3-A, B2.3-B, or B3
authorizes a tag, Release, asset upload, deployment, publication, rollback,
settings change, or production request.

The source-locked hostile test has one bounded harness exception: exactly three
fixed local Node `spawnSync` probes run with a scrubbed child environment that
contains only the test-owned canonical temporary parent and no inherited
values. They prove the zero-argument CLI, forbidden-argument rejection, import
isolation, and exact-parent residue cleanup. They cannot choose an external
program, repository input path, network target, credential, output, or
operation; the verifier itself remains subprocess-free and has no tool-specific
or operational environment input. The hardened attributes explicitly disable
text and EOL transforms for the archive; the full source gate separately proves
that no filter is configured without adding a subprocess to this harness.

## Explicit deferrals

### Through v0.2.0

The following are out of scope through `v0.2.0` unless the roadmap is explicitly
re-authorized:

- a fifth view;
- major content expansion;
- a framework or backend migration;
- accounts, comments, or analytics;
- unreviewed bulk AI imports.

### v0.2.2 decision point

A change to the committed-generated-output policy is deferred to the `v0.2.2`
decision point. Generated publication artifacts remain committed through the
`v0.2.0` proof.

### Through 1.0

SHACL is deferred through `1.0` unless the roadmap is explicitly re-authorized.
