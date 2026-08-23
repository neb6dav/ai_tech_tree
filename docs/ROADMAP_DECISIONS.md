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

Promote the public root only from approved annotated tags on protected `main`.
The authorized manual workflow starts from `main`, checks out the tag, rejects
lightweight or mismatched tags, and stages the tagged commit explicitly. The
first `v1.0.0` deployment may use one direct-child recovery commit on `main`
only when its exact diff is limited to the Pages runner definition, the
release-identity source lock, and this decision record; those files are not
public payload inputs and the annotated tag remains immutable. Pull requests
receive downloadable preview artifacts and there is no public `/dev` lane. The
v0.2.0 Chromium smoke gate verifies
representative desktop, mobile, deep-link, focus, and no-JavaScript behavior.
Screenshots remain optional review artifacts rather than brittle golden-image
assertions.

## RD-007 — Use source checkpoints until v1.0.0

Treat `v0.1.1`, `v0.2.0`, and `v0.2.2` as internal source checkpoints. They
do not require public tags or deployments. `v1.0.0` is the sole public release
target in this sequence. Its annotated tag and deployment were explicitly
authorized on 2026-08-21 after the complete product gate passed.

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

The Windows-only score floor of 48 and TBT ceiling of 250 ms proved too narrow
on the configured Ubuntu runner. Two independent hosted three-run attempts
against the exact same application bytes both produced score medians of 47 and TBT
medians of 362.5 and 362 ms; the six raw samples ranged from score 44 to 48 and
TBT 325 to 440.5 ms, with no audit warnings. The reviewed cross-platform limits
are therefore a score of at least 42, FCP and LCP of at most 27,500 ms, TBT of
at most 550 ms, and CLS of at most 0.02. The score floor remains five points
below the hosted median, and the TBT ceiling rounds to roughly 25% above the
hosted maximum. Paint and CLS limits are unchanged.

These are controlled local-origin regression bounds, not live-user goals. The
normal configured `ubuntu-24.04` gate passed all five revised limits in Actions
run `32489666292`, completing the `v0.2.2` source checkpoint. The workflow label
does not freeze the evolving runner image, and the measurements are not live
GitHub Pages delivery or real-user field performance.

## RD-009 — Freeze the v1 stable release contract

The stable release carries product version `1.0.0`, release state `Stable`,
dataset edition `2026-08-21-stable-1`, and date 2026-08-21. Its authorized
annotated tag and guarded Pages deployment follow RD-006 and RD-007.

The v1 contract freezes the existing root application and compatibility alias,
historical JSON/JSON-LD/NDJSON exports, stable and compatibility Opportunity
data/schema paths, citation, exact-build manifest, social card, robots, and
sitemap paths. It also freezes historical export schema `2`, generator identity
`1.3.1`, dataset and vocabulary IRIs, Opportunity schema `1.0.0` and canonical
schema `$id`, Network layout `network-v1`, and the schema-`1.0.0` 15-lane
canonical authoring layout.

Every existing exported record ID is frozen. The publication-compatibility gate
locks the complete ordered historical identity inventory at
`f5cff253d7a70641cf1f9a9058561f6d69bbae2d365166a7883694b3ef90241a`
and the ordered Opportunity record inventory at
`65afb35bc56b6d771312cc59a2ab3d4a7b48828b54a2262b7efb18d845702b33`,
with the Opportunity map and visual-band IDs asserted explicitly. A future
addition or exceptional identity correction requires compatibility review and
a deliberate baseline update; IDs must not be silently reused or renamed.

Release identity does not change evidence status. The historical review cutoff
remains `2026-08-04`. The diffusion Opportunity map remains an `alpha` dataset
dated `2026-08-19` with import state `imported_unreviewed`. Promoting that state
requires source-by-source human review rather than a version or documentation
change.

## RD-010 — Treat combinatorial exploration as hypothesis assistance

Potential post-v1 editions may help readers combine and compare ideas already
represented in the atlas. They must extend the existing orthogonal relationship
and evidence model rather than create an unsourced parallel authority. In
particular, `proposed_combination`, `hypothesis`, open-direction, constraint,
and Opportunity-card semantics remain visibly distinct from documented
historical relationships and demonstrated capabilities.

A potential `v1.3.0` edition may add a read-only combinatorial lens. It may
surface bounded pairs or triples, shared prerequisites, complementary
capabilities, tensions, blockers, recorded proposals, and dataset-derived
candidates. Every result must retain its exact input record IDs and evidence
status. A generated candidate is at most a dataset-local hypothesis: absence
from the current atlas or source audit is not evidence of real-world novelty.
Derived candidates remain ephemeral or export-only and cannot alter canonical
records, counts, IDs, or review state.

