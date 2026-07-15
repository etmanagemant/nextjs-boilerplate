import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  console.log("[CLEANUP] Reset all sessions to disconnected");

  try {
    const supabase = await createClient();

    // Disconnect ALL active sessions (for testing - cleanup false CONNECTED statuses)
    const { data: activeSessions } = await supabase
      .from("crm_model_sessions")
      .select("model_id")
      .eq("is_active", true);

    console.log("[CLEANUP] Found active sessions:", activeSessions);

    if (activeSessions && activeSessions.length > 0) {
      const { error } = await supabase
        .from("crm_model_sessions")
        .update({
          is_active: false,
          last_verified_at: new Date().toISOString(),
          auth_cookies: {
            disconnected_at: new Date().toISOString(),
            disconnected_reason: "admin_test_cleanup",
          },
        })
        .eq("is_active", true);

      if (error) {
        console.error("[CLEANUP] Error:", error.message);
        return NextResponse.json(
          { status: "error", error: error.message },
          { status: 500 }
        );
      }

      const modelList = activeSessions
        .map((s: any) => s.model_id)
        .join(", ");
      console.log(
        `[CLEANUP] ✅ Disconnected ${activeSessions.length} session(s): ${modelList}`
      );
      return NextResponse.json(
        {
          status: "success",
          message: `Disconnected ${activeSessions.length} session(s)`,
          disconnected: modelList,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        status: "success",
        message: "No active sessions to cleanup",
        disconnected: [],
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[CLEANUP] Error:", err?.message);
    return NextResponse.json(
      { status: "error", error: err?.message },
      { status: 500 }
    );
  }
}
