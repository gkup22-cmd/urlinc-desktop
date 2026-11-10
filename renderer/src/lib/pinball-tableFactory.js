// Builds a full playfield "table" object from an AI theme spec, in the shape the
// Emergent engine + renderer expect. Used by the local API/store adapter.
//
// The AI spec uses pixel coordinates on the 500x900 playfield for every element
// (bumpers, targets, rollovers, ramps, saucers) plus the flipper rest angle.
// We clamp each into safe, playable bounds. Missing arrays fall back to the
// defaults so a bare buildTable({}) still produces a playable table.

const clamp = (v, lo, hi, fb) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fb);

// Validate a pixel polyline into clean rounded [x,y] pairs on the 500x900
// canvas. Returns [] unless at least 2 valid points.
const shapePath = (p) => {
  if (!Array.isArray(p)) return [];
  const pts = p
    .map((pt) => [Number(Array.isArray(pt) ? pt[0] : pt?.x), Number(Array.isArray(pt) ? pt[1] : pt?.y)])
    .filter((pt) => Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
    .map((pt) => [Math.round(clamp(pt[0], 0, 500, 250)), Math.round(clamp(pt[1], 0, 900, 450))]);
  return pts.length >= 2 ? pts : [];
};

const DEFAULT_BUMPERS = [
  { label: "Core", points: 100, x: 250, y: 250, r: 30 },
  { label: "Flux", points: 150, x: 168, y: 320, r: 27 },
  { label: "Arc", points: 150, x: 332, y: 320, r: 27 },
  { label: "Spark", points: 250, x: 250, y: 400, r: 24 },
];

const DEFAULT_TARGETS = [
  { label: "T1", points: 150, x: 170, y: 470, w: 28, angle: 0, style: "drop" },
  { label: "T2", points: 200, x: 250, y: 470, w: 28, angle: 0, style: "flag" },
  { label: "T3", points: 250, x: 330, y: 470, w: 28, angle: 0, style: "gem" },
];

const DEFAULT_ROLLOVERS = [
  { label: "L", points: 50, x: 170, y: 640 },
  { label: "M", points: 50, x: 250, y: 640 },
  { label: "R", points: 50, x: 330, y: 640 },
];

const DEFAULT_RAMPS = [
  { label: "LOOP", points: 500, x: 110, y: 420, angle: -2.0, habitrail: "left" },
  { label: "RAMP", points: 500, x: 390, y: 420, angle: -1.1, habitrail: "right" },
];

const DEFAULT_SAUCERS = [{ label: "SAUCER", points: 300, x: 250, y: 510, angle: -Math.PI / 2 + 0.6 }];

const AMBIENTS = ["stars", "fog", "embers", "bubbles", "sparks", "rain", "snow", "petals", "fireflies", "leaves"];

import { slingFromVertices, DEFAULT_SLING_ELS } from "../game/geometry";

function pickMaterial(m) {
  if (typeof m !== "string" || m[0] !== "#") return "chrome";
  const n = parseInt(m.slice(1, 7), 16);
  if (!Number.isFinite(n)) return "chrome";
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  if (r > 200 && r > g + 30 && r > b + 30) return "gold";
  if (b > r + 20) return "crystal";
  return "chrome";
}

function pickAmbient(seed) {
  const s = String(seed || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AMBIENTS[h % AMBIENTS.length];
}

export function splitStory(text) {
  const s = String(text || "").trim();
  const sentences = s ? s.replace(/[<>{}\r\n\t]+/g, " ").split(/(?<=[.!?])\s+/).filter(Boolean) : [];
  const crawl = [];
  for (let i = 0; i < sentences.length; i += 2) crawl.push(sentences.slice(i, i + 2).join(" "));
  if (!crawl.length) crawl.push("A new table awaits.", "Flip to begin.");
  return { episode: "A long time ago, on a table far, far away…", title: "", crawl, speed: 1 };
}

const TARGET_STYLES = ["drop", "flag", "shield", "gem", "post"];

export function buildTable(spec, opts = {}) {
  const sp = spec || {};
  const pal = sp.palette || {};
  const theme = opts.theme || sp.title || "Untitled";

  const accent = pal.accent || "#ff007a";
  const glow = pal.glow || "#00f0ff";
  const bg = pal.backdrop || "#08090e";

  const bumpers = (sp.bumpers && sp.bumpers.length ? sp.bumpers : DEFAULT_BUMPERS).map((b, i) => ({
    id: "b" + i,
    label: b.label || `B${i + 1}`,
    points: Math.round(clamp(b.points, 25, 1000, 100 + i * 50)),
    x: Math.round(clamp(b.x, 40, 430, 250)),
    y: Math.round(clamp(b.y, 250, 640, 300)),
    r: Math.round(clamp(b.r ?? 22, 14, 34, 22)),
  }));

  const targets = (sp.targets && sp.targets.length ? sp.targets : DEFAULT_TARGETS).map((t, i) => ({
    id: "t" + i,
    label: t.label || `T${i + 1}`,
    points: Math.round(clamp(t.points, 50, 2000, 150 + i * 50)),
    x: Math.round(clamp(t.x, 40, 430, 250)),
    y: Math.round(clamp(t.y, 120, 680, 470)),
    w: Math.round(clamp(t.w, 16, 60, 28)),
    angle: clamp(t.angle, -Math.PI, Math.PI, 0),
    style: TARGET_STYLES.includes(t.style) ? t.style : "drop",
  }));

  const rollovers = (sp.rollovers && sp.rollovers.length ? sp.rollovers : DEFAULT_ROLLOVERS).map((r, i) => ({
    id: "ro" + i,
    label: r.label || ["L", "M", "R"][i] || `${i + 1}`,
    points: Math.round(clamp(r.points, 25, 1000, 50)),
    x: Math.round(clamp(r.x, 40, 430, 250)),
    y: Math.round(clamp(r.y, 120, 700, 640)),
  }));

  const ramps = (sp.ramps && sp.ramps.length ? sp.ramps : DEFAULT_RAMPS).map((r, i) => {
    const path = shapePath(r.path);
    const x = path.length ? path[0][0] : Math.round(clamp(r.x, 60, 410, i ? 390 : 110));
    const y = path.length ? path[0][1] : Math.round(clamp(r.y, 150, 600, 420));
    return {
      id: "r" + (i + 1),
      label: r.label || (i ? "RAMP" : "LOOP"),
      points: Math.round(clamp(r.points, 100, 10000, 500)),
      x,
      y,
      angle: clamp(r.angle, -Math.PI, Math.PI, i ? -1.1 : -2.0),
      habitrail: r.habitrail === "left" || r.habitrail === "right" ? r.habitrail : (i ? "right" : "left"),
      path,
    };
  });

  const saucers = (sp.saucers && sp.saucers.length ? sp.saucers : DEFAULT_SAUCERS).map((s, i) => ({
    id: "s" + (i + 1),
    label: s.label || "SAUCER",
    points: Math.round(clamp(s.points, 100, 20000, 300)),
    x: Math.round(clamp(s.x, 60, 410, 250)),
    y: Math.round(clamp(s.y, 150, 650, 510)),
    angle: clamp(s.angle, -Math.PI, Math.PI, -Math.PI / 2 + 0.6),
  }));

  // AI-dictated angled inlane walls. The bottom of each wall is the flipper
  // pivot, so the flippers line up with the painted inlanes. null falls back to
  // the geometry defaults.
  const shapeInlaneSide = (o, lo, hi, fx) =>
    o && (Number.isFinite(o.topY) || Number.isFinite(o.bottomX) || Number.isFinite(o.bottomY))
      ? {
          topY: clamp(o.topY, 600, 700, 650),
          bottomX: clamp(o.bottomX, lo, hi, fx),
          bottomY: clamp(o.bottomY, 740, 790, 758),
        }
      : null;
  const inl = sp.inlanes;
  const inlanes =
    inl && (inl.left || inl.right)
      ? {
          left: shapeInlaneSide(inl.left, 100, 180, 146),
          right: shapeInlaneSide(inl.right, 280, 360, 321),
        }
      : null;
  const inlanesClean = inlanes && inlanes.left && inlanes.right ? inlanes : null;

  // AI-dictated triangular slingshot kickers: the AI returns 3 [x,y] pixel
  // vertices per side ([topOuter, bottomOuter, inner]). We convert each to the
  // parametric {x,y,size,angle} form the editor drags/sizes/rotates; the engine
  // derives the physical vertices back from those params. Missing -> defaults.
  const shapeSlingTri = (arr, xLo, xHi) => {
    if (!Array.isArray(arr) || arr.length < 3) return null;
    const pts = arr.slice(0, 3).map((p) => {
      const ix = Array.isArray(p) ? p[0] : p?.x;
      const iy = Array.isArray(p) ? p[1] : p?.y;
      return [
        Math.round(clamp(ix, xLo, xHi, (xLo + xHi) / 2)),
        Math.round(clamp(iy, 530, 710, 620)),
      ];
    });
    return pts.length === 3 ? pts : null;
  };
  const rawSl = sp.slingshots;
  const lp = slingFromVertices(rawSl?.left, "left");
  const rp = slingFromVertices(rawSl?.right, "right");
  let slingshots = lp && rp ? [{ id: "sl", side: "left", ...lp }, { id: "sr", side: "right", ...rp }] : null;
  if (!slingshots) slingshots = DEFAULT_SLING_ELS.map((e) => ({ ...e, v: e.v.map((p) => [...p]) }));

  // AI-dictated guide rails: polylines that become solid walls the ball bounces
  // off. Rails with no valid path are dropped; empty -> no rails.
  const rails = (sp.rails && sp.rails.length ? sp.rails : [])
    .map((r, i) => ({
      id: "rail" + (i + 1),
      label: r.label || `RAIL${i + 1}`,
      points: Math.round(clamp(r.points, 50, 5000, 200)),
      path: shapePath(r.path),
    }))
    .filter((r) => r.path.length >= 2);

  // AI-dictated flipper geometry: exact hinge (pivotX,pivotY) and reach length
  // per side. Missing -> null (engine falls back to inlane pivots + gap length).
  const shapeFlipperSide = (o, xLo, xHi) => {
    if (!o || !Number.isFinite(o.pivotX) || !Number.isFinite(o.pivotY)) return null;
    return {
      pivotX: Math.round(clamp(o.pivotX, xLo, xHi, (xLo + xHi) / 2)),
      pivotY: Math.round(clamp(o.pivotY, 735, 795, 758)),
      length: Number.isFinite(o.length) ? Math.round(clamp(o.length, 55, 115, 72)) : undefined,
    };
  };
  const fl = sp.flippers;
  const flipLeft = shapeFlipperSide(fl?.left, 80, 180);
  const flipRight = shapeFlipperSide(fl?.right, 300, 400);
  const flippers = flipLeft && flipRight ? { left: flipLeft, right: flipRight } : null;

  // After all clamping, guarantee flipper pivots sit FR0 px below the inlane
  // bottom. The physics inlane wall ends at bottomY; the flipper pivot circle
  // has radius FR0=11, so placing the pivot at bottomY+FR0 puts the TOP of the
  // pivot circle exactly at bottomY — a seamless physics join with no gap and
  // no overlap into the inlane zone.
  const FR0 = 11;
  if (inlanesClean && flippers) {
    flippers.left.pivotX  = inlanesClean.left.bottomX;
    flippers.left.pivotY  = inlanesClean.left.bottomY  + FR0;
    flippers.right.pivotX = inlanesClean.right.bottomX;
    flippers.right.pivotY = inlanesClean.right.bottomY + FR0;
  }

  const VALID_EVENTS = ["bumper", "target", "rollover", "ramp", "saucer", "sling"];
  const aiMissions = Array.isArray(sp.missions) ? sp.missions : null;
  const missions = aiMissions && aiMissions.length >= 2
    ? aiMissions.slice(0, 8).map((m, i) => ({
        event: VALID_EVENTS.includes(m.event) ? m.event : VALID_EVENTS[i % VALID_EVENTS.length],
        count: Math.round(clamp(m.count, 2, 25, 8)),
        reward: Math.round(clamp(m.reward, 1000, 100000, 10000)),
        title: String(m.title || `Mission ${i + 1}`).slice(0, 40),
        description: String(m.description || "").slice(0, 80),
        multiball: !!m.multiball,
      }))
    : [
        { event: "bumper", count: 10, reward: 5000, title: "Bumper Frenzy", description: "Charge the core bumpers", multiball: false },
        { event: "target", count: targets.length, reward: 10000, title: "Target Bank", description: "Drop every target", multiball: false },
        { event: "ramp", count: ramps.length, reward: 15000, title: "Ramp Master", description: "Send the ball up the ramps", multiball: true },
      ];

  const aiScoring = sp.scoring || {};
  const aiPhysics = sp.physics || {};
  const aiStyle = sp.style || {};
  const aiBg = sp.backglass || {};

  const VALID_FONTS = [
    "Creepster","Nosifer","Pirata One","Cinzel Decorative","Uncial Antiqua","MedievalSharp",
    "Rye","Bungee","Monoton","Audiowide","Orbitron","Press Start 2P","Special Elite",
    "Black Ops One","Metal Mania","Bangers","Righteous","Fredoka","Playfair Display","Faster One",
  ];
  const VALID_AMBIENTS = ["fog","bubbles","embers","stars","rain","snow","lightning","leaves","sparks","matrix","petals","bats","fireflies","none"];

  const chosenFont = VALID_FONTS.includes(aiStyle.font) ? aiStyle.font : null;
  const chosenAmbient = VALID_AMBIENTS.includes(aiStyle.ambient) ? aiStyle.ambient : pickAmbient(theme + (sp.font_style || ""));

  const story = sp.story ? splitStory(sp.story) : splitStory(theme);
  story.title = sp.title || theme;

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  return {
    id,
    name: sp.title || theme,
    theme,
    tagline: sp.tagline || "",
    palette: { primary: accent, secondary: glow, accent, glow, bg, dmd: glow },
    style: { material: pickMaterial(pal.metal), ambient: chosenAmbient, font: chosenFont, targetStyle: "drop" },
    physics: {
      balls: 3,
      bounce: clamp(aiPhysics.bounce ?? sp.bounce, 0.7, 1.5, 1),
      flipperPower: clamp(aiPhysics.flipperPower, 0.7, 1.4, 1),
      gravity: clamp(aiPhysics.gravity ?? sp.gravity, 0.6, 1.5, 1),
      flipperRest: clamp(sp.flipper_rest, 0.15, 0.65, 0.5),
      ballSave: 8,
    },
    scoring: {
      slingPoints: Math.round(clamp(aiScoring.slingPoints, 10, 500, 50)),
      targetBankBonus: Math.round(clamp(aiScoring.targetBankBonus, 5000, 100000, 25000)),
      rolloverBonus: Math.round(clamp(aiScoring.rolloverBonus, 1000, 50000, 10000)),
      comboMax: Math.round(clamp(aiScoring.comboMax, 2, 8, 4)),
      extraBallScore: Math.round(clamp(aiScoring.extraBallScore, 10000, 500000, 50000)),
    },
    bumpers,
    targets,
    rollovers,
    ramps,
    saucers,
    rails,
    flippers,
    inlanes: inlanesClean,
    slingshots,
    missions,
    story,
    walkthrough: sp.walkthrough || "",
    backglass: {
      title: sp.title || theme,
      tagline: sp.tagline || "",
      subtitle: "PINBALL FORGE",
      attract: (Array.isArray(aiBg.attract) && aiBg.attract.length >= 2)
        ? aiBg.attract.slice(0, 6).map((s) => String(s).toUpperCase().slice(0, 32))
        : ["PRESS LAUNCH", "HIGH SCORE", "FLIP TO WIN"],
    },
    brand: { enabled: !!opts.brand?.enabled, asset_ids: [], bumperCaps: true, backglassLogo: true, apronLogo: true },
    art: { playfield: sp.image_url || null, caps: null, cabinet: null, backglass: null },
    art_enabled: { playfield: !!sp.image_url, caps: false, cabinet: false, backglass: false },
    art_status: {},
    parts_kit_id: opts.parts_kit_id || "",
    high_score: 0,
    plays: 0,
    saved: false,
    created_at: Date.now(),
  };
}