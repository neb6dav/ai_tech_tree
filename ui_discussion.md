# UI and UX discussion

Recorded: 2026-09-09

Project: [AI Research Tech Tree](https://github.com/neb6dav/ai_tech_tree)

This is a comprehensive discussion record, organized by topic rather than a verbatim transcript. It preserves the original goals, repository and interface observations, proposed designs, mockups, technical tradeoffs, later corrections, and recommended development approach. User requirements, assistant recommendations, and unresolved choices are distinguished below.

This document does not authorize implementation, a fork, a new repository, a merge, a release, or deployment. The user explicitly stopped an earlier proposed build and requested discussion only. The subsequent authorization was to write this file.

## 1. Product goals and priorities

The initial request was to look at the project with fresh eyes and make it capable of producing a "wow" reaction on Hacker News. Phase 2 should develop it into a legitimate research tool. Education is also a core use case. The governing instruction was: **"Above all, KISS."** Low ongoing maintenance is a major design constraint.

The intended experience should support three kinds of value:

| Goal | What a reader should gain |
| --- | --- |
| Discovery and visual impact | Quickly see a meaningful or surprising connection between ideas and want to explore or share it. |
| Education | Understand an idea, why it matters, useful background, and what to read next. |
| Research | Inspect the precise claim behind a relationship, its sources and uncertainty, and obtain useful references or reusable data. |

The discussion favored visual impact through clear relationships, readable composition, distinctive typography, and purposeful interaction. A strong reaction from Hacker News cannot be guaranteed by a design or technology choice.

The user later clarified that **desktop use takes priority**. Mobile may be omitted from the first release of the redesigned experience or receive only a basic version. This supersedes any earlier assumption that a narrow reading layout or mobile requirements should govern the main interface.

The user's references to shipping "1.0" concern the planned experience. This discussion did not settle a new version number or change the existing v1.2.1 application release or the separately identified dataset edition.

## 2. Current decision status

| Item | Status at the end of the discussion |
| --- | --- |
| KISS and low maintenance | Explicit user priorities. |
| Strong visual appeal, education, and eventual research utility | Explicit product goals. |
| Desktop as the primary experience | Explicit user correction and priority. |
| Mobile as optional or basic for the first redesigned release | Explicitly acceptable to the user. |
| Large desktop diagram with a persistent details pane | Latest assistant recommendation; detailed design remains open. |
| Warm paper, dark ink, burnt-orange accent, editorial typography | Explored visual direction, not a finalized brand decision. |
| Two simple templates and small inline diagrams | Earlier field-guide proposal; its simplicity principles remain useful, but its strict layout limits do not bind the desktop workspace. |
| Keep the current repository and canonical dataset | Assistant recommendation. |
| Develop a replacement UI on a branch and worktree | Assistant recommendation; neither was created for this discussion. |
| Adopt D3, Cytoscape, Sigma, Three.js, or another library | Undecided. Evaluate existing Cosmos support first. |
| Build or deploy the redesigned site | Not authorized by this discussion. |
| Create this discussion record | Authorized by the user. |

## 3. What the initial review found

The existing checkout and public interface were inspected during the conversation. The public interface observed was labeled **Stable v1.2.1**. During the later repository review, the clean local checkout matched GitHub's `main` at `d9265b4a16e1cb4f11b01661f15c95160a130765`, titled "Record v1.2.1 public release (#15)."

These are dated observations from the discussion, not a claim that the current deployed site will always match that checkout. The documentation commit and the tagged deployment commit are distinct. No fresh deployment or complete application test run was performed as part of the design discussion.

### Existing strengths to preserve

The product already contains substantial functionality and research infrastructure:

- Timeline, Network, Opportunity, and List views.
- Search, curated tours, lineage tracing, connection controls, and shareable view state.
- Canonical records, stable identifiers, typed relationships, sources, and review metadata.
- Static node reading pages, citation support including BibTeX, and machine-readable exports.
- An Opportunity View intended to connect documented developments, capabilities, constraints, and research hypotheses.
- Contribution, methodology, citation, licensing, and release records.

The inspected historical atlas contained 339 records and 711 relationships. The earlier review also identified 74 research questions. These figures describe that inspection snapshot and are not completeness claims about AI research.

### UI and UX observations

The initial review identified several sources of friction:

1. The welcome overlay covered the map, and the tour chooser could remain open during a tour and obscure the graph.
2. The interface exposed many top-level controls before a new reader had a clear task.
3. Large lineage traces were difficult to read. The Transformer full-lineage example was reported as 117 nodes and 196 relationships, with overlapping or duplicate labels.
4. Primary reading was available but could be buried in a collapsed research section.
5. The selected idea, its relationship evidence, and the surrounding map could compete for attention.
6. Some content and review-state wording needed reconciliation. The earlier review noted conflicting manual-review language in the Opportunity material and a mismatch between stronger GAN/diffusion prose and a relationship whose supersession claim was not established.

These were initial design and content findings, not a complete usability or scientific audit.

The earlier source inspection reported the following relationship evidence categories:

| Recorded category | Relationships |
| --- | ---: |
| Direct | 6 |
| Partial | 3 |
| Contextual | 288 |
| Editorial | 214 |
| Unassessed | 156 |
| Hypothesis | 44 |
| **Total** | **711** |

The implication was to invest in the evidence behind featured paths and communicate these distinctions clearly. The categories are recorded assessments, not statistical confidence values or proof that a relationship is true or false.

### Initial improvement recommendations

The first approach was an incremental improvement to the existing atlas:

- Simplify navigation and onboarding.
- Let a tour run beside the map, with a clear current step.
- Start with a bounded, readable set of connections and provide a deliberate path to more context.
- Make the selected idea's explanation and original paper immediately useful.
- Put the claim and evidence for a selected relationship close together.
- Make reading lists easy to copy or export.
- Develop and review a strong featured example, with diffusion discussed as a useful bounded case study.
- Validate the experience with unfamiliar readers, including whether they can explain a connection and find its source.

## 4. The initial mockups

The first set of three mockups explored a coordinated evolution of the existing product:

| Mockup | Intended experience |
| --- | --- |
| Explore | Dark desktop atlas, a single toolbar, inline story choices, and the map as the main attraction. |
| Research | Light desktop workspace with a bounded diagram and a useful inspector; paper and reading-page access are prominent. |
| Mobile | Focused diagram above a compact reading sheet. |

The recommendation at that stage was to combine the visual presence of the Explore concept with the clarity of the Research inspector. The mobile concept was exploratory; it is no longer a launch priority.

All mockups in this conversation were generated images, not implemented interfaces. Their graph geometry and most displayed paths were illustrative. No usability or performance improvement was demonstrated merely by rendering them.

## 5. Starting over from the idea: the field-guide proposal

When asked to start from only the idea and minimize maintenance, the assistant proposed **an illustrated field guide to AI**.

The product promise was: find an idea, understand a few important connections, and know what to read next.

The original proposal used ordinary scrollable pages, search, links, breadcrumbs, and browser Back. Two main templates would organize the experience:

| Template | Content |
| --- | --- |
| Home/index | Prominent search, a featured connection diagram, question-shaped entry points, and a browsable index. |
| Record page | Title, date or period, concise explanation, local connection diagram, primary reading, and sources/review notes. |

Ideas and open questions could share a record-page pattern. A question would add sections for what remains uncertain and a proposed experiment or testable next step.

The suggested interaction rule was consistent: an idea opens its record; a connection reveals the particular claim and supporting evidence. A default diagram of roughly five to nine ideas was proposed for that reading-page concept, with additional relationships available in an ordinary list.

That five-to-nine range was an initial readability guideline, not a scientific limit or a final requirement for the later desktop workspace. The desktop design should use available space and readable context to determine how much to show.

### Visual direction explored

The clean-slate mockups used:

- Warm paper: `#f4f1e9`.
- Dark ink/navy: `#202b32`.
- Burnt-orange accent: `#bf4b31`.
- Editorial serif headings, readable sans-serif interface text, and restrained year labels.
- Thin rules, generous spacing, and little decorative interface chrome.

Three mockups showed the homepage, a Transformer idea page, and an open research question on mobile. The mobile question asked how AI can learn without forgetting and demonstrated uncertainty, a proposed experiment, and starting references in the shared record format.

The tradeoff in this original field-guide proposal was greater emphasis on reading and focused discovery. The later desktop-first correction moved the recommended primary experience toward a larger map workspace while retaining its clarity and evidence presentation.

### Maintenance approach discussed

One set of authored records and references should generate pages, search inputs, diagram data, and bibliographies. A journey can be an ordered list of record IDs that reuses existing content.

The conceptual data needs discussed were stable IDs, record type, title, date/period, summary, references, and related records. Each relationship needs a specific claim, type, supporting sources, and review state. These were content requirements, not an instruction to replace the existing schema or create another authoring dataset.

The initial low-maintenance proposal favored prebuilt HTML, modest CSS and JavaScript, and consistent diagram generation. Accounts, a database, live paper feeds, automatic research suggestions, and several equivalent graph modes were outside the proposed starting scope. Publication and review dates should be explicit; labels should not imply that every record is continuously current.

## 6. Making it useful for both research and education

The user asked whether the structure could support a solid research tool and an educational tool while retaining visual appeal. The answer was yes as a foundation, provided that content quality, evidence, and interaction design develop alongside the presentation.

The same underlying content should support progressively deeper use:

| Reader's question | What the interface should expose |
| --- | --- |
| What is this idea? | A short explanation in familiar language. |
| Why does it matter? | Context and a few meaningful connections. |
| What should I learn first? | An explicitly educational path or suggested background. |
| What supports this connection? | The precise relationship claim and its source. |
| What is uncertain? | Review state, limitations, disagreement, or hypothesis status. |
| Where do I go next? | Original papers, related records, reading lists, and reusable citations/data. |

Connections deserve the same editorial care as idea records. "Builds on," "uses," "offers a competing approach," and "is useful to learn before" make different claims. Historical influence does not automatically establish a learning prerequisite. Graph proximity or a short algorithmic path should not silently imply intellectual influence, causality, or an ideal learning sequence.

Evidence should remain available in ordinary readable content, with durable links and citation/export support. A tooltip should not become the only place where a research claim can be examined.

The main research risk discussed was oversimplification. A small diagram should disclose its scope and provide access to additional relationships. Open questions should state uncertainty. Proposed experiments and hypotheses should remain distinguishable from reported results.

The suggested way to prove the product was one exceptionally good topic and its surrounding connections. It should help a newcomer understand something, help a researcher find useful sources, and give both a reason to share it. Transformer supplied the recurring interface example; diffusion supplied an additional candidate research case study. Neither was fixed as the exclusive launch topic.

## 7. HTML, JavaScript, and graphics libraries

The user asked whether the design could be built in HTML, whether graphics/interactivity libraries were worth exploring, how much complexity they add, and whether that complexity is justified. The user then explicitly said **"Don't build anything."** The conversation remained at the architecture and mockup stage.

The proposed designs can use HTML for content, CSS for layout and appearance, SVG for diagrams, and JavaScript for interaction. Calling a site HTML-focused does not imply that it lacks interactive graphics.

The graphics tools discussed are JavaScript libraries. They can be used in a static-hosted site; choosing one does not by itself require a backend, user accounts, or a database.

### Library comparison discussed

These complexity assessments were architectural judgments for this product, not benchmark results.

| Approach | Useful capabilities | Complexity and recommendation |
| --- | --- | --- |
| Native SVG and small JavaScript | Bounded diagrams, highlighting, linked ideas, evidence disclosures. | Low while diagram scope and interactions remain simple. Initial field-guide starting point. |
| D3.js | Custom data-driven diagrams, timelines, transitions, and educational explainers. | Moderate; flexible and modular, but much behavior remains custom. Explore for a specific explanation or visualization. |
| Cytoscape.js | Network layouts, filtering, selection, graph queries and analysis. | Moderate for a focused explorer. Strong candidate when users need substantive relationship investigation. |
| Sigma.js | WebGL visualization of networks with thousands of nodes and edges, using Graphology. | Moderate to high for the complete experience. Consider when graph scale creates a demonstrated requirement. |
| Three.js | Interactive 3D graphics. | High relative to the needs discussed. Defer unless a learning task benefits specifically from 3D. |
| Existing Cosmos integration | The repository's existing WebGL network renderer and adapter. | Evaluate reuse before introducing another graphics library. |

### What creates the real maintenance cost

The responsibility extends beyond drawing nodes and lines. The product must handle readable layouts, edge routing, label overlap, selection behavior, filtering, navigation history, shareable state, keyboard use, screen readers, motion preferences, and performance at the chosen scale.

Native SVG is attractive while the diagrams and interactions remain bounded. Once custom code starts implementing substantial automatic layout, pan/zoom, hit-testing, or coordinated selections, a mature library can reduce total maintenance. KISS permits a dependency when it replaces a larger body of custom work.

Two situations were identified where richer interaction can earn its cost:

- **Education:** demonstrate a mechanism, such as stepping through how attention distributes weight across words.
- **Research:** filter relationships by their meaning or evidence, explore a neighborhood, inspect documented connections, and export selected records with sources.

These capabilities are not exclusive to a library. The decision is whether a library makes the required behavior easier to build and maintain.

### Existing implementation discovery

Later repository inspection confirmed that `package.json` already declares `@cosmos.gl/graph`, and `src/network-view.js` imports it through an adapter. The current product already combines HTML with SVG, JavaScript, and WebGL functionality.

The earlier D3/Cytoscape suggestions were therefore exploratory options, not a finding that the project lacks a graphics engine or requires a library migration. Desktop-first exploration makes a focused graph library more worth evaluating, but no replacement library was selected.

## 8. Side-by-side visual comparisons

Two comparison boards were generated to distinguish visual design choices from technical capabilities.

### Current layout versus proposed field guide

The public v1.2.1 interface was opened in light mode and Transformer selected through search. The observed view had a two-row toolbar, timeline canvas, selected node and connections, floating details inspector, collapsed research/evidence sections, 22 listed relationships, and a minimap.

The comparison's left panel was a generated reconstruction of that observed interface. It was explicitly labeled as a reconstruction; it is not a pixel-exact screenshot. The proposed right panel showed a clear topic heading, explanation, original paper, selected connections, and evidence beside the selected relationship.

The visual tradeoff was described as more immediate breadth in the current atlas and more immediate understanding in the proposed reading page. Access to broader connections should remain available.

### Simple field guide versus optional research explorer

The second board kept the visual identity consistent across both panels. The initial version showed linked ideas, selected relationship evidence, and reading links. The optional explorer added relationship/evidence filters, neighborhood expansion, basic graph navigation, shareable view state, and selection export.

The point was that a graphics library primarily supports behavior. Typography, hierarchy, and visual clarity are design decisions available to an HTML-based site.

During review, the generated arrow wording was corrected from "uses" to "used by" where an arrow pointed from Layer normalization into Transformer. Extra navigation items introduced by the image generator were also removed to preserve the simple scope.

The layer-normalization evidence example was checked against *Attention Is All You Need*, section 3.1. Other displayed relationships and controls remained illustrative. The boards do not establish implementation readiness, measured usability, or performance.

## 9. Desktop-first correction and latest layout recommendation

The user clarified that much of the expected use would be on desktop and wanted the design to use the space that mobile lacks. Mobile could be omitted or bare bones for the first release.

The assistant revised the recommendation accordingly:

| Area | Latest proposed behavior |
| --- | --- |
| Main diagram | Approximately two-thirds of the desktop workspace, with readable labels and useful surrounding connections. |
| Persistent details pane | Approximately one-third, containing the selected idea, explanation, papers, and relationship evidence. |
| Selection | Update the details pane while preserving the reader's position and context in the map. |
| Toolbar | One compact toolbar with search and controls relevant to the current task. |
| Education | Short guided sequences highlight ideas and explain them in the same workspace. |
| Research | Free exploration with source inspection; richer graph operations added when justified. |
| Larger monitors | Reveal additional useful context while preserving readable labels and evidence. |
| Mobile | Optional basic list and record reading; interactive map can be deferred. |

The screen proportions are a starting sketch, not fixed specifications. A normal laptop should be comfortable, and larger monitors should provide additional context. Exact breakpoints, pane sizing, resizing behavior, and graph density were not decided.

This direction is closer to the original atlas concept than the earlier centered reading-page proposal. It retains the field guide's readable explanations, typography, bounded attention, and claim-adjacent evidence.

The latest interpretation of KISS is **one coherent workspace with consistent interactions**. Desktop space should support context and evidence. It does not require exposing every filter, mode, and operation at once.

Desktop navigation, keyboard support, readable diagrams, and predictable selection should take priority in the first redesigned release. Mobile is not a blocking launch requirement. The earlier fixed small-diagram guideline and mobile mockups should not be treated as the current primary layout specification.

## 10. Repository strategy: branch, fork, refactor, or new repo

The user asked whether to fork the repository, completely refactor it, or start in a fresh repository.

The recommendation was to **keep the existing repository and develop a replacement desktop UI on a branch, using a separate worktree for its working folder**. This combines a fresh interface implementation with targeted refactoring of the build and integration points.

| Option | Assessment |
| --- | --- |
| New UI on a branch in the existing repo | Best fit for the goals discussed. Preserves one project, one authoritative dataset, and shared history. |
| Refactor the entire project | Broader than necessary. Refactor the parts that obstruct the new interface and publishing flow. |
| Fork | Useful for an independently maintained variant; adds coordination and potential divergence for this use case. |
| Fresh repository | Suitable for a separate product with its own ownership and lifecycle; no such separation was established here. |

A worktree provides a separate local working directory while retaining the repository's history. It gives development isolation without requiring a separate project identity or dataset copy.

### Foundations to retain

The repo already separates canonical historical research data from the maintained application shell. Relevant foundations include:

- `src/data/atlas/`: canonical records, relationships, catalog, and sidecars.
- `canonical-atlas.js`: canonical loading and assembly.
- Research guides, relationship sources, evidence grades, and review states.
- Stable node IDs, reading-page URLs, exports, citation metadata, and compatibility paths.
- Methodology, contribution history, licenses, and editorial governance.
- Existing rendering and layout code where it remains suitable.

The Opportunity data has a distinct purpose and schema. A UI redesign should preserve the distinction between historical associations, capability assessments, and speculative opportunities.

### Integration work that still exists

The current build is coupled to the old application shell. `build.js` injects generated data and renderer bundles into `ai-research-tech-tree.html`, then produces `index.html`. The export/publication flow also has dependencies on the old shell. A new UI therefore requires deliberate separation of these concerns.

Some current validation gates check literal DOM, CSS, and interface structures, including the existing four-view switcher. Carrying those checks over unchanged would enforce the previous design. Data integrity, evidence, stable URL, citation, and publication checks should remain meaningful; obsolete layout-specific checks should be replaced with checks for the new behavior.

The canonical data is reusable, but some fields and projections serve the legacy presentation. A small adaptation layer may be appropriate before considering any wider schema change. Reuse should not create a second manually synchronized dataset.

The intended end state is **one repository, one canonical dataset, one publishing process, and one maintained primary UI**. Temporary coexistence during development should have a clear replacement point. Existing release history can preserve the earlier implementation without obligating indefinite maintenance of two applications.

## 11. Suggested development sequence and unresolved choices

The following sequence consolidates the assistant's recommendations. It is not an approved implementation plan.

1. Develop on a branch and separate worktree when implementation is authorized.
2. Build one complete desktop workflow against the real canonical data: search, select an idea, explore connections, inspect evidence, and open a paper.
3. Use that workflow to evaluate the existing Cosmos integration and determine whether any additional graphics library is justified.
4. Decouple the publishing/data-export pieces that depend on the old shell, preserving stable records, citation identity, and useful compatibility behavior.
5. Validate the new workspace on ordinary laptop and larger desktop layouts, including keyboard navigation, selection context, graph readability, and source access.
6. Check the experience with unfamiliar readers for both learning and investigation. Visual mockups alone do not establish that the workflow works.
7. Replace the old primary interface after validation and an explicit release decision. Remove obsolete UI code and gates as part of that transition.

The first complete workflow is a proof of the approach, not a proposal to replace the full published dataset with a handful of demo records.

Questions still open at the end of the conversation include:

- The final desktop visual identity and precise pane layout.
- The first-launch landing state: whole-field orientation, a featured topic, or another focused entry point.
- Which broader map behaviors deserve first-release scope and which can follow later.
- How relationship types, evidence levels, and educational paths appear without overwhelming the reader.
- Whether Cosmos covers the needed interactions or another focused library is a better fit.
- The appropriate default neighborhood size and the rules for expanding it.
- The first topic or case study to validate in depth.
- Exact preview, migration, URL compatibility, and release arrangements.
- The minimal mobile fallback, if any.
- Whether the mockup images should eventually be committed as repository assets.

The conversation produced design recommendations and image artifacts. It did not produce a functioning redesigned frontend, benchmark the proposed alternatives, select a final library, create a development branch, fork the project, or authorize deployment.

## 12. Artifact inventory

Eight final mockup images were saved across three sets. All were generated with the built-in image generation tool. Exact prompts are retained with each set; the comparison prompt file also records the final corrections.

These artifacts currently live in the local workspace **outside this Git repository**. The relative links below resolve from this checkout in its original `C:\Projects\Work` layout. They will not resolve as committed assets on GitHub. This documentation task does not copy or add the images to the repository.

| Set | Local artifact | Purpose |
| --- | --- | --- |
| Initial concepts, 2026-09-07 | [01-explore.png](../output/ai-tech-tree-mockups-2026-09-07/01-explore.png) | Dark desktop atlas with simplified navigation. |
| Initial concepts, 2026-09-07 | [02-research.png](../output/ai-tech-tree-mockups-2026-09-07/02-research.png) | Focused desktop research view and inspector. |
| Initial concepts, 2026-09-07 | [03-mobile.png](../output/ai-tech-tree-mockups-2026-09-07/03-mobile.png) | Early small-screen concept; not a current launch priority. |
| Clean-slate concepts, 2026-09-07 | [01-field-guide-home.png](../output/ai-tech-tree-from-scratch-2026-09-07/01-field-guide-home.png) | Editorial discovery homepage. |
| Clean-slate concepts, 2026-09-07 | [02-idea-page.png](../output/ai-tech-tree-from-scratch-2026-09-07/02-idea-page.png) | Transformer reading page and inline evidence. |
| Clean-slate concepts, 2026-09-07 | [03-question-mobile.png](../output/ai-tech-tree-from-scratch-2026-09-07/03-question-mobile.png) | Open-question record on a narrow screen. |
| Comparisons, 2026-09-08 | [01-current-vs-proposed.png](../output/ai-tech-tree-comparison-2026-09-08/01-current-vs-proposed.png) | Reconstructed live layout beside the proposed field guide. |
| Comparisons, 2026-09-08 | [02-what-a-graphics-library-adds.png](../output/ai-tech-tree-comparison-2026-09-08/02-what-a-graphics-library-adds.png) | Shared design with optional deeper graph investigation. |

Supporting local notes and prompts:

- Initial concepts: [README](../output/ai-tech-tree-mockups-2026-09-07/README.md), [prompts](../output/ai-tech-tree-mockups-2026-09-07/PROMPTS.md).
- Clean-slate concepts: [design notes](../output/ai-tech-tree-from-scratch-2026-09-07/DESIGN.md), [prompts](../output/ai-tech-tree-from-scratch-2026-09-07/PROMPTS.md).
- Comparisons: [README](../output/ai-tech-tree-comparison-2026-09-08/README.md), [prompts and corrections](../output/ai-tech-tree-comparison-2026-09-08/PROMPTS.md).

The mockups predate the explicit desktop-first correction. No new image set demonstrating the final large-diagram/persistent-pane recommendation was generated after that correction in this conversation.

## 13. Sources and repository references consulted

Repository references:

- [README and repository map](README.md).
- [Package and dependency declarations](package.json).
- [Canonical atlas loader](canonical-atlas.js).
- [Knowledge-graph generation](generate-knowledge-graph.js).
- [Application build](build.js).
- [Existing Cosmos network adapter](src/network-view.js).
- [UI layout gate](ui-layout-gate.js).
- [Public artifact staging configuration](config/pages-stage.v1.json).
- [Pages release workflow](.github/workflows/pages.yml).
- [Public interface](https://neb6dav.github.io/ai_tech_tree/).

External documentation consulted during the graphics discussion:

- [SVG documentation](https://developer.mozilla.org/en-US/docs/Web/SVG).
- [D3: What is D3?](https://d3js.org/what-is-d3).
- [Cytoscape.js documentation](https://js.cytoscape.org/).
- [Sigma.js introduction](https://www.sigmajs.org/docs/).
- [Three.js](https://threejs.org/).
- [Attention Is All You Need, section 3.1](https://arxiv.org/html/1706.03762v7#S3.SS1), for the normalization relationship used in the comparison.

These references support the observations and technical discussion. They do not constitute a comprehensive literature review or a scientific validation of the illustrative graph paths.
