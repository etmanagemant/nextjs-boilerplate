import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Model's own OnlyFans stats (Task #67) - unlike the of-inbox/* routes,
 * this does NOT take a modelId from the client at all. It resolves the
 * caller's OWN model row server-side (models.owner_user_id), so a model
 * can never query another model's earnings by passing a different id -
 * every other of-inbox route trusts modelId because only staff (chatter/
 * admin) can call them; a model calling on her own behalf needs this
 * extra guard instead.
 * GET /api/crm/model-onlyfans-stats
 */
export async function GET() {
  try {
    const { supabase, user } = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const profile = await getCurrentProfile(user.id);
    if (profile?.role !== "model") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { data: model } = await supabase.from("models").select("id").eq("owner_user_id", user.id).maybeSingle();
    if (!model) return NextResponse.json({ error: "Kein Model-Profil verknüpft" }, { status: 404 });

    const adminSupabase = createSupabaseAdminClient();
    const { data: session } = await adminSupabase.from("crm_model_sessions").select("is_active").eq("model_id", model.id).eq("is_active", true).maybeSingle();
    if (!session) return NextResponse.json({ error: "Kein aktiver OnlyFans-Login für dieses Model" }, { status: 404 });

    const [earningsRes, statsRes] = await Promise.all([
      vpsFetch(`/of-earnings?modelId=${encodeURIComponent(model.id)}`),
      vpsFetch(`/of-stats?modelId=${encodeURIComponent(model.id)}`),
    ]);
    const earnings = await earningsRes.json();
    const stats = await statsRes.json();
    if (!earningsRes.ok) return NextResponse.json({ error: earnings.error || "VPS error" }, { status: earningsRes.status });

    return NextResponse.json({ status: "success", earnings: earnings.data || null, stats: statsRes.ok ? stats.data : null });
  } catch (error: any) {
    console.error("[MODEL-ONLYFANS-STATS] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to load stats" }, { status: 500 });
  }
}
