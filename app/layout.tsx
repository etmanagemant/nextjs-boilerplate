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
        <header className="fixed top-0 left-0 right-0 z-50 h-20 border-b border-[#AA7C11]/30 bg-[#0A0A0A]/90 backdrop-blur px-6 shadow-lg shadow-black/50">
          <div className="grid grid-cols-3 h-full items-center w-full">
            
            {/* LINKS: Alle Navigations-Buttons inklusive umbenanntem Archiv */}
            <nav className="flex items-center gap-2 justify-self-start flex-wrap">
              <a href="/" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md transition-all outline-none">
                Start
              </a>
              <a href="/management" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md transition-all outline-none">
                Management
              </a>
              <a href="/chatter" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md transition-all outline-none">
                Stechuhr
              </a>
              <a href="/dashboard" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md transition-all outline-none">
                Dashboard
              </a>
              <a href="/massmessage" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md transition-all outline-none border border-amber-400/20">
                Mass Messages
              </a>
            </nav>

            {/* MITTE: Großes, edel präsentiertes Logo im Zentrum */}
            <div className="text-center justify-self-center flex items-center justify-center">
              <div className="relative group p-1 bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] rounded-full shadow-md shadow-black/80">
                <img
                  src="/images/logo.png"
                  alt="ET Management Logo"
                  className="h-14 w-14 rounded-full object-cover block bg-black"
                />
              </div>
            </div>

            {/* RECHTS: Platzhalter für Symmetrie */}
            <div className="justify-self-end"></div>

          </div>
        </header>
        {/* Durch den größeren Header passen wir das Padding-Top auf pt-20 an */}
        <main className="pt-20 min-h-screen bg-gradient-to-b from-[#050505] via-[#080808] to-[#030303]">
          {children}
        </main>
      </body>
    </html>
  );
}
