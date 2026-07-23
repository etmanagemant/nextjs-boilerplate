import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Forward a click / keypress / scroll / navigate / reload to a model's live
 * VPS browser session (used by both the login viewer and the chatter live view).
 * POST /api/crm/interact  Body: { modelId, action, data }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { modelId, action, data } = body;

    if (!modelId || !action) {
      return NextResponse.json({ error: "Missing modelId or action" }, { status: 400 });
    }

    const vpsUrl = process.env.VPS_API_URL;
    if (!vpsUrl) {
      return NextResponse.json({ error: "VPS_API_URL not configured" }, { status: 500 });
    }

    const response = await fetch(`${vpsUrl}/interact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      pageTitle: result.pageTitle,
      modelId,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[INTERACT] Error:", err?.message);
    return NextResponse.json({ error: err?.message || "Interaction failed" }, { status: 500 });
  }
}
