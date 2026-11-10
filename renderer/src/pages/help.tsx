import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { HelpCircle, Search, Mail, Film, Tv, Archive, Share2, Wrench, SettingsIcon, FolderOpen, ClipboardList, Rocket, Compass } from "lucide-react";

interface HelpArticle {
  id: number;
  category: string;
  question: string;
  answer: string;
}

// Just cosmetic groupings for known categories -- any new category added
// later from Admin that isn't in this list still works fine, it just gets
// the generic FolderOpen icon instead of a more specific one.
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "Getting Started": HelpCircle,
  "My Videos": Film,
  "TV Shows & the Browser Extension": Tv,
  "Plex Library": Archive,
  "My Vault": Archive,
  "Sharing with Friends": Share2,
  "Fixing Problems": Wrench,
  "Settings": SettingsIcon,
  "Launch Deck": Rocket,
  "Discover": Compass,
  "QC and Developer Notes": ClipboardList,
};

// Kept in sync with QC_HELP_CATEGORY in the API's admin routes. The server
// already strips this category out for anyone below Level 2 Admin, so it only
// ever arrives for staff -- the badge just makes that obvious on screen so
// nobody mistakes these working notes for customer-facing Help.
const QC_HELP_CATEGORY = "QC and Developer Notes";

async function fetchHelpArticles(): Promise<HelpArticle[]> {
  const res = await fetch("/api/help", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load help articles");
  return res.json();
}

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const { data: articles = [], isLoading, isError } = useQuery({
    queryKey: ["help-articles"],
    queryFn: fetchHelpArticles,
  });

  // Group the flat, admin-editable list into categories client-side,
  // preserving the order the backend already sorted them in.
  const categories: { title: string; entries: HelpArticle[] }[] = [];
  for (const article of articles) {
    let group = categories.find((c) => c.title === article.category);
    if (!group) { group = { title: article.category, entries: [] }; categories.push(group); }
    group.entries.push(article);
  }

  const filtered = categories
    .map((cat) => ({
      ...cat,
      entries: q
        ? cat.entries.filter(
            (e) => e.question.toLowerCase().includes(q) || e.answer.toLowerCase().includes(q),
          )
        : cat.entries,
    }))
    .filter((cat) => cat.entries.length > 0);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <HelpCircle className="w-8 h-8 text-primary" />
            Help
          </h1>
          <p className="text-muted-foreground mt-2">
            Search for answers, or scroll down if you'd rather send us a message directly.
          </p>
        </div>

        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search for something…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 h-11 text-base"
            autoFocus
          />
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">Loading…</div>
        )}

        {isError && (
          <div className="flex items-center justify-center py-16 text-sm text-destructive">Couldn't load help articles.</div>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <HelpCircle className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nothing matched "{query}" — try the contact link below.</p>
          </div>
        )}

        <div className="space-y-8">
          {filtered.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.title] ?? FolderOpen;
            const isStaffOnly = cat.title === QC_HELP_CATEGORY;
            return (
              <section key={cat.title}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className={`w-4 h-4 ${isStaffOnly ? "text-amber-500" : "text-muted-foreground"}`} />
                  <h2 className={`text-sm font-semibold tracking-wider uppercase ${isStaffOnly ? "text-amber-500" : "text-muted-foreground"}`}>
                    {cat.title}
                  </h2>
                  {isStaffOnly && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase bg-amber-500/15 text-amber-500 border border-amber-500/30">
                      Staff only
                    </span>
                  )}
                </div>
                <div className={`bg-card border rounded-xl divide-y divide-border overflow-hidden ${isStaffOnly ? "border-amber-500/30" : "border-border"}`}>
                  {cat.entries.map((e) => (
                    <div key={e.id} className="px-5 py-4">
                      <p className="font-medium text-sm">{e.question}</p>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{e.answer}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-10 p-6 rounded-xl border border-border bg-card flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-medium text-sm">Still stuck?</p>
            <p className="text-xs text-muted-foreground mt-0.5">Send us a message and we'll get back to you.</p>
          </div>
          <a
            href="mailto:gkup22@gmail.com?subject=URLinc%20help"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity shrink-0"
          >
            <Mail className="w-4 h-4" />
            Email Us
          </a>
        </div>
      </div>
    </Layout>
  );
}
