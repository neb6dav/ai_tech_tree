---
roadmap_version: 1
active_release: "v0.1.1"
active_work_package: "WP-011-B"
issue_url: "https://github.com/neb6dav/ai_tech_tree/issues/6"
pr_url: "https://github.com/neb6dav/ai_tech_tree/pull/7"
base_sha: "85108c78fa86c86634d4c0944839696369e687cd"
last_completed_checkpoint: "WP-011-B/C4.3-A"
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
  - command: "Reconcile downloaded C4.1 CI preview"
    status: "PASS"
    runtime: "GitHub Actions Node v24.19.0 and npm 11.17.0"
    verified_by: "root"
    scope: "Workflow 32398059854 green; artifact 9417412872 passed 1,465 contract references; 14/14 payloads byte-identical; CI source closure 17/17 with 70 tracked entries and zero filters; manifests differed only by synthetic checkout commit and Node/npm patch versions"
  - command: "npm run build; AI_TREE_REQUIRE_CLEAN=true AI_TREE_STAGE_MODE=preview AI_TREE_COMMIT_SHA=6566b3a35dce4f32d25a8fb4099b9032a8de20c1 npm test"
    status: "PASS"
    runtime: "Node v24.14.1, npm 11.11.0, and Git 2.55"
    verified_by: "root"
    scope: "Exact detached C4.2-A code commit 6566b3a; 12 candidate-asset tests, 21 release-ref tests, 53 stage-site tests, all core and publication gates, 17/17 inputs, 72 tracked entries, zero filters, and 1,465 staged-site references"
  - command: "Build and independently inspect exact C4.2-A candidate assets"
    status: "PASS"
    verified_by: "root plus independent hostile reviewer"
    scope: "Four commit-named candidate files; 15-entry USTAR; extracted site passes 1,465 references; archive SHA-256 faf694cd7509d53ba60384cca88e7f0b06691a948a70884c2254f56aecf268b4; standalone manifest 75b600a044bb8a25d2543a48216d3b6a284fa7ee7a48ce3db01fadebd6957fc0; no tag, release, deployment, environment, settings, or network mutation performed"
  - command: "Reconcile pushed C4.2-A validation preview"
    status: "PASS"
    verified_by: "root"
    scope: "Workflow 32401757630 green; artifact 9418749682 passed 1,465 contract references; 14/14 payload files byte-identical to the local exact-clean stage; CI and local source closure both 17/17"
  - command: "npm run build; AI_TREE_REQUIRE_CLEAN=true AI_TREE_STAGE_MODE=preview AI_TREE_COMMIT_SHA=9ef84c682d4c3a6652bec2276ec4c29e951e5d64 npm test"
    status: "PASS"
    runtime: "Node v24.14.1, npm 11.11.0, and Git 2.55"
    verified_by: "root"
    scope: "Exact C4.2-B code commit 9ef84c6; 78 synthetic/loopback smoke tests, 12 candidate-asset tests, 21 release-ref tests, 53 stage-site tests, all core and publication gates, 17/17 inputs, 74 tracked entries, zero filters, and 1,465 staged-site references; manifest SHA-256 7643aceb7a59e0efa38fa6cb541039edcf26af0c202fe676f44306976f4a73ba"
  - command: "Independent hostile C4.2-B smoke-verifier review"
    status: "PASS after findings resolved"
    verified_by: "root plus independent read-only reviewer"
    scope: "Full release-identity closure, fixed-origin planning, absolute deadline, drained concurrency, narrow retry policy, honest artifact-bound client-state labels, byte/transfer/path budgets, and zero-production-request boundary returned SHIP"
  - command: "npm run build; AI_TREE_REQUIRE_CLEAN=true AI_TREE_STAGE_MODE=preview AI_TREE_COMMIT_SHA=76ffd097c489dfca5756f4d4f1e6afec3228f014 npm test"
    status: "PASS"
    runtime: "Node v24.14.1, npm 11.11.0, and Git 2.55"
    verified_by: "root"
    scope: "Exact C4.2-C code commit 76ffd09; 32 workflow-policy tests, 78 synthetic/loopback smoke tests, 12 candidate-asset tests, 21 release-ref tests, 53 stage-site tests, all core and publication gates, 17/17 inputs, 75 tracked entries, zero filters, and 1,465 staged-site references"
  - command: "Build and inspect exact C4.2-C candidate through the npm wrapper"
    status: "PASS"
    runtime: "Node v24.14.1 and recorded npm 11.11.0"
    verified_by: "root"
    scope: "Four commit-named candidate files; 15-entry USTAR; archive SHA-256 2a280fb3be45a9086c238d1aeeb10b9d5266c490b140f5652d4818565804a1e3; standalone manifest 27ea685d3b94a973675ac04164c5f41bac1bfec6a50ff3335b9e2675a758d077; strict source closure 17/17 and no external mutation"
  - command: "Independent hostile and cross-platform C4.2-C workflow reviews"
    status: "PASS after findings resolved"
    verified_by: "root plus two independent read-only reviewers"
    scope: "npm provenance, shallow checkout, Windows Git Bash, artifact layout, fail-closed parity, exact PR SHA, validation self-enforcement, condition allowlist, read-only permissions, and Pages deployment hold returned SHIP"
  - command: "Inspect failed Windows candidate job from workflow 32404551506"
    status: "FAIL-CLOSED; root cause corrected"
    verified_by: "root plus two independent path reviewers"
    scope: "Full repository and Ubuntu candidate jobs passed; Windows fixtures rejected hosted os.tmpdir 8.3 alias before asset output; parity and final upload were skipped; production path guard remained unchanged"
  - command: "npm run build; AI_TREE_REQUIRE_CLEAN=true AI_TREE_STAGE_MODE=preview AI_TREE_COMMIT_SHA=8c812dbe57a7bdb359bddb057b5b68c4ec184135 npm test"
    status: "PASS"
    runtime: "Node v24.14.1, npm 11.11.0, and Git 2.55"
    verified_by: "root"
    scope: "Exact Windows-fixture fix commit 8c812db; 13 candidate-asset tests including junction rejection and no-residue closure, all C4.2-C and repository gates, 17/17 inputs, 75 tracked entries, zero filters, and 1,465 staged-site references"
  - command: "Reconcile C4.2-C Windows/Ubuntu parity workflow and downloaded candidates"
    status: "PASS"
    runtime: "GitHub Actions Node v24.19.0 and npm 11.17.0"
    verified_by: "root"
    scope: "Workflow 32405267536; full gate plus Windows, Ubuntu, and parity jobs green; artifacts 9420019751, 9420051460, and 9420059684 have identical four-file contents; 15-entry archive matches the 15-file preview and passes 1,465 references"
  - command: "npm run build plus focused C4.3-A suites"
    status: "PASS"
    runtime: "Node v24.14.1 and npm 11.11.0"
    verified_by: "root"
    scope: "Deterministic build with no generated identity diff; 15 release-asset, 29 finalization-plan, 45 workflow-policy, 56 stage-site, and 80 post-deploy-smoke tests passed"
  - command: "Independent hostile C4.3-A parser, preflight, integration, and full-diff reviews"
    status: "PASS after findings resolved"
    verified_by: "root plus four read-only reviewers"
    scope: "Status-aware release notes, CommonMark section isolation, independent dates, state-aware read-only finalization inventory, exact package-script closure, candidate-only preview boundary, planned/development identity, and authorization wording returned SHIP"
  - command: "Pre-commit npm test"
    status: "EXPECTED FAIL-CLOSED at release-identity only"
    runtime: "Node v24.14.1 and npm 11.11.0"
    verified_by: "root"
    scope: "All preceding core and publication gates passed; release-identity correctly rejected 16/17 commit-bound inputs because package.json is intentionally uncommitted until the checkpoint commit"
  - command: "npm run build; AI_TREE_REQUIRE_CLEAN=true AI_TREE_STAGE_MODE=preview AI_TREE_COMMIT_SHA=ac00753b6724c0ccb85ee01ccdadfbcea3aed64e npm test"
    status: "PASS"
    runtime: "Node v24.14.1, npm 11.11.0, and Git 2.55"
    verified_by: "root"
    scope: "Exact C4.3-A code commit ac00753; core gates and 300 Node tests; planned/development identity; candidate-only ready fixture; 17/17 release inputs; 77 tracked entries; zero filters; manifest SHA-256 48c8e91a88b2087ed3e43b57020aaaa3e30b989106cc34fa8d2f2f919c61fad4; artifact budgets and 1,465 staged-site references"
  - command: "Reconcile C4.3-A Windows/Ubuntu parity workflow and downloaded candidates"
    status: "PASS"
    runtime: "GitHub Actions Node v24.19.0 and npm 11.17.0"
    verified_by: "root"
    scope: "Workflow 32410116422; all four jobs green; artifacts 9421789032, 9421820079, and 9421828420 contain byte-identical four-file candidates; archive SHA-256 5f9c0ad74c2e9462db27082c3218613019d6bd0b9cb1f2938bc22a41e86d6301; standalone manifest e13c0a8bb324bfd744e3632ef92cea6d9bde2fe2d5089cd71583311fc0c907d6; 15/15 archive-to-preview and 14/14 local-to-CI payload parity; downloaded preview passes 1,465 references; PR evidence https://github.com/neb6dav/ai_tech_tree/pull/7#issuecomment-5360868990"
