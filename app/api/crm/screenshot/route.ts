import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";

/**
 * Live screenshot from the persistent VPS browser session for a model.
 * GET /api/crm/screenshot?modelId=xxx
 *
 * If the VPS session isn't running (idle timeout / VPS restart), transparently
 * restores it from the cookies saved in Supabase and retries once.
 */
export async function GET(request: NextRequest) {
  const modelId = request.nextUrl.searchParams.get("modelId");
  if (!modelId) {
    return NextResponse.json({ error: "Missing modelId" }, { status: 400 });
  }

  try {
    let data = await fetchFrame(modelId);

    if (!data.hasSession) {
      const restored = await tryRestoreFromSupabase(modelId);
      if (!restored) {
        return NextResponse.json({ error: "No active session for this model" }, { status: 404 });
      }
      data = await fetchFrame(modelId);
    }

    return NextResponse.json({
      status: "success",
      screenshot: data.screenshot,
      isLoggedIn: data.isLoggedIn,
      pageUrl: data.pageUrl,
      pageTitle: data.pageTitle,
      modelId,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[SCREENSHOT] Error:", err?.message);
    return NextResponse.json({ error: err?.message || "Failed to get screenshot" }, { status: 500 });
  }
}

async function fetchFrame(modelId: string) {
  const response = await vpsFetch(`/frame?modelId=${encodeURIComponent(modelId)}`);
  if (!response.ok) throw new Error(`VPS returned ${response.status}`);
  return response.json();
}

async function tryRestoreFromSupabase(modelId: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { data: session } = await supabase
    .from("crm_model_sessions")
    .select("auth_cookies")
    .eq("model_id", modelId)
    .eq("is_active", true)
    .maybeSingle();

  const cookieMap = session?.auth_cookies as Record<string, string> | undefined;
  if (!cookieMap || typeof cookieMap !== "object") return false;

  const cookies = Object.entries(cookieMap)
    .filter(([name]) => !["vps_server", "session_id", "created_at", "verification_status", "cookie_count"].includes(name))
    .map(([name, value]) => ({ name, value, domain: ".onlyfans.com", path: "/" }));

  if (cookies.length === 0) return false;

  const response = await vpsFetch("/restore", {
    method: "POST",
    body: JSON.stringify({ modelId, cookies }),
  });

  return response.ok;
}
