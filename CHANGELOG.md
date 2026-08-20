# Changelog

All notable public changes to the AI Research Tech Tree will be documented here. The project follows semantic versioning for its build and interface, while tagged releases also freeze a citable data edition.

## [Unreleased]

**Target: v0.1.1 development edition.** This section describes an untagged release candidate. It does not claim that `v0.1.1` has been tagged, released, or deployed.

### Added

- A bounded diffusion-models Opportunity View for tracing capabilities, refinements, applications, constraints, competing approaches, and testable research opportunities.
- A separately maintained Opportunity-map schema, source dataset, validation gate, deterministic renderer, structured outline, and typed cross-links to Timeline and Network records.
- Persistent interpretation guidance stating that paths have uniform, non-quantitative width and that hypothetical or incomplete evidence uses distinct styling.
- A versioned staged-site manifest with exact source provenance, payload media types, byte lengths, and SHA-256 checksums.
- Stable Opportunity data and schema URLs plus compatibility endpoints for previously advertised paths.
- A visible development-edition label linked to the exact staged build manifest, with persistent repository and contribution destinations.

### Changed

- Extended the deterministic build, Content Security Policy hashes, release checks, accessibility checks, and contribution guidance to cover the Opportunity View.
- Moved exported atlas record URLs to the root application while retaining the former HTML filename as a state-preserving compatibility entry point.
- Synchronized the v0.1.1 development identity across the package, application, datasets, citation metadata, changelog, sitemap, and staged manifest.

### Known limitations

- The diffusion-models map is an alpha literature import. Its `importStatus` records whether source-by-source human validation is still outstanding.
- Opportunity status is branch- and context-specific; the view does not measure total remaining research value or establish that a technology is globally exhausted.

### Planned

- Continue node-level and relationship-level evidence review.
- Move atlas records from the beta's embedded application source into smaller, diff-friendly canonical data files.
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

[Unreleased]: https://github.com/neb6dav/ai_tech_tree/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/neb6dav/ai_tech_tree/releases/tag/v0.1.0
