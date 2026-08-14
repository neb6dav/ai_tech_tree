# Methodology

## Purpose and release status

The AI Research Tech Tree is a public-beta research atlas designed to help readers explore the chronology and recorded relationships of artificial-intelligence research. It is a navigational and synthesis artifact. It is not a substitute for reading the cited literature, an exhaustive bibliography, a systematic review, or a peer-reviewed causal history.

The project favors transparent uncertainty over false completeness. A visible evidence gap or unassessed relationship is part of the published record and an invitation to improve it.

## Units of analysis

The atlas contains two principal node types:

1. **Developments**: publications, demonstrations, methods, systems, findings, datasets, institutions, or other events judged consequential to the research history represented by a branch.
2. **Open directions**: unresolved questions or prospective areas included to support research orientation. These are not historical developments and must be visibly distinguished from them.

Relationships are separate records with stable source and target identifiers. A node's presence does not imply endorsement, and an edge's presence does not automatically imply direct influence or causation.

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

## Generation and reproducibility

For this public beta, `ai-research-tech-tree.html` remains the canonical application source and contains the atlas records used by the interface. Source code under `src/` and the build, layout, injection, export, and validation scripts are maintained source.

The following are reproducible generated artifacts and must not be edited directly:

- `index.html`;
- `network-atlas.bundle.js`;
- `network-layout-v1.json`; and
- the JSON, JSON-LD, and NDJSON graph exports.

The deterministic build and test sequence is documented in the README and enforced in continuous integration. Generated outputs are committed so reviewers can inspect what a source change will publish.

## AI assistance

AI tools may assist with source discovery, candidate generation, data transformation, drafting, code, and testing. AI output is not accepted as evidence and an AI system is not treated as an author or accountable reviewer. A human contributor must inspect every cited source used to support a claim, remain responsible for the submitted change, and disclose material AI assistance in the issue or pull request.

## Corrections and editorial responsibility

Anyone may propose a correction, addition, deletion, or reinterpretation through the public issue forms. The maintainer evaluates scope, evidence quality, relationship semantics, duplication, uncertainty, and presentation. Inclusion is not guaranteed merely because a source exists; rejection does not imply that the proposed work lacks merit.

The maintainer, [@neb6dav](https://github.com/neb6dav), retains final editorial responsibility for public releases. Material errors should be corrected transparently, with the prior state recoverable through version history.
