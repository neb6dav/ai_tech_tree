# Third-party notices

The AI Research Tech Tree cites and links third-party scholarship, archives, repositories, encyclopedic material, software, and public-domain editions. Those materials remain subject to their own copyright, license, access, attribution, trademark, and database terms. Inclusion in the atlas does not relicense them or imply endorsement by their authors or publishers.

## Research and reference material

### Papers, books, reports, datasets, and standards

Bibliographic facts, identifiers, links, and short attributed excerpts may appear in atlas records. The underlying works are not distributed under the atlas content license unless their record expressly says so. Follow the rights statement at the linked publisher, repository, archive, or edition. “Publicly accessible” and “public domain” are not interchangeable.

### arXiv

The atlas links arXiv identifiers and record pages. Authors retain rights subject to the license selected for each submission and arXiv's terms. An arXiv link does not establish peer-review status and does not grant this project rights to redistribute the paper.

- arXiv help and policies: <https://info.arxiv.org/help/index.html>
- arXiv licenses: <https://info.arxiv.org/help/license/index.html>

### Wikipedia and Wikimedia

The atlas uses Wikipedia pages and revision identifiers for orientation, chronology cross-checking, and source discovery. Wikipedia and Wikimedia content remain subject to the applicable Wikimedia terms and licenses. A revision link does not mean Wikipedia independently verifies every atlas claim.

- Wikimedia Terms of Use: <https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use>
- Wikipedia copyright information: <https://en.wikipedia.org/wiki/Wikipedia:Copyrights>

## Software

### @cosmos.gl/graph 3.4.0

The 2-D Network view uses `@cosmos.gl/graph` version 3.4.0, distributed under the MIT License. The project does not use or bundle `@cosmograph/cosmograph`.

- Source: <https://github.com/cosmosgl/graph>
- Package: <https://www.npmjs.com/package/@cosmos.gl/graph>

### esbuild 0.25.12

The development build uses esbuild version 0.25.12 under the MIT License.

- Source: <https://github.com/evanw/esbuild>

### entities 8.0.0

The publication-contract validator uses `entities` version 8.0.0 under the BSD 2-Clause License to decode HTML attributes according to browser-compatible entity rules.

- Source: <https://github.com/fb55/entities>

### yaml 2.9.0

The release-identity gate uses `yaml` version 2.9.0 under the ISC License to parse `CITATION.cff` with strict duplicate-key checks.

- Source: <https://github.com/eemeli/yaml>
- Documentation: <https://eemeli.org/yaml/>

### Transitive dependencies

Exact direct and transitive package versions and integrity hashes are recorded in `package-lock.json`. Their license identifiers are recorded in package metadata, and retained legal comments are emitted with the generated network bundle where provided by the packages. Notable transitive families include luma.gl, math.gl, probe.gl, D3 modules, DOMPurify, gl-matrix, random, and seedrandom; each remains under its own license.

Run `npm ci` from the committed lockfile to reproduce the dependency tree. If a dependency or bundled asset changes, update this notice and review the resulting license obligations before release.

## Corrections

If an attribution, rights statement, source link, or public-domain designation is incomplete or incorrect, open a correction issue. Rights concerns should identify the affected stable node or relationship ID and the work in question without uploading restricted material.
