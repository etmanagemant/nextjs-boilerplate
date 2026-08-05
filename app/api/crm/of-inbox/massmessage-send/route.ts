import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import { vpsFetch } from "@/lib/vpsClient";
import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxies to the VPS's /of-massmessage-send - real OnlyFans mass message
 * send (POST /messages/queue). CONFIRMED LIVE 2026-08-05 via a real test
 * send (3 recipients, delivered).
 * POST Body: { modelId, text, mediaFiles, price, userLists, excludedLists }
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const profile = await getCurrentProfile(user.id);
    const isAllowed = hasRole(profile, "chatter") || isAdminTierRole(profile?.role) ||
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
    if (!isAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { modelId, text, mediaFiles, price, userLists, excludedLists } = await req.json();
    if (!modelId) return NextResponse.json({ error: "Missing modelId" }, { status: 400 });

    const vpsRes = await vpsFetch("/of-massmessage-send", {
      method: "POST",
      body: JSON.stringify({ modelId, text, mediaFiles, price, userLists, excludedLists }),
    });
    const data = await vpsRes.json();
    if (!vpsRes.ok) return NextResponse.json({ error: data.error || "VPS error" }, { status: vpsRes.status });

    // "gesendet von Mass Message" - same attribution mechanism already
    // used for Upload Vault sends (crm_onlyfans_sent_log, matched by
    // exact message text per fan chat). Best-effort, bulk insert - never
    // blocks the response, the send itself already succeeded.
    const recipientFanIds: number[] = Array.isArray(data.recipientFanIds) ? data.recipientFanIds : [];
    if (text && String(text).trim() && recipientFanIds.length > 0) {
      const rows = recipientFanIds.map((fanId) => ({
        model_id: modelId,
        fan_id: String(fanId),
        chatter_name: "Mass Message",
        message_text: String(text).trim(),
      }));
      createSupabaseAdminClient()
        .from("crm_onlyfans_sent_log")
        .insert(rows)
        .then(({ error }: any) => {
          if (error) console.error("[OF-INBOX-MASSMESSAGE-SEND] Attribution log insert failed:", error.message);
        });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[OF-INBOX-MASSMESSAGE-SEND] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to send mass message" }, { status: 500 });
  }
}
