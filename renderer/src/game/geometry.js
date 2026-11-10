export const W = 500;
export const H = 900;
export const TOP = 12;
export const BALL_R = 10;
export const LEFT = 12;
export const RIGHT = 488;
export const LANE = 455;
export const ARC = { x: 250, y: 250, r: 238 };
export const PIVOTS = { left: { x: 150, y: 770 }, right: { x: 317, y: 770 } };
export const FLEN = 72;
export const FR0 = 11;
export const FR1 = 6;
export const REST = 0.5;
export const UP = -0.48;
export const PLUNGER_Y = 880;
export const BALL_START = { x: (LANE + RIGHT) / 2, y: PLUNGER_Y - BALL_R - 1 };

const SL = [[70, 580], [70, 660], [130, 705]];
export const SLINGS = {
  left: SL,
  right: SL.map(([x, y]) => [467 - x, y]),
};
export const DEFAULT_SLINGS = SLINGS;

// Slingshots are stored as raw triangles: each element is { id, side, v } where
// v is the 3 [x,y] pixel vertices in order [topOuter, bottomOuter, inner]. The
// editor exposes the three vertices as draggable points (to match any painted
// triangle) plus a whole-body drag and a scale knob. Legacy parametric
// {x,y,size,angle} elements (saved tables) are converted to vertices on read.
const SLING_TPL = {
  left: [[-0.42, -0.78], [-0.42, 0.78], [0.72, 0.28]],
  right: [[0.42, -0.78], [0.42, 0.78], [-0.72, 0.28]],
};

const clampSlingPt = (p, side) => {
  const xLo = side === "right" ? 325 : 30;
  const xHi = side === "right" ? 470 : 175;
  const x = Number(Array.isArray(p) ? p[0] : p?.x);
  const y = Number(Array.isArray(p) ? p[1] : p?.y);
  return [
    Math.round(Math.max(xLo, Math.min(xHi, Number.isFinite(x) ? x : (xLo + xHi) / 2))),
    Math.round(Math.max(530, Math.min(710, Number.isFinite(y) ? y : 620))),
  ];
};

export const DEFAULT_SLING_ELS = [
  { id: "sl", side: "left", v: [[61, 593], [61, 703], [140, 668]] },
  { id: "sr", side: "right", v: [[439, 593], [439, 703], [360, 668]] },
];

// Return the 3 [x,y] vertices of a slingshot. Accepts the `v` form and the
// legacy parametric {x,y,size,angle} form (saved tables convert on the fly).
export function slingVertices(el) {
  if (Array.isArray(el?.v) && el.v.length >= 3) {
    return el.v.slice(0, 3).map((p) => [Number(p[0]) || 0, Number(p[1]) || 0]);
  }
  const side = el?.side === "right" ? "right" : "left";
  const tpl = SLING_TPL[side];
  const a = el?.angle || 0;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const sz = el?.size || 70;
  return tpl.map(([lx, ly]) => [
    Math.round((el.x || 0) + (lx * c - ly * s) * sz),
    Math.round((el.y || 0) + (lx * s + ly * c) * sz),
  ]);
}

// Normalize AI/detected 3 vertices into the stored { v } form (clamped per side
// to the slingshot band). Returns null if fewer than 3 valid vertices.
export function slingFromVertices(arr, side) {
  if (!Array.isArray(arr) || arr.length < 3) return null;
  return { v: arr.slice(0, 3).map((p) => clampSlingPt(p, side)) };
}

