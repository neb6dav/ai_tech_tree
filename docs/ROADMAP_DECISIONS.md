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

Keep generated publication artifacts committed through `v1.0.0`. The `v0.2.2`
decision point closes without changing that policy. Any later reconsideration
requires a separate explicit decision; do not change the policy opportunistically.

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
parity and browser proof, performance calibration and generated-output policy
confirmation, then stabilization. Do not introduce new release-governance
machinery or unrelated features while working through these checkpoints.

## RD-008 — Treat Lighthouse as a calibrated local-origin regression signal

Run Lighthouse against the staged application on a controlled, uncompressed,
`no-store` local origin. The source calibration comprises five independent runs
on Windows x64 with Node.js v24.14.1, Lighthouse 13.4.1, Playwright 1.62.1, and
Playwright Chromium 151.0.7922.34 revision 1234. The independent medians were a
performance score of 53, FCP of 22,728.84345 ms, LCP of 22,900.34345 ms, TBT of
166 ms, and CLS of 0.00082719.

The Windows-only score floor of 48 and TBT ceiling of 250 ms proved too narrow
on the configured Ubuntu runner. Two independent hosted three-run attempts
against the exact same application bytes both produced score medians of 47 and TBT
medians of 362.5 and 362 ms; the six raw samples ranged from score 44 to 48 and
TBT 325 to 440.5 ms, with no audit warnings. The reviewed cross-platform limits
are therefore a score of at least 42, FCP and LCP of at most 27,500 ms, TBT of
at most 550 ms, and CLS of at most 0.02. The score floor remains five points
below the hosted median, and the TBT ceiling rounds to roughly 25% above the
hosted maximum. Paint and CLS limits are unchanged.

These are controlled local-origin regression bounds, not live-user goals. The
normal configured `ubuntu-24.04` gate passed all five revised limits in Actions
run `32489666292`, completing the `v0.2.2` source checkpoint. The workflow label
does not freeze the evolving runner image, and the measurements are not live
GitHub Pages delivery or real-user field performance.

## RD-009 — Freeze the v1 stable source-candidate contract

The stable source candidate carries product version `1.0.0`, release state
`Stable`, dataset edition `2026-08-21-stable-1`, and date 2026-08-21. `Stable`
is artifact and data identity for the final pre-tag source bytes; it does not
attest or authorize an annotated tag, deployment, or public promotion. Those
remain separate explicit actions under RD-006 and RD-007.

The v1 contract freezes the existing root application and compatibility alias,
historical JSON/JSON-LD/NDJSON exports, stable and compatibility Opportunity
data/schema paths, citation, exact-build manifest, social card, robots, and
sitemap paths. It also freezes historical export schema `2`, generator identity
`1.3.1`, dataset and vocabulary IRIs, Opportunity schema `1.0.0` and canonical
schema `$id`, Network layout `network-v1`, and the schema-`1.0.0` 15-lane
canonical authoring layout.

Every existing exported record ID is frozen. The publication-compatibility gate
locks the complete ordered historical identity inventory at
`f5cff253d7a70641cf1f9a9058561f6d69bbae2d365166a7883694b3ef90241a`
and the ordered Opportunity record inventory at
`65afb35bc56b6d771312cc59a2ab3d4a7b48828b54a2262b7efb18d845702b33`,
with the Opportunity map and visual-band IDs asserted explicitly. A future
addition or exceptional identity correction requires compatibility review and
a deliberate baseline update; IDs must not be silently reused or renamed.

Release identity does not change evidence status. The historical review cutoff
remains `2026-08-04`. The diffusion Opportunity map remains an `alpha` dataset
dated `2026-08-19` with import state `imported_unreviewed`. Promoting that state
requires source-by-source human review rather than a version or documentation
change.

## Explicit deferrals

### Through v0.2.0

The following are out of scope through `v0.2.0` unless the roadmap is explicitly
re-authorized:

- a fifth view;
- major content expansion;
- a framework or backend migration;
- accounts, comments, or analytics;
- unreviewed bulk AI imports.

### v0.2.2 decisions

Generated publication artifacts remain committed through `v1.0.0`. The
Windows source calibration plus the two reviewed Ubuntu observations establish
the cross-platform limits recorded in RD-008. Actions run `32489666292`
provided the normal configured `ubuntu-24.04` confirmation.

### Through 1.0

SHACL is deferred through `1.0` unless the roadmap is explicitly re-authorized.
