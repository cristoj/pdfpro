# PDF text coordinate invariant

## Goal
Keep persisted text-block coordinates in PDF points with a bottom-left origin regardless of editor zoom. The temporary display offset must remain presentation-only and symmetric across rendering, creation, and drag persistence.

## Resolved workflow
- Mode: ODD delegated direct
- TDD: enabled by project instruction
- RED/GREEN runner: `npx vitest run src/client/utils/textCoordinates.test.js`
- Focused regression runner: `npx vitest run src/client/utils/textCoordinates.test.js src/server/routes/tools.test.js src/server/services/pdfService.test.js`

## Tasks
- [x] Add an isolated geometry utility and RED regression tests for creation, rerender, drag, and the temporary offset at 100%, 200%, and 300% zoom. RED reproduced creation y drift: 436, 434, and 433.333… instead of 432.
- [x] Apply the minimum client integration change so creation, rendering, and drag use the same coordinate contract.
- [x] Correct the 300% page-view CSS presentation scale so the canvas and overlay have identical CSS dimensions; add a browser regression for zoomed text placement. RED proved `max-width: 100%` shrank a 1785px backing canvas to 1011.984px CSS width.
- [x] Run focused tests, build, diagnostics, and a visual real-PDF validation at 100% and 300%. Focused suite: 49/49; Chromium E2E: 8/8; build passed. A real PDF in Chrome kept canvas/layer dimensions equal at both zooms; a 100% drag from (239.5, 364) to (329.5, 334) rerendered at 300% as (988.5, 994), exactly matching the scaled offset-aware expectation.

## Follow-up from user visual evidence
- [x] Trace the complete client payload → API route → session → PDF export path for text created at 100% and 200%; reproduce the zoom-dependent export coordinates with an integration-level test before changing production code. Server preserves `{x,y}` and exports directly.
- [x] Add a real-browser payload test for equivalent 100% and 200% clicks. Observed payloads: 100% `{x:239.5,y:300}`, 200% `{x:240,y:300}`; vertical PDF coordinate is exactly invariant.
- [x] Diagnose and correct the remaining editor-top vs PDF-text-baseline mismatch independently of zoom. User selected the minimal baseline-anchor correction: persisted `y` is now the first-line PDF baseline; Helvetica/Courier ascent mapping applies in click, render, and drag; editor line-height is 1.2.

## Same-font follow-up
- [x] Replace the ratio-based preview/export approximation with owned Noto Sans Regular/Bold/Italic/BoldItalic TTF assets, loading and embedding the same bytes in browser and pdf-lib; preserve the PDF-baseline and zoom-invariant coordinate contract. User authorized the four-style package. Real-PDF test verifies all four embedded styles and no Helvetica/Courier fallback.

## Residual shared-font alignment
- [x] Remove the editor block's 2px/4px content inset after a regression test proves it is the remaining same-font preview/export offset; retain selection affordance with a non-layout outline. Browser regression confirms 0px horizontal/vertical content inset.

## Delivery evidence
- Commit: `0751f6c` (`fix(pdf): align editor and export text`)
- Verification before delivery: 54 focused Vitest tests, 11 Chromium E2E tests, `npm run build`, and `git diff --check` passed.

## Constraints
- Do not modify `README.md`; its current change is pre-existing.
- `odd/` is intentional tracking.
- Do not change fonts, font metrics, or preview architecture unless geometry tests prove zoom is not causal.
- Do not commit.
