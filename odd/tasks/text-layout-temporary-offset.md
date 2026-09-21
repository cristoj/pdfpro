# Temporary Editor Text Offset

## Goal
Restore the pre-migration text rendering path and apply a reversible 4px downward editor-overlay offset.

## Scope
- Revert canonical layout/font embedding changes made during this investigation.
- Preserve unrelated working-tree changes, especially `README.md`.
- Apply the 4px offset consistently when rendering and persisting drag/click positions.

## Tasks
- [x] Restore the stable pre-migration implementation.
- [x] Add the reversible 4px edit-overlay offset.
- [x] Run focused regression tests.
- [ ] Obtain user visual confirmation.

## Non-goal
This is a temporary compatibility fallback, not the long-term structural preview solution.
