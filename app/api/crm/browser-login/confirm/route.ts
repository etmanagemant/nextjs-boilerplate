import { NextRequest, NextResponse } from "next/server";
import { getRequestAdmin } from "@/lib/crmAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * Admin clicked "Creator verbinden" after the live view showed a successful
 * login. Pull the cookies from the still-running VPS browser and persist
 * them to Supabase. The VPS browser is intentionally left running - it keeps
 * serving as the live view for chatters afterwards.
 * POST /api/crm/browser-login/confirm  Body: { modelId }
 */
export async function POST(req: NextRequest) {
  try {
    const { isAdmin, supabase, user } = await getRequestAdmin();
    if (!isAdmin || !user) {
      return NextResponse.json({ status: "error", error: "Unauthorized" }, { status: 403 });
    }

    const { modelId } = await req.json();
    if (!modelId) {
      return NextResponse.json({ status: "error", error: "Missing modelId" }, { status: 400 });
    }

    const vpsUrl = process.env.VPS_API_URL;
    if (!vpsUrl) {
      return NextResponse.json({ status: "error", error: "VPS_API_URL not configured" }, { status: 500 });
    }

    const cookiesResponse = await fetch(`${vpsUrl}/cookies?modelId=${encodeURIComponent(modelId)}`);
    if (!cookiesResponse.ok) {
      const text = await cookiesResponse.text();
      throw new Error(`VPS error ${cookiesResponse.status}: ${text}`);
    }

    const { cookies } = await cookiesResponse.json();
    if (!Array.isArray(cookies) || cookies.length === 0) {
      return NextResponse.json({ status: "error", error: "No cookies found - login not detected yet" }, { status: 400 });
    }

    // Store as a flat { name: value } map - the same shape send-message-to-onlyfans
    // and the manual session injector already use.
    const cookieMap: Record<string, string> = {};
    for (const c of cookies) {
      if (c?.name) cookieMap[c.name] = c.value;
    }

    const { error: upsertError } = await supabase.from("crm_model_sessions").upsert(
      {
        model_id: modelId,
        is_active: true,
        auth_cookies: cookieMap,
        last_verified_at: new Date().toISOString(),
        created_by: user.id,
      },
      { onConflict: "model_id" }
    );

    if (upsertError) {
      throw new Error(`Database error: ${upsertError.message}`);
    }

    return NextResponse.json({
      status: "success",
      modelId,
      message: "Model connected successfully!",
      cookieCount: cookies.length,
    });
  } catch (error: any) {
    console.error("[BROWSER-LOGIN CONFIRM] Error:", error.message);
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }
}
