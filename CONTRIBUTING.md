# Contributing

Thank you for helping improve the AI Research Tech Tree. This project welcomes corrections, additional evidence, new developments, open research directions, relationship revisions, accessibility improvements, and reproducibility fixes.

The public atlas is served as the tagged `v1.2.1` Stable UI release. Release-prep PR #14 was squash-merged into `main` as `59d4d90ebcb8bb8b230d9cea2286214a3d2011a5`; annotated tag `v1.2.1` targets that commit, and GitHub Pages run `33715374446` (job `100523342659`) passed and deployed on 2026-09-03. The live manifest reports clean source, required-clean source, matching committed inputs, and the unchanged data digest `865174514ba64e20d6f2a90471a6766b6d5fa18f5b0e62c85d9601de077a50f2`. The full exact merged-tree hosted browser/Lighthouse suite was not rerun, but deployment and live byte reconciliation passed. The citable dataset identity remains v1.0.0 in `CITATION.cff`, edition `2026-08-21-stable-1`; v1.2.1 is a presentation-only UI release. Contributions should make uncertainty easier to see, not merely make the graph larger. Pull-request previews and untagged builds are not citable releases; public promotion remains a guarded maintainer action from an approved annotated tag.

## Choose the smallest useful contribution

Use a structured GitHub issue when you want to:

- correct a node, date, description, classification, or source;
- propose a development or open direction; or
- add, remove, redirect, or reclassify a relationship.
- revise a capability, application, constraint, status assessment, or testable hypothesis in an Opportunity map.

Open a pull request when the proposed change is sufficiently precise to implement and you can include the rebuilt artifacts. Discussion before a large batch change is strongly encouraged.

Do not put sensitive personal information, private correspondence, paywalled full text, confidential peer-review material, or copyright-infringing copies into an issue or pull request.

## Evidence required

For a factual claim, provide:

1. the stable node or relationship ID, if one exists;
2. the exact current claim and exact proposed wording;
3. a DOI, arXiv identifier, stable URL, ISBN, archive record, or complete citation;
4. a page, section, figure, table, revision, or other locator when practical;
5. what the source directly supports and what remains interpretation; and
6. known conflicting sources or uncertainty.

For a relationship, also state:

- source and target IDs;
- whether direction matters;
- the proposed relationship type;
- whether the source explicitly documents the relationship; and
- the appropriate evidence/review state.

For an Opportunity View record, identify the bounded map and stable record ID, then distinguish among a documented capability, an application, a constraint, a competing approach, and a proposed opportunity. Status claims must define their local scope and cite the source IDs that support that scope. Do not describe a technology as globally mature, saturated, displaced, or exhausted.

An open-opportunity proposal must include a falsifiable question, proposed mechanism, unmet need, adjacent-work summary, novelty-search status and scope, minimal experiment, comparison baselines, disconfirming result, estimated resources, blockers or required complements, and plausible failure reasons. Candidate applications and open opportunities must remain hypothesis-grade. If a literature import has not received source-by-source human review, preserve `imported_unreviewed` rather than upgrading it to `validated`.

A search-result snippet, unsourced model output, or citation title alone is not sufficient evidence. ArXiv presence does not establish peer review. Wikipedia is useful for orientation and cross-checking, but high-consequence claims should use an underlying primary or rigorous secondary source when available.

## Local workflow

1. Fork the repository and create a focused branch.
2. Change maintained source, not generated files directly.
3. Preserve every existing exported ID. An exceptional identity correction must explain the collision or error, document compatibility impact, and deliberately update the locked inventory test. New records receive new IDs and never reuse retired identities.
4. Install exact dependencies and rebuild:

   ```text
   npm ci
   npm run build
   npm run test:fast
   ```

   Pull requests run `npm run test:fast` plus `node --test tests/workspace-browser.test.mjs` with Chromium installed. The manually dispatched candidate tier runs `npm test` and repeats the browser suite with Firefox and WebKit; it adds Lighthouse measurement.

5. Inspect the generated diff and the application in both light and dark themes and, when relevant, in Explore, Learn, Opportunity, and List views. `npm run preview` serves the staged site locally.
6. Commit maintained-source changes and the generated artifact changes produced by the build.
7. From the committed tree, rerun `npm run build`, `npm run test:fast`, and `git diff --exit-code` to prove that generation is reproducible and complete. The maintainer release-candidate check additionally reruns `npm test` after Chromium is installed.
8. Complete every applicable section of the pull-request template.

Maintained historical data lives under `src/data/atlas/`: `manifest.json` fixes
the 15-lane shard paths and sidecars, nodes are authored in
`nodes/<lane>.json`, and relationships are authored in
`relationships/<target-lane>.json`. Do not edit the historical records embedded
in `index.html`; they are generated projections. The maintained interface lives
under `src/workspace/`. Other sources include `src/research/`,
`src/data/opportunities/`, the compatibility redirects, and build/export scripts.
Generated files include `index.html`, `ai-research-tech-tree.html`, `nodes/`,
`sitemap.xml`, and the JSON, JSON-LD, and NDJSON exports. The historical
`network-layout-v1.json` remains a frozen compatibility artifact. See the README
for the development workflow and public contract.

## Pull-request scope

Keep each pull request reviewable. A focused correction with one or several tightly related records is preferable to a bulk import. If a contribution changes many nodes or edges, first open an issue describing:

- the source corpus;
- selection criteria;
- transformation procedure;
- duplicate and identity handling;
- expected review states; and
- how a reviewer can reproduce the result.

Generated minified files may produce a large diff. Reviewers will assess the maintained source and then verify that the generated files match a clean build.

The diffusion-models Opportunity map remains `alpha` and
`imported_unreviewed`. A contribution must not upgrade that status merely
because it passes structural validation or ships in the stable application.
Promotion requires source-by-source human review and a corresponding evidence
record.

## AI-assisted contributions

AI tools may be used for discovery, drafting, transformation, or code, but:

- an AI answer is not a source;
- every submitted citation must be opened and checked by the contributor;
- invented citations or unverified bulk graph expansion will be rejected;
- the human submitter remains responsible for accuracy, rights, and conduct; and
- material AI assistance must be disclosed in the issue or pull request, including what the tool did and what the contributor verified.

## Editorial review

Review considers:

- relevance to the atlas scope;
- identity and chronology;
- source quality and claim-level support;
- relationship direction and semantics;
- uncertainty and conflicting evidence;
- duplicate coverage;
- accessibility and interface effects; and
- reproducibility of generated outputs.

A record may be accepted with a partial, contextual, unassessed, or hypothetical state when that state is accurate and visible. It must not be made to look more certain than its evidence permits.

The maintainer may edit proposed wording, split a contribution, request stronger sourcing, defer it to the review backlog, or decline it. [@neb6dav](https://github.com/neb6dav) retains final editorial responsibility for releases.

## Credit and licensing

Contributors are credited through Git history, pull requests, release notes, and, for substantial scholarly contributions, future citation metadata where appropriate.

By submitting a contribution, you represent that you have the right to provide it and agree that accepted software contributions are licensed under the repository's MIT code license and accepted original atlas content/data contributions are licensed under CC BY-SA 4.0. Third-party material remains under its own terms and must be identified.

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
