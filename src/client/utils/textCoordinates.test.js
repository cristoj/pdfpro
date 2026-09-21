import { describe, expect, it } from "vitest";
import {
  NOTO_SANS_ASCENT_RATIO,
  TEMPORARY_EDIT_OVERLAY_OFFSET_PX,
  pdfToTextOverlayCoordinates,
  textLayerClickToPdfCoordinates,
  textOverlayToPdfCoordinates,
} from "./textCoordinates.js";

const PAGE_HEIGHT_PT = 792;
const PDF_BLOCK = { x: 144, y: 288, fontSize: 14 };
const NOTO_SANS_ASCENT_PT = PDF_BLOCK.fontSize * NOTO_SANS_ASCENT_RATIO;
const ZOOM_LEVELS = [1, 2, 3];

function geometry(zoom, fontFamily = "Helvetica") {
  return { pageHeightPt: PAGE_HEIGHT_PT, zoom, fontSize: 14, fontFamily };
}

function expectPdfCoordinates(actual, expected) {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
}

describe("text coordinates", () => {
  it.each(ZOOM_LEVELS)(
    "keeps PDF-point coordinates invariant through overlay conversion at %dx zoom",
    (zoom) => {
      const overlay = pdfToTextOverlayCoordinates(PDF_BLOCK, geometry(zoom));

      expect(overlay).toEqual({
        left: 144 * zoom,
        top:
          (PAGE_HEIGHT_PT - PDF_BLOCK.y - NOTO_SANS_ASCENT_PT) * zoom +
          TEMPORARY_EDIT_OVERLAY_OFFSET_PX,
      });
      expectPdfCoordinates(
        textOverlayToPdfCoordinates(overlay, geometry(zoom)),
        PDF_BLOCK,
      );
    },
  );

  it.each(ZOOM_LEVELS)(
    "creates a PDF block at the raw text-layer click position at %dx zoom",
    (zoom) => {
      const baseline = { x: 240, y: 432, fontSize: 14 };
      const click = {
        left: baseline.x * zoom,
        top: (PAGE_HEIGHT_PT - baseline.y - NOTO_SANS_ASCENT_PT) * zoom,
      };
      const persisted = textLayerClickToPdfCoordinates(click, geometry(zoom));

      expectPdfCoordinates(persisted, baseline);
      expect(pdfToTextOverlayCoordinates(persisted, geometry(zoom))).toEqual({
        left: click.left,
        top: click.top + TEMPORARY_EDIT_OVERLAY_OFFSET_PX,
      });
    },
  );

  it.each(ZOOM_LEVELS)(
    "uses Noto Sans's ascent ratio for both legacy font IDs at %dx zoom",
    (zoom) => {
      const legacyCourierBlock = { ...PDF_BLOCK, fontFamily: "Courier" };
      const legacyCourierGeometry = geometry(zoom, legacyCourierBlock.fontFamily);
      const click = {
        left: legacyCourierBlock.x * zoom,
        top: (PAGE_HEIGHT_PT - legacyCourierBlock.y - NOTO_SANS_ASCENT_PT) * zoom,
      };
      const overlay = pdfToTextOverlayCoordinates(legacyCourierBlock, legacyCourierGeometry);
      const draggedOverlay = {
        left: overlay.left + 30 * zoom,
        top: overlay.top - 18 * zoom,
      };

      expect(NOTO_SANS_ASCENT_RATIO).toBe(1.069);
      expectPdfCoordinates(
        textLayerClickToPdfCoordinates(click, legacyCourierGeometry),
        legacyCourierBlock,
      );
      expect(overlay).toEqual({
        left: legacyCourierBlock.x * zoom,
        top:
          (PAGE_HEIGHT_PT - legacyCourierBlock.y - NOTO_SANS_ASCENT_PT) * zoom +
          TEMPORARY_EDIT_OVERLAY_OFFSET_PX,
      });
      expectPdfCoordinates(
        textOverlayToPdfCoordinates(draggedOverlay, legacyCourierGeometry),
        { x: 174, y: 306 },
      );
    },
  );

  it.each(ZOOM_LEVELS)(
    "rerenders the same persisted PDF block at %dx zoom after changing zoom",
    (zoom) => {
      const reloaded = { ...PDF_BLOCK };

      expect(pdfToTextOverlayCoordinates(reloaded, geometry(zoom))).toEqual({
        left: PDF_BLOCK.x * zoom,
        top:
          (PAGE_HEIGHT_PT - PDF_BLOCK.y - NOTO_SANS_ASCENT_PT) * zoom + 4,
      });
      expect(reloaded).toEqual(PDF_BLOCK);
    },
  );

  it.each(ZOOM_LEVELS)(
    "persists a drag in PDF points and restores its visual position at %dx zoom",
    (zoom) => {
      const startingOverlay = pdfToTextOverlayCoordinates(
        PDF_BLOCK,
        geometry(zoom),
      );
      const draggedOverlay = {
        left: startingOverlay.left + 30 * zoom,
        top: startingOverlay.top - 18 * zoom,
      };
      const persisted = textOverlayToPdfCoordinates(
        draggedOverlay,
        geometry(zoom),
      );

      expectPdfCoordinates(persisted, { x: 174, y: 306 });
      expect(pdfToTextOverlayCoordinates(persisted, geometry(zoom))).toEqual(
        draggedOverlay,
      );
    },
  );

  it.each(ZOOM_LEVELS)(
    "applies and removes the 4px visual offset after and before zoom at %dx",
    (zoom) => {
      const visual = pdfToTextOverlayCoordinates(PDF_BLOCK, geometry(zoom));
      const unoffsetTop =
        (PAGE_HEIGHT_PT - PDF_BLOCK.y - NOTO_SANS_ASCENT_PT) * zoom;

      expect(visual.top - unoffsetTop).toBe(
        TEMPORARY_EDIT_OVERLAY_OFFSET_PX,
      );
      expectPdfCoordinates(
        textOverlayToPdfCoordinates(visual, geometry(zoom)),
        PDF_BLOCK,
      );
    },
  );

  it("renders a baseline-anchored block above its PDF baseline", () => {
    const overlay = pdfToTextOverlayCoordinates(PDF_BLOCK, geometry(1));

    expect(overlay.top).not.toBe(PAGE_HEIGHT_PT - PDF_BLOCK.y);
    expect(overlay.top).toBeCloseTo(
      PAGE_HEIGHT_PT - PDF_BLOCK.y - NOTO_SANS_ASCENT_PT +
        TEMPORARY_EDIT_OVERLAY_OFFSET_PX,
    );
  });
});
