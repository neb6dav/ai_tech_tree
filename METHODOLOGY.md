# Methodology

## Purpose and release status

The AI Research Tech Tree is a public research atlas designed to help readers explore the chronology and recorded relationships of artificial-intelligence research. Version `1.0.0`, release state `Stable`, edition `2026-08-21-stable-1`, is the stable source candidate. `Stable` identifies the artifact and data in the final pre-tag source bytes; it does not attest an annotated tag, deployment, or public promotion, which remain separately authorized actions. It is a navigational and synthesis artifact. It is not a substitute for reading the cited literature, an exhaustive bibliography, a systematic review, or a peer-reviewed causal history.

The project favors transparent uncertainty over false completeness. A visible evidence gap or unassessed relationship is part of the published record and an invitation to improve it.

## Units of analysis

The historical atlas contains two principal node types:

1. **Developments**: publications, demonstrations, methods, systems, findings, datasets, institutions, or other events judged consequential to the research history represented by a branch.
2. **Open directions**: unresolved questions or prospective areas included to support research orientation. These are not historical developments and must be visibly distinguished from them.

Relationships are separate records with stable source and target identifiers. A node's presence does not imply endorsement, and an edge's presence does not automatically imply direct influence or causation.

The Opportunity View uses a separate ontology because a historical development and an opportunity assessment answer different questions. Its records distinguish precursors, core developments, capabilities, refinements, complements, applications, demonstrated outcomes, constraints, stalled attempts, competing approaches, and open opportunities. Typed `atlasLinks` connect a capability record to a historical atlas record without merging their meanings or evidence states.

## Inclusion criteria

A development is a candidate for inclusion when at least one of the following is true:

- it introduced or clearly articulated a method, finding, benchmark, dataset, system, or research framing with documented downstream relevance;
- it is repeatedly treated by credible secondary scholarship as an important development;
- it connects otherwise isolated parts of the represented research history;
- it records a consequential negative result, limitation, correction, or change in research direction; or
- omitting it would materially distort a reader's understanding of the branch.

Open directions require a clearly stated unresolved question, a plausible connection to represented work, and an explanation of why the question remains open. Popularity alone is not sufficient for either node type.

The atlas does not attempt to include every paper, product release, benchmark score, company, or deployment. Inclusion is an editorial judgment that remains open to sourced correction.

## Source hierarchy

Claims should be supported as close to the underlying evidence as practical:

1. original papers, books, technical reports, standards, datasets, or official project documentation;
2. archival or institutional records and author-maintained publication pages;
3. rigorous review articles, scholarly histories, or other reputable secondary sources;
4. Wikipedia revision snapshots as useful orientation, terminology, chronology cross-checks, and source-discovery aids;
5. tertiary summaries only when stronger sources are unavailable and the limitation is explicit.

ArXiv is a repository, not a review status. A linked preprint must not be described as peer reviewed unless a separate publication record establishes that status. Likewise, a Wikipedia match is not independent verification of every sentence associated with a node.

For older public-domain works, the atlas may link a lawful full-text edition. A link does not transfer ownership or change the work's rights status.

## Dates and priority claims

Dates should represent the event named by the record—such as first public circulation, publication, presentation, or release—and the description should identify the event when ambiguity matters. Where preprint, conference, journal, and product dates differ, sources and notes should preserve the distinction.

Priority terms such as “first,” “earliest,” “proved,” “solved,” “introduced,” “ended,” “never,” and “only” require especially strong, claim-level support. When the available sources establish significance but not exclusivity, the language should be narrowed—for example, “an early,” “helped establish,” or “is widely credited with.” Conflicting priority accounts should be represented rather than silently resolved.

## Relationship semantics

Every relationship should be interpreted through its declared type, direction, evidence state, and explanatory note. Common meanings include:

- **documented influence or dependency**: a source explicitly describes one work as building on, enabling, correcting, or responding to another;
- **partial support**: the available source supports only a limited version of the proposed connection;
- **contextual or indirect relationship**: the records belong to a supported historical or technical context, but direct influence is not established;
- **editorial association**: a curator-added link intended to aid exploration across concepts or branches;
- **hypothesis**: a speculative connection or research proposition, always visibly marked as such;
- **unassessed**: no relationship-level review has yet been completed.

“No source found in the current audit” means only that the stated review did not locate and attach support. It is not a negative finding about the real-world relationship.

## Opportunity-view interpretation

The Opportunity View asks what a bounded development enabled, where those capabilities were applied, what constrained them, what competing approaches changed their use, and what testable possibilities remain. It is a time-oriented braided capability graph, not a quantitative Sankey diagram and not a genealogy of every downstream work.

Every path uses one fixed visual width. Width does not encode publication volume, adoption, scientific importance, commercial value, evidential confidence, remaining research value, or probability of success. Relationship type, status, evidence grade, explanatory text, and cited sources carry the meaning. Dashed paths identify incomplete, unassessed, or hypothetical support.

Status is assessed only within a declared scope. Terms such as `locally_saturated`, `constraint_bound`, or `displaced_in_this_context` may be used only for the named capability, application, benchmark, or operating regime. They must not be generalized into a claim that the underlying technology is globally exhausted. An open opportunity must state a falsifiable question, proposed mechanism, unmet need, adjacent-work and novelty-search scope, minimal experiment, baselines, disconfirming result, likely resources, blockers, and failure reasons. Open opportunities and candidate-application edges remain hypothesis-grade.

