import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Get live screenshot from Puppeteer VPS server
 * GET /api/crm/screenshot?modelId=xxx&url=https://...
 * 
 * Forwards request to VPS Puppeteer server
 * Returns: Base64 encoded PNG screenshot
 */
export async function GET(request: NextRequest) {
  const modelId = request.nextUrl.searchParams.get("modelId");
  const url = request.nextUrl.searchParams.get("url");

  if (!modelId) {
    return NextResponse.json(
      { error: "Missing modelId" },
      { status: 400 }
    );
  }

  try {
    console.log("[SCREENSHOT] Fetching from VPS for model:", modelId);
    
    const vpsUrl = process.env.VPS_API_URL;
    if (!vpsUrl) {
      console.error("[SCREENSHOT] ❌ VPS_API_URL not configured");
      return NextResponse.json(
        { error: "VPS not configured" },
        { status: 500 }
      );
    }

    // Build request URL to VPS
    let vpsEndpoint = `${vpsUrl}/screenshot?modelId=${encodeURIComponent(modelId)}`;
    if (url) {
      vpsEndpoint += `&url=${encodeURIComponent(url)}`;
    }

    console.log("[SCREENSHOT] Calling VPS:", vpsEndpoint);

    // Forward to VPS server
    const response = await fetch(vpsEndpoint, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`VPS returned ${response.status}`);
    }

    const data = await response.json();

    console.log("[SCREENSHOT] ✅ Screenshot received from VPS");

    return NextResponse.json(
      {
        status: "success",
        screenshot: data.screenshot,
        modelId: modelId,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[SCREENSHOT] ❌ Error:", err?.message);
    return NextResponse.json(
      { error: err?.message || "Failed to get screenshot" },
      { status: 500 }
    );
  }
}
