// display font per theme + readable body font for story text
export const FONTS = {
  Creepster: "IM Fell English",
  Nosifer: "IM Fell English",
  "Pirata One": "IM Fell English",
  "Cinzel Decorative": "Cinzel",
  "Uncial Antiqua": "Cinzel",
  MedievalSharp: "IM Fell English",
  Rye: "Special Elite",
  Bungee: "Bungee",
  Monoton: "Righteous",
  Audiowide: "Audiowide",
  Orbitron: "Orbitron",
  "Press Start 2P": "VT323",
  "Special Elite": "Special Elite",
  "Black Ops One": "Black Ops One",
  "Metal Mania": "IM Fell English",
  Bangers: "Bangers",
  Righteous: "Righteous",
  Fredoka: "Fredoka",
  "Playfair Display": "Playfair Display",
  "Faster One": "Audiowide",
};

const loaded = new Set();

export function themeFonts(table) {
  const display = table?.style?.font && FONTS[table.style.font] ? table.style.font : "Orbitron";
  return { display, body: FONTS[display] };
}

export function loadThemeFonts(table) {
  const { display, body } = themeFonts(table);
  const fams = [display, body].filter((f) => !loaded.has(f));
  if (fams.length) {
    fams.forEach((f) => loaded.add(f));
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${fams.map((f) => `family=${f.replace(/ /g, "+")}`).join("&")}&display=swap`;
    document.head.appendChild(link);
  }
  return Promise.all([display, body].map((f) => document.fonts.load(`40px "${f}"`).catch(() => null)));
}
