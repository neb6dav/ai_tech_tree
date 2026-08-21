---
roadmap_version: 3
active_release: "v0.2.2"
release_mode: "source_checkpoints_until_v1.0.0"
active_work_package: "v0.2.2-hosted-runner-confirmation"
base_sha: "85108c78fa86c86634d4c0944839696369e687cd"
product_boundary_sha: "53e3a4f9c0624096aede63e0345390a3c021bac0"
working_branch: "codex/v0.1.1-minimal-to-v1"
expanded_archive_branch: "archive/v0.1.1-expanded-release-safety-0870d47"
last_completed_checkpoint: "v0.2.0"
next_exact_action: >-
  Run the blocking three-run Lighthouse gate on the configured ubuntu-24.04
  hosted runner and record canonical confirmation; keep v0.2.2 in progress
  until that environment passes the Windows-derived regression limits.
last_verified_commands:
  - command: "node scripts/lighthouse-budget.mjs --calibrate"
    status: "PASS"
    runtime: "win32 x64; Node v24.14.1; Lighthouse 13.4.1; Playwright 1.62.1; Chromium 151.0.7922.34 rev1234"
    scope: "Five-run local calibration medians: score 53, FCP 22728.84345 ms, LCP 22900.34345 ms, TBT 166 ms, CLS 0.00082719"
  - command: "npm run test:lighthouse"
    status: "PASS"
    runtime: "win32 x64; Node v24.14.1; Lighthouse 13.4.1; Playwright 1.62.1; Chromium 151.0.7922.34 rev1234"
    scope: "Three-run blocking medians: score 52, FCP 22730.706 ms, LCP 22898.841 ms, TBT 204 ms, CLS 0.00082719"
source_checkpoints:
  - version: "v0.1.1"
    status: "complete"
    purpose: "Publication URL and identity repair"
  - version: "v0.2.0"
    status: "complete"
    purpose: "Canonical 15-lane data shadow, parity proof, atomic authoring cutover, and browser verification"
  - version: "v0.2.2"
    status: "in_progress"
    verification_state: "local_complete_hosted_unconfirmed"
    purpose: "Calibrated local-origin performance regression gate and committed-generated-output policy confirmation"
  - version: "v1.0.0"
    status: "planned"
    purpose: "Stable public contract and release candidate"
authorization:
  source_checkpoint_implementation: "authorized"
  source_checkpoint_commits: "authorized"
  source_checkpoint_pushes: "authorized"
  intermediate_public_tags: "not_planned"
  intermediate_public_deployments: "not_planned"
  v1_public_tag_and_deployment: "requires_final_confirmation"
---

# Product roadmap to v1.0.0

## Operating rule

`v0.1.1`, `v0.2.0`, and `v0.2.2` are source checkpoints, not public
releases. Only `v1.0.0` is the public release target. Each checkpoint must be a
bounded product change with its own build, focused tests, generated-file check,
and short review. Do not add a new promotion, receipt, rollback, provenance, or
policy subsystem.

Generated publication artifacts remain committed through `v1.0.0`.

The expanded release-safety experiment remains preserved separately at
`0870d4773249db9f81a491f0305c29a75fcb53a1`. It is not part of this branch.

## v0.1.1 — publication repair

Status: product work complete and locally verified at `53e3a4f`.

Deliverables:

- Publish stable Opportunity JSON and schema URLs while retaining the prior
  paths as compatibility copies.
- Keep `ai-research-tech-tree.html` as a lightweight alias that preserves query
  and hash state.
- Point the dataset and all 339 record `humanUrl` values at the root app.
- Synchronize package `0.1.1`, dataset edition
  `2026-08-20-public-beta-2`, development identity, citation metadata,
  sitemap, exports, and contribution forms.
- Keep Repository, Contribute, Citation, and exact-build-manifest links
  accessible in the primary and no-JavaScript surfaces.

Acceptance gate:

- `npm run build` leaves no generated diff.
- `npm test` passes the retained core and publication suites.
- The staged site contains the root app, compatibility aliases, stable and
  compatibility Opportunity endpoints, exports, citation file, and manifest.
- Source remains explicitly untagged and developmental.

## v0.2.0 — canonical data and browser proof

Status: source checkpoint complete at `6513e5e`.

