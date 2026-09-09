## Summary

Explain the smallest complete change and why it improves the atlas without weakening the frozen v1 public contract.

## Change type

- [ ] Node correction
- [ ] New development or open direction
- [ ] Relationship correction or addition
- [ ] Source or evidence-review update
- [ ] Interface or accessibility change
- [ ] Build, export, test, or documentation change

## Affected records

List every stable node and relationship ID changed. If no record changes, write “none.”

## Evidence and editorial reasoning

For each substantive research change, include:

- the exact prior claim and proposed claim;
- DOI, arXiv ID, stable URL, ISBN, or full citation;
- page, section, figure, table, revision, or other locator where practical;
- what the source directly supports;
- what remains interpretation; and
- conflicting sources or uncertainty.

For relationships, also state source → target direction, relationship meaning, type, and evidence/review state. Explain any change to network semantics.

## Generated artifacts

- [ ] I changed maintained source rather than hand-editing generated output.
- [ ] I ran the build and committed its generated changes to `index.html`, the compatibility redirect, `nodes/`, sitemap, and/or graph sidecars as applicable.
- [ ] I inspected the generated diff for unrelated changes.

## Validation

- [ ] `npm ci`
- [ ] `npm run build`
- [ ] `npm run test:fast`
- [ ] `node --test tests/workspace-browser.test.mjs` with Chromium installed
- [ ] `git diff --exit-code` after committing generated artifacts
- [ ] I tested relevant behavior in light and dark themes.
- [ ] I tested relevant behavior in Explore, Learn, Opportunity, and List views, or explained why a view is unaffected.
- [ ] I checked keyboard and reduced-motion behavior when the interface changed.

Maintainers preparing a release candidate install Chromium, Firefox and WebKit,
run `npm test`, and repeat the browser suite with `AI_TREE_BROWSER=firefox` and
`AI_TREE_BROWSER=webkit`. That manual tier adds Lighthouse and engine coverage.

## Material AI assistance

State the tools used, what they did, and what you personally verified. Write “none” if no AI tool materially assisted this change. AI output is not accepted as evidence.

## Rights and conduct

- [ ] I have the right to submit this contribution and have identified third-party material.
- [ ] I understand that accepted code is licensed under MIT and accepted original atlas content/data under CC BY-SA 4.0.
- [ ] I have not submitted confidential information or unlawfully reproduced third-party material.
- [ ] I agree to follow the Code of Conduct.

## Reviewer notes

Flag any part that needs domain expertise, source access, a design decision, or follow-up review.