export function pointInTri(p, tri) {
  const [a, b, c] = tri;
  if (!a || !b || !c) return false;
  const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
  const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
  const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// Distance from point p to segment [a,b].
const distToSeg = (p, a, b) => {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const wx = p[0] - a[0], wy = p[1] - a[1];
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
};

// Forgiving slingshot hit-test: inside the triangle OR within `tol` px of any
// edge. A fingertip on a tablet covers a large area, so an exact pointInTri
// test misses the small triangle and the grab silently fails.
export function pointNearTri(p, tri, tol = 22) {
  if (!tri || tri.length < 3) return false;
  if (pointInTri(p, tri)) return true;
  const [a, b, c] = tri;
  return (
    distToSeg(p, a, b) <= tol ||
    distToSeg(p, b, c) <= tol ||
    distToSeg(p, c, a) <= tol
  );
}

// Bounding radius of a slingshot (centroid -> farthest vertex) for hit-testing
// and the editor selection ring.
export function slingRadius(el) {
  const v = slingVertices(el);
  const cx = (v[0][0] + v[1][0] + v[2][0]) / 3;
  const cy = (v[0][1] + v[1][1] + v[2][1]) / 3;
  return Math.max(
    40,
    Math.hypot(v[0][0] - cx, v[0][1] - cy),
    Math.hypot(v[1][0] - cx, v[1][1] - cy),
    Math.hypot(v[2][0] - cx, v[2][1] - cy),
  );
}

// Normalize whatever a table stores for slingshots (v-form array, legacy
// parametric array, legacy {left,right} vertex object, or nothing) into a
// 2-element v-form array so the editor always has draggable triangles.
export function slingArray(t) {
  const s = t?.slingshots;
  if (Array.isArray(s) && s.length) {
    const els = s.filter((e) => e && (e.side === "left" || e.side === "right") && (Array.isArray(e.v) || Number.isFinite(e.x)));
    if (els.length === 2) return els.map((e) => ({ id: e.id || (e.side === "left" ? "sl" : "sr"), side: e.side, v: slingVertices(e) }));
  }
  if (s && Array.isArray(s.left) && Array.isArray(s.right)) {
    const lp = slingFromVertices(s.left, "left");
    const rp = slingFromVertices(s.right, "right");
    if (lp && rp) return [{ id: "sl", side: "left", ...lp }, { id: "sr", side: "right", ...rp }];
  }
  return DEFAULT_SLING_ELS.map((e) => ({ ...e, v: e.v.map((p) => [...p]) }));
}

// Engine/renderer consume {left: vertices, right: vertices}.
export function tableSlingshots(t) {
  const s = t?.slingshots;
  if (Array.isArray(s) && s.length) {
    const out = { left: null, right: null };
    for (const e of s) {
      if (!e?.side) continue;
      const v = slingVertices(e);
      if (e.side === "left" && !out.left) out.left = v;
      if (e.side === "right" && !out.right) out.right = v;
    }
    if (out.left && out.right) return out;
  }
  if (s && Array.isArray(s.left) && Array.isArray(s.right)) return s;
  return DEFAULT_SLINGS;
}

// Default angled inlane walls: from the outer wall (left) / plunger-lane wall
// (right) down to the flipper pivots. The bottom of each wall is the flipper
// pivot, so moving the inlane moves the flipper too — the painted inlanes and
// the rendered flippers then line up with the artwork.
export const DEFAULT_INLANES = {
  left: { topY: 650, bottomX: 146, bottomY: 758 },
  right: { topY: 650, bottomX: 321, bottomY: 758 },
};

const clampNum = (v, lo, hi, fb) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fb);

export function tableInlanes(t) {
  const raw = t?.inlanes;
  if (!raw || (!raw.left && !raw.right)) return DEFAULT_INLANES;
  const side = (s, lo, hi, fx) => {
    const o = raw[s];
    if (!o) return DEFAULT_INLANES[s];
    return {
      topY: clampNum(o.topY, 600, 700, 650),
      bottomX: clampNum(o.bottomX, lo, hi, fx),
      bottomY: clampNum(o.bottomY, 740, 790, 758),
    };
  };
  return { left: side("left", 100, 180, 146), right: side("right", 280, 360, 321) };
}

// Per-table flipper pivots. Explicit pivots win; otherwise derive from the AI
// inlane bottoms (so flippers sit where the painted inlanes meet the apron);
// fall back to the fixed defaults.
export function tablePivots(t) {
  const f = t?.flippers;
  if (f?.left && f?.right && Number.isFinite(f.left.pivotX) && Number.isFinite(f.right.pivotX)) {
    return { left: { x: f.left.pivotX, y: f.left.pivotY }, right: { x: f.right.pivotX, y: f.right.pivotY } };
  }
  const p = t?.pivots;
  if (p?.left && p?.right) return p;
  if (t?.inlanes) {
    const il = tableInlanes(t);
    return { left: { x: il.left.bottomX, y: il.left.bottomY }, right: { x: il.right.bottomX, y: il.right.bottomY } };
  }
  return PIVOTS;
}

// Per-table flipper rest angle (tunable in Studio). UP tracks REST so the
// flipper sweep stays constant. Falls back to the fixed defaults.
export function tableFlipperRest(t) {
  const v = t?.physics?.flipperRest;
  return Number.isFinite(v) ? v : REST;
}
export function tableFlipperUp(t) {
  return tableFlipperRest(t) - (REST - UP);
}

// Per-table flipper length. Scales with the gap between the two pivots so the
// flippers cover most of the drain on wide AI layouts (default gap leaves the
// classic ~72px length unchanged). Leaves roughly 3 ball-widths of gap so the
// ball can still drain between the tips.
export function tableFlipperLen(t, side) {
  const f = t?.flippers;
  if (side && f?.[side] && Number.isFinite(f[side].length)) {
    return Math.max(50, Math.min(120, f[side].length));
  }
  const p = tablePivots(t);
  const gap = Math.abs(p.right.x - p.left.x);
  const len = (gap - BALL_R * 3) / 2;
  return Number.isFinite(len) ? Math.max(58, Math.min(108, len)) : FLEN;
}