A potential `v1.4.0` edition may add a curator-reviewed hypothesis workbench.
Any candidate considered for canonical Opportunity data must state its proposed
mechanism, source and adjacent-work scope, minimal experiment, baselines,
disconfirming result, blockers, resources, and failure reasons. Human source
review and duplicate/adjacent-work review are mandatory before promotion.
The record must retain its input stable IDs, source edition, derivation origin
(`human`, `rule`, or `model`), and material AI-assistance disclosure. Sources
for the constituent ideas are not evidence for the synthesized combination
unless they explicitly address it. Canonical inclusion records a reviewed
proposal; it does not validate the combination or establish global novelty.
Creating a canonical ID requires RD-009 compatibility review and a deliberate
inventory-baseline update; reviewing one candidate must not upgrade the
surrounding `imported_unreviewed` data.

These editions are roadmap candidates without dates or implementation,
schema-change, tag, or deployment authorization. They require a separate
bounded decision before work begins and must preserve the frozen v1 identities,
URLs, evidence vocabulary, accessibility, publication contracts, and the
separate canonical authority of the historical atlas and Opportunity data.

## RD-011 — Repair orientation before adding new semantic product surface

The approved post-v1 UI program occupies `v1.0.1` through `v1.2.0` and is
implemented as sequential source checkpoints. `v1.0.1` repairs first-minute
readability, `v1.1.0` adds semantic navigation and curated tours, and `v1.2.0`
adds generated researcher pages, edition comparison, and read-only embedding.
The combinatorial candidates therefore move to `v1.3.0` and `v1.4.0`.

The visible overview uses a manually reviewed presentation inventory rather
than an algorithmic importance score. Anchor and spine membership are display
metadata only: they cannot alter canonical node identity, relationship type,
direction, rationale, evidence grade, or review state. Full relationship mode
remains a detail-scale choice because the UI has a separately enforced
8,000-element ceiling and the graph contains many contextual editorial
associations.

The implementation must preserve the v1 URL vocabulary, single-file default
experience, no-JavaScript publication index, committed generated artifacts,
zero external runtime dependencies, and the 339-node/711-relationship semantic
inventory. New URL state is additive. Promotion of any checkpoint remains a
separate merge, tag, and deployment decision after Windows and hosted-Ubuntu
verification.

## RD-012 — Approve the v1.2.0 Stable presentation candidate

On 2026-08-22 the repository owner approved the existing presentation
inventory for the v1.2.0 Stable release candidate: exactly 24 ordered anchors
with their existing label priorities, all 72 existing orientation-spine
relationship IDs, and all six existing tour narratives. This is a
display-membership approval only. It does not change the canonical 339-node,
711-relationship dataset, stable IDs, relationship types, direction,
rationales, evidence grades, or review states.

The two retained legacy supersession links, `word2vec>bert:sup` and
`gan>diffusion:sup`, remain explicitly caveated `legacy_supersession_claim`
records with `legacyKind: sup`, `evidenceGrade: contextual`, and
`reviewed: false`; their rationale continues to state that they are not
established supersession. Presentation approval does not validate either
claim.

The branch and PR prepare a v1.2.0 Stable release candidate only. The public
and live release remains the authorized v1.0.0 release, and `CITATION.cff`
remains byte-for-byte at dataset citation version v1.0.0 because the semantic
edition is unchanged. Merge, annotated tagging, and deployment require
separate authorization after the Windows and hosted-Ubuntu gates pass.

## RD-013 — Approve the v1.2.1 orientation and research-navigation patch

The approved `v1.2.1` program is a presentation-only UI/UX source checkpoint
for orientation and research navigation. It may refine the existing Timeline,
Network, Opportunity, and List surfaces, but it must preserve all 339 canonical
nodes, 711 canonical relationships, stable IDs, canonical evidence and review
state, the v1.0.0 dataset citation, offline/single-file operation, static node
pages, and the `v1.3.0` Combinatorial Lens and `v1.4.0` Hypothesis Workbench
roadmap slots. It does not rebuild the already-reviewed anchors, orientation
spine, semantic zoom, tours, inspector foundation, light-theme edge treatment,
compact onboarding, or edition-diff surfaces.

Startup must keep URL intent, restored camera, and focused target separate. A
camera is restored only from a complete valid `cx`, `cy`, and `z` tuple. Trace,
node, and tour intents frame their target without a camera; filtered intents fit
visible records; empty, partial, legacy, and zero-result states receive a safe
whole-map transform and recovery controls. The header must remain contained at
all specified widths, with measured lower-priority overflow in `More`, 44px
mobile targets, a map-only pinned 48px date ruler (at most 32 deterministic
labels and all 13 eras reachable), and a canonical 15-lane rail that becomes a
compact current-era/current-lane row on mobile. Fit calculations include every
visible shell element, including panels, docks, guides, and embeds.