next_exact_action: >-
  Design C4.4 release-mode asset and manual promotion tooling behind the
  existing planned-state and authorization gates; do not apply C4.3-B ready
  identity, create a tag or Release, change settings, deploy, or call production.
known_blockers:
  - "WP-011-B is stacked on verified draft PR #5 until WP-011-A is separately authorized to merge."
  - "No merge, annotated tag, GitHub Release, environment approval, or public deployment is authorized."
  - "The C3 source must remain visibly labeled as an untagged development edition until C4 prepares an authorized release artifact."
  - "Browser performance metrics and automated preview screenshots remain pending WP-012-A."
  - "The github-pages environment has no required reviewer and permits administrator bypass; immutable GitHub Releases are disabled. These external controls require separate authorization before any C4 promotion run."
release_gate_status: "wp_011_b_c4_3_a_remotely_verified_c4_4_ready_to_design"
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
      id: "C4.4"
      title: "Release-mode assets and manual promotion tooling"
      status: "ready_to_design"
      next_exact_action: >-
        Define the fail-closed stable-asset, GitHub Release, Pages promotion,
        rollback, and post-deployment verification boundaries without changing
        the real planned identity or exercising any external mutation.
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
Verification ledger `321215f` passes strict restaging with the same 17/17 and
zero-filter closure; its local manifest has SHA-256
`e17066c1c3aaf915b2c4527e1963f10a67a52c6df501f7ae549eee4a300dd747`.
Workflow `32398059854` is green, downloaded artifact `9417412872` passes all
1,465 contract references, and all 14 payload files are byte-identical to the
local strict stage. After normalizing the expected synthetic checkout commit
and Node/npm patch versions, the local and CI manifests are identical. C4.1 is
remotely complete; C4.2 is the next implementation boundary.

