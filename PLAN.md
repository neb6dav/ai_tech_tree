---
roadmap_version: 7
active_release: "v1.2.0"
release_mode: "source_checkpoints_v1.0.1_through_v1.2.0"
active_work_package: "researcher_delivery"
base_sha: "85108c78fa86c86634d4c0944839696369e687cd"
product_boundary_sha: "53e3a4f9c0624096aede63e0345390a3c021bac0"
working_branch: "codex/ui-v1.2.0"
expanded_archive_branch: "archive/v0.1.1-expanded-release-safety-0870d47"
verified_implementation_head: "3fff379adc9f21b73c9af18a3ad538e09813f15d"
pull_request: 11
verification_merge_tree: "0aeb9ec5b5e21709fced9e3321cef0b3a849aea9"
last_completed_checkpoint: "v1.0.0"
last_completed_local_checkpoint: "v1.2.0"
active_release_status: "v1.2.0_stable_release_candidate_owner_approved_verification_pending_not_merged_tagged_or_deployed"
next_exact_action: >-
  Root runs the final Stable-candidate Windows and hosted-Ubuntu verification,
  then holds for separate merge, tag, and deployment authorization. Do not
  perform any promotion action under this checkpoint.
presentation_inventory_owner_review: "owner_approved_2026-08-22_exact_24_anchors_72_spine_edges_and_six_tours"
potential_future_editions:
  - version: "v1.3.0"
    status: "roadmap_candidate_not_authorized"
    purpose: "Read-only combinatorial lens over existing sourced records, constraints, open directions, and hypothesis-grade proposed combinations"
  - version: "v1.4.0"
    status: "roadmap_candidate_not_authorized"
    purpose: "Curator-reviewed hypothesis workbench with structured tests, provenance, deduplication, and explicit promotion into canonical Opportunity data"
last_verified_commands:
  - command: "npm test"
    status: "PASS"
    runtime: "Windows x64; Node v24.14.1"
    scope: "Historical v1.2.0 Preview checkpoint evidence before owner-approved Stable-candidate changes: 18/18 browser tests, DOM peak 7244, HTML 4,589,553 bytes, gzip 672,590 bytes, semantic digest 865174514ba64e20d6f2a90471a6766b6d5fa18f5b0e62c85d9601de077a50f2, researcher delivery 339 nodes/711 relationships/339 sitemap node URLs/0 semantic changes/embed read-only, Lighthouse medians score 55/FCP 23398.714/LCP 23409.214/TBT 3/CLS 0"
  - command: "GitHub Actions PR #11 run 32587459751, job 97065915025"
    status: "PASS"
    runtime: "ubuntu-24.04; tested PR merge tree 0aeb9ec5b5e21709fced9e3321cef0b3a849aea9; candidate head 3fff379adc9f21b73c9af18a3ad538e09813f15d"
    scope: "Historical v1.2.0 Preview checkpoint evidence before owner-approved Stable-candidate changes: Ubuntu 18/18 browser tests, DOM peak 7244/8000, HTML 4,589,553 bytes, gzip 672,590 bytes, Lighthouse medians score 44/FCP 23180.6411/LCP 23399.51595/TBT 451.5/CLS 0; generated files committed and preview uploaded"
  - command: "GitHub Actions Pages run 32548737168 and live payload reconciliation"
    status: "PASS"
    runtime: "ubuntu-24.04; protected-main workflow source 1f5d730193985665b7bcd2139cac4aca902513f0; tagged source 7d0d26fe87c8be2868c63738c503f90d35789b3a"
    scope: "Annotated tag object 67e1f7b7dea394451d4a2d54a929037982d30517 -> exact v1.0.0 commit; deployment 6032724134; live manifest SHA-256 d39b65a71d015e9e6b1a26e9020bf3ee2d3e9d44ebf33c9bed08fa64709e1811; all 13 HTTP-exposed payloads match manifest bytes and SHA-256; .nojekyll remains an artifact-only Pages control file"
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
    status: "complete"
    verification_state: "public_release_verified"
    product_version: "1.0.0"
    release_state: "Stable"
    edition: "2026-08-21-stable-1"
    date: "2026-08-21"
    tag_and_deployment: "completed_2026-08-21"
    purpose: "Stable public contract and authorized release"
  - version: "v1.1.0"
    status: "complete"
    verification_state: "source_checkpoint_verified"
    product_version: "1.1.0"
    release_state: "Preview"
    checkpoint_commit: "710138d"
    purpose: "Semantic navigation redesign source checkpoint"
  - version: "v1.2.0"
    status: "owner_approved_candidate_pending_final_verification"
    verification_state: "owner_approved_stable_candidate_verification_pending_windows_and_ubuntu"
    product_version: "1.2.0"
    release_state: "Stable candidate"
    checkpoint_commit: "3fff379"
    tag_and_deployment: "not_authorized_not_merged_tagged_or_deployed"
    purpose: "Researcher delivery with static node pages and read-only comparison/embed"
authorization:
  source_checkpoint_implementation: "authorized"
  source_checkpoint_commits: "authorized"
  source_checkpoint_pushes: "authorized"
  intermediate_public_tags: "not_planned"
  intermediate_public_deployments: "not_planned"
  v1_public_tag_and_deployment: "completed_2026-08-21"
  post_v1_ui_repair_program: "implementation_authorized_release_promotion_not_authorized"
  post_v1_combinatorial_editions: "roadmap_only_not_authorized"
---

# Product roadmap

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

## v1.0.0 — stable release

