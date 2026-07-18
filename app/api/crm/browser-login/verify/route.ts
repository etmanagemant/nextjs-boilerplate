import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

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
    console.error("[validateAdmin] Error:", err);
    return false;
  }
}

export async function GET(req: NextRequest) {
  console.log("[BROWSER-LOGIN VERIFY] Checking login status...");

  try {
    const isAdmin = await validateAdmin(req);
    if (!isAdmin) {
      return NextResponse.json({ status: "error", error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ status: "error", error: "Missing sessionId" }, { status: 400 });
    }

    const vpsUrl = process.env.VPS_API_URL;
    if (!vpsUrl) {
      return NextResponse.json({ status: "error", error: "VPS not configured" }, { status: 500 });
    }

    const response = await fetch(`${vpsUrl}/verify-session?sessionId=${sessionId}`, { method: "GET" });

    if (!response.ok) {
      console.error(`[BROWSER-LOGIN VERIFY] VPS error: ${response.status}`);
      return NextResponse.json({ status: "error", error: `VPS error` }, { status: response.status });
    }

    const vpsData = await response.json();

    if (vpsData.isLoggedIn) {
      console.log(`[BROWSER-LOGIN VERIFY] ✅ Login detected! ${vpsData.cookieCount} cookies`);
    }

    return NextResponse.json({
      status: "success",
      isLoggedIn: vpsData.isLoggedIn,
      cookieCount: vpsData.cookieCount,
      pageTitle: vpsData.pageTitle,
      pageUrl: vpsData.pageUrl,
      message: vpsData.message,
    });
  } catch (error: any) {
    console.error("[BROWSER-LOGIN VERIFY] Error:", error.message);
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }
}
