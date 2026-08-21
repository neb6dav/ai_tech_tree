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

The resulting blocking limits are a score of at least 48, FCP and LCP of at
most 27,500 ms, TBT of at most 250 ms, and CLS of at most 0.02. The score floor
is five points below the calibration median; the paint limits are rounded up to
allow local-run headroom; the TBT limit covers the calibration's 0.5&ndash;206.5 ms
spread; and the CLS limit detects a material regression above the near-zero
baseline. A subsequent three-run local gate passed with medians of 52,
22,730.706 ms FCP, 22,898.841 ms LCP, 204 ms TBT, and 0.00082719 CLS.

These are Windows-derived local regression bounds, not live-user goals. The
configured `ubuntu-24.04` hosted-runner confirmation remains required before
the checkpoint is complete; the workflow label does not freeze the evolving
runner image. Until that gate passes, `v0.2.2` is locally complete but hosted
unconfirmed and must not be described as fully reproducible. The measurements
are not live GitHub Pages delivery or real-user field performance.

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
Windows source calibration establishes the blocking limits recorded in RD-008,
and the local three-run gate passes them. Canonical confirmation on the
configured `ubuntu-24.04` hosted runner remains outstanding.

### Through 1.0

SHACL is deferred through `1.0` unless the roadmap is explicitly re-authorized.
