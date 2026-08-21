---
roadmap_version: 2
active_release: "v0.1.1"
release_mode: "source_checkpoints_until_v1.0.0"
active_work_package: "WP-011-B"
base_sha: "85108c78fa86c86634d4c0944839696369e687cd"
product_boundary_sha: "53e3a4f9c0624096aede63e0345390a3c021bac0"
working_branch: "codex/v0.1.1-minimal-to-v1"
expanded_archive_branch: "archive/v0.1.1-expanded-release-safety-0870d47"
last_completed_checkpoint: "v0.1.1-product"
next_exact_action: >-
  Commit and push the verified v0.1.1 source checkpoint, then begin the
  v0.2.0 canonical-data shadow migration without changing public behavior.
last_verified_commands:
  - command: "npm run build"
    status: "PASS"
    runtime: "Node v24.14.1"
    scope: "Deterministic v0.1.1 product regeneration; clean generated diff"
  - command: "npm test"
    status: "PASS"
    runtime: "Node v24.14.1 and npm 11.11.0"
    scope: "Core gates, 72 focused tests, 14-file stage, release identity, artifact budgets, and 1,465-reference site contract"
source_checkpoints:
  - version: "v0.1.1"
    status: "complete"
    purpose: "Publication URL and identity repair"
  - version: "v0.2.0"
    status: "planned"
    purpose: "Canonical 15-lane data shadow, parity proof, atomic authoring cutover, and browser verification"
  - version: "v0.2.2"
    status: "planned"
    purpose: "Performance enforcement and committed-generated-output policy decision"
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

Deliverables:

- Introduce the approved 15-lane-sharded canonical historical data as shadow
  source files.
- Keep relationship semantic type, evidence grade, review state,
  lifecycle/origin, and direction/display scope independent.
- Prove complete legacy-versus-canonical parity before changing authoring
  authority.
- Flip authoring authority atomically; never serve a mixed per-lane state.
- Add the smallest browser harness needed to verify runtime-created fragments,
  representative view navigation, responsive behavior, and measured browser
  performance.

Acceptance gate:

- Shadow and legacy inputs generate byte-equivalent public dataset content.
- Node and relationship inventories, ordering, stable IDs, and cross-format
  exports match exactly before cutover.
- After the atomic cutover, the legacy source is no longer authoritative and
  the complete build/test/browser gate remains green.
- Generated publication artifacts remain committed through this checkpoint.

## v0.2.2 — performance and repository-policy decision

Deliverables:

- Measure active DOM size, mobile Lighthouse performance, FCP, LCP, TBT, and
  CLS using the v0.2.0 browser harness.
- Convert realistic measured targets into blocking budgets without masking
  regressions or engineering solely to a synthetic score.
- Decide whether generated publication artifacts remain committed. If the
  evidence does not justify a change, keep the existing policy.

Acceptance gate:

- Browser measurements are reproducible on the pinned local/CI runtime.
- Any blocking threshold is tied to an observed baseline and a documented
  user-facing reason.
- The generated-output decision is explicit, small, and does not change the
  public data contract.

## v1.0.0 — stable release candidate

Deliverables:

- Stabilize the four existing views; do not add a fifth view.
- Freeze and document public URLs, stable IDs, export schemas, and the
  canonical authoring layout.
- Pass static and browser accessibility checks across representative desktop
  and mobile viewports, keyboard navigation, modal behavior, and no-JavaScript
  fallbacks.
- Meet the v0.2.2 performance budgets.
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
