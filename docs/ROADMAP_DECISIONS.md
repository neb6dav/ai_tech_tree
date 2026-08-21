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
there is no public `/dev` lane. The v0.2.0 Chromium smoke gate verifies
representative desktop, mobile, deep-link, focus, and no-JavaScript behavior.
Screenshots remain optional review artifacts rather than brittle golden-image
assertions.

## RD-007 — Use source checkpoints until v1.0.0

Treat `v0.1.1`, `v0.2.0`, and `v0.2.2` as internal source checkpoints. They
do not require public tags or deployments. `v1.0.0` is the sole public release
target in this sequence, and its tag and deployment remain a final explicit
action after the complete product gate passes.

The sequence is intentionally narrow: publication repair, canonical-data
parity and browser proof, performance and generated-output decisions, then
stabilization. Do not introduce new release-governance machinery or unrelated
features while working through these checkpoints.

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
