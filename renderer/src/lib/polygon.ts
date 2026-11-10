// Point-in-polygon hit testing (ray casting) + helpers for the hunt game.
// All polygons are stored as normalized points { x: 0..1, y: 0..1 } so they
// map correctly at any rendered image size.
//
// Ported from the hunt-link-quest Base44 project with types added and the
// logic untouched, so it stays easy to diff against the original.

export type Point = { x: number; y: number };
export type Polygon = Point[];
export type HuntItem = { name: string; regions?: Polygon[]; polygon?: Polygon };

export function pointInPolygon(point: [number, number], polygon: Polygon): boolean {
  if (!polygon || polygon.length < 3) return false;
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Returns an item's list of regions (each region is a polygon of points).
// Supports both the current "regions" (array of polygons) shape and the
// legacy single "polygon" shape for older saved games.
export function getRegions(item: HuntItem): Polygon[] {
  if (item.regions && item.regions.length) return item.regions;
  if (item.polygon && item.polygon.length) return [item.polygon];
  return [];
}

export function pointInAnyPolygon(point: [number, number], regions: Polygon[]): boolean {
  return regions.some((polygon) => pointInPolygon(point, polygon));
}

// Some AI-detected regions come back as pixel coordinates instead of the
// normalized 0..1 coordinates we store. This detects that (any coordinate > 1)
// and rescales using the image's actual natural dimensions, so old/bad data
// still hit-tests and renders correctly.
export function normalizeRegions(regions: Polygon[], w: number, h: number): Polygon[] {
  if (!regions || !regions.length || !w || !h) return regions;
  return regions.map((polygon) =>
    polygon.map((p) => ({
      x: p.x > 1 ? p.x / w : p.x,
      y: p.y > 1 ? p.y / h : p.y,
    })),
  );
}

export function polygonCentroid(polygon: Polygon): Point {
  if (!polygon || polygon.length === 0) return { x: 0, y: 0 };
  let cx = 0;
  let cy = 0;
  polygon.forEach((p) => {
    cx += p.x;
    cy += p.y;
  });
  return { x: cx / polygon.length, y: cy / polygon.length };
}

// Convert normalized points to an SVG points string scaled to natural image dims.
export function scaledPoints(polygon: Polygon, w: number, h: number): string {
  return polygon.map((p) => `${p.x * w},${p.y * h}`).join(" ");
}

export function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
