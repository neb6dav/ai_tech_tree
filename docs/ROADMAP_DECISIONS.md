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
read-only validation workflow and reusable build-only Pages hold, and neither
workflow may enter stable or release mode, contact production, mutate GitHub,
or deploy.

Source finalization, annotated-tag creation and push, and GitHub Release/Pages
promotion remain later, distinct actions requiring their own authorization and
fresh preconditions. Completing A1, A2, or B is not evidence that any of those
actions occurred. A stable bundle records verified local Git and source facts;
it does not attest GitHub environment approval, tag protection, immutable
Release settings, deployment, rollback readiness, or successful public smoke.

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
