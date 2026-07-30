import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Same crm_fan_metadata data as /api/crm/current-fan, but for the OF Inbox
 * (Beta) - which already knows the open fanId directly (no VNC page-URL
 * detection needed, unlike current-fan).
 * GET /api/crm/of-inbox/fan-metadata?modelId=X&fanId=Y
 */
export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const modelId = req.nextUrl.searchParams.get("modelId");
    const fanId = req.nextUrl.searchParams.get("fanId");
    if (!modelId || !fanId) {
      return NextResponse.json({ error: "Missing modelId or fanId" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("crm_fan_metadata")
      .select("*")
      .eq("model_id", modelId)
      .eq("fan_id", fanId)
      .maybeSingle();
    if (error) throw error;

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
        first_seen_new_at: null,
      },
    });
  } catch (error: any) {
    console.error("[OF-INBOX-FAN-METADATA] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to load fan metadata" }, { status: 500 });
  }
}
