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
 * Persistent icon-only nav rail, present on every page - replaces the old
 * per-page header button row. Kept icon-only (not the wider labeled
 * sidebar CRM Inbox has for its own tools/models) so it stays out of the
 * way on pages that also have their own contextual sidebar.
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
    <aside className="fixed left-0 top-16 bottom-0 w-16 z-40 bg-[#0A0A0A] border-r border-[#9C7A3D]/30 flex flex-col items-center py-3 gap-1 overflow-y-auto scrollbar-hide">
      {items.map((item, i) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={`${item.href}-${i}`}
            href={item.href}
            title={item.label}
            className={`w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-lg text-xl transition-all ${
              isActive
                ? "bg-[#C9A86A]/20 border border-[#C9A86A]/60 text-[#E2C48A] shadow-[0_0_10px_rgba(201,168,106,0.3)]"
                : "text-[#C9A86A]/80 hover:bg-[#C9A86A]/10 hover:text-[#E2C48A] border border-transparent"
            }`}
          >
            {item.icon}
          </Link>
        );
      })}
    </aside>
  );
}