C4.2-A adds a candidate-only asset builder with no stable-release mode or
network client. Exact clean commit `6566b3a` passes the complete gate with
17/17 inputs, 72 tracked entries, zero filters, 12 focused asset tests, and
1,465 staged-site references. Its deterministic four-file candidate set has a
15-entry USTAR archive (SHA-256 `faf694cd7509d53ba60384cca88e7f0b06691a948a70884c2254f56aecf268b4`),
an exact standalone manifest (`75b600a044bb8a25d2543a48216d3b6a284fa7ee7a48ce3db01fadebd6957fc0`),
draft notes (`c37a40bfb20d17206be9e9b675275806da1e0238fe8460a609ad109ab4829338`),
and checksum file (`38e2452aa9b049af6d0f9e251b7edbc40f09d1731566b0c839bd6827c556f85a`).
The extracted archive independently passes all 1,465 contract references.
Hostile findings on Setext headings, Markdown injection, and unverifiable
external-state wording were corrected before the reviewer returned SHIP.
C4.2-A performs and attests no tag, GitHub Release, deployment, environment
approval, settings change, or network request.

The pushed C4.2-A ledger passed workflow `32401757630`; downloaded preview
artifact `9418749682` passes all 1,465 contract references and its 14/14
payloads are byte-identical to the local exact-clean stage. C4.2-B adds a
fixed-origin post-deployment verifier whose default mode produces a plan and
makes zero requests. Its executable mode requires explicit local manifest
bytes, digest, tag, and commit; verifies complete release identity and every
public payload between matching starting and ending manifests; enforces MIME,
URL, transfer, concurrency, and absolute-deadline bounds; and labels fragment
states as artifact-bound rather than browser-verified. Exact clean commit
`9ef84c6` passes 78 synthetic/loopback smoke tests and the complete repository
gate with 17/17 inputs, 74 tracked entries, zero filters, and 1,465 references.
Hostile-review findings on identity drift, late success, detached workers,
retry scope, transfer multiplication, and representative-state overclaim were
corrected before the final SHIP verdict. No public-site request was made.

