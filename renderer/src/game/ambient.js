import { W, H } from "./geometry";

const rnd = (a, b) => a + Math.random() * (b - a);

const SPECS = {
  fog: { n: 9, make: () => ({ x: rnd(-100, W), y: rnd(80, 760), r: rnd(70, 140), vx: rnd(6, 16), vy: 0, a: rnd(0.04, 0.09) }) },
  bubbles: { n: 34, make: (top) => ({ x: rnd(20, 450), y: top ? rnd(0, H) : H + 10, r: rnd(2, 6), vx: 0, vy: -rnd(20, 55), a: rnd(0.25, 0.6), w: rnd(0, 6) }) },
  embers: { n: 46, make: (top) => ({ x: rnd(20, 450), y: top ? rnd(0, H) : H + 5, r: rnd(1, 2.6), vx: rnd(-8, 8), vy: -rnd(30, 80), a: rnd(0.5, 1), w: rnd(0, 6) }) },
  sparks: { n: 30, make: (top) => ({ x: rnd(20, 450), y: top ? rnd(0, H) : H + 5, r: rnd(0.8, 1.8), vx: rnd(-6, 6), vy: -rnd(15, 40), a: rnd(0.4, 0.9), w: rnd(0, 6) }) },
  stars: { n: 70, make: (top) => ({ x: rnd(10, 460), y: top ? rnd(0, H) : -5, r: rnd(0.5, 1.8), vx: 0, vy: rnd(10, 60), a: rnd(0.3, 1), w: rnd(0, 6) }) },
  rain: { n: 70, make: (top) => ({ x: rnd(0, 500), y: top ? rnd(0, H) : -20, r: rnd(8, 16), vx: -40, vy: rnd(380, 520), a: rnd(0.15, 0.35) }) },
  snow: { n: 60, make: (top) => ({ x: rnd(0, 480), y: top ? rnd(0, H) : -5, r: rnd(1, 3), vx: rnd(-8, 8), vy: rnd(18, 45), a: rnd(0.4, 0.9), w: rnd(0, 6) }) },
  leaves: { n: 18, make: (top) => ({ x: rnd(0, 480), y: top ? rnd(0, H) : -10, r: rnd(3, 6), vx: rnd(-15, 15), vy: rnd(25, 50), a: rnd(0.4, 0.8), w: rnd(0, 6) }) },
  petals: { n: 24, make: (top) => ({ x: rnd(0, 480), y: top ? rnd(0, H) : -10, r: rnd(2.5, 4.5), vx: rnd(-10, 20), vy: rnd(20, 40), a: rnd(0.5, 0.9), w: rnd(0, 6) }) },
  matrix: { n: 26, make: (top) => ({ x: Math.floor(rnd(1, 38)) * 12, y: top ? rnd(0, H) : -20, r: 10, vx: 0, vy: rnd(60, 140), a: rnd(0.2, 0.5), c: "" }) },
  bats: { n: 7, make: () => ({ x: rnd(-60, -10), y: rnd(120, 520), r: rnd(5, 9), vx: rnd(40, 90), vy: rnd(-10, 10), a: 0.75, w: rnd(0, 6) }) },
  fireflies: { n: 22, make: () => ({ x: rnd(30, 440), y: rnd(100, 760), r: rnd(1.5, 2.8), vx: rnd(-10, 10), vy: rnd(-10, 10), a: 1, w: rnd(0, 6) }) },
  lightning: { n: 0 },
};

export class Ambient {
  constructor(kind) {
    this.kind = SPECS[kind] ? kind : "none";
    this.spec = SPECS[this.kind];
    this.parts = this.spec ? Array.from({ length: this.spec.n }, () => this.spec.make(true)) : [];
    this.bolt = null;
    this.nextBolt = 3;
  }

  update(dt, t) {
    if (!this.spec) return;
    for (const p of this.parts) {
      p.x += (p.vx + (p.w !== undefined ? Math.sin(t * 1.5 + p.w) * 10 : 0)) * dt;
      p.y += p.vy * dt;
      if (this.kind === "fireflies") {
        p.vx += rnd(-40, 40) * dt;
        p.vy += rnd(-40, 40) * dt;
      }
      const out = p.y < -40 || p.y > H + 40 || p.x < -160 || p.x > W + 160;
      if (out) Object.assign(p, this.spec.make(false));
    }
    if (this.kind === "lightning") {
      this.nextBolt -= dt;
      if (this.bolt) this.bolt.life -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = rnd(3, 7);
        let x = rnd(80, 400);
        const pts = [[x, 0]];
        for (let y = 40; y < rnd(380, 700); y += 40) pts.push([(x += rnd(-35, 35)), y]);
        this.bolt = { pts, life: 0.35 };
      }
    }
  }

  draw(ctx, p, t) {
    if (!this.spec) return;
    ctx.save();
    const k = this.kind;
    for (const q of this.parts) {
      if (k === "fog") {
        const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r);
        g.addColorStop(0, `rgba(220,230,255,${q.a})`);
        g.addColorStop(1, "rgba(220,230,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(q.x - q.r, q.y - q.r, q.r * 2, q.r * 2);
      } else if (k === "bubbles") {
        ctx.strokeStyle = `rgba(200,240,255,${q.a})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (k === "rain") {
        ctx.strokeStyle = `rgba(180,200,255,${q.a})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - q.r * 0.08, q.y - q.r);
        ctx.stroke();
      } else if (k === "matrix") {
        ctx.font = "11px monospace";
        ctx.fillStyle = `rgba(0,255,120,${q.a})`;
        ctx.fillText(String.fromCharCode(0x30a0 + ((q.y / 12 + q.x) | 0) % 90), q.x, q.y);
      } else if (k === "bats") {
        const f = Math.sin(t * 14 + q.w) * q.r * 0.8;
        ctx.fillStyle = `rgba(0,0,0,${q.a})`;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.quadraticCurveTo(q.x - q.r, q.y - f, q.x - q.r * 2, q.y + 1);
        ctx.quadraticCurveTo(q.x - q.r, q.y + 2, q.x, q.y + 3);
        ctx.quadraticCurveTo(q.x + q.r, q.y + 2, q.x + q.r * 2, q.y + 1);
        ctx.quadraticCurveTo(q.x + q.r, q.y - f, q.x, q.y);
        ctx.fill();
      } else if (k === "leaves" || k === "petals") {
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(t * 2 + q.w);
        ctx.fillStyle = k === "petals" ? `rgba(255,170,200,${q.a})` : `rgba(${q.w > 3 ? "220,140,40" : "160,190,60"},${q.a})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, q.r * 1.6, q.r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        const tw = k === "fireflies" || k === "stars" ? 0.5 + 0.5 * Math.sin(t * 3 + (q.w || 0)) : 1;
        const color = k === "embers" ? "255,140,40" : k === "sparks" ? hexRgb(p.glow) : k === "fireflies" ? "220,255,120" : "255,255,255";
        ctx.fillStyle = `rgba(${color},${q.a * tw})`;
        if (k !== "stars" && k !== "snow") {
          ctx.shadowColor = `rgba(${color},1)`;
          ctx.shadowBlur = 8;
        }
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (this.bolt && this.bolt.life > 0) {
      ctx.fillStyle = `rgba(200,220,255,${this.bolt.life * 0.35})`;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = `rgba(255,255,255,${this.bolt.life * 2.5})`;
      ctx.shadowColor = "#9fd0ff";
      ctx.shadowBlur = 20;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      this.bolt.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    ctx.restore();
  }
}

function hexRgb(hex) {
  const n = parseInt((hex || "#ffffff").slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
