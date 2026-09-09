# Desktop workspace validation

Candidate: `2.0.0-rc.1`, branch `codex/desktop-research-workspace`.
Scope and acceptance: [desktop redesign](DESKTOP_REDESIGN.md).
This record describes a local review candidate, not a public deployment.

## Artifact and data checks

Measured on Windows x64 with Node.js 24.14.1, npm 11.11.0 and the committed
lockfile. `npm ci --offline`, build, staging and the full fast validation gate
passed. The gate includes malformed-data probes, CSP coverage, canonical export
parity, generated reading pages, compatibility URLs and staged resource closure.

| Measurement | Candidate | Comparison or limit |
| --- | ---: | ---: |
| Initial HTML, raw bytes | 1,498,246 | Published v1.2.1: 4,591,487 |
| Initial HTML, gzip level 9 | 204,337 bytes | Limit: 245,760 bytes |
| Observed active DOM peak | 1,116 elements | Limit: 3,500 |
| Canonical records / relationships | 339 / 711 | Unchanged |
| Static record pages / sitemap URLs | 339 / 340 | Unchanged |
| Staged internal references checked | 5,934 | 349 unique resources |

The raw HTML is 67.4% smaller. Gzip is an artifact measurement, not evidence of
live-server transfer encoding. The DOM peak is from the automated navigation
suite, not an exhaustive bound over every possible user session. There are no
external runtime dependencies. The canonical JSON, JSON-LD, NDJSON, layout and
dataset citation files have no changes against the branch base.

The dataset remains edition `2026-08-21-stable-1`, with semantic digest
`865174514ba64e20d6f2a90471a6766b6d5fa18f5b0e62c85d9601de077a50f2`.
The supplemental Transformer pilot does not alter canonical evidence grades.

## Browser and performance checks

Playwright 1.62.1 checks actual staged pages at 1366x768 and 1280x720, light and
dark themes, real pointer and keyboard selection, search, URL/history recovery,
learning paths, all Opportunity collections, sharing, dialogs, narrow reading,
offline operation and script-disabled access. axe-core 4.13.0 scans the
interactive views and representative reading pages.

Chromium and Firefox each passed all 11 tests on the final staged UI, including
the full axe rule set. Windows WebKit encountered intermittent Playwright
element-stability timeouts; it is not reported as a passing full suite.
Windows WebKit also cannot supply the canvas pixel data needed by axe color contrast;
that one rule is explicitly excluded on that engine/platform combination.
Chromium, Firefox and Linux WebKit retain the full rule set. Browser console and
page errors remain failures on every engine. WebKit testing does not constitute
testing Safari on macOS.

Lighthouse 13.4.1 passed the existing budget with three Windows localhost runs:
median score 58, first and largest contentful paint 8,035.488 ms, total blocking
time 0 ms and cumulative layout shift 0. The model transferred the uncompressed
1.50 MB document. Its score remains below the future 90-point target.
The measured initial HTML SHA-256 is
`f418f81d7421a2ae5fd75dacdb01510784637f4a21d7f6af95b4d72cd3155634`.

Lighthouse retains the historical simulated mobile profile for comparison.
These localhost results describe that model and environment; they are not
live-origin measurements or a desktop performance score. Ubuntu confirmation
is recorded in the candidate workflow run.

## Review and promotion boundaries

- Independent code review checked the UI and corrected Opportunity record
  classification, chronology, constraint links and source warning visibility.
- The 22-relationship primary-source pilot is AI-assisted and still
  `pending_curator_review`. Source-level curator approval is outstanding.
- An unfamiliar reader still needs to explain a connection and open its source
  within two minutes. Automated tests cannot establish the HN first impression.
- Every PR checks staged Chromium behavior and axe accessibility. The manual
  candidate workflow also checks Firefox, WebKit and Lighthouse on Ubuntu 24.04.
  Public Pages promotion remains a separate guarded action.
- The Combinatorial Lens and Hypothesis Workbench remain future roadmap work;
  this candidate preserves their data and evidence boundaries.

Screenshots in the README and social card capture the implemented UI. Neither
the candidate version nor those screenshots imply a tagged or deployed release.
