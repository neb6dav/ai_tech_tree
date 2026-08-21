---
roadmap_version: 4
active_release: "v1.0.0"
release_mode: "source_checkpoints_until_v1.0.0"
active_work_package: "v1.0.0-final-authorization-hold"
base_sha: "85108c78fa86c86634d4c0944839696369e687cd"
product_boundary_sha: "53e3a4f9c0624096aede63e0345390a3c021bac0"
working_branch: "codex/v0.1.1-minimal-to-v1"
expanded_archive_branch: "archive/v0.1.1-expanded-release-safety-0870d47"
last_completed_checkpoint: "v1.0.0-stable-pre-tag-source-candidate"
last_completed_local_checkpoint: "v1.0.0-stable-pre-tag-source-candidate"
next_exact_action: >-
  Await separate explicit authorization before creating an annotated v1.0.0
  tag or performing any public deployment. Do not tag, deploy, or promote the
  hosted-verified source candidate without that authorization.
last_verified_commands:
  - command: "node scripts/lighthouse-budget.mjs --calibrate"
    status: "PASS"
    runtime: "win32 x64; Node v24.14.1; Lighthouse 13.4.1; Playwright 1.62.1; Chromium 151.0.7922.34 rev1234"
    scope: "Five-run local calibration medians: score 53, FCP 22728.84345 ms, LCP 22900.34345 ms, TBT 166 ms, CLS 0.00082719"
  - command: "npm run test:lighthouse"
    status: "PASS"
    runtime: "win32 x64; Node v24.14.1; Lighthouse 13.4.1; Playwright 1.62.1; Chromium 151.0.7922.34 rev1234"
    scope: "Reviewed exact-clean three-run medians: score 50, FCP 22734.979 ms, LCP 22893.525 ms, TBT 248 ms, CLS 0.00082719"
  - command: "GitHub Actions run 32488054446, attempts 1 and 2"
    status: "EXPECTED_LIMIT_REVISION"
    runtime: "ubuntu-24.04 image 20260816.277; Node v24.19.0; Lighthouse 13.4.1; Playwright 1.62.1; Chromium 151.0.7922.34 rev1234"
    scope: "Exact head b6f7200; profile e1e49f07; HTML 98a82501; six canonical samples established score range 44-48 and TBT range 325-440.5 ms; DOM 7728 and all non-Lighthouse gates passed"
  - command: "GitHub Actions run 32489666292"
    status: "PASS"
    runtime: "ubuntu-24.04 image 20260816.277; Node v24.19.0; Lighthouse 13.4.1; Playwright 1.62.1; Chromium 151.0.7922.34 rev1234"
    scope: "Exact head 04f702a/tree a75aebf; full gate, DOM 7728, Lighthouse medians 45/22729.34215/22920.53185/423.5/0, generated diff, and preview upload passed; no deployment"
  - command: "npm run build; npm test"
    status: "PASS"
    runtime: "win32 x64; Node v24.14.1"
    scope: "Complete deterministic, publication, canonical-data, identity, browser, and Lighthouse closure for the v1.0.0 stable pre-tag source candidate"
  - command: "node --test --test-isolation=none tests/release-identity.test.cjs tests/publication-compatibility.test.cjs tests/canonical-atlas.test.cjs"
    status: "PASS"
    runtime: "win32 x64; Node v24.14.1"
    scope: "20/20 exact current-byte identity, public-contract, exported-ID, and canonical-authority checks"
source_checkpoints:
  - version: "v0.1.1"
    status: "complete"
    purpose: "Publication URL and identity repair"
  - version: "v0.2.0"
    status: "complete"
    purpose: "Canonical 15-lane data shadow, parity proof, atomic authoring cutover, and browser verification"
  - version: "v0.2.2"
    status: "complete"
    verification_state: "hosted_verified"
    purpose: "Calibrated local-origin performance regression gate and committed-generated-output policy confirmation"
  - version: "v1.0.0"
    status: "hosted_verified_pre_tag"
    product_version: "1.0.0"
    release_state: "Stable"
    edition: "2026-08-21-stable-1"
    date: "2026-08-21"
    tag_and_deployment: "requires_final_confirmation"
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

