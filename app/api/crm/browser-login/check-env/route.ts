import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    // Check if user is admin
    const { createClient } = await import("@/utils/supabase/server");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthenticated" },
        { status: 401 }
      );
    }

    // Check admin
    const isAdmin =
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" ||
      user.email === "etmanagemant@gmail.com";

    if (!isAdmin) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile?.role !== "admin") {
        return NextResponse.json(
          { error: "Admin access required" },
          { status: 403 }
        );
      }
    }

    // Check environment variables
    const apiKey = process.env.BROWSERLESS_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      browserlessApiKey: {
        isSet: !!apiKey,
        length: apiKey?.length || 0,
        prefix: apiKey ? apiKey.substring(0, 10) + "..." : "NOT_SET",
        suffix: apiKey ? "..." + apiKey.substring(Math.max(0, apiKey.length - 5)) : "NOT_SET",
      },
      supabase: {
        urlIsSet: !!supabaseUrl,
        keyIsSet: !!supabaseKey,
      },
      nodeVersion: process.version,
    };

    return NextResponse.json(diagnostics, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
