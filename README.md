# AI Research Tech Tree

The AI Research Tech Tree is a public, evidence-linked atlas of artificial-intelligence research developments, open directions, landmark works, and recorded relationships. It combines a chronological Timeline, a structural Network, a capability-oriented Opportunity View, and an accessible List.

**Release channel: public beta.** This branch targets an untagged `v0.1.1` development edition; source builds and pull-request previews are not citable releases. The latest tagged release remains `v0.1.0`, and each staged preview records its exact commit and checksums in `release-manifest.json`. The atlas is a curated research aid, not a complete literature review, a peer-reviewed historical account, or a claim that every displayed relationship is causal. Records expose their available sources and review state so that gaps can be inspected and improved in public.

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
npm run build
npm test
git diff --exit-code
```

`npm test` runs the existing data, accessibility, layout, Network, and Opportunity gates; unit-tests the staging, contract, and deterministic artifact-budget tools; assembles `_site` from the versioned staging manifest; and verifies its publication contract under the `/ai_tech_tree/` project path. Browser-only performance metrics remain recorded but unmeasured until the `WP-012-A` browser harness.

The release manifest records the target package version, dataset edition, publication state, exact full commit, observed Node and npm versions, and every payload file's media type, byte count, and SHA-256. `config/releases/v0.1.1.json` is the reviewable release specification: while it is `planned`, its release date remains null and the dataset, citation metadata, and changelog must remain explicitly developmental. A later, separately authorized release-finalization change must make that specification `ready` and synchronize the stable dataset state, citation version and actual release date, and dated changelog section before a ready-state preview can pass. The dataset edition date, historical review cutoff, sitemap page-modification date, and annotated-tag release date are independent facts; none may be copied into another merely to make the values agree.

The exact finalization inventory can be inspected without changing any file:

```text
npm run plan:release-finalization
```

This read-only preflight rejects drift in the current planned identity and leaves the release date unresolved. An authorized controlled finalization must choose the intended annotated-tag tagger calendar date, and the subsequently created tag must verify that exact date before release-mode assets or promotion are allowed. `ready` therefore means the source snapshot is internally finalized; it does not by itself prove that a tag, GitHub Release, approval, deployment, or public verification exists.

Staging has two explicit modes. `AI_TREE_STAGE_MODE=preview` (also the safe local default) always emits `tag: null` and `promotion: null`, even if ambient GitHub or Git variables name a tag. `AI_TREE_STAGE_MODE=release` additionally requires clean-source mode, the exact configured release-spec path, an exact annotated `v<version>` tag directly targeting `HEAD`, a matching tagger calendar date, and reachability from the configured protected-main tracking ref. The local verifier records only those Git facts; it does not claim that GitHub approved the environment, protected or signed the tag, or made a release immutable. Those remain separately checked promotion controls.

In clean-source mode, staging validates the supported Git object format and reachable object database, recomputes each input blob's Git object ID, and proves that the configuration, metadata, individual artifacts, and complete directory inputs are unfiltered regular blobs from the advertised `HEAD`. It also audits committed and working-tree attributes across the entire tracked tree and rejects every clean filter, so executed release tooling cannot differ from the advertised commit while Git reports a clean checkout. Symlinks, gitlinks, Git LFS pointers, replacement objects, index concealment flags, dirty submodules, and generated or Git-administration input paths likewise fail closed. Clean staging therefore requires Git support for `rev-parse --show-object-format` and `check-attr --source`; an older or incompatible Git fails closed. The manifest cannot contain its own digest without a cryptographic self-reference, so it explicitly excludes itself; WP-011-B supplies the checksum of the complete release archive. Local dirty-tree preview staging remains available for pre-commit review but is labeled non-clean and cannot be promoted.

Candidate assets are built only from an exact clean commit and remain visibly candidate-only. The output directory must be a new absolute directory outside the repository worktree:

```text
npm run build:release-candidate -- --repository-root <absolute-repository-root> --commit <full-HEAD-object-id> --output-directory <new-absolute-directory>
```

The command refreshes and revalidates `_site`, captures its complete byte inventory, and writes a deterministic uncompressed POSIX-USTAR archive, an exact standalone copy of `release-manifest.json`, candidate notes, and a SHA-256 checksum file covering those three assets. While the release specification is `planned`, notes come from the committed `[Unreleased]` section; a `ready` fixture or later finalized candidate reads only the exact dated version section. Every filename includes `candidate` and the full commit, and every candidate manifest remains `publicationMode: preview` with null tag and promotion fields. The command performs no tag, GitHub Release, environment approval, settings change, deployment, or network request, and its output does not attest that any of those external actions have or have not occurred.

Stable assets have a separate, local-only and network-free entry point. It may run only after the source is finalized and an exact annotated tag already exists locally; it does not create or push the tag:

```text
npm run build:stable-release-assets -- --repository-root <absolute-repository-root> --commit <full-HEAD-object-id> --output-directory <new-absolute-directory> --tag <annotated-tag> --release-spec-path <repo-relative-release-spec> --protected-main-ref <freshly-fetched-protected-main-ref>
```

Stable mode requires a `ready` specification, clean release-mode staging through exactly `config/pages-stage.v1.json`, the exact configured release-spec path, a recorded lowercase SHA-256 dataset digest, an observed Node 24/npm 11/package-lock v3 toolchain, and the verified annotated tag's direct target, tagger date, and protected-main reachability. Every executing local release-tool file must be a canonical regular file whose bytes match the advertised commit. Git subprocesses prohibit promisor-object lazy fetching. The builder verifies the ref proof again immediately before atomically publishing four local files: `<assetStem>.tar`, `<assetStem>.release-manifest.json`, `<assetStem>.notes.md`, and `<assetStem>.SHA256SUMS`; ref drift removes the temporary output and leaves no final directory. Their archive root is `<assetStem>/`, with no candidate identity. The command makes no network request and cannot create a GitHub Release, approve an environment, change settings, deploy Pages, or run production smoke. The real `v0.1.1` specification remains `planned`, so stable mode intentionally fails against the current real checkout; C4.4-A1 exercises it only with local synthetic ready-state and annotated-tag fixtures, and C4.4-A2 exercises the same code only through the reviewed pull-request-only, credential-free, remote-less synthetic parity fixture.

C4.4 is locked into separate checkpoints. A1 supplies and locally tests the stable builder. A2 must prove the same synthetic stable bundle byte-for-byte on Windows and Ubuntu. B must add read-only promotion-control, lifecycle-receipt, and durable-rollback preflight while the active workflows remain build-only and unprivileged. No active workflow may enter stable or release mode against the real checkout or release identity, or perform an external promotion action. The sole hermetic exception is A2's reviewed pull-request-only fixture: it creates no remote, uses no credentials, and invokes stable mode only inside a disposable synthetic repository for parity proof. Actual source finalization, annotated-tag creation and push, and GitHub Release/Pages promotion are later, separately authorized actions; none is implied by completing A1, A2, or B.

C4.4-B1 adds a versioned, reviewable description of the GitHub controls that a later `v0.1.1` promotion must satisfy. Its repository entry point is deliberately plan-only:

```text
npm run plan:promotion-controls
```

The default command reads `config/github-promotion-policy.v1.json` and reports the bounded read-only audit plan without making a network request. There is no package or workflow entry point that supplies an execution flag, token, secret, write permission, environment, deployment action, or promotion capability; the two active workflows remain byte-for-byte unchanged and cannot invoke the audit CLI or a live transport. Unit tests exercise the GET-only response logic through an injected transport, but injected or test-only receipts are never eligible evidence of real GitHub control state. No live audit has been called or authorized by this implementation.

The policy describes the required future state and remains planned, not satisfied. The currently known external blockers are that the `github-pages` environment has no required reviewer and permits administrator bypass, immutable GitHub Releases are disabled, no active no-bypass tag ruleset protects `v0.1.1`, and the verified production recovery artifact is local rather than durable and runner-accessible. Those controls require separately authorized GitHub changes and a subsequent live, read-only audit before any privileged promotion workflow may be considered.

The required-check context is never accepted by itself: the response verifier also binds the active `validate.yml` workflow, a successful `push` run at the independently supplied commit, and its exact required job. The protected-branch environment policy assumes a later manual dispatch from protected `main` while the release tooling independently binds the annotated tag; it does not assume or authorize a tag-triggered deployment.

C4.4-B2.1 adds only the fixture-scoped, append-only promotion-lifecycle receipt
contract and its deterministic plan:

```text
npm run plan:promotion-lifecycle
```

The command reads the fixed lifecycle and release policies and prints a plan;
it accepts no execution, output, or adapter option and performs no network
request, filesystem write, external mutation, or authorization step. Ordinary
tests exercise strict receipt and byte-chain validation with fixture evidence.
Those receipts describe test events only: a B1 injected control receipt is not
live control evidence and cannot make a B2.1 receipt eligible for promotion.
The two active workflows remain the exact validation workflow and reusable
build-only Pages hold. Neither may invoke the plan CLI, persist or consume a
lifecycle receipt, or use lifecycle output as operational evidence. Their
ordinary `npm test` gate does deliberately import the pure implementation and
exercise fixture-only plan and receipt behavior entirely in memory; that test
coverage carries no adapter, output, network, mutation, or production-evidence
capability.

B2.1 deliberately stops before operational decision guards. Fresh live-control
consumption and ambiguity/reconciliation guards belong to B2.2; rollback-state
guards belong to B2.3; and a durable, runner-accessible rollback bundle belongs
to B3. None of those later capabilities, any GitHub mutation, or any release or
deployment authority is supplied or implied by the B2.1 receipt vocabulary.

The post-deployment verifier is network-free by default. It accepts only a separately supplied, exact local release manifest plus its SHA-256, annotated tag, and commit; rejects preview or internally inconsistent release identity; and prints the fixed-origin GET plan without contacting the site. A later, separately authorized promotion run must add `--execute` to perform the bounded 12-minute verification:

```text
node scripts/post-deploy-smoke.mjs --manifest <exact-release-manifest> --manifest-sha256 <sha256> --expected-tag <annotated-tag> --expected-commit <full-commit>
```

Execution verifies the remote manifest before and after the complete public payload set, exact bytes and hashes, host-specific MIME allowlists, slash canonicalization, a non-existent sentinel, and the root and compatibility shells. `.nojekyll` is explicitly classified as a deployment control because GitHub Pages does not serve it. Fragment-bearing node and Opportunity URLs are reported as artifact-bound client states with `clientStateVerified: false`; their actual runtime restoration remains a browser-verification responsibility. The verifier has no arbitrary-origin option, follows no redirects, sends no credentials, drains failed concurrent attempts before retrying, and fails closed at its absolute deadline. C4.2 implements and tests this tool only against injected and loopback fixtures; it does not run it against production.

The static contract uses a pinned browser-compatible HTML attribute decoder, rejects nested `iframe[srcdoc]` browsing contexts, validates live-document fragments without treating inert `<template>` contents as targets, and checks JSON Schema reference closure and application-state ID uniqueness. Explicit runtime-fragment declarations are labeled `runtime-declared-pending-browser`, not statically verified; their browser proof belongs to `WP-012-A`. Nested JSON Schema `$id` scopes are intentionally prohibited until the validator implements their full base-URI semantics.

The stable Opportunity endpoints are `./data/opportunities/diffusion-models.alpha.json` and `./data/opportunities/opportunity-map.schema.json`. The former `./src/data/opportunities/...` endpoints remain available for compatibility: the data is an exact second publication of the maintained JSON, while the old schema URL is a small schema with its own truthful `$id` that delegates to the stable canonical schema. The public `./ai-research-tech-tree.html` alias likewise redirects to `./` and preserves query and hash state when JavaScript is available; its no-JavaScript fallback redirects to the root application.

The same preview sequence runs in GitHub Actions with `AI_TREE_STAGE_MODE=preview`. Pull requests receive a downloadable staged-site preview artifact. The workflow inventory remains exactly the read-only validation workflow and reusable build-only Pages hold; neither may invoke stable assets, release-mode staging, production smoke, tag or GitHub Release operations, settings or environment mutation, or deployment. A pull request is not ready to merge if a build changes generated files or leaves untracked source files. Production publication remains under an explicit hold until WP-011-B/C4 implements approved annotated-tag promotion and post-deployment verification, the external controls pass, and each mutation is separately authorized.

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
