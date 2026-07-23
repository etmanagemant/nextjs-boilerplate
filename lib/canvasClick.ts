/**
 * These live-view canvases render a screenshot via CSS object-fit: contain
 * inside a box whose aspect ratio rarely matches the screenshot's 16:9 -
 * that leaves blank letterbox bars on two sides. getBoundingClientRect()
 * only reports the full box, not the actually-rendered content rect, so
 * mapping clicks off the box alone silently shifts every click by however
 * wide those bars are. That's what made clicks land on the wrong element
 * (a checkbox needing a click "somewhere else", a category list selecting
 * the row below the one clicked).
 *
 * Returns null when the click landed inside a letterbox bar - there's
 * nothing real to click there.
 */
export function mapClickToCanvasCoords(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0 || canvas.width === 0 || canvas.height === 0) {
    return null;
  }

  const contentAspect = canvas.width / canvas.height;
  const boxAspect = rect.width / rect.height;

  let renderedWidth = rect.width;
  let renderedHeight = rect.height;
  let offsetX = 0;
  let offsetY = 0;

  if (contentAspect > boxAspect) {
    // Content is relatively wider than the box - letterboxed top/bottom.
    renderedHeight = rect.width / contentAspect;
    offsetY = (rect.height - renderedHeight) / 2;
  } else {
    // Content is relatively taller than the box - letterboxed left/right.
    renderedWidth = rect.height * contentAspect;
    offsetX = (rect.width - renderedWidth) / 2;
  }

  const contentX = clientX - rect.left - offsetX;
  const contentY = clientY - rect.top - offsetY;

  if (contentX < 0 || contentX > renderedWidth || contentY < 0 || contentY > renderedHeight) {
    return null;
  }

  return {
    x: (contentX / renderedWidth) * canvas.width,
    y: (contentY / renderedHeight) * canvas.height,
  };
}
