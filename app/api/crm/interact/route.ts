import { NextRequest, NextResponse } from "next/server";
import { vpsFetch } from "@/lib/vpsClient";
import { getCurrentUser } from "@/lib/getCurrentUser";

export const dynamic = "force-dynamic";

/**
 * Forward a click / keypress / scroll / navigate / reload to a model's live
 * VPS browser session (used by both the login viewer and the chatter live view).
 * POST /api/crm/interact  Body: { modelId, action, data }
 */
export async function POST(request: NextRequest) {
  try {
    // This sends real clicks/keystrokes into a model's live, authenticated
    // OnlyFans session - had no auth check at all, so anyone who found this
    // URL and a modelId could remote-control that session without ever
    // logging into the CRM. Any logged-in user is enough here (chatters
    // legitimately call this too); the pages that surface it already gate
    // by role.
    const { user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { modelId, action, data } = body;

    if (!modelId || !action) {
      return NextResponse.json({ error: "Missing modelId or action" }, { status: 400 });
    }

    const response = await vpsFetch("/interact", {
      method: "POST",
      body: JSON.stringify({ modelId, action, data: data || {} }),
    });

    if (response.status === 404) {
      return NextResponse.json({ error: "No active session for this model" }, { status: 404 });
    }
    if (!response.ok) {
      throw new Error(`VPS returned ${response.status}`);
    }

    const result = await response.json();

    return NextResponse.json({
      status: "success",
      action,
      screenshot: result.screenshot,
      isLoggedIn: result.isLoggedIn,
      pageUrl: result.pageUrl,
      modelId,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[INTERACT] Error:", err?.message);
    return NextResponse.json({ error: err?.message || "Interaction failed" }, { status: 500 });
  }
}
