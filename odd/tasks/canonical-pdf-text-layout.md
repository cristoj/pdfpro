# Canonical PDF Text Layout

## Goal
Make edited text render identically in the editor and exported PDF without pixel offsets.

## Contract
- Persist text coordinates in PDF points with `anchor: "baseline-left"`.
- Persist explicit `lineHeight` and `schemaVersion: 2`.
- Use one font registry and one set of coordinate conversions.
- Keep selection chrome outside the content anchor.
- Convert legacy top-left blocks deterministically when loaded.

## Tasks
- [x] Define the shared text-layout contract and pure conversions.
- [x] Migrate client rendering and block creation to baseline coordinates.
- [x] Normalize server persistence/export and legacy blocks.
- [x] Add unit, API, and geometry regression coverage.
- [x] Run focused unit/API verification and document limitations.
- [x] Bundle one canonical font source for browser and PDF export.
- [x] Embed that font source in PDF export and migrate logical font mappings.
- [x] Restore the deterministic shared PDF-space baseline offset for editor placement and overlay-to-PDF conversion.
- [x] Preserve canonical schema metadata on every client text-block add/update persistence payload.
- [x] Replace residual-drift ascent calibration with checked-in bundled Noto metrics.
- [x] Preserve v2 canonical baselines while versioning legacy v1 migration compatibility.
- [x] Verify browser/PDF font parity and font-byte metric metadata with regression coverage.

## Font parity migration
- `NotoSans` is the persisted logical font ID for all newly created and normalized blocks.
- Browser `@font-face` URLs and server export both use the same four files in `public/fonts/`.
- Existing `Helvetica` blocks normalize to `NotoSans`. Existing `Courier` blocks also normalize to proportional Noto Sans because the bundled Noto Mono installation lacks the complete regular/bold/italic/bold-italic variant set. Their next save persists `NotoSans`; no baseline migration is reapplied to explicit v2 blocks.

## Open verification
Noto Sans is bundled and embedded in exports. Browser editor placement and overlay-to-PDF conversion use the same deterministic PDF-space baseline offset; CSS Canvas/DOM metrics must not participate in coordinate conversion. Browser/PDF visual regression coverage remains to be completed.

## Acceptance criteria
- A newly created multiline block has matching baseline geometry in editor and export.
- Zoom does not alter persisted PDF-space coordinates.
- Legacy blocks remain exportable through a deterministic compatibility conversion.
- Unversioned text payloads migrate once from legacy top-left coordinates; explicit v2 baseline-left payloads remain canonical.
- A font-size-only update recomputes default line height while explicit custom line height is preserved.
- Font, line-height, and anchor semantics are explicit.
