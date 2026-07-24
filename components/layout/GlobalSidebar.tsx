"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface GlobalSidebarProps {
  role: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

/**
 * Persistent labeled nav sidebar, present on every page - replaces the old
 * per-page header button row entirely. Full icon+label buttons (matching
 * the "Tools" section style already used on the CRM Inbox's own workspace
 * sidebar), not an icon-only rail - that treatment is for OnlyFans' own
 * embedded nav, a separate and unrelated request.
 */
export default function GlobalSidebar({ role }: GlobalSidebarProps) {
  const pathname = usePathname();
  const isAdmin = role === "admin";

  const items: NavItem[] = [
    { href: "/", label: "Start", icon: "🏠" },
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/crm-inbox", label: "OnlyFans", icon: "🔮" },
  ];

  if (!isAdmin) {
    items.push({ href: "/stripchat", label: "Stripchat", icon: "🎬" });
  }

  // Shown for every role (admin/moderator/chatter alike) - matches the old
  // header, which had this in three separate role branches that all did
  // the same thing.
  items.push({ href: "/chatter", label: "Stechuhr", icon: "⏱️" });
  items.push({ href: "/abrechnung", label: "Abrechnung", icon: "💰" });

  if (isAdmin) {
    items.push(
      { href: "/management", label: "Management", icon: "⚙️" },
      { href: "/massmessage", label: "Massmessage", icon: "📨" },
      { href: "/stripchat", label: "Stripchat", icon: "🎬" },
      { href: "/content-plan", label: "Plan", icon: "📅" },
      { href: "/buchhaltung", label: "Buchhaltung", icon: "🧾" }
    );
  }

  return (
    <aside className="fixed left-0 top-32 bottom-0 w-56 z-40 bg-[#0A0A0A] border-r border-[#9C7A3D]/30 flex flex-col py-4 px-2 gap-1 overflow-y-auto scrollbar-hide">
      <p className="px-3 pb-2 text-xs font-bold text-slate-500 uppercase tracking-widest">Tools</p>
      {items.map((item, i) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={`${item.href}-${i}`}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition ${
              isActive
                ? "bg-[#C9A86A]/20 text-[#C9A86A] border-l-2 border-[#C9A86A]"
                : "text-slate-400 hover:text-[#E2C48A] hover:bg-[#C9A86A]/10"
            }`}
          >
            <span className="text-lg flex-shrink-0">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </aside>
  );
}
