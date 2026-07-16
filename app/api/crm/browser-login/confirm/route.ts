import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  console.log("[CONFIRM-LOGIN] User clicked confirmation button");

  try {
    const body = await req.json();
    const { modelId, sessionId } = body;

    if (!modelId || !sessionId) {
      return NextResponse.json(
        { status: "error", error: "Missing modelId or sessionId" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get current session and verify sessionId matches
    const { data: session, error: sessionError } = await supabase
      .from("crm_model_sessions")
      .select("*")
      .eq("model_id", modelId)
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      console.error("[CONFIRM-LOGIN] ❌ No session found");
      return NextResponse.json(
        { status: "error", error: "No browser session found" },
        { status: 404 }
      );
    }

    if (session.is_active) {
      console.log("[CONFIRM-LOGIN] Already confirmed");
      return NextResponse.json(
        {
          status: "success",
          message: "Already confirmed",
          modelId,
        },
        { status: 200 }
      );
    }

    // ✅ CONFIRM: Set is_active = true (user clicked button = user confirmed login)
    console.log("[CONFIRM-LOGIN] ✅ Confirming login for:", modelId);
    console.log("[CONFIRM-LOGIN] Session data:", {
      model_id: session.model_id,
      has_auth_cookies: !!session.auth_cookies,
      auth_cookies_keys: Object.keys(session.auth_cookies || {}),
    });

    // 🔐 EXTRACT COOKIES from Browserless session
    let browserlessCookies = [];
    let cookieExtractionError = null;
    
    try {
      if (session.auth_cookies?.browserless_session_id) {
        const browserlessApiKey = process.env.BROWSERLESS_API_KEY;
        const sessionId = session.auth_cookies.browserless_session_id;
        
        console.log("[CONFIRM-LOGIN] 🍪 Attempting to fetch cookies from Browserless...");
        console.log("[CONFIRM-LOGIN] Session ID:", sessionId);
        console.log("[CONFIRM-LOGIN] API Key exists:", !!browserlessApiKey);
        
        const cookieResponse = await fetch(
          `https://chrome.browserless.io/cookies?token=${browserlessApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          }
        );

        console.log("[CONFIRM-LOGIN] Cookie response status:", cookieResponse.status);

        if (cookieResponse.ok) {
          const cookieData = await cookieResponse.json();
          browserlessCookies = cookieData.cookies || [];
          console.log("[CONFIRM-LOGIN] ✅ Cookies extracted successfully:", browserlessCookies.length, "cookies");
          
          // Log first few cookies for debugging
          if (browserlessCookies.length > 0) {
            console.log("[CONFIRM-LOGIN] First cookie sample:", {
              name: browserlessCookies[0]?.name,
              domain: browserlessCookies[0]?.domain,
            });
          }
        } else {
          const errorText = await cookieResponse.text();
          cookieExtractionError = `Cookie API failed with status ${cookieResponse.status}: ${errorText}`;
          console.warn("[CONFIRM-LOGIN] ⚠️", cookieExtractionError);
        }
      } else {
        cookieExtractionError = "No browserless_session_id in auth_cookies";
        console.warn("[CONFIRM-LOGIN] ⚠️", cookieExtractionError);
      }
    } catch (cookieError: any) {
      cookieExtractionError = cookieError?.message || "Unknown error";
      console.error("[CONFIRM-LOGIN] ❌ Cookie extraction error:", cookieExtractionError);
    }

    const { error: updateError } = await supabase
      .from("crm_model_sessions")
      .update({
        is_active: true,
        last_verified_at: new Date().toISOString(),
        auth_cookies: {
          ...(session.auth_cookies || {}),
          verification_status: "confirmed_by_user",
          confirmed_at: new Date().toISOString(),
          onlyfans_cookies: browserlessCookies, // Store actual OnlyFans cookies
          cookie_extraction_status: cookieExtractionError ? "failed" : "success",
          cookie_extraction_error: cookieExtractionError,
        },
      })
      .eq("model_id", modelId)
      .eq("id", sessionId);

    if (updateError) {
      console.error("[CONFIRM-LOGIN] ❌ Update failed:", updateError.message);
      return NextResponse.json(
        { status: "error", error: "Failed to confirm session" },
        { status: 500 }
      );
    }

    console.log("[CONFIRM-LOGIN] ✅ Login confirmed, is_active = true, cookies saved");

    // 🔄 TRIGGER: Auto-sync OnlyFans chats in background (don't wait for response)
    console.log("[CONFIRM-LOGIN] 🔄 Triggering OnlyFans sync...");
    fetch(`${process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000"}/api/crm/sync-onlyfans-chats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId, sessionId }),
    }).catch((err) => console.error("[CONFIRM-LOGIN] Sync error:", err));

    return NextResponse.json(
      {
        status: "success",
        confirmed: true,
        message: "Login confirmed. Session is now active. Syncing OnlyFans chats...",
        modelId,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[CONFIRM-LOGIN] Error:", err?.message);
    return NextResponse.json(
      { status: "error", error: err?.message },
      { status: 500 }
    );
  }
}
