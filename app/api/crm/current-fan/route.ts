import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// OnlyFans chat URLs look like .../my/chats/chat/<numeric fan id>/ - this is
// the only way our own app can tell which fan conversation is open inside
// the VNC view, since that all happens directly on OnlyFans' own page, not
// through anything we control.
const CHAT_URL_PATTERN = /\/chats\/chat\/(\d+)/;

/**
 * Polled periodically by the CRM Inbox live view to detect which fan
 * conversation the current user's chatter slot has open, and load that
 * fan's CRM data (name, notes, preferences, etc.) for the side panel.
 * GET /api/crm/current-fan?modelId=xxx
 */
export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const modelId = req.nextUrl.searchParams.get("modelId");
    if (!modelId) {
      return NextResponse.json({ error: "Missing modelId" }, { status: 400 });
    }

    const pageRes = await vpsFetch(
      `/chatter-slot-page?userId=${encodeURIComponent(user.id)}&modelId=${encodeURIComponent(modelId)}`
    );
    if (!pageRes.ok) {
      return NextResponse.json({ status: "no-fan" });
    }
    const pageData = await pageRes.json();
    const match = typeof pageData.pageUrl === "string" ? pageData.pageUrl.match(CHAT_URL_PATTERN) : null;
    if (!match) {
      return NextResponse.json({ status: "no-fan" });
    }
    const fanId = match[1];

    const { data, error } = await supabase
      .from("crm_fan_metadata")
      .select("*")
      .eq("model_id", modelId)
      .eq("fan_id", fanId)
      .maybeSingle();

    if (error) throw error;

    // Same attribution principle as the OnlyFans message overlay: whoever
    // last edited this fan's CRM data should be visible to every viewer,
    // not just remembered locally.
    let lastEditedBy: string | null = null;
    if (data?.chatter_id) {
      const { data: editorProfile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", data.chatter_id)
        .maybeSingle();
      lastEditedBy = editorProfile?.full_name || editorProfile?.email || null;
    }

    return NextResponse.json({
      status: "success",
      fanId,
      lastEditedBy,
      metadata: data || {
        fan_id: fanId,
        model_id: modelId,
        real_name: null,
        location: null,
        age: null,
        came_from: null,
        preferences: [],
        notes: "",
        tags: [],
        lifetime_value: 0,
        vip_tier: null,
        last_subscription_at: null,
        last_paid_at: null,
        created_at: null,
      },
    });
  } catch (error: any) {
    console.error("[CURRENT-FAN] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to detect current fan" }, { status: 500 });
  }
}
