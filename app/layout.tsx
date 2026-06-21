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
          <div className="flex h-full items-center justify-between w-full relative">
            
            {/* LINKS: Alle Navigations-Buttons */}
            <nav className="flex items-center gap-2 flex-wrap z-10">
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

            {/* MITTE: Absolut zentriertes, ungestauchtes Logo */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto p-0.5 bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] rounded-full shadow-lg shadow-black/80 flex items-center justify-center h-14 w-14">
                <img
                  src="/images/logo.png"
                  alt="ET Management Logo"
                  className="h-full w-full rounded-full object-cover block bg-black"
                />
              </div>
            </div>

            {/* RECHTS: Platzhalter für Symmetrie */}
            <div className="w-20 z-10"></div>

          </div>
        </header>
        <main className="pt-24 min-h-screen bg-gradient-to-b from-[#050505] via-[#080808] to-[#030303]">
          {children}
        </main>
      </body>
    </html>
  );
}
