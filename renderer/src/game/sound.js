let ctx = null;
let master = null;
export let muted = false;

export function setMuted(m) {
  muted = m;
}

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, dur, type = "square", slide = 0, vol = 1) {
  const c = ensure();
  if (!c || muted) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g);
  g.connect(master);
  o.start();
  o.stop(c.currentTime + dur);
}

const SOUNDS = {
  bumper: () => { tone(880, 0.08, "square", 400); tone(440, 0.12, "triangle", -200, 0.6); },
  sling: () => tone(300, 0.07, "sawtooth", 200, 0.7),
  target: () => tone(660, 0.1, "triangle", -300),
  rollover: () => tone(1200, 0.08, "sine", 300, 0.8),
  ramp: () => { tone(400, 0.3, "sawtooth", 900, 0.6); },
  saucer: () => tone(180, 0.25, "square", -80, 0.8),
  flipper: () => tone(120, 0.04, "square", -40, 0.5),
  launch: () => tone(200, 0.3, "triangle", 600, 0.7),
  drain: () => tone(300, 0.6, "sawtooth", -250, 0.7),
  mission: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.14, "square", 0, 0.7), i * 90)),
  bank: () => [784, 988, 1175].forEach((f, i) => setTimeout(() => tone(f, 0.1, "triangle"), i * 70)),
  extra: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.12, "square", 0, 0.7), i * 80)),
  start: () => [262, 392, 523].forEach((f, i) => setTimeout(() => tone(f, 0.15, "square", 0, 0.6), i * 110)),
  tilt: () => tone(90, 0.8, "sawtooth", -30, 0.9),
};

export function play(name) {
  const fn = SOUNDS[name];
  if (fn) fn();
}

export function unlockAudio() {
  ensure();
}
