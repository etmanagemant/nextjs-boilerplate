// app/layout.tsx
// @ts-ignore: global CSS import declaration may be missing in type declarations
import "./globals.css";

export const metadata = {
  title: "ET Management",
  description: "Agency dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className="dark">
      <body className="min-h-screen bg-bg-base text-text-primary antialiased bg-brand-glow">
        <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-line-subtle bg-bg-base/70 backdrop-blur px-6">
          {/* Grid sorgt für die exakte Aufteilung: Links, Mitte, Rechts */}
          <div className="grid grid-cols-3 h-full items-center w-full">
            
            {/* LINKS: Alle Navigations-Buttons inklusive Dashboard */}
            <nav className="flex items-center gap-2 justify-self-start">
              <a href="/" className="rounded-lg bg-brand-goldBg px-3 py-1.5 text-xs font-semibold text-bg-base shadow-goldSoft transition hover:bg-brand-goldBgDeep focus:outline-none">
                Start
              </a>
              <a href="/management" className="rounded-lg bg-brand-goldBg px-3 py-1.5 text-xs font-semibold text-bg-base shadow-goldSoft transition hover:bg-brand-goldBgDeep focus:outline-none">
                Management
              </a>
              <a href="/chatter" className="rounded-lg bg-brand-goldBg px-3 py-1.5 text-xs font-semibold text-bg-base shadow-goldSoft transition hover:bg-brand-goldBgDeep focus:outline-none">
                Chatter
              </a>
              <a href="/dashboard" className="rounded-lg bg-brand-goldBg px-3 py-1.5 text-xs font-semibold text-bg-base shadow-goldSoft transition hover:bg-brand-goldBgDeep focus:outline-none">
                Dashboard
              </a>
            </nav>

            {/* MITTE: ET Management groß und zentriert */}
            <div className="text-center justify-self-center">
              <span className="text-xl md:text-2xl font-black tracking-wider uppercase text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-200">
                ET Management
              </span>
            </div>

            {/* RECHTS: Platzhalter für das optische Gleichgewicht */}
            <div className="justify-self-end"></div>

          </div>
        </header>
        <main className="pt-16">
          {children}
        </main>
      </body>
    </html>
  );
}