Timeline and Network share one cycle-safe relationship-neighborhood function
and one pooled SVG path per canonical relationship. The only new URL key is
`trace=<canonical-node-id>`: it implies selection and full lineage, is valid in
Timeline and Network, is ignored in List and Opportunity, and wins over a
conflicting `node`. Existing keys and meanings remain unchanged. A valid camera
overrides trace fitting; general Share preserves trace and camera, while trace
summary Copy link omits the camera. Trace survives semantic zoom, filters, All
mode, detail-panel transitions, and view changes between Timeline and Network;
it is cleared by Opportunity/List. The trace summary reports total, visible,
and filter-hidden node/relationship counts and provides the bounded recovery
actions specified by the interface contract without changing the saved
Connections preference.

The shared context dock may host ordinary previews, trace summaries, and
transient era cards, with a separate polite announcement node. Era selection
is a map-plus-card-strip lens with canonical lane-grouped titles and at most 24
cards per page; cards add no URL state. The existing 74 questions on 71 nodes
become the `view=list&research=questions` “Unfinished Business” deck: segments,
12-card paging, deterministic ordering, canonical-title/question/tag search,
keyboard navigation, and focus restoration are required while retaining the
hash meaning. Non-default status/evidence/research filters expose a reset chip.
Pointer and keyboard relationship-rationale previews must match for all six
canonical evidence grades, while canvas styling alone groups them into the
three approved presentation buckets (9 direct/partial, 658 contextual/
editorial/unassessed, and 44 hypothesis relationships); the canonical grades
remain intact in panels, methodology, exports, fingerprints, and static pages.

The fresh, state-free, non-embed landing may animate only the existing 72 spine
paths and 24 anchors after guide dismissal, with cancellation, Skip animation,
reduced-motion/forced-colors/deep-link/embed bypasses, and no focus theft. The
social card is an owner-reviewed 1200x630 asset under 500KB with the approved
recorded-lineage caveat; root and static-node Open Graph metadata must not
promise fragment-specific trace previews. Headroom work may remove duplicated
no-JavaScript descriptions in favor of existing static-page links and replace
the duplicated runtime release-history array with the maintained changelog
note, without adding dependencies, services, duplicate graphs, or budget.

The implementation checkpoint must verify unchanged IDs/fingerprints and zero
semantic edition diff; Transformer lineage remains exactly 117 nodes and 196
unique relationships in Timeline and Network; pooled All-mode relationships
remain exactly 711 and clearing overview returns exactly 72 spine paths. It
must exercise the complete hash, filter, trace, era, question, responsive,
theme, embed, accessibility, hostile-sequence, DOM, HTML, gzip, and
cross-platform Lighthouse checks in the implementation plan. This branch
starts with this docs-only roadmap/decision checkpoint. A Stable `v1.2.1`
release candidate is prepared after implementation and cross-platform
verification, but merge, annotated tagging, deployment, and any change to the
v1.0.0 citation remain separately unauthorized.

### RD-013 implementation evidence

The implementation checkpoint is complete at exact head
`2bb999e66a132b98dad7fd7df476155f68e57973`, based on `main`/
`f03b9c9851f786b5181e7d18adbb12a548838fbf`. Post-fix Windows verification with
`npm run test:core`, `npm run test:publication`, and `npm run test:browser` passed
the complete release suite and 27/27 browser tests; hosted Ubuntu ran clean
`npm test` at the same exact head and also passed 27/27. The first hosted run
exposed the 1280px boundary overflow and focus-versus-hover relationship
preview race; the final head contains those narrow fixes.

The reviewed active-DOM peak is 7,090 on both Windows and Ubuntu against the
unchanged 8,000 ceiling; the generated HTML is 4,591,976 bytes and gzip is
664,844 bytes. Publication remains 339 nodes, 711 relationships, and 339 node
URLs with zero semantic changes; the semantic digest remains
`865174514ba64e20d6f2a90471a6766b6d5fa18f5b0e62c85d9601de077a50f2`, and all
355 staged release inputs match the exact head while only documentation files
were dirty during the Windows post-fix checks. The artifact SHA-256 is
`41176a71ccf98aec2e5a2464055add425358e9a1436f3b47f40b09e1b282c44a`.

Windows Lighthouse medians are score 52, FCP 23,185.883 ms, LCP 23,391.883
ms, TBT 186 ms, and CLS 0. Hosted Ubuntu Lighthouse medians are score 43, FCP
23,182.7173 ms, LCP 23,403.8253 ms, TBT 479.5 ms, and CLS 0. The hosted result
is [Actions run 32616802586](https://github.com/neb6dav/ai_tech_tree/actions/runs/32616802586),
job 97138752718. The public/live release remains v1.0.0; there is no pull
request, and merge, annotated tagging, deployment, and citation changes remain
separately unauthorized.

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
Windows source calibration plus the two reviewed Ubuntu observations establish
the cross-platform limits recorded in RD-008. Actions run `32489666292`
provided the normal configured `ubuntu-24.04` confirmation.

### Through 1.0

SHACL is deferred through `1.0` unless the roadmap is explicitly re-authorized.

### Post-v1 roadmap candidates

The combinatorial lens and hypothesis workbench described in RD-010 remain
deferred, unimplemented, and unauthorized until separately approved.
