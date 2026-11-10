import { Link } from "wouter";
import { Gamepad2 } from "lucide-react";

// Quick games that need no setup and store nothing.
//
// Unlike puzzles, hunts and memory games, these have no database table, no
// builder and no per-user records -- there's nothing to create, so they're
// simply always present. That's why this is a static list rather than a query:
// adding one is a route plus a line here.
const ARCADE_GAMES = [
  { href: "/game/tictactoe", emoji: "⭕", title: "Tic-Tac-Toe",   blurb: "Two players, one grid" },
  { href: "/game/reaction",  emoji: "⚡", title: "Reaction Test",  blurb: "How fast can you click?" },
  { href: "/game/simon",     emoji: "🎨", title: "Simon Says",     blurb: "Repeat the pattern" },
  { href: "/game/whackamole",emoji: "🔨", title: "Whack-a-Mole",   blurb: "30 seconds, how many?" },
  { href: "/game/peg-solitaire",   emoji: "🪵", title: "Peg Solitaire",   blurb: "One peg left wins" },
  { href: "/game/just-press-it",  emoji: "🔘", title: "Just Press It",  blurb: "Press it. Chase it. Break out." },
] as const;

export function ArcadeSection() {
  return (
    <div className="max-w-7xl mx-auto px-8 w-full pt-6">
      <div className="flex items-center gap-2 mb-3">
        <Gamepad2 className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Quick Games
        </h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {ARCADE_GAMES.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            className="group rounded-xl border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors"
          >
            <div className="aspect-video flex items-center justify-center bg-muted/40 text-4xl">
              {g.emoji}
            </div>
            <div className="p-3">
              <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{g.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{g.blurb}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
