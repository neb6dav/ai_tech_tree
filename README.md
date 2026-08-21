# AI Research Tech Tree

The AI Research Tech Tree is a public, evidence-linked atlas of artificial-intelligence research developments, open directions, landmark works, and recorded relationships. It combines a chronological Timeline, a structural Network, a capability-oriented Opportunity View, and an accessible List.

**Release channel: `v1.0.0` stable source candidate.** The candidate carries release state `Stable` and dataset edition `2026-08-21-stable-1`, dated 2026-08-21. `Stable` is the artifact and data identity of the final pre-tag source bytes; it does not attest an annotated tag, deployment, or public promotion. Those remain separate explicit actions, so an untagged source build or pull-request preview is not a citable release. Each staged preview records its exact commit, tag state, and checksums in `release-manifest.json`. The atlas remains a curated research aid, not a complete literature review, a peer-reviewed historical account, or a claim that every displayed relationship is causal. Records expose their available sources and review state so that gaps can be inspected and improved in public.

The bounded `v0.1.1`, `v0.2.0`, and `v0.2.2` source checkpoints are preserved
in [`PLAN.md`](PLAN.md). The `v1.0.0` source candidate freezes the public
contract described below; it does not authorize its own tag or deployment.

- Public site: <https://neb6dav.github.io/ai_tech_tree/>
- Repository: <https://github.com/neb6dav/ai_tech_tree>
- Maintainer: [@neb6dav](https://github.com/neb6dav)
- Corrections and additions: [open a structured issue](https://github.com/neb6dav/ai_tech_tree/issues/new/choose) or submit a pull request

## What the views mean

- **Timeline** emphasizes chronology and research branches.
- **Network** reveals the structure of recorded associations, including hubs, bridges, leaves, and cross-branch links.
- **Opportunity** follows one historical development into documented capabilities, refinements, applications, constraints, competing approaches, and explicitly hypothesis-grade research opportunities. The first bounded map covers diffusion models.
- **List** provides a searchable, keyboard-friendly representation of the complete filtered result set.

Network positions are computed from recorded associations. Visual proximity, centrality, cluster membership, and node position do **not** by themselves establish chronology, importance, similarity, consensus, intellectual influence, or causality. Consult each record and relationship's evidence and review state.

The Opportunity View is a separate, time-oriented capability graph rather than a restyling of the historical atlas. Its paths use a uniform width: width does not encode volume, importance, value, certainty, or remaining opportunity. Solid, dashed, and colored paths communicate declared relationship and evidence categories. Opportunity status is local to the named branch and context; the project does not claim that a technology is globally “fully exploited.” Typed cross-links connect records back to their corresponding Timeline and Network entries.

The current diffusion alpha has an auditable boundary: 60 nodes, 94 relationships (93 report rows plus one explicitly contextual editorial connectivity edge), 78 source URLs, eight branches, eight constraints, eight hypothesis cards, and nine unresolved claims. It remains `imported_unreviewed` pending source-by-source human review.

## Evidence vocabulary

The atlas deliberately separates a relationship from the strength of the evidence attached to it. Current records may use states such as:

- **Direct**: a source explicitly supports the stated relationship.
- **Partial**: a source supports part, but not all, of the stated relationship.
- **Contextual or indirect**: sources support the surrounding history but do not explicitly establish the edge.
- **Editorial association**: a curator-added connection useful for navigation or interpretation; it is not presented as a proven causal lineage.
- **Unassessed**: the record or edge has not yet received the indicated review.
- **Hypothesis**: a deliberately speculative research connection or open direction.
- **No source found in the current audit**: the review did not locate supporting evidence in its stated source set. This is not proof that the claim is false.

See [METHODOLOGY.md](METHODOLOGY.md) for the inclusion, sourcing, relationship, and review rules.

## Repository map

The `v1.0.0` source candidate keeps a single-file application shell while the historical atlas is authored in a strict 15-lane canonical dataset. The build projects that canonical data into the application and the machine-readable publication artifacts.

### Maintained source

- `ai-research-tech-tree.html` — maintained application shell; its embedded historical-atlas projections are generated from the canonical atlas and are not a second authoring source
- `src/data/atlas/manifest.json`, `catalog.json`, sidecars, and the `nodes/` and `relationships/` lane shards — canonical historical-atlas authoring source
- `canonical-atlas.js` — strict built-in loader and assembler for the canonical atlas
- `src/compatibility/ai-research-tech-tree.html` — state-preserving public compatibility redirect to the root application
- `src/network-view.js` — 2-D WebGL network-view source
- `src/opportunity-view.js` and `src/opportunity-layout.cjs` — accessible Opportunity View renderer and deterministic layout logic
- `src/data/opportunities/diffusion-models.alpha.json` — maintained diffusion-models Opportunity map, published canonically at `data/opportunities/diffusion-models.alpha.json`
- `src/data/opportunities/opportunity-map.schema.json` and `validate-opportunity-data.js` — canonical schema and evidence-aware validation rules, published at `data/opportunities/opportunity-map.schema.json`
- `src/compatibility/opportunity-map.schema.json` — delegating schema retained at the former public `src/data/...` URL
- `generate-knowledge-graph.js` — canonical-data projector and machine-readable graph exporter
- build, layout, and injection scripts — deterministic generation of the network layout and deployable page
- `release-gate.js`, `ui-layout-gate.js`, `accessibility-gate.js`, `network-gate.js`, and `opportunity-gate.js` — validation gates
- publication, methodology, governance, and contribution files in the repository root and `.github/`

### Generated files; do not edit directly

- `index.html` — GitHub Pages entry point
- `network-atlas.bundle.js` — locally bundled `@cosmos.gl/graph` network renderer
- `opportunity-atlas.bundle.js` — locally bundled Opportunity View renderer
- `network-layout-v1.json` — deterministic, versioned network coordinates
- `ai-research-tech-tree.json`
- `ai-research-tech-tree.jsonld`
- `ai-research-tech-tree.ndjson`

The JSON, JSON-LD, and NDJSON exports currently describe the historical atlas. Their dataset human URL resolves to `./`, and each of the 339 atlas records resolves directly to `./#node=<stable-id>`; the former published HTML filename remains only a compatibility entry point. The Opportunity map remains a separate, schema-linked JSON graph and is advertised from the page as an alternate machine-readable representation; this prevents capability assessments and hypotheses from being silently recast as historical lineage.

`ai-research-tech-tree.original.html` is an archival pre-repair baseline retained for provenance. It is not the current application source.

Generated artifacts remain committed through `v1.0.0` so releases can be inspected, downloaded, and served without a build service. Change maintained source, run the build, inspect the resulting diff, and commit the regenerated artifacts with the source change.

## v1 public contract

The stable source identity is version `1.0.0`, release state `Stable`, edition
`2026-08-21-stable-1`, dated 2026-08-21. This is artifact and data identity,
not evidence of a tag or deployment. The historical-atlas review cutoff
remains `2026-08-04`; the edition date does not imply that every historical
record was re-reviewed on 2026-08-21. The diffusion Opportunity map remains an
`alpha` dataset dated `2026-08-19` with import state `imported_unreviewed`.
Stable application code therefore does not imply publication-level validation
of that separate map.

The following publication paths are stable:

- `/` for the application;
- `/ai-research-tech-tree.html` as the state-preserving compatibility alias;
- `/ai-research-tech-tree.json`, `/ai-research-tech-tree.jsonld`, and
  `/ai-research-tech-tree.ndjson` for the historical exports;
- `/data/opportunities/diffusion-models.alpha.json` and
  `/data/opportunities/opportunity-map.schema.json` for the Opportunity map;
- `/src/data/opportunities/diffusion-models.alpha.json` and
  `/src/data/opportunities/opportunity-map.schema.json` as compatibility paths;
- `/CITATION.cff`, `/release-manifest.json`, `/social-card.png`, `/robots.txt`,
  and `/sitemap.xml` for publication support.

The historical export keeps schema version `2`, generator version `1.3.1`,
dataset IRI `urn:uuid:7d0547f2-6239-5a56-82a3-1c846701c866`, and the matching
`#vocab-` vocabulary IRI. The Opportunity map and its canonical schema remain
at schema version `1.0.0`; the schema `$id` is
`https://neb6dav.github.io/ai_tech_tree/data/opportunities/opportunity-map.schema.json`.
The deterministic Network coordinates retain schema `1.0.0`, layout
`network-v1`, algorithm `deterministic-lane-force-v1`, and seed
`ai-research-tech-tree-network-v1`.

Every existing exported record ID is frozen at the v1 candidate baseline,
including historical lanes, classifications, nodes, relationships, evidence
assessments, papers and links, landmark works and links, and Wikipedia sources,
plus Opportunity records and its map and visual-band IDs. The ordered identity
inventories are locked by SHA-256 in the publication-compatibility test:

- historical export: `f5cff253d7a70641cf1f9a9058561f6d69bbae2d365166a7883694b3ef90241a`;
- Opportunity records: `65afb35bc56b6d771312cc59a2ab3d4a7b48828b54a2262b7efb18d845702b33`.

Correcting prose, evidence, dates, or relationships must not silently rename an
existing record. Any exceptional identity correction or future inventory
addition requires explicit compatibility review and a deliberate update to the
locked baseline.

Canonical historical authoring uses schema `1.0.0` and the fixed lane order
`roots`, `symbolic`, `search`, `rl`, `neural`, `training`, `language`, `vision`,
`generative`, `prob`, `alt`, `robotics`, `safety`, `systems`, `science`. Nodes
live in `src/data/atlas/nodes/<lane>.json`; relationships live in
`src/data/atlas/relationships/<target-lane>.json`; `manifest.json` fixes those
paths and the six approved sidecars. Embedded HTML records and machine-readable
exports are projections, not alternate authoring sources.

## Build and validate

The repository declares Node.js 24.x and npm 11.x as its artifact-producing toolchain families. Those declarations do not freeze a Node or npm patch release, and the `ubuntu-24.04` Actions label does not make the evolving hosted runner image immutable. Calibration and validation reports therefore record the exact observed runtime and browser versions. Reproduce the checked-in artifacts with:

```text
npm ci
npx playwright install chromium
npm run build
npm test
git diff --exit-code
```

`npm test` runs the data, accessibility, layout, Network, Opportunity, canonical-data, staging, contract, and deterministic artifact-budget gates; assembles `_site`; and exercises all four views in headless Chromium at desktop and mobile sizes. The browser gate blocks external requests, console errors and warnings, missing runtime fragments, broken deep links or focus restoration, and active-DOM drift from the reviewed platform peaks (`7,724` on Windows and `7,728` on Linux, reflecting platform font metrics) as well as any breach of the unchanged `8,000` ceiling.

At the `v0.2.2` checkpoint, Lighthouse is a blocking regression signal against the staged application on a controlled, uncompressed, `no-store` local origin. The source calibration used five independent mobile-profile runs on Windows x64 with Node.js v24.14.1, Lighthouse 13.4.1, Playwright 1.62.1, and Playwright Chromium 151.0.7922.34 revision 1234. Each gate uses the independent median of three runs.

| Metric | Five-run Windows median | Blocking limit | Local three-run gate |
| --- | ---: | ---: | ---: |
| Performance score | 53 | at least 42 | 50 |
| First Contentful Paint | 22,728.84345 ms | at most 27,500 ms | 22,734.979 ms |
| Largest Contentful Paint | 22,900.34345 ms | at most 27,500 ms | 22,893.525 ms |
| Total Blocking Time | 166 ms | at most 550 ms | 248 ms |
| Cumulative Layout Shift | 0.00082719 | at most 0.02 | 0.00082719 |

The original Windows-only score and TBT limits proved too narrow on the configured Ubuntu runner. Two independent hosted attempts against the exact same application bytes both produced score medians of `47`, with TBT medians of `362.5` and `362` ms; the six raw samples ranged from score `44` to `48` and TBT `325` to `440.5` ms, with no audit warnings. The cross-platform score floor is therefore five points below the hosted median, while the TBT ceiling rounds to about 25% above the hosted maximum. The paint ceilings and CLS ceiling are unchanged. The normal hosted gate then passed all five revised limits on `ubuntu-24.04` in Actions run `32489666292`, completing the `v0.2.2` source checkpoint. These measurements do not represent live GitHub Pages delivery or real-user field performance.

The release manifest records the target package version, dataset edition, publication state, exact full commit, observed Node and npm versions, and every payload file's media type, byte count, and SHA-256. In clean-source mode, staging also proves that the configuration, metadata, individual artifacts, and complete directory inputs are regular committed blobs from the advertised `HEAD`; symlinks, gitlinks, Git LFS pointers, replacement objects, index concealment flags, dirty submodules, and generated or Git-administration input paths fail closed. The manifest cannot contain its own digest without a cryptographic self-reference, so it explicitly excludes itself. Local dirty-tree staging remains available for pre-commit review but is labeled non-clean and cannot be deployed.

The static contract uses a pinned browser-compatible HTML attribute decoder, rejects nested `iframe[srcdoc]` browsing contexts, validates live-document fragments without treating inert `<template>` contents as targets, and checks JSON Schema reference closure and application-state ID uniqueness. Runtime-created fragments are verified by the Chromium smoke gate. Nested JSON Schema `$id` scopes are intentionally prohibited until the validator implements their full base-URI semantics.

The stable Opportunity endpoints are `./data/opportunities/diffusion-models.alpha.json` and `./data/opportunities/opportunity-map.schema.json`. The former `./src/data/opportunities/...` endpoints remain available for compatibility: the data is an exact second publication of the maintained JSON, while the old schema URL is a small schema with its own truthful `$id` that delegates to the stable canonical schema. The public `./ai-research-tech-tree.html` alias likewise redirects to `./` and preserves query and hash state when JavaScript is available; its no-JavaScript fallback redirects to the root application.

The same sequence is configured to run in GitHub Actions on the `ubuntu-24.04` runner label; the label is fixed in the workflow, while the hosted image behind it can change. Pull requests receive a downloadable staged-site preview artifact. A pull request is not ready to merge if a build changes generated files or leaves untracked source files. Under RD-006 and RD-007, an annotated tag and public deployment remain under explicit hold until separately authorized.

## Contributing

The easiest contribution is a structured issue:

- correct a node, date, description, or source;
- propose a development or open research direction; or
- correct or add a relationship.

Opportunity-map contributions must also name the local status scope, evidence grade, and supporting source IDs. Candidate applications and open opportunities remain explicitly hypothesis-grade until their stated evidence threshold is met; adding a plausible idea is not the same as documenting a demonstrated capability.

For a pull request, identify the affected stable IDs, state the exact proposed claim, provide a source with a durable locator, distinguish evidence from interpretation, disclose material AI assistance, run the build and tests, and include the generated artifact diff. Full requirements are in [CONTRIBUTING.md](CONTRIBUTING.md).

GitHub issues and pull requests are the project's track-changes system. The maintainer retains final editorial responsibility for what is included and how uncertain claims are represented.

## Citation

Use the repository's **Cite this repository** control or [CITATION.cff](CITATION.cff). The file is synchronized to the `v1.0.0` source candidate and edition `2026-08-21-stable-1`, but cite a tagged release rather than an untagged source build. A future archive may add a DOI without changing stable atlas IDs.

## Licensing

- Software and build tooling: [MIT](LICENSE-CODE)
- Original atlas prose, annotations, and graph data: [CC BY-SA 4.0](LICENSE-CONTENT)
- Linked or quoted third-party works are not relicensed: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

Created and maintained by [@neb6dav](https://github.com/neb6dav). Contributions are reviewed through the project's public editorial process.
