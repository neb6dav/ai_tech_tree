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

The desktop workspace has no third-party runtime dependencies. Development and
validation tools are pinned in `package-lock.json`; their package metadata and
installed license files retain the applicable terms. Current direct tools are
Playwright, Lighthouse, chrome-launcher, entities, and axe-core. They are not
shipped inside the application.

Earlier releases used `@cosmos.gl/graph` 3.4.0 and esbuild 0.25.12 (MIT).
Their bundles and associated transitive graphics dependencies were removed in
the desktop workspace candidate. Historical sources and notices remain in Git:
[Cosmos](https://github.com/cosmosgl/graph),
[esbuild](https://github.com/evanw/esbuild).

Run `npm ci` from the committed lockfile to reproduce the development tools.
Review licenses when changing dependencies or bundled assets.
## Corrections

If an attribution, rights statement, source link, or public-domain designation is incomplete or incorrect, open a correction issue. Rights concerns should identify the affected stable node or relationship ID and the work in question without uploading restricted material.
