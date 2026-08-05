import { createClient } from "@/utils/supabase/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { redirect } from "next/navigation";
import { updateMitarbeiterRolle, updateMitarbeiterZweitrolle, updateMitarbeiterName, deleteMitarbeiter, updateMitarbeiterCompensation, updateRolePermission } from "./actions";
import { revalidatePath } from "next/cache";
import RoleSelect from "@/components/layout/RoleSelect";
import SecondaryRoleSelect from "@/components/layout/SecondaryRoleSelect";
import PermissionCheckbox from "@/components/layout/PermissionCheckbox";
import { GRANTABLE_FEATURES, PERMISSION_GRID_ROLES, hasFeatureAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function ManagementPage() {
  const { supabase, user } = await getCurrentUser();

  if (!user) { redirect("/login"); }

  let isAdmin = false;
  if (user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" || user.email === "etmanagement@gmail.com") {
    isAdmin = true;
  } else {
    const profile = await getCurrentProfile(user.id);
    if (profile && profile.role === "admin") isAdmin = true;
  }

  if (!isAdmin) { redirect("/"); }

  // 🛡️ ERWEITERTES SELECT: Zieht provision_rate + hourly_rate mit aus der Datenbank heraus!
  const [{ data: profilListe }, { data: alleSchichten }, { data: rolePerms }] = await Promise.all([
    supabase.from("profiles").select("user_id, role, secondary_role, email, full_name, provision_rate, hourly_rate"),
    supabase.from("shift_assignments").select("*"),
    supabase.from("crm_role_permissions").select("role, feature_key, enabled"),
  ]);

  const sichereProfile = profilListe || [];
  const sichereSchichten = alleSchichten || [];

  // role -> feature_key -> enabled, for the Rechte-Kontrollzentrum grid below
  const permMap = new Map<string, Map<string, boolean>>();
  (rolePerms || []).forEach((p: any) => {
    if (!permMap.has(p.role)) permMap.set(p.role, new Map());
    permMap.get(p.role)!.set(p.feature_key, p.enabled);
  });

  let gesamtStundenAllerUser = 0;
  sichereSchichten.forEach((s) => {
    if (s.started_at && s.ended_at) {
      const start = new Date(s.started_at).getTime();
      const end = new Date(s.ended_at).getTime();
      if (end > start) {
        gesamtStundenAllerUser += (end - start) / (1000 * 60 * 60);
      }
    }
  });

  // ⚡ SERVER ACTION: Neue krisensichere Funktion speichert die Provision ab, ohne Code-Konflikte!
  async function updateMitarbeiterProvision(formData: FormData) {
    "use server";
    const uId = formData.get("user_id") as string;
    const rate = Number(formData.get("provision_rate") || 20);
    
    const serverSupabase = await createClient();
    await serverSupabase
      .from("profiles")
      .update({ provision_rate: rate })
      .eq("user_id", uId);
      
    revalidatePath("/management");
  }
  return (
    <main className="p-6 w-full min-h-screen bg-[#0A0A0A] text-[#E2C48A] rounded-2xl my-6 border border-white/5 shadow-2xl">
      <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-[#E2C48A] to-[#C9A86A] bg-clip-text text-transparent uppercase tracking-wider">Management Control</h1>
          <p className="text-xs text-slate-400 mt-1">Zentrale Verwaltung der Agentur-Mitarbeiter und Models</p>
        </div>
        <form action="/api/logout" method="POST">
          <button type="submit" className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-4 py-2 rounded-lg hover:bg-red-500/20 transition cursor-pointer font-bold">Abmelden</button>
        </form>
      </div>

      <section className="bg-white/[0.03] backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-xl shadow-black/20 mb-8 text-center">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Abgeleistete Gesamtstunden (Stechuhr)</div>
        <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-[#C9A86A] mt-2 font-mono tracking-wide">{gesamtStundenAllerUser.toFixed(2)} h</div>
      </section>

      {/* MITARBEITER-VERWALTUNG */}
      <section className="bg-white/[0.03] backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-xl shadow-black/20 mb-8">
        <h2 className="text-sm font-bold mb-4 text-[#C9A86A] uppercase tracking-wider">Mitarbeiter & Rollen modifizieren</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-[#050505] text-[#C9A86A] font-semibold text-xs uppercase tracking-wider">
                <th className="p-3">Name</th>
                <th className="p-3">E-Mail</th>
                <th className="p-3 w-[140px]">Provision %</th>
                <th className="p-3 w-[150px]">Rolle ändern</th>
                <th className="p-3 w-[150px]">Zweitrolle</th>
                <th className="p-3 w-[80px] text-center">Löschen</th>
              </tr>
            </thead>
            <tbody>
              {sichereProfile.map((p) => (
                <tr key={p.user_id} className="border-b border-white/5 hover:bg-black/20 transition">
                  <td className="p-3">
                    <form action={updateMitarbeiterName} className="flex gap-2">
                      <input type="hidden" name="user_id" value={p.user_id} />
                      <input type="text" name="full_name" defaultValue={p.full_name || ""} required className="bg-[#050505] border border-[#9C7A3D]/30 rounded px-2 py-1 text-sm text-white focus:border-[#C9A86A] outline-none w-full max-w-[140px]" />
                      <button type="submit" className="text-[11px] bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] text-black px-2 py-1 rounded font-bold hover:from-[#E5C158] transition cursor-pointer">OK</button>
                    </form>
                  </td>
                  <td className="p-3 text-slate-400 font-mono text-xs">{p.email || "keine E-Mail"}</td>

                  {/* 👑 NEUE SPALTE: Provision (Chatter) oder Stundenhonorar (Moderator) */}
                  <td className="p-3">
                    {p.email === "etmanagement@gmail.com" || p.email === "etmanagemant@gmail.com" || p.user_id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ? (
                      <span className="text-xs text-slate-500 font-mono">Admin</span>
                    ) : p.role === "model" ? (
                      // Models haben keine Provision/Stundenlohn - die
                      // Zuordnung zu ihrem OnlyFans-Account passiert im
                      // Connection Hub, nicht hier.
                      <a href="/management/crm-connect" className="text-[10px] text-[#C9A86A] hover:text-[#E5C158] font-bold underline">
                        → im Connection Hub zuordnen
                      </a>
                    ) : !p.role ? (
                      <span className="text-[10px] text-slate-500">Erst Rolle vergeben</span>
                    ) : (
                      <form action={updateMitarbeiterCompensation} className="flex gap-1.5 items-center flex-wrap">
                        <input type="hidden" name="user_id" value={p.user_id} />
                        <input type="hidden" name="role" value={p.role} />
                        {p.role === "moderator" ? (
                          <>
                            <input type="number" step="0.01" name="hourly_rate" defaultValue={p.hourly_rate || 0} placeholder="EUR/h" className="w-20 bg-[#050505] border border-[#9C7A3D]/30 text-white rounded p-1 text-xs text-center outline-none focus:border-[#C9A86A]" />
                            <span className="text-[10px] text-slate-500">EUR/h</span>
                          </>
                        ) : (
                          <>
                            <input type="number" step="0.1" name="provision_rate" defaultValue={p.provision_rate || 20} placeholder="20" className="w-14 bg-[#050505] border border-[#9C7A3D]/30 text-white rounded p-1 text-xs text-center outline-none focus:border-[#C9A86A]" />
                            <span className="text-[10px] text-slate-500">%</span>
                          </>
                        )}
                        <button type="submit" className="text-[10px] bg-emerald-600 text-white font-bold px-1.5 py-1 rounded hover:bg-emerald-700 transition cursor-pointer">✓</button>
                      </form>
                    )}
                  </td>

                  <td className="p-3">
                    <RoleSelect userId={p.user_id} defaultRole={p.role} onUpdateAction={updateMitarbeiterRolle} />
                  </td>
                  <td className="p-3">
                    <SecondaryRoleSelect userId={p.user_id} primaryRole={p.role} defaultSecondaryRole={p.secondary_role} onUpdateAction={updateMitarbeiterZweitrolle} />
                  </td>
                  <td className="p-3 text-center">
                    {p.email !== "etmanagement@gmail.com" && p.email !== "etmanagemant@gmail.com" && p.user_id !== "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ? (
                      <form action={deleteMitarbeiter}>
                        <input type="hidden" name="user_id" value={p.user_id} />
                        <button type="submit" className="text-red-400 hover:text-red-300 text-sm font-bold transition cursor-pointer">Löschen</button>
                      </form>
                    ) : (
                      <span className="text-xs text-slate-500">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {/* Models (Schichtplanung) moved to Connection Hub
          (/management/crm-connect), alongside the model connection status
          it's most relevant next to. */}

      {/* RECHTE-KONTROLLZENTRUM */}
      <section className="bg-white/[0.03] backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-xl shadow-black/20 mb-8">
        <h2 className="text-sm font-bold mb-1 text-[#C9A86A] uppercase tracking-wider">Rechte-Kontrollzentrum</h2>
        <p className="text-[11px] text-slate-500 mb-4">
          Seiten-Zugriffe und OnlyFans-Funktionen pro Rolle freischalten oder sperren - Admin/Content-Managerin starten hier mit allem angehakt, lassen sich aber genauso umstellen.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-[#050505] text-[#C9A86A] font-semibold text-xs uppercase tracking-wider">
                <th className="p-3">Funktion</th>
                {PERMISSION_GRID_ROLES.map((r) => (
                  <th key={r} className="p-3 text-center capitalize">{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GRANTABLE_FEATURES.map((feature) => (
                <tr key={feature.key} className="border-b border-white/5 hover:bg-black/20 transition">
                  <td className="p-3 text-white">{feature.label}</td>
                  {PERMISSION_GRID_ROLES.map((r) => (
                    <td key={r} className="p-3 text-center">
                      <PermissionCheckbox
                        role={r}
                        featureKey={feature.key}
                        defaultChecked={hasFeatureAccess(r, feature.key, permMap.get(r) ?? new Map())}
                        onUpdateAction={updateRolePermission}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
