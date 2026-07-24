import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { vpsFetch } from "@/lib/vpsClient";
import { disconnectModelSession } from "@/lib/crmSession";
import { getCurrentUser } from "@/lib/getCurrentUser";

export const dynamic = "force-dynamic";

const IGNORED_COOKIE_KEYS = ["vps_server", "session_id", "created_at", "verification_status", "cookie_count", "local_storage"];

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
  // This is the live view of a model's authenticated OnlyFans session - had
  // no auth check at all, so anyone who found this URL and a modelId could
  // watch it without ever logging into the CRM.
  const { user } = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const modelId = request.nextUrl.searchParams.get("modelId");
  if (!modelId) {
    return NextResponse.json({ error: "Missing modelId" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: dbSession } = await supabase
      .from("crm_model_sessions")
      .select("is_active, auth_cookies, last_verified_at")
      .eq("model_id", modelId)
      .maybeSingle();

    let data = await fetchFrame(modelId);
    const wasAlreadyConnected = !!dbSession?.is_active;
    // Grace period: a session confirmed in the last 2 minutes might still be
    // mid-navigation/settling on the VPS (or, as happened once, a manual
    // debug connect briefly overlapping a real one) - don't treat a
    // momentary logged-out read as proof OnlyFans invalidated it.
    const confirmedRecently = dbSession?.last_verified_at
      ? Date.now() - new Date(dbSession.last_verified_at).getTime() < 2 * 60 * 1000
      : false;

    let wasJustRestored = false;

    if (!data.hasSession) {
      const restored = wasAlreadyConnected
        ? await tryRestoreFromSupabase(modelId, dbSession!.auth_cookies)
        : false;
      if (!restored) {
        return NextResponse.json({ error: "No active session for this model" }, { status: 404 });
      }
      data = await fetchFrame(modelId);

      // The restore call reported success but the VPS still has no live
      // session for this model - that's a VPS/infra hiccup (e.g. Chrome
      // failed to launch), NOT proof the cookies are invalid. Don't touch
      // Supabase in that case, just ask the client to retry.
      if (!data.hasSession) {
        return NextResponse.json({ error: "VPS session unavailable, try again shortly" }, { status: 503 });
      }
      wasJustRestored = true;
    }

    if (data.isLoggedIn) {
      // Rolling confirmation: keep the grace window fresh for as long as the
      // session is genuinely working, not just for the first 2 minutes after
      // connect. Without this, a single flaky read hours into a session had
      // nothing recent to fall back on and could trigger a real disconnect.
      // Only write when it's actually gone stale (>60s) - this route is
      // polled every 400ms, and Supabase doesn't need sub-second freshness.
      const needsRefresh =
        !dbSession?.last_verified_at || Date.now() - new Date(dbSession.last_verified_at).getTime() > 60 * 1000;
      if (needsRefresh) {
        supabase
          .from("crm_model_sessions")
          .update({ last_verified_at: new Date().toISOString() })
          .eq("model_id", modelId)
          .then(() => {}, () => {});
      }
    } else if (wasAlreadyConnected && !data.checkFailed && (wasJustRestored || !confirmedRecently)) {
      // Only a session that was previously a *confirmed, working* connection,
      // where the VPS check itself actually succeeded (not a crashed/closed
      // page read) and definitely found a real logged-out page, counts as
      // "expired" here - a fresh login-in-progress session is expected to
      // show isLoggedIn:false until the admin actually logs in, and a failed
      // read (checkFailed) means we don't actually know the real state.
      //
      // The grace period is skipped entirely when wasJustRestored: cloning
      // cookies into a brand-new browser (the only option once the VPS's
      // live session has died - idle timeout, a VPS restart, anything) is a
      // known, proven-unreliable move with OnlyFans - it gets redirected
      // back to a real login page even with fully valid cookies. That's not
      // a flaky read the grace period should protect against; it's a
      // definitive answer from a check we just deliberately ran, and
      // treating it as "maybe fine" was exactly why reconnecting and then
      // opening the CRM inbox could still show a login page instead of a
      // clear "please reconnect" prompt.
      await disconnectModelSession(
        supabase,
        modelId,
        wasJustRestored ? "cookie-restore rejected by OnlyFans - needs a real re-login" : "session invalidated (OnlyFans logged it out)"
      );
      return NextResponse.json({
        status: "session_expired",
        sessionExpired: true,
        error: wasJustRestored
          ? "Automatische Wiederherstellung wurde von OnlyFans abgelehnt - bitte im Connection Hub neu verbinden"
          : "Session ist nicht mehr gültig - bitte neu verbinden",
        modelId,
      });
    }

    return NextResponse.json({
      status: "success",
      screenshot: data.screenshot,
      isLoggedIn: data.isLoggedIn,
      pageUrl: data.pageUrl,
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
    body: JSON.stringify({ modelId, cookies, localStorageData: cookieMap["local_storage"] || null }),
  });

  if (!response.ok) return false;
  // The VPS returns HTTP 200 even for internal errors (e.g. Chrome failed to
  // launch), with { status: "error" } in the body - check that explicitly.
  const body = await response.json().catch(() => null);
  return body?.status === "success";
}
