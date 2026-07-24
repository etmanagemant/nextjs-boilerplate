import "./globals.css";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import GlobalTopBar from "@/components/layout/GlobalTopBar";

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
      <body className="min-h-screen bg-[#050505] text-[#E2C48A] antialiased tracking-wide">
        {/* Gold accent line at the very top edge of the page - used to sit
            as the header's bottom border, moved here per the sidebar-first
            layout redesign. */}
        <div className="fixed top-0 left-0 right-0 h-[2px] z-[60] bg-gradient-to-r from-transparent via-[#C9A86A] to-transparent" />

        {user && <GlobalTopBar />}
        {user && <GlobalSidebar role={role} />}

        <main className={user ? "pt-16 pl-16 min-h-screen bg-gradient-to-b from-[#050505] via-[#080808] to-[#030303]" : "min-h-screen bg-gradient-to-b from-[#050505] via-[#080808] to-[#030303]"}>
          {children}
        </main>
      </body>
    </html>
  );
}
