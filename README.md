# AI Research Tech Tree

The AI Research Tech Tree is a public, evidence-linked atlas of artificial-intelligence research developments, open directions, landmark works, and recorded relationships. It combines a chronological Timeline, a structural Network, a capability-oriented Opportunity View, and an accessible List.

**Release channel: public beta.** This branch targets an untagged `v0.1.1` development edition; source builds and pull-request previews are not citable releases. The latest tagged release remains `v0.1.0`, and each staged preview records its exact commit and checksums in `release-manifest.json`. The atlas is a curated research aid, not a complete literature review, a peer-reviewed historical account, or a claim that every displayed relationship is causal. Records expose their available sources and review state so that gaps can be inspected and improved in public.

The repository is advancing through source checkpoints at `v0.1.1`, `v0.2.0`,
and `v0.2.2`; only `v1.0.0` is the next public release target. See
[`PLAN.md`](PLAN.md) for the bounded product milestones and acceptance gates.

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

The public beta keeps a single-file application as its canonical application source while generating deployment and machine-readable artifacts around it.

### Maintained source

- `ai-research-tech-tree.html` — legacy canonical application source and embedded atlas data for this beta; the staged public path of the same name is a lightweight compatibility redirect
- `src/compatibility/ai-research-tech-tree.html` — state-preserving public compatibility redirect to the root application
- `src/network-view.js` — 2-D WebGL network-view source
- `src/opportunity-view.js` and `src/opportunity-layout.cjs` — accessible Opportunity View renderer and deterministic layout logic
- `src/data/opportunities/diffusion-models.alpha.json` — maintained diffusion-models Opportunity map, published canonically at `data/opportunities/diffusion-models.alpha.json`
- `src/data/opportunities/opportunity-map.schema.json` and `validate-opportunity-data.js` — canonical schema and evidence-aware validation rules, published at `data/opportunities/opportunity-map.schema.json`
- `src/compatibility/opportunity-map.schema.json` — delegating schema retained at the former public `src/data/...` URL
- `generate-knowledge-graph.js` — machine-readable graph exporter
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

Generated artifacts are committed so releases can be inspected, downloaded, and served without a build service. Change maintained source, run the build, inspect the resulting diff, and commit the regenerated artifacts with the source change.

## Build and validate

Node.js 24 and npm 11 are the pinned artifact-producing toolchain. The graph-rendering dependency may support older runtimes, but release artifacts and generated-file checks are accepted only from the pinned major versions. Reproduce the checked-in artifacts with:

```text
npm ci
npx playwright install chromium
npm run build
npm test
git diff --exit-code
```

`npm test` runs the data, accessibility, layout, Network, Opportunity, canonical-data, staging, contract, and deterministic artifact-budget gates; assembles `_site`; and exercises all four views in headless Chromium at desktop and mobile sizes. The browser gate blocks external requests, console errors and warnings, missing runtime fragments, broken deep links or focus restoration, and an active-DOM regression above the reviewed `8,000` ceiling. Lighthouse measurements remain deferred to the `v0.2.2` source checkpoint.

The release manifest records the target package version, dataset edition, publication state, exact full commit, observed Node and npm versions, and every payload file's media type, byte count, and SHA-256. In clean-source mode, staging also proves that the configuration, metadata, individual artifacts, and complete directory inputs are regular committed blobs from the advertised `HEAD`; symlinks, gitlinks, Git LFS pointers, replacement objects, index concealment flags, dirty submodules, and generated or Git-administration input paths fail closed. The manifest cannot contain its own digest without a cryptographic self-reference, so it explicitly excludes itself; WP-011-B supplies the checksum of the complete release archive. Local dirty-tree staging remains available for pre-commit review but is labeled non-clean and cannot be deployed.

The static contract uses a pinned browser-compatible HTML attribute decoder, rejects nested `iframe[srcdoc]` browsing contexts, validates live-document fragments without treating inert `<template>` contents as targets, and checks JSON Schema reference closure and application-state ID uniqueness. Runtime-created fragments are verified by the Chromium smoke gate. Nested JSON Schema `$id` scopes are intentionally prohibited until the validator implements their full base-URI semantics.

The stable Opportunity endpoints are `./data/opportunities/diffusion-models.alpha.json` and `./data/opportunities/opportunity-map.schema.json`. The former `./src/data/opportunities/...` endpoints remain available for compatibility: the data is an exact second publication of the maintained JSON, while the old schema URL is a small schema with its own truthful `$id` that delegates to the stable canonical schema. The public `./ai-research-tech-tree.html` alias likewise redirects to `./` and preserves query and hash state when JavaScript is available; its no-JavaScript fallback redirects to the root application.

The same sequence runs in GitHub Actions. Pull requests receive a downloadable staged-site preview artifact. A pull request is not ready to merge if a build changes generated files or leaves untracked source files. Production publication remains under an explicit hold until WP-011-B/C4 implements approved annotated-tag promotion and post-deployment verification, and a release is separately authorized.

## Contributing

The easiest contribution is a structured issue:

- correct a node, date, description, or source;
- propose a development or open research direction; or
- correct or add a relationship.

Opportunity-map contributions must also name the local status scope, evidence grade, and supporting source IDs. Candidate applications and open opportunities remain explicitly hypothesis-grade until their stated evidence threshold is met; adding a plausible idea is not the same as documenting a demonstrated capability.

For a pull request, identify the affected stable IDs, state the exact proposed claim, provide a source with a durable locator, distinguish evidence from interpretation, disclose material AI assistance, run the build and tests, and include the generated artifact diff. Full requirements are in [CONTRIBUTING.md](CONTRIBUTING.md).

GitHub issues and pull requests are the project's track-changes system. The maintainer retains final editorial responsibility for what is included and how uncertain claims are represented.

## Citation

Use the repository's **Cite this repository** control or [CITATION.cff](CITATION.cff). Cite a tagged release rather than an undated copy whenever possible. A future archived release may add a DOI without changing stable atlas IDs.

## Licensing

- Software and build tooling: [MIT](LICENSE-CODE)
- Original atlas prose, annotations, and graph data: [CC BY-SA 4.0](LICENSE-CONTENT)
- Linked or quoted third-party works are not relicensed: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

Created and maintained by [@neb6dav](https://github.com/neb6dav). Contributions are reviewed through the project's public editorial process.