Deliverables:

- Introduce the approved 15-lane-sharded canonical historical data as shadow
  source files.
- Keep relationship semantic type, evidence grade, review state,
  lifecycle/origin, and direction/display scope independent.
- Prove complete legacy-versus-canonical parity before changing authoring
  authority.
- Flip authoring authority atomically; never serve a mixed per-lane state.
- Add the smallest browser harness needed to verify runtime-created fragments,
  representative view navigation, responsive behavior, and a recorded active
  DOM baseline. Lighthouse measurement remains the v0.2.2 task.

Acceptance gate:

- Shadow and legacy inputs generate byte-equivalent public dataset content.
- Node and relationship inventories, ordering, stable IDs, and cross-format
  exports match exactly before cutover.
- After the atomic cutover, the legacy source is no longer authoritative and
  the complete build/test/browser gate remains green.
- Generated publication artifacts remain committed through this checkpoint.

## v0.2.2 — performance calibration and repository-policy confirmation

Status: local implementation and Windows calibration are complete; hosted
confirmation is outstanding. This checkpoint remains in progress and is not
yet established as reproducible on the configured `ubuntu-24.04` runner.

Deliverables:

- Run the `lighthouse-mobile-v0.2.2` profile against the staged application on
  a controlled, uncompressed, `no-store` local origin. Each blocking gate uses
  the independent median of three runs; source calibration uses five runs.
- Use the Windows x64 source calibration recorded with Node.js v24.14.1,
  Lighthouse 13.4.1, Playwright 1.62.1, and Chromium 151.0.7922.34 revision
  1234 to establish provisional blocking regression limits.
- Treat Lighthouse as a repeatable local-origin regression signal, not a
  measurement of live GitHub Pages delivery or real-user field performance.
- Keep generated publication artifacts committed through `v1.0.0`.

Acceptance gate:

- The five-run Windows medians are score 53, FCP 22,728.84345 ms, LCP
  22,900.34345 ms, TBT 166 ms, and CLS 0.00082719.
- The blocking limits are score at least 48, FCP and LCP at most 27,500 ms,
  TBT at most 250 ms, and CLS at most 0.02. The score floor is five points below
  the median; paint ceilings are rounded upward for local-run headroom; the TBT
  ceiling covers the 0.5&ndash;206.5 ms calibration spread; and the CLS ceiling
  detects a material regression above the near-zero baseline.
- The local three-run gate passes with medians of score 52, FCP 22,730.706 ms,
  LCP 22,898.841 ms, TBT 204 ms, and CLS 0.00082719.
- The same blocking gate must pass on the configured `ubuntu-24.04` hosted
  runner before this checkpoint is complete. The runner label and Node/npm
  major-family declarations do not freeze an image or patch release.
- Documentation and test output describe the measurement only as a controlled
  regression signal and do not present it as live Pages or field performance.
- The committed-generated-output decision is explicit and does not change the
  public data contract.

## v1.0.0 — stable release candidate

Deliverables:

- Stabilize the four existing views; do not add a fifth view.
- Freeze and document public URLs, stable IDs, export schemas, and the
  canonical authoring layout.
- Pass static and browser accessibility checks across representative desktop
  and mobile viewports, keyboard navigation, modal behavior, and no-JavaScript
  fallbacks.
- Pass the calibrated v0.2.2 local-origin performance regression budgets.
- Keep generated publication artifacts committed in the reviewed `v1.0.0`
  source and release candidate.
- Publish clear contribution, citation, data-status, evidence-limit, and
  versioning documentation.
- Remove development-only wording and produce a reviewed `v1.0.0` release
  candidate. Tagging and public deployment remain a final explicit action.

Acceptance gate:

- Full deterministic build and test suite passes from a clean checkout.
- Browser verification passes for Timeline, Network, Opportunity, and List
  views at representative mobile and desktop sizes with no console errors.
- Public URL/schema/ID compatibility tests pass.
- The final diff contains only product, data, documentation, and proportionate
  test changes required by this roadmap.

## Explicit non-goals through v1.0.0

- A fifth view.
- Major corpus expansion.
- Framework or backend migration.
- Accounts, comments, or analytics.
- Unreviewed bulk AI imports.
- SHACL.
- A new release-governance framework.
