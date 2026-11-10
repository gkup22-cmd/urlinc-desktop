import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Heart, Home, Star, Sparkles } from "lucide-react";

const NOTES = [
  "Your support keeps the servers running and the ideas flowing.",
  "Every contribution goes directly into making URLinc better.",
  "You just made Gary's day — and Tayler's too. 💙",
  "You're officially one of the good ones.",
  "Small donations add up to big things. Thank you.",
];

export default function ThanksPage() {
  const [note] = useState(() => NOTES[Math.floor(Math.random() * NOTES.length)]);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
      <div
        className="flex flex-col items-center gap-6 max-w-md w-full text-center"
        style={{
          opacity: show ? 1 : 0,
          transform: show ? "translateY(0)" : "translateY(18px)",
          transition: "opacity 0.55s ease, transform 0.55s ease",
        }}
      >
        {/* Icon cluster */}
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-rose-500/10 flex items-center justify-center">
            <Heart className="w-10 h-10 text-rose-400 fill-rose-400/30" />
          </div>
          <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-yellow-400" />
          <Star className="absolute -bottom-1 -left-2 w-4 h-4 text-yellow-400 fill-yellow-400/40" />
        </div>

        {/* Headline */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Thank you!
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {note}
          </p>
        </div>

        {/* Divider */}
        <div className="w-16 h-px bg-border" />

        {/* Personal note */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          URLinc is a labor of love built by{" "}
          <span className="text-foreground font-medium">Gary &amp; Angela Kuper</span>,
          dedicated to their daughter{" "}
          <span className="text-foreground font-medium">Tayler</span>.
          Your generosity means the world to us.
        </p>

        {/* Back home */}
        <Link href="/">
          <a className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-sm">
            <Home className="w-4 h-4" />
            Back to URLinc
          </a>
        </Link>
      </div>
    </div>
  );
}
