import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// 🔐 SECURITY: Validate admin access on server
async function validateAdmin(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return false;

    if (
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" ||
      user.email === "etmanagemant@gmail.com"
    ) {
      return true;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    return profile?.role === "admin";
  } catch (err) {
    console.error("Admin validation error:", err);
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    // 🔐 SECURITY: Validate admin
    const isAdmin = await validateAdmin(req);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    // Extract modelId from query params
    const modelId = req.nextUrl.searchParams.get("modelId");

    if (!modelId || typeof modelId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid modelId parameter" },
        { status: 400 }
      );
    }

    console.log(`📊 Checking browser status for model: ${modelId}`);

    const supabase = await createClient();

    // Query the session to check auth_cookies
    const { data: session, error } = await supabase
      .from("crm_model_sessions")
      .select("id, model_id, is_active, auth_cookies, last_verified_at")
      .eq("model_id", modelId)
      .maybeSingle();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        {
          authenticated: false,
          status: "error",
          message: error.message,
        },
        { status: 500 }
      );
    }

    // Check if session exists and has cookies
    const isAuthenticated =
      session &&
      session.is_active &&
      session.auth_cookies &&
      session.auth_cookies.cookies &&
      session.auth_cookies.cookies.length > 0;

    return NextResponse.json(
      {
        authenticated: isAuthenticated,
        status: isAuthenticated ? "authenticated" : "pending",
        modelId,
        sessionId: session?.id || null,
        cookieCount: isAuthenticated
          ? session?.auth_cookies?.cookies?.length || 0
          : 0,
        lastVerified: session?.last_verified_at || null,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("🔴 API Error:", err);

    return NextResponse.json(
      {
        authenticated: false,
        status: "error",
        error: err?.message || "Status check failed",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
