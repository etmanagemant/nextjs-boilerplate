import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron-Job: Sync OnlyFans chats for all active models
 * GET /api/cron/sync-chats?secret=YOUR_SECRET
 * 
 * Set up in Vercel:
 * - Cron Expression: every 1 minute
 * - Webhook URL: https://yourapp.vercel.app/api/cron/sync-chats?secret=YOUR_SECRET
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");

  // Verify cron secret
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = await createClient();

    // Get all active sessions
    const { data: activeSessions, error: sessionsError } = await supabase
      .from("crm_model_sessions")
      .select("*")
      .eq("is_active", true);

    if (sessionsError) {
      console.error("[CRON-SYNC] Error fetching sessions:", sessionsError);
      return NextResponse.json({ error: sessionsError.message }, { status: 500 });
    }

    if (!activeSessions || activeSessions.length === 0) {
      return NextResponse.json({
        status: "success",
        message: "No active sessions to sync",
        syncedCount: 0,
      });
    }

    console.log(`[CRON-SYNC] Starting sync for ${activeSessions.length} sessions`);

    const syncResults = [];

    // Sync each active session
    for (const session of activeSessions) {
      try {
        const syncUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000"}/api/crm/sync-onlyfans-chats`;

        const response = await fetch(syncUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: session.model_id,
            sessionId: session.id,
          }),
        });

        const result = await response.json();

        syncResults.push({
          modelId: session.model_id,
          status: response.ok ? "success" : "failed",
          fansCount: result.fansCount || 0,
          messagesCount: result.messagesCount || 0,
        });

        console.log(
          `[CRON-SYNC] ✅ Synced ${session.model_id}: ${result.fansCount} fans, ${result.messagesCount} messages`
        );
      } catch (error) {
        console.error(`[CRON-SYNC] ❌ Error syncing ${session.model_id}:`, error);
        syncResults.push({
          modelId: session.model_id,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      status: "success",
      message: `Cron sync completed for ${activeSessions.length} sessions`,
      syncedCount: activeSessions.length,
      results: syncResults,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON-SYNC] Fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
