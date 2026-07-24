import "./globals.css";
import Link from "next/link";
import Image from "next/image";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";

export const metadata = {
  title: "ET Management",
  description: "Agency dashboard",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getCurrentUser();

  let role = "chatter";
  if (user) {
    if (
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" ||
      user.email === "etmanagemant@gmail.com"
    ) {
      role = "admin";
    } else {
      const profile = await getCurrentProfile(user.id);
      if (profile && profile.role === "moderator") {
        role = "moderator";
      } else if (profile && profile.role === "admin") {
        role = "admin";
      }
    }
  }

  return (
    <html lang="de" className="dark">
      <body className="min-h-screen bg-[#050505] text-[#F3E5AB] antialiased tracking-wide">
        <header className="fixed top-0 left-0 right-0 z-50 h-20 border-b border-[#8A6D3F]/30 bg-[#0A0A0A]/90 backdrop-blur px-3 shadow-lg shadow-black/50">
          <div className="flex h-full items-center justify-between w-full relative">
            
            {/* LEFT SIDE - Start, Dashboard, OnlyFans, Stechuhr, Abrechnung */}
            <nav className="flex items-center gap-0.5 flex-nowrap z-10 flex-1 min-w-0">
              <Link href="/" className="rounded-lg bg-black border border-[#D4AF37]/60 text-[#D4AF37] px-4 py-2.5 text-sm font-bold shadow-md hover:shadow-lg hover:shadow-[#D4AF37]/60 hover:text-[#F3E5AB] hover:border-[#F3E5AB] transition-all duration-200 hover:-translate-y-0.5 btn-gold-outline whitespace-nowrap">Start</Link>
              <Link href="/dashboard" className="rounded-lg bg-black border border-[#D4AF37]/60 text-[#D4AF37] px-4 py-2.5 text-sm font-bold shadow-md hover:shadow-lg hover:shadow-[#D4AF37]/60 hover:text-[#F3E5AB] hover:border-[#F3E5AB] transition-all duration-200 hover:-translate-y-0.5 btn-gold-outline whitespace-nowrap">Dashboard</Link>
              <Link href="/crm-inbox" className="rounded-lg bg-black border border-[#D4AF37]/60 text-[#D4AF37] px-4 py-2.5 text-sm font-bold shadow-md hover:shadow-lg hover:shadow-[#D4AF37]/60 hover:text-[#F3E5AB] hover:border-[#F3E5AB] transition-all duration-200 hover:-translate-y-0.5 btn-gold-outline whitespace-nowrap"><span>🔮</span> OnlyFans</Link>
              {role !== "admin" && (
                <Link href="/stripchat" className="rounded-lg bg-black border border-[#D4AF37]/60 text-[#D4AF37] px-4 py-2.5 text-sm font-bold shadow-md hover:shadow-lg hover:shadow-[#D4AF37]/60 hover:text-[#F3E5AB] hover:border-[#F3E5AB] transition-all duration-200 hover:-translate-y-0.5 btn-gold-outline whitespace-nowrap"><span>🎬</span> Stripchat</Link>
              )}

              {role === "admin" && (
                <>
                  <Link href="/chatter" className="rounded-lg bg-black border border-[#D4AF37]/60 text-[#D4AF37] px-4 py-2.5 text-sm font-bold shadow-md hover:shadow-lg hover:shadow-[#D4AF37]/60 hover:text-[#F3E5AB] hover:border-[#F3E5AB] transition-all duration-200 hover:-translate-y-0.5 btn-gold-outline whitespace-nowrap">Stechuhr</Link>
                  <Link href="/abrechnung" className="rounded-lg bg-black border border-[#D4AF37]/60 text-[#D4AF37] px-4 py-2.5 text-sm font-bold shadow-md hover:shadow-lg hover:shadow-[#D4AF37]/60 hover:text-[#F3E5AB] hover:border-[#F3E5AB] transition-all duration-200 hover:-translate-y-0.5 btn-gold-outline whitespace-nowrap">Abrechnung</Link>
                </>
              )}

              {role === "moderator" && (
                <>
                  <Link href="/chatter" className="rounded-lg bg-black border border-[#D4AF37]/60 text-[#D4AF37] px-4 py-2.5 text-sm font-bold shadow-md hover:shadow-lg hover:shadow-[#D4AF37]/60 hover:text-[#F3E5AB] hover:border-[#F3E5AB] transition-all duration-200 hover:-translate-y-0.5 btn-gold-outline whitespace-nowrap">Stechuhr</Link>
                  <Link href="/abrechnung" className="rounded-lg bg-black border border-[#D4AF37]/60 text-[#D4AF37] px-4 py-2.5 text-sm font-bold shadow-md hover:shadow-lg hover:shadow-[#D4AF37]/60 hover:text-[#F3E5AB] hover:border-[#F3E5AB] transition-all duration-200 hover:-translate-y-0.5 btn-gold-outline whitespace-nowrap">Abrechnung</Link>
                </>
              )}

              {role !== "admin" && role !== "moderator" && (
                <>
                  <Link href="/chatter" className="rounded-lg bg-black border border-[#D4AF37]/60 text-[#D4AF37] px-4 py-2.5 text-sm font-bold shadow-md hover:shadow-lg hover:shadow-[#D4AF37]/60 hover:text-[#F3E5AB] hover:border-[#F3E5AB] transition-all duration-200 hover:-translate-y-0.5 btn-gold-outline whitespace-nowrap">Stechuhr</Link>
                  <Link href="/abrechnung" className="rounded-lg bg-black border border-[#D4AF37]/60 text-[#D4AF37] px-4 py-2.5 text-sm font-bold shadow-md hover:shadow-lg hover:shadow-[#D4AF37]/60 hover:text-[#F3E5AB] hover:border-[#F3E5AB] transition-all duration-200 hover:-translate-y-0.5 btn-gold-outline whitespace-nowrap">Abrechnung</Link>
                </>
              )}
            </nav>

            {/* CENTER - LOGO */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Image
                src="/images/logo.png"
                alt="ET Management"
                width={633}
                height={611}
                priority
                className="h-16 w-auto"
              />
            </div>

            {/* RIGHT SIDE - Management, Massmessage, Plan, Buchhaltung (ADMIN ONLY!) */}
            <nav className="flex items-center gap-0.5 flex-nowrap z-10 flex-1 justify-end min-w-0">
              {role === "admin" && (
                <>
                  <Link href="/management" className="rounded-lg bg-black border border-[#D4AF37]/60 text-[#D4AF37] px-4 py-2.5 text-sm font-bold shadow-md hover:shadow-lg hover:shadow-[#D4AF37]/60 hover:text-[#F3E5AB] hover:border-[#F3E5AB] transition-all duration-200 hover:-translate-y-0.5 btn-gold-outline whitespace-nowrap">Management</Link>
                  <Link href="/massmessage" className="rounded-lg bg-black border border-[#D4AF37]/60 text-[#D4AF37] px-4 py-2.5 text-sm font-bold shadow-md hover:shadow-lg hover:shadow-[#D4AF37]/60 hover:text-[#F3E5AB] hover:border-[#F3E5AB] transition-all duration-200 hover:-translate-y-0.5 btn-gold-outline whitespace-nowrap">Massmessage</Link>
                  <Link href="/stripchat" className="rounded-lg bg-black border border-[#D4AF37]/60 text-[#D4AF37] px-4 py-2.5 text-sm font-bold shadow-md hover:shadow-lg hover:shadow-[#D4AF37]/60 hover:text-[#F3E5AB] hover:border-[#F3E5AB] transition-all duration-200 hover:-translate-y-0.5 btn-gold-outline whitespace-nowrap"><span>🎬</span> Stripchat</Link>
                  <Link href="/content-plan" className="rounded-lg bg-black border border-[#D4AF37]/60 text-[#D4AF37] px-4 py-2.5 text-sm font-bold shadow-md hover:shadow-lg hover:shadow-[#D4AF37]/60 hover:text-[#F3E5AB] hover:border-[#F3E5AB] transition-all duration-200 hover:-translate-y-0.5 btn-gold-outline whitespace-nowrap"><span>📅</span> Plan</Link>
                  <Link href="/buchhaltung" className="rounded-lg bg-black border border-[#D4AF37]/60 text-[#D4AF37] px-4 py-2.5 text-sm font-bold shadow-md hover:shadow-lg hover:shadow-[#D4AF37]/60 hover:text-[#F3E5AB] hover:border-[#F3E5AB] transition-all duration-200 hover:-translate-y-0.5 btn-gold-outline whitespace-nowrap">Buchhaltung</Link>
                </>
              )}
            </nav>
          </div>
        </header>

        <main className="pt-24 min-h-screen bg-gradient-to-b from-[#050505] via-[#080808] to-[#030303]">
          {children}
        </main>
      </body>
    </html>
  );
}
