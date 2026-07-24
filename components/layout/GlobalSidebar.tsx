"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

interface GlobalSidebarProps {
  role: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

interface ConnectedModel {
  id: string;
  name: string;
  avatar_url?: string | null;
}

// Pages where the OnlyFans workspace (models + its own tools) should expand
// inline under the "OnlyFans" item - these used to each carry their own
// second sidebar (WorkspaceSidebar) with the same models/tools, which read
// as two sidebars stacked side by side once this global one existed too.
const ONLYFANS_SECTION_PATHS = ["/crm-inbox", "/management/crm-connect", "/script-vault", "/upload-vault"];

export default function GlobalSidebar({ role }: GlobalSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAdmin = role === "admin";
  const [models, setModels] = useState<ConnectedModel[]>([]);

  const inOnlyFansSection = ONLYFANS_SECTION_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (!inOnlyFansSection) return;
    const supabase = createClient();
    (async () => {
      const { data: sessions } = await supabase
        .from("crm_model_sessions")
        .select("model_id")
        .eq("is_active", true)
        .order("model_id", { ascending: true });
      if (!sessions || sessions.length === 0) {
        setModels([]);
        return;
      }
      const modelIds = sessions.map((s: any) => s.model_id);
      const { data: modelDetails } = await supabase
        .from("models")
        .select("id, name, avatar_url")
        .in("id", modelIds);
      setModels(
        sessions.map((s: any) => ({
          id: s.model_id,
          name: modelDetails?.find((m: any) => m.id === s.model_id)?.name || s.model_id,
          avatar_url: modelDetails?.find((m: any) => m.id === s.model_id)?.avatar_url || null,
        }))
      );
    })();
  }, [inOnlyFansSection]);

  const items: NavItem[] = [
    { href: "/", label: "Schichtplan", icon: "🏠" },
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
      { href: "/content-plan", label: "Content Plan", icon: "📅" },
      { href: "/buchhaltung", label: "Buchhaltung", icon: "🧾" }
    );
  }

  const onlyFansTools = [
    { id: "connection", name: "Connection Hub", icon: "🔗", href: "/management/crm-connect", adminOnly: true },
    { id: "scripts", name: "Script Vault", icon: "📜", href: "/script-vault", adminOnly: true },
    { id: "upload", name: "Upload Vault", icon: "📤", href: "/upload-vault", adminOnly: true },
  ].filter((t) => !t.adminOnly || isAdmin);

  const activeModelId = searchParams.get("model");

  return (
    <aside className="fixed left-0 top-32 bottom-0 w-56 z-40 bg-[#0A0A0A] border-r border-[#9C7A3D]/30 flex flex-col py-4 px-2 gap-1 overflow-y-auto scrollbar-hide">
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
                {models.length > 0 && (
                  <>
                    <p className="px-2 pt-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      🟢 Models
                    </p>
                    {models.map((model) => (
                      <Link
                        key={model.id}
                        href={`/crm-inbox?model=${model.id}`}
                        className={`btn-gold-hover-shimmer flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                          activeModelId === model.id
                            ? "bg-[#C9A86A]/20 text-[#C9A86A]"
                            : "text-slate-400 hover:text-[#E2C48A] hover:bg-[#C9A86A]/10"
                        }`}
                      >
                        {model.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={model.avatar_url}
                            alt={model.name}
                            className="w-5 h-5 rounded-full object-cover border border-[#C9A86A]/40 flex-shrink-0"
                          />
                        ) : (
                          <span className="flex-shrink-0">👤</span>
                        )}
                        <span className="truncate">{model.name}</span>
                      </Link>
                    ))}
                  </>
                )}
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
  );
}
