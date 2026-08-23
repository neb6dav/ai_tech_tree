# Changelog

All notable public changes to the AI Research Tech Tree will be documented here. The project follows semantic versioning for its build and interface, while tagged releases also freeze a citable data edition.

## [Unreleased]

### v1.2.1 Stable release candidate

**Stable candidate complete and cross-platform verified; not merged, tagged, or deployed.** The exact implementation head is `2bb999e66a132b98dad7fd7df476155f68e57973`. Windows and hosted Ubuntu both pass the complete 27/27 browser suite and all release gates. The public/live release remains v1.0.0, `main` remains the merged v1.2.0 source checkpoint, and there is no pull request. Owner review and separate authorization are still required for promotion.

#### Added

- A v1.2.1 presentation-only candidate that preserves 339 nodes, 711 relationships, stable IDs, the v1.0.0 dataset citation, and the 2026-08-21-stable-1 edition.
- Readable lineage tracing, pinned date and lane orientation, transient era cards, and the 74-question Unfinished Business deck without adding semantic records.

#### Verification evidence

- Active-DOM peak is 7,090 on both Windows and hosted Ubuntu against the unchanged 8,000 ceiling; the built HTML is 4,591,976 bytes and gzip is 664,844 bytes. All generated files are committed at the exact candidate head.
- The semantic digest remains `865174514ba64e20d6f2a90471a6766b6d5fa18f5b0e62c85d9601de077a50f2`; publication remains 339 nodes, 711 relationships, 339 node URLs, and zero semantic changes. The clean manifest matches the exact head across 355 inputs.
- Windows Lighthouse medians are score 52, FCP 23,185.883 ms, LCP 23,391.883 ms, TBT 186 ms, and CLS 0. Hosted Ubuntu Lighthouse medians are score 43, FCP 23,182.7173 ms, LCP 23,403.8253 ms, TBT 479.5 ms, and CLS 0. The hosted verification is recorded in [Actions run 32616802586](https://github.com/neb6dav/ai_tech_tree/actions/runs/32616802586), job 97138752718.

### v1.2.0 Stable source checkpoint

**Merged to `main`; not tagged or deployed.** This researcher-delivery checkpoint generates 339 static node pages, sitemap discovery, a semantic edition diff, and a read-only embed while preserving the canonical dataset identity. The public/live release remains v1.0.0 and the dataset citation remains v1.0.0. Pages is configured to require the exact annotated v1.2.0 tag, but that tag has not been created and the workflow has not been run.

#### Added

- One static, source-backed page for each of the 339 canonical nodes, with crawlable metadata and citation conveniences.
- Sitemap entries for the node pages and a read-only same-origin edition comparison and embed surface.
- Repository-owner approval of the exact 24-anchor, 72-relationship orientation inventory and all six tour narratives. The two legacy supersession links remain explicitly contextual, unreviewed, and not established by this display approval.

### v1.1.0 Preview checkpoint

**Not released, tagged, or deployed.** This interface checkpoint adds semantic zoom altitudes, the evidence inspector, a readable linear scale, guided tours and palette controls, relationship pooling, and DOM disposal; it makes no semantic dataset changes.

#### Added

- A display-only inventory of 24 canonical anchor nodes, 72 existing orientation relationships, and six guided tours. Membership does not alter canonical relationship type, direction, rationale, evidence grade, or review state.
- A compact mobile start chooser with routes to Transformers, current frontiers, research directions, and the whole map.

#### Changed

- Repaired the default desktop landing with an always-visible orientation spine and canonical anchor labels.
- Exposed Timeline, Network, Opportunity, List, Connections, theme, Share, and Help in responsive navigation appropriate to each breakpoint.
- Renamed reader-facing “Links” and “On hover” controls to “Connections” and “Related” while preserving existing `mode=hover` URLs.
- Simplified first-run help, node previews, List cards, Opportunity guidance, and the nonlinear-time explanation without removing methodology or evidence warnings.
- Reused the 72 orientation relationship paths when expanding to All connections, avoiding a duplicate edge layer.

#### Verification

- Preserved 339 canonical nodes, 711 canonical relationships, stable IDs, the no-JavaScript index, and the single-file offline runtime.
- Kept active relationship and orientation-spine contrast above 3:1 in dark and light themes without adding universal arrowheads.

## [1.0.0] - 2026-08-21

**Stable release.** This release publishes dataset edition `2026-08-21-stable-1` from the authorized annotated `v1.0.0` tag.

### Added

- A bounded diffusion-models Opportunity View for tracing capabilities, refinements, applications, constraints, competing approaches, and testable research opportunities.
- A separately maintained Opportunity-map schema, source dataset, validation gate, deterministic renderer, structured outline, and typed cross-links to Timeline and Network records.
- Persistent interpretation guidance stating that paths have uniform, non-quantitative width and that hypothetical or incomplete evidence uses distinct styling.
- A versioned staged-site manifest with exact source provenance, payload media types, byte lengths, and SHA-256 checksums.
- Stable Opportunity data and schema URLs plus compatibility endpoints for previously advertised paths.
- A visible Stable v1.0.0 label linked to the exact staged build manifest, with persistent repository and contribution destinations.

### Changed

- Extended the deterministic build, Content Security Policy hashes, release checks, accessibility checks, and contribution guidance to cover the Opportunity View.
- Moved exported atlas record URLs to the root application while retaining the former HTML filename as a state-preserving compatibility entry point.
- Synchronized the v1.0.0 Stable identity across the package, application, datasets, citation metadata, changelog, sitemap, and tagged staged manifest.

### Known limitations

- The diffusion-models map is an alpha literature import. Its `importStatus` records whether source-by-source human validation is still outstanding.
- Opportunity status is branch- and context-specific; the view does not measure total remaining research value or establish that a technology is globally exhausted.

### Planned

- Continue node-level and relationship-level evidence review.
- Continue maintaining atlas records in the smaller, diff-friendly canonical data files introduced before v1.0.0.
- Archive a tagged research release and add its DOI to `CITATION.cff` when available.

## [0.1.0] - 2026-08-13

**Public beta**

### Added

- Chronological Timeline, structural 2-D Network, and accessible List views.
- Locally bundled MIT-licensed `@cosmos.gl/graph` renderer with a deterministic, versioned network layout.
- Synchronized selection, search, filtering, theme, and record details across views.
- Machine-readable JSON, JSON-LD, and NDJSON knowledge-graph exports.
- Wikipedia revision, arXiv, landmark-work, and relationship audit metadata carried by the atlas records.
- Public methodology, contribution process, conduct policy, citation metadata, dual-license notices, issue forms, pull-request template, code ownership, and validation workflow.

### Changed

- Labeled the artifact as a living public-beta research atlas and made evidence limitations explicit.
- Added a persistent warning that network proximity and centrality do not establish chronology, importance, similarity, consensus, or causality.
- Established reproducible generated-artifact boundaries and continuous-integration checks.

### Known limitations

- Many relationships are editorial associations or remain individually unassessed.
- Node-level review does not imply that every connected edge has been reviewed.
- The public-beta canonical atlas records remain embedded in the application source, so some content diffs are larger than the intended long-term source layout.
- The 2-D WebGL network view requires browser graphics support; Timeline and List remain the fallback views.

[Unreleased]: https://github.com/neb6dav/ai_tech_tree/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/neb6dav/ai_tech_tree/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/neb6dav/ai_tech_tree/releases/tag/v0.1.0
