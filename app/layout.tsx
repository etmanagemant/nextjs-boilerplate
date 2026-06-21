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
      <body className="min-h-screen bg-[#050505] text-[#F3E5AB] antialiased tracking-wide selection:bg-[#AA7C11]/30 selection:text-white">
        {/* Header im edlen Black & Gold Design */}
        <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-[#AA7C11]/30 bg-[#0A0A0A]/80 backdrop-blur px-6 shadow-lg shadow-black/50">
          <div className="grid grid-cols-3 h-full items-center w-full">
            
            {/* LINKS: Alle Navigations-Buttons inklusive Mass Message Archiv */}
            <nav className="flex items-center gap-2 justify-self-start">
              <a href="/" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md shadow-amber-950/20 transition-all outline-none">
                Start
              </a>
              <a href="/management" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md shadow-amber-950/20 transition-all outline-none">
                Management
              </a>
              <a href="/chatter" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md shadow-amber-950/20 transition-all outline-none">
                Stechuhr
              </a>
              <a href="/dashboard" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md shadow-amber-950/20 transition-all outline-none">
                Dashboard
              </a>
              {/* ✉️ NEUER BUTTON: Direkt-Link auf die Mass-Message-Seite */}
              <a href="/massmessage" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md shadow-amber-950/20 transition-all outline-none">
                Archiv
              </a>
            </nav>

            {/* MITTE: ET Management im originalgetreuen Logo-Look */}
            <div className="text-center justify-self-center flex flex-col items-center">
              <span className="text-xl md:text-2xl font-black tracking-[0.25em] uppercase text-transparent bg-clip-text bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#AA7C11] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                ET
              </span>
              <span className="text-[9px] font-bold tracking-[0.4em] uppercase text-[#D4AF37]/80 -mt-1 block">
                Management
              </span>
            </div>

            {/* RECHTS: Platzhalter für das mathematische Gleichgewicht */}
            <div className="justify-self-end"></div>

          </div>
        </header>
        <main className="pt-16 min-h-screen bg-gradient-to-b from-[#050505] via-[#080808] to-[#030303]">
          {children}
        </main>
      </body>
    </html>
  );
}
