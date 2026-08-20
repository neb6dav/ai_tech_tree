---
roadmap_version: 1
active_release: "v0.1.1"
active_work_package: "WP-011-B"
issue_url: "https://github.com/neb6dav/ai_tech_tree/issues/6"
pr_url: "https://github.com/neb6dav/ai_tech_tree/pull/7"
base_sha: "85108c78fa86c86634d4c0944839696369e687cd"
last_completed_checkpoint: "WP-011-B/C4.1"
last_verified_commands:
  - command: "npm run build"
    status: "PASS"
    runtime: "Node v24.14.1"
    verified_by: "root"
    scope: "WP-011-B/C3 deterministic regeneration; 4,516,265-byte initial document and synchronized development identity"
  - command: "npm test"
    status: "PASS"
    runtime: "Node v24.14.1 and npm 11.11.0"
    verified_by: "root"
    scope: "C3 provenance follow-up: core gates, 75 focused unit tests, 14-file staging, Git object-database and input-blob verification, release identity, artifact budgets, and 1,465-reference staged-site contract"
  - command: "Playwright Chromium responsive and no-JavaScript probes"
    status: "PASS"
    runtime: "Chromium through @playwright/cli"
    verified_by: "root"
    scope: "Toolbar geometry at 320/375/740/1366/2300px; named mobile Menu; modal focus and inert recovery; 32x32 repository target; nonoverlapping no-JS cards at 320-740px; zero console errors"
  - command: "Independent hostile C3 identity and runtime reviews"
    status: "PASS after findings resolved"
    verified_by: "root plus two read-only reviewers"
    scope: "Manifest releaseState, pre-release issue wording, recovery ledger, mobile accessible name, pointer target, and no-JS overlap corrected and reprobed"
  - command: "Reconcile downloaded C3 CI preview"
    status: "PASS"
    runtime: "Node v24.14.1"
    verified_by: "root"
    scope: "Workflow 32389661038 green; CI preview contract checked 1,465 references; 14/14 payload files byte-identical to the local C3 stage; manifest identity and provenance fields reconciled"
  - command: "Preserve and verify current-production Pages recovery artifact"
    status: "PASS"
    verified_by: "root"
    scope: "Artifact 9392055435 from run 32328029844 and main commit 76483d2d preserved before expiry; artifact.tar plus seven extracted payloads pass 8/8 recorded SHA-256 checks"
  - command: "AI_TREE_REQUIRE_CLEAN=true npm test"
    status: "PASS"
    runtime: "Node v24.14.1, npm 11.11.0, and Git 2.55"
    verified_by: "root"
    scope: "Exact committed C3-hardening branch head b3bc284 (code f2dc1c6); clean=true, requiredClean=true, object database and repository attributes isolated, 15/15 release inputs matched, manifest SHA-256 1419552975dfbf58215d90905f533769d5cdfae1eee0e9905ba768af2e233831"
  - command: "Reconcile downloaded C3-hardening CI preview"
    status: "PASS"
    runtime: "GitHub Actions Node v24.19.0 and npm 11.17.0"
    verified_by: "root"
    scope: "Workflow 32392413143 green; preview artifact 9415355845 passed 1,465 contract references; 14/14 payloads byte-identical; identity, stage tool, source closure, input-verification digest, file inventory, and data digest matched"
  - command: "npm run build; AI_TREE_REQUIRE_CLEAN=true AI_TREE_STAGE_MODE=preview npm test; git diff --exit-code"
    status: "PASS"
    runtime: "Node v24.14.1, npm 11.11.0, and Git 2.55"
    verified_by: "root"
    scope: "Exact C4.1 code commit 9081520; 128 focused Node tests, core gates, 14-file strict preview stage, 17/17 release inputs, 70 tracked entries, zero clean-filter attributes, artifact budgets, release identity, and 1,465-reference staged-site contract; manifest SHA-256 114f924db63f477e15ffad13e1c0bb6530f1b353bd39eba9d391c675e59fd78d"
  - command: "Independent hostile C4.1 release-provenance reviews"
    status: "PASS after findings resolved"
    verified_by: "root plus three read-only reviewers"
    scope: "Protected policy anchors, Git object and fsck integrity, committed and working-tree filter closure, annotated-tag semantics, strict CFF identity, hidden changelog markers, preview isolation, and build-only Pages hold"
next_exact_action: >-
  Push the exact-clean C4.1 checkpoint, reconcile its downloaded CI preview,
  then implement C4.2 deterministic release archives, standalone checksums,
  release notes, and bounded remote smoke tooling without performing a tag,
  GitHub Release, environment approval, or deployment.
known_blockers:
  - "WP-011-B is stacked on verified draft PR #5 until WP-011-A is separately authorized to merge."
  - "No merge, annotated tag, GitHub Release, environment approval, or public deployment is authorized."
  - "The C3 source must remain visibly labeled as an untagged development edition until C4 prepares an authorized release artifact."
  - "Browser performance metrics and automated preview screenshots remain pending WP-012-A."
  - "The github-pages environment has no required reviewer and permits administrator bypass; immutable GitHub Releases are disabled. These external controls require separate authorization before any C4 promotion run."
