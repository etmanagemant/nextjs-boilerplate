"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAdminTierRole, hasFeatureAccess, hasRole, type GrantableFeatureKey } from "@/lib/roles";

interface GlobalSidebarProps {
  role: string;
  // Task #80: optional second role (profiles.secondary_role) - a chatter
  // who's also moderator (or vice versa) sees both role's nav items.
  secondaryRole?: string | null;
  // This role's explicit feature_key -> enabled rows from the Management
  // page's Rechte-Kontrollzentrum (see app/layout.tsx) - a plain object
  // since Map isn't serializable across the server/client boundary.
  grantedFeatures?: Record<string, boolean>;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

// Pages where the OnlyFans workspace (models + its own tools) should expand
// inline under the "OnlyFans" item - these used to each carry their own
// second sidebar (WorkspaceSidebar) with the same models/tools, which read
// as two sidebars stacked side by side once this global one existed too.
const ONLYFANS_SECTION_PATHS = ["/crm-inbox", "/management/crm-connect", "/script-vault", "/upload-vault"];

export default function GlobalSidebar({ role, secondaryRole = null, grantedFeatures = {} }: GlobalSidebarProps) {
  const pathname = usePathname();
  // Content-manager gets the exact same view/rights as admin everywhere
  // EXCEPT the Management page itself (Mitarbeiter- und Rollen-Verwaltung)
  // - the one deliberate carve-out so there's still a single distinguished
  // "Hauptadmin". isAdmin stays the literal check for that one nav item;
  // isAdminTier is what everything else (Stripchat's admin-tier variant,
  // the OnlyFans-tools' default adminOnly gate) still uses. Individual
  // pages a chatter/moderator can be granted (Massmessage, Content Plan,
  // Buchhaltung, Connection Hub, Script/Upload Vault) go through canUse()
  // instead, so an explicit grant shows them even for a non-admin-tier role.
  const isAdmin = role === "admin";
  const isAdminTier = isAdminTierRole(role);
  const canUse = (key: GrantableFeatureKey) => hasFeatureAccess(role, key, grantedFeatures);
  // Task #72: /crm-inbox ("OnlyFans") is a pure OnlyFans tool, /stripchat is
  // Stripchat-only - a plain moderator shouldn't see the former, a plain
  // chatter shouldn't see the latter. hasRole() also covers the
  // chatter+moderator dual-role case (Task #80) via secondaryRole.
  const profileForRole = { role, secondary_role: secondaryRole };
  const hasChatterAccess = hasRole(profileForRole, "chatter");
  const hasModeratorAccess = hasRole(profileForRole, "moderator");
  // CONFIRMED LIVE: the fixed 224px sidebar plus its matching 224px content
  // padding (app/layout.tsx) ate almost half the screen on a phone -
  // models do most of their uploading from there. Off-canvas below the md
  // breakpoint (hidden by default, slides in over the content as an
  // overlay instead of pushing it) - unchanged, always-visible behavior
  // on desktop.
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const hamburgerButton = (
    <button
      onClick={() => setMobileOpen((v) => !v)}
      className="md:hidden fixed top-3 left-3 z-50 w-11 h-11 flex items-center justify-center rounded-lg bg-[#0A0A0A] border border-[#9C7A3D]/40 text-[#C9A86A] shadow-lg"
      aria-label="Menü"
    >
      {mobileOpen ? "✕" : "☰"}
    </button>
  );

  const backdrop = mobileOpen && (
    <div
      className="md:hidden fixed inset-0 z-30 bg-black/70 backdrop-blur-sm"
      onClick={() => setMobileOpen(false)}
    />
  );

  const asideBase =
    "fixed left-0 top-32 bottom-0 w-56 z-40 bg-[#0A0A0A] border-r border-[#9C7A3D]/30 flex flex-col py-4 px-2 gap-1 overflow-y-auto scrollbar-hide transition-transform duration-300 md:translate-x-0 " +
    (mobileOpen ? "translate-x-0" : "-translate-x-full");

  const inOnlyFansSection = ONLYFANS_SECTION_PATHS.some((p) => pathname.startsWith(p));

  // Models only ever see their own upload workspace - none of the
  // agency-internal tools (Schichtplan, Dashboard, OnlyFans-CRM, Stechuhr,
  // Abrechnung etc.) apply to them.
  if (role === "model") {
    return (
      <>
        {hamburgerButton}
        {backdrop}
        <aside className={asideBase}>
        <p className="px-3 pb-2 text-xs font-bold text-slate-500 uppercase tracking-widest">Tools</p>
        <Link
          href="/model-workspace"
          className={`btn-gold-hover-shimmer flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition ${
            pathname === "/model-workspace"
              ? "bg-[#C9A86A]/20 text-[#C9A86A] border-l-2 border-[#C9A86A]"
              : "text-slate-400 hover:text-[#E2C48A] hover:bg-[#C9A86A]/10"
          }`}
        >
          <span className="text-lg flex-shrink-0">📤</span>
          <span>Mein Upload</span>
        </Link>
        <Link
          href="/model-onlyfans-stats"
          className={`btn-gold-hover-shimmer flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition ${
            pathname === "/model-onlyfans-stats"
              ? "bg-[#C9A86A]/20 text-[#C9A86A] border-l-2 border-[#C9A86A]"
              : "text-slate-400 hover:text-[#E2C48A] hover:bg-[#C9A86A]/10"
          }`}
        >
          <span className="text-lg flex-shrink-0">📊</span>
          <span>OnlyFans</span>
        </Link>
        <Link
          href="/model-stripchat"
          className={`btn-gold-hover-shimmer flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition ${
            pathname === "/model-stripchat"
              ? "bg-[#C9A86A]/20 text-[#C9A86A] border-l-2 border-[#C9A86A]"
              : "text-slate-400 hover:text-[#E2C48A] hover:bg-[#C9A86A]/10"
          }`}
        >
          <span className="text-lg flex-shrink-0">🎬</span>
          <span>Stripchat</span>
        </Link>
        </aside>
      </>
    );
  }

  const items: NavItem[] = [
    { href: "/", label: "Schichtplan", icon: "🏠" },
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
  ];

  if (isAdminTier || hasChatterAccess) {
    items.push({ href: "/crm-inbox", label: "OnlyFans", icon: "🔮" });
  }

  if (!isAdminTier && hasModeratorAccess) {
    items.push({ href: "/stripchat", label: "Stripchat", icon: "🎬" });
  }

  // Shown for every role (admin/moderator/chatter alike) - matches the old
  // header, which had this in three separate role branches that all did
  // the same thing.
  items.push({ href: "/chatter", label: "Stechuhr", icon: "⏱️" });
  items.push({ href: "/abrechnung", label: "Abrechnung", icon: "💰" });

  if (isAdmin) {
    items.push({ href: "/management", label: "Management", icon: "⚙️" });
  }
  if (isAdminTier) {
    items.push({ href: "/stripchat", label: "Stripchat", icon: "🎬" });
  }
  if (canUse("massmessage")) items.push({ href: "/massmessage", label: "Massmessage", icon: "📨" });
  // Experimental API-driven inbox (2026-07-30) - admin-tier only for now,
  // not yet feature-complete vs the VNC-based /crm-inbox (no overlay
  // features, no fan names/avatars yet).
  if (isAdminTier) items.push({ href: "/of-inbox", label: "OF Inbox (Beta)", icon: "📡" });
  if (canUse("content-plan")) items.push({ href: "/content-plan", label: "Content Plan", icon: "📅" });
  if (canUse("buchhaltung")) items.push({ href: "/buchhaltung", label: "Buchhaltung", icon: "🧾" });

  const onlyFansTools = [
    { id: "connection", name: "Connection Hub", icon: "🔗", href: "/management/crm-connect", key: "connection-hub" as GrantableFeatureKey },
    { id: "scripts", name: "Script Vault", icon: "📜", href: "/script-vault", key: "script-vault" as GrantableFeatureKey },
    { id: "upload", name: "Upload Vault", icon: "📤", href: "/upload-vault", key: "upload-vault" as GrantableFeatureKey },
  ].filter((t) => canUse(t.key));

  return (
    <>
      {hamburgerButton}
      {backdrop}
      <aside className={asideBase}>
      <p className="px-3 pb-2 text-xs font-bold text-slate-500 uppercase tracking-widest">Tools</p>
      {items.map((item, i) => {
        const isActive = pathname === item.href;
        const showOnlyFansSection = item.href === "/crm-inbox" && inOnlyFansSection;
        return (
          <div key={`${item.href}-${i}`}>
            <Link
              href={item.href}
              className={`btn-gold-hover-shimmer flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition ${
                isActive
                  ? "bg-[#C9A86A]/20 text-[#C9A86A] border-l-2 border-[#C9A86A]"
                  : "text-slate-400 hover:text-[#E2C48A] hover:bg-[#C9A86A]/10"
              }`}
            >
              <span className="text-lg flex-shrink-0">{item.icon}</span>
              <span>{item.label}</span>
            </Link>

            {showOnlyFansSection && (
              <div className="ml-3 pl-3 border-l border-[#9C7A3D]/20 mt-1 mb-2 space-y-1">
                {/* Per-model links used to live here - moved to the
                    persistent ModelTabsBar at the top of the CRM Inbox
                    view itself, so unread badges are visible without
                    having to expand the sidebar's OnlyFans section. */}
                {onlyFansTools.length > 0 && (
                  <>
                    <p className="px-2 pt-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      Verwaltung
                    </p>
                    {onlyFansTools.map((tool) => (
                      <Link
                        key={tool.id}
                        href={tool.href}
                        className={`btn-gold-hover-shimmer flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                          pathname === tool.href
                            ? "bg-[#C9A86A]/20 text-[#C9A86A]"
                            : "text-slate-400 hover:text-[#E2C48A] hover:bg-[#C9A86A]/10"
                        }`}
                      >
                        <span className="flex-shrink-0">{tool.icon}</span>
                        <span className="truncate">{tool.name}</span>
                      </Link>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
      </aside>
    </>
  );
}