const seg = (ax, ay, bx, by, extra = {}) => ({ ax, ay, bx, by, ...extra });

// Always returns a usable top-lanes array. Falls back to a default 4-lane BUMP
// set centred across the playfield so channels and stopper posts always exist
// even when the AI returns nothing.
export function effectiveTopLanes(table) {
  const tl = table?.top_lanes;
  if (Array.isArray(tl) && tl.length >= 2) return tl;
  const labels = ["B", "U", "M", "P"];
  return labels.map((label, i) => ({
    label,
    x: Math.round(75 + (310 / (labels.length - 1)) * i),  // 75, 178, 282, 385
    y: 75,
    points: 200,
  }));
}

// Curved guide at the top of the launch lane. The ball rides this arc and is
// deflected left into the main playfield (a straight wall hit from directly
// below just bounces straight down). Centered so the ball inside the circle
// gets a down-left normal, like the old arched dome did — but localized.
export function deflectorPoints(n = 14) {
  const cx = 400, cy = 142, r = 130; // cy raised so arch top touches TOP wall (no corner pocket)
  const a0 = -90, a1 = -47.4;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

export function arcPoints(n = 40) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (Math.PI * i) / n;
    pts.push({ x: ARC.x + ARC.r * Math.cos(a), y: ARC.y + ARC.r * Math.sin(a) });
  }
  return pts;
}

export function buildWalls(slings = DEFAULT_SLINGS, inlanes = DEFAULT_INLANES, table = {}) {
  const s = [];
  // Arched dome: physics segments following the ARC semicircle from (LEFT,250)
  // through (250,TOP) to (RIGHT,250). Ball rolls inside the dome and naturally
  // deflects left when it exits the plunger lane at the top-right.
  const ap = arcPoints(24);
  for (let i = 1; i < ap.length; i++) s.push(seg(ap[i - 1].x, ap[i - 1].y, ap[i].x, ap[i].y));
  // Outer walls from where the arch meets the side rails (y=250) downward.
  s.push(seg(LEFT, 250, LEFT, H + 40));
  s.push(seg(RIGHT, 250, RIGHT, H + 40));
  // LANE wall starts at y=250 (matching the right outer wall) so the deflector
  // at y<215 fires in open space — no LANE wall to immediately bounce the ball
  // back before it can escape left into the playfield. Above y=250 only the arc
  // bounds the right side of the tube; the ball travels straight up (vx≈0) so
  // it doesn't drift without the wall.
  s.push(seg(LANE, 250, LANE, H + 40));
  s.push(seg(LANE, PLUNGER_Y, RIGHT, PLUNGER_Y, { plunger: true }));
  // Angled inlane guide walls — always present as physics to prevent the ball
  // escaping off the sides. The visual rendering is separately gated on
  // table.show_guide_walls in renderer.js so removing rails hides the lines
  // without opening a physics gap.
  const maxInlaneHoriz = 80;
  const leftTopX  = Math.max(LEFT, inlanes.left.bottomX  - maxInlaneHoriz);
  const rightTopX = Math.min(LANE, inlanes.right.bottomX + maxInlaneHoriz);
  // Horizontal bridge: closes the gap between the outer left wall and the top
  // of the inlane diagonal (x=12 to x=leftTopX at y=topY).
  s.push(seg(LEFT, inlanes.left.topY, leftTopX, inlanes.left.topY));
  s.push(seg(leftTopX,  inlanes.left.topY,  inlanes.left.bottomX,  inlanes.left.bottomY));
  s.push(seg(rightTopX, inlanes.right.topY, inlanes.right.bottomX, inlanes.right.bottomY));
  // Lower apron walls: close the open space below the flipper pivots on both
  // sides. Without these, the ball escapes to the left of the left flipper
  // (outer wall was open) and to the right of the right flipper (the LANE wall
  // had no corresponding inward guide). Each wall angles from the outer edge at
  // flipper-pivot height inward toward the drain, creating the classic outlane.
  const lBotX  = inlanes.left.bottomX;   // left flipper pivot x  (~146)
  const rBotX  = inlanes.right.bottomX;  // right flipper pivot x (~321)
  const apronY = inlanes.left.bottomY;   // flipper pivot y        (~758)
  s.push(seg(LEFT, apronY, lBotX - 30, apronY + 35));
  s.push(seg(rBotX + 30, apronY + 35, LANE, apronY));
  for (const side of ["left", "right"]) {
    const P = slings[side];
    s.push(seg(P[0][0], P[0][1], P[1][0], P[1][1]));
    s.push(seg(P[1][0], P[1][1], P[2][0], P[2][1]));
    s.push(seg(P[0][0], P[0][1], P[2][0], P[2][1], { kick: side }));
    // Diagonal guide from the outer wall to the slingshot's top outer vertex.
    // Angle directs a ball rolling down the outer wall inward toward the slingshot
    // rather than trapping it in the pocket between the wall and the slingshot edge.
    // A horizontal bridge would create a new bounce trap; the diagonal avoids it.
    if (side === "left") {
      s.push(seg(LEFT, P[0][1] - 55, P[0][0], P[0][1]));
    } else {
      s.push(seg(P[0][0], P[0][1], LANE, P[0][1] - 55));
    }
  }
  s.push(seg(LANE, 300, RIGHT, 262, { gate: true }));
  // Top-lane channel dividers: vertical posts between lane slots.
  // The outermost dividers are extended downward to inner-arc height so they
  // double as the stopper posts — a ball rolling along the inner arc cannot
  // slip past the outermost lane without going through a channel opening.
  const lanes = effectiveTopLanes(table);
  if (lanes.length >= 2) {
    const CHAN_BOT = 115;
    const laneXs = lanes.map((l) => Number(l.x));
    const halfW = laneXs.length > 1
      ? (Math.max(...laneXs) - Math.min(...laneXs)) / (laneXs.length - 1) / 2
      : 30;
    const dividers = [
      Math.max(LEFT + 2, Math.min(...laneXs) - halfW),
      ...lanes.slice(0, -1).map((l, i) => (Number(l.x) + Number(lanes[i + 1].x)) / 2),
      Math.min(LANE - 2, Math.max(...laneXs) + halfW),
    ];
    const innerR = ARC.r - 22;
    for (let di = 0; di < dividers.length; di++) {
      const dx = dividers[di];
      const dxOff = dx - ARC.x;
      // Outer dividers (stopper posts): extend to inner-arc height so they
      // intercept the ball rolling along the guide arc.
      let divBot = CHAN_BOT;
      if ((di === 0 || di === dividers.length - 1) && dxOff * dxOff < innerR * innerR) {
        const arcY = ARC.y - Math.sqrt(innerR * innerR - dxOff * dxOff);
        divBot = Math.max(CHAN_BOT, Math.round(arcY) + BALL_R + 4);
      }
      s.push(seg(dx, TOP, dx, divBot));
    }
  }
  return s;
}

