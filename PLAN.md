---
roadmap_version: 1
active_release: "v0.1.1"
active_work_package: "WP-011-A"
issue_url: "https://github.com/neb6dav/ai_tech_tree/issues/4"
pr_url: "https://github.com/neb6dav/ai_tech_tree/pull/5"
base_sha: "76483d2d59f52f30202b52fe52a26a7c832a1252"
last_completed_checkpoint: "C4"
last_verified_commands:
  - command: "npm run build"
    status: "PASS"
    runtime: "Node v24.14.1"
    verified_by: "root"
    scope: "WP-011-A integrated maintained and generated source; 4,519,305-byte initial document"
  - command: "npm test"
    status: "PASS"
    runtime: "Node v24.14.1 and npm 11.11.0"
    verified_by: "root"
    scope: "Core gates, 59 focused unit tests, staging, artifact budgets, and staged-site contract"
  - command: "npm run test:site-contract"
    status: "PASS"
    runtime: "Node v24.14.1"
    verified_by: "root"
    scope: "1812 internal references under /ai_tech_tree/, including 75 JSON Schema references and 2 browser-deferred runtime fragments"
  - command: "Repeat stage-site and compare release-manifest SHA-256"
    status: "PASS"
    runtime: "Node v24.14.1"
    verified_by: "root"
    scope: "Identical manifest SHA-256 across repeated stages from the same unchanged input state and toolchain"
  - command: "Parse workflow YAML and project JSON; node --check new scripts; git diff --check"
    status: "PASS"
    verified_by: "root"
    scope: "WP-011-A uncommitted worktree"
next_exact_action: >-
  Commit the named C3/C4 files, verify that exact committed tree in an isolated
  worktree, push the authorized checkpoint, and confirm the draft PR checks.
known_blockers:
  - "Production Pages promotion is intentionally held at a reusable-only workflow until WP-011-B installs approved annotated-tag promotion."
  - "WP-011-B must synchronize version identity and replace main/manual production deployment with approved annotated-tag promotion before v0.1.1 can ship."
  - "Browser performance metrics and automated preview screenshots remain pending WP-012-A."
release_gate_status: "wp_011_a_c4_local_complete_pending_commit_and_remote_ci"
release_details:
  version: "v0.1.1"
  title: "Publication-contract repair"
  work_package:
    id: "WP-011-A"
    status: "checkpointing"
    base_sha: "76483d2d59f52f30202b52fe52a26a7c832a1252"
    branch: "codex/v0.1.1-stage-site"
    issue:
      status: "open"
      number: 4
      url: "https://github.com/neb6dav/ai_tech_tree/issues/4"
    pull_request:
      status: "draft"
      number: 5
      url: "https://github.com/neb6dav/ai_tech_tree/pull/5"
    active_checkpoint:
      id: "C4"
      title: "Staged-site contract, budgets, and workflow integration"
      status: "local_complete_pending_commit"
      next_exact_action: >-
        Commit the named files, verify the exact committed tree in isolation,
        then push and confirm the draft PR checks.
    scope:
      - "Repair the broken public-site publication contract before broader UI or content work."
      - "Make the deployable site an explicit, validated artifact."
      - "Preserve current public behavior and committed generated artifacts."
    out_of_scope:
      - "Broader UI or content changes."
      - "Canonical historical-data migration."
      - "Generated-artifact policy changes."
authorization:
  issue_creation: "authorized_and_completed"
  pull_request_creation: "authorized"
  staging: "authorized"
  commit: "authorized"
  push: "authorized"
---

# Release plan

## Active objective

Ship `v0.1.1` as a narrowly scoped repair of the public publication contract.
The release must establish an explicit, reproducible staged-site boundary and
verify every public path before promotion. Broader interface, content, and data
architecture work starts only after this repair is released.

## C1 deliverables

- Record the active release, work package, base revision, authorization state,
  checkpoint, and next action in the ledger above.
- Lock the architectural and release decisions in
  `docs/ROADMAP_DECISIONS.md`.
- Pin local Node selection to the Node 24 CI major with `.nvmrc` and
  `.node-version`.
- Record blocking current-regression guards and nonblocking future targets in
  `performance-budget.json`.

## Local WP-011-A verification

- C1 control plane, Node 24 toolchain policy, and blocking artifact budgets:
  implemented and green. Release-manifest reproducibility is scoped to its
  recorded exact Node/npm toolchain.
- C2 versioned staged-site assembler: implemented and green.
- C3 project-subpath publication-contract crawler: implemented and green.
- C4 deterministic payload release manifest: implemented and green.

`C1` records the control plane, locked decisions, toolchain pin, and budget
policy. `C2` adds the deterministic staged-site assembler, strict allowlist,
release manifest, focused tests, and artifact-producing npm toolchain contract.
`C3/C4` are locally complete. They add the project-subpath crawler, blocking
artifact-budget enforcement, shared validation/Pages staging, downloadable PR
previews, and final usage documentation. Their static contract resolves 1,812
internal references, fails closed on browser/scanner boundary cases, and labels
two runtime-created fragments as browser-deferred rather than statically
verified. This checkpoint becomes durable only after the named commit, isolated
committed-tree verification, authorized push, and remote CI confirmation.

This work package is not a shippable `v0.1.1` release by itself. `WP-011-B`
remains responsible for release identity, annotated-tag and protected-main
verification, production approval, release assets, and post-deploy checks.

## Release boundary

`v0.1.1` repairs publication only. It does not authorize a new view, broad
content expansion, a canonical-data cutover, a framework or backend migration,
or a change to the committed-generated-output policy.

An issue, pull request, commit, push, tag, and public-root promotion remain
separate authorized actions. Their status must be updated in the ledger when
authorization is granted and the corresponding action actually occurs.