release_gate_status: "wp_011_b_c4_1_exact_clean_verified_pending_push"
release_details:
  version: "v0.1.1"
  title: "Publication-contract repair"
  work_package:
    id: "WP-011-B"
    status: "implementing"
    base_sha: "85108c78fa86c86634d4c0944839696369e687cd"
    branch: "codex/v0.1.1-publication-release"
    issue:
      status: "open"
      number: 6
      url: "https://github.com/neb6dav/ai_tech_tree/issues/6"
    pull_request:
      status: "draft"
      number: 7
      url: "https://github.com/neb6dav/ai_tech_tree/pull/7"
    recovery_reference:
      status: "local_verified"
      path: "C:/Projects/Work/ai-research-tech-tree-recovery/production-2026-08-20-76483d2d"
      production_commit: "76483d2d59f52f30202b52fe52a26a7c832a1252"
      artifact_id: 9392055435
      artifact_tar_sha256: "f04f46196b74982f9d725f032278f9b7ed48ae1ffd82db0dcff3fc39f739f9c4"
    active_checkpoint:
      id: "C4.1"
      title: "Explicit release mode and annotated-tag provenance"
      status: "exact_clean_verified_pending_push"
      next_exact_action: >-
        Commit this verification ledger, rerun exact-clean staging from that
        HEAD, push the authorized branch, and reconcile the CI preview before
        beginning C4.2 release-asset tooling.
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
pass the complete build and test gate, exact clean committed-tree verification,
an independent hostile review, remote CI run `32384084390`, and byte-for-byte
payload reconciliation of its downloaded preview.

C2 generates dataset `humanUrl` as `./` and all 339 atlas record URLs as
`./#node=<stable-id>` in JSON, JSON-LD, NDJSON, and embedded JSON-LD. The full
gate, independent hostile review, pushed checkpoint `36b4daa`, remote workflow
`32385263895`, and downloaded preview verify 1,356 root record references,
cross-format ownership, legacy-alias rejection, and misdirection mutations.
All 13 C2 payload files were byte-identical between the local and CI stages;
their manifests differed only by the expected pull-request merge commit.

C3 synchronizes package `0.1.1`, dataset edition
`2026-08-20-public-beta-2`, and `Development edition` across the application,
machine exports, citation metadata, staged release manifest, documentation,
and contribution forms without claiming a tag or release. Persistent
Repository, Contribute, citation, and exact-manifest links now appear in the
toolbar, Guide, and no-JavaScript surface. The staged manifest records the
validated publication state as well as version, edition, commit, and tag. The
final C3 gate passed 72 focused tests, a 14-file stage, artifact budgets, and
1,465 contract references. Real Chromium verified the responsive toolbar,
modal focus/inert behavior, 32-pixel repository target, and nonoverlapping
no-JavaScript cards. Two hostile reviews' P1/P2 findings were corrected and
reprobed. C3 was committed as `53e3a4f`, pushed, and reconciled against green
workflow `32389661038`; all 14 payloads were byte-identical to the local stage
and only the expected pull-request merge commit differed in the manifest.

A late hostile provenance probe showed that Git can read valid compressed
blob bytes stored under the wrong object ID while a clean filter conceals the
worktree difference. The C3 hardening follow-up validates the reachable object
database, recomputes every staged input blob's Git object ID, rejects custom
filters, and records the result in manifest schema/tool `1.3.0`. Its full local
gate passes 75 focused tests, including wrong-object-ID, linked-worktree, and
custom-filter fixtures. The code was committed as `f2dc1c6`; verification
ledger `b3bc284` and its exact clean tree pass the complete gate with 15/15
release inputs matched. Workflow `32392413143` is green, downloaded preview
artifact `9415355845` passes all 1,465 contract references, and all 14 payloads
are byte-identical to the local stage. C3 hardening is remotely complete.

The expiring current-production Pages artifact was preserved read-only at
`C:/Projects/Work/ai-research-tech-tree-recovery/production-2026-08-20-76483d2d`.
Its tar and seven extracted payloads pass all eight recorded SHA-256 checks.
This local pre-repair snapshot provides a recovery reference but does not
authorize or automate rollback.

C4.1 adds a planned, reviewable `v0.1.1` release specification; strict JSON,
CFF, and changelog identity validation; explicit preview and release staging
modes; and an annotated-tag verifier that binds a direct tag object to the
exact `HEAD`, release date, and protected-main ancestry. Preview mode always
emits null tag and promotion fields, and the Pages workflow remains build-only.
Strict staging now rejects repository fsck overrides and committed or
working-tree clean filters across the entire tracked tree, preventing both Git
object suppression and concealed modifications to release tooling. Three
hostile reviews' P1/P2 findings were corrected and reprobed. Code commit
`9081520` passes the complete exact-clean gate with 17/17 inputs, 70 tracked
entries, zero filter attributes, 128 focused Node tests, all core gates,
artifact budgets, synchronized development identity, and 1,465 staged-site
references. Its 14-file preview manifest has SHA-256
`114f924db63f477e15ffad13e1c0bb6530f1b353bd39eba9d391c675e59fd78d`.

## Release boundary

`v0.1.1` repairs publication only. It does not authorize a new view, broad
content expansion, a canonical-data cutover, a framework or backend migration,
or a change to the committed-generated-output policy.

An issue, pull request, commit, push, tag, and public-root promotion remain
separate authorized actions. Their status must be updated in the ledger when
authorization is granted and the corresponding action actually occurs.