C4.2-C adds ordinary-pull-request-only Ubuntu and Windows candidate builds at
the exact synthetic merge SHA, one-day parity handoffs, fail-closed checksum
and byte comparison, and a 14-day verified candidate upload. The validation
workflow retains contents-read permissions and cannot receive secrets, OIDC,
an environment, deployment capability, or a production-smoke execution path;
the Pages workflow remains build-only and unchanged. Candidate generation now
runs through an exact npm script so the manifest records the observed npm
version. Exact clean code commit `76ffd09` passes the complete gate with 17/17
inputs, 75 tracked entries, zero filters, 32 workflow-policy tests,
and 1,465 references. Its local four-file candidate records Node v24.14.1 and
npm 11.11.0; the archive SHA-256 is
`2a280fb3be45a9086c238d1aeeb10b9d5266c490b140f5652d4818565804a1e3`
and the standalone manifest SHA-256 is
`27ea685d3b94a973675ac04164c5f41bac1bfec6a50ff3335b9e2675a758d077`.
Two independent reviews returned SHIP after npm-null provenance and
workflow-policy fail-open findings were corrected. Those local reviews did not
by themselves complete C4.2-C; hosted Windows/Ubuntu parity and downloaded
artifact reconciliation were still required. No tag, release, environment,
deployment, settings mutation, production request, or Pages workflow
promotion occurred.

The first pushed C4.2-C attempt, workflow `32404551506`, passed the full
repository gate and Ubuntu candidate job but failed closed in the Windows
candidate fixture suite before producing its handoff; the parity job and final
upload were therefore skipped. GitHub-hosted Windows exposed `os.tmpdir()`
through an 8.3 alias, which the production canonical-output-parent guard
correctly rejected. Follow-up `8c812db` canonicalizes only the disposable test
fixture parent and adds a real junction rejection with no-residue assertion;
it does not relax production path validation. Two path reviews approved the
narrow fix, and its exact clean tree passes 13/13 candidate-asset tests plus
the complete repository gate. A successful second hosted-Windows run remains
required.

The second attempt, workflow `32405267536` at branch commit `c199662` and
synthetic merge commit `270c6d0`, is green across the full repository,
Windows candidate, Ubuntu candidate, and byte-parity jobs. The downloaded
one-day Ubuntu artifact `9420019751`, one-day Windows artifact `9420051460`,
and 14-day verified artifact `9420059684` contain exactly the same four files.
Their verified inner SHA-256 values are
`f22e55c80e39be4e4ce59ece95448021d8aab3bca438557c2ecad824b144a4e0`
for notes,
`f5f1924af3cecf933bd513a42f0eabfabf267bdad648019a85ac75b66227da0e`
for the standalone manifest,
`10b9e3d9957a3adee014d19726f5f122d61625a998d4e189498247c6b05c5ef6`
for `SHA256SUMS`, and
`f10ca8b7d0201fa927b819821b31a98fce4139dfdee524dc28e8cda93c0af06a`
for the USTAR archive. The candidate and staged-preview manifest bytes are
identical and record Node v24.19.0, npm 11.17.0, preview mode, null tag and
promotion, clean required source, 17/17 inputs, 75 tracked entries, and zero
filters. The 15-entry archive is byte-identical to all 15 preview files and
passes the complete 1,465-reference site contract. C4.2 is remotely complete.
No production or control-plane mutation occurred.

## Release boundary

`v0.1.1` repairs publication only. It does not authorize a new view, broad
content expansion, a canonical-data cutover, a framework or backend migration,
or a change to the committed-generated-output policy.

An issue, pull request, commit, push, tag, and public-root promotion remain
separate authorized actions. Their status must be updated in the ledger when
authorization is granted and the corresponding action actually occurs.
