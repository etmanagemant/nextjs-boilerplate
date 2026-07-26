import "./globals.css";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { fetchGrantedFeatureKeys } from "@/lib/getRolePermissions";
import { isAdminTierRole } from "@/lib/roles";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import GlobalTopBar from "@/components/layout/GlobalTopBar";
import WaitingForRole from "@/components/layout/WaitingForRole";

export const metadata = {
  title: "ET Management",
  description: "Agency dashboard",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, user } = await getCurrentUser();

  let role = "chatter";
  // A brand-new self-registered user (see app/login/page.tsx) gets no role
  // at all until an admin assigns one via Management - pending is the true
  // default now, not a silent "chatter" fallback, so nothing should render
  // for them below except the waiting screen.
  let pending = false;
  if (user) {
    if (
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" ||
      user.email === "etmanagemant@gmail.com"
    ) {
      role = "admin";
    } else {
      const profile = await getCurrentProfile(user.id);
      if (!profile || !profile.role) {
        pending = true;
      } else if (profile.role === "moderator") {
        role = "moderator";
      } else if (profile.role === "admin") {
        role = "admin";
      } else {
        role = profile.role;
      }
    }
  }

  // Only chatter/moderator (non-admin-tier) ever have explicit grants to
  // look up - admin/content-manager already get everything, no need to
  // spend a query on it.
  const grantedFeatures = user && !pending && !isAdminTierRole(role)
    ? Array.from(await fetchGrantedFeatureKeys(supabase, role))
    : [];

  return (
    <html lang="de" className="dark">
      <body className="min-h-screen bg-[#050505] text-[#E2C48A] antialiased tracking-wide">
        {/* Gold accent line at the very top edge of the page - used to sit
            as the header's bottom border, moved here per the sidebar-first
            layout redesign. */}
        <div className="fixed top-0 left-0 right-0 h-[2px] z-[60] bg-gradient-to-r from-transparent via-[#C9A86A] to-transparent" />

        {user && pending && <WaitingForRole userId={user.id} />}

        {user && !pending && (
          <>
            <GlobalTopBar />
            <GlobalSidebar role={role} grantedFeatures={grantedFeatures} />
            <main className="pt-32 pl-0 md:pl-56 min-h-screen bg-gradient-to-b from-[#050505] via-[#080808] to-[#030303]">
              {children}
            </main>
          </>
        )}

        {!user && (
          <main className="min-h-screen bg-gradient-to-b from-[#050505] via-[#080808] to-[#030303]">
            {children}
          </main>
        )}
      </body>
    </html>
  );
}
