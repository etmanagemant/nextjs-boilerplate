"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAdminTierRole, hasFeatureAccess, hasRole, type GrantableFeatureKey } from "@/lib/roles";
import {
  HomeIcon, ChartIcon, SparkleIcon, SatelliteIcon, FilmIcon, ClockIcon, CoinIcon,
  SettingsIcon, MailIcon, CalendarIcon, ReceiptIcon, LinkIcon, ScriptIcon, UploadIcon,
} from "./GoldIcons";

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
  Icon: (p: { size?: number }) => React.ReactElement;
}

// Pages where the OnlyFans workspace (models + its own tools) should expand
// inline under the "OnlyFans" item - these used to each carry their own
// second sidebar (WorkspaceSidebar) with the same models/tools, which read
// as two sidebars stacked side by side once this global one existed too.
const ONLYFANS_SECTION_PATHS = ["/crm-inbox", "/management/crm-connect", "/script-vault", "/upload-vault"];

// 2026 reskin: glass surface (semi-transparent + blur, not flat black),
// gold glow instead of a flat left-border on the active item, real SVG
// icons (GoldIcons) instead of emoji - per explicit ask, applied
// consistently everywhere this sidebar renders (every page in the app).
function NavLink({ href, label, Icon, active }: { href: string; label: string; Icon: (p: { size?: number }) => React.ReactElement; active: boolean }) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-200 ${
        active
          ? "bg-gradient-to-r from-[#C9A86A]/25 to-transparent text-[#E2C48A] shadow-[0_0_18px_rgba(201,168,106,0.18)]"
          : "text-slate-400 hover:text-[#E2C48A] hover:bg-white/5 hover:translate-x-0.5"
      }`}
    >
      <span className={`flex-shrink-0 transition-transform duration-200 ${active ? "" : "group-hover:scale-110"}`}>
        <Icon size={22} />
      </span>
      <span>{label}</span>
    </Link>
  );
}

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
      className="md:hidden fixed top-3 left-3 z-50 w-11 h-11 flex items-center justify-center rounded-xl bg-[#0A0A0A]/80 backdrop-blur border border-[#9C7A3D]/40 text-[#C9A86A] shadow-lg"
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
    "fixed left-0 top-32 bottom-0 w-56 z-40 bg-[#0A0A0A]/70 backdrop-blur-xl border-r border-white/5 flex flex-col py-4 px-2 gap-1 overflow-y-auto scrollbar-hide transition-transform duration-300 md:translate-x-0 " +
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
        <NavLink href="/model-workspace" label="Mein Upload" Icon={UploadIcon} active={pathname === "/model-workspace"} />
        <NavLink href="/model-onlyfans-stats" label="OnlyFans" Icon={ChartIcon} active={pathname === "/model-onlyfans-stats"} />
        <NavLink href="/model-stripchat" label="Stripchat" Icon={FilmIcon} active={pathname === "/model-stripchat"} />
        </aside>
      </>
    );
  }

  const items: NavItem[] = [
    { href: "/", label: "Schichtplan", Icon: HomeIcon },
    { href: "/dashboard", label: "Dashboard", Icon: ChartIcon },
  ];

  // VNC-based OnlyFans view - admin-only from 2026-07-30 on (explicit user
  // request): chatters now work through OF Inbox (Beta) below instead, no
  // reason for them to reach the old VNC view/its RAM cost anymore.
  if (isAdminTier) {
    items.push({ href: "/crm-inbox", label: "OnlyFans", Icon: SparkleIcon });
  }
  // API-driven inbox, now the intended day-to-day view for chatters (VNC
  // above stays admin/content-manager only, see the /crm-inbox item's own
  // comment) - opened up 2026-07-31 once the core gaps (media loading,
  // sent-by attribution, unread dot) were fixed. Placed right under
  // OnlyFans per the user's original ask, above Stechuhr.
  if (isAdminTier || hasChatterAccess) items.push({ href: "/of-inbox", label: "OF Inbox (Beta)", Icon: SatelliteIcon });

  if (!isAdminTier && hasModeratorAccess) {
    items.push({ href: "/stripchat", label: "Stripchat", Icon: FilmIcon });
  }

  // Shown for every role (admin/moderator/chatter alike) - matches the old
  // header, which had this in three separate role branches that all did
  // the same thing.
  items.push({ href: "/chatter", label: "Stechuhr", Icon: ClockIcon });
  items.push({ href: "/abrechnung", label: "Abrechnung", Icon: CoinIcon });

  if (isAdmin) {
    items.push({ href: "/management", label: "Management", Icon: SettingsIcon });
  }
  if (isAdminTier) {
    items.push({ href: "/stripchat", label: "Stripchat", Icon: FilmIcon });
  }
  if (canUse("massmessage")) items.push({ href: "/massmessage", label: "Massmessage", Icon: MailIcon });
  if (canUse("content-plan")) items.push({ href: "/content-plan", label: "Content Plan", Icon: CalendarIcon });
  if (canUse("buchhaltung")) items.push({ href: "/buchhaltung", label: "Buchhaltung", Icon: ReceiptIcon });

  const onlyFansTools = [
    { id: "connection", name: "Connection Hub", Icon: LinkIcon, href: "/management/crm-connect", key: "connection-hub" as GrantableFeatureKey },
    { id: "scripts", name: "Script Vault", Icon: ScriptIcon, href: "/script-vault", key: "script-vault" as GrantableFeatureKey },
    { id: "upload", name: "Upload Vault", Icon: UploadIcon, href: "/upload-vault", key: "upload-vault" as GrantableFeatureKey },
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
            <NavLink href={item.href} label={item.label} Icon={item.Icon} active={isActive} />

            {showOnlyFansSection && (
              <div className="ml-3 pl-3 border-l border-white/10 mt-1 mb-2 space-y-1">
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
                      <NavLink key={tool.id} href={tool.href} label={tool.name} Icon={tool.Icon} active={pathname === tool.href} />
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
