/**
 * Coordinate transformation utility for PDF bounding boxes.
 * Dynamically scales normalized (0.0 to 1.0) or point-based coordinates
 * to the rendered HTML5 canvas pixel dimensions.
 */
export function transformCoordinates(box, canvasWidth, canvasHeight, originalPage = null) {
  if (!box || canvasWidth <= 0 || canvasHeight <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  const { x0 = 0, y0 = 0, x1 = 0, y1 = 0 } = box;

  // Case 1: Point-based coordinates with explicit original page dimensions
  if (originalPage && originalPage.width > 0 && originalPage.height > 0) {
    const scaleX = canvasWidth / originalPage.width;
    const scaleY = canvasHeight / originalPage.height;
    return {
      left: x0 * scaleX,
      top: y0 * scaleY,
      width: Math.max(0, (x1 - x0) * scaleX),
      height: Math.max(0, (y1 - y0) * scaleY),
    };
  }

  // Case 2: Normalized coordinates (0.0 <= x, y <= 1.0)
  if (x1 <= 1.0 && y1 <= 1.0) {
    return {
      left: x0 * canvasWidth,
      top: y0 * canvasHeight,
      width: Math.max(0, (x1 - x0) * canvasWidth),
      height: Math.max(0, (y1 - y0) * canvasHeight),
    };
  }

  // Case 3: Fallback assuming standard PDF points (Letter: 612 x 792) if coords > 1.0 without originalPage
  const assumedWidth = 612;
  const assumedHeight = 792;
  const scaleX = canvasWidth / assumedWidth;
  const scaleY = canvasHeight / assumedHeight;

  return {
    left: x0 * scaleX,
    top: y0 * scaleY,
    width: Math.max(0, (x1 - x0) * scaleX),
    height: Math.max(0, (y1 - y0) * scaleY),
  };
}
