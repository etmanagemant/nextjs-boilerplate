import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Send interaction to Puppeteer VPS server (click, type, scroll, navigate)
 * POST /api/crm/interact
 * 
 * Forwards to VPS server
 * Returns: New screenshot after action
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { modelId, action, data } = body;

    if (!modelId || !action) {
      return NextResponse.json(
        { error: "Missing modelId or action" },
        { status: 400 }
      );
    }

    console.log(`[INTERACT] Action: ${action} for model: ${modelId}`);

    const vpsUrl = process.env.VPS_API_URL;
    if (!vpsUrl) {
      console.error("[INTERACT] ❌ VPS_API_URL not configured");
      return NextResponse.json(
        { error: "VPS not configured" },
        { status: 500 }
      );
    }

    const vpsEndpoint = `${vpsUrl}/interact`;

    console.log("[INTERACT] Calling VPS:", vpsEndpoint);

    // Forward to VPS server
    const response = await fetch(vpsEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelId,
        action,
        data: data || {},
      }),
    });

    if (!response.ok) {
      throw new Error(`VPS returned ${response.status}`);
    }

    const result = await response.json();

    console.log("[INTERACT] ✅ Action completed on VPS");

    return NextResponse.json(
      {
        status: "success",
        action: action,
        screenshot: result.screenshot,
        modelId: modelId,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[INTERACT] ❌ Error:", err?.message);
    return NextResponse.json(
      { error: err?.message || "Interaction failed" },
      { status: 500 }
    );
  }
}
