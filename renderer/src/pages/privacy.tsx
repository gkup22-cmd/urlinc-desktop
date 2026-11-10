import { Shield } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="flex items-center gap-3 mb-10">
          <Shield className="w-8 h-8 text-primary shrink-0" />
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
        </div>

        <p className="text-sm text-muted-foreground mb-10">
          Effective date: August 2, 2026 &nbsp;·&nbsp; URLinc (urlinc.us)
        </p>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">URLinc Browser Extension</h2>
          <p className="text-muted-foreground leading-relaxed">
            The URLinc browser extension reads metadata from pages you actively choose to save — specifically the page title, description, and thumbnail image visible on that page. This data is sent only to urlinc.us and stored in your personal URLinc account.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">What we collect</h2>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground leading-relaxed">
            <li>Page title, description, and thumbnail of pages you choose to save</li>
            <li>The URL of those pages</li>
            <li>Your URLinc account identifier, used to associate saved items with your library</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">What we do not collect</h2>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground leading-relaxed">
            <li>Your browsing history — the extension only reads pages you explicitly save</li>
            <li>Passwords, form contents, or any personal data from pages you visit</li>
            <li>Location data</li>
            <li>Any data from pages you visit without clicking the extension</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">How your data is used</h2>
          <p className="text-muted-foreground leading-relaxed">
            Saved items are stored in your URLinc account and displayed back to you in your personal vault. Your data is never sold, shared with advertisers, or disclosed to third parties. It is used solely to power the features of URLinc.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Data deletion</h2>
          <p className="text-muted-foreground leading-relaxed">
            You can delete any saved item at any time from within the URLinc app. To request full account deletion, contact us at the address below.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Permissions explained</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            The extension requests the following Chrome permissions:
          </p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground leading-relaxed">
            <li><span className="text-foreground font-medium">activeTab / scripting</span> — reads metadata from the tab you're currently viewing when you click Save</li>
            <li><span className="text-foreground font-medium">tabs / webNavigation</span> — detects which site you're on so the popup can auto-route to the right section of your vault</li>
            <li><span className="text-foreground font-medium">notifications</span> — shows a brief confirmation after a silent save (Alt+Shift+Z)</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Contact</h2>
          <p className="text-muted-foreground leading-relaxed">
            Questions about this policy? Email us at{" "}
            <a href="mailto:gkup22@gmail.com" className="text-primary underline underline-offset-2">
              gkup22@gmail.com
            </a>
          </p>
        </section>

        <p className="text-xs text-muted-foreground border-t border-border pt-6 mt-10">
          This policy applies to the URLinc browser extension and the urlinc.us web application.
        </p>
      </div>
    </div>
  );
}
