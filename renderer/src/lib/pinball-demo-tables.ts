// Pre-baked demo table specs — no Claude API call needed for layout.
// Art still generates via DALL-E in the background on first play.

export const MONSTER_MATINEE: Record<string, unknown> = {
  title: "Monster Matinee",
  tagline: "They bought their tickets. Now they're watching you.",
  palette: {
    backdrop: "#09050a",
    surface: "#150b10",
    accent: "#c8102e",
    glow: "#ff6b1a",
    metal: "#c8a96e",
  },
  top_lanes: [
    { label: "H", x: 70,  y: 80, points: 100 },
    { label: "O", x: 130, y: 80, points: 100 },
    { label: "R", x: 190, y: 80, points: 100 },
    { label: "R", x: 260, y: 80, points: 100 },
    { label: "O", x: 320, y: 80, points: 100 },
    { label: "R", x: 380, y: 80, points: 100 },
  ],
  bumpers: [
    { label: "COUNT",   x: 155, y: 195, r: 27, points: 350 },
    { label: "COLOSSUS", x: 250, y: 165, r: 29, points: 400 },
    { label: "LYCANTHR", x: 345, y: 195, r: 27, points: 350 },
    { label: "ANCIENT", x: 195, y: 270, r: 24, points: 300 },
    { label: "GILL-MAN", x: 305, y: 270, r: 24, points: 300 },
  ],
  targets: [
    { label: "V", x: 108, y: 355, w: 28, angle: 0.28,  style: "drop",   points: 600 },
    { label: "A", x: 138, y: 388, w: 28, angle: 0.28,  style: "drop",   points: 600 },
    { label: "M", x: 168, y: 421, w: 28, angle: 0.28,  style: "drop",   points: 600 },
    { label: "P", x: 342, y: 355, w: 28, angle: -0.28, style: "shield", points: 600 },
    { label: "I", x: 312, y: 388, w: 28, angle: -0.28, style: "shield", points: 600 },
    { label: "R", x: 282, y: 421, w: 28, angle: -0.28, style: "shield", points: 600 },
  ],
  rollovers: [
    { label: "AISLE",    x: 250, y: 555, points: 150 },
    { label: "FILM REEL", x: 250, y: 625, points: 300 },
  ],
  ramps: [
    {
      label: "LEFT BALCONY",
      x: 105, y: 425,
      angle: -2.0,
      habitrail: "left",
      points: 3000,
      path: [[105,425],[88,330],[72,230],[62,150],[85,640]],
    },
    {
      label: "RIGHT BALCONY",
      x: 340, y: 425,
      angle: -1.1,
      habitrail: "right",
      points: 3000,
      path: [[340,425],[355,330],[368,230],[358,150],[338,640]],
    },
  ],
  saucers: [
    { label: "PROJECTOR", x: 250, y: 475, angle: 0, points: 12000 },
  ],
  inlanes: {
    left:  { topY: 660, bottomX: 128, bottomY: 762 },
    right: { topY: 660, bottomX: 338, bottomY: 762 },
  },
  slingshots: {
    left:  [[65, 565], [70, 660], [128, 700]],
    right: [[435, 565], [430, 660], [372, 700]],
  },
  rails: [],
  flippers: {
    left:  { pivotX: 128, pivotY: 762, length: 82 },
    right: { pivotX: 338, pivotY: 762, length: 82 },
  },
  flipper_rest: 0.42,
  gravity: 1.0,
  bounce: 1.0,
  story: `The lights dim in the Grand Guignol Theater. You have the best seat in the house — or rather, the only one left. All around you, they settle into the velvet seats with the patience of creatures who have waited centuries for a good show. A Vampire Count to your left, pale fingers drumming. The Colossus of flesh and bolts looming to your right. The ancient Lycanthrope sniffs the popcorn-scented air. The Gill-Man drips quietly on the upholstery. The bandaged Ancient One does not blink. On screen, lightning tears apart a castle you recognize. The hooded projectionist threads the next reel. One rule at the Monster Matinee: keep the ball alive. When the film ends, the monsters turn around. And tonight, you are the main feature. LIGHTS OUT.`,
  font_style: "serif",
};

// Art prompt specifically tuned for Monster Matinee
export const MONSTER_MATINEE_ART_PROMPT = `Photorealistic pinball machine playfield background artwork. Theme: "Monster Matinee" — classic original horror archetypes at a gothic cinema. Portrait orientation, tall and narrow, roughly 1:2 width-to-height ratio. No physical game parts: no bumpers, no rails, no flippers, no ball.

LAYOUT bottom to top:
BOTTOM: A gothic theater floor — worn red velvet carpet runner up the center aisle, scattered popcorn, old ticket stubs, a cracked antique film reel lying on the floor. Skeleton hands grip armrests emerging from the ground.
LOWER-MID: Rows of plush velvet theater seats filled with original horror archetypes — a pale vampire count, a giant bolt-necked reanimated figure, a storm-haired lightning bride, a snarling werewolf, a bandaged ancient mummy, a scaled gill-creature, a bandaged invisible figure with dark glasses. They sit in silhouette profile, illuminated from ahead by the cold blue-white glow of the movie screen. Ultra-realistic, cinematic, deeply detailed faces.
CENTER: A wide movie screen showing a black-and-white horror film — a crumbling castle being struck by lightning, old film grain and light spill. The screen glow floods the theater in cold blue-white.
UPPER-MID: Ornate gothic theater interior above the screen — baroque carved stonework arch, heavy crimson velvet curtains with gold fringe, candelabras with melted candles on both sides, gargoyle carvings in the arch.
TOP: Vaulted cathedral ceiling with cobwebs and hanging bats. A crescent moon visible through a cracked stained-glass rose window at the very top.

CRITICAL: Dozens of large circular LED insert lights scattered across the entire playfield — perfect glowing circles with bright centers and soft bloom. Colors: deep crimson red, warm amber/orange, electric blue, sickly green. These are the dominant lighting elements.

Gold chrome cabinet rails visible on both long side edges. Deep theatrical blacks, extreme HDR contrast, cold blue-white from the screen vs warm amber from candles. Fully saturated palette.

8K ultra-detailed, Zen Studios Pinball FX3 quality. No game elements, no text, no logos, no watermarks.`;
