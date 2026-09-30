/**
 * Coordinate transformation utility for PDF bounding boxes.
 * Dynamically scales normalized (0.0 to 1.0) or point-based coordinates
 * to the rendered HTML5 canvas CSS layout pixel dimensions.
 *
 * Invariant: Completely decoupled from hardware window.devicePixelRatio.
 * Always operates on the unscaled CSS layout width and height.
 */
export function transformCoordinates(box, canvasWidth, canvasHeight, originalPage = null) {
  if (!box || !canvasWidth || !canvasHeight || canvasWidth <= 0 || canvasHeight <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  const raw = box.bounding_box || box;
  if (!raw || typeof raw !== 'object') {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  const {
    norm_x0,
    norm_y0,
    norm_x1,
    norm_y1,
    x0 = 0,
    y0 = 0,
    x1 = 0,
    y1 = 0,
  } = raw;

  // Case 1: Normalized coordinates explicitly provided (norm_x0, norm_y0, ...)
  if (
    norm_x0 !== undefined &&
    norm_y0 !== undefined &&
    norm_x1 !== undefined &&
    norm_y1 !== undefined
  ) {
    return {
      left: Number(norm_x0) * canvasWidth,
      top: Number(norm_y0) * canvasHeight,
      width: Math.max(0, (Number(norm_x1) - Number(norm_x0)) * canvasWidth),
      height: Math.max(0, (Number(norm_y1) - Number(norm_y0)) * canvasHeight),
    };
  }

  // Case 2: Point-based coordinates with explicit original page dimensions
  if (originalPage && originalPage.width > 0 && originalPage.height > 0) {
    const scaleX = canvasWidth / originalPage.width;
    const scaleY = canvasHeight / originalPage.height;
    return {
      left: Number(x0) * scaleX,
      top: Number(y0) * scaleY,
      width: Math.max(0, (Number(x1) - Number(x0)) * scaleX),
      height: Math.max(0, (Number(y1) - Number(y0)) * scaleY),
    };
  }

  // Case 3: Normalized coordinates in standard x0/y0 fields (0.0 <= coords <= 1.0)
  if (
    Number(x1) <= 1.0 &&
    Number(y1) <= 1.0 &&
    (Number(x0) > 0 || Number(y0) > 0 || Number(x1) > 0 || Number(y1) > 0)
  ) {
    return {
      left: Number(x0) * canvasWidth,
      top: Number(y0) * canvasHeight,
      width: Math.max(0, (Number(x1) - Number(x0)) * canvasWidth),
      height: Math.max(0, (Number(y1) - Number(y0)) * canvasHeight),
    };
  }

  // Case 4: Fallback assuming standard PDF points (Letter: 612 x 792)
  const assumedWidth = 612;
  const assumedHeight = 792;
  const scaleX = canvasWidth / assumedWidth;
  const scaleY = canvasHeight / assumedHeight;

  return {
    left: Number(x0) * scaleX,
    top: Number(y0) * scaleY,
    width: Math.max(0, (Number(x1) - Number(x0)) * scaleX),
    height: Math.max(0, (Number(y1) - Number(y0)) * scaleY),
  };
}
