# Changelog

All notable public changes to the AI Research Tech Tree will be documented here. The project follows semantic versioning for its build and interface, while tagged releases also freeze a citable data edition.

## [Unreleased]

**v1.1.0 Preview checkpoint (not released, tagged, or deployed).** This interface checkpoint adds semantic zoom altitudes, the evidence inspector, a readable linear scale, guided tours and palette controls, relationship pooling, and DOM disposal; it makes no semantic dataset changes.

### Added

- A candidate, display-only inventory of 24 canonical anchor nodes, 72 existing orientation relationships, and six future guided tours. The inventory remains subject to repository-owner review before release.
- A compact mobile start chooser with routes to Transformers, current frontiers, research directions, and the whole map.

### Changed

- Repaired the default desktop landing with an always-visible orientation spine and canonical anchor labels.
- Exposed Timeline, Network, Opportunity, List, Connections, theme, Share, and Help in responsive navigation appropriate to each breakpoint.
- Renamed reader-facing “Links” and “On hover” controls to “Connections” and “Related” while preserving existing `mode=hover` URLs.
- Simplified first-run help, node previews, List cards, Opportunity guidance, and the nonlinear-time explanation without removing methodology or evidence warnings.
- Reused the 72 orientation relationship paths when expanding to All connections, avoiding a duplicate edge layer.

### Verification

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