The first Opportunity map is a bounded diffusion-models alpha: 60 nodes, 94 relationships (93 report rows plus one explicitly contextual editorial connectivity edge), 78 source URLs, eight branches, eight constraints, eight hypothesis cards, and nine unresolved claims. It remains `imported_unreviewed`; that status distinguishes research extracted from the report from records that have received source-by-source human validation. The structured outline is a complete non-graph reading path, while cross-view controls return linked records to the Timeline or Network.

## Network-view interpretation

The Network view is a visual projection of the recorded graph. Its coordinates are generated deterministically for a versioned layout so the same release can be reproduced. Layout forces may group connected nodes and separate weakly connected regions.

Therefore:

- proximity is not evidence of similarity or influence;
- centrality is not a measure of scientific importance, truth, quality, or consensus;
- cluster membership is not a formal taxonomy;
- an apparent dead end may reflect missing records or edges rather than a historical dead end; and
- filtered views can materially change apparent structure.

Node sizes should remain visually conservative, and relationship styling should expose evidence state rather than silently converting degree into importance.

## Review states and audit trail

Node-level and relationship-level review are tracked separately. A node with a confirmed date or source can still have unassessed outgoing relationships. Public releases may contain confirmed, partially supported, unassessed, hypothetical, or source-not-found records, provided their states are not hidden.

Review should record, where available:

- the exact claim assessed;
- the source URL, DOI, identifier, or bibliographic record;
- a page, section, figure, revision, or other durable locator;
- the result and its scope;
- unresolved conflicts or caveats; and
- the review date or release in which the assessment changed.

Substantive changes are made through GitHub issues and pull requests. Git history preserves who proposed, reviewed, and merged a change. Tagged releases freeze citable snapshots while stable node and relationship IDs allow records to be compared over time.

## Stable identity and data status

The v1 public contract freezes every existing exported record ID, not only the
339 node IDs used by application deep links. The frozen inventory includes
historical lanes, classifications, nodes, relationships, evidence assessments,
papers and links, landmark works and links, and Wikipedia sources, together
with the Opportunity map, visual bands, nodes, relationships, sources,
application branches, constraints, open opportunities, and unresolved claims.
An identity correction requires explicit compatibility review; ordinary prose,
date, evidence, or relationship corrections retain their existing IDs. A future
addition deliberately extends the locked inventory rather than reusing an ID.

Release identity and evidence currency are separate. The v1 edition is dated
2026-08-21, while the historical-atlas review cutoff remains `2026-08-04`.
The diffusion Opportunity map is dated `2026-08-19` and remains explicitly
`alpha` and `imported_unreviewed`. Neither the stable application version nor
the edition date upgrades an unreviewed record or implies a new source-by-source
audit.

## Generation and reproducibility

Historical-atlas authoring is canonical only under `src/data/atlas/`. Its
schema-`1.0.0` `manifest.json` fixes the 15-lane order, one node shard and one
relationship shard per lane, and six sidecar paths. Nodes are sharded by their
own lane. Relationships are sharded by the target node's lane. Dense ordinals
preserve deterministic cross-shard ordering. `catalog.json` carries project,
lane, era, classification, and relationship registries; the remaining sidecars
carry directions, research guidance, Wikipedia audit data, review fingerprints,
and the no-JavaScript projection.

`ai-research-tech-tree.html` is the maintained application shell, but its
embedded historical records and data constants are generated projections of
that canonical atlas and are not a second authoring source. The Opportunity map
is maintained separately in
`src/data/opportunities/diffusion-models.alpha.json` and validated against
`src/data/opportunities/opportunity-map.schema.json` plus cross-view integrity
rules. Source code under `src/` and the build, layout, injection, export, and
validation scripts are maintained source.

The following are reproducible generated artifacts and must not be edited directly:

- `index.html`;
- `network-atlas.bundle.js`;
- `opportunity-atlas.bundle.js`;
- `network-layout-v1.json`; and
- the JSON, JSON-LD, and NDJSON graph exports.

The deterministic build and test sequence is documented in the README and
enforced in continuous integration. Generated outputs remain committed through
`v1.0.0` so reviewers can inspect what a source change will publish. The
publication-compatibility test locks the stable endpoints, schema and layout
identities, canonical authoring paths, and ordered exported-ID inventories.

## AI assistance

AI tools may assist with source discovery, candidate generation, data transformation, drafting, code, and testing. AI output is not accepted as evidence and an AI system is not treated as an author or accountable reviewer. A human contributor must inspect every cited source used to support a claim, remain responsible for the submitted change, and disclose material AI assistance in the issue or pull request.

## Corrections and editorial responsibility

Anyone may propose a correction, addition, deletion, or reinterpretation through the public issue forms. The maintainer evaluates scope, evidence quality, relationship semantics, duplication, uncertainty, and presentation. Inclusion is not guaranteed merely because a source exists; rejection does not imply that the proposed work lacks merit.

The maintainer, [@neb6dav](https://github.com/neb6dav), retains final editorial responsibility for public releases. Material errors should be corrected transparently, with the prior state recoverable through version history.