Status: source checkpoint complete. Actions run `32489666292` passed the normal
configured `ubuntu-24.04` gate with the reviewed cross-platform limits.

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
- Two hosted Ubuntu attempts against the same application bytes both produced
  score medians of 47 and TBT medians of 362.5 and 362 ms; the six raw samples ranged
  from score 44 to 48 and TBT 325 to 440.5 ms without audit warnings.
- The reviewed cross-platform limits are score at least 42, FCP and LCP at most
  27,500 ms, TBT at most 550 ms, and CLS at most 0.02. The score floor remains
  five points below the hosted median; the TBT ceiling is roughly 25% above the
  hosted maximum; and the paint and CLS limits are unchanged.
- A reviewed exact-clean local gate passes with medians of score 50, FCP
  22,734.979 ms, LCP 22,893.525 ms, TBT 248 ms, and CLS 0.00082719.
- Actions run `32489666292` passed the same blocking gate on the configured
  `ubuntu-24.04` hosted runner. The runner label and Node/npm major-family
  declarations do not freeze an image or patch release.
- Documentation and test output describe the measurement only as a controlled
  regression signal and do not present it as live Pages or field performance.
- The committed-generated-output decision is explicit and does not change the
  public data contract.

## v1.0.0 — stable release candidate

Status: source-candidate implementation, review, and hosted verification are
complete. The full local and `ubuntu-24.04` build/test closures pass, and
hostile review reports no open P1/P2. The stable source identity is version
`1.0.0`, release state
`Stable`, edition `2026-08-21-stable-1`, dated 2026-08-21. `Stable` is artifact
and data identity for the final pre-tag source bytes; it does not attest an
annotated tag, deployment, or public promotion. Those remain separately
authorized final actions.

Deliverables:

- Stabilize the four existing views; do not add a fifth view.
- Freeze and document the root application, compatibility alias, historical
  exports, Opportunity stable and compatibility endpoints, citation, manifest,
  social-card, robots, and sitemap paths.
- Freeze every existing exported record ID with ordered historical and
  Opportunity inventory digest locks. Any later identity correction or
  inventory addition requires an explicit compatibility review and deliberate
  baseline update.
- Freeze the historical export schema and dataset namespace, Opportunity
  schema IDs, deterministic Network layout identity, and schema-`1.0.0`
  15-lane canonical authoring layout.
- Pass static and browser accessibility checks across representative desktop
  and mobile viewports, keyboard navigation, modal behavior, and no-JavaScript
  fallbacks.
- Pass the calibrated v0.2.2 local-origin performance regression budgets.
- Keep generated publication artifacts committed in the reviewed `v1.0.0`
  source and release candidate.
- Publish clear contribution, citation, data-status, evidence-limit, and
  versioning documentation.
- Remove current development and beta wording without rewriting historical
  checkpoint or changelog records.
- Keep the historical review cutoff at `2026-08-04` and the diffusion
  Opportunity map explicitly `alpha`, dated `2026-08-19`, and
  `imported_unreviewed`; stable application status does not upgrade evidence.
- Produce a reviewed `v1.0.0` source candidate. Tagging and public deployment
  remain final explicit actions.

Acceptance gate:

- Full deterministic build and test suite passes from a clean checkout.
- Browser verification passes for Timeline, Network, Opportunity, and List
  views at representative mobile and desktop sizes with no console errors.
- Public URL/schema/layout/canonical-authoring compatibility tests pass, and
  the ordered historical and Opportunity identity digests match the frozen v1
  baseline.
- Version `1.0.0`, edition `2026-08-21-stable-1`, date 2026-08-21, citation,
  application shell, generated exports, and staged manifest agree while the
  pre-tag manifest truthfully records that no release tag has been authorized.
- The v0.2.2 gate received `ubuntu-24.04` hosted-runner confirmation in Actions
  run `32489666292` before the v1 source candidate was declared complete.
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
