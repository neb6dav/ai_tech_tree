---
roadmap_version: 1
active_release: "v0.1.1"
active_work_package: "WP-011-A"
issue_url: "https://github.com/neb6dav/ai_tech_tree/issues/4"
pr_url: null
base_sha: "76483d2d59f52f30202b52fe52a26a7c832a1252"
last_completed_checkpoint: "C1"
last_verified_commands:
  - command: "npm run build"
    status: "PASS"
    runtime: "Node v24.14.1"
    verified_by: "root"
    scope: "WP-011-A integrated maintained and generated source"
  - command: "npm test"
    status: "PASS"
    runtime: "Node v24.14.1 and npm 11.11.0"
    verified_by: "root"
    scope: "Core gates, 16 new unit tests, staging, artifact budgets, and staged-site contract"
  - command: "npm run test:site-contract"
    status: "PASS"
    runtime: "Node v24.14.1"
    verified_by: "root"
    scope: "1737 internal references under /ai_tech_tree/"
  - command: "Repeat stage-site and compare release-manifest SHA-256"
    status: "PASS"
    runtime: "Node v24.14.1"
    verified_by: "root"
    scope: "dc20d0df92591c63a190256b4f9dadbb6ac1220864d93bdf64db9126752ce5fd"
  - command: "Parse workflow YAML and project JSON; node --check new scripts; git diff --check"
    status: "PASS"
    verified_by: "root"
    scope: "WP-011-A uncommitted worktree"
next_exact_action: >-
  Commit the reviewed C2 staged-site assembler and its focused tests, then
  verify that checkpoint from its committed tree before pushing.
known_blockers:
  - "The authorized draft pull request will be created after the first pushed checkpoint."
  - "WP-011-B must synchronize version identity and replace main/manual production deployment with approved annotated-tag promotion before v0.1.1 can ship."
  - "Browser performance metrics and automated preview screenshots remain pending WP-012-A."
release_gate_status: "wp_011_a_c1_checkpoint"
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
      status: "authorized_pending_creation"
      number: null
      url: null
    active_checkpoint:
      id: "C1"
      title: "Control plane and release toolchain"
      status: "complete_in_this_commit"
      next_exact_action: >-
        Commit the reviewed C2 staged-site assembler and focused tests, then
        verify the committed snapshot before the next push.
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

`C1` is the first durable checkpoint: the control plane, locked decisions,
toolchain pin, and current-regression budget policy are committed together.
The remaining locally reviewed implementation is divided into C2 and C3/C4
checkpoint commits so each conceptual boundary remains auditable.

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