Status: complete. Release implementation, review, hosted verification,
annotated tag, public deployment, and live byte reconciliation all passed on
2026-08-21. The immutable `v1.0.0` tag object `67e1f7b7` peels to release
commit `7d0d26fe`; Pages run `32548737168` deployed it successfully as
deployment `6032724134`. The full local and `ubuntu-24.04` build/test closures
pass, and hostile review reports no open P1/P2. The stable release identity is
version `1.0.0`, release state
`Stable`, edition `2026-08-21-stable-1`, dated 2026-08-21.

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
- Promote only the exact reviewed `v1.0.0` commit through an annotated tag on
  protected `main` and the guarded manual Pages workflow.

Acceptance gate:

- Full deterministic build and test suite passes from a clean checkout.
- Browser verification passes for Timeline, Network, Opportunity, and List
  views at representative mobile and desktop sizes with no console errors.
- Public URL/schema/layout/canonical-authoring compatibility tests pass, and
  the ordered historical and Opportunity identity digests match the frozen v1
  baseline.
- Version `1.0.0`, edition `2026-08-21-stable-1`, date 2026-08-21, citation,
  application shell, generated exports, and staged manifest agree; ordinary
  validation expects a null tag, while the deployment gate requires exactly
  the authorized annotated `v1.0.0` tag.
- The v0.2.2 gate received `ubuntu-24.04` hosted-runner confirmation in Actions
  run `32489666292` before the v1 source candidate was declared complete.
- The final diff contains only product, data, documentation, and proportionate
  test changes required by this roadmap.

## v1.0.1 through v1.2.0 — UI, navigation, and researcher delivery

Status: implementation authorized as source checkpoints. Each checkpoint must
preserve the v1 semantic inventory and pass the existing publication contract.
Merge, public tag, and deployment remain separate promotion decisions.

### v1.0.1 — first-minute readability repair

- Make the no-state desktop landing legible at whole-map scale through a
  curator-reviewed orientation spine and anchor labels.
- Give mobile readers guided starts before the whole-map overview.
- Expose primary view and connection controls at normal desktop widths; simplify
  onboarding, previews, List, Opportunity copy, and nonlinear-time guidance.
- Preserve every existing URL key, evidence field, and semantic record.

### v1.1.0 — semantic navigation redesign

- Establish overview, mid, and detail altitudes without rendering every
  relationship at low zoom.
- Add a shared inspector, density/linear time choice, six curated tours, and a
  command palette while retaining keyboard, touch, and no-JavaScript access.
- Reuse relationship paths and retire inactive lazy-view DOM so the complete
  interaction sequence remains below the independent 8,000-element ceiling.

### v1.2.0 — researcher delivery

- Generate one static, source-backed page for every canonical node, including
  sitemap discovery and metadata-safe citation conveniences.
- Add a lazy same-origin edition comparison and a read-only embed mode.
- Keep the default interactive shell single-file and free of external runtime
  dependencies.

Acceptance for all three editions includes unchanged 339-node and
711-relationship identities, both themes, responsive and keyboard behavior,
URL round trips, generated-artifact parity, publication tests, the calibrated
DOM/HTML/gzip budgets, and the current Lighthouse limits.

## Potential later editions — combinatorial exploration

Status: roadmap candidates only. Neither implementation nor release is
authorized, and no target date is assigned. The intent is to help readers
reason across ideas already represented in the atlas without presenting a
machine-generated combination as a discovery, demonstrated capability, or
globally novel research direction.

### v1.3.0 candidate — read-only combinatorial lens

- Let a reader select or traverse a bounded set of existing developments, open
  directions, constraints, and Opportunity records.
- Show recorded relationships, hypothesis-grade `proposed_combination` links,
  shared prerequisites, complementary capabilities, tensions, and known
  blockers while preserving the exact source record IDs and citations.
- Distinguish a combination explicitly supported by an attached source, an
  existing editorial or hypothesis proposal, and a dataset-derived candidate.
  Absence from this edition means only "not represented here," not novelty.
- Keep derived candidates ephemeral or export-only. They must not write to the
  canonical atlas, receive stable public IDs, or affect evidence counts.
- Bound pair/triple exploration and expose filters so the feature aids thought
  rather than dumping an unreviewable combinatorial product.

Acceptance planning for this edition must define deterministic candidate
inputs, provenance display, evidence/status labeling, duplicate suppression,
performance bounds, accessibility, and hostile cases where proximity or a
missing source is incorrectly treated as evidence or novelty.

### v1.4.0 candidate — curator-reviewed hypothesis workbench

- Turn a selected candidate into a structured hypothesis card containing the
  proposed mechanism, relevant records and sources, unmet need, novelty-search
  scope, minimal experiment, baselines, disconfirming result, likely resources,
  blockers, and failure reasons.
- Require human review, source checking, and duplicate/adjacent-work review
  before a candidate can enter canonical Opportunity data.
- Retain the input stable IDs, source edition, derivation origin
  (`human`, `rule`, or `model`), and material AI-assistance disclosure. Sources
  supporting the constituent ideas do not support the synthesized combination
  unless they explicitly address that combination.
- Preserve the distinction between proposal, review, and evidence. Approved
  inclusion records that a hypothesis was curated; it does not establish that
  the combination works or is globally novel.
- Assign or freeze a public ID only at approved canonical promotion, after an
  RD-009 compatibility review and deliberate inventory-baseline update. Review
  of one candidate must not upgrade the surrounding `imported_unreviewed` data.

Both candidates must preserve the v1 URL and identity contract; preserve the
separate canonical authority and semantics of the historical atlas and
Opportunity data; avoid unreviewed bulk AI imports; and receive a separate
implementation/release authorization before code, schema, or public data
changes begin.

## Explicit non-goals through v1.0.0

- A fifth view.
- Major corpus expansion.
- Framework or backend migration.
- Accounts, comments, or analytics.
- Unreviewed bulk AI imports.
- SHACL.
- A new release-governance framework.
