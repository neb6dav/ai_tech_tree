---
roadmap_version: 1
active_release: "v0.1.1"
active_work_package: "WP-011-B"
issue_url: "https://github.com/neb6dav/ai_tech_tree/issues/6"
pr_url: null
base_sha: "85108c78fa86c86634d4c0944839696369e687cd"
last_completed_checkpoint: "WP-011-B/C1"
last_verified_commands:
  - command: "npm run build"
    status: "PASS"
    runtime: "Node v24.14.1"
    verified_by: "root"
    scope: "WP-011-B/C1 integrated maintained and generated source; 4,519,301-byte initial document"
  - command: "npm test"
    status: "PASS"
    runtime: "Node v24.14.1 and npm 11.11.0"
    verified_by: "root"
    scope: "Core gates, 66 focused unit tests, 13-file staging, artifact budgets, and staged-site contract"
  - command: "npm run test:site-contract"
    status: "PASS"
    runtime: "Node v24.14.1"
    verified_by: "root"
    scope: "1462 internal references and 10 unique staged resources under /ai_tech_tree/"
  - command: "Repeat stage-site and compare release-manifest SHA-256"
    status: "PASS"
    runtime: "Node v24.14.1"
    verified_by: "root"
    scope: "Identical SHA-256 37928762D3716667378A040D57FDF0AEA19D2E3BB340A6DA24D91BF310223635 across repeated C1 stages"
  - command: "Parse workflow YAML and project JSON; node --check new scripts; git diff --check"
    status: "PASS"
    verified_by: "root"
    scope: "WP-011-B/C1 uncommitted worktree"
next_exact_action: >-
  Stage only the named WP-011-B C1 files, commit the compatibility checkpoint,
  verify that exact committed tree in isolation, then push and open its stacked
  draft PR against codex/v0.1.1-stage-site.
known_blockers:
  - "WP-011-B is stacked on verified draft PR #5 until WP-011-A is separately authorized to merge."
  - "No merge, annotated tag, GitHub Release, environment approval, or public deployment is authorized."
  - "Release identity remains 0.1.0 until the dedicated C3 synchronization checkpoint."
  - "Browser performance metrics and automated preview screenshots remain pending WP-012-A."
release_gate_status: "wp_011_b_c1_local_complete_pending_commit"
release_details:
  version: "v0.1.1"
  title: "Publication-contract repair"
  work_package:
    id: "WP-011-B"
    status: "checkpointing"
    base_sha: "85108c78fa86c86634d4c0944839696369e687cd"
    branch: "codex/v0.1.1-publication-release"
    issue:
      status: "open"
      number: 6
      url: "https://github.com/neb6dav/ai_tech_tree/issues/6"
    pull_request:
      status: "pending_first_checkpoint"
      number: null
      url: null
    active_checkpoint:
      id: "C1"
      title: "Stable Opportunity paths and compatibility alias"
      status: "local_complete_pending_commit"
      next_exact_action: >-
        Commit the named compatibility files, verify the exact clean commit in
        isolation, then push and open the stacked draft PR.
    scope:
      - "Publish stable and compatibility Opportunity endpoints."
      - "Move exported human URLs to the root application."
      - "Synchronize v0.1.1 identity and contribution access."
      - "Implement approved annotated-tag promotion and bounded smoke checks."
    out_of_scope:
      - "Broader UI or content changes."
      - "Canonical historical-data migration."
      - "Generated-artifact policy changes."
      - "Performing a merge, tag, release, environment approval, or deployment."
authorization:
  issue_creation: "authorized_and_completed"
  pull_request_creation: "authorized"
  staging: "authorized"
  commit: "authorized"
  push: "authorized"
---

# Release plan

## Active objective

Complete the remaining `v0.1.1` publication URL, identity, and promotion
controls on top of the verified WP-011-A staged-site boundary. Broader
interface, content, and data architecture work starts only after this narrow
repair is released.

## Control-plane foundation

- Record the active release, work package, base revision, authorization state,
  checkpoint, and next action in the ledger above.
- Lock the architectural and release decisions in
  `docs/ROADMAP_DECISIONS.md`.
- Pin local Node selection to the Node 24 CI major with `.nvmrc` and
  `.node-version`.
- Record blocking current-regression guards and nonblocking future targets in
  `performance-budget.json`.

## WP-011-A foundation and active WP-011-B work

- C1 control plane, Node 24 toolchain policy, and blocking artifact budgets:
  implemented and green. Release-manifest reproducibility is scoped to its
  recorded exact Node/npm toolchain.
- C2 versioned staged-site assembler: implemented and green.
- C3 project-subpath publication-contract crawler: implemented and green.
- C4 deterministic payload release manifest: implemented and green.

WP-011-A is complete at verified commit `85108c7` and remote CI run
`32382526539`; its draft PR remains unmerged. Its `C1` records the control plane, locked decisions, toolchain pin, and budget
policy. `C2` adds the deterministic staged-site assembler, strict allowlist,
release manifest, focused tests, and artifact-producing npm toolchain contract.
`C3/C4` add the project-subpath crawler, blocking
artifact-budget enforcement, shared validation/Pages staging, downloadable PR
previews, and final usage documentation. Their static contract resolves 1,812
internal references, fails closed on browser/scanner boundary cases, and labels
two runtime-created fragments as browser-deferred rather than statically
verified. The exact committed tree, push, remote CI, and downloaded preview
artifact have all been verified for WP-011-A.

WP-011-B now owns stable public and compatibility URLs, root export URLs,
release identity, annotated-tag and protected-main verification, production
approval, release assets, and post-deploy checks. Its C1 compatibility changes
pass the complete build and test gate, repeated-stage determinism, and an
independent hostile review. They are ready for the authorized commit and exact
committed-tree verification.

## Release boundary

`v0.1.1` repairs publication only. It does not authorize a new view, broad
content expansion, a canonical-data cutover, a framework or backend migration,
or a change to the committed-generated-output policy.

An issue, pull request, commit, push, tag, and public-root promotion remain
separate authorized actions. Their status must be updated in the ledger when
authorization is granted and the corresponding action actually occurs.
