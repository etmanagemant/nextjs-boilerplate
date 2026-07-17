import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Debug endpoint to check active CRM sessions
 * GET /api/crm/session-status?modelId=xxx
 * GET /api/crm/session-status (list all)
 */
export async function GET(request: NextRequest) {
  const modelId = request.nextUrl.searchParams.get("modelId");

  try {
    const supabase = createSupabaseAdminClient();

    if (modelId) {
      // Check specific model
      const { data: session, error } = await supabase
        .from("crm_model_sessions")
        .select("*")
        .eq("model_id", modelId)
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { error: error.message, modelId },
          { status: 500 }
        );
      }

      if (!session) {
        return NextResponse.json(
          {
            status: "not_found",
            modelId,
            message: "No session found for this model. Setup required in /management/crm-connect",
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        status: "found",
        modelId,
        session: {
          model_id: session.model_id,
          is_active: session.is_active,
          created_at: session.created_at,
          last_used: session.last_used,
          has_browserless_session: !!session.auth_cookies?.browserless_session_id,
          has_auth_cookies: !!session.auth_cookies,
        },
      });
    } else {
      // List all active sessions
      const { data: sessions, error } = await supabase
        .from("crm_model_sessions")
        .select("model_id, is_active, created_at, last_used")
        .order("created_at", { ascending: false });

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }

      const activeSessions = sessions?.filter((s) => s.is_active) || [];

      return NextResponse.json({
        status: "success",
        total_sessions: sessions?.length || 0,
        active_sessions: activeSessions.length,
        sessions: sessions?.map((s) => ({
          model_id: s.model_id,
          is_active: s.is_active,
          created_at: s.created_at,
          last_used: s.last_used,
        })) || [],
      });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
