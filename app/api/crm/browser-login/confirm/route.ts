import { NextRequest, NextResponse } from "next/server";
import { getRequestAdmin } from "@/lib/crmAdmin";
import { vpsFetch } from "@/lib/vpsClient";

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

    const cookiesResponse = await vpsFetch(`/cookies?modelId=${encodeURIComponent(modelId)}`);
    if (!cookiesResponse.ok) {
      const text = await cookiesResponse.text();
      throw new Error(`VPS error ${cookiesResponse.status}: ${text}`);
    }

    const { cookies, localStorageData } = await cookiesResponse.json();
    if (!Array.isArray(cookies) || cookies.length === 0) {
      return NextResponse.json({ status: "error", error: "No cookies found - login not detected yet" }, { status: 400 });
    }

    // Store as a flat { name: value } map - the same shape send-message-to-onlyfans
    // and the manual session injector already use. localStorage rides along
    // under a reserved key (see IGNORED_COOKIE_KEYS in screenshot/route.ts,
    // which already strips non-cookie metadata keys like this one back out
    // before using this map to restore actual cookies).
    const cookieMap: Record<string, string> = {};
    for (const c of cookies) {
      if (c?.name) cookieMap[c.name] = c.value;
    }
    if (localStorageData) {
      cookieMap["local_storage"] = localStorageData;
    }

    const { error: upsertError } = await supabase.from("crm_model_sessions").upsert(
      {
        model_id: modelId,
        is_active: true,
        auth_cookies: cookieMap,
        last_verified_at: new Date().toISOString(),
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
