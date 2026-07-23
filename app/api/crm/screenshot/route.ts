import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { vpsFetch } from "@/lib/vpsClient";
import { disconnectModelSession } from "@/lib/crmSession";

export const dynamic = "force-dynamic";

const IGNORED_COOKIE_KEYS = ["vps_server", "session_id", "created_at", "verification_status", "cookie_count"];

/**
 * Live screenshot from the persistent VPS browser session for a model.
 * GET /api/crm/screenshot?modelId=xxx
 *
 * If the VPS session isn't running (idle timeout / VPS restart), transparently
 * restores it from the cookies saved in Supabase and retries once. If a
 * previously-connected model turns out to be logged out (OnlyFans invalidated
 * the cookies, e.g. after a platform update), auto-disconnects it in Supabase
 * so the UI can prompt the admin to reconnect instead of showing a dead view.
 */
export async function GET(request: NextRequest) {
  const modelId = request.nextUrl.searchParams.get("modelId");
  if (!modelId) {
    return NextResponse.json({ error: "Missing modelId" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: dbSession } = await supabase
      .from("crm_model_sessions")
      .select("is_active, auth_cookies")
      .eq("model_id", modelId)
      .maybeSingle();

    let data = await fetchFrame(modelId);
    const wasAlreadyConnected = !!dbSession?.is_active;

    if (!data.hasSession) {
      const restored = wasAlreadyConnected
        ? await tryRestoreFromSupabase(modelId, dbSession!.auth_cookies)
        : false;
      if (!restored) {
        return NextResponse.json({ error: "No active session for this model" }, { status: 404 });
      }
      data = await fetchFrame(modelId);
    }

    // Only a session that was previously a *confirmed, working* connection
    // counts as "expired" here - a fresh login-in-progress session is
    // expected to show isLoggedIn:false until the admin actually logs in.
    if (wasAlreadyConnected && !data.isLoggedIn) {
      await disconnectModelSession(supabase, modelId, "session invalidated (OnlyFans logged it out)");
      return NextResponse.json({
        status: "session_expired",
        sessionExpired: true,
        error: "Session ist nicht mehr gültig - bitte neu verbinden",
        modelId,
      });
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

async function tryRestoreFromSupabase(modelId: string, authCookies: unknown): Promise<boolean> {
  const cookieMap = authCookies as Record<string, string> | null;
  if (!cookieMap || typeof cookieMap !== "object") return false;

  const cookies = Object.entries(cookieMap)
    .filter(([name]) => !IGNORED_COOKIE_KEYS.includes(name))
    .map(([name, value]) => ({ name, value, domain: ".onlyfans.com", path: "/" }));

  if (cookies.length === 0) return false;

  const response = await vpsFetch("/restore", {
    method: "POST",
    body: JSON.stringify({ modelId, cookies }),
  });

  return response.ok;
}
