# Changelog

All notable public changes to the AI Research Tech Tree will be documented here. The project follows semantic versioning for its build and interface, while tagged releases also freeze a citable data edition.

## [Unreleased]

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
