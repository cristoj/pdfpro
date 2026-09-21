export const TEMPORARY_EDIT_OVERLAY_OFFSET_PX = 4;

/**
 * Noto Sans hhea ascender (1069 units per 1000-unit em).
 * Both legacy UI IDs resolve to this owned font family and therefore share it.
 */
export const NOTO_SANS_ASCENT_RATIO = 1.069;

function fontAscentPt(fontSize) {
  return fontSize * NOTO_SANS_ASCENT_RATIO;
}

export function pdfToTextOverlayCoordinates(
  { x, y },
  { pageHeightPt, zoom, fontSize, fontFamily },
) {
  return {
    left: x * zoom,
    top:
      (pageHeightPt - y - fontAscentPt(fontSize)) * zoom +
      TEMPORARY_EDIT_OVERLAY_OFFSET_PX,
  };
}

export function textOverlayToPdfCoordinates(
  { left, top },
  { pageHeightPt, zoom, fontSize, fontFamily },
) {
  return {
    x: left / zoom,
    y:
      pageHeightPt -
      (top - TEMPORARY_EDIT_OVERLAY_OFFSET_PX) / zoom -
      fontAscentPt(fontSize),
  };
}

export function textLayerClickToPdfCoordinates(
  { left, top },
  { pageHeightPt, zoom, fontSize, fontFamily },
) {
  return {
    x: left / zoom,
    y: pageHeightPt - top / zoom - fontAscentPt(fontSize),
  };
}
