import {
  W, H, LEFT, RIGHT, LANE, TOP, PIVOTS, FLEN, FR0, FR1, SLINGS, PLUNGER_Y, BALL_R, ARC,
  arcPoints, flipperDir, targetEnds, railPoints, habitrailPath, tableFlipperLen, tablePivots, tableSlingshots,
  effectiveTopLanes, tableInlanes,
} from "./geometry";

const SCALE = 2;
const METALS = {
  chrome: ["#fbfcfe", "#7c8595", "#e6eaf1", "#3c424e"],
  gold: ["#fff3c4", "#c08417", "#ffe08a", "#5e3a05"],
  copper: ["#ffd8be", "#a9542a", "#f2a477", "#46200e"],
  crystal: ["#f2fdff", "#6ccff6", "#ffffff", "#24607f"],
};

export function hexA(hex, a) {
  const n = parseInt((hex || "#ffffff").slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const metalStops = (g, m) => { m.forEach((c, i) => g.addColorStop(i / (m.length - 1), c)); return g; };

function metal(table) {
  const m = table.style?.material || "chrome";
  if (m === "neon") return null;
  return METALS[m] || METALS.chrome;
}

function drawCover(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height);
  ctx.drawImage(img, x + (w - img.width * r) / 2, y + (h - img.height * r) / 2, img.width * r, img.height * r);
}

function drawContain(ctx, img, cx, cy, maxW, maxH) {
  const r = Math.min(maxW / img.width, maxH / img.height);
  ctx.drawImage(img, cx - (img.width * r) / 2, cy - (img.height * r) / 2, img.width * r, img.height * r);
}

// Cover-fit: scale the image to completely fill the box (cropping overflow),
// centered, so the playfield frame is never left with empty black bars when
// the AI art's aspect ratio doesn't match the 500x900 canvas.
function drawCoverFill(ctx, img, cx, cy, w, h, offX = 0, offY = 0) {
  const r = Math.max(w / img.width, h / img.height);
  const dw = img.width * r;
  const dh = img.height * r;
  ctx.drawImage(img, cx - dw / 2 + offX, cy - dh / 2 + offY, dw, dh);
}

// draw a part image centred at (cx, cy), fitted into w x h, rotated by rot
function part(ctx, img, cx, cy, w, h, rot = 0, sy = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  if (sy !== 1) ctx.scale(1, sy);
  drawContain(ctx, img, 0, 0, w, h);
  ctx.restore();
}

const FLIP = { px: 75 / 512, py: 72 / 159, len: 430 / 512, tilt: 0.093 };

function outline(ctx) {
  ctx.beginPath();
  ctx.moveTo(LEFT, H);
  ctx.lineTo(LEFT, 250);
  // Arched dome from (LEFT,250) up through (250,TOP) to (RIGHT,250)
  ctx.arc(ARC.x, ARC.y, ARC.r, Math.PI, 0, false);
  ctx.lineTo(RIGHT, H);
  ctx.closePath();
}

function railStroke(ctx, t, width = 5) {
  const p = t.palette;
  const m = metal(t);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (!m) {
    ctx.strokeStyle = p.primary;
    ctx.lineWidth = width;
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 14;
    ctx.stroke();
  } else {
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = width + 4;
    ctx.stroke();
    ctx.shadowColor = hexA(p.primary, 0.6);
    ctx.shadowBlur = 10;
    ctx.strokeStyle = metalStops(ctx.createLinearGradient(0, 0, W, H), [m[1], m[0], m[3], m[2], m[1]]);
    ctx.lineWidth = width;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.restore();
}

function procedural(ctx, t, fonts) {
  const p = t.palette;
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(240, 260, 20, 240, 260, 420);
  g.addColorStop(0, hexA(p.primary, 0.32));
  g.addColorStop(1, hexA(p.primary, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(240, 720, 10, 240, 720, 360);
  g.addColorStop(0, hexA(p.secondary, 0.28));
  g.addColorStop(1, hexA(p.secondary, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = hexA(p.secondary, 0.07);
  ctx.lineWidth = 1;
  for (let i = -H; i < W + H; i += 28) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i - H * 0.6, H);
    ctx.stroke();
  }
  // sunburst behind the lower playfield
  ctx.save();
  ctx.translate(233, 640);
  for (let i = 0; i < 24; i++) {
    ctx.rotate((Math.PI * 2) / 24);
    ctx.fillStyle = hexA(i % 2 ? p.primary : p.accent, 0.05);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-14, -420);
    ctx.lineTo(14, -420);
    ctx.fill();
  }
  ctx.restore();
  ctx.save();
  ctx.translate(233, 470);
  ctx.rotate(-Math.PI / 2);
  ctx.font = `900 60px "${fonts.display}", sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = hexA(p.accent, 0.08);
  ctx.fillText((t.name || "").toUpperCase().slice(0, 16), 0, 20);
  ctx.restore();
}

export function buildStatic(t, images, fonts, hideElements = false) {
  const c = document.createElement("canvas");
  c.width = W * SCALE;
  c.height = H * SCALE;
  const ctx = c.getContext("2d");
  ctx.scale(SCALE, SCALE);
  const p = t.palette;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  outline(ctx);
  ctx.clip();
  if (images.playfield) {
    const off = t.artOffset || { x: 0, y: 0 };
    drawCoverFill(ctx, images.playfield, W / 2, H / 2, W, H, off.x || 0, off.y || 0);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(0, 0, W, H);
  } else {
    procedural(ctx, t, fonts);
  }
  // lacquer sheen
  const sheen = ctx.createLinearGradient(0, 0, W, H);
  sheen.addColorStop(0, "rgba(255,255,255,0.07)");
  sheen.addColorStop(0.35, "rgba(255,255,255,0)");
  sheen.addColorStop(0.7, "rgba(255,255,255,0.03)");
  sheen.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(LANE, 0, RIGHT - LANE, H);
  for (const poly of [[[LEFT, 650], [146, 758], [146, H], [LEFT, H]], [[LANE, 650], [321, 758], [321, H], [LANE, H]]]) {
    ctx.beginPath();
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 650, 0, H);
    g.addColorStop(0, "#11131d");
    g.addColorStop(1, "#05060a");
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.fillStyle = "#04050a";
  ctx.fillRect(146, 840, 175, 60);
  const parts = images.parts || {};
  if (parts.apron_left || parts.apron_right) {
    if (parts.apron_left) drawContain(ctx, parts.apron_left, 76, 845, 128, 90);
    if (parts.apron_right) drawContain(ctx, parts.apron_right, 391, 845, 128, 90);
    if (images.apronLogo) {
      drawContain(ctx, images.apronLogo, 76, 845, 54, 40);
      drawContain(ctx, images.apronLogo, 391, 845, 54, 40);
    }
  } else if (images.apronLogo) {
    drawContain(ctx, images.apronLogo, 70, 840, 90, 70);
    drawContain(ctx, images.apronLogo, 395, 840, 90, 70);
  } else {
    ctx.font = `700 13px "${fonts.display}", sans-serif`;
    ctx.fillStyle = hexA(p.accent, 0.85);
    ctx.textAlign = "center";
    ctx.fillText((t.name || "").toUpperCase().slice(0, 14), 75, 860);
    ctx.fillText("PINBALL FORGE", 392, 860);
  }
  ctx.restore();
  outline(ctx);
  railStroke(ctx, t, 6);
  // Inner dome guide — arc just inside the outer arch, ending at x=LANE so the
  // right side connects seamlessly to the plunger-lane divider wall below it.
  const _innerR = ARC.r - 22;
  const _archEndAngle = -Math.acos((LANE - ARC.x) / _innerR);
  const _archEndY = ARC.y + _innerR * Math.sin(_archEndAngle);
  ctx.beginPath();
  ctx.arc(ARC.x, ARC.y, _innerR, Math.PI, _archEndAngle, false);
  railStroke(ctx, t, 4);
  // Right ball-return lane border — runs from the inner arch endpoint all the way
  // down so there is no gap between the arch and the lane wall.
  ctx.beginPath(); ctx.moveTo(LANE, _archEndY); ctx.lineTo(LANE, H);
  railStroke(ctx, t, 5);
  // Inlane guide wall lines — always drawn using the actual per-table inlane
  // positions (AI-specified or default) so the visual channels match physics.
  if (!hideElements) {
    const il = tableInlanes(t);
    const maxInlaneHoriz = 80;
    const leftTopX  = Math.max(LEFT, il.left.bottomX  - maxInlaneHoriz);
    const rightTopX = Math.min(LANE, il.right.bottomX + maxInlaneHoriz);
    for (const [ax, ay, bx, by] of [
      [LEFT,       il.left.topY,  leftTopX,            il.left.topY],
      [leftTopX,   il.left.topY,  il.left.bottomX,     il.left.bottomY],
      [rightTopX,  il.right.topY, il.right.bottomX,    il.right.bottomY],
      [LANE,       il.right.topY, rightTopX,            il.right.topY],
    ]) {
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      railStroke(ctx, t, 5);
    }
  }
  // Top-lane channel divider rails — bright posts between each lane slot.
  // Always rendered using effectiveTopLanes so channels appear even when the
  // AI returns no lane data.
  if (!hideElements) {
    const tl = effectiveTopLanes(t);
    const CHAN_TOP = 55;   // start just below the inner arch line
    const CHAN_BOT = 130;  // extend well below the insert circles
    const laneXs = tl.map((l) => Number(l.x));
    const halfW = tl.length > 1
      ? (Math.max(...laneXs) - Math.min(...laneXs)) / (tl.length - 1) / 2
      : 30;
    const dividers = [
      Math.max(LEFT + 6, Math.min(...laneXs) - halfW),
      ...tl.slice(0, -1).map((l, i) => (Number(l.x) + Number(tl[i + 1].x)) / 2),
      Math.min(LANE - 6, Math.max(...laneXs) + halfW),
    ];
    for (const dx of dividers) {
      ctx.beginPath();
      ctx.moveTo(dx, CHAN_TOP);
      ctx.lineTo(dx, CHAN_BOT);
      railStroke(ctx, t, 5);
    }
  }
  if (!hideElements) {
  const m = metal(t) || METALS.chrome;
  const SL = tableSlingshots(t);
  for (const side of ["left", "right"]) {
    const P = SL[side];
    ctx.beginPath();
    P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    const g = ctx.createLinearGradient(P[0][0], P[0][1], P[2][0], P[2][1]);
    g.addColorStop(0, hexA(p.secondary, 0.55));
    g.addColorStop(1, hexA(p.bg, 0.9));
    ctx.fillStyle = g;
    ctx.fill();
    railStroke(ctx, t, 3);
    if (parts.slingshot) {
      const cx = (P[0][0] + P[1][0] + P[2][0]) / 3;
      const cy = (P[0][1] + P[1][1] + P[2][1]) / 3;
      const xs = P.map(v => v[0]), ys = P.map(v => v[1]);
      const sw = Math.max(...xs) - Math.min(...xs);
      const sh = Math.max(...ys) - Math.min(...ys);
      ctx.save();
      ctx.translate(cx, cy);
      if (side === "right") ctx.scale(-1, 1);
      drawContain(ctx, parts.slingshot, 0, 0, sw, sh);
      ctx.restore();
    }
    if (parts.rail_post) {
      for (const [x, y] of P) drawContain(ctx, parts.rail_post, x, y, 13, 16);
      continue;
    }
    for (const [x, y] of P) {
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = metalStops(ctx.createRadialGradient(x - 1, y - 1, 0, x, y, 4), [m[0], m[1], m[3]]);
      ctx.fill();
    }
  }
  } // end hideElements (slingshots)
  ctx.fillStyle = hexA(p.accent, 0.4);
  for (const [x, y, s] of [[45, 690, 1], [422, 690, -1]]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 10 * s, y + 18);
    ctx.lineTo(x - 2 * s, y + 18);
    ctx.fill();
  }
  // guide rails
  if (!hideElements) {
  for (const r of t.rails || []) {
    const pts = railPoints(r);
    if (parts.rail) {
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        const len = Math.hypot(bx - ax, by - ay);
        ctx.save();
        ctx.translate((ax + bx) / 2, (ay + by) / 2);
        ctx.rotate(Math.atan2(by - ay, bx - ax));
        ctx.drawImage(parts.rail, -len / 2 - 4, -8, len + 8, 16);
        ctx.restore();
      }
      if (parts.rail_post) pts.forEach(([x, y]) => drawContain(ctx, parts.rail_post, x, y, 14, 17));
    } else drawWireform(ctx, pts, t, false);
  }
  }
  return c;
}

function drawWireform(ctx, pts, t, elevated) {
  if (pts.length < 2) return;
  const m = metal(t) || METALS.chrome;
  const p = t.palette;
  const off = elevated ? 8 : 0;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const path = (dx, dy, o) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const [ax, ay] = pts[Math.max(0, i - 1)];
      const [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
      const l = Math.hypot(bx - ax, by - ay) || 1;
      const nx = (-(by - ay) / l) * o;
      const ny = ((bx - ax) / l) * o;
      i ? ctx.lineTo(x + nx + dx, y + ny + dy) : ctx.moveTo(x + nx + dx, y + ny + dy);
    });
  };
  if (elevated) {
    for (const o of [-7, 7]) {
      path(10, 14, o);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    for (let i = 2; i < pts.length - 1; i += 3) {
      const [x, y] = pts[i];
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 7, y);
      ctx.lineTo(x + 7, y);
      ctx.stroke();
    }
  }
  const grad = metalStops(ctx.createLinearGradient(0, 0, W, H * 0.6), [m[1], m[0], m[3], m[2], m[1], m[0]]);
  for (const o of elevated ? [-7, 7] : [0]) {
    path(0, 0, o);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = elevated ? 5 : 7;
    ctx.stroke();
    ctx.strokeStyle = grad;
    ctx.shadowColor = hexA(p.primary, 0.5);
    ctx.shadowBlur = 8;
    ctx.lineWidth = elevated ? 3 : 4.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  if (!elevated || off) {
    const posts = elevated ? [pts[0], pts[pts.length - 1]] : pts;
    for (const [x, y] of posts) {
      ctx.beginPath();
      ctx.arc(x, y, elevated ? 4 : 5, 0, Math.PI * 2);
      ctx.fillStyle = metalStops(ctx.createRadialGradient(x - 1.5, y - 1.5, 0, x, y, 5), [m[0], m[1], m[3]]);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBumper(ctx, b, t, flash, img, time, fonts, parts = {}) {
  if (!img && parts.bumper_cap) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(b.x + 4, b.y + 7, b.r + 10, b.r + 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fill();
    if (parts.bumper_base) drawContain(ctx, parts.bumper_base, b.x, b.y + 2, (b.r + 12) * 2, (b.r + 12) * 2);
    if (flash > 0) {
      ctx.shadowColor = t.palette.accent;
      ctx.shadowBlur = 36;
    }
    const cap = flash > 0 && parts.bumper_cap_lit ? parts.bumper_cap_lit : parts.bumper_cap;
    const s = flash > 0 ? (b.r + 6) * 2 : (b.r + 4) * 2;
    drawContain(ctx, cap, b.x, b.y, s, s);
    ctx.restore();
    return;
  }
  const p = t.palette;
  const m = metal(t);
  ctx.save();
  // drop shadow
  ctx.beginPath();
  ctx.ellipse(b.x + 4, b.y + 7, b.r + 9, b.r + 7, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();
  // metal skirt
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r + 8, 0, Math.PI * 2);
  ctx.fillStyle = m
    ? metalStops(ctx.createLinearGradient(b.x - b.r, b.y - b.r, b.x + b.r, b.y + b.r), [m[0], m[1], m[2], m[3]])
    : hexA(p.secondary, 0.4);
  ctx.fill();
  // LED ring
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2);
  ctx.fillStyle = "#0a0a0f";
  ctx.fill();
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const on = flash > 0 || (Math.floor(time * 8) + i) % 4 !== 0;
    ctx.beginPath();
    ctx.arc(b.x + Math.cos(a) * (b.r + 4), b.y + Math.sin(a) * (b.r + 4), 1.8, 0, Math.PI * 2);
    ctx.fillStyle = flash > 0 ? "#ffffff" : on ? p.secondary : hexA(p.secondary, 0.25);
    ctx.shadowColor = p.secondary;
    ctx.shadowBlur = flash > 0 ? 16 : on ? 8 : 0;
    ctx.fill();
  }
  ctx.shadowBlur = flash > 0 ? 34 : 0;
  ctx.shadowColor = p.secondary;
  // cap rim
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r + 1, 0, Math.PI * 2);
  ctx.fillStyle = m ? metalStops(ctx.createLinearGradient(b.x, b.y - b.r, b.x, b.y + b.r), [m[2], m[1], m[3]]) : p.primary;
  ctx.fill();
  ctx.shadowBlur = 0;
  // cap dome
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r - 1.5, 0, Math.PI * 2);
  if (img) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "#000";
    ctx.fill();
    drawContain(ctx, img, b.x, b.y, b.r * 2.25, b.r * 2.25);
    ctx.restore();
  } else {
    const g = ctx.createRadialGradient(b.x - b.r / 3, b.y - b.r / 3, 1, b.x, b.y, b.r);
    g.addColorStop(0, flash > 0 ? "#ffffff" : hexA(p.primary, 1));
    g.addColorStop(0.55, hexA(p.primary, 0.75));
    g.addColorStop(1, hexA(p.bg, 1));
    ctx.fillStyle = g;
    ctx.fill();
    if (b.label) {
      ctx.font = `700 ${Math.max(8, b.r / 2.3)}px "${fonts.body}", sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 4;
      ctx.fillText(b.label.toUpperCase().slice(0, 9), b.x, b.y + 1);
      ctx.shadowBlur = 0;
    }
  }
  // gloss
  ctx.beginPath();
  ctx.ellipse(b.x - b.r * 0.3, b.y - b.r * 0.42, b.r * 0.55, b.r * 0.28, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fill();
  ctx.restore();
}

function drawArrow(ctx, r, p, lit) {
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate((r.angle ?? -1.57) + Math.PI / 2);
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.moveTo(0, -20 + k * 11);
    ctx.lineTo(13, -8 + k * 11);
    ctx.lineTo(13, -3 + k * 11);
    ctx.lineTo(0, -15 + k * 11);
    ctx.lineTo(-13, -3 + k * 11);
    ctx.lineTo(-13, -8 + k * 11);
    ctx.closePath();
    ctx.fillStyle = lit === k || lit === true ? p.accent : hexA(p.accent, 0.28);
    ctx.shadowColor = p.accent;
    ctx.shadowBlur = lit === k || lit === true ? 20 : 4;
    ctx.fill();
  }
  ctx.restore();
}

function label(ctx, text, x, y, color, size, font) {
  if (!text) return;
  ctx.font = `700 ${size}px "${font}", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillText(text.toUpperCase(), x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text.toUpperCase(), x, y);
}

function drawTarget(ctx, tg, g) {
  const t = g.table;
  const p = t.palette;
  const m = metal(t) || METALS.chrome;
  const down = g.down[tg.id];
  const fall = Math.max(0, g.fx["fall-" + tg.id] || 0) / 0.3;
  const k = down ? fall : 1;
  const hit = (g.fx[tg.id] || 0) > 0;
  const style = tg.style || t.style?.targetStyle || "drop";
  const ang = tg.angle || 0;
  ctx.save();
  ctx.translate(tg.x, tg.y);
  ctx.rotate(ang);
  if (down && k <= 0) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(-tg.w / 2, -2, tg.w, 4);
    if (style === "flag") {
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fillStyle = m[1];
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  ctx.scale(1, Math.max(0.1, k));
  const pimg = g.parts?.[`target_${style}`];
  if (pimg) {
    if (hit) {
      ctx.shadowColor = "#fff";
      ctx.shadowBlur = 26;
    } else ctx.shadowBlur = 0;
    const h = style === "drop" ? 34 : style === "flag" ? 34 : tg.w + 6;
    drawContain(ctx, pimg, 0, style === "post" ? -4 : 0, tg.w + 10, h);
    ctx.restore();
    return;
  }
  ctx.shadowColor = p.accent;
  ctx.shadowBlur = hit ? 26 : 10;
  if (style === "flag") {
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(-tg.w / 2 + 3, 2, tg.w, 4);
    const wave = (i) => Math.sin(g.time * 6 + i * 0.6 + tg.x) * 3;
    ctx.beginPath();
    ctx.moveTo(-tg.w / 2, -14);
    for (let i = 0; i <= 6; i++) ctx.lineTo(-tg.w / 2 + (i / 6) * tg.w, -14 + wave(i) * (i / 6));
    for (let i = 6; i >= 0; i--) ctx.lineTo(-tg.w / 2 + (i / 6) * tg.w, -1 + wave(i) * (i / 6) - (i / 6) * 4);
    ctx.closePath();
    ctx.fillStyle = hit ? "#fff" : p.accent;
    ctx.shadowColor = p.accent;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = metalStops(ctx.createLinearGradient(-tg.w / 2 - 2, 0, -tg.w / 2 + 2, 0), [m[0], m[1], m[3]]);
    ctx.fillRect(-tg.w / 2 - 2, -18, 4, 22);
    ctx.beginPath();
    ctx.arc(-tg.w / 2, -18, 3, 0, Math.PI * 2);
    ctx.fillStyle = p.glow;
    ctx.fill();
  } else if (style === "shield") {
    const w = tg.w / 2;
    ctx.beginPath();
    ctx.moveTo(-w, -8);
    ctx.lineTo(w, -8);
    ctx.lineTo(w, 0);
    ctx.quadraticCurveTo(w * 0.7, 8, 0, 11);
    ctx.quadraticCurveTo(-w * 0.7, 8, -w, 0);
    ctx.closePath();
    ctx.fillStyle = hit ? "#fff" : p.accent;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = metalStops(ctx.createLinearGradient(-w, -8, w, 8), [m[0], m[1], m[2], m[3]]);
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(-1.5, -6, 3, 14);
    ctx.fillRect(-w + 4, -2, tg.w - 8, 3);
  } else if (style === "gem") {
    const w = tg.w / 2;
    ctx.beginPath();
    ctx.moveTo(-w, -2);
    ctx.lineTo(-w * 0.55, -8);
    ctx.lineTo(w * 0.55, -8);
    ctx.lineTo(w, -2);
    ctx.lineTo(0, 9);
    ctx.closePath();
    const gg = ctx.createLinearGradient(-w, -8, w, 9);
    gg.addColorStop(0, "#ffffff");
    gg.addColorStop(0.4, hit ? "#fff" : p.accent);
    gg.addColorStop(1, hexA(p.primary, 1));
    ctx.fillStyle = gg;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-w, -2);
    ctx.lineTo(w, -2);
    ctx.moveTo(-w * 0.55, -8);
    ctx.lineTo(0, 9);
    ctx.lineTo(w * 0.55, -8);
    ctx.stroke();
    const tw = (Math.sin(g.time * 4 + tg.x) + 1) / 2;
    ctx.fillStyle = `rgba(255,255,255,${tw})`;
    ctx.fillRect(w * 0.2, -6, 2, 2);
  } else if (style === "post") {
    const n = Math.max(2, Math.round(tg.w / 14));
    for (let i = 0; i < n; i++) {
      const x = -tg.w / 2 + 5 + (i / (n - 1)) * (tg.w - 10);
      ctx.beginPath();
      ctx.arc(x, 0, 6, 0, Math.PI * 2);
      ctx.fillStyle = metalStops(ctx.createRadialGradient(x - 2, -2, 0, x, 0, 6), [m[0], m[1], m[3]]);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, 0, 3, 0, Math.PI * 2);
      ctx.fillStyle = hit ? "#fff" : p.accent;
      ctx.fill();
    }
  } else {
    ctx.fillStyle = hit ? "#fff" : p.accent;
    ctx.fillRect(-tg.w / 2, -5, tg.w, 10);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(-tg.w / 2, -5, tg.w, 2.5);
    ctx.strokeStyle = metalStops(ctx.createLinearGradient(-tg.w / 2, 0, tg.w / 2, 0), [m[0], m[1], m[2], m[3]]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-tg.w / 2, -5, tg.w, 10);
  }
  ctx.restore();
}

export function drawFlipper(ctx, side, angle, t, parts = {}) {
  // Dedicated right image: draw it without mirroring; pivot is at its right end.
  // Left-only: mirror the left image for the right side (original behaviour).
  const hasDedicatedRight = side === "right" && !!parts.flipper_right;
  const img = hasDedicatedRight ? parts.flipper_right : parts.flipper_left;
  if (img) {
    const F = parts.flipMeta || FLIP;
    const pv = (t.pivots && t.pivots[side]) || tablePivots(t)[side];
    const flen = tableFlipperLen(t, side);
    const s = (flen + FR1) / (img.width * F.len);
    ctx.save();
    ctx.translate(pv.x, pv.y);
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 4;
    if (hasDedicatedRight) {
      // Right image has pivot at its right end: px_right = 1 - px_left.
      // Arm points left, so rotation is negated: -angle + tilt.
      ctx.rotate(-angle + F.tilt);
      ctx.drawImage(img, -img.width * (1 - F.px) * s, -img.height * F.py * s, img.width * s, img.height * s);
    } else {
      if (side === "right") ctx.scale(-1, 1);
      ctx.rotate(angle + F.tilt);
      ctx.drawImage(img, -img.width * F.px * s, -img.height * F.py * s, img.width * s, img.height * s);
    }
    ctx.restore();
    return;
  }
  const color = t.palette.accent;
  const m = metal(t) || METALS.chrome;
  const pv = (t.pivots && t.pivots[side]) || tablePivots(t)[side];
  const flen = tableFlipperLen(t, side);
  const d = flipperDir(side, angle);
  const tx = pv.x + d.x * flen;
  const ty = pv.y + d.y * flen;
  const nx = -d.y;
  const ny = d.x;
  const shape = (ox, oy) => {
    ctx.beginPath();
    ctx.moveTo(pv.x + nx * FR0 + ox, pv.y + ny * FR0 + oy);
    ctx.lineTo(tx + nx * FR1 + ox, ty + ny * FR1 + oy);
    ctx.arc(tx + ox, ty + oy, FR1, Math.atan2(ny, nx), Math.atan2(-ny, -nx), true);
    ctx.lineTo(pv.x - nx * FR0 + ox, pv.y - ny * FR0 + oy);
    ctx.arc(pv.x + ox, pv.y + oy, FR0, Math.atan2(-ny, -nx), Math.atan2(ny, nx), true);
    ctx.closePath();
  };
  ctx.save();
  shape(3, 6);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fill();
  shape(0, 0);
  const g = ctx.createLinearGradient(pv.x + nx * FR0, pv.y + ny * FR0, pv.x - nx * FR0, pv.y - ny * FR0);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.3, color);
  g.addColorStop(1, hexA(color, 0.75));
  ctx.fillStyle = g;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#111";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(pv.x, pv.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = metalStops(ctx.createRadialGradient(pv.x - 1, pv.y - 1, 0, pv.x, pv.y, 4), [m[0], m[1], m[3]]);
  ctx.fill();
  ctx.restore();
}

function drawBall(ctx, b, parts = {}) {
  const s = b.ride ? 1.25 : 1;
  const r = BALL_R * s;
  const off = b.ride ? 12 : 3;
  ctx.beginPath();
  ctx.arc(b.x + off * 0.6, b.y + off, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fill();
  if (parts.ball) {
    drawContain(ctx, parts.ball, b.x, b.y, r * 2.1, r * 2.1);
    return;
  }
  const g = ctx.createRadialGradient(b.x - 3 * s, b.y - 4 * s, 1, b.x, b.y, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.3, "#dfe3ea");
  g.addColorStop(0.7, "#7b828f");
  g.addColorStop(1, "#2a2e36");
  ctx.beginPath();
  ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(b.x + 2 * s, b.y + 4 * s, r * 0.5, r * 0.18, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fill();
}

function drawElements(ctx, g) {
  const t = g.table;
  const p = t.palette;
  const fx = g.fx;
  const fonts = g.fonts;
  const chase = Math.floor(g.time * 6) % 3;
  const P = g.parts || {};
  // Top-lane letter inserts — glowing circles showing lit/unlit state.
  // effectiveTopLanes ensures inserts always draw even with no AI lane data.
  const CHAN_Y = 93; // vertical center of the insert circles
  effectiveTopLanes(t).forEach((r, i) => {
    const lit = !!g.lit["tl_" + i];
    ctx.save();
    // Dark backing disc so letters always read against the playfield art
    ctx.beginPath();
    ctx.arc(r.x, CHAN_Y, 15, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r.x, CHAN_Y, 13, 0, Math.PI * 2);
    ctx.fillStyle = lit ? p.glow : hexA(p.glow, 0.15);
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = lit ? 40 : 8;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hexA(p.glow, lit ? 1 : 0.6);
    ctx.stroke();
    ctx.restore();
    label(ctx, (r.label || "?").slice(0, 2), r.x, CHAN_Y, lit ? "#000" : "#fff", 12, fonts.display);
  });
  (t.rollovers || []).forEach((r) => {
    const lit = g.lit[r.id];
    if (P.rollover) {
      const img = lit && P.rollover_lit ? P.rollover_lit : P.rollover;
      ctx.save();
      if (lit) {
        ctx.shadowColor = p.glow;
        ctx.shadowBlur = 20;
      }
      drawContain(ctx, img, r.x, r.y, 30, 30);
      ctx.restore();
      label(ctx, r.label?.slice(0, 3), r.x, r.y + 22, p.glow, 9, fonts.body);
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(r.x, r.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = lit ? p.glow : "rgba(0,0,0,0.6)";
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = lit ? 24 : 0;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = p.glow;
    ctx.stroke();
    ctx.restore();
    label(ctx, r.label?.slice(0, 3), r.x, r.y, lit ? "#000" : p.glow, 10, fonts.body);
  });
  (t.ramps || []).forEach((r) => {
    if (P.arrow) {
      const on = (fx[r.id] || 0) > 0 || g.flash || Math.floor(g.time * 3) % 2 === 0;
      part(ctx, on && P.arrow_lit ? P.arrow_lit : P.arrow, r.x, r.y, 26, 40, (r.angle ?? -1.57) + Math.PI / 2);
    } else drawArrow(ctx, r, p, (fx[r.id] || 0) > 0 || g.flash ? true : chase);
    label(ctx, r.label, r.x, r.y + 30, "#fff", 9, fonts.body);
  });
  (t.saucers || []).forEach((s) => {
    if (P.saucer) {
      ctx.save();
      if ((fx[s.id] || 0) > 0) {
        ctx.shadowColor = p.accent;
        ctx.shadowBlur = 30;
      }
      drawContain(ctx, P.saucer, s.x, s.y, 38, 38);
      ctx.restore();
      label(ctx, s.label, s.x, s.y + 28, p.accent, 9, fonts.body);
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(s.x, s.y, 17, 0, Math.PI * 2);
    const m = metal(t) || METALS.chrome;
    ctx.fillStyle = metalStops(ctx.createLinearGradient(s.x - 17, s.y - 17, s.x + 17, s.y + 17), m);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s.x, s.y, 13, 0, Math.PI * 2);
    const hg = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, 13);
    hg.addColorStop(0, "#000");
    hg.addColorStop(1, hexA(p.accent, (fx[s.id] || 0) > 0 ? 0.9 : 0.35));
    ctx.fillStyle = hg;
    ctx.shadowColor = p.accent;
    ctx.shadowBlur = (fx[s.id] || 0) > 0 ? 30 : 8;
    ctx.fill();
    ctx.restore();
    label(ctx, s.label, s.x, s.y + 28, p.accent, 9, fonts.body);
  });
  (t.targets || []).forEach((tg) => {
    drawTarget(ctx, tg, g);
    const nx = -Math.sin(tg.angle || 0);
    const ny = Math.cos(tg.angle || 0);
    label(ctx, tg.label, tg.x + nx * 17, tg.y + ny * 17, g.down[tg.id] ? "rgba(255,255,255,0.35)" : "#fff", 8, fonts.body);
  });
  (t.bumpers || []).forEach((b, i) => drawBumper(ctx, b, t, fx[b.id] || 0, g.bumperImg(i), g.time, fonts, g.parts));
  for (const side of ["left", "right"]) {
    if ((fx["sling-" + side] || 0) > 0) {
      const P = tableSlingshots(t)[side];
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(P[0][0], P[0][1]);
      ctx.lineTo(P[2][0], P[2][1]);
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#fff";
      ctx.shadowColor = p.secondary;
      ctx.shadowBlur = 24;
      ctx.stroke();
      ctx.restore();
    }
  }
}

export function drawFrame(ctx, g) {
  ctx.clearRect(0, 0, W, H);
  if (g.staticLayer) ctx.drawImage(g.staticLayer, 0, 0, W, H);
  if (!g.hideElements) drawElements(ctx, g);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(LANE, 300);
  ctx.lineTo(RIGHT, 262);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.restore();
  const pull = g.plungerCharge * 30;
  ctx.fillStyle = "#c9ced8";
  ctx.fillRect(LANE + 8, PLUNGER_Y + pull, RIGHT - LANE - 16, 6);
  ctx.fillStyle = g.table.palette.accent;
  ctx.fillRect(LANE + 13, PLUNGER_Y + 6 + pull, RIGHT - LANE - 26, 14);
  // Flippers always render on top — the AI art is told NOT to paint flippers,
  // so even in Photo-only mode the real, working flippers show over the image.
  drawFlipper(ctx, "left", g.flippers.left.angle, g.table, g.parts);
  drawFlipper(ctx, "right", g.flippers.right.angle, g.table, g.parts);
  g.balls.filter((b) => !b.ride).forEach((b) => drawBall(ctx, b, g.parts));
  g.ambient?.draw(ctx, g.table.palette, g.time);
  if (!g.hideElements && g.table.show_guide_walls === true) (g.table.ramps || []).forEach((r) => {
    const path = g.habitrails?.[r.id] || habitrailPath(r);
    if (path) drawWireform(ctx, path.pts, g.table, true);
  });
  g.balls.filter((b) => b.ride).forEach((b) => drawBall(ctx, b, g.parts));
  g.particles.forEach((pt) => {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - 1.5, pt.y - 1.5, 3, 3);
  });
  ctx.globalAlpha = 1;
  if (g.flash) {
    ctx.fillStyle = hexA(g.flash.color, Math.max(0, g.flash.life) * 0.35);
    ctx.fillRect(0, 0, W, H);
  }
  if (g.selected) {
    const el = (g.table[g.selected.kind] || []).find((e) => e.id === g.selected.id);
    if (el) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(el.x, el.y, (el.r || el.w / 2 || 16) + 12, 0, Math.PI * 2);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }
  if (g.tilted) {
    ctx.font = `900 56px "${g.fonts.display}", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,40,40,0.85)";
    ctx.fillText("TILT", 233, 450);
  }
}