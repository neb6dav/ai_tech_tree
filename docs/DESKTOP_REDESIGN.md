# Desktop research workspace

Decision: [RD-018](ROADMAP_DECISIONS.md#rd-018--build-a-desktop-research-workspace-and-preserve-combinatorial-exploration), authorized 2026-09-09.
Discussion history: [ui_discussion.md](../ui_discussion.md).

## Intended result

Help a visitor discover a connection between AI ideas, understand what the map
actually claims, and open its supporting source. Make that first experience
compelling enough to explore while retaining a foundation for research.

The default desktop workspace gives approximately two thirds of its width to
a readable SVG neighborhood and one third to a persistent record/evidence pane.
Search works immediately. Selecting a connection reveals its meaning, sources,
and review state. Learning paths narrate in the pane without covering the map.
The complete graph remains searchable; visible neighborhoods disclose omitted
connections and offer access to the full relationship list.

## Technical choices

- Same repository; replacement on `codex/desktop-research-workspace` in an
  isolated worktree. No framework or backend migration.
- Native HTML/CSS/JavaScript and SVG. Build tooling may bundle local modules;
  there are no external runtime dependencies or background network requests.
- Canonical loader produces the existing machine exports and a separate UI
  projection. Export generation does not execute or parse the old interface.
- One generated `index.html` embeds the UI, data, and a small Dataset description.
  The full JSON-LD export stays available at its existing URL.
- Hash inline scripts and styles during finalization. Validate actual CSP
  coverage rather than requiring a particular number of scripts or style tags.
- Reuse static node pages for readable summaries, sources, connections,
  questions, open directions, citation access, and a basic mobile experience.
- Preserve the public compatibility redirect, record fragments, source IDs,
  dataset identity, Opportunity endpoints, and useful URL intents.

## Evidence and education

The first source-review pilot covers the 22 recorded Transformer connections.
It records narrow claims, primary sources and locators, limitations, and
unresolved broad relationships. A short learning path uses actual canonical
records and edges. It must work with contextual and missing-evidence states,
not just the most strongly supported relationship.

Pilot notes are supplemental, AI-assisted drafts pending curator review. They
do not change the frozen dataset, imply peer review, or establish novelty.
Curator-approved changes can become a separately identified dataset edition.
Sources for two individual ideas do not establish their proposed combination.

## Combinatorial research remains in scope for the roadmap

Preserve the Combinatorial Lens and Hypothesis Workbench roadmap; the redesigned
interface must support future comparison across ideas without replacing the
canonical data model or creating a separate application.

Keep full records and stable IDs independent of rendering and selection. Keep
historical relationships, capabilities, constraints, and proposed combinations
distinct. Generated candidates remain separate from canonical facts. Preserve
Opportunity records and readable access even while replacing its visualization.
Later schema extensions may be needed; no speculative service layer is required
for the current redesign.

## Acceptance and cutover

- All 339 canonical nodes and 711 relationships remain available, with unchanged
  IDs, evidence states, dataset digest, citations, and JSON/JSON-LD/NDJSON bytes.
- Search, node/edge selection, full connection access, learning steps, reading
  pages, Opportunity records, theme, Fit/zoom, sharing, and browser Back work.
- Keyboard interaction and focus are meaningful; dialogs, if used, contain
  focus and close with Escape. Core use works offline with no external requests.
- Check desktop at 1280x720 and 1366x768, both themes, narrow reading fallback,
  reduced motion, and script-disabled access. Rebaseline measured payload and
  DOM ceilings rather than pinning a precise implementation count.
- Keep semantic, security, deterministic-build, and publication checks. Replace
  tests that assert obsolete CSS strings or the internal structure of the old UI.
- Record browser and performance measurements with their environment. Do not
  present a modeled or localhost measurement as live-origin performance.
- Ask unfamiliar readers to explain a connection and open its source within two
  minutes before declaring the HN first impression validated. Automated checks
  cannot perform this independent product assessment.
- Remove the old runtime after the replacement passes technical checks. Public
  promotion follows the repository's protected publication workflow; document
  the exact tested, committed, and published state separately.

Release automation redesign, accounts, shared workspaces, live model generation,
DOI registration, and bulk evidence expansion are not prerequisites for this UI.

## Maintenance boundary

| Component | Candidate treatment |
| --- | --- |
| Canonical atlas, Opportunity corpus, IDs and machine exports | Preserve byte identities and semantic validation. |
| Previous HTML shell and Cosmos/Opportunity renderer bundles | Retire; Git history preserves earlier implementations. |
| Export generator | Read the canonical loader directly; no UI execution in the build path. |
| Security and publication gates | Retain CSP, export parity, malformed-data probes, staging and link checks. |
| Literal tests for retired UI internals | Replace with browser behavior and accessibility checks. |
| Reading pages and compatibility URLs | Regenerate richer pages; retain redirects and data endpoints. |
| Release workflow and dataset citation | Preserve existing authorization guards and dataset identity. |

The original research deck and edition-comparison UI are not carried over as
separate screens. Questions appear in records and reading pages; the immutable
fingerprint data and diff module remain available for later comparison work.