export function closest(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + dx * t, y: ay + dy * t, t };
}

export function flipperDir(side, angle) {
  return side === "left" ? { x: Math.cos(angle), y: Math.sin(angle) } : { x: -Math.cos(angle), y: Math.sin(angle) };
}

export function targetEnds(t) {
  const hx = (Math.cos(t.angle || 0) * t.w) / 2;
  const hy = (Math.sin(t.angle || 0) * t.w) / 2;
  return { ax: t.x - hx, ay: t.y - hy, bx: t.x + hx, by: t.y + hy };
}

export const KINDS = ["bumpers", "targets", "rollovers", "ramps", "saucers", "rails"];

export function elementRadius(kind, el) {
  return { bumpers: el.r || 22, targets: (el.w || 30) / 2 + 4, rollovers: 14, ramps: 20, saucers: 16, rails: 18, slingshots: slingRadius(el) }[kind];
}

export const railPoints = (r) => {
  if (Array.isArray(r.path) && r.path.length >= 2) {
    const pts = r.path
      .map((p) => [Number(p?.[0]), Number(p?.[1])])
      .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length >= 2) return pts;
  }
  return (r.pts || []).map(([dx, dy]) => [r.x + dx, r.y + dy]);
};

const INLANE_X = { left: 41, right: 426 };

export function habitrailPath(ramp) {
  if (Array.isArray(ramp.path) && ramp.path.length >= 2) {
    const pts = ramp.path
      .map((p) => [Number(p?.[0]), Number(p?.[1])])
      .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length >= 2) {
      const lens = [0];
      for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      return { pts, lens, total: lens[lens.length - 1] };
    }
  }
  const side = ramp.habitrail;
  if (side !== "left" && side !== "right") return null;
  const X = INLANE_X[side];
  const d = { x: Math.cos(ramp.angle), y: Math.sin(ramp.angle) };
  const p0 = [ramp.x, ramp.y];
  const p1 = [Math.max(70, Math.min(400, ramp.x + d.x * 120)), Math.max(115, ramp.y + d.y * 120)];
  const p2 = [side === "left" ? 60 : 405, 200];
  const p3 = [X, 588];
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, lens, total: lens[lens.length - 1] };
}

export function pointAt(path, dist) {
  const { pts, lens } = path;
  let i = 1;
  while (i < lens.length - 1 && lens[i] < dist) i++;
  const t = Math.min(1, Math.max(0, (dist - lens[i - 1]) / (lens[i] - lens[i - 1] || 1)));
  return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
}