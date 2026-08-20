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
are disabled, no active no-bypass tag ruleset protects `v0.1.1`, and the
verified production recovery artifact remains local rather than durable and
runner-accessible. Repository-side fixtures cannot clear those external
blockers.

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

B2.1 is a data-integrity boundary, not an operational state machine. Fresh
live-control consumption and unknown-result reconciliation are reserved for
B2.2; rollback eligibility and ambiguity guards are reserved for B2.3; and the
durable, runner-accessible rollback package and its storage proof are reserved
for B3. Those later checkpoints require their own review and authorization.
Nothing in B2.1 authorizes a tag, Release, asset upload, deployment,
publication, rollback, settings change, or production request.

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
