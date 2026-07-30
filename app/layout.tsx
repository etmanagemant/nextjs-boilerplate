import "./globals.css";
import { headers } from "next/headers";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { fetchRolePermissionMap } from "@/lib/getRolePermissions";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import GlobalTopBar from "@/components/layout/GlobalTopBar";
import WaitingForRole from "@/components/layout/WaitingForRole";
import { ModelTabsProvider } from "@/components/layout/ModelTabsContext";

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

  // "/live/<modelId>" is the standalone, chrome-free single-model view
  // meant to be popped into its own browser tab/window for a second
  // monitor - it renders only OnlyFansViewer itself, none of the normal
  // sidebar/top bar/model-tabs-bar, so it needs the full viewport.
  const pathname = (await headers()).get("x-pathname") || "";
  const isSoloView = pathname.startsWith("/live/");

  let role = "chatter";
  // Task #80: a user can hold a second role (profiles.secondary_role) -
  // passed through to GlobalSidebar so it can show both role's nav items
  // instead of just the primary one.
  let secondaryRole: string | null = null;
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
      secondaryRole = profile?.secondary_role || null;
    }
  }

  // Fetched for every role now, including admin/content-manager - the
  // Rechte-Kontrollzentrum lets the Hauptadmin override a default for any
  // role, not just grant extras to chatter/moderator (see lib/roles.ts).
  const permMap = user && !pending ? await fetchRolePermissionMap(supabase, role) : new Map();
  const grantedFeatures = Object.fromEntries(permMap);

  return (
    <html lang="de" className="dark">
      <body className="min-h-screen bg-[#050505] text-[#E2C48A] antialiased tracking-wide">
        {/* Gold accent line at the very top edge of the page - used to sit
            as the header's bottom border, moved here per the sidebar-first
            layout redesign. Skipped on the solo view - that tab should show
            nothing but the live view itself. */}
        {!isSoloView && (
          <div className="fixed top-0 left-0 right-0 h-[2px] z-[60] bg-gradient-to-r from-transparent via-[#C9A86A] to-transparent" />
        )}

        {user && pending && <WaitingForRole userId={user.id} />}

        {user && !pending && isSoloView && (
          <main className="min-h-screen">{children}</main>
        )}

        {user && !pending && !isSoloView && (
          <ModelTabsProvider>
            <GlobalTopBar userId={user.id} />
            <GlobalSidebar role={role} secondaryRole={secondaryRole} grantedFeatures={grantedFeatures} />
            <main className="pt-32 pl-0 md:pl-56 min-h-screen bg-gradient-to-b from-[#050505] via-[#080808] to-[#030303]">
              {children}
            </main>
          </ModelTabsProvider>
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
