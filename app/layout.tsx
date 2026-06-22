import "./globals.css";
import { createClient } from "@/utils/supabase/server";

export const metadata = {
  title: "ET Management",
  description: "Agency dashboard",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let role = "chatter"; // Standardmäßig Chatter-Rolle
  if (user) {
    // 🛡️ BUCHSTABEN-FIX: Akzeptiert jetzt BEIDE Schreibweisen (mit "e" und mit "a"!), damit du immer Admin bist!
    if (
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" || 
      user.email === "etmanagement@gmail.com" || 
      user.email === "etmanagemant@gmail.com"
    ) {
      role = "admin";
    } else {
      const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
      if (profile && profile.role === "admin") role = "admin";
    }
  }

  return (
    <html lang="de" className="dark">
      <body className="min-h-screen bg-[#050505] text-[#F3E5AB] antialiased tracking-wide selection:bg-[#AA7C11]/30 selection:text-white">
        <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-[#AA7C11]/30 bg-[#0A0A0A]/90 backdrop-blur px-6 shadow-lg shadow-black/50">
          <div className="flex h-full items-center justify-between w-full relative">
            
            {/* LINKS: Die reparierte Navigations-Weiche */}
            <nav className="flex items-center gap-2 flex-wrap z-10">
              <a href="/" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md transition-all outline-none">Start</a>
              
              {role === "admin" && (
                <>
                  <a href="/management" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md transition-all outline-none">Management</a>
                  <a href="/dashboard" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md transition-all outline-none">Dashboard</a>
                  <a href="/massmessage" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md transition-all outline-none">Mass Messages</a>
                  <a href="/buchhaltung" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md transition-all outline-none border border-amber-400/20">Buchhaltung</a>
                  <a href="/chatter" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md transition-all outline-none">Stechuhr</a>
                  <a href="/abrechnung" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md transition-all outline-none border border-amber-400/20">Abrechnung</a>
                </>
              )}

              {role !== "admin" && (
                <>
                  <a href="/chatter" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md transition-all outline-none">Stechuhr</a>
                  <a href="/abrechnung" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-3 py-1.5 text-xs font-bold text-black shadow-md transition-all outline-none border border-amber-400/20">Abrechnung</a>
                </>
              )}
            </nav>

            {/* MITTE: Agentur-Name */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-lg font-black tracking-normal uppercase text-transparent bg-clip-text bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#AA7C11] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                ETManagement
              </span>
            </div>

            <div className="w-20 z-10"></div>
          </div>
        </header>

        <main className="pt-20 min-h-screen bg-gradient-to-b from-[#050505] via-[#080808] to-[#030303]">
          {children}
        </main>
      </body>
    </html>
  );
}
