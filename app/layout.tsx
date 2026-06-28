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

  let role = "chatter"; 
  if (user) {
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
      <body className="min-h-screen bg-[#050505] text-[#F3E5AB] antialiased tracking-wide">
        <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-[#AA7C11]/30 bg-[#0A0A0A]/90 backdrop-blur px-4 shadow-lg shadow-black/50">
          <div className="flex h-full items-center justify-between w-full relative">
            
            {/* LEFT SIDE - 5 BUTTONS */}
            <nav className="flex items-center gap-1 flex-nowrap z-10 flex-1 min-w-0">
              <a href="/" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] px-2 py-1.5 text-[10px] font-bold text-black shadow-md whitespace-nowrap">Start</a>
              <a href="/dashboard" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] px-2 py-1.5 text-[10px] font-bold text-black shadow-md whitespace-nowrap">Dashboard</a>

              {role === "admin" && (
                <>
                  <a href="/management" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] px-2 py-1.5 text-[10px] font-bold text-black shadow-md whitespace-nowrap">Mgmt</a>
                  <a href="/bewerbungen" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] px-2 py-1.5 text-[10px] font-bold text-black shadow-md whitespace-nowrap">Bewerb</a>
                  <a href="/massmessage" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] px-2 py-1.5 text-[10px] font-bold text-black shadow-md whitespace-nowrap">Msg</a>
                </>
              )}
            </nav>

            {/* CENTER - TITLE */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-sm font-black tracking-normal uppercase text-transparent bg-clip-text bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#AA7C11]">
                ETManagement
              </span>
            </div>

            {/* RIGHT SIDE - 4 BUTTONS */}
            <nav className="flex items-center gap-1 flex-nowrap z-10 flex-1 justify-end min-w-0">
              {role === "admin" && (
                <>
                  <a href="/content-plan" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] px-2 py-1.5 text-[10px] font-bold text-black shadow-md whitespace-nowrap">📅 Plan</a>
                  <a href="/buchhaltung" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] px-2 py-1.5 text-[10px] font-bold text-black shadow-md border border-amber-400/20 whitespace-nowrap">Buchh</a>
                  <a href="/chatter" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] px-2 py-1.5 text-[10px] font-bold text-black shadow-md whitespace-nowrap">Stechuhr</a>
                  <a href="/abrechnung" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] px-2 py-1.5 text-[10px] font-bold text-black shadow-md border border-amber-400/20 whitespace-nowrap">Abrech</a>
                </>
              )}

              {role !== "admin" && (
                <>
                  <a href="/chatter" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] px-2 py-1.5 text-[10px] font-bold text-black shadow-md whitespace-nowrap">Stechuhr</a>
                  <a href="/abrechnung" className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] px-2 py-1.5 text-[10px] font-bold text-black shadow-md border border-amber-400/20 whitespace-nowrap">Abrech</a>
                </>
              )}
            </nav>
          </div>
        </header>

        <main className="pt-20 min-h-screen bg-gradient-to-b from-[#050505] via-[#080808] to-[#030303]">
          {children}
        </main>
      </body>
    </html>
  );
}
