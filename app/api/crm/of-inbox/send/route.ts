import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import { vpsFetch } from "@/lib/vpsClient";
import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxies to the VPS's /of-send - sends a real OnlyFans chat message via
 * our own signed request (CONFIRMED LIVE working against a real endpoint),
 * instead of VNC keyboard/click automation.
 * POST /api/crm/of-inbox/send  Body: { modelId, fanId, text }
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profile = await getCurrentProfile(user.id);
    const isAllowed = hasRole(profile, "chatter") || isAdminTierRole(profile?.role) ||
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
    if (!isAllowed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { modelId, fanId, text } = await req.json();
    if (!modelId || !fanId || !text) {
      return NextResponse.json({ error: "Missing modelId, fanId, or text" }, { status: 400 });
    }

    const vpsRes = await vpsFetch("/of-send", {
      method: "POST",
      body: JSON.stringify({ modelId, fanId, text }),
    });
    const data = await vpsRes.json();
    if (!vpsRes.ok) {
      return NextResponse.json({ error: data.error || "VPS error" }, { status: vpsRes.status });
    }

    // Task #33/#37: unlike the VNC path (an injected script hooks the real
    // compose box, since it can't know who's driving the shared browser),
    // we already know exactly who sent this - we ARE the sender. Logs into
    // the same crm_onlyfans_sent_log table VNC's "gesendet von X" overlay
    // reads from, so both views share one attribution source. Best-effort:
    // a logging failure shouldn't fail a message that already sent fine.
    try {
      const chatterName = profile?.full_name || user.email || "Chatter";
      const adminSupabase = createSupabaseAdminClient();
      await adminSupabase.from("crm_onlyfans_sent_log").insert({
        model_id: modelId,
        fan_id: String(fanId),
        chatter_name: chatterName,
        message_text: text,
      });
    } catch (logError: any) {
      console.error("[OF-INBOX-SEND] Sent-log insert failed:", logError.message);
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[OF-INBOX-SEND] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to send message" }, { status: 500 });
  }
}
